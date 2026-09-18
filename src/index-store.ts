/**
 * The incremental index: every session on this machine, folded once.
 *
 * A full scan is not viable on the read path. The index therefore folds once
 * in the background and afterwards only reads the bytes appended since,
 * keyed on `(dev, ino, size, mtimeMs)`. Append-only logs make the tail read
 * sound; an inode swap, a shrink, or a backwards clock each force that one
 * session to be refolded from zero.
 *
 * Persistence is a single JSON file below `DSH_HOME` (atomic temp+rename),
 * not `ctx.storageDomain`: an optional service must never be the reason the
 * plugin — and its panel — fails to load, and a plain file is portable across
 * every dsh composition.
 *
 * @module dsh-usage-unified/index-store
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  createFoldState,
  foldEvents,
  FOLD_VERSION,
  todayKey,
  type FoldCarry,
  type HeaderLike,
  type SessionFold,
} from './fold.ts'
import {
  aggregateSnapshot,
  collectCalls,
  rangeBounds,
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

/** One indexed session: the freshness witness, the fold, and its resume state. */
export interface IndexEntry {
  /** Absolute artifact path. */
  path: string
  size: number
  mtimeMs: number
  ino: number
  dev: number
  /** Byte offset just past the last complete frame consumed. */
  cursor: number
  header: HeaderLike
  fold: SessionFold
  /** Mid-log state; a tail refold without this would mis-attribute its first step. */
  carry: FoldCarry
}

/** Index-wide facts that invalidate every entry when they change. */
export interface IndexMeta {
  tz: string
  foldVersion: number
  builtAt: number
}

/** On-disk cache envelope. */
interface IndexCache {
  schema: 2
  meta: IndexMeta
  entries: Record<string, IndexEntry>
}

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
  /** Absolute index cache path; defaults to `$DSH_HOME/usage-unified/index-v1.json`. */
  cachePath: string
  /** Optional pricing file; when absent or unreadable, no cost estimate is shown. */
  pricingPath?: string
  /** Debounce delay before writing the index, in ms. */
  cacheWriteDelayMs: number
  /** Artifacts decoded concurrently during a scan. */
  concurrency?: number
  /** OS home directory the discovery heuristic hangs off; injectable for tests. */
  osHome?: string
  /** Injectable clock; tests pin it. */
  now?: () => number
}

/** Resolve the local IANA zone, falling back to UTC on a stripped-down ICU build. */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function isIndexEntry(value: unknown): value is IndexEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Partial<IndexEntry>
  return typeof entry.path === 'string'
    && typeof entry.size === 'number'
    && typeof entry.mtimeMs === 'number'
    && typeof entry.ino === 'number'
    && typeof entry.dev === 'number'
    && typeof entry.cursor === 'number'
    && typeof entry.header === 'object' && entry.header !== null
    && typeof entry.fold === 'object' && entry.fold !== null
    && typeof entry.carry === 'object' && entry.carry !== null
}

function isCache(value: unknown): value is IndexCache {
  if (typeof value !== 'object' || value === null) return false
  const cache = value as Partial<IndexCache>
  return cache.schema === 2
    && typeof cache.meta === 'object' && cache.meta !== null
    && typeof cache.entries === 'object' && cache.entries !== null
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
  private meta: IndexMeta
  private running: Promise<void> | undefined
  private loading: Promise<void> | undefined
  private writeTimer: ReturnType<typeof setTimeout> | undefined
  private dirty = false
  private disposed = false
  private homeInfos: HomeInfo[] = []
  private skippedArtifacts = 0
  private pricing: PricingTable | null = null
  private state: IndexStatus

  constructor(options: IndexStoreOptions) {
    this.options = options
    this.now = options.now ?? (() => Date.now())
    this.meta = { tz: localTimeZone(), foldVersion: FOLD_VERSION, builtAt: 0 }
    this.state = { phase: 'idle', indexed: 0, total: 0, durable: false, updatedAt: null }
    void this.options
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

  /** Load a previous cache; a meta/fold mismatch discards it rather than migrating. */
  async load(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.options.cachePath, 'utf8'))
      if (!isCache(parsed)) return
      const meta = parsed.meta
      if (meta.tz !== this.meta.tz || meta.foldVersion !== FOLD_VERSION) return
      let count = 0
      for (const [key, entry] of Object.entries(parsed.entries)) {
        if (isIndexEntry(entry)) {
          this.entries.set(key, entry)
          count += 1
        }
      }
      this.meta = meta
      this.state = {
        ...this.state,
        phase: count > 0 ? 'ready' : 'idle',
        indexed: count,
        total: count,
        durable: true,
        updatedAt: meta.builtAt > 0 ? meta.builtAt : null,
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
    const custom = query.from !== undefined && query.to !== undefined
    const bounds = custom ? { from: query.from!, to: query.to! } : (query.range === 'all' ? { from: '', to: today } : rangeBounds(query.range, today))
    const rangeId: RangeId = custom ? '30d' : query.range
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
    const custom = query.from !== undefined && query.to !== undefined
    const bounds = custom ? { from: query.from!, to: query.to! } : (query.range === 'all' ? { from: '', to: today } : rangeBounds(query.range, today))
    const filter: CallsQuery = {
      from: bounds.from,
      to: bounds.to,
      timeZone: this.meta.tz,
      range: custom ? '30d' : query.range,
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
    // Only the FIRST pass is a "build". Later passes are incremental and
    // almost always no-ops, so reporting them as building would leave the
    // panel showing a progress bar that never settles.
    const firstBuild = this.state.phase !== 'ready'
    if (firstBuild) this.state = { ...this.state, phase: 'building', indexed: 0, total: 0 }
    this.skippedArtifacts = 0
    const seen = new Set<string>()
    let discovered = 0
    let processed = 0
    const publishProgress = (): void => {
      if (firstBuild) this.state = { ...this.state, indexed: processed, total: discovered }
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
        this.dirty = true
      }

      this.meta = { ...this.meta, builtAt: this.now() }
      this.state = {
        ...this.state,
        phase: 'ready',
        indexed: this.entries.size,
        total: this.entries.size,
        durable: true,
        updatedAt: this.meta.builtAt,
      }
      // A steady-state pass touches nothing, and rewriting a ~20 MB cache every
      // refresh interval is pure disk churn; persist only when the index moved.
      if (this.dirty) {
        this.dirty = false
        this.scheduleWrite()
      }
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
        this.dirty = true
      }
      return
    }
    this.entries.set(artifact.key, updated)
    this.dirty = true
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
      void this.persist().catch(() => { /* durability is best-effort */ })
    }, this.options.cacheWriteDelayMs)
    this.writeTimer.unref?.()
  }

  private async persist(): Promise<void> {
    if (this.disposed) return
    const entries: Record<string, IndexEntry> = {}
    for (const [key, entry] of this.entries) entries[key] = entry
    const cache: IndexCache = { schema: 2, meta: this.meta, entries }
    const temporary = `${this.options.cachePath}.${process.pid}.tmp`
    await mkdir(dirname(this.options.cachePath), { recursive: true })
    await writeFile(temporary, JSON.stringify(cache), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.options.cachePath)
  }

  /** Flush the index immediately; used on host disposal. */
  async flush(): Promise<void> {
    if (this.writeTimer !== undefined) {
      clearTimeout(this.writeTimer)
      this.writeTimer = undefined
    }
    await this.persist().catch(() => { /* best-effort */ })
  }
}
