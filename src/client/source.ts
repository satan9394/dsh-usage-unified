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

function messageOf(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string') {
    return (body as { error: string }).error
  }
  return `request failed with status ${status}`
}

function commonParams(range: RangeId, scope: TaskScope, workspace: string): URLSearchParams {
  const params = new URLSearchParams({ range, scope, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' })
  if (workspace !== '') params.set('workspace', workspace)
  return params
}

/** Fetch the dashboard snapshot for one window. */
export async function fetchSnapshot(
  range: RangeId,
  scope: TaskScope,
  workspace: string,
  signal: AbortSignal,
): Promise<Snapshot> {
  const response = await fetch(`${API_PATH}/snapshot?${commonParams(range, scope, workspace)}`, {
    signal,
    headers: { accept: 'application/json' },
  })
  const body: unknown = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(messageOf(body, response.status))
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
  minInputTokens: string
  minOutputTokens: string
  page: number
  pageSize: number
  maxRecords: number
}

/** Fetch one page of call rows. */
export async function fetchCalls(request: CallsRequest, signal: AbortSignal): Promise<CallsPage> {
  const params = commonParams(request.range, request.scope, request.workspace)
  params.set('page', String(request.page))
  params.set('pageSize', String(request.pageSize))
  params.set('maxRecords', String(request.maxRecords))
  if (request.model !== '') params.set('model', request.model)
  if (request.provider !== '') params.set('provider', request.provider)
  if (request.minInputTokens !== '') params.set('minInputTokens', request.minInputTokens)
  if (request.minOutputTokens !== '') params.set('minOutputTokens', request.minOutputTokens)
  const response = await fetch(`${API_PATH}/calls?${params}`, { signal, headers: { accept: 'application/json' } })
  const body: unknown = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(messageOf(body, response.status))
  return body as CallsPage
}

/** Same-origin download URL for a CSV/JSON export of the current window. */
export function exportUrl(range: RangeId, scope: TaskScope, workspace: string, format: 'csv' | 'json'): string {
  return `${API_PATH}/export.${format}?${commonParams(range, scope, workspace)}`
}
