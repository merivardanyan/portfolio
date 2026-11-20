import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createManualClock } from '../lib/index.js'
import { createHttpServer } from '../server/src/app.js'
import { createLocalAdapter } from '../src/api/localAdapter.js'
import { createHttpAdapter } from '../src/api/httpAdapter.js'
import { ApiError } from '../src/api/errors.js'

// One contract, two adapters: the in-browser emulation and the http adapter against the real server.
const clock = createManualClock(1_000_000)
let server
let base

beforeAll(async () => {
  server = createHttpServer({ clock, corsOrigin: '*' })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(() => new Promise((r) => server.close(r)))

const makers = [
  ['local', (key) => createLocalAdapter({ clock, key })],
  ['http', (key) => createHttpAdapter(base, { key })],
]

describe.each(makers)('%s adapter', (mode, make) => {
  it('allows the default limit of 5, then returns a 429 result (not an error)', async () => {
    const api = make(`c-${mode}-1`)
    expect(api.mode).toBe(mode)
    const results = []
    for (let i = 0; i < 6; i++) results.push(await api.hit('fixedWindow'))
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 429])
    expect(results.map((r) => r.remaining)).toEqual([4, 3, 2, 1, 0, 0])
    const denied = results[5]
    expect(denied.allowed).toBe(false)
    expect(denied.retryAfterSec).toBeGreaterThanOrEqual(1)
    expect(denied.message).toMatch(/^Denied \(429\)/)
    expect(results[0].retryAfterSec).toBeNull()
    expect(results[0].message).toMatch(/^Allowed/)
  })

  it('configures with validation and resets a key', async () => {
    const api = make(`c-${mode}-2`)
    const cfg = await api.configure('tokenBucket', { limit: 2, windowMs: 999, refillPerSec: 1 })
    expect(cfg).toMatchObject({ limit: 2, refillPerSec: 1 })
    expect((await api.hit('tokenBucket')).status).toBe(200)
    expect((await api.hit('tokenBucket')).status).toBe(200)
    expect((await api.hit('tokenBucket')).status).toBe(429)
    await api.reset('tokenBucket')
    expect((await api.hit('tokenBucket')).status).toBe(200)
    await api.configure('tokenBucket', { limit: 5, refillPerSec: 0.5 })
  })

  it('throws ApiError with the server codes', async () => {
    const api = make(`c-${mode}-3`)
    await expect(api.hit('nope')).rejects.toMatchObject({ name: 'ApiError', status: 404, code: 'unknown_algorithm' })
    const err = await api.configure('fixedWindow', { limit: 0, windowMs: 10_000 }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 422, code: 'validation_failed' })
    expect(err.details[0].field).toBe('limit')
  })
})

describe('http adapter transport errors', () => {
  it('wraps network failures in ApiError', async () => {
    const api = createHttpAdapter('http://example.invalid', { fetchImpl: () => Promise.reject(new Error('offline')) })
    await expect(api.hit('fixedWindow')).rejects.toMatchObject({ status: 0, code: 'network_error' })
  })
})
