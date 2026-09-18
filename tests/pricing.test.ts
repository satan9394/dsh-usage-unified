import { describe, expect, it } from 'vitest'
import { applyPricing, costOf, DEFAULT_PEAK_SHARE, lookupPrice, normalizeModelId, parsePricing, type PricingTable } from '../src/pricing.ts'
import type { ModelStats, SessionStats } from '../src/types.ts'

const table: PricingTable = {
  source: 'test',
  updatedAt: 1,
  peakShare: DEFAULT_PEAK_SHARE,
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

  it('accepts a provider/model attribution key, including a nested model name', () => {
    expect(costOf(table, 'deepseek/deepseek-chat', buckets(1_000_000, 0))).toBeCloseTo(0.28, 10)
    expect(costOf(table, 'deepseek/deepseek-chat-v3-0324', buckets(1_000_000, 0))).toBeCloseTo(0.28, 10)
    // This machine routes models whose own name contains a slash.
    expect(costOf(table, 'command/deepseek/deepseek-chat', buckets(1_000_000, 0))).toBeCloseTo(0.28, 10)
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

describe('time-of-day tiers', () => {
  const declared = {
    peakShare: 0.25,
    models: {
      flash: { input: 0.15, output: 0.6, cacheRead: 0.003, cacheWrite: 0, peak: { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0 } },
      flat: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0.2 },
    },
  }

  it('blends the peak tier into the effective rates by the declared share', () => {
    const parsed = parsePricing(declared, 'x')
    expect(parsed?.peakShare).toBe(0.25)
    const flash = parsed?.models.get('flash')
    expect(flash?.input).toBeCloseTo(0.15 * 0.75 + 0.3 * 0.25, 10)
    expect(flash?.output).toBeCloseTo(0.6 * 0.75 + 1.2 * 0.25, 10)
    expect(flash?.cacheRead).toBeCloseTo(0.003 * 0.75 + 0.006 * 0.25, 10)
    // The peak tier survives for disclosure.
    expect(flash?.peak?.input).toBe(0.3)
  })

  it('defaults the share to the documented DeepSeek peak window', () => {
    const parsed = parsePricing({ models: { flash: { ...declared.models.flash } } }, 'x')
    expect(parsed?.peakShare).toBe(DEFAULT_PEAK_SHARE)
    expect(DEFAULT_PEAK_SHARE).toBeCloseTo(35 / 168, 4)
    expect(parsed?.models.get('flash')?.input).toBeCloseTo(0.15 * (1 + DEFAULT_PEAK_SHARE), 10)
  })

  it('leaves a flat-priced model untouched', () => {
    const parsed = parsePricing(declared, 'x')
    const flat = parsed?.models.get('flat')
    expect(flat?.input).toBe(1)
    expect(flat?.peak).toBeUndefined()
  })

  it('ignores an out-of-range share and falls back to the default', () => {
    expect(parsePricing({ peakShare: 5, models: { a: { input: 1 } } }, 'x')?.peakShare).toBe(DEFAULT_PEAK_SHARE)
    expect(parsePricing({ peakShare: 0, models: { a: { input: 1 } } }, 'x')?.peakShare).toBe(DEFAULT_PEAK_SHARE)
  })

  it('carries the share into the cost summary', () => {
    const parsed = parsePricing(declared, 'x')
    const row = modelRow({ key: 'flash', model: 'flash', tokens: 1_000_000, input: 1_000_000 })
    const summary = applyPricing({ basis: [{ row, modelId: 'flash' }] }, parsed)
    expect(summary?.peakShare).toBe(0.25)
    expect(summary?.total).toBeCloseTo(0.15 * 0.75 + 0.3 * 0.25, 10)
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
  it('prices the per-model basis and reports what it could not price', () => {
    const known = modelRow({ key: 'deepseek/deepseek-chat', tokens: 2_000_000, input: 1_000_000, output: 1_000_000 })
    const unknown = modelRow({ key: 'acme/mystery', model: 'mystery', tokens: 500_000, input: 500_000 })
    const session = sessionRow({ tokens: 2_000_000, input: 1_000_000, output: 1_000_000 })
    const summary = applyPricing({
      basis: [
        { row: known, modelId: known.key },
        { row: unknown, modelId: unknown.key },
      ],
      extra: [{ row: session, modelId: session.topModel }],
    }, table)
    expect(summary?.total).toBeCloseTo(0.28 + 0.42, 10)
    expect(summary?.pricedTokens).toBe(2_000_000)
    expect(summary?.unpricedTokens).toBe(500_000)
    expect(known.priced).toBe(true)
    expect(known.costUsd).toBeCloseTo(0.7, 10)
    expect(unknown.priced).toBe(false)
    expect(unknown.costUsd).toBeUndefined()
    // The session row is decorated for display only and excluded from the summary.
    expect(session.costUsd).toBeCloseTo(0.7, 10)
    expect(summary?.total).toBeLessThan(1.4)
  })

  it('counts a row once even when it is passed twice', () => {
    const row = modelRow({ tokens: 1_000_000, input: 1_000_000 })
    const summary = applyPricing({
      basis: [{ row, modelId: row.key }, { row, modelId: row.key }],
      extra: [{ row, modelId: row.key }],
    }, table)
    expect(summary?.total).toBeCloseTo(0.28, 10)
    expect(summary?.pricedTokens).toBe(1_000_000)
  })

  it('returns null without a table, leaving rows untouched', () => {
    const row = modelRow({ tokens: 1_000_000, input: 1_000_000 })
    expect(applyPricing({ basis: [{ row, modelId: row.key }] }, null)).toBeNull()
    expect(row.costUsd).toBeUndefined()
    expect(row.priced).toBeUndefined()
  })
})
