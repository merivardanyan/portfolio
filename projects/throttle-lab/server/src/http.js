// Tiny HTTP toolkit on top of node:http: routing, JSON bodies, CORS, errors.
// Consistent error shape everywhere: { error: { code, message, details? } }

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

export function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

export function sendError(res, err) {
  if (err instanceof HttpError) {
    const error = { code: err.code, message: err.message };
    if (err.details !== undefined) error.details = err.details;
    return sendJson(res, err.status, { error }, err.headers);
  }
  console.error(err);
  return sendJson(res, 500, { error: { code: 'internal', message: 'Internal server error' } });
}

/** Read and parse a JSON request body with a size cap. */
export async function readJson(req, limitBytes = 16 * 1024) {
  const type = req.headers['content-type'] || '';
  if (!/^application\/json\b/i.test(type)) {
    throw new HttpError(415, 'unsupported_media_type', 'Content-Type must be application/json');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new HttpError(413, 'payload_too_large', `Body exceeds ${limitBytes} bytes`);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
  } catch {
    throw new HttpError(400, 'invalid_json', 'Body is not valid JSON');
  }
}

/**
 * Minimal router. Patterns like '/api/leaderboard/:date'.
 * Returns 404 for unknown paths and 405 (with Allow) for known paths with the wrong method.
 */
export function createRouter() {
  const routes = [];
  const add = (method, pattern, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:([A-Za-z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, handler });
  };
  const match = (method, pathname) => {
    const allowed = new Set();
    for (const r of routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      if (r.method !== method) { allowed.add(r.method); continue; }
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { handler: r.handler, params };
    }
    if (allowed.size) {
      const e = new HttpError(405, 'method_not_allowed', `Method ${method} not allowed`);
      e.headers = { Allow: [...allowed].join(', ') };
      throw e;
    }
    throw new HttpError(404, 'not_found', `No route for ${pathname}`);
  };
  return { get: (p, h) => add('GET', p, h), post: (p, h) => add('POST', p, h), patch: (p, h) => add('PATCH', p, h), match };
}

/**
 * CORS. `origins` is '*' or a comma-separated allow-list. Credentials are never allowed
 * (the API is token/ID based, not cookie based).
 */
export function applyCors(req, res, origins) {
  const origin = req.headers.origin;
  if (!origin) return;
  const list = String(origins || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (list.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  else return;
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
}

/** Client IP; X-Forwarded-For is only trusted when explicitly enabled. */
export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

/** Fixed-window in-memory limiter for abuse protection on write endpoints. */
export function createLimiter({ limit, windowMs, now = Date.now }) {
  const hits = new Map();
  return function check(key) {
    const t = now();
    let e = hits.get(key);
    if (!e || t >= e.reset) { e = { count: 0, reset: t + windowMs }; hits.set(key, e); }
    e.count++;
    if (hits.size > 10_000) for (const [k, v] of hits) if (t >= v.reset) hits.delete(k);
    if (e.count > limit) {
      const retry = Math.ceil((e.reset - t) / 1000);
      const err = new HttpError(429, 'rate_limited', 'Too many requests, slow down', { retryAfterSec: retry });
      err.headers = { 'Retry-After': String(retry) };
      throw err;
    }
  };
}
