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

/** Per-million-token prices for one model. */
export interface ModelPrice {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** A loaded pricing table plus where it came from. */
export interface PricingTable {
  /** Free-form provenance label ('cc-switch', 'manual', …) for disclosure. */
  source: string
  /** Epoch ms the source last changed, or null when unknown. */
  updatedAt: number | null
  /** Normalized model id → price. */
  models: Map<string, ModelPrice>
}

/** A price of zero everywhere means "unknown", not "free". */
function usablePrice(price: ModelPrice): boolean {
  return price.input > 0 || price.output > 0 || price.cacheRead > 0 || price.cacheWrite > 0
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

/** The model half of a `provider/model` attribution key. */
export function modelNameOf(key: string): string {
  const slash = key.indexOf('/')
  return slash < 0 ? key : key.slice(slash + 1)
}

/**
 * Look a model up, trying the exact id first and then progressively shorter
 * dash-separated prefixes. Cheap, deterministic, and good enough for the id
 * shapes providers actually publish.
 */
export function lookupPrice(table: PricingTable | null, model: string): ModelPrice | null {
  if (table === null) return null
  const normalized = normalizeModelId(model)
  const exact = table.models.get(normalized)
  if (exact !== undefined) return usablePrice(exact) ? exact : null
  const segments = normalized.split('-')
  for (let end = segments.length - 1; end >= 2; end--) {
    const candidate = table.models.get(segments.slice(0, end).join('-'))
    if (candidate !== undefined) return usablePrice(candidate) ? candidate : null
  }
  return null
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

  const add = (id: string, price: ModelPrice): void => {
    if (id.length > 0) models.set(normalizeModelId(id), price)
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
      })
    }
  }

  if (models.size === 0) return null
  const updatedAt = typeof record['updatedAt'] === 'number' ? record['updatedAt'] : null
  return { source, updatedAt, models }
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
 * Decorate rows with costs and summarize coverage.
 *
 * Rows are mutated in place — they are freshly built per snapshot, never
 * shared — so the caller keeps one object graph. A row with no price is marked
 * `priced: false` and its tokens counted as unpriced; the estimate therefore
 * never silently reads as "free".
 */
export function applyPricing(targets: readonly PriceTarget[], table: PricingTable | null): CostSummary | null {
  if (table === null) return null
  let total = 0
  let pricedTokens = 0
  let unpricedTokens = 0

  const seen = new Set<Costable>()
  for (const { row, modelId } of targets) {
    if (seen.has(row)) continue
    seen.add(row)
    const cost = costOf(table, modelId, {
      input: row.input,
      output: row.output,
      cacheRead: row.cacheRead,
      cacheWrite: row.cacheWrite,
    })
    if (cost === null) {
      row.priced = false
      unpricedTokens += row.tokens
      continue
    }
    row.costUsd = cost
    row.priced = true
    total += cost
    pricedTokens += row.tokens
  }

  return { currency: 'USD', total, pricedTokens, unpricedTokens, source: table.source, updatedAt: table.updatedAt }
}
