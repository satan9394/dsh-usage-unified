/**
 * Reading session artifacts off disk.
 *
 * Two on-disk shapes coexist on a real machine and both must be folded:
 *
 *  - the legacy JSONL backend writes `session.jsonl[.zstd]`, whose lines are
 *    storage records. Some of them (`text-chunks`, `reasoning-chunks`,
 *    `tool-call-chunks`) pack streaming deltas and carry no `seq`; the rest are
 *    ordinary events. Token accounting only ever needs the sequenced events —
 *    `assistant/message` carries the final usage — so the packed content runs
 *    are skipped. That removes any dependency on the harness's private
 *    `decodeStorageRecord`, which has moved between releases.
 *  - the versioned backend writes `session.v<version>.jsonl[.zstd]`, whose
 *    lines are already plain events.
 *
 * Both layouts are therefore read by the same line decoder: parse a line, keep
 * it when it carries a string `type` and a numeric `seq`. The `type: 'session'`
 * line is the header.
 *
 * Layout mirrors the JSONL backend's `format.ts`:
 *   <sessionsRoot>/<projectKey|_no-cwd>/<encodedSessionId>/session[.vN].jsonl[.zstd]
 * Directory names are never decoded — the header line carries the true id and
 * cwd, and the encoding is an implementation detail of the backend.
 *
 * @module dsh-usage-unified/reader
 */

import { open, readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import type { EventLike, HeaderLike } from './fold.ts'
import type { DshHome } from './homes.ts'
import { scanZstdFrames } from './zstd-frames.ts'

/** Highest session format version this reader understands. */
export const MAX_SUPPORTED_FORMAT = 3

/** Any canonical session log name: `session.jsonl`, `session.jsonl.zstd`, `session.v3.jsonl.zstd`. */
const LOG_PATTERN = /^session(?:\.[0-9a-zA-Z_-]+)?\.jsonl(?:\.zstd)?$/

/** One session log found on disk. */
export interface SessionArtifact {
  /** The home it belongs to. */
  home: DshHome
  path: string
  /** Stable identity across homes: `${sessionsRoot} ${project}/${session}`. */
  key: string
  size: number
  mtimeMs: number
  /** Distinguishes an inode swap (atomic republish) from an in-place append. */
  ino: number
  dev: number
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code
}

/**
 * Rank a log filename so the newest readable generation wins when a directory
 * holds more than one (a migrated session can briefly keep its predecessor).
 *
 * @param name - a filename matching {@link LOG_PATTERN}.
 * @returns a comparable score; higher is preferred.
 */
export function logPriority(name: string): number {
  const version = /\.v(\d+)\./.exec(name)
  const versionScore = version === null ? 0 : Number(version[1])
  const compressed = name.endsWith('.zstd') ? 1 : 0
  return versionScore * 2 + compressed
}

/**
 * Walk one home's sessions tree.
 *
 * Unreadable project directories are skipped rather than aborting the walk:
 * a single permission problem must not cost the user every other home.
 *
 * @param home - a home discovered by `discoverDshHomes`.
 * @yields one artifact per session directory that has a log.
 */
export async function* walkSessionArtifacts(home: DshHome): AsyncGenerator<SessionArtifact> {
  let projects
  try {
    projects = await readdir(home.sessionsRoot, { withFileTypes: true })
  } catch {
    return
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue
    const projectPath = join(home.sessionsRoot, project.name)
    let sessions
    try {
      sessions = await readdir(projectPath, { withFileTypes: true })
    } catch {
      continue
    }
    for (const session of sessions) {
      if (!session.isDirectory()) continue
      let names: string[]
      try {
        names = await readdir(join(projectPath, session.name))
      } catch {
        continue
      }
      const candidates = names.filter(name => LOG_PATTERN.test(name)).sort((a, b) => logPriority(b) - logPriority(a))
      const name = candidates[0]
      if (name === undefined) continue
      const path = join(projectPath, session.name, name)
      let stats
      try {
        stats = await stat(path)
      } catch (error) {
        if (errorCode(error) === 'ENOENT') continue
        continue
      }
      yield {
        home,
        path,
        key: `${home.sessionsRoot} ${project.name}/${session.name}`,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        ino: stats.ino,
        dev: stats.dev,
      }
    }
  }
}

/** Decoded slice of one artifact. */
export interface ArtifactRead {
  /** The header line carried by the log. */
  header: HeaderLike
  events: EventLike[]
  /** Byte offset just past the last COMPLETE frame — the resume cursor. */
  cursor: number
  /** True when the buffer ended inside a frame (a live writer mid-batch). */
  torn: boolean
  /** True when the header's format version is newer than this build can read. */
  foreign: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Coerce one parsed JSONL line into an event, or reject it. */
function toEvent(value: unknown): EventLike | undefined {
  if (!isRecord(value)) return undefined
  const type = value['type']
  const seq = value['seq']
  if (typeof type !== 'string') return undefined
  // Packed content records carry no seq and are not needed for accounting.
  if (typeof seq !== 'number' || !Number.isFinite(seq)) return undefined
  const time = typeof value['time'] === 'number' ? value['time'] : 0
  const event: EventLike = { type, seq, time }
  if ('data' in value) event.data = value['data']
  return event
}

/**
 * Decode artifact bytes into session events.
 *
 * @param bytes - the whole file, or the tail slice starting at `fromCursor`.
 * @param compressed - whether the path ends in `.zstd`.
 * @param fromCursor - byte offset `bytes` begins at; 0 for a full read.
 * @param cachedHeader - required when `fromCursor > 0`; the header line lives
 * in the first frame and is therefore absent from any tail slice.
 * @returns the decoded events plus the next resume cursor.
 * @throws when the container is structurally corrupt, or a full read finds no
 * header line — both are conditions the caller must see, not paper over.
 */
export function decodeArtifactBytes(
  bytes: Buffer,
  compressed: boolean,
  fromCursor = 0,
  cachedHeader?: HeaderLike,
): ArtifactRead {
  let lines: string[]
  let cursor: number
  let torn: boolean

  if (compressed) {
    const scan = scanZstdFrames(bytes)
    torn = scan.tornStart !== undefined
    // Never advance past the last complete frame: a torn tail is rewritten.
    cursor = fromCursor + (scan.frames[scan.frames.length - 1]?.end ?? 0)
    lines = []
    for (const frame of scan.frames) {
      const text = zstdDecompressSync(bytes.subarray(frame.start, frame.end)).toString('utf8')
      for (const line of text.split('\n')) if (line.length > 0) lines.push(line)
    }
  } else {
    const text = bytes.toString('utf8')
    const lastNewline = text.lastIndexOf('\n')
    torn = lastNewline !== text.length - 1
    cursor = fromCursor + (lastNewline + 1)
    lines = text.slice(0, lastNewline + 1).split('\n').filter(line => line.length > 0)
  }

  let header = cachedHeader
  let body = lines
  if (fromCursor === 0) {
    const firstIndex = lines.findIndex(line => /"type"\s*:\s*"session"/.test(line))
    const first = firstIndex < 0 ? undefined : lines[firstIndex]
    if (first === undefined) throw new Error('session log has no header line')
    header = JSON.parse(first) as HeaderLike
    body = lines.filter((_, index) => index !== firstIndex)
  }
  if (header === undefined) throw new Error('resume read requires a cached header')

  // A home written by a newer dsh build may hold records this decoder cannot
  // interpret. Skipping is honest; guessing is not.
  if (typeof header.version === 'number' && header.version > MAX_SUPPORTED_FORMAT) {
    return { header, events: [], cursor, torn, foreign: true }
  }

  const events: EventLike[] = []
  for (const line of body) {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    const event = toEvent(parsed)
    if (event !== undefined) events.push(event)
  }
  return { header, events, cursor, torn, foreign: false }
}

/**
 * Read an artifact, optionally resuming from a stored cursor.
 *
 * Resuming is sound because container frames are independently decodable, so
 * a tail slice starting at a frame boundary decodes to exactly the frames
 * appended since.
 *
 * @param path - absolute artifact path.
 * @param fromCursor - byte offset to resume from; 0 reads everything.
 * @param cachedHeader - the header from the initial full read, when resuming.
 */
export async function readArtifact(
  path: string,
  fromCursor: number,
  cachedHeader?: HeaderLike,
): Promise<ArtifactRead> {
  // A resume reads only the appended tail. The active session is also the
  // largest, and the refresh loop touches it every few seconds, so reading a
  // whole multi-megabyte log to consume two frames is the difference between a
  // cheap poll and a disk-bound one.
  if (fromCursor > 0) {
    const handle = await open(path, 'r')
    try {
      const info = await handle.stat()
      const length = Math.max(0, info.size - fromCursor)
      const tail = Buffer.allocUnsafe(length)
      if (length > 0) await handle.read(tail, 0, length, fromCursor)
      return decodeArtifactBytes(tail, path.endsWith('.zstd'), fromCursor, cachedHeader)
    } finally {
      await handle.close()
    }
  }
  return decodeArtifactBytes(await readFile(path), path.endsWith('.zstd'), 0, cachedHeader)
}
