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
 *    lines are already plain events. Format v4 (dsh 0.2.0-rc.2's
 *    `SESSION_FORMAT_VERSION`, still current in 0.2.1-rc.5 — the format
 *    catalog reports `currentVersion: 4` and no v4→v5 migration exists) keeps
 *    the v3 event envelope — `{type, seq, time, data}` — and the
 *    `assistant/message.data.usage` payload
 *    (`inputTokens` / `cacheReadTokens` / `cacheWriteTokens` / `outputTokens`)
 *    unchanged; the v3→v4 migration only rewrites message `source.kind` and
 *    lifts tool results to first-class messages, neither of which the fold
 *    reads. v4 is therefore read by the same decoder.
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
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import type { EventLike, HeaderLike } from './fold.ts'
import type { DshHome } from './homes.ts'
import { scanZstdFrames } from './zstd-frames.ts'

/** Highest session format version this reader understands (v4 = dsh 0.2.0-rc.2 … 0.2.1-rc.5). */
export const MAX_SUPPORTED_FORMAT = 4

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
/**
 * Whether this Node build decodes a whole run of concatenated frames in one
 * call, or stops at the first frame.
 *
 * Node 22.19 stops at the first frame of a multi-frame artifact; Node 26
 * decodes the run. Which one the host runtime does is a property of the
 * runtime, not of the log, so it is probed once with two frames and trusted
 * afterwards. The fast path matters: on this machine's real history the
 * one-call form is ~4x faster (1.09M frames, 26.4s -> 6.6s), and the output is
 * byte-identical.
 */
let concatenatedDecode: boolean | undefined

function decodesConcatenatedFrames(): boolean {
  if (concatenatedDecode !== undefined) return concatenatedDecode
  try {
    const first = zstdCompressSync(Buffer.from('{"probe":1}\n'))
    const second = zstdCompressSync(Buffer.from('{"probe":2}\n'))
    concatenatedDecode = zstdDecompressSync(Buffer.concat([first, second])).toString('utf8').includes('"probe":2')
  } catch {
    // No zstd in this runtime, or no concatenated support: use the frame walk.
    concatenatedDecode = false
  }
  return concatenatedDecode
}

/**
 * Decompress a complete run of frames into the log text.
 *
 * @param bytes - the artifact bytes (or a tail slice).
 * @param frames - the complete frames found in `bytes`, in order.
 * @returns the concatenated decoded text of every frame.
 */
function decodeFrames(bytes: Buffer, frames: readonly { start: number; end: number }[]): string {
  const first = frames[0]
  const last = frames[frames.length - 1]
  if (first === undefined || last === undefined) return ''
  if (decodesConcatenatedFrames()) {
    return zstdDecompressSync(bytes.subarray(first.start, last.end)).toString('utf8')
  }
  let text = ''
  for (const frame of frames) {
    text += zstdDecompressSync(bytes.subarray(frame.start, frame.end)).toString('utf8')
  }
  return text
}

/**
 * How much compressed data one synchronous decode step may cover.
 *
 * A group of consecutive complete frames decodes in a single call (the call
 * count is what costs), and yielding between groups keeps the host's event loop
 * answering the panel instead of stalling behind one 30 MB log.
 */
const DECODE_GROUP_BYTES = 8 * 1024 * 1024

/**
 * Decode a frame run in bounded groups, yielding between them.
 *
 * @param bytes - the artifact bytes (or a tail slice).
 * @param frames - the complete frames found in `bytes`, in order.
 */
async function decodeFramesCooperatively(
  bytes: Buffer,
  frames: readonly { start: number; end: number }[],
): Promise<string> {
  const first = frames[0]
  const last = frames[frames.length - 1]
  if (first === undefined || last === undefined) return ''
  // The fallback runtime decodes one frame at a time; group the calls the same
  // way so a long log still yields, and hand each group to the frame walk.
  if (!decodesConcatenatedFrames()) return decodeFrames(bytes, frames)

  let text = ''
  let index = 0
  while (index < frames.length) {
    const start = frames[index]?.start ?? 0
    let end = start
    while (index < frames.length && end - start < DECODE_GROUP_BYTES) {
      end = frames[index]?.end ?? end
      index += 1
    }
    text += zstdDecompressSync(bytes.subarray(start, end)).toString('utf8')
    if (index < frames.length) await new Promise<void>(resolve => { setImmediate(resolve) })
  }
  return text
}

/**
 * Split decoded log text into non-empty lines.
 *
 * @param text - the decoded session log.
 */
function splitLines(text: string): string[] {
  const lines: string[] = []
  for (const line of text.split('\n')) if (line.length > 0) lines.push(line)
  return lines
}

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
    lines = splitLines(decodeFrames(bytes, scan.frames))
  } else {
    const text = bytes.toString('utf8')
    const lastNewline = text.lastIndexOf('\n')
    torn = lastNewline !== text.length - 1
    cursor = fromCursor + (lastNewline + 1)
    lines = text.slice(0, lastNewline + 1).split('\n').filter(line => line.length > 0)
  }

  return finishRead(lines, fromCursor, cachedHeader, cursor, torn)
}

/**
 * Turn decoded lines into the artifact read: header, events, cursor, torn flag.
 *
 * @param lines - non-empty decoded lines.
 * @param fromCursor - byte offset the decode started at; 0 means the header is present.
 * @param cachedHeader - the header a resume relies on.
 * @param cursor - next resume offset.
 * @param torn - whether the buffer ended inside a frame.
 */
function finishRead(
  lines: readonly string[],
  fromCursor: number,
  cachedHeader: HeaderLike | undefined,
  cursor: number,
  torn: boolean,
): ArtifactRead {
  let header = cachedHeader
  let body: readonly string[] = lines
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
    // Packed content records (streaming deltas) carry no `seq`, and the header
    // is the only pre-event line worth parsing. On this machine's real history
    // that skip covers ~36% of 1.7M lines, each of which would otherwise cost a
    // full JSON.parse — the second-largest slice of a cold build.
    if (!line.includes('"seq"') && !line.includes('"session"')) continue
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
 * Compressed logs decode in bounded groups with a yield between them: a single
 * 30 MB artifact would otherwise hold the host's event loop (and therefore the
 * panel) for a second at a time.
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
  const compressed = path.endsWith('.zstd')
  // A resume reads only the appended tail. The active session is also the
  // largest, and the refresh loop touches it every few seconds, so reading a
  // whole multi-megabyte log to consume two frames is the difference between a
  // cheap poll and a disk-bound one.
  let bytes: Buffer
  if (fromCursor > 0) {
    const handle = await open(path, 'r')
    try {
      const info = await handle.stat()
      const length = Math.max(0, info.size - fromCursor)
      const tail = Buffer.allocUnsafe(length)
      if (length > 0) await handle.read(tail, 0, length, fromCursor)
      bytes = tail
    } finally {
      await handle.close()
    }
  } else {
    bytes = await readFile(path)
  }
  if (!compressed) return decodeArtifactBytes(bytes, false, fromCursor, cachedHeader)

  const scan = scanZstdFrames(bytes)
  const torn = scan.tornStart !== undefined
  // Never advance past the last complete frame: a torn tail is rewritten.
  const cursor = fromCursor + (scan.frames[scan.frames.length - 1]?.end ?? 0)
  const lines = splitLines(await decodeFramesCooperatively(bytes, scan.frames))
  return finishRead(lines, fromCursor, cachedHeader, cursor, torn)
}
