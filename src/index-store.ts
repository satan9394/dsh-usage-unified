/**
 * The incremental index: every session on this machine, folded once.
 *
 * A full scan is not viable on the read path. The index therefore folds once
 * in the background and afterwards only reads the bytes appended since,
 * keyed on `(dev, ino, size, mtimeMs)`. Append-only logs make the tail read
 * sound; an inode swap, a shrink, or a backwards clock each force that one
 * session to be refolded from zero.
 *
 * Persistence is a directory of small per-session files below `DSH_HOME`
 * (atomic temp+rename each), not `ctx.storageDomain`: an optional service must
 * never be the reason the plugin — and its panel — fails to load, and a plain
 * file is portable across every dsh composition.
 *
 * @module dsh-usage-unified/index-store
 */

import {
  IndexCache,
  type IndexEntry,
  type IndexMeta,
} from './index-cache.ts'
import {
  createFoldState,
  foldEvents,
  FOLD_VERSION,
  todayKey,
} from './fold.ts'
import {
  aggregateSnapshot,
  collectCalls,
  resolveBounds,
  type CallsQuery,
  type SnapshotQuery,
} from './aggregate.ts'
import { discoverDshHomes } from './homes.ts'
import { readArtifact, walkSessionArtifacts, type SessionArtifact } from './reader.ts'
import { applyPricing, loadPricing, type PricingTable } from './pricing.ts'
import type {
  CallsPage,
  CostSummary,
  Coverage,
  HomeInfo,
  IndexStatus,
  RangeId,
  Snapshot,
  TaskScope,
} from './types.ts'

/** Re-exported so existing importers keep one source of truth. */
export type { IndexEntry, IndexMeta } from './index-cache.ts'

/** Tunables the store needs; all sourced from the plugin config. */
export interface IndexStoreOptions {
  /** Additional home directories the discovery heuristic cannot find. */
  extraSessionRoots: readonly string[]
  /** Count `compaction/summary.usage` in totals. */
  includeCompaction: boolean
  /** Cooperative yield interval during a scan, in ms. */
  chunkYieldMs: number
  /** The home this process is running against. */
  currentHome: string
  /** Absolute index cache path; the cache directory is derived from it. */
  cachePath: string
  /** Optional pricing file; when absent or unreadable, no cost estimate is shown. */
  pricingPath?: string
  /** Debounce delay before writing the index, in ms. */
  cacheWriteDelayMs: number
  /** Artifacts decoded concurrently during a scan. */
  concurrency?: number
  /** How often a cold build checkpoints finished sessions to disk, in ms. */
  checkpointMs?: number
  /** OS home directory the discovery heuristic hangs off; injectable for tests. */
  osHome?: string
  /** Injectable clock; tests pin it. */
  now?: () => number
}

/** Cache directory for a configured cache path: `index-v1.json` -> `index-v1/`. */
export function cacheDirFor(cachePath: string): string {
  return /\.json$/i.test(cachePath) ? cachePath.replace(/\.json$/i, '') : `${cachePath}.cache`
}

/** Resolve the local IANA zone, falling back to UTC on a stripped-down ICU build. */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/** Query the transport layer asks the store for. */
export interface StoreQuery {
  range: RangeId
  scope: TaskScope
  workspace?: string
  /** Explicit inclusive day bounds; when both are set they override `range`. */
  from?: string
  to?: string
}

/** Query for the call-detail route. */
export interface StoreCallsQuery extends StoreQuery {
  model?: string
  provider?: string
  session?: string
  minInputTokens?: number
  minOutputTokens?: number
  page: number
  pageSize: number
  maxRecords: number
}

/**
 * Owns the folded index and answers summary/call queries.
 *
 * Single-writer: concurrent `refresh()` calls share one pass. The store never
 * throws out of `refresh()` — a scan failure is reported through `status`, so
 * a transient filesystem problem degrades the panel instead of the plugin.
 */
export class UnifiedIndexStore {
  private readonly entries = new Map<string, IndexEntry>()
  private readonly options: IndexStoreOptions
  private readonly now: () => number
  private readonly cache: IndexCache
  private meta: IndexMeta
  private running: Promise<void> | undefined
  private loading: Promise<void> | undefined
  private writeTimer: ReturnType<typeof setTimeout> | undefined
  private readonly dirty = new Set<string>()
  private readonly removed = new Set<string>()
  private disposed = false
  private homeInfos: HomeInfo[] = []
  private skippedArtifacts = 0
  private pricing: PricingTable | null = null
  private state: IndexStatus

  constructor(options: IndexStoreOptions) {
    this.options = options
    this.now = options.now ?? (() => Date.now())
    this.meta = { tz: localTimeZone(), foldVersion: FOLD_VERSION, builtAt: 0, complete: false }
    this.cache = new IndexCache({ dir: cacheDirFor(options.cachePath), legacyPath: options.cachePath })
    this.state = { phase: 'idle', indexed: 0, total: 0, durable: false, updatedAt: null }
  }

  /** Current build phase and progress. */
  get status(): IndexStatus {
    return { ...this.state }
  }

  /** Stop the in-flight scan and refuse further work. */
  dispose(): void {
    this.disposed = true
    if (this.writeTimer !== undefined) clearTimeout(this.writeTimer)
    this.writeTimer = undefined
  }

  /**
   * Load a previous cache; a meta/fold mismatch discards it rather than migrating.
   *
   * Whatever a killed run managed to write is adopted as-is: it is a valid,
   * partial index, and the next pass fills it in. That is the difference
   * between a restart costing one session and costing the whole machine.
   */
  async load(): Promise<void> {
    try {
      const loaded = await this.cache.load({ tz: this.meta.tz, foldVersion: FOLD_VERSION })
      if (loaded.meta === undefined) return
      for (const [key, entry] of loaded.entries) this.entries.set(key, entry)
      this.meta = loaded.meta
      const count = this.entries.size
      this.state = {
        ...this.state,
        phase: count > 0 ? 'ready' : 'idle',
        indexed: count,
        total: count,
        durable: true,
        updatedAt: loaded.meta.builtAt > 0 ? loaded.meta.builtAt : null,
      }
    } catch {
      // No cache yet, or an unreadable one: a full rebuild is the answer.
    }
  }

  /**
   * Bring the index up to date.
   *
   * Concurrent callers join the running pass rather than starting a second one.
   */
  refresh(): Promise<void> {
    if (this.running !== undefined) return this.running
    const pass = this.ensureLoaded().then(() => this.scan()).finally(() => { this.running = undefined })
    this.running = pass
    return pass
  }

  /** Load the previous cache exactly once, before the first scan. */
  private ensureLoaded(): Promise<void> {
    this.loading ??= this.load()
    return this.loading
  }

  /**
   * Build a snapshot from what the index currently holds, synchronously.
   *
   * @param query - the window, scope and workspace to report.
   */
  snapshot(query: StoreQuery): Snapshot {
    const now = this.now()
    const today = todayKey(this.meta.tz, now)
    // A `from` on its own is the start-to-now mode, so it is still a custom span.
    const custom = query.from !== undefined
    const bounds = resolveBounds({
      range: query.range,
      today,
      ...(query.from === undefined ? {} : { from: query.from }),
      ...(query.to === undefined ? {} : { to: query.to }),
    })
    const rangeId: RangeId = custom ? 'custom' : query.range
    const snapshotQuery: SnapshotQuery = {
      from: bounds.from,
      to: bounds.to,
      timeZone: this.meta.tz,
      range: rangeId,
      scope: query.scope,
      now,
      ...(query.workspace === undefined ? {} : { workspace: query.workspace }),
    }
    const result = aggregateSnapshot([...this.entries.values()].map(entry => entry.fold), snapshotQuery)
    const coverage: Coverage = { ...result.coverage, skippedArtifacts: this.skippedArtifacts }
    const cost = this.priceResult(result.models, result.sessions, [
      result.mostUsedModel,
      result.allTime.mostUsedModel,
    ])
    return {
      version: 1,
      generatedAt: now,
      tz: this.meta.tz,
      range: { from: result.from, to: result.to, timeZone: this.meta.tz, id: result.range },
      status: this.status,
      totals: result.totals,
      allTime: result.allTime,
      mostUsedModel: result.mostUsedModel,
      days: result.days,
      hours: result.hours,
      models: result.models,
      workspaces: result.workspaces,
      sessions: result.sessions,
      sessionTotal: result.sessionTotal,
      cost,
      homes: this.homeInfos,
      coverage,
    }
  }

  /** Decorate the model/session rows in place and summarize coverage. */
  private priceResult(
    models: Snapshot['models'],
    sessions: Snapshot['sessions'],
    extras: readonly (Snapshot['models'][number] | null)[],
  ): CostSummary | null {
    // The per-model rows are the only set that partitions the window's tokens,
    // so they alone feed the summary; sessions and the most-used-model card
    // just get a per-row number.
    return applyPricing({
      basis: models.map(row => ({ row, modelId: row.key })),
      extra: [
        ...sessions.map(row => ({ row, modelId: row.topModel })),
        ...extras.flatMap(row => row === null ? [] : [{ row, modelId: row.key }]),
      ],
    }, this.pricing)
  }

  /**
   * Paginate the call-detail rows.
   *
   * @param query - window, scope, workspace, filters and pagination.
   */
  calls(query: StoreCallsQuery): CallsPage {
    const now = this.now()
    const today = todayKey(this.meta.tz, now)
    const custom = query.from !== undefined
    const bounds = resolveBounds({
      range: query.range,
      today,
      ...(query.from === undefined ? {} : { from: query.from }),
      ...(query.to === undefined ? {} : { to: query.to }),
    })
    const filter: CallsQuery = {
      from: bounds.from,
      to: bounds.to,
      timeZone: this.meta.tz,
      range: custom ? 'custom' : query.range,
      scope: query.scope,
      now,
      maxRecords: query.maxRecords,
      ...(query.workspace === undefined ? {} : { workspace: query.workspace }),
      ...(query.model === undefined ? {} : { model: query.model }),
      ...(query.provider === undefined ? {} : { provider: query.provider }),
      ...(query.session === undefined ? {} : { session: query.session }),
      ...(query.minInputTokens === undefined ? {} : { minInputTokens: query.minInputTokens }),
      ...(query.minOutputTokens === undefined ? {} : { minOutputTokens: query.minOutputTokens }),
    }
    const rows = collectCalls([...this.entries.values()].map(entry => entry.fold), filter)
    const offset = (query.page - 1) * query.pageSize
    return {
      indexReady: this.state.phase === 'ready' || this.state.phase === 'error',
      items: rows.slice(offset, offset + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      total: rows.length,
      hasMore: rows.length > query.page * query.pageSize,
    }
  }

  /** Total tokens across all indexed sessions — cheap enough for the CSV export. */
  async exportRows(query: StoreQuery): Promise<{ days: Snapshot['days']; models: Snapshot['models'] }> {
    const snapshot = this.snapshot(query)
    return { days: snapshot.days, models: snapshot.models }
  }

  private async scan(): Promise<void> {
    if (this.disposed) return
    // A pass is a "build" only until one has walked every session. Later passes
    // are incremental and almost always no-ops, so reporting them as building
    // would leave the panel showing a progress bar that never settles.
    const building = !this.meta.complete
    if (building) this.state = { ...this.state, phase: 'building', indexed: this.entries.size, total: 0 }
    this.skippedArtifacts = 0
    const seen = new Set<string>()
    let discovered = 0
    let processed = 0
    let lastCheckpoint = this.now()
    const publishProgress = (): void => {
      if (building) this.state = { ...this.state, indexed: processed, total: discovered }
    }

    try {
      this.pricing = this.options.pricingPath === undefined ? null : await loadPricing(this.options.pricingPath)

      const discovery = await discoverDshHomes({
        currentHome: this.options.currentHome,
        extraRoots: this.options.extraSessionRoots,
        ...(this.options.osHome === undefined ? {} : { osHome: this.options.osHome }),
      })
      const infos: HomeInfo[] = discovery.homes.map(home => ({ home: home.home, current: home.current, sessions: 0 }))
      for (const problem of discovery.problems) {
        infos.push({ home: problem.home, current: false, sessions: 0, error: problem.error })
      }
      this.homeInfos = infos
      const infoByRoot = new Map(discovery.homes.map((home, index) => [home.sessionsRoot, infos[index]] as const))

      // Discovery is a stat-only walk, so it is collected first: the decode
      // pass can then run with bounded parallelism instead of stalling every
      // other session behind the one largest log.
      const pending: SessionArtifact[] = []
      for (const home of discovery.homes) {
        for await (const artifact of walkSessionArtifacts(home)) {
          if (this.disposed) return
          seen.add(artifact.key)
          const info = infoByRoot.get(home.sessionsRoot)
          if (info !== undefined) info.sessions += 1
          discovered += 1
          pending.push(artifact)
        }
      }
      publishProgress()

      const checkpointMs = this.options.checkpointMs ?? 4_000
      let lastYield = this.now()
      let next = 0
      const lane = async (): Promise<void> => {
        for (;;) {
          if (this.disposed) return
          const artifact = pending[next]
          next += 1
          if (artifact === undefined) return
          await this.foldOne(artifact)
          processed += 1
          publishProgress()
          const stamp = this.now()
          // A cold build is the one pass where finishing work is worth saving
          // before the walk ends: a restart then costs the last few seconds
          // instead of the whole machine.
          if (building && stamp - lastCheckpoint >= checkpointMs) {
            lastCheckpoint = stamp
            await this.flushEntries()
          }
          if (stamp - lastYield >= this.options.chunkYieldMs) {
            lastYield = stamp
            await new Promise<void>(resolve => { setImmediate(resolve) })
          }
        }
      }
      const lanes = Math.max(1, Math.min(16, Math.floor(this.options.concurrency ?? 4)))
      await Promise.all(Array.from({ length: lanes }, () => lane()))

      for (const key of [...this.entries.keys()]) {
        if (seen.has(key)) continue
        this.entries.delete(key)
        this.removed.add(key)
      }
      await this.cache.prune(seen)

      this.meta = { ...this.meta, builtAt: this.now(), complete: true }
      this.state = {
        ...this.state,
        phase: 'ready',
        indexed: this.entries.size,
        total: this.entries.size,
        durable: true,
        updatedAt: this.meta.builtAt,
      }
      // A steady-state pass touches nothing, so persist only when the index moved.
      if (this.dirty.size > 0 || this.removed.size > 0 || building) this.scheduleWrite()
    } catch (error) {
      // A failed incremental pass keeps whatever the last good one produced;
      // the panel shows the message beside real numbers rather than instead of them.
      this.state = {
        ...this.state,
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Bring one artifact's entry up to date, reusing the previous read when the
   * file only grew. Unchanged artifacts cost a stat, not a decode.
   */
  private async foldOne(artifact: SessionArtifact): Promise<void> {
    const previous = this.entries.get(artifact.key)
    const unchanged = previous !== undefined
      && previous.size === artifact.size
      && previous.mtimeMs === artifact.mtimeMs
      && previous.ino === artifact.ino
      && previous.dev === artifact.dev
    if (unchanged) return

    // An inode swap, a shrink, or a backwards clock all mean the bytes we
    // already consumed are no longer the bytes on disk.
    const resumable = previous !== undefined
      && previous.ino === artifact.ino
      && previous.dev === artifact.dev
      && artifact.size >= previous.cursor
      && artifact.mtimeMs >= previous.mtimeMs
    const updated = await this.foldArtifact(artifact, resumable ? previous : undefined)
    if (updated === undefined) {
      this.skippedArtifacts += 1
      if (previous !== undefined) {
        this.entries.delete(artifact.key)
        this.dirty.delete(artifact.key)
        this.removed.add(artifact.key)
      }
      return
    }
    this.entries.set(artifact.key, updated)
    this.dirty.add(artifact.key)
    this.removed.delete(artifact.key)
  }

  private async foldArtifact(
    artifact: SessionArtifact,
    previous: IndexEntry | undefined,
  ): Promise<IndexEntry | undefined> {
    try {
      const read = await readArtifact(artifact.path, previous?.cursor ?? 0, previous?.header)
      if (read.foreign) return undefined
      const state = previous === undefined
        ? createFoldState(read.header, artifact.home.sessionsRoot)
        : { fold: previous.fold, carry: previous.carry }
      foldEvents(state, read.events, {
        tz: this.meta.tz,
        now: this.now(),
        includeCompaction: this.options.includeCompaction,
      })
      state.fold.truncated = read.torn
      return {
        path: artifact.path,
        size: artifact.size,
        mtimeMs: artifact.mtimeMs,
        ino: artifact.ino,
        dev: artifact.dev,
        cursor: read.cursor,
        header: read.header,
        fold: state.fold,
        carry: state.carry,
      }
    } catch {
      // One unreadable or corrupt log must not cost every other session; it is
      // counted and surfaced as `skippedArtifacts` instead.
      return undefined
    }
  }

  private scheduleWrite(): void {
    if (this.disposed || this.writeTimer !== undefined) return
    this.writeTimer = setTimeout(() => {
      this.writeTimer = undefined
      void this.flushEntries()
    }, this.options.cacheWriteDelayMs)
    this.writeTimer.unref?.()
  }

  /**
   * Write the sessions that moved, then the meta.
   *
   * Entries are independent files, so this touches one file per changed
   * session instead of re-serializing the whole index — and whatever lands
   * before a kill is usable by the next start.
   *
   * @returns true when the write completed.
   */
  private async flushEntries(): Promise<boolean> {
    if (this.disposed) return false
    const keys = [...this.dirty]
    const removed = [...this.removed]
    this.dirty.clear()
    this.removed.clear()
    try {
      await Promise.all(removed.map(key => this.cache.remove(key)))
      await Promise.all(keys.map(key => {
        const entry = this.entries.get(key)
        return entry === undefined ? undefined : this.cache.write(key, entry)
      }))
      await this.cache.writeMeta(this.meta)
      this.state = { ...this.state, durable: true }
      return true
    } catch {
      // Durability is best-effort; the in-memory index is still correct.
      return false
    }
  }

  /** Flush the index immediately; used on host disposal. */
  async flush(): Promise<void> {
    if (this.writeTimer !== undefined) {
      clearTimeout(this.writeTimer)
      this.writeTimer = undefined
    }
    await this.flushEntries()
    await this.cache.settle()
  }
}
