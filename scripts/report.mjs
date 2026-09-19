/**
 * Build a static, self-contained HTML report from the real `~/.dsh` data.
 *
 * No server and no browser fetch: every number is rendered here, so the file
 * opens and displays offline. Uses the same cache as `local-smoke.mjs`, so a
 * warm run is seconds.
 *
 *   node scripts/report.mjs                # all-time (default)
 *   node scripts/report.mjs --range 30d
 *   node scripts/report.mjs --open         # open the file when done
 *
 * When DSH's own projection cache is present, the report also prints an
 * authoritative reconciliation line, so "is anything missing?" is answerable
 * from the page itself.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdir, readdir, readFile, stat, writeFile, access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { UnifiedIndexStore } from '../lib/index.js'

const args = process.argv.slice(2)
const valueOf = (name, fallback) => {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback
}
const requested = valueOf('--range', 'all')
const RANGE_LABELS = { '1d': '今天', '7d': '近 7 天', '14d': '近 14 天', '30d': '近 30 天' }
const range = ['all', ...Object.keys(RANGE_LABELS)].includes(requested) ? requested : 'all'
/** Human label for the window, so a report header never shows a raw wire id. */
const rangeLabel = range === 'all' ? '全部时间' : (RANGE_LABELS[range] ?? range)
const open = args.includes('--open')

const CURRENT_HOME = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const cachePath = join(projectRoot, '.smoke-cache', 'index-v1.json')
const outPath = join(projectRoot, `report-${range}.html`)

const nf = n => new Intl.NumberFormat('en-US').format(Math.round(n))
const compact = n => n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n))
/** Chinese units: 亿 (1e8) and 万 (1e4). */
const cn = n => n >= 1e8 ? `${(n / 1e8).toFixed(2)} 亿` : n >= 1e4 ? `${(n / 1e4).toFixed(2)} 万` : nf(n)
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const hour = h => h === null || h === undefined ? '—' : `${h}:00`
const pct = (a, b) => b <= 0 ? '0' : (a / b * 100).toFixed(1)

/** DSH's own per-session usage projection, summed — the authoritative total. */
async function readDshProjection(dshHome) {
  const dir = join(dshHome, 'storages', 'session_projcache', 'sessions')
  try {
    const files = (await readdir(dir)).filter(name => name.endsWith('.json'))
    let tokens = 0
    let sessions = 0
    for (const file of files) {
      try {
        const json = JSON.parse(await readFile(join(dir, file), 'utf8'))
        const usage = json?.record?.rows?.tokenUsage?.val?.totals
        if (usage === undefined) continue
        tokens += (usage.uncachedInputTokens ?? 0) + (usage.outputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
        sessions += 1
      } catch { /* a single bad cache row must not fail the report */ }
    }
    return { tokens, sessions, files: files.length }
  } catch {
    return undefined
  }
}

console.log(`building report from ${CURRENT_HOME} (range=${range}) …`)
await mkdir(join(projectRoot, '.smoke-cache'), { recursive: true })
const store = new UnifiedIndexStore({
  extraSessionRoots: [],
  includeCompaction: true,
  chunkYieldMs: 16,
  currentHome: CURRENT_HOME,
  cachePath,
  // Same default the plugin uses, so the report's cost matches the panel's.
  pricingPath: join(CURRENT_HOME, 'usage-unified', 'pricing.json'),
  cacheWriteDelayMs: 1000,
})
const started = Date.now()
await store.refresh()
const snapshot = store.snapshot({ range, scope: 'all' })
const calls = store.calls({ range, scope: 'all', page: 1, pageSize: 100, maxRecords: 2000 })
const t = snapshot.totals
if (snapshot.status.indexed > 0) await store.flush()
console.log(`  indexed ${snapshot.status.indexed} sessions in ${((Date.now() - started) / 1000).toFixed(1)}s`)

const projection = await readDshProjection(CURRENT_HOME)
if (projection !== undefined) {
  const delta = snapshot.allTime.totals.tokens - projection.tokens
  console.log(`  dsh projection=${projection.tokens} plugin=${snapshot.allTime.totals.tokens} delta=${delta}`)
}

// Optional: the tokscale Wrapped image, when `tokscale wrapped` has been run.
// Its age is reported with it: the image is a snapshot of whatever the scanner
// saw on the day it was generated, and an undated chart embedded in a fresh
// report reads as current when it may not be.
let wrappedAt = null
try {
  const wrappedPath = join(projectRoot, 'tokscale-wrapped.png')
  await access(wrappedPath)
  const info = await stat(wrappedPath)
  wrappedAt = new Date(info.mtimeMs).toLocaleString()
} catch { /* not generated yet */ }

// Optional: the reader's own tokscale profile card + live rank. Opt-in — only
// rendered when TOKSCALE_USERNAME is set, so the default report never carries
// an account identity.
const tokscaleUser = (process.env.TOKSCALE_USERNAME ?? '').trim()
let tokscaleProfile = ''
if (tokscaleUser !== '') {
  try {
    const svg = await readFile(join(projectRoot, 'tokscale-embed.svg'), 'utf8')
    let live
    try {
      const response = await fetch(`https://tokscale.ai/api/users/${encodeURIComponent(tokscaleUser)}`)
      if (response.ok) live = await response.json()
    } catch { /* offline: the static card still renders */ }
    const rank = live?.user?.rank
    const stats = live?.stats
    const submitted = stats ? `${nf(stats.totalTokens)} tokens · $${(stats.totalCost ?? 0).toFixed(2)}` : ''
    const when = stats?.lastSubmittedAt ? new Date(stats.lastSubmittedAt).toLocaleString() : ''
    tokscaleProfile = `<section><h2>Tokscale 排名（@${esc(tokscaleUser)}）</h2>
    <div class="tscard">${svg}</div>
    <div class="note">${rank === undefined ? '' : `当前排名 <b>#${rank}</b> · `}${submitted}${when === '' ? '' : ` · 上次提交 ${esc(when)}`} · 榜单：<a href="https://tokscale.ai/leaderboard">tokscale.ai/leaderboard</a>。把本机最新用量刷进榜单：<code>bun x tokscale@latest submit</code>（上传的是聚合后的每日 token/cost，不含文件内容或工作目录）。</div></section>`
  } catch { /* no profile card yet */ }
}

const A = snapshot.allTime.totals
const sparkDays = snapshot.days.slice(-60)
const sparkMax = Math.max(1, ...sparkDays.map(d => d.tokens))
const sparkPts = sparkDays.map((d, i) => {
  const x = sparkDays.length <= 1 ? 0 : (i / (sparkDays.length - 1)) * 260
  const y = 50 - (d.tokens / sparkMax) * 44 - 3
  return `${x.toFixed(1)},${y.toFixed(1)}`
}).join(' ')
const sparkSvg = `<svg class="spark" viewBox="0 0 260 52" preserveAspectRatio="none" aria-hidden="true"><polyline points="${sparkPts}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>`

// T is the selected window and drives every headline card; A stays all-time for
// the two streaks (a streak is a fact about "now"), the unit table and the
// reconciliation — which is why those are labelled as all-time.
const T = snapshot.totals
const cacheDenom = T.input + T.cacheRead + T.cacheWrite
const windowLabel = rangeLabel
const windowRange = snapshot.range.from === '' ? '全部时间' : `${snapshot.range.from} → ${snapshot.range.to}`

const cardDefs = [
  { label: 'Tokens 用量', value: (T.tokens / 1e8).toFixed(2), unit: '亿', detail: `${nf(T.tokens)} · ${compact(T.tokens)} · 含缓存读`, accent: '#1684ff', hero: true },
  { label: '会话', value: nf(T.sessions), unit: '个', detail: `另含 ${nf(T.subagentSessions)} 个子会话`, accent: '#9368ef' },
  { label: '消息', value: compact(T.messages), unit: '', detail: `人工 ${compact(T.humanMessages)} · 助手 ${compact(T.assistantMessages)}`, accent: '#219653' },
  { label: '调用次数', value: compact(snapshot.models.reduce((sum, m) => sum + m.calls, 0)), unit: '', detail: '', accent: '#22b8b5' },
  { label: '缓存命中率', value: cacheDenom > 0 ? `${(T.cacheRead / cacheDenom * 100).toFixed(1)}` : '—', unit: cacheDenom > 0 ? '%' : '', detail: '', accent: '#2da2bb' },
  { label: '活跃天数', value: nf(T.activeDays), unit: '天', detail: '', accent: '#f59e0b' },
  { label: '当前连续 · 全时', value: nf(A.currentStreak), unit: '天', detail: '', accent: '#ef5da8' },
  { label: '最长连续 · 全时', value: nf(A.longestStreak), unit: '天', detail: '', accent: '#a479e2' },
  { label: '高峰时段', value: hour(T.peakHour), unit: '', detail: '', accent: '#2da2bb' },
  {
    label: '最常用模型',
    value: snapshot.mostUsedModel ? snapshot.mostUsedModel.model : '—',
    unit: '',
    detail: snapshot.mostUsedModel ? `${snapshot.mostUsedModel.provider} · ${snapshot.mostUsedModel.percent.toFixed(1)}%` : '',
    accent: '#65a9ff',
    small: true,
  },
]
if (snapshot.cost !== null) {
  const cost = snapshot.cost
  const covered = cost.pricedTokens + cost.unpricedTokens
  cardDefs.push({
    label: '估算成本',
    value: `$${cost.total.toFixed(2)}`,
    unit: '',
    detail: `已定价 ${covered === 0 ? 0 : Math.round(cost.pricedTokens / covered * 100)}% · ${compact(cost.unpricedTokens)} tokens 未定价`
      + (cost.peakShare === undefined ? '' : ` · 峰值按 ${Math.round(cost.peakShare * 100)}% 折算`),
    accent: '#f59e0b',
    small: true,
  })
}
const statCards = cardDefs.map(card => `<div class="stat${card.hero ? ' hero' : ''}${card.small ? ' small' : ''}" style="--accent:${card.accent}"><div class="k"><i class="pin"></i>${esc(card.label)}</div><div class="val">${esc(card.value)}${card.unit ? `<span class="u">${esc(card.unit)}</span>` : ''}</div>${card.detail ? `<div class="d">${esc(card.detail)}</div>` : ''}${card.hero ? sparkSvg : ''}</div>`).join('')

const maxDay = Math.max(1, ...snapshot.days.map(d => d.tokens))
const dayBars = snapshot.days.map(d => `<i style="height:${(d.tokens / maxDay * 100).toFixed(2)}%" title="${esc(d.date)}: ${nf(d.tokens)} tokens · ${d.calls} calls"></i>`).join('')
// Provider rollup — the "command" number is here, not in the per-model rows.
const byProvider = new Map()
for (const m of snapshot.models) {
  const row = byProvider.get(m.provider) ?? { tokens: 0, calls: 0, models: 0 }
  row.tokens += m.tokens
  row.calls += m.calls
  row.models += 1
  byProvider.set(m.provider, row)
}
const providerRows = [...byProvider].sort((a, b) => b[1].tokens - a[1].tokens)
const providerTotal = providerRows.reduce((acc, [, r]) => acc + r.tokens, 0)
const providerTable = providerRows.map(([p, r]) => `<tr><td>${esc(p)}</td><td class="num">${nf(r.tokens)}</td><td class="num">${cn(r.tokens)}</td><td class="num">${compact(r.tokens)}</td><td class="num">${pct(r.tokens, providerTotal)}%</td><td class="num">${nf(r.calls)}</td><td class="num">${r.models}</td></tr>`).join('')

const totalAll = snapshot.allTime.totals.tokens
const unitRows = [
  ['原始 tokens', nf(totalAll)],
  ['亿（1e8）', `${(totalAll / 1e8).toFixed(2)} 亿`],
  ['万（1e4）', `${(totalAll / 1e4).toFixed(2)} 万`],
  ['B（十亿，1e9）', `${(totalAll / 1e9).toFixed(3)} B`],
  ['M（百万，1e6）', `${(totalAll / 1e6).toFixed(2)} M`],
  ['K（千，1e3）', `${(totalAll / 1e3).toFixed(2)} K`],
].map(([u, v]) => `<tr><td>${esc(u)}</td><td class="num">${esc(v)}</td></tr>`).join('')

const bucketLabel = { input: '输入', cacheRead: '缓存读', cacheWrite: '缓存写', output: '输出' }
const MODEL_ROW_LIMIT = 6
const modelRowOf = m => {
  const segs = ['input', 'cacheRead', 'cacheWrite', 'output'].map(b => m[b] > 0 ? `<span class="seg" data-b="${b}" style="width:${(m[b] / m.tokens * 100).toFixed(2)}%" title="${bucketLabel[b]} ${nf(m[b])}"></span>` : '').join('')
  const cost = m.costUsd === undefined ? '' : ` · ≈$${m.costUsd.toFixed(2)}`
  return `<div class="mrow"><div class="mhead"><span>${esc(m.model)} · ${esc(m.provider)}</span><span>${m.percent.toFixed(1)}% · ${cn(m.tokens)} · ${compact(m.tokens)} · ${m.calls} 次${cost}</span></div><div class="stack">${segs}</div></div>`
}
// The same treatment as the plugin: the head of the list, the tail behind a toggle.
const modelRows = snapshot.models.slice(0, MODEL_ROW_LIMIT).map(modelRowOf).join('')
  + (snapshot.models.length > MODEL_ROW_LIMIT
    ? `<details><summary class="more">展开全部 ${snapshot.models.length} 个模型</summary>${snapshot.models.slice(MODEL_ROW_LIMIT).map(modelRowOf).join('')}</details>`
    : '')
const SESSION_ROW_LIMIT = 12
const sessionLabel = row => {
  if (row.cwd !== undefined) {
    const leaf = row.cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop()
    if (leaf !== undefined && leaf.length > 0) return leaf
  }
  return row.sessionId.length > 16 ? `${row.sessionId.slice(0, 16)}…` : row.sessionId
}
const sessionRowOf = row => `<tr><td>${esc(sessionLabel(row))}${row.subtask ? ' <span class="muted">sub</span>' : ''}</td><td class="muted">${esc(row.cwd ?? row.sessionId)}</td><td class="num">${new Date(row.startTime ?? row.createdAt).toLocaleDateString()}</td><td class="num">${row.startTime === null || row.endTime === null ? '—' : `${((row.endTime - row.startTime) / 3600000).toFixed(1)}h`}</td><td class="num">${nf(row.tokens)}</td><td class="num">${cn(row.tokens)}</td><td class="num">${nf(row.messages)}</td><td>${esc(row.topModel.slice(row.topModel.indexOf('/') + 1))}${row.modelCount > 1 ? ` <span class="muted">+${row.modelCount - 1}</span>` : ''}</td>${snapshot.cost === null ? '' : `<td class="num">${row.costUsd === undefined ? '—' : `$${row.costUsd.toFixed(2)}`}</td>`}</tr>`
const sessionRows = snapshot.sessions.length === 0 ? '' : `<table><thead><tr><th>会话</th><th>路径</th><th class="num">开始</th><th class="num">时长</th><th class="num">tokens</th><th class="num">亿</th><th class="num">消息</th><th>主要模型</th>${snapshot.cost === null ? '' : '<th class="num">成本</th>'}</tr></thead><tbody>${snapshot.sessions.slice(0, SESSION_ROW_LIMIT).map(sessionRowOf).join('')}</tbody></table>`
  + (snapshot.sessions.length > SESSION_ROW_LIMIT
    ? `<details><summary class="more">展开全部 ${snapshot.sessions.length} 条（共 ${nf(snapshot.sessionTotal)} 个会话）</summary><table><tbody>${snapshot.sessions.slice(SESSION_ROW_LIMIT).map(sessionRowOf).join('')}</tbody></table></details>`
    : '')

const callRows = calls.items.map(r => `<tr><td class="muted">${esc(new Date(r.time).toLocaleString())}</td><td>${r.subtask ? '<span class="muted">sub </span>' : ''}${esc(r.model)}</td><td class="num">${nf(r.tokens.input)}</td><td class="num">${nf(r.tokens.output)}</td><td class="num">${nf(r.tokens.cacheRead)}</td><td class="num">${r.durationMs == null ? '—' : `${r.durationMs}ms`}</td><td>${esc(r.effort ?? '—')}</td></tr>`).join('')

const homeList = snapshot.homes.map(h => `<li>${h.current ? '★ ' : ''}${esc(h.home)} — ${h.sessions} sessions${h.error ? ` <span class="err">(${esc(h.error)})</span>` : ''}</li>`).join('')
const workspaceList = snapshot.workspaces.slice(0, 15).map(w => `<li>${w.sessions} · ${esc(w.path)}</li>`).join('')
const coverage = snapshot.coverage
const generated = new Date(snapshot.generatedAt).toLocaleString()
const reconciliation = projection === undefined
  ? '<span class="muted">（未找到 DSH 投影缓存，跳过对账）</span>'
  : (() => {
      const delta = snapshot.allTime.totals.tokens - projection.tokens
      const ratio = projection.tokens === 0 ? 0 : Math.abs(delta) / projection.tokens * 100
      const verdict = ratio < 1 ? '一致' : '有差异'
      return `DSH 自身投影缓存合计 <b>${nf(projection.tokens)}</b>（${compact(projection.tokens)}，${projection.sessions} 个会话）↔ 本插件折叠 <b>${nf(snapshot.allTime.totals.tokens)}</b>（${compact(snapshot.allTime.totals.tokens)}）：差 ${nf(delta)}（${ratio.toFixed(2)}%）→ <b>${verdict}</b>。小差异来自「重试步骤只保留最终用量」。`
    })()

const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>dsh-usage-unified · ${range}</title>
<style>
  :root{color-scheme:dark;--bg:#0f1115;--panel:#171a20;--panel2:#141822;--line:#262a33;--line2:#23272f;--text:#e8eaed;--muted:#8a9099;--muted2:#c3c8d0;--chip:#12151b;--stack:#2a2e37;--dayA:#368ef2;--dayB:#1068ca;--hover:#3b4252;--shadow:rgba(0,0,0,.38)}
  @media (prefers-color-scheme:light){:root:not([data-theme="dark"]){color-scheme:light;--bg:#f3f5f9;--panel:#ffffff;--panel2:#f7f9fc;--line:#e4e8ef;--line2:#eef1f6;--text:#151a21;--muted:#6b7280;--muted2:#374151;--chip:#f2f5f9;--stack:#e7ecf3;--dayA:#5aa7ff;--dayB:#1068ca;--hover:#c9d2e0;--shadow:rgba(15,23,42,.14)}}
  :root[data-theme="light"]{color-scheme:light;--bg:#f3f5f9;--panel:#ffffff;--panel2:#f7f9fc;--line:#e4e8ef;--line2:#eef1f6;--text:#151a21;--muted:#6b7280;--muted2:#374151;--chip:#f2f5f9;--stack:#e7ecf3;--dayA:#5aa7ff;--dayB:#1068ca;--hover:#c9d2e0;--shadow:rgba(15,23,42,.14)}
  :root[data-theme="dark"]{color-scheme:dark}
  body{margin:0;font:14px/1.55 -apple-system,'Segoe UI','Microsoft YaHei',sans-serif;background:var(--bg);color:var(--text)}
  header{padding:16px 22px;background:var(--panel);border-bottom:1px solid var(--line)}
  h1{font-size:17px;margin:0 0 4px}
  .sub{color:var(--muted);font-size:12px}
  .hwrap{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .themebar{display:inline-flex;gap:2px;padding:3px;border:1px solid var(--line);border-radius:10px;background:var(--panel2);flex:none}
  .themebar button{border:0;background:transparent;color:var(--muted);font:inherit;font-size:12px;padding:5px 12px;border-radius:7px;cursor:pointer;transition:background .15s ease,color .15s ease}
  .themebar button:hover{color:var(--text)}
  .themebar button[aria-pressed="true"]{background:var(--panel);color:var(--text);box-shadow:0 1px 3px var(--shadow)}
  main{max-width:1200px;margin:0 auto;padding:18px 22px 60px}
  h2{font-size:14px;margin:0 0 12px;font-weight:600}
  a{color:#1684ff}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:13px}
  .stat{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:16px;padding:15px 18px 16px;background:linear-gradient(165deg,var(--panel) 0%,var(--panel2) 100%);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
  .stat::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--accent)}
  .stat::after{content:'';position:absolute;right:-40px;top:-40px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 22%,transparent) 0%,transparent 70%);pointer-events:none}
  .stat:hover{transform:translateY(-3px);border-color:var(--hover);box-shadow:0 14px 32px var(--shadow)}
  .stat .k{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;letter-spacing:.02em}
  .stat .pin{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent);flex:none}
  .stat .val{margin-top:10px;font-size:31px;font-weight:800;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
  .stat .u{margin-left:6px;font-size:15px;font-weight:600;color:var(--muted2)}
  .stat .d{margin-top:7px;color:var(--muted);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .stat.small .val{font-size:17px;font-weight:700;letter-spacing:0;line-height:1.25;word-break:break-word}
  .stat.hero{grid-column:span 2;background:radial-gradient(130% 150% at 0% 0%,color-mix(in srgb,var(--accent) 18%,transparent) 0%,transparent 58%),linear-gradient(165deg,var(--panel),var(--panel2))}
  .stat.hero .val{font-size:46px}
  .spark{display:block;width:100%;height:52px;margin-top:12px;color:var(--accent);opacity:.85}
  @media(max-width:560px){.stat.hero{grid-column:auto}.stat.hero .val{font-size:38px}}
  section{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-top:14px}
  .day{display:flex;align-items:flex-end;gap:3px;height:100px}
  .day i{flex:1;background:linear-gradient(var(--dayA),var(--dayB));border-radius:2px 2px 0 0;min-height:2px}
  details.sec{border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-top:14px;background:var(--panel)}
  details.sec>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px}
  details.sec>summary::-webkit-details-marker{display:none}
  details.sec>summary::before{content:'▾';color:var(--muted);font-size:11px;transition:transform .15s ease}
  details.sec:not([open])>summary::before{transform:rotate(-90deg)}
  details.sec>summary h2{display:inline;margin:0}
  details.sec[open]>summary{margin-bottom:12px}
  details.sec:not([open])>summary{margin-bottom:0}
  details:not(.sec)>summary.more{cursor:pointer;color:#1684ff;font-size:12.5px;margin-top:8px}
  details:not(.sec)[open]>summary.more{margin-bottom:10px}
  h2 .muted{font-weight:400;font-size:12px;margin-left:6px}
  .legend{display:flex;gap:16px;color:var(--muted);font-size:12px;margin-bottom:10px;flex-wrap:wrap}
  .dot{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px}
  .seg[data-b=input]{background:#1684ff}.seg[data-b=cacheRead]{background:#22b8b5}.seg[data-b=cacheWrite]{background:#f59e0b}.seg[data-b=output]{background:#219653}
  .mrow{display:grid;gap:5px;margin-bottom:10px}.mhead{display:flex;justify-content:space-between;font-size:12.5px;gap:12px}
  .stack{display:flex;height:11px;border-radius:5px;overflow:hidden;background:var(--stack)}
  table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line2);white-space:nowrap}
  th{color:var(--muted);font-weight:500}.num{text-align:right;font-variant-numeric:tabular-nums}
  .muted{color:var(--muted)}.err{color:#ff7b72}
  ul{margin:0;padding-left:18px;color:var(--muted2)}.cols{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  .note{color:var(--muted);font-size:12px;margin-top:6px}
  .wrapped{display:block;width:100%;max-width:900px;margin:0 auto;border-radius:14px;border:1px solid var(--line)}
  .tscard{max-width:680px}
  .tscard svg{display:block;width:100%;height:auto;border-radius:12px}
  code{background:var(--chip);border:1px solid var(--line);padding:1px 5px;border-radius:5px;font-size:11.5px}
  .recon{margin-top:10px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--chip);color:var(--muted2);font-size:12.5px}
  @media(max-width:760px){.cols{grid-template-columns:1fr}}
</style><script>(function(){try{var m=localStorage.getItem('dsh-usage-theme');if(m==='light'||m==='dark'){document.documentElement.setAttribute('data-theme',m);}}catch(e){}})();</script></head><body>
<header><div class="hwrap"><div><h1>dsh-usage-unified · 本地静态报告（${rangeLabel}）</h1>
<div class="sub">生成于 ${esc(generated)} · home：${esc(CURRENT_HOME)} · 已索引 ${snapshot.status.indexed} 个会话 · <b>统计区间 ${esc(windowLabel)}${snapshot.range.from === '' ? '' : `（${esc(windowRange)}）`}</b> · 全时 ${esc(A.activeDays)} 个活跃日</div></div>
<div class="themebar" role="group" aria-label="主题"><button type="button" data-th="auto" aria-pressed="true">自动</button><button type="button" data-th="light" aria-pressed="false">浅色</button><button type="button" data-th="dark" aria-pressed="false">深色</button></div>
</div></header>
<main>
  <div class="stats">${statCards}</div>
  <div class="recon"><b>完整性对账（全时）：</b>${reconciliation}</div>

  <section><h2>总消耗换算（全时 · 多单位）</h2>
    <table><thead><tr><th>单位</th><th class="num">数值</th></tr></thead><tbody>${unitRows}</tbody></table>
    <div class="note">1 亿 = 100,000,000；1 B = 1,000,000,000（十亿）；1 万 = 10,000。</div></section>

  ${wrappedAt !== null ? `<section><h2>Tokscale Wrapped（嵌入你 star 的 <a href="https://github.com/junhoyeo/tokscale" style="color:#65a9ff">junhoyeo/tokscale</a>）</h2>
    <img class="wrapped" src="tokscale-wrapped.png" alt="tokscale wrapped" />
    <div class="note"><b>这张图生成于 ${esc(wrappedAt)}</b>，不是本次报告的数据——它是一次快照，重新生成需手动运行 <code>bun x tokscale@latest wrapped -c dsh --clients</code>（MIT © junhoyeo/tokscale）。tokscale 的 DSH 解析目前仍少算约 12%：会话目录同时存在两代日志时它取旧的那份，见 <a href="https://github.com/junhoyeo/tokscale/issues/1348">tokscale#1348</a>；修好后重新生成即可。</div></section>` : ''}

  ${tokscaleProfile}

  <section><h2>按 provider 汇总（${esc(windowLabel)}）</h2>
    <table><thead><tr><th>provider</th><th class="num">tokens</th><th class="num">亿</th><th class="num">—</th><th class="num">占比</th><th class="num">调用</th><th class="num">模型数</th></tr></thead>
    <tbody>${providerTable}</tbody></table>
    <div class="note">同一个 provider 的多个模型在这里合并；上方「模型用量」按单个模型拆分。command 与 command-vision 是两个 provider。</div></section>

  <section><h2>按天 Token（${snapshot.days.length} 天${range === 'all' ? '，全部' : ''}）</h2><div class="day">${dayBars}</div>
    <div class="note">${esc(snapshot.days[0]?.date ?? '')} → ${esc(snapshot.days[snapshot.days.length - 1]?.date ?? '')}</div></section>

  <details class="sec" open><summary><h2>模型用量<span class="muted">（占比 · 四桶 · 调用 · ${MODEL_ROW_LIMIT} 个起可展开）</span></h2></summary>
    <div class="legend"><span><i class="dot" style="background:#1684ff"></i>输入</span><span><i class="dot" style="background:#22b8b5"></i>缓存读</span><span><i class="dot" style="background:#f59e0b"></i>缓存写</span><span><i class="dot" style="background:#219653"></i>输出</span></div>
    ${modelRows || '<span class="muted">暂无数据</span>'}</details>

  <details class="sec" open><summary><h2>会话排行<span class="muted">（按 Token 排序 · 共 ${nf(snapshot.sessionTotal)} 个）</span></h2></summary>
    ${sessionRows || '<span class="muted">暂无数据</span>'}</details>

  <section><h2>调用明细（最多 100 条 / 共 ${nf(calls.total)}）</h2>
    ${calls.items.length ? `<table><thead><tr><th>时间</th><th>模型</th><th class="num">输入</th><th class="num">输出</th><th class="num">缓存读</th><th class="num">耗时</th><th>思考</th></tr></thead><tbody>${callRows}</tbody></table>` : '<span class="muted">暂无调用</span>'}</section>

  <section><h2>Homes / 工作区 / 覆盖度</h2><div class="cols">
    <div><strong>dsh homes</strong><ul>${homeList || '<li class="muted">无</li>'}</ul></div>
    <div><strong>工作区（按会话数）</strong><ul>${workspaceList || '<li class="muted">无</li>'}</ul></div>
  </div>
  <div class="note">步骤 ${nf(coverage.steps)} · 无计量 ${nf(coverage.stepsWithoutUsage)} · 重试 ${nf(coverage.retriedSteps)} · 仍在写入 ${nf(coverage.truncatedSessions)} · 跳过日志 ${nf(coverage.skippedArtifacts)}</div></section>
</main><script>(function(){var KEY='dsh-usage-theme';var root=document.documentElement;var bs=Array.prototype.slice.call(document.querySelectorAll('.themebar button'));function apply(m){if(m==='auto'){root.removeAttribute('data-theme');}else{root.setAttribute('data-theme',m);}bs.forEach(function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-th')===m));});}var saved='auto';try{saved=localStorage.getItem(KEY)||'auto';}catch(e){}apply(saved);bs.forEach(function(b){b.addEventListener('click',function(){var m=b.getAttribute('data-th');apply(m);try{localStorage.setItem(KEY,m);}catch(e){}});});})();</script></body></html>`

await writeFile(outPath, html, 'utf8')
console.log(`  wrote ${outPath} (${html.length} bytes)`)
store.dispose()
if (open) {
  spawn('cmd', ['/c', 'start', '', outPath], { detached: true, stdio: 'ignore' }).unref()
  console.log('  opened in default browser')
}
