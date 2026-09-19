/**
 * Real-data verification against this machine's actual dsh homes.
 *
 * Read-only. It exercises the full pipeline (discovery → walk → decode → fold
 * → snapshot/calls) over ~1,200 real session logs in both on-disk formats, and
 * cross-checks the folded token totals against a direct, independently coded
 * sum of the provider usage reports over the same decoded events.
 *
 * Usage: node scripts/verify-realdata.mjs
 */
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import {
  discoverDshHomes,
  walkSessionArtifacts,
  readArtifact,
  createFoldState,
  foldEvents,
  hasWork,
  UnifiedIndexStore,
} from '../lib/index.js'

const CURRENT_HOME = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

function fmt(value) {
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}

console.log('== discovery ==')
const discovery = await discoverDshHomes({ currentHome: CURRENT_HOME, extraRoots: [], osHome: homedir() })
for (const home of discovery.homes) console.log(`  ${home.current ? '*' : ' '} ${home.home}`)
for (const problem of discovery.problems) console.log(`  ! ${problem.home}: ${problem.error}`)
console.log(`  homes=${discovery.homes.length} problems=${discovery.problems.length}`)

console.log('\n== artifact walk (both on-disk formats) ==')
const byName = new Map()
let artifacts = 0
for (const home of discovery.homes) {
  for await (const artifact of walkSessionArtifacts(home)) {
    artifacts += 1
    const name = artifact.path.split(/[\\/]/).pop()
    byName.set(name, (byName.get(name) ?? 0) + 1)
  }
}
console.log(`  artifacts=${artifacts}`)
for (const [name, count] of [...byName].sort((a, b) => b[1] - a[1])) console.log(`  ${name}: ${count}`)

console.log('\n== single-pass decode + independent raw sum + fold ==')
let rawTokens = 0
let rawCalls = 0
let sessionsSeen = 0
let foldTokens = 0
let foldCalls = 0
let foldSessions = 0
const sampleHeaders = []
for (const home of discovery.homes) {
  for await (const artifact of walkSessionArtifacts(home)) {
    let read
    try {
      read = await readArtifact(artifact.path, 0)
    } catch {
      continue
    }
    if (read.foreign) continue
    sessionsSeen += 1
    if (sampleHeaders.length < 4 && !sampleHeaders.some(h => h.version === read.header.version)) {
      sampleHeaders.push({ version: read.header.version, events: read.events.length, name: artifact.path.split(/[\\/]/).pop() })
    }

    // Independent reconstruction of provider spend from the same events: one
    // final value per (turn, step) — the chunk→message duplicate replaces,
    // never adds — plus every compaction summary.
    const seed = read.header.seedLength ?? 0
    const perStep = new Map()
    for (const event of read.events) {
      if (event.seq < seed) continue
      let usage
      let key
      if (event.type === 'compaction/summary') {
        usage = event.data?.usage
        key = `c:${event.seq}`
      } else if (event.type === 'assistant/chunk' && event.data?.chunk?.type === 'usage') {
        usage = event.data.chunk.usage
        key = `${event.data.turn ?? -1}:${event.data.step ?? -1}`
      } else if (event.type === 'assistant/message') {
        usage = event.data?.usage
        key = `${event.data?.turn ?? -1}:${event.data?.step ?? -1}`
      } else {
        continue
      }
      if (usage === undefined) continue
      perStep.set(key, (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0))
    }
    for (const value of perStep.values()) rawTokens += value
    rawCalls += perStep.size

    const state = createFoldState(read.header, home.sessionsRoot)
    foldEvents(state, read.events, { tz: TZ, now: Date.now(), includeCompaction: true })
    if (!hasWork(state.fold)) continue
    foldSessions += 1
    foldTokens += state.fold.totals.input + state.fold.totals.output + state.fold.totals.cacheRead + state.fold.totals.cacheWrite
    foldCalls += Object.keys(state.fold.calls).length
  }
}
for (const sample of sampleHeaders) console.log(`  format v${sample.version}: ${sample.events} events (${sample.name})`)
console.log(`  sessions decoded=${sessionsSeen}`)
console.log(`  raw per-step usage: calls=${rawCalls} tokens=${fmt(rawTokens)}`)
console.log(`  folded sessions with work=${foldSessions} calls=${foldCalls} tokens=${fmt(foldTokens)}`)
console.log(`  delta raw - fold: ${fmt(rawTokens - foldTokens)} tokens`)

console.log('\n== UnifiedIndexStore (full pipeline + persistence) ==')
const cacheDir = await mkdtemp(join(tmpdir(), 'dsh-usage-verify-'))
const store = new UnifiedIndexStore({
  extraSessionRoots: [],
  includeCompaction: true,
  chunkYieldMs: 16,
  currentHome: CURRENT_HOME,
  cachePath: join(cacheDir, 'index-v1.json'),
  cacheWriteDelayMs: 1000,
})
const started = Date.now()
await store.refresh()
const elapsed = Date.now() - started
const status = store.status
console.log(`  status: phase=${status.phase} indexed=${status.indexed} total=${status.total} durable=${status.durable} (${elapsed} ms)`)

for (const range of ['all', '1d', '7d', '14d', '30d']) {
  const snapshot = store.snapshot({ range, scope: 'all' })
  const totals = snapshot.totals
  console.log(`  [${range}] tokens=${fmt(totals.tokens)} sessions=${totals.sessions} (+${totals.subagentSessions} sub) messages=${totals.messages} activeDays=${totals.activeDays} streak=${totals.currentStreak}/${totals.longestStreak} peakHour=${totals.peakHour}`)
  console.log(`         days=${snapshot.days.length} models=${snapshot.models.length} workspaces=${snapshot.workspaces.length} homes=${snapshot.homes.length}`)
}
const all = store.snapshot({ range: 'all', scope: 'all' })
console.log('  top models (all-time):')
for (const model of all.models.slice(0, 6)) {
  console.log(`    ${model.provider}/${model.model}: tokens=${fmt(model.tokens)} calls=${model.calls} share=${model.percent.toFixed(1)}% [in=${fmt(model.input)} cr=${fmt(model.cacheRead)} cw=${fmt(model.cacheWrite)} out=${fmt(model.output)}]`)
}
console.log('  top workspaces:')
for (const ws of all.workspaces.slice(0, 5)) console.log(`    ${ws.sessions}  ${ws.path}`)
console.log(`  coverage: steps=${all.coverage.steps} withoutUsage=${all.coverage.stepsWithoutUsage} retried=${all.coverage.retriedSteps} truncated=${all.coverage.truncatedSessions} skipped=${all.coverage.skippedArtifacts}`)

const calls = store.calls({ range: 'all', scope: 'all', page: 1, pageSize: 5, maxRecords: 10000 })
console.log(`  calls endpoint: total=${calls.total} indexReady=${calls.indexReady}`)
for (const row of calls.items) {
  console.log(`    ${new Date(row.time).toISOString()} ${row.provider}/${row.model} ${row.subtask ? '(sub) ' : ''}in=${fmt(row.tokens.input)} out=${fmt(row.tokens.output)} cr=${fmt(row.tokens.cacheRead)} effort=${row.effort ?? '-'} dur=${row.durationMs ?? '-'}ms`)
}

console.log('\n== persistence round-trip ==')
await store.flush()
const store2 = new UnifiedIndexStore({
  extraSessionRoots: [],
  includeCompaction: true,
  chunkYieldMs: 16,
  currentHome: CURRENT_HOME,
  cachePath: join(cacheDir, 'index-v1.json'),
  cacheWriteDelayMs: 1000,
})
await store2.load()
console.log(`  loaded from cache: indexed=${store2.status.indexed} tokens=${fmt(store2.snapshot({ range: 'all', scope: 'all' }).totals.tokens)}`)
store.dispose()
store2.dispose()

const rawMatch = Math.abs(rawTokens - foldTokens) < 1
// The store scan runs later than the single pass, so live-appending sessions
// legitimately add events; allow for that drift.
const storeMatch = Math.abs(foldTokens - all.totals.tokens) < Math.max(1, foldTokens * 0.005)
console.log('\n== result ==')
console.log(`  raw-vs-fold tokens match (${fmt(rawTokens)} vs ${fmt(foldTokens)}): ${rawMatch ? 'PASS' : 'DIFF ' + fmt(foldTokens - rawTokens)}`)
console.log(`  fold-vs-store tokens within live-append drift (${fmt(foldTokens)} vs ${fmt(all.totals.tokens)}): ${storeMatch ? 'PASS' : 'DIFF'}`)
console.log(`  machine-wide: homes=${discovery.homes.length} sessions=${status.indexed} formats=${[...byName.keys()].join(', ')}`)
