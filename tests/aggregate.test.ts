import { describe, expect, it } from 'vitest'
import { createFoldState, foldEvents, type EventLike, type HeaderLike, type SessionFold } from '../src/fold.ts'
import { aggregateSnapshot, collectCalls, rangeBounds, streaks } from '../src/aggregate.ts'

const TZ = 'UTC'
const NOW = Date.parse('2026-08-10T12:00:00Z')
const TODAY = '2026-08-10'

function isoDay(offsetFromNowDays: number): string {
  return new Date(NOW + offsetFromNowDays * 86_400_000).toISOString().slice(0, 10)
}

function at(offsetFromNowDays: number, minutes = 0): number {
  return NOW + offsetFromNowDays * 86_400_000 + minutes * 60_000
}

interface SessionSpec {
  id: string
  cwd?: string
  subtask?: boolean
  /** [daysAgo, input, output] triples. */
  calls: [number, number, number][]
}

function buildFold(spec: SessionSpec): SessionFold {
  const header: HeaderLike = {
    version: 3,
    id: spec.id,
    createdAt: at(-30),
    ...(spec.cwd === undefined ? {} : { cwd: spec.cwd }),
    ...(spec.subtask === true ? { delegationDepth: 1, origin: 'subagent' } : {}),
  }
  const events: EventLike[] = []
  let seq = 0
  spec.calls.forEach(([daysAgo, input, output], index) => {
    const turn = index + 1
    events.push({ type: 'step/start', seq: seq++, time: at(daysAgo, index), data: { turn, step: 1 } })
    events.push({
      type: 'assistant/message',
      seq: seq++,
      time: at(daysAgo, index + 1),
      data: {
        turn,
        step: 1,
        message: { content: [{ type: 'text' }], source: { provider: 'deepseek', model: 'deepseek-chat' } },
        usage: { inputTokens: input, outputTokens: output, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
      },
    })
  })
  events.push({ type: 'user/message', seq: seq++, time: at(spec.calls[0]?.[0] ?? 0, -1), data: { source: { kind: 'user' } } })
  const state = createFoldState(header, 'C:\\Users\\x\\.dsh\\sessions')
  foldEvents(state, events, { tz: TZ, now: NOW })
  return state.fold
}

describe('aggregate — snapshot', () => {
  const folds = [
    buildFold({ id: 'main', cwd: 'D:\\work', calls: [[0, 100, 10], [-1, 200, 20]] }),
    buildFold({ id: 'other', cwd: 'D:\\other', calls: [[0, 50, 5]] }),
    buildFold({ id: 'sub', cwd: 'D:\\work', subtask: true, calls: [[0, 30, 3]] }),
  ]

  it('reports range totals and gap-fills a bounded window', () => {
    const bounds = rangeBounds('7d', TODAY)
    const result = aggregateSnapshot(folds, { ...bounds, timeZone: TZ, range: '7d', scope: 'all', now: NOW })
    expect(result.days).toHaveLength(7)
    expect(result.days.map(day => day.date)[0]).toBe(isoDay(-6))
    expect(result.days[result.days.length - 1]?.date).toBe(TODAY)
    // 7d spans today and yesterday: 100 + 200 + 50 + 30 inputs.
    expect(result.totals.input).toBe(380)
    expect(result.totals.tokens).toBe(418)
    expect(result.allTime.totals.tokens).toBe(100 + 10 + 200 + 20 + 50 + 5 + 30 + 3)
  })

  it('filters main tasks, subtasks and workspaces', () => {
    const bounds = rangeBounds('7d', TODAY)
    const base = { ...bounds, timeZone: TZ, range: '7d' as const, now: NOW }
    expect(aggregateSnapshot(folds, { ...base, scope: 'main' }).totals.sessions).toBe(2)
    expect(aggregateSnapshot(folds, { ...base, scope: 'subtasks' }).totals.sessions).toBe(1)
    expect(aggregateSnapshot(folds, { ...base, scope: 'main', workspace: 'D:\\work' }).totals.sessions).toBe(1)
    expect(aggregateSnapshot(folds, { ...base, scope: 'all' }).allTime.totals.subagentSessions).toBe(1)
  })

  it('surfaces the most-used model with its bucket split', () => {
    const bounds = rangeBounds('7d', TODAY)
    const result = aggregateSnapshot(folds, { ...bounds, timeZone: TZ, range: '7d', scope: 'all', now: NOW })
    expect(result.mostUsedModel?.model).toBe('deepseek-chat')
    expect(result.mostUsedModel?.input).toBe(380)
    expect(result.models).toHaveLength(1)
    expect(result.models[0]?.percent).toBeCloseTo(100, 5)
  })

  it('lists workspaces with session counts', () => {
    const bounds = rangeBounds('7d', TODAY)
    const result = aggregateSnapshot(folds, { ...bounds, timeZone: TZ, range: '7d', scope: 'all', now: NOW })
    expect(result.workspaces).toEqual([
      { path: 'D:\\work', sessions: 2 },
      { path: 'D:\\other', sessions: 1 },
    ])
  })

  it('computes all-time streaks and the peak hour', () => {
    const bounds = rangeBounds('7d', TODAY)
    const result = aggregateSnapshot(folds, { ...bounds, timeZone: TZ, range: '7d', scope: 'all', now: NOW })
    expect(result.totals.currentStreak).toBe(2)
    expect(result.totals.longestStreak).toBe(2)
    // Every usage message lands at 12:xx, the human messages at 11:59.
    expect(result.totals.peakHour).toBe(12)
  })

  it('returns a sparse day series for all-time', () => {
    const result = aggregateSnapshot(folds, { from: '', to: TODAY, timeZone: TZ, range: 'all', scope: 'all', now: NOW })
    expect(result.days.map(day => day.date)).toEqual([isoDay(-1), TODAY])
  })
})

describe('aggregate — calls', () => {
  it('returns newest-first calls and paginates them', () => {
    const fold = buildFold({ id: 'main', cwd: 'D:\\work', calls: [[-2, 10, 1], [-1, 20, 2], [0, 30, 3]] })
    const bounds = rangeBounds('30d', TODAY)
    const query = {
      ...bounds, timeZone: TZ, range: '30d' as const, scope: 'all' as const, now: NOW, maxRecords: 100,
    }
    const rows = collectCalls([fold], query)
    expect(rows.map(row => row.tokens.input)).toEqual([30, 20, 10])
    expect(rows[0]?.sessionId).toBe('main')
    expect(rows[0]?.cwd).toBe('D:\\work')
    expect(rows[0]?.key).toBe(`${'main'}:${rows[0]?.seq}`)
  })

  it('filters by model, provider and token thresholds', () => {
    const fold = buildFold({ id: 'main', calls: [[0, 100, 10]] })
    const bounds = rangeBounds('7d', TODAY)
    const base = { ...bounds, timeZone: TZ, range: '7d' as const, scope: 'all' as const, now: NOW, maxRecords: 100 }
    expect(collectCalls([fold], { ...base, model: 'deepseek-chat' })).toHaveLength(1)
    expect(collectCalls([fold], { ...base, model: 'nope' })).toHaveLength(0)
    expect(collectCalls([fold], { ...base, provider: 'deepseek' })).toHaveLength(1)
    expect(collectCalls([fold], { ...base, minInputTokens: 500 })).toHaveLength(0)
    expect(collectCalls([fold], { ...base, minOutputTokens: 5 })).toHaveLength(1)
  })

  it('caps the row count at maxRecords', () => {
    const fold = buildFold({ id: 'main', calls: [[0, 1, 1], [-1, 2, 2], [-2, 3, 3]] })
    const bounds = rangeBounds('7d', TODAY)
    const rows = collectCalls([fold], { ...bounds, timeZone: TZ, range: '7d', scope: 'all', now: NOW, maxRecords: 2 })
    expect(rows).toHaveLength(2)
  })
})

describe('streaks', () => {
  it('does not report a run that ended long ago as current', () => {
    expect(streaks(['2026-01-01', '2026-01-02', '2026-01-03'], TODAY).current).toBe(0)
    expect(streaks(['2026-01-01', '2026-01-02', '2026-01-03'], TODAY).longest).toBe(3)
  })

  it('counts a run ending yesterday as current', () => {
    expect(streaks([isoDay(-2), isoDay(-1)], TODAY).current).toBe(2)
  })
})
