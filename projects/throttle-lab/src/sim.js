import { createLimiter, createManualClock, explain } from '../lib/index.js'

export const ALGOS = ['fixedWindow', 'slidingLog', 'slidingCounter', 'tokenBucket']

export const ALGO_INFO = {
  fixedWindow: { label: 'Fixed window', blurb: 'Counts requests per aligned window. Cheapest, but lets up to 2x the limit through around a boundary.' },
  slidingLog: { label: 'Sliding window log', blurb: 'Keeps a timestamp for every request in the last window. Exact, but memory grows with the limit.' },
  slidingCounter: { label: 'Sliding window counter', blurb: 'Blends the previous window’s count with the current one. Nearly exact at a fixed cost.' },
  tokenBucket: { label: 'Token bucket', blurb: 'Tokens refill at a steady rate; bursts are allowed up to the bucket size.' },
}

export const DEFAULT_CONFIG = { limit: 5, windowMs: 10_000, refillPerSec: 0.5 }

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const limiterOptions = (algo, cfg, clock) => (algo === 'tokenBucket'
  ? { limit: cfg.limit, refillPerSec: cfg.refillPerSec, clock }
  : { limit: cfg.limit, windowMs: cfg.windowMs, clock })

/**
 * Deterministic simulation: four limiters share one manual clock. Traffic arrivals are generated
 * between ticks at their exact simulated times, so results never depend on frame rate.
 */
export function createSim({ config = DEFAULT_CONFIG, seed = 1, historyMs = 30_000 } = {}) {
  const clock = createManualClock(0)
  let cfg = { ...DEFAULT_CONFIG, ...config }
  let limiters
  let events
  let totals
  let nextId
  let rng
  let traffic = { mode: 'off', rate: 2 }
  let nextArrival = Infinity

  function build() {
    limiters = Object.fromEntries(ALGOS.map((a) => [a, createLimiter(a, limiterOptions(a, cfg, clock))]))
  }

  function reset() {
    clock.set(0)
    build()
    events = []
    totals = Object.fromEntries(ALGOS.map((a) => [a, { allowed: 0, denied: 0 }]))
    nextId = 1
    rng = mulberry32(seed)
    scheduleFirstArrival()
  }

  function interArrival() {
    if (traffic.mode === 'steady') return 1000 / traffic.rate
    // Exponential gaps give a Poisson process with mean rate `traffic.rate`.
    return (-Math.log(1 - rng()) / traffic.rate) * 1000
  }

  function scheduleFirstArrival() {
    nextArrival = traffic.mode === 'off' ? Infinity : clock.now() + interArrival()
  }

  function fire(count = 1) {
    const now = clock.now()
    const created = []
    for (let i = 0; i < count; i++) {
      const id = nextId++
      for (const algo of ALGOS) {
        const result = limiters[algo].consume('global', now)
        const event = { id, t: now, algo, allowed: result.allowed, result, text: explain(result) }
        totals[algo][result.allowed ? 'allowed' : 'denied']++
        events.push(event)
        created.push(event)
      }
    }
    return created
  }

  function tick(dtMs) {
    if (!(dtMs >= 0)) throw new RangeError('tick(dtMs) needs dtMs >= 0')
    const end = clock.now() + dtMs
    while (nextArrival <= end) {
      clock.set(nextArrival)
      fire(1)
      nextArrival += interArrival()
    }
    clock.set(end)
    const cutoff = end - historyMs
    if (events.length && events[0].t < cutoff) events = events.filter((e) => e.t >= cutoff)
    return end
  }

  reset()

  return {
    get now() { return clock.now() },
    get config() { return { ...cfg } },
    get traffic() { return { ...traffic } },
    get historyMs() { return historyMs },
    fire,
    tick,
    reset,
    setTraffic({ mode = traffic.mode, rate = traffic.rate }) {
      if (!['off', 'steady', 'poisson'].includes(mode)) throw new RangeError(`Unknown traffic mode ${mode}`)
      if (!(rate > 0 && Number.isFinite(rate))) throw new RangeError('rate must be a positive number')
      const changed = mode !== traffic.mode || rate !== traffic.rate
      traffic = { mode, rate }
      if (changed) scheduleFirstArrival()
    },
    configure(partial) {
      const next = { ...cfg, ...partial }
      for (const algo of ALGOS) createLimiter(algo, limiterOptions(algo, next, clock))
      cfg = next
      for (const algo of ALGOS) {
        const { clock: _c, ...opts } = limiterOptions(algo, cfg, clock)
        limiters[algo].configure(opts)
      }
      return { ...cfg }
    },
    inspect(algo) {
      return limiters[algo].inspect('global', clock.now())
    },
    events(algo) {
      return algo ? events.filter((e) => e.algo === algo) : events.slice()
    },
    totals(algo) {
      return { ...totals[algo] }
    },
  }
}

/**
 * The "boundary burst" story: 5 requests just before a fixed window ends, 5 more just after.
 * Fixed window lets all 10 through in 1.5 s; the other three algorithms hold the line.
 */
export function runBoundaryBurst(sim) {
  sim.setTraffic({ mode: 'off' })
  sim.configure({ ...DEFAULT_CONFIG })
  sim.reset()
  sim.tick(DEFAULT_CONFIG.windowMs - 1000)
  sim.fire(DEFAULT_CONFIG.limit)
  sim.tick(1500)
  sim.fire(DEFAULT_CONFIG.limit)
  sim.tick(300)
}
