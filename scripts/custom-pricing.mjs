/**
 * Derive tokscale's `custom-pricing.json` from CC Switch's `model-pricing.json`.
 *
 * tokscale can only price models it finds in LiteLLM / OpenRouter, so the
 * DeepSeek models this machine actually uses (served through custom providers)
 * were submitted with cost $0. CC Switch already ships a priced model table;
 * this maps it into tokscale's custom-pricing schema so those models price
 * exactly. Keyed by model id alone, which tokscale treats as an explicit
 * assertion for the provider too.
 *
 * Output: %APPDATA%\tokscale\custom-pricing.json (override with TOKSCALE_CONFIG_DIR)
 * Usage:  node scripts/custom-pricing.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SRC = process.env.CC_SWITCH_PRICING?.trim() || join(homedir(), '.cc-switch', 'model-pricing.json')
const configDir = process.env.TOKSCALE_CONFIG_DIR?.trim()
  ? join(process.env.TOKSCALE_CONFIG_DIR, '')
  : join(homedir(), '.config', 'tokscale')
const OUT = join(process.env.APPDATA ?? configDir, 'tokscale', 'custom-pricing.json')

const num = v => {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

const source = JSON.parse(await readFile(SRC, 'utf8'))
const list = Array.isArray(source.models) ? source.models : []

const models = {}
let priced = 0
for (const m of list) {
  const id = m.modelId ?? m.model_id ?? m.id
  if (typeof id !== 'string' || id.length === 0) continue
  const entry = {}
  const input = num(m.inputCostPerMillion ?? m.input_cost_per_million)
  const output = num(m.outputCostPerMillion ?? m.output_cost_per_million)
  const cacheRead = num(m.cacheReadCostPerMillion ?? m.cache_read_cost_per_million)
  const cacheWrite = num(m.cacheCreationCostPerMillion ?? m.cache_creation_cost_per_million)
  if (input !== undefined) entry.input_cost_per_million_tokens = input
  if (output !== undefined) entry.output_cost_per_million_tokens = output
  if (cacheRead !== undefined) entry.cache_read_input_token_cost_per_million_tokens = cacheRead
  if (cacheWrite !== undefined) entry.cache_creation_input_token_cost_per_million_tokens = cacheWrite
  if (Object.keys(entry).length === 0) continue
  models[id] = entry
  priced += 1
}

await mkdir(join(process.env.APPDATA ?? configDir, 'tokscale'), { recursive: true })
await writeFile(OUT, JSON.stringify({ models }, null, 2), 'utf8')
console.log(`read ${list.length} priced models from ${SRC}`)
console.log(`wrote ${priced} entries to ${OUT}`)
