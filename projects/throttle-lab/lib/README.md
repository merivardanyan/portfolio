# throttle-lab (library)

Zero-dependency rate limiting for Node **and** the browser. Four algorithms, an injectable clock, pluggable stores, `node:http`/Express middleware, and plain-English explanations of every decision. The Throttle Lab visualizer runs this exact code in the browser with a simulated clock.

```js
import { tokenBucket, middleware } from './lib/index.js';
server.on('request', middleware(tokenBucket({ limit: 10, refillPerSec: 2 }), handler));
```

Tests: `cd lib && npm test` (node:test). `npm run coverage` reports **100% lines, branches and functions**. Test files are `lib/test/*.js` (not `*.test.js`) so a frontend Vitest run won't pick them up.

**Browser-safe:** no file imports a Node built-in. `SqliteStore` takes an already-open `DatabaseSync` instance, so importing `index.js` in Vite is fine (just don't construct a `SqliteStore` in the browser). Uses `structuredClone` and `TextEncoder` (all modern browsers).

## Creating limiters

```js
import { fixedWindow, slidingLog, slidingCounter, tokenBucket, createLimiter, createManualClock, MemoryStore } from './lib/index.js';

const clock = createManualClock(0);                 // optional; default is systemClock (Date.now)
const fw = fixedWindow({ limit: 5, windowMs: 10_000, clock });
const sl = slidingLog({ limit: 5, windowMs: 10_000, clock });
const sc = slidingCounter({ limit: 5, windowMs: 10_000, clock });
const tb = tokenBucket({ limit: 5, refillPerSec: 0.5, clock });   // limit = bucket capacity
const same = createLimiter('tokenBucket', { limit: 5, refillPerSec: 0.5 });
```

Options (all algorithms): `limit` (positive int), `store?` (default new `MemoryStore`), `clock?` (`{ now(): number }`), `name?` (store-key namespace, default = algorithm name; give two limiters sharing a store different names). Window algorithms need `windowMs` (positive int); token bucket needs `refillPerSec` (positive number). Invalid config throws `RangeError`.

## Limiter API

| Member | Description |
|---|---|
| `consume(key = 'global', now = clock.now(), cost = 1)` | Try to take `cost` units. Returns a **result** (below). Throws `RangeError` if `cost` isn't a positive int or exceeds `limit` |
| `inspect(key = 'global', now = clock.now())` | Read-only snapshot of internals for visualization (below) |
| `reset(key = 'global')` | Forget a key |
| `configure(partial)` | Change `limit` / `windowMs` / `refillPerSec` at runtime (validated). Returns the new config |
| `config` | Copy of the current config |
| `algo`, `name`, `store`, `clock` | |

### Result

```js
{ algo, allowed, limit, remaining, resetMs, retryAfterMs, key, at, info }
```

- `remaining`: whole units left after this call.
- `resetMs`: ms until the limiter is fully reset (window end; token bucket: time to full).
- `retryAfterMs`: 0 when allowed; otherwise the **exact** ms until the same request would succeed (assuming no other traffic).
- `info`: algorithm-specific numbers at decision time, used by `explain()`:
  - fixedWindow `{ count, cost, windowStart, windowEnd }`
  - slidingLog `{ count, cost, oldest, windowStart }`
  - slidingCounter `{ estimate, prev, count, weight, cost, windowStart }`
  - tokenBucket `{ tokens, cost, refillPerSec, msPerToken }`

### `inspect()` shapes (plus `key`, `at`)

| algo | fields |
|---|---|
| `fixedWindow` | `limit, windowMs, windowStart, windowEnd, count, remaining` |
| `slidingLog` | `limit, windowMs, windowStart, log: number[], count, remaining` |
| `slidingCounter` | `limit, windowMs, currentWindowStart, currentCount, previousCount, previousWeight (1..0), estimate, remaining` |
| `tokenBucket` | `limit, capacity, refillPerSec, tokens (fractional), remaining, msPerToken, nextTokenInMs` |

## Algorithms and trade-offs

| | Memory per key | Accuracy | Bursts | Notes |
|---|---|---|---|---|
| Fixed window | 2 numbers | Up to **2x limit** across a boundary | At every boundary | Windows aligned to `floor(now / windowMs)`. Cheapest |
| Sliding log | 1 timestamp per request | Exact | None beyond limit | Window is `(now - windowMs, now]`. Memory grows with limit |
| Sliding counter | 3 numbers | Approximate (assumes the previous window was uniform) | Smoothed | `estimate = prev * (1 - elapsed/window) + current`. Cloudflare-style |
| Token bucket | 2 numbers | Exact for its model | Up to `limit`, then `refillPerSec` | Allows controlled bursts; clock going backwards never mints tokens |

Pure step functions live in `algorithms.js` (`ALGORITHMS.tokenBucket.step(state, now, cost, cfg)` / `.view(state, now, cfg)`) if you want to drive state yourself, e.g. for a time-travel visualizer.

## Clocks

- `systemClock`: `{ now: () => Date.now() }`.
- `createManualClock(start = 0)`: `{ now(), advance(ms), set(ms) }`. Deterministic tests and the "pause / step" control in the UI.

## Stores

Interface (sync, so it works in browsers and with `node:sqlite`):

```
get(key, now) -> state | undefined
set(key, state, ttlMs, now)
delete(key)
update(key, fn, now) -> value     // fn(state | undefined) -> { state, ttlMs, value }, atomic
prune(now) -> number removed
```

- `new MemoryStore({ maxKeys = 100_000 })`: `Map` with lazy TTL expiry, clone-on-read, prune-then-evict when full.
- `new SqliteStore(db, { table = 'buckets' })`: table `buckets(key, algo, state_json, updated_at, expires_at, PRIMARY KEY(key, algo))`. `update` runs in `BEGIN IMMEDIATE`, so two processes sharing the file can't double-spend (tested with two connections). Store keys are `"<limiterName>:<userKey>"`; the prefix fills the `algo` column.

## Middleware

```js
middleware(limiter, handler?, { key?, cost?, onLimited?, headers? = true })
```

- With `handler`: returns a `node:http` listener `(req, res)` that calls `handler` when allowed.
- Without: Express-style `(req, res, next)`, calls `next()` when allowed and `next(err)` on limiter errors.
- `key(req)` default `req.socket.remoteAddress`; `cost(req)` default 1.
- Sets `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (seconds), `RateLimit-Policy` (`limit;w=seconds`) and on 429 `Retry-After` (seconds, at least 1). Stores the result on `req.rateLimit`.
- Default `onLimited`: `429` JSON `{ error: { code: 'rate_limited', message, details: { retryAfterMs } } }`.
- `setRateLimitHeaders(res, result, config)` is exported for custom handlers.

## explain(result)

```js
explain(tb.consume('ip'))
// "Denied (429): the bucket had 0.40 tokens (needs 1). At 2/s the next token arrives in 300 ms."
```

Covers allowed and denied outcomes for all four algorithms.
