import { describe, expect, it } from 'vitest'
import type { UnifiedIndexStore } from '../src/index-store.ts'
import { isLoopbackRequest, registerRoutes, type WebServerLike } from '../src/transport.ts'

const API = '/usage-unified/v1'

function harness() {
  let handler: ((request: unknown, response: unknown) => void | Promise<void>) | undefined
  const webServer: WebServerLike = {
    register(route) {
      handler = route.handler as unknown as typeof handler
      return () => {}
    },
  }
  const callsSeen: Record<string, unknown>[] = []
  const store = {
    refresh: async () => {},
    snapshot: () => ({ version: 1, generatedAt: 1, tz: 'UTC', range: { from: '', to: '', timeZone: 'UTC', id: 'all' }, status: { phase: 'ready', indexed: 1, total: 1, durable: true, updatedAt: 1 }, totals: {}, allTime: {}, mostUsedModel: null, days: [], hours: [], models: [], workspaces: [], sessions: [], sessionTotal: 0, cost: null, homes: [], coverage: {} }),
    calls: (query: Record<string, unknown>) => { callsSeen.push(query); return { indexReady: true, items: [], page: 1, pageSize: 50, total: 0, hasMore: false } },
  } as unknown as UnifiedIndexStore
  const dispose = registerRoutes(webServer, store, API)
  return { handler: handler!, dispose, callsSeen }
}

function request(method: string, url: string, remoteAddress = '127.0.0.1'): unknown {
  return { method, url, socket: { remoteAddress } }
}

function response() {
  const state = { status: 0, headers: {} as Record<string, unknown>, body: '' }
  return {
    state,
    writeHead(status: number, headers?: Record<string, unknown>) { state.status = status; if (headers) Object.assign(state.headers, headers) },
    setHeader(key: string, value: unknown) { state.headers[key] = value },
    end(body?: unknown) { if (body !== undefined && body !== null) state.body += String(body) },
  }
}

describe('transport routes', () => {
  it('answers loopback snapshot requests with JSON', async () => {
    const { handler } = harness()
    const res = response()
    await handler(request('GET', `${API}/snapshot?range=7d`), res)
    expect(res.state.status).toBe(200)
    expect(res.state.headers['content-type']).toContain('application/json')
    expect(JSON.parse(res.state.body)).toMatchObject({ version: 1 })
  })

  it('serves CSV with an attachment disposition', async () => {
    const { handler } = harness()
    const res = response()
    await handler(request('GET', `${API}/export.csv?range=all`), res)
    expect(res.state.status).toBe(200)
    expect(res.state.headers['content-type']).toContain('text/csv')
    expect(String(res.state.headers['content-disposition'])).toContain('attachment')
  })

  it('rejects non-loopback callers', async () => {
    const { handler } = harness()
    const res = response()
    await handler(request('GET', `${API}/snapshot`, '203.0.113.9'), res)
    expect(res.state.status).toBe(403)
    expect(JSON.parse(res.state.body).error).toMatch(/loopback/)
  })

  it('rejects writes and unknown paths and bad params', async () => {
    const { handler } = harness()
    const post = response()
    await handler(request('POST', `${API}/snapshot`), post)
    expect(post.state.status).toBe(405)

    const missing = response()
    await handler(request('GET', `${API}/nope`), missing)
    expect(missing.state.status).toBe(404)

    const badRange = response()
    await handler(request('GET', `${API}/snapshot?range=decade`), badRange)
    expect(badRange.state.status).toBe(400)

    const badPage = response()
    await handler(request('GET', `${API}/calls?pageSize=999`), badPage)
    expect(badPage.state.status).toBe(400)
  })

  it('passes a session drill-down through to the store, and rejects junk', async () => {
    const { handler, callsSeen } = harness()
    const ok = response()
    await handler(request('GET', `${API}/calls?session=session-main`), ok)
    expect(ok.state.status).toBe(200)
    expect(callsSeen[0]?.['session']).toBe('session-main')

    const empty = response()
    await handler(request('GET', `${API}/calls?session=`), empty)
    expect(empty.state.status).toBe(400)

    const long = response()
    await handler(request('GET', `${API}/calls?session=${'x'.repeat(300)}`), long)
    expect(long.state.status).toBe(400)
  })

  it('sends no body for HEAD', async () => {
    const { handler } = harness()
    const res = response()
    await handler(request('HEAD', `${API}/snapshot`), res)
    expect(res.state.status).toBe(200)
    expect(res.state.body).toBe('')
  })
})

describe('loopback guard', () => {
  it('accepts IPv4/IPv6 loopback and mapped forms only', () => {
    expect(isLoopbackRequest(request('GET', '/', '127.0.0.1') as never)).toBe(true)
    expect(isLoopbackRequest(request('GET', '/', '::1') as never)).toBe(true)
    expect(isLoopbackRequest(request('GET', '/', '::ffff:127.0.0.1') as never)).toBe(true)
    expect(isLoopbackRequest(request('GET', '/', '10.0.0.5') as never)).toBe(false)
  })
})
