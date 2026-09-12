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
import { mkdir, readdir, readFile, writeFile, access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { UnifiedIndexStore } from '../lib/index.js'

const args = process.argv.slice(2)
const valueOf = (name, fallback) => {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback
}
const requested = valueOf('--range', 'all')
const range = ['all', '30d', '7d'].includes(requested) ? requested : 'all'
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
  cacheWriteDelayMs: 1000,
})
const started = Date.now()
await store.refresh()
const snapshot = store.snapshot({ range, scope: 'all' })
const heatmap = store.snapshot({ range: 'year', scope: 'all' })
const calls = store.calls({ range, scope: 'all', page: 1, pageSize: 100, maxRecords: 2000 })
const t = snapshot.totals
if (snapshot.status.indexed > 0) await store.flush()
console.log(`  indexed ${snapshot.status.indexed} sessions in ${((Date.now() - started) / 1000).toFixed(1)}s`)

const projection = await readDshProjection(CURRENT_HOME)
if (projection !== undefined) {
  const delta = snapshot.allTime.totals.tokens - projection.tokens
  console.log(`  dsh projection=${projection.tokens} plugin=${snapshot.allTime.totals.tokens} delta=${delta}`)
}

// Optional: the tokscale Wrapped image, when scripts/tokscale-export.mjs +
// `tokscale wrapped` have been run.
let hasWrapped = false
try {
  await access(join(projectRoot, 'tokscale-wrapped.png'))
  hasWrapped = true
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

const cardDefs = [
  { label: '总 Tokens', value: (A.tokens / 1e8).toFixed(2), unit: '亿', detail: `${nf(A.tokens)} · ${compact(A.tokens)} · 含缓存读`, accent: '#1684ff', hero: true },
  { label: '会话', value: nf(A.sessions), unit: '个', detail: `另含 ${nf(A.subagentSessions)} 个子会话`, accent: '#9368ef' },
  { label: '消息', value: compact(A.messages), unit: '', detail: `人工 ${compact(A.humanMessages)} · 助手 ${compact(A.assistantMessages)}`, accent: '#219653' },
  { label: '工具结果', value: compact(A.toolResults), unit: '', detail: '', accent: '#22b8b5' },
  { label: '活跃天数', value: nf(A.activeDays), unit: '天', detail: '', accent: '#f59e0b' },
  { label: '当前连续', value: nf(A.currentStreak), unit: '天', detail: '', accent: '#ef5da8' },
  { label: '最长连续', value: nf(A.longestStreak), unit: '天', detail: '', accent: '#a479e2' },
  { label: '高峰时段', value: hour(A.peakHour), unit: '', detail: '', accent: '#2da2bb' },
  {
    label: '最常用模型',
    value: snapshot.allTime.mostUsedModel ? snapshot.allTime.mostUsedModel.model : '—',
    unit: '',
    detail: snapshot.allTime.mostUsedModel ? snapshot.allTime.mostUsedModel.provider : '',
    accent: '#65a9ff',
    small: true,
  },
]
const statCards = cardDefs.map(card => `<div class="stat${card.hero ? ' hero' : ''}${card.small ? ' small' : ''}" style="--accent:${card.accent}"><div class="k"><i class="pin"></i>${esc(card.label)}</div><div class="val">${esc(card.value)}${card.unit ? `<span class="u">${esc(card.unit)}</span>` : ''}</div>${card.detail ? `<div class="d">${esc(card.detail)}</div>` : ''}${card.hero ? sparkSvg : ''}</div>`).join('')
// The range cards when the range is bounded, so the page never hides them.
const rangeCards = range === 'all' ? '' : `<div class="stats" style="margin-top:12px">${[
  { label: '本区间 Tokens', value: cn(t.tokens), detail: nf(t.tokens), accent: '#65a9ff' },
  { label: '本区间会话', value: nf(t.sessions), detail: '', accent: '#9368ef' },
  { label: '本区间消息', value: nf(t.messages), detail: '', accent: '#219653' },
].map(card => `<div class="stat" style="--accent:${card.accent}"><div class="k"><i class="pin"></i>${esc(card.label)}</div><div class="val">${esc(card.value)}</div>${card.detail ? `<div class="d">${esc(card.detail)}</div>` : ''}</div>`).join('')}</div>`

const maxDay = Math.max(1, ...snapshot.days.map(d => d.tokens))
const dayBars = snapshot.days.map(d => `<i style="height:${(d.tokens / maxDay * 100).toFixed(2)}%" title="${esc(d.date)}: ${nf(d.tokens)} tokens · ${d.calls} calls"></i>`).join('')
const maxHeat = Math.max(1, ...heatmap.days.map(d => d.tokens))
const heatCells = heatmap.days.map(d => {
  const level = d.tokens === 0 ? 0 : Math.max(1, Math.min(5, Math.ceil(Math.log1p(d.tokens) / Math.log1p(maxHeat) * 5)))
  return `<span class="cell" data-level="${level}" title="${esc(d.date)}: ${nf(d.tokens)} tokens"></span>`
}).join('')

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
const modelRows = snapshot.models.slice(0, 15).map(m => {
  const segs = ['input', 'cacheRead', 'cacheWrite', 'output'].map(b => m[b] > 0 ? `<span class="seg" data-b="${b}" style="width:${(m[b] / m.tokens * 100).toFixed(2)}%" title="${bucketLabel[b]} ${nf(m[b])}"></span>` : '').join('')
  return `<div class="mrow"><div class="mhead"><span>${esc(m.model)} · ${esc(m.provider)}</span><span>${cn(m.tokens)} · ${compact(m.tokens)} · ${m.calls} 次 · ${m.percent.toFixed(1)}%</span></div><div class="stack">${segs}</div></div>`
}).join('')

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
  :root{color-scheme:dark;--bg:#0f1115;--panel:#171a20;--panel2:#141822;--line:#262a33;--line2:#23272f;--text:#e8eaed;--muted:#8a9099;--muted2:#c3c8d0;--chip:#12151b;--stack:#2a2e37;--dayA:#368ef2;--dayB:#1068ca;--h0:#242832;--h1:#173b63;--h2:#1d568f;--h3:#2173bd;--h4:#2b91e9;--h5:#67b7ff;--hover:#3b4252;--shadow:rgba(0,0,0,.38)}
  @media (prefers-color-scheme:light){:root:not([data-theme="dark"]){color-scheme:light;--bg:#f3f5f9;--panel:#ffffff;--panel2:#f7f9fc;--line:#e4e8ef;--line2:#eef1f6;--text:#151a21;--muted:#6b7280;--muted2:#374151;--chip:#f2f5f9;--stack:#e7ecf3;--dayA:#5aa7ff;--dayB:#1068ca;--h0:#e9eef4;--h1:#d6e9ff;--h2:#a9d1ff;--h3:#72b2ff;--h4:#368ef2;--h5:#1068ca;--hover:#c9d2e0;--shadow:rgba(15,23,42,.14)}}
  :root[data-theme="light"]{color-scheme:light;--bg:#f3f5f9;--panel:#ffffff;--panel2:#f7f9fc;--line:#e4e8ef;--line2:#eef1f6;--text:#151a21;--muted:#6b7280;--muted2:#374151;--chip:#f2f5f9;--stack:#e7ecf3;--dayA:#5aa7ff;--dayB:#1068ca;--h0:#e9eef4;--h1:#d6e9ff;--h2:#a9d1ff;--h3:#72b2ff;--h4:#368ef2;--h5:#1068ca;--hover:#c9d2e0;--shadow:rgba(15,23,42,.14)}
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
  .heat{display:grid;grid-template-columns:repeat(53,1fr);grid-auto-flow:column;grid-template-rows:repeat(7,1fr);gap:3px}
  .cell{width:100%;aspect-ratio:1;border-radius:2px;background:var(--h0)}
  .cell[data-level="1"]{background:var(--h1)}.cell[data-level="2"]{background:var(--h2)}.cell[data-level="3"]{background:var(--h3)}.cell[data-level="4"]{background:var(--h4)}.cell[data-level="5"]{background:var(--h5)}
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
<header><div class="hwrap"><div><h1>dsh-usage-unified · 本地静态报告（${range === 'all' ? '全部时间' : range}）</h1>
<div class="sub">生成于 ${esc(generated)} · home：${esc(CURRENT_HOME)} · 已索引 ${snapshot.status.indexed} 个会话 · 数据区间 ${esc(snapshot.allTime.totals.activeDays)} 个活跃日</div></div>
<div class="themebar" role="group" aria-label="主题"><button type="button" data-th="auto" aria-pressed="true">自动</button><button type="button" data-th="light" aria-pressed="false">浅色</button><button type="button" data-th="dark" aria-pressed="false">深色</button></div>
</div></header>
<main>
  <div class="stats">${statCards}</div>
  ${rangeCards}
  <div class="recon"><b>完整性对账：</b>${reconciliation}</div>

  <section><h2>总消耗换算（全部时间 · 多单位）</h2>
    <table><thead><tr><th>单位</th><th class="num">数值</th></tr></thead><tbody>${unitRows}</tbody></table>
    <div class="note">1 亿 = 100,000,000；1 B = 1,000,000,000（十亿）；1 万 = 10,000。</div></section>

  ${hasWrapped ? `<section><h2>Tokscale Wrapped（嵌入你 star 的 <a href="https://github.com/junhoyeo/tokscale" style="color:#65a9ff">junhoyeo/tokscale</a>）</h2>
    <img class="wrapped" src="tokscale-wrapped.png" alt="tokscale wrapped" />
    <div class="note">由 <code>bun x tokscale@latest wrapped -c dsh --clients</code> 生成 · MIT © junhoyeo/tokscale。数据源为本机 DSH 会话（完整版）；tokscale 原生 DSH 解析只认旧文件名 <code>session.jsonl.zstd</code>，会漏掉 <code>session.v3.*</code>（约 40%），所以本仓库先用 <code>scripts/tokscale-export.mjs</code> 导出成它能读的布局再生成。</div></section>` : ''}

  ${tokscaleProfile}

  <section><h2>按 provider 汇总（全部时间）</h2>
    <table><thead><tr><th>provider</th><th class="num">tokens</th><th class="num">亿</th><th class="num">—</th><th class="num">占比</th><th class="num">调用</th><th class="num">模型数</th></tr></thead>
    <tbody>${providerTable}</tbody></table>
    <div class="note">同一个 provider 的多个模型在这里合并；上方「模型四桶」按单个模型拆分。command 与 command-vision 是两个 provider。</div></section>

  <section><h2>按天 Token（${snapshot.days.length} 天${range === 'all' ? '，全部' : ''}）</h2><div class="day">${dayBars}</div>
    <div class="note">${esc(snapshot.days[0]?.date ?? '')} → ${esc(snapshot.days[snapshot.days.length - 1]?.date ?? '')}</div></section>

  <section><h2>活跃热力图（近 53 周）</h2><div class="heat">${heatCells}</div>
    <div class="note">颜色越深 Token 越多（${heatmap.days.length} 天）。</div></section>

  <section><h2>模型四桶拆分（Top 15）</h2>
    <div class="legend"><span><i class="dot" style="background:#1684ff"></i>输入</span><span><i class="dot" style="background:#22b8b5"></i>缓存读</span><span><i class="dot" style="background:#f59e0b"></i>缓存写</span><span><i class="dot" style="background:#219653"></i>输出</span></div>
    ${modelRows || '<span class="muted">暂无数据</span>'}</section>

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
