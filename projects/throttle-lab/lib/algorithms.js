// The four algorithms as pure step functions over plain JSON state.
// step(state | undefined, now, cost, cfg) -> { state, result, ttlMs }
// view(state | undefined, now, cfg)       -> visualization snapshot (no mutation)
// All times are integer-ish milliseconds from an injectable clock.

const ceil = (x) => Math.max(0, Math.ceil(x - 1e-9));

function base(algo, cfg, allowed, remaining, resetMs, retryAfterMs, info) {
  return { algo, allowed, limit: cfg.limit, remaining: Math.max(0, Math.floor(remaining + 1e-9)), resetMs: ceil(resetMs), retryAfterMs: allowed ? 0 : ceil(retryAfterMs), info };
}

// ---------------------------------------------------------------- fixed window
export const fixedWindowAlgo = {
  name: 'fixedWindow',
  validate(cfg) { positiveInt(cfg.limit, 'limit'); positiveInt(cfg.windowMs, 'windowMs'); },
  current(state, now, cfg) {
    const start = Math.floor(now / cfg.windowMs) * cfg.windowMs;
    return { start, count: state && state.start === start ? state.count : 0 };
  },
  step(state, now, cost, cfg) {
    const cur = this.current(state, now, cfg);
    const end = cur.start + cfg.windowMs;
    const allowed = cur.count + cost <= cfg.limit;
    const count = allowed ? cur.count + cost : cur.count;
    return {
      state: { start: cur.start, count },
      ttlMs: end - now,
      result: base('fixedWindow', cfg, allowed, cfg.limit - count, end - now, end - now,
        { count: cur.count, cost, windowStart: cur.start, windowEnd: end }),
    };
  },
  view(state, now, cfg) {
    const cur = this.current(state, now, cfg);
    return { algo: 'fixedWindow', limit: cfg.limit, windowMs: cfg.windowMs, windowStart: cur.start, windowEnd: cur.start + cfg.windowMs, count: cur.count, remaining: cfg.limit - cur.count };
  },
};

// ---------------------------------------------------------------- sliding window log
export const slidingLogAlgo = {
  name: 'slidingLog',
  validate(cfg) { positiveInt(cfg.limit, 'limit'); positiveInt(cfg.windowMs, 'windowMs'); },
  live(state, now, cfg) { return (state?.log ?? []).filter((t) => t > now - cfg.windowMs); },
  step(state, now, cost, cfg) {
    const log = this.live(state, now, cfg);
    const before = log.length;
    const allowed = before + cost <= cfg.limit;
    if (allowed) for (let i = 0; i < cost; i++) log.push(now);
    // log is never empty here: allowed pushed an entry; denied implies before >= 1 (cost <= limit)
    const resetMs = log[0] + cfg.windowMs - now;
    // to fit `cost` more, the oldest (before + cost - limit) entries must expire
    const mustExpire = before + cost - cfg.limit;
    const retryAfterMs = allowed ? 0 : log[mustExpire - 1] + cfg.windowMs - now;
    return {
      state: { log },
      ttlMs: cfg.windowMs,
      result: base('slidingLog', cfg, allowed, cfg.limit - log.length, resetMs, retryAfterMs,
        { count: before, cost, oldest: before ? log[0] : null, windowStart: now - cfg.windowMs }),
    };
  },
  view(state, now, cfg) {
    const log = this.live(state, now, cfg);
    return { algo: 'slidingLog', limit: cfg.limit, windowMs: cfg.windowMs, windowStart: now - cfg.windowMs, log, count: log.length, remaining: cfg.limit - log.length };
  },
};

// ---------------------------------------------------------------- sliding window counter
export const slidingCounterAlgo = {
  name: 'slidingCounter',
  validate(cfg) { positiveInt(cfg.limit, 'limit'); positiveInt(cfg.windowMs, 'windowMs'); },
  current(state, now, cfg) {
    const W = cfg.windowMs;
    const start = Math.floor(now / W) * W;
    let count = 0, prev = 0;
    if (state) {
      if (state.start === start) { count = state.count; prev = state.prev; } else if (state.start === start - W) prev = state.count;
    }
    const weight = 1 - (now - start) / W; // share of the previous window still "inside" the sliding window
    return { start, count, prev, weight, estimate: prev * weight + count };
  },
  step(state, now, cost, cfg) {
    const W = cfg.windowMs, L = cfg.limit;
    const cur = this.current(state, now, cfg);
    const allowed = cur.estimate + cost <= L + 1e-9;
    const count = allowed ? cur.count + cost : cur.count;
    const estimate = cur.prev * cur.weight + count;
    let retryAfterMs = 0;
    if (!allowed) {
      if (cur.prev > 0 && L - cur.count - cost >= 0) {
        // previous window's weight must fall to (L - count - cost) / prev within this window
        retryAfterMs = cur.start + (1 - (L - cur.count - cost) / cur.prev) * W - now;
      } else {
        // only possible in the next window, where prev' = count
        // here count > L - cost >= 0, so the previous-window weight must fall to (L - cost) / count
        const e = (1 - (L - cost) / cur.count) * W;
        retryAfterMs = cur.start + W + e - now;
      }
    }
    return {
      state: { start: cur.start, count, prev: cur.prev },
      ttlMs: cur.start + 2 * W - now,
      result: base('slidingCounter', cfg, allowed, L - estimate, cur.start + W - now, retryAfterMs,
        { estimate: cur.estimate, prev: cur.prev, count: cur.count, weight: cur.weight, cost, windowStart: cur.start }),
    };
  },
  view(state, now, cfg) {
    const c = this.current(state, now, cfg);
    return { algo: 'slidingCounter', limit: cfg.limit, windowMs: cfg.windowMs, currentWindowStart: c.start, currentCount: c.count, previousCount: c.prev, previousWeight: c.weight, estimate: c.estimate, remaining: Math.max(0, Math.floor(cfg.limit - c.estimate + 1e-9)) };
  },
};

// ---------------------------------------------------------------- token bucket
export const tokenBucketAlgo = {
  name: 'tokenBucket',
  validate(cfg) {
    positiveInt(cfg.limit, 'limit');
    if (!(typeof cfg.refillPerSec === 'number' && cfg.refillPerSec > 0 && Number.isFinite(cfg.refillPerSec))) throw new RangeError('refillPerSec must be a positive number');
  },
  current(state, now, cfg) {
    if (!state) return { tokens: cfg.limit, last: now };
    const elapsed = Math.max(0, now - state.last);
    return { tokens: Math.min(cfg.limit, state.tokens + (elapsed * cfg.refillPerSec) / 1000), last: Math.max(now, state.last) };
  },
  step(state, now, cost, cfg) {
    const cur = this.current(state, now, cfg);
    const allowed = cur.tokens + 1e-9 >= cost;
    const tokens = allowed ? Math.max(0, cur.tokens - cost) : cur.tokens;
    const msPerToken = 1000 / cfg.refillPerSec;
    const toFull = (cfg.limit - tokens) * msPerToken;
    return {
      state: { tokens, last: cur.last },
      ttlMs: Math.max(1, Math.ceil(toFull)),
      result: base('tokenBucket', cfg, allowed, tokens, toFull, (cost - cur.tokens) * msPerToken,
        { tokens: cur.tokens, cost, refillPerSec: cfg.refillPerSec, msPerToken }),
    };
  },
  view(state, now, cfg) {
    const c = this.current(state, now, cfg);
    const msPerToken = 1000 / cfg.refillPerSec;
    const frac = c.tokens - Math.floor(c.tokens);
    return {
      algo: 'tokenBucket', limit: cfg.limit, capacity: cfg.limit, refillPerSec: cfg.refillPerSec, tokens: c.tokens, remaining: Math.floor(c.tokens + 1e-9),
      msPerToken, nextTokenInMs: c.tokens >= cfg.limit ? 0 : ceil((1 - frac) * msPerToken),
    };
  },
};

export const ALGORITHMS = { fixedWindow: fixedWindowAlgo, slidingLog: slidingLogAlgo, slidingCounter: slidingCounterAlgo, tokenBucket: tokenBucketAlgo };

function positiveInt(v, name) {
  if (!Number.isInteger(v) || v < 1) throw new RangeError(`${name} must be a positive integer`);
}
