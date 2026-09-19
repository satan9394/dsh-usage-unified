/**
 * Host → browser transport.
 *
 * One same-origin read-only route prefix on `ctx.webServer`, serving a
 * snapshot, paginated call rows, and CSV/JSON exports. It is deliberately not
 * a typert `@Remote` face: the payload is a plain snapshot, both halves ship
 * in one package and therefore already share `./types.ts`.
 *
 * The route carries working-directory paths — effectively a list of the
 * user's projects — so it answers loopback callers only.
 *
 * @module dsh-usage-unified/transport
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { exportCsv } from './aggregate.ts'
import type { UnifiedIndexStore } from './index-store.ts'
import type { RangeId, TaskScope } from './types.ts'

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/** Whether a request arrived over the loopback interface. */
export function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  return address !== undefined && LOOPBACK_ADDRESSES.has(address)
}

/** Minimal view of the route registry this module needs. */
export interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  }): () => void
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  // A null body is the HEAD answer: headers only, no payload.
  const payload = body === null ? '' : JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(payload)
}

// `custom` is deliberately absent: a hand-picked span arrives as from/to, never
// as a range value, so accepting it here would let a client ask for a window
// with no bounds.
const RANGES = new Set<RangeId>(['all', '1d', '7d', '14d', '30d'])

/**
 * Retired range ids that still answer, mapped to their replacement.
 *
 * `year` fed the activity heatmap, which both halves have dropped. A browser
 * holding a cached client bundle can still ask for it, and a 400 there would
 * break the whole panel rather than one removed chart — so it degrades to
 * all-time instead of failing.
 */
const RANGE_ALIASES = new Map<string, RangeId>([['year', 'all']])
const SCOPES = new Set<TaskScope>(['all', 'main', 'subtasks'])

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

interface ParsedCommon {
  range: RangeId
  scope: TaskScope
  workspace?: string
  from?: string
  to?: string
}

function parseCommon(url: URL): ParsedCommon {
  const requested = url.searchParams.get('range') ?? 'all'
  const range = RANGE_ALIASES.get(requested) ?? requested
  if (!RANGES.has(range as RangeId)) throw new Error('Invalid range')
  const scope = url.searchParams.get('scope') ?? 'all'
  if (!SCOPES.has(scope as TaskScope)) throw new Error('Invalid task scope')
  const rawWorkspace = url.searchParams.get('workspace') ?? undefined
  if (rawWorkspace !== undefined && (rawWorkspace.length === 0 || rawWorkspace.length > 4096)) {
    throw new Error('Invalid workspace filter')
  }
  const rawFrom = url.searchParams.get('from') ?? undefined
  const rawTo = url.searchParams.get('to') ?? undefined
  if (rawFrom !== undefined && !ISO_DATE.test(rawFrom)) throw new Error('Invalid from date')
  if (rawTo !== undefined && !ISO_DATE.test(rawTo)) throw new Error('Invalid to date')
  // An upper bound with no lower one has no sane default. A lower bound on its
  // own is the start-to-now mode and stays open-ended on purpose.
  if (rawTo !== undefined && rawFrom === undefined) throw new Error('A to date needs a from date')
  if (rawFrom !== undefined && rawTo !== undefined && rawFrom > rawTo) throw new Error('Invalid date range')
  const parsed: ParsedCommon = { range: range as RangeId, scope: scope as TaskScope }
  if (rawWorkspace !== undefined) parsed.workspace = rawWorkspace
  if (rawFrom !== undefined) parsed.from = rawFrom
  if (rawTo !== undefined) parsed.to = rawTo
  return parsed
}

function parseInteger(url: URL, name: string, min: number, max: number, fallback: number): number {
  const raw = url.searchParams.get(name)
  if (raw === null || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`)
  return value
}

/**
 * Serve the unified routes.
 *
 * @param webServer - `ctx.webServer`.
 * @param store - the index answering every query.
 * @param apiPath - the same-origin prefix, without a trailing slash.
 * @returns the disposer removing the route.
 */
export function registerRoutes(
  webServer: WebServerLike,
  store: UnifiedIndexStore,
  apiPath: string,
): () => void {
  return webServer.register({
    kind: 'prefix',
    path: apiPath,
    handler: (request, response) => {
      if (!isLoopbackRequest(request)) {
        sendJson(response, 403, { error: 'usage statistics are served to loopback clients only' })
        return
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { allow: 'GET, HEAD' })
        response.end()
        return
      }
      const url = new URL(request.url ?? '/', 'http://localhost')
      // Never awaited: the panel renders what the index already holds and
      // reports its own build progress, rather than blocking on a scan.
      void store.refresh()
      const head = request.method === 'HEAD'
      try {
        if (url.pathname === `${apiPath}/calls`) {
          const common = parseCommon(url)
          const model = url.searchParams.get('model') ?? undefined
          const provider = url.searchParams.get('provider') ?? undefined
          const session = url.searchParams.get('session') ?? undefined
          if (model !== undefined && model.length > 4096) throw new Error('Invalid model filter')
          if (provider !== undefined && provider.length > 4096) throw new Error('Invalid provider filter')
          if (session !== undefined && (session.length === 0 || session.length > 256)) throw new Error('Invalid session filter')
          const threshold = (name: string): number | undefined => {
            const raw = url.searchParams.get(name)
            if (raw === null || raw === '') return undefined
            const value = Number(raw)
            if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}`)
            return value
          }
          const minInputTokens = threshold('minInputTokens')
          const minOutputTokens = threshold('minOutputTokens')
          const page = store.calls({
            ...common,
            page: parseInteger(url, 'page', 1, 1_000_000, 1),
            pageSize: parseInteger(url, 'pageSize', 1, 200, 50),
            maxRecords: parseInteger(url, 'maxRecords', 1, 10_000, 1_000),
            ...(model === undefined ? {} : { model }),
            ...(provider === undefined ? {} : { provider }),
            ...(session === undefined ? {} : { session }),
            ...(minInputTokens === undefined ? {} : { minInputTokens }),
            ...(minOutputTokens === undefined ? {} : { minOutputTokens }),
          })
          sendJson(response, 200, head ? null : page)
          return
        }
        const common = parseCommon(url)
        const snapshot = store.snapshot(common)
        if (url.pathname === `${apiPath}/export.csv`) {
          const csv = exportCsv(snapshot.days, snapshot.models)
          response.writeHead(200, {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="dsh-usage-unified.csv"',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          })
          response.end(head ? undefined : `\uFEFF${csv}`)
          return
        }
        if (url.pathname === `${apiPath}/export.json`) {
          response.setHeader('content-disposition', 'attachment; filename="dsh-usage-unified.json"')
        } else if (url.pathname !== `${apiPath}/snapshot`) {
          sendJson(response, 404, { error: 'Not found' })
          return
        }
        sendJson(response, 200, head ? null : snapshot)
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : 'Bad request' })
      }
    },
  })
}

/** The path segment the snapshot route answers on, for the client's reference. */
export const DEFAULT_API_PATH = '/usage-unified/v1'
