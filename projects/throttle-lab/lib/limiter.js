import { ALGORITHMS } from './algorithms.js';
import { MemoryStore } from './stores/memory.js';
import { systemClock } from './clock.js';

/**
 * Wrap a pure algorithm with a store and a clock.
 * @param {keyof typeof ALGORITHMS} algoName
 * @param {{ limit: number, windowMs?: number, refillPerSec?: number, store?: object, clock?: { now(): number }, name?: string }} options
 */
export function createLimiter(algoName, options = {}) {
  const algo = ALGORITHMS[algoName];
  if (!algo) throw new TypeError(`Unknown algorithm: ${algoName}`);
  const { store = new MemoryStore(), clock = systemClock, name = algoName, ...cfgIn } = options;
  let cfg = { ...cfgIn };
  algo.validate(cfg);
  const k = (key) => `${name}:${key}`;

  return {
    algo: algoName,
    name,
    store,
    clock,
    get config() { return { ...cfg }; },

    /**
     * Try to take `cost` units for `key`.
     * @returns {{ algo, allowed, limit, remaining, resetMs, retryAfterMs, info }}
     */
    consume(key = 'global', now = clock.now(), cost = 1) {
      if (!Number.isInteger(cost) || cost < 1) throw new RangeError('cost must be a positive integer');
      if (cost > cfg.limit) throw new RangeError(`cost ${cost} can never fit in limit ${cfg.limit}`);
      return store.update(k(key), (state) => {
        const r = algo.step(state, now, cost, cfg);
        return { state: r.state, ttlMs: r.ttlMs, value: { ...r.result, key, at: now } };
      }, now);
    },

    /** Visualization snapshot of `key`'s internal state. Never mutates. */
    inspect(key = 'global', now = clock.now()) {
      return { key, at: now, ...algo.view(store.get(k(key), now), now, cfg) };
    },

    /** Forget `key`. */
    reset(key = 'global') { store.delete(k(key)); },

    /** Change limits at runtime (validated). Existing state is kept and interpreted with the new config. */
    configure(partial) {
      const next = { ...cfg, ...partial };
      algo.validate(next);
      cfg = next;
      return { ...cfg };
    },
  };
}

/** Fixed window: `limit` requests per aligned `windowMs` window. */
export const fixedWindow = (o) => createLimiter('fixedWindow', o);
/** Sliding window log: exact, stores one timestamp per request. */
export const slidingLog = (o) => createLimiter('slidingLog', o);
/** Sliding window counter: two counters, weighted estimate of the sliding window. */
export const slidingCounter = (o) => createLimiter('slidingCounter', o);
/** Token bucket: capacity `limit`, refills `refillPerSec` tokens per second. */
export const tokenBucket = (o) => createLimiter('tokenBucket', o);
