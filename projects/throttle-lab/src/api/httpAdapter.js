import { ApiError } from './errors.js'
import { configFor, newClientKey } from './contract.js'

/** Talks to server/demo.js. Same method names, result shape and ApiError as the local adapter. */
export function createHttpAdapter(baseUrl, { key = newClientKey(), fetchImpl = (...a) => fetch(...a) } = {}) {
  const base = baseUrl.replace(/\/+$/, '')
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  async function request(path, init) {
    let res
    try {
      res = await fetchImpl(`${base}${path}`, init)
    } catch (err) {
      throw new ApiError(0, 'network_error', `Could not reach ${base}: ${err.message}`)
    }
    const body = await res.json().catch(() => ({}))
    return { res, body }
  }

  const fail = (res, body) => {
    const e = body.error ?? {}
    return new ApiError(res.status, e.code ?? 'http_error', e.message ?? `Request failed (${res.status})`, e.details)
  }

  return {
    mode: 'http',
    label: `Real server at ${base}`,
    key,
    async hit(algo) {
      const t0 = now()
      const { res, body } = await request(`/api/limited/${encodeURIComponent(algo)}?key=${key}`)
      if (res.status !== 200 && res.status !== 429) throw fail(res, body)
      const retry = res.headers.get('Retry-After')
      return {
        algo,
        status: res.status,
        allowed: res.status === 200,
        remaining: Number(res.headers.get('RateLimit-Remaining') ?? body.remaining ?? 0),
        retryAfterSec: res.status === 429 && retry !== null ? Number(retry) : null,
        message: body.explanation ?? body.error?.message ?? '',
        ms: Math.round(now() - t0),
      }
    },
    async configure(algo, cfg) {
      const { res, body } = await request(`/api/config/${encodeURIComponent(algo)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configFor(algo, cfg)),
      })
      if (!res.ok) throw fail(res, body)
      return body.config
    },
    async reset(algo) {
      const { res, body } = await request(`/api/reset/${encodeURIComponent(algo)}?key=${key}`, { method: 'POST' })
      if (!res.ok) throw fail(res, body)
    },
  }
}
