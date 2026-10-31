import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { cacheDirFor, localTimeZone, UnifiedIndexStore } from '../src/index-store.ts'
import { FOLD_VERSION } from '../src/fold.ts'

const TZ = localTimeZone()
const DAY = Date.parse('2026-08-01T00:00:00Z')

const dirs: string[] = []

afterEach(async () => {
  // Let any debounced cache write settle before the directory goes away.
  await new Promise(resolve => setTimeout(resolve, 30))
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function machine(): Promise<{ osHome: string; home: string; sessionDir: string; log: string; cachePath: string }> {
  const osHome = await mkdtemp(join(tmpdir(), 'dsh-usage-store-'))
  dirs.push(osHome)
  const home = join(osHome, '.dsh')
  const sessionDir = join(home, 'sessions', 'project-a', 'session-a')
  await mkdir(sessionDir, { recursive: true })
  const log = join(sessionDir, 'session.v4.jsonl.zstd')
  const cachePath = join(home, 'usage-unified', 'index-v1.json')
  return { osHome, home, sessionDir, log, cachePath }
}

function container(lines: readonly string[]): Buffer {
  return Buffer.concat(lines.map(line => zstdCompressSync(Buffer.from(`${line}\n`, 'utf8'))))
}

const HEADER = `{"type":"session","version":4,"id":"session-a","createdAt":${DAY},"cwd":"D:\\\\work","isSeeded":false,"delegationDepth":0}`

/** One human turn and one model step that reports `input` input tokens. */
function turn(input: number, seq: number): string[] {
  const time = DAY + 1_000 + seq * 10
  return [
    `{"type":"user/message","seq":${seq},"time":${time},"data":{"source":{"kind":"user"},"message":{"content":[]}}}`,
    `{"type":"step/start","seq":${seq + 1},"time":${time + 1},"data":{"turn":1,"step":${seq / 2 + 1}}}`,
    `{"type":"assistant/message","seq":${seq + 2},"time":${time + 2},"data":{"turn":1,"step":${seq / 2 + 1},"message":{"content":[{"type":"text"}],"source":{"provider":"deepseek","model":"deepseek-chat"}},"usage":{"inputTokens":${input},"outputTokens":5,"cacheReadTokens":1,"cacheWriteTokens":0}}}`,
    `{"type":"step/end","seq":${seq + 3},"time":${time + 3},"data":{"turn":1,"step":${seq / 2 + 1}}}`,
  ]
}

function store(options: { osHome: string; home: string; cachePath: string }): UnifiedIndexStore {
  return new UnifiedIndexStore({
    extraSessionRoots: [],
    includeCompaction: true,
    chunkYieldMs: 16,
    currentHome: options.home,
    cachePath: options.cachePath,
    cacheWriteDelayMs: 1,
    concurrency: 2,
    osHome: options.osHome,
    now: () => DAY + 86_400_000,
  })
}

describe('index store — durable cache', () => {
  it('writes one file per session plus meta, and reports the pass as complete', async () => {
    const { osHome, home, log, cachePath } = await machine()
    await writeFile(log, container([HEADER, ...turn(100, 0)]))

    const first = store({ osHome, home, cachePath })
    await first.refresh()
    await first.flush()

    expect(first.status.phase).toBe('ready')
    expect(first.status.indexed).toBe(1)
    expect(first.snapshot({ range: 'all', scope: 'all' }).totals.tokens).toBe(106)

    const cacheDir = cacheDirFor(cachePath)
    const meta = JSON.parse(await readFile(join(cacheDir, 'meta.json'), 'utf8')) as { complete: boolean; foldVersion: number }
    expect(meta.complete).toBe(true)
    expect(meta.foldVersion).toBe(FOLD_VERSION)
    const names = await readdir(join(cacheDir, 'entries'))
    expect(names).toHaveLength(1)
    expect(names[0]).toMatch(/^[0-9a-f]{20}\.json$/)
  })

  it('answers from the cache before any scan when a previous run persisted', async () => {
    const { osHome, home, log, cachePath } = await machine()
    await writeFile(log, container([HEADER, ...turn(100, 0)]))

    const first = store({ osHome, home, cachePath })
    await first.refresh()
    await first.flush()

    const second = store({ osHome, home, cachePath })
    await second.load()
    expect(second.status.phase).toBe('ready')
    expect(second.status.indexed).toBe(1)
    expect(second.snapshot({ range: 'all', scope: 'all' }).totals.tokens).toBe(106)
  })

  it('folds only the appended tail when a session grows', async () => {
    const { osHome, home, log, cachePath } = await machine()
    const head = container([HEADER, ...turn(100, 0)])
    await writeFile(log, head)

    const first = store({ osHome, home, cachePath })
    await first.refresh()
    await first.flush()
    expect(first.snapshot({ range: 'all', scope: 'all' }).totals.input).toBe(100)

    await writeFile(log, Buffer.concat([head, container(turn(50, 4))]))

    const second = store({ osHome, home, cachePath })
    await second.refresh()
    expect(second.status.indexed).toBe(1)
    expect(second.snapshot({ range: 'all', scope: 'all' }).totals.input).toBe(150)
    await second.flush()
    second.dispose()
  })

  it('migrates the pre-0.6 single-file cache into the directory layout', async () => {
    const { osHome, home, log, cachePath } = await machine()
    await writeFile(log, container([HEADER, ...turn(100, 0)]))

    const seed = store({ osHome, home, cachePath })
    await seed.refresh()
    await seed.flush()
    const entriesDir = join(cacheDirFor(cachePath), 'entries')
    const [entryName] = await readdir(entriesDir)
    const entry = JSON.parse(await readFile(join(entriesDir, entryName ?? ''), 'utf8')) as { key: string; entry: unknown }

    // Rebuild the legacy envelope exactly as 0.5.2 wrote it, then remove the
    // directory so only the old file exists.
    await rm(cacheDirFor(cachePath), { recursive: true, force: true })
    const legacy = {
      schema: 2,
      meta: { tz: TZ, foldVersion: FOLD_VERSION, builtAt: DAY },
      entries: { [entry.key]: entry.entry },
    }
    await mkdir(join(home, 'usage-unified'), { recursive: true })
    await writeFile(cachePath, JSON.stringify(legacy))

    const migrated = store({ osHome, home, cachePath })
    await migrated.load()
    expect(migrated.status.indexed).toBe(1)
    expect(migrated.snapshot({ range: 'all', scope: 'all' }).totals.input).toBe(100)
    // The legacy file is kept, renamed, rather than deleted.
    await expect(readFile(`${cachePath}.migrated`, 'utf8')).resolves.toContain('"schema":2')
    expect(await readdir(join(cacheDirFor(cachePath), 'entries'))).toHaveLength(1)
  })

  it('drops the cache file of a session that disappeared', async () => {
    const { osHome, home, sessionDir, log, cachePath } = await machine()
    await writeFile(log, container([HEADER, ...turn(100, 0)]))

    const first = store({ osHome, home, cachePath })
    await first.refresh()
    await first.flush()
    expect(await readdir(join(cacheDirFor(cachePath), 'entries'))).toHaveLength(1)

    await rm(sessionDir, { recursive: true, force: true })
    const second = store({ osHome, home, cachePath })
    await second.refresh()
    await second.flush()

    expect(second.status.indexed).toBe(0)
    expect(await readdir(join(cacheDirFor(cachePath), 'entries'))).toHaveLength(0)
  })
})
