import { DEFAULT_CONFIG } from './sim.js'

export const LIMITS = {
  limit: { min: 1, max: 50, step: 1 },
  windowSec: { min: 1, max: 60, step: 1 },
  refillPerSec: { min: 0.1, max: 20, step: 0.1 },
  rate: { min: 0.5, max: 30, step: 0.5 },
  burst: { min: 2, max: 50, step: 1 },
}
export const SPEEDS = [0.25, 0.5, 1, 2, 4]
export const TRAFFIC_MODES = ['off', 'steady', 'poisson']

export const DEFAULT_SCENARIO = {
  limit: DEFAULT_CONFIG.limit,
  windowSec: DEFAULT_CONFIG.windowMs / 1000,
  refillPerSec: DEFAULT_CONFIG.refillPerSec,
  traffic: 'off',
  rate: 2,
  burst: 8,
  speed: 1,
}

const clamp = (v, { min, max, step }) => {
  const n = Math.min(max, Math.max(min, v))
  return Math.round(n / step) * step
}
const round = (v) => Math.round(v * 100) / 100

export function encodeScenario(s) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(s)) if (v !== DEFAULT_SCENARIO[k]) p.set(k, String(v))
  return p.toString()
}

export function decodeScenario(hash) {
  const p = new URLSearchParams(String(hash ?? '').replace(/^#/, ''))
  const out = { ...DEFAULT_SCENARIO }
  for (const key of ['limit', 'windowSec', 'refillPerSec', 'rate', 'burst']) {
    if (!p.has(key)) continue
    const n = Number(p.get(key))
    if (Number.isFinite(n)) out[key] = round(clamp(n, LIMITS[key]))
  }
  if (TRAFFIC_MODES.includes(p.get('traffic'))) out.traffic = p.get('traffic')
  const speed = Number(p.get('speed'))
  if (SPEEDS.includes(speed)) out.speed = speed
  return out
}

export const toLimiterConfig = (s) => ({ limit: s.limit, windowMs: Math.round(s.windowSec * 1000), refillPerSec: s.refillPerSec })
