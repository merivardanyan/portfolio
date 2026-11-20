// HTTP middleware for node:http and Express-style (req, res, next) stacks.
// Uses only the res.setHeader / res.writeHead / res.end API, so no Node imports.

/**
 * Write rate-limit headers (IETF draft "RateLimit header fields" + Retry-After).
 * @param {{ setHeader(name: string, value: string): void }} res
 * @param {{ limit: number, remaining: number, resetMs: number, retryAfterMs: number, allowed: boolean }} r
 * @param {{ windowMs?: number }} [cfg]
 */
export function setRateLimitHeaders(res, r, cfg = {}) {
  res.setHeader('RateLimit-Limit', String(r.limit));
  res.setHeader('RateLimit-Remaining', String(r.remaining));
  res.setHeader('RateLimit-Reset', String(Math.ceil(r.resetMs / 1000)));
  const w = cfg.windowMs ?? (cfg.refillPerSec ? Math.ceil(cfg.limit / cfg.refillPerSec) * 1000 : undefined);
  if (w) res.setHeader('RateLimit-Policy', `${r.limit};w=${Math.ceil(w / 1000)}`);
  if (!r.allowed) res.setHeader('Retry-After', String(Math.max(1, Math.ceil(r.retryAfterMs / 1000))));
}

const defaultKey = (req) => req.socket?.remoteAddress ?? 'anonymous';

function defaultOnLimited(req, res, r) {
  const body = JSON.stringify({ error: { code: 'rate_limited', message: 'Too many requests', details: { retryAfterMs: r.retryAfterMs } } });
  res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(new TextEncoder().encode(body).length) });
  res.end(body);
}

/**
 * Guard a handler with a limiter.
 *
 *   server.on('request', middleware(tokenBucket({ limit: 10, refillPerSec: 2 }), handler))
 *   app.use(middleware(limiter))                        // Express: calls next() when allowed
 *
 * @param {ReturnType<import('./limiter.js').createLimiter>} limiter
 * @param {(req, res) => any} [handler] called when allowed (node:http style)
 * @param {{ key?: (req) => string, cost?: (req) => number, onLimited?: (req, res, result) => any, headers?: boolean }} [opts]
 * @returns {(req, res, next?) => any}
 */
export function middleware(limiter, handler, opts = {}) {
  if (handler && typeof handler === 'object') { opts = handler; handler = undefined; }
  const { key = defaultKey, cost = () => 1, onLimited = defaultOnLimited, headers = true } = opts;
  return function rateLimited(req, res, next) {
    let r;
    try {
      r = limiter.consume(String(key(req)), undefined, cost(req));
    } catch (err) {
      if (typeof next === 'function') return next(err);
      throw err;
    }
    req.rateLimit = r;
    if (headers) setRateLimitHeaders(res, r, limiter.config);
    if (!r.allowed) return onLimited(req, res, r);
    if (handler) return handler(req, res, next);
    if (typeof next === 'function') return next();
    return undefined;
  };
}
