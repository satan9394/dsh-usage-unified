import { zstdCompressSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { decodeArtifactBytes, logPriority } from '../src/reader.ts'

/** Compress each line into its own independently decodable frame, as the backend does. */
function container(lines: readonly string[]): Buffer {
  return Buffer.concat(lines.map(line => zstdCompressSync(Buffer.from(`${line}\n`, 'utf8'))))
}

const HEADER_V3 = '{"type":"session","version":3,"id":"session-abc","createdAt":1,"cwd":"D:\\\\x"}'
const HEADER_V0 = '{"type":"session","version":0,"id":"abc","createdAt":1,"cwd":"D:\\\\x","origin":"subagent"}'

/** A packed content record: no numeric seq, must be skipped. */
const PACKED = '{"type":"text-chunks","data":{"chunks":[{"text":"hi"}]}}'
const MESSAGE = '{"type":"assistant/message","seq":5,"time":1000,"data":{"turn":1,"step":1,"usage":{"inputTokens":10}}}'
const HUMAN = '{"type":"user/message","seq":4,"time":900,"data":{"source":{"kind":"user"}}}'

describe('session log decoder', () => {
  it('reads a v3 log whose lines are already plain events', () => {
    const read = decodeArtifactBytes(container([HEADER_V3, HUMAN, MESSAGE]), true)
    expect(read.foreign).toBe(false)
    expect(read.header.id).toBe('session-abc')
    expect(read.events.map(event => event.type)).toEqual(['user/message', 'assistant/message'])
    expect(read.events[1]?.seq).toBe(5)
    expect(read.torn).toBe(false)
  })

  it('keeps sequenced events from a legacy log and skips packed content records', () => {
    const read = decodeArtifactBytes(container([HEADER_V0, PACKED, HUMAN, PACKED, MESSAGE]), true)
    expect(read.foreign).toBe(false)
    expect(read.header.origin).toBe('subagent')
    expect(read.events.map(event => event.type)).toEqual(['user/message', 'assistant/message'])
  })

  it('refuses a log written by a newer format than it understands', () => {
    const future = '{"type":"session","version":99,"id":"z","createdAt":1}'
    const read = decodeArtifactBytes(container([future, MESSAGE]), true)
    expect(read.foreign).toBe(true)
    expect(read.events).toHaveLength(0)
  })

  it('stops the resume cursor before an incomplete trailing frame', () => {
    const complete = container([HEADER_V3, HUMAN])
    const partial = zstdCompressSync(Buffer.from(`${MESSAGE}\n`, 'utf8')).subarray(0, 9)
    const read = decodeArtifactBytes(Buffer.concat([complete, partial]), true)
    expect(read.torn).toBe(true)
    expect(read.cursor).toBe(complete.length)
    expect(read.events.map(event => event.type)).toEqual(['user/message'])
  })

  it('resumes a tail slice using the cached header', () => {
    const header = JSON.parse(HEADER_V3) as { version: number; id: string; createdAt: number }
    const read = decodeArtifactBytes(container([MESSAGE]), true, 100, header)
    expect(read.events).toHaveLength(1)
    expect(read.cursor).toBe(100 + container([MESSAGE]).length)
  })

  it('throws when a full read has no header line', () => {
    expect(() => decodeArtifactBytes(container([MESSAGE]), true)).toThrow(/no header line/)
  })

  it('prefers the newest compressed generation when a directory holds several', () => {
    expect(logPriority('session.v3.jsonl.zstd')).toBeGreaterThan(logPriority('session.jsonl.zstd'))
    expect(logPriority('session.jsonl.zstd')).toBeGreaterThan(logPriority('session.jsonl'))
    expect(logPriority('session.v1.jsonl.zstd')).toBeGreaterThan(logPriority('session.jsonl.zstd'))
  })
})
