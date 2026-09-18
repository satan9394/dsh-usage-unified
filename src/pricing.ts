/**
 * Optional cost estimation from a local pricing table.
 *
 * dsh itself carries no price list, so the panel refuses to invent one: costs
 * appear only when a `pricing.json` exists under the dsh home, and every model
 * without a matching entry is reported as unpriced rather than as free. The
 * table is plain JSON so an operator (or `npm run pricing:setup`) can generate
 * it from whatever source they already trust.
 *
 * Prices are USD per million tokens, matching the four disjoint buckets.
 *
 * @module dsh-usage-unified/pricing
 */

import { readFile, stat } from 'node:fs/promises'
import type { Buckets, CostSummary } from './types.ts'

/** One rate set: USD per million tokens, per bucket. */
export interface RateSet {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/**
 * A model's effective rates.
 *
 * `input`/`output`/`cacheRead`/`cacheWrite` are what `costOf` charges. When the
 * provider prices by time of day, `peak` keeps the higher tier and the four
 * effective numbers are the peak-weighted blend of it and the off-peak table —
 * so the estimate is neither the optimistic off-peak bound nor the punitive
 * peak one.
 */
export interface ModelPrice extends RateSet {
  /** The peak tier, kept for disclosure; absent when the model is flat-priced. */
  peak?: RateSet
}

/** A loaded pricing table plus where it came from. */
export interface PricingTable {
  /** Free-form provenance label ('cc-switch', 'manual', …) for disclosure. */
  source: string
  /** Epoch ms the source last changed, or null when unknown. */
  updatedAt: number | null
  /** Share of usage assumed to fall in a peak window, 0-1. */
  peakShare: number
  /** Normalized model id → price. */
  models: Map<string, ModelPrice>
}

/**
 * Share of usage in a peak window when a table does not say.
 *
 * DeepSeek prices peak as Monday-Friday 01:00-04:00 and 06:00-10:00 UTC — 7
 * hours a day, 35 of the week's 168 — and OpenCode Go and Command Code both
 * document the same schedule. A flat off-peak number would understate cost by
 * exactly this share times the doubling.
 */
export const DEFAULT_PEAK_SHARE = 0.2083

/** A price of zero everywhere means "unknown", not "free". */
function usablePrice(price: ModelPrice): boolean {
  return price.input > 0 || price.output > 0 || price.cacheRead > 0 || price.cacheWrite > 0
}

function blend(offPeak: number, peak: number, share: number): number {
  if (peak <= 0) return offPeak
  return offPeak * (1 - share) + peak * share
}

/** Fold a declared peak tier into the effective rates. */
function resolvePrice(declared: RateSet, peak: RateSet | undefined, share: number): ModelPrice {
  if (peak === undefined || share <= 0) return { ...declared }
  return {
    input: blend(declared.input, peak.input, share),
    output: blend(declared.output, peak.output, share),
    cacheRead: blend(declared.cacheRead, peak.cacheRead, share),
    cacheWrite: blend(declared.cacheWrite, peak.cacheWrite, share),
    peak: { ...peak },
  }
}

function peakShareOf(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) && value > 0 && value < 1 ? value : DEFAULT_PEAK_SHARE
}

function numberOrZero(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/**
 * Normalize a model id for lookup: lowercase, drop a trailing date stamp or
 * version tail so `deepseek-chat-v3-0324` still finds `deepseek-chat`.
 */
export function normalizeModelId(id: string): string {
  return id.trim().toLowerCase().replace(/@[^@]*$/, '')
}

/** Exact id first, then progressively shorter dash-separated prefixes. */
function lookupCandidates(table: PricingTable, normalized: string): ModelPrice | null {
  const exact = table.models.get(normalized)
  if (exact !== undefined) return usablePrice(exact) ? exact : null
  const segments = normalized.split('-')
  for (let end = segments.length - 1; end >= 2; end--) {
    const candidate = table.models.get(segments.slice(0, end).join('-'))
    if (candidate !== undefined) return usablePrice(candidate) ? candidate : null
  }
  return null
}

/**
 * Look a model up, trying the exact id first and then progressively shorter
 * dash-separated prefixes. Cheap, deterministic, and good enough for the id
 * shapes providers actually publish.
 *
 * A `provider/model` attribution key is accepted directly: this machine routes
 * models whose own name contains a slash (`command/deepseek/deepseek-v4.1-flash`),
 * so the segment after the last slash is tried as well.
 */
export function lookupPrice(table: PricingTable | null, model: string): ModelPrice | null {
  if (table === null) return null
  const normalized = normalizeModelId(model)
  const direct = lookupCandidates(table, normalized)
  if (direct !== null) return direct
  const slash = normalized.lastIndexOf('/')
  return slash < 0 ? null : lookupCandidates(table, normalized.slice(slash + 1))
}

/** USD cost of one token report, or null when the model has no price. */
export function costOf(table: PricingTable | null, model: string, buckets: Buckets): number | null {
  const price = lookupPrice(table, model)
  if (price === null) return null
  return (buckets.input * price.input
    + buckets.output * price.output
    + buckets.cacheRead * price.cacheRead
    + buckets.cacheWrite * price.cacheWrite) / 1_000_000
}

/**
 * Parse a pricing file.
 *
 * Accepts both this project's shape (`{ models: { id: {input,…} } }`) and the
 * CC Switch export (`{ models: [{ modelId, inputCostPerMillion, … }] }`), so an
 * operator can point at either without a conversion step.
 */
export function parsePricing(raw: unknown, fallbackSource: string): PricingTable | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const models = new Map<string, ModelPrice>()
  const source = typeof record['source'] === 'string' ? record['source'] : fallbackSource
  const share = peakShareOf(record['peakShare'])

  const add = (id: string, offPeak: RateSet, peak?: RateSet): void => {
    if (id.length > 0) models.set(normalizeModelId(id), resolvePrice(offPeak, peak, share))
  }

  const readPeak = (value: unknown): RateSet | undefined => {
    if (typeof value !== 'object' || value === null) return undefined
    const entry = value as Record<string, unknown>
    return {
      input: numberOrZero(entry['input']),
      output: numberOrZero(entry['output']),
      cacheRead: numberOrZero(entry['cacheRead']),
      cacheWrite: numberOrZero(entry['cacheWrite']),
    }
  }

  const declared = record['models']
  if (Array.isArray(declared)) {
    for (const item of declared) {
      if (typeof item !== 'object' || item === null) continue
      const entry = item as Record<string, unknown>
      const id = typeof entry['modelId'] === 'string' ? entry['modelId'] : undefined
      if (id === undefined) continue
      add(id, {
        input: numberOrZero(entry['inputCostPerMillion']),
        output: numberOrZero(entry['outputCostPerMillion']),
        cacheRead: numberOrZero(entry['cacheReadCostPerMillion']),
        cacheWrite: numberOrZero(entry['cacheCreationCostPerMillion']),
      })
    }
  } else if (typeof declared === 'object' && declared !== null) {
    for (const [id, value] of Object.entries(declared)) {
      if (typeof value !== 'object' || value === null) continue
      const entry = value as Record<string, unknown>
      add(id, {
        input: numberOrZero(entry['input']),
        output: numberOrZero(entry['output']),
        cacheRead: numberOrZero(entry['cacheRead']),
        cacheWrite: numberOrZero(entry['cacheWrite']),
      }, readPeak(entry['peak']))
    }
  }

  if (models.size === 0) return null
  const updatedAt = typeof record['updatedAt'] === 'number' ? record['updatedAt'] : null
  return { source, updatedAt, peakShare: share, models }
}

/** Read and parse a pricing file; any failure is a silent "no pricing". */
export async function loadPricing(path: string): Promise<PricingTable | null> {
  try {
    const [text, info] = await Promise.all([readFile(path, 'utf8'), stat(path)])
    const table = parsePricing(JSON.parse(text), path)
    if (table === null) return null
    return { ...table, updatedAt: table.updatedAt ?? info.mtimeMs }
  } catch {
    return null
  }
}

/** The subset of a model or session row a price can be applied to. */
export interface Costable {
  tokens: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  costUsd?: number
  priced?: boolean
}

/** A row plus the model id its tokens should be priced as. */
export interface PriceTarget {
  row: Costable
  modelId: string
}

/**
 * Which rows a price pass should decorate, and which of them the summary sums.
 *
 * `basis` must partition the window's tokens exactly once — the per-model rows
 * are the only set that does. Session rows are useful as a per-row number but
 * describe the same tokens, so folding them into the total would double it.
 */
export interface PricingInput {
  basis: readonly PriceTarget[]
  extra?: readonly PriceTarget[]
}

/**
 * Decorate rows with costs and summarize coverage.
 *
 * Rows are mutated in place — they are freshly built per snapshot, never
 * shared — so the caller keeps one object graph. A row with no price is marked
 * `priced: false` and its tokens counted as unpriced; the estimate therefore
 * never silently reads as "free".
 */
export function applyPricing(input: PricingInput, table: PricingTable | null): CostSummary | null {
  if (table === null) return null
  let total = 0
  let pricedTokens = 0
  let unpricedTokens = 0

  const seen = new Set<Costable>()
  const price = ({ row, modelId }: PriceTarget): number | null => {
    if (seen.has(row)) return null
    seen.add(row)
    const cost = costOf(table, modelId, {
      input: row.input,
      output: row.output,
      cacheRead: row.cacheRead,
      cacheWrite: row.cacheWrite,
    })
    if (cost === null) {
      row.priced = false
      return null
    }
    row.costUsd = cost
    row.priced = true
    return cost
  }

  for (const target of input.basis) {
    if (seen.has(target.row)) continue
    const cost = price(target)
    if (cost === null) unpricedTokens += target.row.tokens
    else {
      total += cost
      pricedTokens += target.row.tokens
    }
  }
  // Per-row display for the other views; never added to the total.
  for (const target of input.extra ?? []) price(target)

  return {
    currency: 'USD',
    total,
    pricedTokens,
    unpricedTokens,
    source: table.source,
    updatedAt: table.updatedAt,
    peakShare: table.peakShare,
  }
}
