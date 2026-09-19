/**
 * Cross-session aggregation: the unified snapshot and the call-detail rows.
 *
 * Two paths on purpose. An all-time view reads each session's authoritative
 * counters, so tokens whose timestamps failed the clock-skew guard are still
 * counted. A bounded range can only be assembled from the day slices, so those
 * tokens necessarily drop out of it — an all-time total may therefore exceed
 * the sum of its days. That is the honest behaviour: a token with an
 * implausible timestamp belongs in a total but not on a calendar.
 *
 * Streaks are always all-time scans: a "current streak" is not a property of
 * the selected window.
 *
 * @module dsh-usage-unified/aggregate
 */

import { hasWork, isSubtask, todayKey, UNKNOWN_MODEL_KEY, type FoldCall, type SessionFold } from './fold.ts'
import {
  addTally,
  totalOf,
  zeroBuckets,
  zeroTally,
  type Buckets,
  type CallRecord,
  type Coverage,
  type DayRange,
  type DayStats,
  type ModelStats,
  type ModelTally,
  type RangeId,
  type SessionStats,
  type TaskScope,
  type TimeBucket,
  type TokenBreakdown,
  type TokenTotals,
} from './types.ts'

const DAY_MS = 86_400_000

/** How many session rows a snapshot carries; the panel renders fewer. */
export const SESSION_LIMIT = 100

/** Same session across format generations: v3 prefixes the header id. */
export function sessionKey(id: string): string {
  return id.replace(/^session-/, '')
}

/** How many days each fixed-width range covers, today included. */
const RANGE_DAYS: Record<DayRange, number> = { '1d': 1, '7d': 7, '14d': 14, '30d': 30 }

/** Today-inclusive day bounds for a fixed-width range. */
export function rangeBounds(range: DayRange, today: string): { from: string; to: string } {
  return { from: shiftDay(today, -(RANGE_DAYS[range] - 1)), to: today }
}

/**
 * Resolve the inclusive day bounds a request asks for.
 *
 * A `from` without a `to` is the start-to-now mode: the window ends at today and
 * therefore keeps extending as the calendar moves, rather than freezing on the
 * day the link was made. `to` on its own is rejected upstream — an upper bound
 * with no lower one has no sane default.
 *
 * @param input - the requested range plus whichever explicit bounds arrived.
 */
export function resolveBounds(input: {
  range: RangeId
  today: string
  from?: string
  to?: string
}): { from: string; to: string } {
  if (input.from !== undefined) return { from: input.from, to: input.to ?? input.today }
  // `custom` without a `from` is malformed; all-time is the closest honest answer.
  if (input.range === 'all' || input.range === 'custom') return { from: '', to: input.today }
  return rangeBounds(input.range, input.today)
}

/**
 * Noon-UTC anchor for a local calendar day. Adjacency is tested at noon so a
 * DST transition cannot break a streak that never broke.
 *
 * @param day - 'YYYY-MM-DD'.
 */
export function dayAnchor(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1, 12)
}

/** Shift a 'YYYY-MM-DD' key by whole days. */
export function shiftDay(day: string, days: number): string {
  return new Date(dayAnchor(day) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Active-day count and the two streak lengths. */
export interface Streaks {
  active: number
  current: number
  longest: number
}

/**
 * Compute streaks over ascending, de-duplicated day keys.
 *
 * The current streak counts only when it reaches today or yesterday —
 * otherwise a run that ended last month would read as "current".
 */
export function streaks(sortedDays: readonly string[], today: string): Streaks {
  if (sortedDays.length === 0) return { active: 0, current: 0, longest: 0 }
  let longest = 1
  let run = 1
  for (let i = 1; i < sortedDays.length; i++) {
    const previous = sortedDays[i - 1]
    const day = sortedDays[i]
    if (previous === undefined || day === undefined) continue
    run = dayAnchor(day) - dayAnchor(previous) === DAY_MS ? run + 1 : 1
    if (run > longest) longest = run
  }
  const lastDay = sortedDays[sortedDays.length - 1]
  if (lastDay === undefined) return { active: sortedDays.length, current: 0, longest }
  const gap = dayAnchor(today) - dayAnchor(lastDay)
  let current = 0
  if (gap === 0 || gap === DAY_MS) {
    current = 1
    for (let i = sortedDays.length - 1; i > 0; i--) {
      const previous = sortedDays[i - 1]
      const day = sortedDays[i]
      if (previous === undefined || day === undefined) break
      if (dayAnchor(day) - dayAnchor(previous) !== DAY_MS) break
      current += 1
    }
  }
  return { active: sortedDays.length, current, longest }
}

/**
 * Same session id under two homes (a copied directory) is one session, and a
 * session migrated across format generations keeps its identity even though the
 * header id gains a `session-` prefix in v3 — so the comparison key is
 * normalized. Keeps the copy that saw the most activity.
 */
export function dedupeFolds(folds: readonly SessionFold[]): SessionFold[] {
  const best = new Map<string, SessionFold>()
  for (const fold of folds) {
    const key = fold.id.replace(/^session-/, '')
    const previous = best.get(key)
    if (previous === undefined) {
      best.set(key, fold)
      continue
    }
    const newer = (fold.lastTime ?? 0) > (previous.lastTime ?? 0)
    const richer = (fold.lastTime ?? 0) === (previous.lastTime ?? 0) && fold.steps > previous.steps
    if (newer || richer) best.set(key, fold)
  }
  return [...best.values()]
}

function zeroBreakdown(): TokenBreakdown {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
}

function zeroTotals(): TokenTotals {
  return {
    tokens: 0,
    sessions: 0,
    subagentSessions: 0,
    messages: 0,
    humanMessages: 0,
    assistantMessages: 0,
    toolResults: 0,
    activeDays: 0,
    currentStreak: 0,
    longestStreak: 0,
    peakHour: null,
    ...zeroBreakdown(),
  }
}

function addBreakdown(target: TokenBreakdown, buckets: Buckets, reasoning: number): void {
  target.input += buckets.input
  target.output += buckets.output
  target.cacheRead += buckets.cacheRead
  target.cacheWrite += buckets.cacheWrite
  target.reasoning += reasoning
}

function modelStatsFromTallies(tallies: Map<string, ModelTally>, totalTokens: number): ModelStats[] {
  const rows: ModelStats[] = []
  for (const [key, tally] of tallies) {
    // A model that only ever appeared on a zero-usage sample (a display name
    // leaking through, a failed request) is noise in a usage panel, and it
    // would otherwise be reported as an unpriced row.
    if (totalOf(tally.buckets) === 0) continue
    const slash = key.indexOf('/')
    rows.push({
      key,
      provider: slash < 0 ? key : key.slice(0, slash),
      model: slash < 0 ? key : key.slice(slash + 1),
      calls: tally.samples,
      tokens: totalOf(tally.buckets),
      percent: 0,
      input: tally.buckets.input,
      output: tally.buckets.output,
      cacheRead: tally.buckets.cacheRead,
      cacheWrite: tally.buckets.cacheWrite,
      reasoning: tally.reasoning,
    })
  }
  rows.sort((a, b) => b.tokens - a.tokens || b.calls - a.calls || a.key.localeCompare(b.key))
  for (const row of rows) row.percent = totalTokens === 0 ? 0 : row.tokens / totalTokens * 100
  return rows
}

/** The query a snapshot answers. */
export interface SnapshotQuery {
  /** Inclusive lower day bound; ignored when `range` is 'all'. */
  from: string
  /** Inclusive upper day bound; ignored when `range` is 'all'. */
  to: string
  timeZone: string
  range: RangeId
  scope: TaskScope
  workspace?: string
  /** Reference time; defaults to now. */
  now?: number
}

/** The snapshot body before the store attaches status/homes/coverage extras. */
export interface AggregateResult {
  tz: string
  range: RangeId
  from: string
  to: string
  totals: TokenTotals
  allTime: { totals: TokenTotals; mostUsedModel: ModelStats | null }
  mostUsedModel: ModelStats | null
  days: DayStats[]
  hours: TimeBucket[]
  models: ModelStats[]
  workspaces: { path: string; sessions: number }[]
  sessions: SessionStats[]
  sessionTotal: number
  coverage: Omit<Coverage, 'skippedArtifacts'>
}

/** Case-insensitive comparison on Windows; exact elsewhere. */
function samePath(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function inScope(fold: SessionFold, query: SnapshotQuery): boolean {
  if (query.workspace !== undefined) {
    if (fold.cwd === undefined || !samePath(fold.cwd, query.workspace)) return false
  }
  if (query.scope === 'main' && isSubtask(fold)) return false
  if (query.scope === 'subtasks' && !isSubtask(fold)) return false
  return true
}

function datesBetween(from: string, to: string): string[] {
  const days: string[] = []
  const cursor = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cursor <= end && days.length < 4000) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

function emptyHours(): TimeBucket[] {
  return Array.from({ length: 24 }, () => ({ tokens: 0, messages: 0 }))
}

function addHours(target: TimeBucket[], slice: { hours: Record<string, TimeBucket> }): void {
  for (const [hourKey, activity] of Object.entries(slice.hours)) {
    const hour = target[Number(hourKey)]
    if (hour === undefined) continue
    hour.tokens += activity.tokens
    hour.messages += activity.messages
  }
}

/** Local hour 0-23 with the most messages, tie-broken by tokens; null when empty. */
export function peakHourOf(hours: readonly TimeBucket[]): number | null {
  let peak: number | null = null
  for (let hour = 0; hour < 24; hour++) {
    const candidate = hours[hour]
    if (candidate === undefined) continue
    if (candidate.messages === 0 && candidate.tokens === 0) continue
    const best = peak === null ? undefined : hours[peak]
    if (best === undefined
      || candidate.messages > best.messages
      || (candidate.messages === best.messages && candidate.tokens > best.tokens)) {
      peak = hour
    }
  }
  return peak
}

/**
 * Rank sessions by what they spent inside the window.
 *
 * All-time reads each fold's authoritative counters; a bounded range sums the
 * in-range day slices, so a session that only touched part of the window is
 * ranked by that part. Sessions with no activity in the window are dropped.
 */
export function sessionRowsFor(
  scoped: readonly SessionFold[],
  all: boolean,
  inRange: (day: string) => boolean,
): { rows: SessionStats[]; total: number } {
  const rows: SessionStats[] = []
  for (const fold of scoped) {
    const tallies = new Map<string, ModelTally>()
    let tokens = 0
    let input = 0
    let output = 0
    let cacheRead = 0
    let cacheWrite = 0
    let reasoning = 0
    let messages = 0
    let calls = 0

    if (all) {
      tokens = totalOf(fold.totals)
      input = fold.totals.input
      output = fold.totals.output
      cacheRead = fold.totals.cacheRead
      cacheWrite = fold.totals.cacheWrite
      reasoning = fold.reasoningTokens
      messages = fold.humanMessages + fold.assistantMessages
      calls = Object.keys(fold.calls).length
      for (const [key, tally] of Object.entries(fold.models)) tallies.set(key, tally)
    } else {
      for (const [day, slice] of Object.entries(fold.days)) {
        if (!inRange(day)) continue
        tokens += slice.tokens
        messages += slice.messages
        for (const [key, tally] of Object.entries(slice.models)) {
          const target = tallies.get(key) ?? zeroTally()
          addTally(target, tally)
          tallies.set(key, target)
        }
      }
      if (tokens === 0 && messages === 0) continue
      for (const tally of tallies.values()) {
        input += tally.buckets.input
        output += tally.buckets.output
        cacheRead += tally.buckets.cacheRead
        cacheWrite += tally.buckets.cacheWrite
        reasoning += tally.reasoning
      }
      for (const call of Object.values(fold.calls)) {
        if (call.day !== null && inRange(call.day)) calls += 1
      }
    }

    let topModel = UNKNOWN_MODEL_KEY
    let topModelTokens = 0
    for (const [key, tally] of tallies) {
      const value = totalOf(tally.buckets)
      if (value > topModelTokens || (value === topModelTokens && key < topModel)) {
        topModel = key
        topModelTokens = value
      }
    }
    const slash = topModel.indexOf('/')
    const row: SessionStats = {
      sessionId: fold.id,
      home: fold.home,
      subtask: isSubtask(fold),
      createdAt: fold.createdAt,
      startTime: fold.firstTime,
      endTime: fold.lastTime,
      tokens,
      input,
      output,
      cacheRead,
      cacheWrite,
      reasoning,
      calls,
      messages,
      topModel,
      topModelProvider: slash < 0 ? 'unknown' : topModel.slice(0, slash),
      topModelTokens,
      modelCount: tallies.size,
    }
    if (fold.cwd !== undefined) row.cwd = fold.cwd
    rows.push(row)
  }
  rows.sort((a, b) => b.tokens - a.tokens || b.calls - a.calls || a.sessionId.localeCompare(b.sessionId))
  const total = rows.length
  if (rows.length > SESSION_LIMIT) rows.length = SESSION_LIMIT
  return { rows, total }
}

/**
 * Aggregate folded sessions into one snapshot body.
 *
 * @param input - one fold per session artifact; duplicates across homes removed here.
 * @param query - the window, scope and workspace to report.
 */
export function aggregateSnapshot(input: readonly SessionFold[], query: SnapshotQuery): AggregateResult {
  const now = query.now ?? Date.now()
  const all = query.range === 'all'
  const today = todayKey(query.timeZone, now)
  const folds = dedupeFolds(input).filter(hasWork)
  const scoped = folds.filter(fold => inScope(fold, query))
  const from = all ? '' : query.from
  const to = all ? today : query.to
  const inRange = (day: string): boolean => all || (day >= from && day <= to)

  // --- all-time pass (authoritative counters) ---------------------------
  const allTotals = zeroTotals()
  const allModels = new Map<string, ModelTally>()
  const allActiveDays = new Set<string>()
  const allHours = emptyHours()
  const workspaces = new Map<string, number>()
  let steps = 0
  let stepsWithoutUsage = 0
  let retriedSteps = 0
  let truncatedSessions = 0

  for (const fold of scoped) {
    allTotals.tokens += totalOf(fold.totals)
    addBreakdown(allTotals, fold.totals, fold.reasoningTokens)
    if (isSubtask(fold)) allTotals.subagentSessions += 1
    else allTotals.sessions += 1
    allTotals.humanMessages += fold.humanMessages
    allTotals.assistantMessages += fold.assistantMessages
    allTotals.toolResults += fold.toolResults
    steps += fold.steps
    stepsWithoutUsage += fold.stepsWithoutUsage
    retriedSteps += fold.retriedSteps
    if (fold.truncated) truncatedSessions += 1
    if (fold.cwd !== undefined) workspaces.set(fold.cwd, (workspaces.get(fold.cwd) ?? 0) + 1)
    for (const [key, tally] of Object.entries(fold.models)) {
      const target = allModels.get(key) ?? zeroTally()
      addTally(target, tally)
      allModels.set(key, target)
    }
    for (const [day, slice] of Object.entries(fold.days)) {
      if (slice.tokens > 0 || slice.messages > 0) allActiveDays.add(day)
      addHours(allHours, slice)
    }
  }
  allTotals.messages = allTotals.humanMessages + allTotals.assistantMessages
  const allActiveSorted = [...allActiveDays].sort()
  const allStreak = streaks(allActiveSorted, today)
  allTotals.activeDays = allStreak.active
  allTotals.currentStreak = allStreak.current
  allTotals.longestStreak = allStreak.longest
  allTotals.peakHour = peakHourOf(allHours)

  // --- range pass (day slices) ------------------------------------------
  const totals = zeroTotals()
  const rangeModels = new Map<string, ModelTally>()
  const dayMap = new Map<string, DayStats>()
  const hours = emptyHours()
  const activeDays = new Set<string>()
  const rangeSessionIds = new Set<string>()
  const rangeSubagentIds = new Set<string>()

  const dayFor = (day: string): DayStats => {
    const existing = dayMap.get(day)
    if (existing !== undefined) return existing
    const created: DayStats = { date: day, tokens: 0, calls: 0, messages: 0, sessions: 0, models: {}, ...zeroBreakdown() }
    dayMap.set(day, created)
    return created
  }

  for (const fold of scoped) {
    let touched = false
    for (const [day, slice] of Object.entries(fold.days)) {
      if (!inRange(day)) continue
      touched = true
      const bucket = dayFor(day)
      bucket.tokens += slice.tokens
      bucket.messages += slice.messages
      totals.humanMessages += slice.human
      totals.assistantMessages += slice.messages - slice.human
      totals.toolResults += slice.tools
      addHours(hours, slice)
      for (const [key, tally] of Object.entries(slice.models)) {
        const target = rangeModels.get(key) ?? zeroTally()
        addTally(target, tally)
        rangeModels.set(key, target)
        bucket.models[key] = (bucket.models[key] ?? 0) + totalOf(tally.buckets)
        addBreakdown(bucket, tally.buckets, tally.reasoning)
      }
      activeDays.add(day)
      rangeSessionIds.add(fold.id)
      if (isSubtask(fold)) rangeSubagentIds.add(fold.id)
    }
    void touched
  }

  // Per-day call counts and distinct-session counts.
  const sessionsByDay = new Map<string, Set<string>>()
  for (const fold of scoped) {
    for (const call of Object.values(fold.calls)) {
      if (call.day === null || !inRange(call.day)) continue
      dayFor(call.day).calls += 1
      let ids = sessionsByDay.get(call.day)
      if (ids === undefined) sessionsByDay.set(call.day, ids = new Set())
      ids.add(fold.id)
    }
  }
  for (const [day, ids] of sessionsByDay) dayFor(day).sessions = ids.size

  // Bounded ranges are gap-free so the trend chart has a bar per day.
  const daySeries: DayStats[] = all
    ? [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date))
    : datesBetween(from, to).map(day => dayMap.get(day) ?? dayFor(day))

  if (!all) {
    // Range totals come from the day slices, so tokens with rejected
    // timestamps (counted all-time) drop out — the documented trade.
    totals.tokens = 0
    Object.assign(totals, zeroBreakdown())
    for (const day of daySeries) {
      totals.tokens += day.tokens
      totals.input += day.input
      totals.output += day.output
      totals.cacheRead += day.cacheRead
      totals.cacheWrite += day.cacheWrite
      totals.reasoning += day.reasoning
    }
    totals.messages = totals.humanMessages + totals.assistantMessages
    totals.sessions = rangeSessionIds.size
    totals.subagentSessions = rangeSubagentIds.size
    totals.activeDays = activeDays.size
    totals.peakHour = peakHourOf(hours)
  } else {
    Object.assign(totals, allTotals)
  }
  // Streaks are all-time regardless of the selected range.
  totals.currentStreak = allStreak.current
  totals.longestStreak = allStreak.longest

  const chosenModels = all ? allModels : rangeModels
  const modelRows = modelStatsFromTallies(chosenModels, totals.tokens)
  const allModelRows = modelStatsFromTallies(allModels, allTotals.tokens)

  const workspaceRows = [...workspaces].map(([path, sessions]) => ({ path, sessions }))
    .sort((a, b) => b.sessions - a.sessions || a.path.localeCompare(b.path))

  const sessionRows = sessionRowsFor(scoped, all, inRange)

  return {
    tz: query.timeZone,
    range: query.range,
    from,
    to,
    totals,
    allTime: { totals: allTotals, mostUsedModel: allModelRows[0] ?? null },
    mostUsedModel: modelRows[0] ?? null,
    days: daySeries,
    hours,
    models: modelRows,
    workspaces: workspaceRows,
    sessions: sessionRows.rows,
    sessionTotal: sessionRows.total,
    coverage: { steps, stepsWithoutUsage, retriedSteps, truncatedSessions },
  }
}

/** Filters for the call-detail route. */
export interface CallsQuery extends SnapshotQuery {
  model?: string
  provider?: string
  /** Session id from the ranking panel's drill-down. */
  session?: string
  minInputTokens?: number
  minOutputTokens?: number
  maxRecords: number
}

function callToRecord(fold: SessionFold, call: FoldCall): CallRecord {
  const record: CallRecord = {
    key: `${fold.id}:${call.seq}`,
    seq: call.seq,
    time: call.time,
    sessionId: fold.id,
    home: fold.home,
    subtask: isSubtask(fold),
    provider: call.provider,
    model: call.model,
    effort: call.effort,
    durationMs: call.durationMs,
    tokens: { ...call.buckets, reasoning: call.reasoning },
  }
  if (fold.cwd !== undefined) record.cwd = fold.cwd
  return record
}

/**
 * Flatten every session's calls into newest-first rows.
 *
 * @param input - folded sessions.
 * @param query - window and filters.
 */
export function collectCalls(input: readonly SessionFold[], query: CallsQuery): CallRecord[] {
  const folds = dedupeFolds(input).filter(hasWork).filter(fold => inScope(fold, query))
  const all = query.range === 'all'
  const wanted = query.session === undefined ? null : sessionKey(query.session)
  const rows: CallRecord[] = []
  for (const fold of folds) {
    if (wanted !== null && sessionKey(fold.id) !== wanted) continue
    for (const call of Object.values(fold.calls)) {
      if (!all) {
        if (call.day === null || call.day < query.from || call.day > query.to) continue
      }
      if (query.model !== undefined && call.model !== query.model) continue
      if (query.provider !== undefined && call.provider !== query.provider) continue
      const tokens = { ...call.buckets, reasoning: call.reasoning }
      if (query.minInputTokens !== undefined && tokens.input < query.minInputTokens) continue
      if (query.minOutputTokens !== undefined && tokens.output < query.minOutputTokens) continue
      rows.push(callToRecord(fold, call))
    }
  }
  rows.sort((a, b) => b.time - a.time || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  if (rows.length > query.maxRecords) rows.length = query.maxRecords
  return rows
}

/** CSV export of the per-day per-model series, mirroring the audit plugin's columns. */
export function exportCsv(days: readonly DayStats[], models: readonly ModelStats[]): string {
  const quote = (value: string | number): string => `"${String(value).replaceAll('"', '""')}"`
  const header = ['date', 'model', 'provider', 'tokens', 'input', 'output', 'cache_read', 'cache_write', 'messages', 'sessions']
  const rows: string[][] = []
  for (const day of days) {
    const entries = Object.entries(day.models)
    if (entries.length === 0) {
      rows.push([day.date, '', '', '0', '0', '0', '0', '0', String(day.messages), String(day.sessions)])
    }
    for (const [key, tokens] of entries) {
      const model = models.find(item => item.key === key)
      rows.push([day.date, model?.model ?? key, model?.provider ?? '', String(tokens), '', '', '', '', String(day.messages), String(day.sessions)])
    }
  }
  return [header, ...rows].map(row => row.map(quote).join(',')).join('\r\n')
}

/** Re-exported for callers that only import this module. */
export { zeroBuckets }
