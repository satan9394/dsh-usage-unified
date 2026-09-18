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
 * Output: $DSH_HOME/usage-unified/pricing.json
 * Usage:  node scripts/setup-pricing.mjs [--source <path>] [--out <path>]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback
}

const dshHome = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const SOURCE = arg('source', process.env.CC_SWITCH_PRICING?.trim() || join(homedir(), '.cc-switch', 'model-pricing.json'))
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
  models[id.trim().toLowerCase()] = price
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
    })
  }
} else {
  throw new Error(`unrecognized pricing file: ${SOURCE}`)
}

const total = Object.keys(models).length
if (total === 0) throw new Error(`no models found in ${SOURCE}`)

await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, `${JSON.stringify({ version: 1, source: SOURCE, updatedAt: Date.now(), models }, null, 2)}\n`, 'utf8')
console.log(`read ${total} models from ${SOURCE} (${priced} with a non-zero price)`)
console.log(`wrote ${OUT}`)
console.log('restart DSH web to pick it up (cost is loaded at the start of each index scan)')
