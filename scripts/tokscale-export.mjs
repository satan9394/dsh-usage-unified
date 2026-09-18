/**
 * DEPRECATED — tokscale v4.17.0 reads versioned DSH logs natively.
 *
 * The upstream bug this worked around was fixed by junhoyeo/tokscale#1328,
 * which shipped in v4.17.0 (2026-09-15). Keeping this exporter AND the
 * `scanner.extraScanPaths.dsh` entry it feeds now DOUBLE-COUNTS those sessions
 * (tokscale does not dedupe an extra root against its own default scan), so the
 * pair must be retired together once `tokscale --version` reports >= 4.17.0:
 *
 *   1. `tokscale upgrade` (or reinstall the binary)
 *   2. remove the `dsh` entry from `%APPDATA%\tokscale\settings.json`
 *   3. delete `.tokscale-home/` and this script, and drop its step from
 *      `refresh-and-submit.ps1`
 *   4. re-submit and confirm the total did not drop
 *
 * Original purpose, kept for the migration window:
 *
 * tokscale's dsh parser used to look for `session.jsonl[.zstd]`, but current
 * DSH writes `session.v3.jsonl.zstd`, so it silently missed every v3 session
 * (about 40% of the tokens here). This wrote a converted copy of every session
 * — one `session.jsonl` per session, header + sequenced events, heavy content
 * fields stripped — under `.tokscale-home/sessions/..., so:
 *
 *   bun x tokscale@latest wrapped -c dsh --home .tokscale-home --clients
 *
 * sees the whole machine. Read-only against the real homes.
 *
 * Usage: node scripts/tokscale-export.mjs
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { discoverDshHomes, walkSessionArtifacts, readArtifact } from '../lib/index.js'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const outRoot = join(projectRoot, '.tokscale-home')
const CURRENT_HOME = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')

/** Event types worth keeping for token accounting / message counts. */
const KEEP = new Set([
  'user/message', 'assistant/message', 'assistant/attempt',
  'tool/result', 'compaction/summary',
  'request/header', 'request/context',
  'step/start', 'step/end', 'turn/start', 'turn/end',
])

/** Drop bulk content but keep everything usage-related. */
function slim(event) {
  const data = event.data
  if (typeof data !== 'object' || data === null) return { type: event.type, seq: event.seq, time: event.time }
  if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
    const message = data['message']
    const source = typeof message === 'object' && message !== null ? message['source'] : undefined
    return {
      type: event.type, seq: event.seq, time: event.time,
      data: { turn: data['turn'], step: data['step'], message: { source, content: [] }, usage: data['usage'] },
    }
  }
  if (event.type === 'user/message') {
    return { type: event.type, seq: event.seq, time: event.time, data: { source: data['source'], content: [] } }
  }
  if (event.type === 'tool/result') return { type: event.type, seq: event.seq, time: event.time, data: {} }
  if (event.type === 'compaction/summary') {
    return { type: event.type, seq: event.seq, time: event.time, data: { provider: data['provider'], model: data['model'], usage: data['usage'] } }
  }
  if (event.type === 'request/header') {
    const header = data['header']
    const config = typeof header === 'object' && header !== null ? header['config'] : undefined
    return { type: event.type, seq: event.seq, time: event.time, data: { header: { config } } }
  }
  if (event.type === 'request/context') {
    return { type: event.type, seq: event.seq, time: event.time, data: { provider: data['provider'], model: data['model'] } }
  }
  return { type: event.type, seq: event.seq, time: event.time, data: { turn: data['turn'], step: data['step'] } }
}

console.log(`exporting DSH sessions from ${CURRENT_HOME} → ${outRoot}`)
const discovery = await discoverDshHomes({ currentHome: CURRENT_HOME, extraRoots: [], osHome: homedir() })
const byRoot = new Map(discovery.homes.map(home => [home.sessionsRoot, home]))
let written = 0
let bytes = 0
const seen = new Set()

for (const home of discovery.homes) {
  for await (const artifact of walkSessionArtifacts(home)) {
    let read
    try {
      read = await readArtifact(artifact.path, 0)
    } catch {
      continue
    }
    if (read.foreign) continue
    // tokscale already scans the legacy `session.jsonl[.zstd]` in ~/.dsh but
    // not the versioned `session.v<N>.jsonl.zstd`, so export ONLY the versioned
    // logs. The extra scan root then supplements the default home instead of
    // duplicating it (extra roots are not deduped against the default root).
    if (!/\.v\d+\./.test(artifact.path)) continue
    const key = String(read.header.id).replace(/^session-/, '')
    if (seen.has(key)) continue
    seen.add(key)
    // Keep the original project/session directory shape; name the log the way
    // tokscale's DSH parser expects.
    const parts = artifact.path.split(/[\\/]/)
    const project = parts[parts.length - 3] ?? '_no-cwd'
    const session = parts[parts.length - 2] ?? key
    const dir = join(outRoot, 'sessions', project, session)
    await mkdir(dir, { recursive: true })
    const lines = [JSON.stringify(read.header)]
    for (const event of read.events) {
      if (!KEEP.has(event.type)) continue
      lines.push(JSON.stringify(slim(event)))
    }
    const text = `${lines.join('\n')}\n`
    await writeFile(join(dir, 'session.jsonl'), text, 'utf8')
    written += 1
    bytes += Buffer.byteLength(text)
  }
}
console.log(`wrote ${written} sessions, ${(bytes / 1024 / 1024).toFixed(1)} MB to ${outRoot}`)
void byRoot
