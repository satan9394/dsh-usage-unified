/**
 * Durable side of the index: one small file per session, plus a meta file.
 *
 * Why not one JSON file. The merged cache for this machine's real history is
 * ~24 MB across ~1,400 sessions, and the previous layout rewrote all of it on
 * every change: a 24 MB write every refresh cycle whenever one session was
 * live, and — worse — the whole build lost whenever the harness restarted
 * mid-write. The leftover `index-v1.json.<pid>.tmp` files on a real machine are
 * exactly that, and each one cost the next start a full 50 s rebuild.
 *
 * A per-session file is ~17 KB. It is written as soon as that session is
 * folded, so a kill costs one session instead of the machine, and a steady
 * state pass rewrites one file instead of 1,404.
 *
 * Layout, beside the configured cache path (`index-v1.json` by default):
 *
 *   index-v1.json                 <- pre-0.6 single file, migrated then renamed
 *   index-v1/                     <- the cache directory
 *     meta.json                   <- schema, timezone, fold version, completion
 *     entries/<sha1(key)>.json    <- one folded session each
 *
 * @module dsh-usage-unified/index-cache
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { FoldCarry, HeaderLike, SessionFold } from './fold.ts'

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
  /** Epoch ms of the last pass that reached the end of the walk. */
  builtAt: number
  /**
   * False until one pass has folded every session it discovered.
   *
   * A partial index is served immediately — the panel shows real numbers that
   * keep growing — so the flag is what tells a later start to keep filling
   * rather than treating the cache as finished.
   */
  complete: boolean
}

/** Schema of the meta file and of every entry file. */
const SCHEMA = 3

/** One entry file: the key that identifies it plus the fold itself. */
interface EntryFile {
  schema: 3
  key: string
  entry: IndexEntry
}

/** Meta file envelope. */
interface MetaFile extends IndexMeta {
  schema: 3
}

/** Legacy single-file cache envelope written by <= 0.5.2. */
interface LegacyCache {
  schema: 2
  meta: IndexMeta
  entries: Record<string, IndexEntry>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Validate one persisted entry; a half-written or hand-edited file is dropped. */
export function isIndexEntry(value: unknown): value is IndexEntry {
  if (!isRecord(value)) return false
  const entry = value as unknown as Partial<IndexEntry>
  return typeof entry.path === 'string'
    && typeof entry.size === 'number'
    && typeof entry.mtimeMs === 'number'
    && typeof entry.ino === 'number'
    && typeof entry.dev === 'number'
    && typeof entry.cursor === 'number'
    && isRecord(entry.header)
    && isRecord(entry.fold)
    && isRecord(entry.carry)
}

function isMetaShape(value: unknown): value is { tz: string; foldVersion: number; builtAt: number; complete?: boolean } {
  if (!isRecord(value)) return false
  return typeof value['tz'] === 'string'
    && typeof value['foldVersion'] === 'number'
    && typeof value['builtAt'] === 'number'
}

/** Stable file name for one index key. */
export function entryFileName(key: string): string {
  return `${createHash('sha1').update(key).digest('hex').slice(0, 20)}.json`
}

/** Result of loading the cache. */
export interface LoadedCache {
  /** The persisted meta when the cache directory was usable. */
  meta?: IndexMeta
  entries: Map<string, IndexEntry>
  /** True when a legacy single-file cache was adopted into the new layout. */
  migrated: boolean
}

/** Options for {@link IndexCache}. */
export interface IndexCacheOptions {
  /** Cache directory holding `meta.json` and `entries/`. */
  dir: string
  /** Pre-0.6 single-file cache, migrated on first load when present. */
  legacyPath?: string
}

/**
 * Owns the on-disk cache: load, per-entry write, meta write, prune.
 *
 * Writes are queued one behind another and never throw: durability is
 * best-effort, and losing a cache file must never cost the caller a scan.
 */
export class IndexCache {
  private readonly dir: string
  private readonly legacyPath: string | undefined
  /** Files read at load time, so pruning only ever touches our own cache. */
  private readonly filesByKey = new Map<string, string>()
  private queue: Promise<void> = Promise.resolve()

  constructor(options: IndexCacheOptions) {
    this.dir = options.dir
    this.legacyPath = options.legacyPath
  }

  /** Directory holding the per-session files. */
  get entriesDir(): string {
    return join(this.dir, 'entries')
  }

  /** Metadata file. */
  get metaPath(): string {
    return join(this.dir, 'meta.json')
  }

  /**
   * Load whatever the last run managed to persist.
   *
   * @param expected - the timezone and fold version this build requires; a
   * mismatch discards the entries rather than migrating them, because the fold
   * output shape is what changed.
   */
  async load(expected: { tz: string; foldVersion: number }): Promise<LoadedCache> {
    const entries = new Map<string, IndexEntry>()
    const current = await this.loadCurrent(expected)
    if (current !== undefined) return { meta: current, entries: await this.readEntries(), migrated: false }

    const legacy = await this.loadLegacy(expected)
    if (legacy === undefined) return { entries, migrated: false }
    for (const [key, entry] of legacy.entries) entries.set(key, entry)
    // Adopt eagerly: writing ~1,400 small files once is cheaper than the
    // alternative — folding the whole machine again.
    await this.writeMany(entries)
    await this.writeMeta(legacy.meta)
    if (this.legacyPath !== undefined) {
      await rename(this.legacyPath, `${this.legacyPath}.migrated`).catch(() => { /* harmless */ })
    }
    return { meta: legacy.meta, entries, migrated: true }
  }

  private async loadCurrent(expected: { tz: string; foldVersion: number }): Promise<IndexMeta | undefined> {
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(this.metaPath, 'utf8'))
    } catch {
      return undefined
    }
    if (!isRecord(parsed) || parsed['schema'] !== SCHEMA) return undefined
    if (!isMetaShape(parsed) || typeof parsed.complete !== 'boolean') return undefined
    const meta: IndexMeta = { tz: parsed.tz, foldVersion: parsed.foldVersion, builtAt: parsed.builtAt, complete: parsed.complete }
    if (meta.tz !== expected.tz || meta.foldVersion !== expected.foldVersion) return undefined
    return meta
  }

  private async readEntries(): Promise<Map<string, IndexEntry>> {
    const entries = new Map<string, IndexEntry>()
    let names: string[]
    try {
      names = await readdir(this.entriesDir)
    } catch {
      return entries
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const path = join(this.entriesDir, name)
      try {
        const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
        if (!isRecord(parsed) || parsed['schema'] !== SCHEMA || typeof parsed['key'] !== 'string' || !isIndexEntry(parsed['entry'])) {
          // Unreadable or from another schema: keep the file (a newer build may
          // read it) but do not use it.
          continue
        }
        const key = parsed['key']
        entries.set(key, parsed['entry'] as IndexEntry)
        this.filesByKey.set(key, name)
      } catch {
        continue
      }
    }
    return entries
  }

  private async loadLegacy(expected: { tz: string; foldVersion: number }): Promise<{ meta: IndexMeta; entries: Map<string, IndexEntry> } | undefined> {
    if (this.legacyPath === undefined) return undefined
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(this.legacyPath, 'utf8'))
    } catch {
      return undefined
    }
    if (!isRecord(parsed)) return undefined
    const cache = parsed as unknown as Partial<LegacyCache>
    if (cache.schema !== 2 || !isMetaShape(cache.meta) || !isRecord(cache.entries)) return undefined
    if (cache.meta.tz !== expected.tz || cache.meta.foldVersion !== expected.foldVersion) return undefined
    const entries = new Map<string, IndexEntry>()
    for (const [key, entry] of Object.entries(cache.entries)) {
      if (isIndexEntry(entry)) entries.set(key, entry)
    }
    if (entries.size === 0) return undefined
    // A legacy cache carried no completion flag: it was written after a full
    // pass, but the next pass is allowed to confirm that with a stat walk.
    return { meta: { tz: cache.meta.tz, foldVersion: cache.meta.foldVersion, builtAt: cache.meta.builtAt, complete: false }, entries }
  }

  /** Persist one folded session. Serialized behind the previous write. */
  async write(key: string, entry: IndexEntry): Promise<void> {
    const name = entryFileName(key)
    this.filesByKey.set(key, name)
    const file: EntryFile = { schema: SCHEMA, key, entry }
    await this.enqueue(() => this.writeFileAtomic(join(this.entriesDir, name), file))
  }

  /** Write several sessions; used for adoption and for a checkpoint flush. */
  async writeMany(entries: ReadonlyMap<string, IndexEntry>): Promise<void> {
    const list = [...entries]
    if (list.length === 0) return
    await this.enqueue(async () => {
      await mkdir(this.entriesDir, { recursive: true })
      let next = 0
      const lane = async (): Promise<void> => {
        for (;;) {
          const item = list[next]
          next += 1
          if (item === undefined) return
          const [key, entry] = item
          this.filesByKey.set(key, entryFileName(key))
          const file: EntryFile = { schema: SCHEMA, key, entry }
          await this.writeFileAtomic(join(this.entriesDir, entryFileName(key)), file)
        }
      }
      await Promise.all(Array.from({ length: 8 }, () => lane()))
    })
  }

  /** Remove one session's file, e.g. when its log disappeared or went foreign. */
  async remove(key: string): Promise<void> {
    const name = this.filesByKey.get(key) ?? entryFileName(key)
    this.filesByKey.delete(key)
    await this.enqueue(() => unlink(join(this.entriesDir, name)).catch(() => { /* already gone */ }))
  }

  /**
   * Drop cache files for sessions that no longer exist.
   *
   * Only files this instance loaded are candidates, so a second dsh home
   * sharing the directory is never pruned on a coincidence.
   *
   * @param keep - keys still present on disk.
   */
  async prune(keep: ReadonlySet<string>): Promise<void> {
    const orphans: string[] = []
    for (const [key, name] of this.filesByKey) {
      if (keep.has(key)) continue
      this.filesByKey.delete(key)
      orphans.push(name)
    }
    if (orphans.length === 0) return
    await this.enqueue(async () => {
      for (const name of orphans) await unlink(join(this.entriesDir, name)).catch(() => { /* best-effort */ })
    })
  }

  /** Persist the index-wide facts. */
  async writeMeta(meta: IndexMeta): Promise<void> {
    const file: MetaFile = { schema: SCHEMA, ...meta }
    await this.enqueue(() => this.writeFileAtomic(this.metaPath, file))
  }

  /** Resolve once everything queued so far has been written. */
  async settle(): Promise<void> {
    await this.queue
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(task, task).catch(() => { /* durability is best-effort */ })
    return this.queue
  }

  private async writeFileAtomic(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, path)
  }
}
