import { zstdCompressSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { scanZstdFrames } from '../src/zstd-frames.ts'

/** One independently decodable frame carrying `text`. */
function frame(text: string): Buffer {
  return zstdCompressSync(Buffer.from(text, 'utf8'))
}

describe('zstd frame scanner', () => {
  it('finds every frame in a concatenated container', () => {
    const buffer = Buffer.concat([frame('one'), frame('two'), frame('three')])
    const scan = scanZstdFrames(buffer)
    expect(scan.frames).toHaveLength(3)
    expect(scan.tornStart).toBeUndefined()
    // Frames tile the buffer exactly and in order.
    expect(scan.frames[0]?.start).toBe(0)
    for (let i = 1; i < scan.frames.length; i++) {
      expect(scan.frames[i]?.start).toBe(scan.frames[i - 1]?.end)
    }
    expect(scan.frames[scan.frames.length - 1]?.end).toBe(buffer.length)
  })

  it('reports a torn trailing frame without advancing past it', () => {
    const complete = frame('complete')
    const partial = frame('broken-tail').subarray(0, 12)
    const buffer = Buffer.concat([complete, partial])
    const scan = scanZstdFrames(buffer)
    expect(scan.frames).toHaveLength(1)
    expect(scan.frames[0]?.end).toBe(complete.length)
    expect(scan.tornStart).toBe(complete.length)
  })

  it('honours the maxFrames bound used by header-only probes', () => {
    const buffer = Buffer.concat([frame('a'), frame('b'), frame('c')])
    expect(scanZstdFrames(buffer, 1).frames).toHaveLength(1)
  })

  it('throws on invalid frame magic rather than silently truncating', () => {
    const corrupt = Buffer.concat([frame('ok'), Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])])
    expect(() => scanZstdFrames(corrupt)).toThrow(/invalid frame magic/)
  })
})
