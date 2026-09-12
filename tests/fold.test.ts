import { describe, expect, it } from 'vitest'
import {
  createFoldState,
  foldEvents,
  hasWork,
  isSubtask,
  type EventLike,
  type HeaderLike,
} from '../src/fold.ts'

const TZ = 'UTC'
const NOW = Date.parse('2026-08-02T00:00:00Z')
const DAY = Date.parse('2026-08-01T00:00:00Z')

const header: HeaderLike = { version: 3, id: 'session-a', createdAt: DAY, cwd: 'D:\\work' }

function event(type: string, seq: number, offsetMs: number, data?: unknown): EventLike {
  return { type, seq, time: DAY + offsetMs, ...(data === undefined ? {} : { data }) }
}

function usage(input: number, output: number, cacheRead = 0, cacheWrite = 0, reasoning = 0): Record<string, number> {
  return { inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite, reasoningTokens: reasoning }
}

function fold(events: EventLike[], h: HeaderLike = header) {
  const state = createFoldState(h, 'C:\\Users\\x\\.dsh\\sessions')
  foldEvents(state, events, { tz: TZ, now: NOW })
  return state
}

describe('fold — token accounting', () => {
  it('sums the four disjoint buckets and keeps reasoning as a display subset', () => {
    const { fold: f } = fold([
      event('user/message', 0, 0, { source: { kind: 'user' } }),
      event('step/start', 1, 10, { turn: 1, step: 1 }),
      event('assistant/message', 2, 1000, {
        turn: 1,
        step: 1,
        message: { content: [{ type: 'text' }], source: { provider: 'deepseek', model: 'deepseek-chat' } },
        usage: usage(100, 40, 20, 10, 5),
      }),
      event('step/end', 3, 1200, { turn: 1, step: 1 }),
    ])
    expect(f.totals).toEqual({ input: 100, output: 40, cacheRead: 20, cacheWrite: 10 })
    expect(f.reasoningTokens).toBe(5)
    expect(f.humanMessages).toBe(1)
    expect(f.assistantMessages).toBe(1)
    expect(f.steps).toBe(1)
    expect(hasWork(f)).toBe(true)
  })

  it('replaces, never accumulates, the chunk→message duplicate usage report', () => {
    const { fold: f } = fold([
      event('step/start', 0, 0, { turn: 1, step: 1 }),
      event('assistant/chunk', 1, 500, { turn: 1, step: 1, chunk: { type: 'usage', usage: usage(100, 40) } }),
      event('assistant/message', 2, 900, {
        turn: 1,
        step: 1,
        message: { content: [{ type: 'text' }], source: { provider: 'deepseek', model: 'deepseek-chat' } },
        usage: usage(100, 40),
      }),
      event('step/end', 3, 1000, { turn: 1, step: 1 }),
    ])
    expect(f.totals.output).toBe(40)
    expect(f.usageSamples).toBe(1)
    expect(Object.keys(f.calls)).toHaveLength(1)
  })

  it('counts a retried step once, with the surviving numbers, and flags the retry', () => {
    const { fold: f } = fold([
      event('step/start', 0, 0, { turn: 1, step: 1 }),
      event('assistant/message', 1, 100, {
        turn: 1, step: 1,
        message: { content: [{ type: 'text' }], source: { provider: 'deepseek', model: 'deepseek-chat' } },
        usage: usage(100, 10),
      }),
      event('assistant/message', 2, 200, {
        turn: 1, step: 1,
        message: { content: [{ type: 'text' }], source: { provider: 'deepseek', model: 'deepseek-chat' } },
        usage: usage(200, 20),
      }),
      event('step/end', 3, 300, { turn: 1, step: 1 }),
    ])
    expect(f.totals.input).toBe(200)
    expect(f.totals.output).toBe(20)
    expect(f.retriedSteps).toBe(1)
    expect(Object.keys(f.calls)).toHaveLength(1)
    expect(f.calls['1:1']?.buckets.input).toBe(200)
  })
})

describe('fold — call records', () => {
  it('pairs step timing and reasoning effort into the call row', () => {
    const { fold: f } = fold([
      event('step/start', 0, 0, { turn: 2, step: 3 }),
      event('request/header', 1, 50, { header: { config: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'medium' } } }),
      event('assistant/message', 2, 5000, {
        turn: 2, step: 3,
        message: { content: [{ type: 'text' }], source: { provider: 'deepseek', model: 'deepseek-chat' } },
        usage: usage(1000, 200, 100, 0, 10),
      }),
    ])
    const call = f.calls['2:3']
    expect(call?.durationMs).toBe(5000)
    expect(call?.effort).toBe('medium')
    expect(call?.provider).toBe('deepseek')
    expect(call?.model).toBe('deepseek-chat')
    expect(call?.day).toBe('2026-08-01')
  })

  it('records a compaction summary as its own call', () => {
    const { fold: f } = fold([
      event('request/context', 0, 0, { provider: 'deepseek', model: 'deepseek-chat' }),
      event('compaction/summary', 1, 10, { provider: 'deepseek', model: 'deepseek-chat', usage: usage(50, 5) }),
    ])
    expect(f.compactionCalls).toBe(1)
    expect(f.calls['c:1']?.compaction).toBe(true)
    expect(f.totals.input).toBe(50)
  })

  it('excludes the inherited fork prefix below header.seedLength', () => {
    const child: HeaderLike = { ...header, id: 'session-child', parentSession: 'session-a', seedLength: 3 }
    const { fold: f } = fold([
      event('assistant/message', 0, 0, { turn: 0, step: 0, message: { content: [{ type: 'text' }], source: { provider: 'x', model: 'y' } }, usage: usage(999, 999) }),
      event('assistant/message', 3, 100, { turn: 1, step: 1, message: { content: [{ type: 'text' }], source: { provider: 'x', model: 'y' } }, usage: usage(10, 1) }),
    ], child)
    expect(f.totals.input).toBe(10)
    expect(Object.keys(f.calls)).toEqual(['1:1'])
    expect(isSubtask(f)).toBe(true)
  })

  it('marks v3 delegation depth as a subtask too', () => {
    const sub: HeaderLike = { version: 3, id: 'session-sub', createdAt: DAY, delegationDepth: 1 }
    const { fold: f } = fold([], sub)
    expect(isSubtask(f)).toBe(true)
  })
})

describe('fold — message counting', () => {
  it('never counts injected (non-user) context as a human message', () => {
    const { fold: f } = fold([
      event('user/message', 0, 0, { source: { kind: 'plugin', plugin: 'ctx' } }),
      event('user/message', 1, 1, { source: { kind: 'user' } }),
    ])
    expect(f.humanMessages).toBe(1)
    expect(f.injectedMessages).toBe(1)
  })

  it('counts tool results out of the message total but into the surface count', () => {
    const { fold: f } = fold([
      event('user/message', 0, 0, { source: { kind: 'user' } }),
      event('tool/result', 1, 5, {}),
    ])
    expect(f.humanMessages).toBe(1)
    expect(f.toolResults).toBe(1)
  })
})
