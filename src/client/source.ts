/**
 * The transport seam: everything the panel knows about how data reaches it.
 *
 * Swapping the host routes for a typert `@Remote` face would rewrite this file
 * and nothing else.
 *
 * @module dsh-usage-unified/client/source
 */

import type { CallsPage, RangeId, Snapshot, TaskScope } from '../types.ts'

/** Must match the host's `apiPath`. */
export const API_PATH = '/usage-unified/v1'

/** Wire schema this build understands. */
const SUPPORTED_VERSION = 1

/**
 * How long one request may stay unanswered before the panel says so.
 *
 * Without this, a request that never settles leaves the panel on its spinner
 * with no error and no retry — the state a frozen host produces. A timeout
 * turns that into a message, and the 60 s auto-refresh retries it.
 */
const REQUEST_TIMEOUT_MS = 20_000

function messageOf(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string') {
    return (body as { error: string }).error
  }
  return `request failed with status ${status}`
}

/**
 * GET one JSON body, bounded in time and honest about which side gave up.
 *
 * @param url - same-origin absolute path.
 * @param signal - the caller's abort signal (range switches, unmount).
 */
async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const controller = new AbortController()
  const forward = (): void => { controller.abort() }
  if (signal.aborted) forward()
  else signal.addEventListener('abort', forward, { once: true })
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } })
    const body: unknown = await response.json().catch(() => undefined)
    if (!response.ok) throw new Error(messageOf(body, response.status))
    return body
  } catch (error) {
    // An abort caused by our own timer is a failure, not a cancellation: the
    // panel must show it rather than spin forever.
    if (timedOut) throw new Error(`no answer within ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s`)
    throw error
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', forward)
  }
}

/**
 * Query parameters shared by every route.
 *
 * Day boundaries come from the host process's own timezone, which is what the
 * snapshot reports back in `timeZone`. The browser's timezone is deliberately
 * not sent: the host has never read it, so sending it only advertised a value
 * that changed nothing.
 */
function commonParams(range: RangeId, scope: TaskScope, workspace: string): URLSearchParams {
  const params = new URLSearchParams({ range, scope })
  if (workspace !== '') params.set('workspace', workspace)
  return params
}

/**
 * Inclusive lower bound for a custom range, plus an optional upper one.
 *
 * Omitting `to` is the start-to-now mode: the host fills in today, so the window
 * keeps extending as days pass instead of freezing on the day it was chosen.
 */
export interface CustomRange {
  from: string
  to?: string
}

function withCustom(params: URLSearchParams, custom?: CustomRange): URLSearchParams {
  if (custom !== undefined) {
    params.set('from', custom.from)
    if (custom.to !== undefined) params.set('to', custom.to)
  }
  return params
}

/** Fetch the dashboard snapshot for one window. */
export async function fetchSnapshot(
  range: RangeId,
  scope: TaskScope,
  workspace: string,
  signal: AbortSignal,
  custom?: CustomRange,
): Promise<Snapshot> {
  const params = withCustom(commonParams(range, scope, workspace), custom)
  const body = await fetchJson(`${API_PATH}/snapshot?${params}`, signal)
  const snapshot = body as Snapshot | undefined
  if (snapshot?.version !== SUPPORTED_VERSION) {
    throw new Error('usage-unified format mismatch — reload after the update completes')
  }
  return snapshot
}

/** Filters and pagination for the call-detail route. */
export interface CallsRequest {
  range: RangeId
  scope: TaskScope
  workspace: string
  model: string
  provider: string
  /** Session id from the ranking drill-down; '' means no session filter. */
  session: string
  minInputTokens: string
  minOutputTokens: string
  page: number
  pageSize: number
  maxRecords: number
  custom?: CustomRange
}

/** Fetch one page of call rows. */
export async function fetchCalls(request: CallsRequest, signal: AbortSignal): Promise<CallsPage> {
  const params = withCustom(commonParams(request.range, request.scope, request.workspace), request.custom)
  params.set('page', String(request.page))
  params.set('pageSize', String(request.pageSize))
  params.set('maxRecords', String(request.maxRecords))
  if (request.model !== '') params.set('model', request.model)
  if (request.provider !== '') params.set('provider', request.provider)
  if (request.session !== '') params.set('session', request.session)
  if (request.minInputTokens !== '') params.set('minInputTokens', request.minInputTokens)
  if (request.minOutputTokens !== '') params.set('minOutputTokens', request.minOutputTokens)
  const body = await fetchJson(`${API_PATH}/calls?${params}`, signal)
  return body as CallsPage
}

/** Same-origin download URL for a CSV/JSON export of the current window. */
export function exportUrl(range: RangeId, scope: TaskScope, workspace: string, format: 'csv' | 'json', custom?: CustomRange): string {
  return `${API_PATH}/export.${format}?${withCustom(commonParams(range, scope, workspace), custom)}`
}
