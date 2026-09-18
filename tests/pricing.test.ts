import { describe, expect, it } from 'vitest'
import { applyPricing, costOf, lookupPrice, modelNameOf, normalizeModelId, parsePricing, type PricingTable } from '../src/pricing.ts'
import type { ModelStats, SessionStats } from '../src/types.ts'

const table: PricingTable = {
  source: 'test',
  updatedAt: 1,
  models: new Map([
    ['claude-opus-4-7', { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }],
    ['deepseek-chat', { input: 0.28, output: 0.42, cacheRead: 0.028, cacheWrite: 0.28 }],
    ['unpriced', { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }],
  ]),
}

function buckets(input: number, output: number, cacheRead = 0, cacheWrite = 0): { input: number; output: number; cacheRead: number; cacheWrite: number } {
  return { input, output, cacheRead, cacheWrite }
}

describe('pricing lookup', () => {
  it('normalizes ids and strips a trailing date or version tail', () => {
    expect(normalizeModelId('  Claude-Opus-4-7 ')).toBe('claude-opus-4-7')
    expect(normalizeModelId('deepseek-chat@2026-08')).toBe('deepseek-chat')
    expect(lookupPrice(table, 'deepseek-chat-v3-0324')?.input).toBe(0.28)
    expect(lookupPrice(table, 'DEEPSEEK-CHAT')?.output).toBe(0.42)
  })

  it('takes the model half of an attribution key', () => {
    expect(modelNameOf('deepseek/deepseek-chat')).toBe('deepseek-chat')
    expect(modelNameOf('deepseek-chat')).toBe('deepseek-chat')
    expect(costOf(table, modelNameOf('deepseek/deepseek-chat-v3-0324'), buckets(1_000_000, 0))).toBeCloseTo(0.28, 10)
  })

  it('treats an all-zero price as unknown rather than free', () => {
    expect(lookupPrice(table, 'unpriced')).toBeNull()
    expect(costOf(table, 'unpriced', buckets(1_000_000, 0))).toBeNull()
    expect(costOf(table, 'never-heard-of-it', buckets(1_000_000, 0))).toBeNull()
  })

  it('charges each bucket at its own rate per million tokens', () => {
    expect(costOf(table, 'deepseek-chat', buckets(1_000_000, 1_000_000, 1_000_000, 1_000_000)))
      .toBeCloseTo(0.28 + 0.42 + 0.028 + 0.28, 10)
  })
})

describe('pricing parsing', () => {
  it('accepts this project’s shape', () => {
    const parsed = parsePricing({ source: 'manual', models: { 'a-b': { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 } } }, 'fallback')
    expect(parsed?.source).toBe('manual')
    expect(parsed?.models.get('a-b')).toEqual({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4 })
  })

  it('accepts a CC Switch export', () => {
    const parsed = parsePricing({
      models: [{ modelId: 'x-y', inputCostPerMillion: '10', outputCostPerMillion: '50', cacheReadCostPerMillion: '1', cacheCreationCostPerMillion: '12.5' }],
    }, 'cc-switch')
    expect(parsed?.source).toBe('cc-switch')
    expect(parsed?.models.get('x-y')).toEqual({ input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 })
  })

  it('returns null for an empty or malformed table', () => {
    expect(parsePricing(null, 'x')).toBeNull()
    expect(parsePricing({ models: [] }, 'x')).toBeNull()
    expect(parsePricing({ models: 'nope' }, 'x')).toBeNull()
  })
})

function modelRow(overrides: Partial<ModelStats>): ModelStats {
  return {
    key: 'deepseek/deepseek-chat',
    provider: 'deepseek',
    model: 'deepseek-chat',
    tokens: 0,
    calls: 1,
    percent: 100,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    ...overrides,
  }
}

function sessionRow(overrides: Partial<SessionStats>): SessionStats {
  return {
    sessionId: 's',
    home: 'home',
    subtask: false,
    createdAt: 0,
    startTime: null,
    endTime: null,
    tokens: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    calls: 0,
    messages: 0,
    topModel: 'deepseek/deepseek-chat',
    topModelProvider: 'deepseek',
    topModelTokens: 0,
    modelCount: 1,
    ...overrides,
  }
}

describe('pricing coverage', () => {
  it('prices model and session rows and reports what it could not price', () => {
    const known = modelRow({ tokens: 2_000_000, input: 1_000_000, output: 1_000_000 })
    const unknown = modelRow({ key: 'acme/mystery', model: 'mystery', tokens: 500_000, input: 500_000 })
    const session = sessionRow({ tokens: 2_000_000, input: 1_000_000, output: 1_000_000 })
    const summary = applyPricing([
      { row: known, modelId: known.model },
      { row: unknown, modelId: unknown.model },
      { row: session, modelId: modelNameOf(session.topModel) },
    ], table)
    // The model row and the session row share the same rate, hence twice 0.70.
    expect(summary?.total).toBeCloseTo(2 * (0.28 + 0.42), 10)
    expect(summary?.pricedTokens).toBe(4_000_000)
    expect(summary?.unpricedTokens).toBe(500_000)
    expect(known.priced).toBe(true)
    expect(known.costUsd).toBeCloseTo(0.7, 10)
    expect(unknown.priced).toBe(false)
    expect(unknown.costUsd).toBeUndefined()
  })

  it('counts a row once even when it is passed twice', () => {
    const row = modelRow({ tokens: 1_000_000, input: 1_000_000 })
    const summary = applyPricing([
      { row, modelId: row.model },
      { row, modelId: row.model },
    ], table)
    expect(summary?.total).toBeCloseTo(0.28, 10)
    expect(summary?.pricedTokens).toBe(1_000_000)
  })

  it('returns null without a table, leaving rows untouched', () => {
    const row = modelRow({ tokens: 1_000_000, input: 1_000_000 })
    expect(applyPricing([{ row, modelId: row.model }], null)).toBeNull()
    expect(row.costUsd).toBeUndefined()
    expect(row.priced).toBeUndefined()
  })
})
