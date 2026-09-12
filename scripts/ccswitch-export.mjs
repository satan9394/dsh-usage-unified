/**
 * Export CC Switch's proxy-side usage into a Claude Code transcript layout that
 * tokscale can scan.
 *
 * CC Switch (`~/.cc-switch/cc-switch.db`) sits as a local proxy in front of
 * Claude Code / Codex / OpenCode and logs every request, so it sees usage that
 * never reached the agents' own local transcripts. tokscale reads local
 * transcripts, so its `claude` bucket is nearly empty (0.1亿) while CC Switch
 * logged ~109亿 for the same app.
 *
 * This writes a supplementary Claude Code transcript tree under
 * `.ccswitch-home/` (added to tokscale via `scanner.extraScanPaths.claude`)
 * covering ONLY `app_type = 'claude'`, which is where tokscale under-reads.
 * Codex/OpenCode are left alone because tokscale already reads more for them
 * locally, so injecting would double count.
 *
 * Usage: node scripts/ccswitch-export.mjs
 */
import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const DB = process.env.CC_SWITCH_DB?.trim() || join(homedir(), '.cc-switch', 'cc-switch.db')
const APP = 'claude'
const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const outRoot = join(projectRoot, '.ccswitch-home')

const db = new DatabaseSync(DB, { readOnly: true })
const isoDate = seconds => new Date(seconds * 1000).toISOString().slice(0, 10)

/** One assistant record per row, in the shape tokscale's claudecode parser reads. */
function line(id, date, model, i, o, cr, cw) {
  return JSON.stringify({
    type: 'assistant',
    uuid: `ccswitch-${id}`,
    sessionId: `ccswitch-${id.split('-').slice(0, 2).join('-')}`,
    timestamp: `${date}T12:00:00.000Z`,
    message: {
      id: `ccswitch-${id}`,
      type: 'message',
      role: 'assistant',
      model,
      usage: {
        input_tokens: i,
        output_tokens: o,
        cache_read_input_tokens: cr,
        cache_creation_input_tokens: cw,
      },
    },
  })
}

const byKey = new Map()
let tokens = 0
let rows = 0

// 1) Aggregated rollups (2026-01-27 .. 2026-08-13).
const rollups = db.prepare(`
  select date, model, input_tokens i, output_tokens o, cache_read_tokens cr, cache_creation_tokens cw
  from usage_daily_rollups where app_type = ?`).all(APP)
for (const r of rollups) {
  const model = r.model || r.request_model || 'unknown'
  const key = `${r.date}`
  const bucket = byKey.get(key) ?? []
  bucket.push(line(`r-${r.date}-${rows}`, r.date, model, r.i ?? 0, r.o ?? 0, r.cr ?? 0, r.cw ?? 0))
  byKey.set(key, bucket)
  tokens += (r.i ?? 0) + (r.o ?? 0) + (r.cr ?? 0) + (r.cw ?? 0)
  rows += 1
}

// 2) Live proxy request logs after the last rollup day.
const maxRollup = db.prepare('select max(date) d from usage_daily_rollups').get().d
const proxy = db.prepare(`
  select created_at, model, input_tokens i, output_tokens o, cache_read_tokens cr, cache_creation_tokens cw
  from proxy_request_logs where app_type = ? and created_at > ?`).all(APP, Math.floor(Date.parse(`${maxRollup}T23:59:59Z`) / 1000))
for (const r of proxy) {
  const date = isoDate(r.created_at)
  const bucket = byKey.get(date) ?? []
  bucket.push(line(`p-${r.created_at}-${rows}`, date, r.model || 'unknown', r.i ?? 0, r.o ?? 0, r.cr ?? 0, r.cw ?? 0))
  byKey.set(date, bucket)
  tokens += (r.i ?? 0) + (r.o ?? 0) + (r.cr ?? 0) + (r.cw ?? 0)
  rows += 1
}

for (const [date, lines] of byKey) {
  const dir = join(outRoot, '_ccswitch')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `session-${date}.jsonl`), `${lines.join('\n')}\n`, 'utf8')
}

console.log(`CC Switch db: ${DB}`)
console.log(`exported app_type='claude': rows=${rows} tokens=${tokens.toLocaleString()} (${(tokens / 1e8).toFixed(2)}亿)`)
console.log(`  rollups=${rollups.length}  proxy(after ${maxRollup})=${proxy.length}`)
console.log(`wrote ${byKey.size} transcript files under ${outRoot}`)
