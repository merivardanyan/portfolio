import { describe, it, expect } from 'vitest'
import { createSim, runBoundaryBurst, ALGOS, mulberry32 } from '../src/sim.js'
import { encodeScenario, decodeScenario, DEFAULT_SCENARIO, toLimiterConfig } from '../src/scenario.js'

const allowedCount = (sim, algo) => sim.events(algo).filter((e) => e.allowed).length

describe('sim', () => {
  it('fires one request at every algorithm with explanations', () => {
    const sim = createSim()
    const created = sim.fire(1)
    expect(created.map((e) => e.algo)).toEqual(ALGOS)
    expect(created.every((e) => e.allowed && e.id === 1 && e.text.startsWith('Allowed'))).toBe(true)
  })

  it('a burst over the limit is denied everywhere, with an exact retry time', () => {
    const sim = createSim()
    sim.fire(7)
    for (const algo of ALGOS) {
      expect(sim.totals(algo)).toEqual({ allowed: 5, denied: 2 })
      const denied = sim.events(algo).find((e) => !e.allowed)
      expect(denied.result.retryAfterMs).toBeGreaterThan(0)
      expect(denied.text).toMatch(/^Denied \(429\)/)
    }
  })

  it('boundary burst: only fixed window lets 2x the limit through', () => {
    const sim = createSim()
    runBoundaryBurst(sim)
    expect(allowedCount(sim, 'fixedWindow')).toBe(10)
    expect(allowedCount(sim, 'slidingLog')).toBe(5)
    expect(allowedCount(sim, 'slidingCounter')).toBe(5)
    expect(allowedCount(sim, 'tokenBucket')).toBe(5)
    expect(sim.now).toBe(10_800)
  })

  it('steady traffic arrives at exact intervals regardless of tick size', () => {
    const a = createSim()
    const b = createSim()
    a.setTraffic({ mode: 'steady', rate: 4 })
    b.setTraffic({ mode: 'steady', rate: 4 })
    a.tick(3000)
    for (let i = 0; i < 300; i++) b.tick(10)
    const times = (s) => s.events('tokenBucket').map((e) => e.t)
    expect(times(a)).toEqual([250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2250, 2500, 2750, 3000])
    expect(times(b)).toEqual(times(a))
  })

  it('poisson traffic is seeded and averages near its rate', () => {
    const run = () => {
      const s = createSim({ seed: 7, historyMs: 1e9 })
      s.setTraffic({ mode: 'poisson', rate: 5 })
      s.tick(200_000)
      return s.events('fixedWindow').length
    }
    const n = run()
    expect(n).toBe(run())
    expect(n / 200).toBeGreaterThan(4.5)
    expect(n / 200).toBeLessThan(5.5)
  })

  it('turning traffic off stops arrivals; rate validation', () => {
    const sim = createSim()
    sim.setTraffic({ mode: 'steady', rate: 10 })
    sim.tick(1000)
    sim.setTraffic({ mode: 'off' })
    sim.tick(5000)
    expect(sim.events('slidingLog')).toHaveLength(10)
    expect(sim.traffic).toEqual({ mode: 'off', rate: 10 })
    expect(() => sim.setTraffic({ mode: 'flood' })).toThrow(RangeError)
    expect(() => sim.setTraffic({ rate: 0 })).toThrow(RangeError)
    expect(() => sim.tick(-1)).toThrow(RangeError)
  })

  it('prunes history but keeps totals', () => {
    const sim = createSim({ historyMs: 2000 })
    sim.fire(1)
    sim.tick(5000)
    sim.fire(1)
    expect(sim.events()).toHaveLength(4)
    expect(sim.totals('fixedWindow').allowed).toBe(2)
  })

  it('reconfigures live, and rejects invalid config without changing anything', () => {
    const sim = createSim()
    sim.configure({ limit: 2 })
    sim.fire(3)
    expect(sim.totals('tokenBucket')).toEqual({ allowed: 2, denied: 1 })
    expect(() => sim.configure({ refillPerSec: -1 })).toThrow(RangeError)
    expect(() => sim.configure({ limit: 0 })).toThrow(RangeError)
    expect(sim.config.limit).toBe(2)
    expect(sim.inspect('tokenBucket').capacity).toBe(2)
  })

  it('token bucket refills on the simulated clock', () => {
    const sim = createSim()
    sim.fire(5)
    expect(sim.inspect('tokenBucket').remaining).toBe(0)
    sim.tick(4000)
    expect(sim.inspect('tokenBucket').remaining).toBe(2)
    sim.reset()
    expect(sim.now).toBe(0)
    expect(sim.events()).toHaveLength(0)
    expect(sim.inspect('fixedWindow').count).toBe(0)
  })

  it('mulberry32 is deterministic and in [0, 1)', () => {
    const r = mulberry32(3)
    const xs = Array.from({ length: 1000 }, r)
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
    expect(mulberry32(3)()).toBe(xs[0])
  })
})

describe('scenario', () => {
  it('round-trips and omits defaults', () => {
    expect(encodeScenario(DEFAULT_SCENARIO)).toBe('')
    const s = { ...DEFAULT_SCENARIO, limit: 10, traffic: 'poisson', rate: 6.5, speed: 2 }
    expect(decodeScenario(`#${encodeScenario(s)}`)).toEqual(s)
  })

  it('clamps and ignores junk', () => {
    const s = decodeScenario('#limit=9999&windowSec=-5&refillPerSec=abc&traffic=flood&speed=3&rate=0.74')
    expect(s.limit).toBe(50)
    expect(s.windowSec).toBe(1)
    expect(s.refillPerSec).toBe(DEFAULT_SCENARIO.refillPerSec)
    expect(s.traffic).toBe('off')
    expect(s.speed).toBe(1)
    expect(s.rate).toBe(0.5)
    expect(decodeScenario(undefined)).toEqual(DEFAULT_SCENARIO)
  })

  it('maps to limiter config', () => {
    expect(toLimiterConfig({ limit: 3, windowSec: 2.5, refillPerSec: 1 })).toEqual({ limit: 3, windowMs: 2500, refillPerSec: 1 })
  })
})
