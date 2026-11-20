# Throttle Lab demo server

Real HTTP endpoints guarded by each algorithm from `../lib`, with standard rate-limit headers. `node:http`, zero dependencies; in-memory store by default, `node:sqlite` optional.

## Run

```bash
cd projects/throttle-lab/server
npm start                 # http://127.0.0.1:8789, in-memory store
npm run start:sqlite      # same, persisted to ./data/throttle-lab.sqlite (node demo.js --store sqlite)
npm test                  # server integration tests + library unit tests
npm run load -- --rps 20 --seconds 5          # load script, all four algorithms side by side
node load.js --algo tokenBucket --rps 50 --seconds 3 --key me
```

Config via `.env` (see `.env.example`): `PORT`, `HOST`, `STORE`, `DB_FILE`, `CORS_ORIGIN`, `TRUST_PROXY`, `NODE_ENV`, `ALLOW_CONFIG`.

Default limits (small on purpose, so you can hit them by hand): window algorithms `5 per 10 s`; token bucket capacity 5, refill 0.5/s.

## Endpoints

`:algo` is one of `fixedWindow`, `slidingLog`, `slidingCounter`, `tokenBucket`. `?key=` (1-64 chars `[A-Za-z0-9_.:-]`) picks the bucket; default is the client IP. Errors: `{ error: { code, message, details? } }`.

| Method | Path | Response |
|---|---|---|
| GET | `/api/health` | `{ ok: true }` |
| GET | `/api/algorithms` | `[{ algo, config }]` |
| GET | `/api/limited/:algo?key=` | `200 { ok, algo, remaining, resetMs, explanation }` or `429 { error: { code: 'rate_limited', message: <plain-English explanation>, details: { retryAfterMs } } }` |
| GET | `/api/inspect/:algo?key=` | `{ config, state }` where `state` is `limiter.inspect(key)` |
| POST | `/api/config/:algo` | Body `{ limit?, windowMs?, refillPerSec? }` (only fields that apply to the algorithm; `limit` 1-1000, `windowMs` 100-3600000, `refillPerSec` 0.01-1000). Returns `{ algo, config }`. **Dev only**: 403 when `NODE_ENV=production` unless `ALLOW_CONFIG=1` |
| POST | `/api/reset/:algo?key=` | Clear a key. Dev only, like config |

Headers on every `/api/limited` response: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (seconds), `RateLimit-Policy`; plus `Retry-After` on 429. They are listed in `Access-Control-Expose-Headers` so the browser UI can read them.

Error codes: `unknown_algorithm` (404), `invalid_key` (400), `validation_failed` (422, `details: [{ field, message }]`), `config_disabled` (403), `rate_limited` (429), `not_found`, `method_not_allowed`, `invalid_json`, `unsupported_media_type`.

```bash
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " "localhost:8789/api/limited/fixedWindow?key=me"; done; echo
curl -si "localhost:8789/api/limited/tokenBucket?key=me" | grep -i ratelimit
curl -s "localhost:8789/api/inspect/slidingCounter?key=me"
curl -s -X POST localhost:8789/api/config/tokenBucket -H 'content-type: application/json' -d '{"limit":10,"refillPerSec":2}'
```

## Files

```
demo.js           entry: .env, store selection, listen
load.js           zero-dep load generator, per-second 200/429 timeline
src/app.js        routes
src/http.js       router, JSON body reader, CORS, error shape
test/api.test.js  integration tests (manual clock injected, memory + SQLite stores)
```
