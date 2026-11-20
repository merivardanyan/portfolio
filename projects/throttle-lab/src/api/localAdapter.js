import { createLimiter, systemClock, explain } from '../../lib/index.js'
import { ApiError } from './errors.js'
import { ALGORITHMS, SERVER_DEFAULTS, BOUNDS, configFor, newClientKey } from './contract.js'

/**
 * In-browser emulation of server/'s endpoints: same limiter library, same defaults, same validation
 * and error codes, on the real wall clock. The static demo uses it so the "API responses" panel works
 * without a server; the http adapter swaps in the real thing.
 */
export function createLocalAdapter({ clock = systemClock, key = newClientKey() } = {}) {
  const limiters = Object.fromEntries(ALGORITHMS.map((a) => [a, createLimiter(a, { ...SERVER_DEFAULTS[a], clock })]))
  const started = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  const limiterFor = (algo) => {
    if (!Object.hasOwn(limiters, algo)) throw new ApiError(404, 'unknown_algorithm', `Unknown algorithm '${algo}'`, { algorithms: ALGORITHMS })
    return limiters[algo]
  }

  return {
    mode: 'local',
    label: 'In-browser API emulation',
    key,
    async hit(algo) {
      const t0 = started()
      const r = limiterFor(algo).consume(key)
      return {
        algo,
        status: r.allowed ? 200 : 429,
        allowed: r.allowed,
        remaining: r.remaining,
        retryAfterSec: r.allowed ? null : Math.max(1, Math.ceil(r.retryAfterMs / 1000)),
        message: explain(r),
        ms: Math.round(started() - t0),
      }
    },
    async configure(algo, cfg) {
      const l = limiterFor(algo)
      const patch = configFor(algo, cfg)
      const details = []
      for (const [k, v] of Object.entries(patch)) {
        const [lo, hi] = BOUNDS[k]
        if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi || (k !== 'refillPerSec' && !Number.isInteger(v))) {
          details.push({ field: k, message: `must be ${k === 'refillPerSec' ? 'a number' : 'an integer'} in [${lo}, ${hi}]` })
        }
      }
      if (details.length) throw new ApiError(422, 'validation_failed', 'Invalid config', details)
      return l.configure(patch)
    },
    async reset(algo) {
      limiterFor(algo).reset(key)
    },
  }
}
