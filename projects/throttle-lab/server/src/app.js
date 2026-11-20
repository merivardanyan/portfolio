import { createServer } from 'node:http';
import { createLimiter, MemoryStore, explain, setRateLimitHeaders, systemClock } from '../../lib/index.js';
import { HttpError, applyCors, clientIp, createRouter, readJson, sendError, sendJson } from './http.js';

export const DEFAULTS = Object.freeze({
  fixedWindow: { limit: 5, windowMs: 10_000 },
  slidingLog: { limit: 5, windowMs: 10_000 },
  slidingCounter: { limit: 5, windowMs: 10_000 },
  tokenBucket: { limit: 5, refillPerSec: 0.5 },
});

const CONFIG_FIELDS = {
  fixedWindow: ['limit', 'windowMs'], slidingLog: ['limit', 'windowMs'], slidingCounter: ['limit', 'windowMs'], tokenBucket: ['limit', 'refillPerSec'],
};
const BOUNDS = { limit: [1, 1000], windowMs: [100, 3_600_000], refillPerSec: [0.01, 1000] };
const KEY_RE = /^[\w.:-]{1,64}$/;

/**
 * @param {{ store?: object, clock?: { now(): number }, corsOrigin?: string, trustProxy?: boolean, allowConfig?: boolean }} opts
 */
export function createApp({ store = new MemoryStore(), clock = systemClock, corsOrigin = '*', trustProxy = false, allowConfig = true } = {}) {
  const limiters = Object.fromEntries(Object.entries(DEFAULTS).map(([algo, cfg]) => [algo, createLimiter(algo, { ...cfg, store, clock })]));
  const router = createRouter();

  const limiterFor = (algo) => {
    const l = Object.hasOwn(limiters, algo) ? limiters[algo] : null;
    if (!l) throw new HttpError(404, 'unknown_algorithm', `Unknown algorithm '${algo}'`, { algorithms: Object.keys(limiters) });
    return l;
  };
  const keyFor = (req, url) => {
    const k = url.searchParams.get('key');
    if (k == null) return clientIp(req, trustProxy);
    if (!KEY_RE.test(k)) throw new HttpError(400, 'invalid_key', 'key must be 1-64 chars of [A-Za-z0-9_.:-]');
    return k;
  };

  router.get('/api/health', () => ({ ok: true }));

  router.get('/api/algorithms', () => Object.values(limiters).map((l) => ({ algo: l.algo, config: l.config })));

  router.get('/api/limited/:algo', (req, { algo }, url, res) => {
    const l = limiterFor(algo);
    const r = l.consume(keyFor(req, url));
    setRateLimitHeaders(res, r, l.config);
    if (!r.allowed) {
      // RateLimit-* and Retry-After are already on res; sendError keeps them.
      throw new HttpError(429, 'rate_limited', explain(r), { retryAfterMs: r.retryAfterMs });
    }
    return { ok: true, algo, remaining: r.remaining, resetMs: r.resetMs, explanation: explain(r) };
  });

  router.get('/api/inspect/:algo', (req, { algo }, url) => {
    const l = limiterFor(algo);
    return { config: l.config, state: l.inspect(keyFor(req, url)) };
  });

  router.post('/api/config/:algo', async (req, { algo }) => {
    if (!allowConfig) throw new HttpError(403, 'config_disabled', 'Runtime config is disabled in production');
    const l = limiterFor(algo);
    const body = await readJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_body', 'Expected a JSON object');
    const patch = {};
    const details = [];
    for (const [k, v] of Object.entries(body)) {
      if (!CONFIG_FIELDS[algo].includes(k)) { details.push({ field: k, message: `not configurable for ${algo}` }); continue; }
      const [lo, hi] = BOUNDS[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi || (k !== 'refillPerSec' && !Number.isInteger(v))) {
        details.push({ field: k, message: `must be ${k === 'refillPerSec' ? 'a number' : 'an integer'} in [${lo}, ${hi}]` });
        continue;
      }
      patch[k] = v;
    }
    if (details.length) throw new HttpError(422, 'validation_failed', 'Invalid config', details);
    return { algo, config: l.configure(patch) };
  });

  router.post('/api/reset/:algo', (req, { algo }, url) => {
    if (!allowConfig) throw new HttpError(403, 'config_disabled', 'Reset is disabled in production');
    limiterFor(algo).reset(keyFor(req, url));
    return { ok: true };
  });

  async function handler(req, res) {
    try {
      applyCors(req, res, corsOrigin);
      res.setHeader('Access-Control-Expose-Headers', 'RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, RateLimit-Policy, Retry-After');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      const url = new URL(req.url, 'http://localhost');
      const { handler: h, params } = router.match(req.method, url.pathname);
      sendJson(res, 200, await h(req, params, url, res));
    } catch (err) {
      sendError(res, err);
    }
  }

  return { handler, limiters };
}

export function createHttpServer(opts) {
  const app = createApp(opts);
  const server = createServer(app.handler);
  server.app = app;
  return server;
}
