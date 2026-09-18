/**
 * Local smoke test — run the plugin's real host routes against the real
 * `~/.dsh` data, without installing anything into the DSH profile.
 *
 *   node scripts/local-smoke.mjs            one-shot self-test (start server,
 *                                           assert the routes, print, exit)
 *   node scripts/local-smoke.mjs --serve    keep the server up and open the
 *                                           built-in viewer at the printed URL
 *   node scripts/local-smoke.mjs --port 3142
 *   node scripts/local-smoke.mjs --fresh    ignore the cache and rescans
 *
 * The first cold scan of a large machine takes minutes; the index is cached in
 * `.smoke-cache/` so later runs start from the tail cursor.
 */
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { UnifiedIndexStore, DEFAULT_API_PATH, registerRoutes } from '../lib/index.js'

const args = process.argv.slice(2)
const hasFlag = name => args.includes(name)
const valueOf = (name, fallback) => {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback
}

const API = DEFAULT_API_PATH
const CURRENT_HOME = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const cachePath = join(projectRoot, '.smoke-cache', hasFlag('--fresh') ? `index-${Date.now()}.json` : 'index-v1.json')
const pricingPath = valueOf('--pricing', join(CURRENT_HOME, 'usage-unified', 'pricing.json'))
const serve = hasFlag('--serve')

const fmt = n => new Intl.NumberFormat('en-US').format(Math.round(n))
const port = await findFreePort(Number(valueOf('--port', '3131')))

console.log(`== local smoke ==`)
console.log(`  dsh home : ${CURRENT_HOME}`)
console.log(`  cache    : ${cachePath}`)
console.log(`  api      : ${API}`)
console.log('  indexing (first cold run can take minutes; cached runs are fast)…')

await mkdir(join(projectRoot, '.smoke-cache'), { recursive: true })
const store = new UnifiedIndexStore({
  extraSessionRoots: [],
  includeCompaction: true,
  chunkYieldMs: 16,
  currentHome: CURRENT_HOME,
  cachePath,
  pricingPath,
  cacheWriteDelayMs: 1000,
})
const started = Date.now()
await store.refresh()
console.log(`  indexed  : ${store.status.indexed} sessions in ${((Date.now() - started) / 1000).toFixed(1)}s`)

// Mount the same host routes the harness would, over a plain Node server.
let routeHandler
const webServer = {
  register(route) {
    routeHandler = route.handler
    return () => { routeHandler = undefined }
  },
}
registerRoutes(webServer, store, API)

const server = createServer((request, response) => {
  const url = request.url ?? '/'
  if (url.startsWith(API)) {
    if (routeHandler === undefined) { response.writeHead(503); response.end(); return }
    routeHandler(request, response)
    return
  }
  if (url === '/' || url.startsWith('/index')) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(viewerHtml(API))
    return
  }
  response.writeHead(404, { 'content-type': 'text/plain' })
  response.end('not found')
})
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(port, '127.0.0.1', resolve)
})
const base = `http://127.0.0.1:${port}`
console.log(`  server   : ${base}  (viewer at ${base}/)`)

// One-shot assertions against the real HTTP surface.
let failures = 0
async function check(label, fn) {
  try {
    const detail = await fn()
    console.log(`  PASS  ${label}${detail === undefined ? '' : ` — ${detail}`}`)
  } catch (error) {
    failures += 1
    console.log(`  FAIL  ${label} — ${error instanceof Error ? error.message : String(error)}`)
  }
}

const getJson = async (path) => {
  const response = await fetch(base + path)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

await check('GET /snapshot?range=all', async () => {
  const snapshot = await getJson(`${API}/snapshot?range=all`)
  if (snapshot.version !== 1) throw new Error('wire version mismatch')
  if (!(snapshot.totals.tokens > 0)) throw new Error('no tokens counted')
  return `${fmt(snapshot.totals.tokens)} tokens, ${snapshot.totals.sessions} sessions (+${snapshot.totals.subagentSessions} sub), ${snapshot.models.length} models, ${snapshot.homes.length} home(s)`
})
await check('GET /snapshot?range=7d', async () => {
  const snapshot = await getJson(`${API}/snapshot?range=7d`)
  return `${snapshot.days.length} days, peakHour=${snapshot.totals.peakHour}, streak=${snapshot.totals.currentStreak}/${snapshot.totals.longestStreak}`
})
await check('GET /snapshot?scope=main', async () => {
  const snapshot = await getJson(`${API}/snapshot?range=all&scope=main`)
  if (snapshot.totals.subagentSessions !== 0) throw new Error('subagents leaked into main scope')
  return `${snapshot.totals.sessions} main sessions`
})
await check('GET /calls?range=all', async () => {
  const page = await getJson(`${API}/calls?range=all&pageSize=3`)
  if (page.items.length === 0) throw new Error('no call rows')
  return `total=${page.total}, first=${page.items[0].provider}/${page.items[0].model}`
})
await check('session ranking + drill-down', async () => {
  const snapshot = await getJson(`${API}/snapshot?range=all`)
  const sessions = snapshot.sessions
  if (!Array.isArray(sessions) || sessions.length === 0) throw new Error('no session ranking')
  if (!(snapshot.sessionTotal >= sessions.length)) throw new Error('sessionTotal below the page size')
  const top = sessions[0]
  if (!(top.tokens > 0)) throw new Error('top session has no tokens')
  const drained = sessions.some(row => row.tokens < (sessions[sessions.length - 1]?.tokens ?? 0))
  if (drained) throw new Error('session ranking is not sorted by tokens')
  const page = await getJson(`${API}/calls?range=all&session=${encodeURIComponent(top.sessionId)}&pageSize=5`)
  if (page.items.length === 0) throw new Error('drill-down returned no calls')
  const foreign = page.items.find(item => item.sessionId.replace(/^session-/, '') !== top.sessionId.replace(/^session-/, ''))
  if (foreign !== undefined) throw new Error(`drill-down leaked session ${foreign.sessionId}`)
  const cost = snapshot.cost === null ? 'no pricing table' : `cost ≈$${snapshot.cost.total.toFixed(2)} (${snapshot.cost.source})`
  return `${sessions.length}/${snapshot.sessionTotal} ranked, top=${top.tokens} tokens, ${cost}`
})
await check('GET /export.csv', async () => {
  const response = await fetch(`${base}${API}/export.csv?range=30d`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const text = await response.text()
  const lines = text.split('\r\n').length
  return `${lines} CSV lines`
})
await check('GET /export.json', async () => {
  const response = await fetch(`${base}${API}/export.json?range=30d`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return `${String(response.headers.get('content-disposition'))}`
})
await check('unknown path → 404', async () => {
  const response = await fetch(`${base}${API}/nope`)
  if (response.status !== 404) throw new Error(`HTTP ${response.status}`)
})

console.log(failures === 0 ? '\n== result: ALL PASS ==' : `\n== result: ${failures} FAILED ==`)

if (serve) {
  console.log(`\nViewer running. Open ${base}/  (Ctrl+C to stop)`)
} else {
  server.close()
  // Persist the index before leaving so the next run loads from the cache.
  await store.flush()
  store.dispose()
  process.exitCode = failures === 0 ? 0 : 1
}

/** Probe upward from `start` for a free loopback port. */
async function findFreePort(start) {
  for (let candidate = start; candidate < start + 50; candidate++) {
    const ok = await new Promise(resolve => {
      const probe = createServer()
      probe.once('error', () => resolve(false))
      probe.listen(candidate, '127.0.0.1', () => probe.close(() => resolve(true)))
    })
    if (ok) return candidate
  }
  throw new Error(`no free port near ${start}`)
}

/** A tiny standalone viewer: same routes, no DSH UI required. */
function viewerHtml(apiPath) {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>dsh-usage-unified — local smoke</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;font:14px/1.5 -apple-system,'Segoe UI','Microsoft YaHei',sans-serif;background:#0f1115;color:#e8eaed}
  header{position:sticky;top:0;display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:14px 20px;background:#171a20;border-bottom:1px solid #2a2e37}
  h1{font-size:16px;margin:0 12px 0 0}
  button{cursor:pointer;border:1px solid #2a2e37;background:#1e222a;color:#cfd3da;border-radius:8px;padding:5px 12px}
  button[aria-pressed=true]{background:#1677ff;border-color:#1677ff;color:#fff}
  main{max-width:1180px;margin:0 auto;padding:18px 20px 60px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
  .card{background:#171a20;border:1px solid #262a33;border-radius:12px;padding:12px 14px}
  .card .l{color:#8a9099;font-size:12px}.card .v{font-size:22px;font-weight:700;margin-top:6px}
  section{background:#171a20;border:1px solid #262a33;border-radius:12px;padding:14px 16px;margin-top:14px}
  h2{font-size:14px;margin:0 0 12px;font-weight:600}
  .bars{display:grid;gap:9px}.row{display:grid;gap:5px}
  .head{display:flex;justify-content:space-between;font-size:12px}.stack{display:flex;height:11px;border-radius:5px;overflow:hidden;background:#2a2e37}
  .seg[data-b=input]{background:#1684ff}.seg[data-b=cacheRead]{background:#22b8b5}.seg[data-b=cacheWrite]{background:#f59e0b}.seg[data-b=output]{background:#219653}
  .legend{display:flex;gap:16px;color:#8a9099;font-size:12px;margin-bottom:10px}
  .dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px}
  .day{display:flex;align-items:flex-end;gap:3px;height:90px}
  .day i{flex:1;background:#1684ff;border-radius:2px 2px 0 0;min-height:2px}
  table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #23272f;white-space:nowrap}
  th{color:#8a9099;font-weight:500}
  .muted{color:#8a9099}.err{color:#ff7b72}
</style></head><body>
<header><h1>dsh-usage-unified · local</h1><div id="ranges"></div><div id="status" class="muted"></div></header>
<main>
  <div class="cards" id="cards"></div>
  <section><h2>按天 Token（近 30 天）</h2><div class="day" id="day"></div></section>
  <section><h2>模型四桶拆分</h2><div class="legend"><span><i class="dot" style="background:#1684ff"></i>输入</span><span><i class="dot" style="background:#22b8b5"></i>缓存读</span><span><i class="dot" style="background:#f59e0b"></i>缓存写</span><span><i class="dot" style="background:#219653"></i>输出</span></div><div class="bars" id="models"></div></section>
  <section><h2>调用明细（最新 20 条）</h2><div id="calls"></div></section>
  <section><h2>Homes / 覆盖度</h2><div id="foot" class="muted"></div></section>
</main>
<script>
const API=${JSON.stringify(apiPath)};
const $=s=>document.querySelector(s);
const nf=n=>new Intl.NumberFormat('en-US').format(Math.round(n));
const compact=n=>n>=1e9?(n/1e9).toFixed(2)+'B':n>=1e6?(n/1e6).toFixed(2)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':String(Math.round(n));
let range='30d';
const RANGES=[['7d','近7天'],['30d','近30天'],['all','全部']];
function renderRanges(){$('#ranges').innerHTML=RANGES.map(([v,l])=>'<button data-r="'+v+'" aria-pressed="'+(v===range)+'">'+l+'</button>').join('');$('#ranges').querySelectorAll('button').forEach(b=>b.onclick=()=>{range=b.dataset.r;renderRanges();load()})}
async function load(){
  $('#status').textContent='loading…';
  try{
    const s=await (await fetch(API+'/snapshot?range='+range)).json();
    const t=s.totals;
    const cards=[['总 Tokens',compact(t.tokens),'含缓存读'],['会话',nf(t.sessions),t.subagentSessions?'含 '+t.subagentSessions+' 子会话':''],['消息',nf(t.messages),''],['活跃天数',nf(t.activeDays),''],['当前连续',t.currentStreak+' 天',''],['最长连续',t.longestStreak+' 天',''],['高峰时段',(t.peakHour??'—')+':00',''],['最常用模型',s.mostUsedModel?s.mostUsedModel.model:'—',s.mostUsedModel?s.mostUsedModel.provider:'']];
    $('#cards').innerHTML=cards.map(([l,v,d])=>'<div class="card"><div class="l">'+l+'</div><div class="v">'+v+'</div><div class="l">'+d+'</div></div>').join('');
    const days=s.days.slice(-30),max=Math.max(1,...days.map(d=>d.tokens));
    $('#day').innerHTML=days.map(d=>'<i style="height:'+(d.tokens/max*100)+'%" title="'+d.date+': '+nf(d.tokens)+' tokens"></i>').join('');
    $('#models').innerHTML=s.models.slice(0,10).map(m=>{const segs=['input','cacheRead','cacheWrite','output'].map(b=>m[b]>0?'<span class="seg" data-b="'+b+'" style="width:'+(m[b]/m.tokens*100)+'%"></span>':'').join('');return '<div class="row"><div class="head"><span>'+m.model+' · '+m.provider+'</span><span>'+compact(m.tokens)+'</span></div><div class="stack">'+segs+'</div></div>'}).join('')||'<span class="muted">暂无数据</span>';
    const p=await (await fetch(API+'/calls?range='+range+'&pageSize=20')).json();
    $('#calls').innerHTML=p.items.length?('<table><thead><tr><th>时间</th><th>模型</th><th>输入</th><th>输出</th><th>缓存读</th><th>耗时</th></tr></thead><tbody>'+p.items.map(r=>'<tr><td class="muted">'+new Date(r.time).toLocaleString()+'</td><td>'+(r.subtask?'<span class="muted">sub </span>':'')+r.model+'</td><td>'+nf(r.tokens.input)+'</td><td>'+nf(r.tokens.output)+'</td><td>'+nf(r.tokens.cacheRead)+'</td><td>'+(r.durationMs==null?'—':r.durationMs+'ms')+'</td></tr>').join('')+'</tbody></table>')+'<span class="muted">暂无调用</span>';
    const homes=s.homes.filter(h=>!h.error).map(h=>h.home).join(', ');
    $('#foot').textContent='homes: '+homes+' · 步骤 '+nf(s.coverage.steps)+'（无计量 '+nf(s.coverage.stepsWithoutUsage)+'，重试 '+nf(s.coverage.retriedSteps)+'，跳过日志 '+nf(s.coverage.skippedArtifacts)+'） · '+s.status.indexed+' 会话已索引';
    $('#status').textContent=s.status.phase+' · '+new Date(s.generatedAt).toLocaleTimeString();
  }catch(e){$('#status').innerHTML='<span class="err">'+e.message+'</span>'}
}
renderRanges();load();
</script></body></html>`
}
