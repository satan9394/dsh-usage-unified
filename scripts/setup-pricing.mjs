/**
 * Generate the plugin's local pricing table so the dashboard can estimate cost.
 *
 * The plugin refuses to invent prices: it reads `$DSH_HOME/usage-unified/pricing.json`
 * and shows nothing when that file is absent. This script fills it from a table
 * you already trust — CC Switch's `model-pricing.json` by default, or any file
 * in this project's own `{ models: { id: {input,…} } }` shape.
 *
 * Prices are USD per million tokens, matching the four disjoint buckets.
 *
 * `scripts/pricing.override.json` is merged on top of the primary source, every
 * run. It carries the models the primary table lacks and the two-tier
 * (off-peak/peak) rates some providers publish; leaving them there rather than
 * in CC Switch's file means a models.dev re-sync cannot silently drop them.
 *
 * Output: $DSH_HOME/usage-unified/pricing.json
 * Usage:  node scripts/setup-pricing.mjs [--source <path>] [--override <path>] [--out <path>]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback
}

const dshHome = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const SOURCE = arg('source', process.env.CC_SWITCH_PRICING?.trim() || join(homedir(), '.cc-switch', 'model-pricing.json'))
const OVERRIDE = arg('override', fileURLToPath(new URL('pricing.override.json', import.meta.url)))
const OUT = arg('out', join(dshHome, 'usage-unified', 'pricing.json'))

const num = value => {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

const raw = JSON.parse(await readFile(SOURCE, 'utf8'))
const models = {}
let priced = 0

const add = (id, price) => {
  if (typeof id !== 'string' || id.trim().length === 0) return
  const entry = { ...price }
  if (price.peak !== undefined) entry.peak = { ...price.peak }
  models[id.trim().toLowerCase()] = entry
  if (price.input > 0 || price.output > 0 || price.cacheRead > 0 || price.cacheWrite > 0) priced += 1
}
if (Array.isArray(raw.models)) {
  // CC Switch shape.
  for (const entry of raw.models) {
    const id = entry?.modelId ?? entry?.model_id ?? entry?.id
    add(id, {
      input: num(entry?.inputCostPerMillion ?? entry?.input_cost_per_million),
      output: num(entry?.outputCostPerMillion ?? entry?.output_cost_per_million),
      cacheRead: num(entry?.cacheReadCostPerMillion ?? entry?.cache_read_cost_per_million),
      cacheWrite: num(entry?.cacheCreationCostPerMillion ?? entry?.cache_creation_cost_per_million),
    })
  }
} else if (raw.models !== null && typeof raw.models === 'object') {
  // This project's own shape: already-priced, copy through.
  for (const [id, price] of Object.entries(raw.models)) {
    add(id, {
      input: num(price?.input),
      output: num(price?.output),
      cacheRead: num(price?.cacheRead),
      cacheWrite: num(price?.cacheWrite),
      ...(price?.peak === undefined ? {} : {
        peak: {
          input: num(price.peak.input),
          output: num(price.peak.output),
          cacheRead: num(price.peak.cacheRead),
          cacheWrite: num(price.peak.cacheWrite),
        },
      }),
    })
  }
} else {
  throw new Error(`unrecognized pricing file: ${SOURCE}`)
}

const fromSource = Object.keys(models).length
if (fromSource === 0) throw new Error(`no models found in ${SOURCE}`)

// The override is applied last so the hand-checked entries always win.
let peakShare
let overridden = 0
try {
  const override = JSON.parse(await readFile(OVERRIDE, 'utf8'))
  if (typeof override?.peakShare === 'number') peakShare = override.peakShare
  for (const [id, price] of Object.entries(override?.models ?? {})) {
    if (models[id.trim().toLowerCase()] !== undefined) overridden += 1
    add(id, {
      input: num(price?.input),
      output: num(price?.output),
      cacheRead: num(price?.cacheRead),
      cacheWrite: num(price?.cacheWrite),
      ...(price?.peak === undefined ? {} : {
        peak: {
          input: num(price.peak.input),
          output: num(price.peak.output),
          cacheRead: num(price.peak.cacheRead),
          cacheWrite: num(price.peak.cacheWrite),
        },
      }),
    })
  }
  console.log(`override: ${OVERRIDE} (${overridden} models replaced, peakShare ${peakShare ?? '(default)'})`)
} catch (error) {
  if (error?.code !== 'ENOENT') console.warn(`warning: ignoring override ${OVERRIDE}: ${error.message}`)
}

const total = Object.keys(models).length
await mkdir(dirname(OUT), { recursive: true })
const table = { version: 1, source: SOURCE, updatedAt: Date.now(), ...(peakShare === undefined ? {} : { peakShare }), models }
await writeFile(OUT, `${JSON.stringify(table, null, 2)}\n`, 'utf8')
console.log(`read ${fromSource} models from ${SOURCE} (${priced} with a non-zero price)`)
console.log(`wrote ${total} models to ${OUT}`)
console.log('restart DSH web to pick it up (cost is loaded at the start of each index scan)')
