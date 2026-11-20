// Shared by both adapters so they agree on what the server accepts.
export const ALGORITHMS = ['fixedWindow', 'slidingLog', 'slidingCounter', 'tokenBucket']
export const SERVER_DEFAULTS = {
  fixedWindow: { limit: 5, windowMs: 10_000 },
  slidingLog: { limit: 5, windowMs: 10_000 },
  slidingCounter: { limit: 5, windowMs: 10_000 },
  tokenBucket: { limit: 5, refillPerSec: 0.5 },
}
export const CONFIG_FIELDS = {
  fixedWindow: ['limit', 'windowMs'], slidingLog: ['limit', 'windowMs'], slidingCounter: ['limit', 'windowMs'], tokenBucket: ['limit', 'refillPerSec'],
}
export const BOUNDS = { limit: [1, 1000], windowMs: [100, 3_600_000], refillPerSec: [0.01, 1000] }

/** Picks the fields an algorithm accepts from a shared { limit, windowMs, refillPerSec } config. */
export const configFor = (algo, cfg) => Object.fromEntries(CONFIG_FIELDS[algo].map((k) => [k, cfg[k]]))

export const newClientKey = () => `lab-${Math.random().toString(36).slice(2, 8)}`
