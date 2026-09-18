/**
 * `dsh-usage-unified` — host half.
 *
 * Owns one machine-wide index of token usage folded from every dsh home's
 * session logs and serves it to the browser half over same-origin loopback
 * routes. Read-only: this plugin observes logs and never writes to a session,
 * a projection, or another home.
 *
 * Mounting it costs the conversation nothing — it registers no model-facing
 * tool and appends no session event.
 *
 * @module dsh-usage-unified
 */

import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath, resolveDshHome } from '@deepseek-ai/dsh-home-paths'
// Type-only: applies the `ctx.webServer` Context merge without a value import.
import type {} from '@deepseek-ai/dsh-host-webserver'
import Schema from '@deepseek-ai/schemastery'
import { localTimeZone, UnifiedIndexStore } from './index-store.ts'
import { DEFAULT_API_PATH, registerRoutes } from './transport.ts'

export const name = 'usage-unified'

export * from './types.ts'
export { DEFAULT_API_PATH, registerRoutes } from './transport.ts'
export { UnifiedIndexStore } from './index-store.ts'
export { FOLD_VERSION, createFoldState, foldEvents, hasWork, isSubtask } from './fold.ts'
export { aggregateSnapshot, collectCalls, exportCsv, peakHourOf, rangeBounds, streaks } from './aggregate.ts'
export { applyPricing, costOf, DEFAULT_PEAK_SHARE, loadPricing, lookupPrice, normalizeModelId, parsePricing } from './pricing.ts'
export { decodeArtifactBytes, logPriority, readArtifact, walkSessionArtifacts } from './reader.ts'
export { discoverDshHomes } from './homes.ts'
export { scanZstdFrames } from './zstd-frames.ts'

/** Plugin configuration. */
export interface Config {
  /**
   * Extra dsh home directories to scan. Home discovery is a heuristic over
   * `~/.dsh`, `~/.dsh_desktop/<version>` and `$DSH_HOME`, not a documented
   * contract, so a home reached through a `$DSH_HOME` that is not currently
   * set is invisible to it — list it here.
   */
  extraSessionRoots: string[]
  /**
   * Count the tokens spent generating compaction summaries. They are real
   * spend the upstream `tokenUsage` projection cannot see; set false to
   * reconcile 1:1 with it.
   */
  includeCompaction: boolean
  /** How often to re-scan for appended sessions, in ms. */
  refreshIntervalMs: number
  /** Cooperative yield interval while scanning, so a cold build stays responsive. */
  indexChunkYieldMs: number
  /** Same-origin read-only API prefix. */
  apiPath: string
  /** Optional index cache path; defaults below `DSH_HOME`. */
  cachePath?: string
  /**
   * Optional pricing table used for the cost estimate. Defaults to
   * `$DSH_HOME/usage-unified/pricing.json`; when the file is missing, no cost
   * is shown rather than a guessed one.
   */
  pricingPath?: string
  /** Sessions decoded in parallel during a scan. */
  indexConcurrency: number
  /** Debounce delay for index writes, in ms. */
  cacheWriteDelayMs: number
}

export const Config: Schema<Config> = Schema.object({
  extraSessionRoots: Schema.array(String).default([]),
  includeCompaction: Schema.boolean().default(true),
  refreshIntervalMs: Schema.number().min(1000).default(30_000),
  indexChunkYieldMs: Schema.number().min(1).max(1000).default(16),
  apiPath: Schema.string().default(DEFAULT_API_PATH),
  cachePath: Schema.string().description('Optional index path; defaults below DSH_HOME.'),
  pricingPath: Schema.string().description('Optional pricing table; defaults below DSH_HOME.'),
  indexConcurrency: Schema.number().min(1).max(16).default(4),
  cacheWriteDelayMs: Schema.number().min(250).max(30_000).default(1000),
})

/**
 * Mount the index and its transport.
 * @param ctx - the plugin context.
 * @param config - validated configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const apiPath = (config.apiPath || DEFAULT_API_PATH).replace(/\/$/, '')
  const store = new UnifiedIndexStore({
    extraSessionRoots: config.extraSessionRoots,
    includeCompaction: config.includeCompaction,
    chunkYieldMs: config.indexChunkYieldMs,
    currentHome: resolveDshHome(),
    cachePath: config.cachePath ?? dshHomePath('usage-unified', 'index-v1.json'),
    pricingPath: config.pricingPath ?? dshHomePath('usage-unified', 'pricing.json'),
    concurrency: config.indexConcurrency,
    cacheWriteDelayMs: config.cacheWriteDelayMs,
  })
  ctx.effect(() => () => { store.dispose() }, 'usageUnified.index')

  // The transport is optional: a headless composition has no web server, and
  // the index is still worth keeping warm for whoever attaches later.
  const serverFiber = ctx.inject(['webServer'], (childCtx: Context) => {
    childCtx.effect(() => registerRoutes(childCtx.webServer, store, apiPath), 'usageUnified.route')
  })
  ctx.effect(() => () => { serverFiber.dispose() }, 'usageUnified.optionalWebServer')

  ctx.effect(() => {
    void store.refresh()
    const timer = setInterval(() => { void store.refresh() }, config.refreshIntervalMs)
    // Node keeps the process alive for pending timers; a statistics refresh
    // must never be the reason a headless run does not exit.
    timer.unref?.()
    return () => {
      clearInterval(timer)
      void store.flush()
    }
  }, 'usageUnified.refreshLoop')

  ctx.logger?.debug?.('usage-unified: indexing in %s', localTimeZone())
}
