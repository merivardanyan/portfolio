# Hue Hunt server

Daily-puzzle API for Hue Hunt. `node:http` + built-in `node:sqlite`, **zero npm dependencies**. It imports the same `../core/` modules as the React app, so the targets it scores against are exactly the ones the browser generated.

## Run

```bash
cd projects/hue-hunt/server
cp .env.example .env     # optional, defaults are fine
npm start                # http://127.0.0.1:8787, creates ./data/hue-hunt.sqlite and seeds 7 days of demo players
npm test                 # API integration tests (in-memory DB) + core unit tests
```

Point the frontend at it with `VITE_API_MODE=http` (and the API base URL, e.g. `http://127.0.0.1:8787`). CORS allows `http://localhost:5173` by default (`CORS_ORIGIN`).

## Endpoints

All responses are JSON. Errors always look like `{ "error": { "code", "message", "details?" } }`.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/health` | | `{ ok: true }` |
| GET | `/api/puzzle/today` | | `{ date, number, roundCount }` (UTC day; **no colours** are ever sent) |
| POST | `/api/submissions` | `{ playerId: uuid, date: 'YYYY-MM-DD', guesses: [{h,s,l}] x5, nickname? }` | `201 { date, number, score, rounds, percentile }` |
| GET | `/api/leaderboard/:date` | `?limit=1-100` (default 20) | `[{ nickname, score }]` |
| GET | `/api/stats/:date` | | `{ players, mean, histogram: [10 buckets] }` |

### Submission rules (anti-cheat)

- The client sends **guesses only**. Any `score` field is ignored; the server regenerates the day's targets from the shared seed (`core/seed.js`) and recomputes with `core/score.js`.
- `date` must be the player's local day, which can be UTC-1 to UTC+1. Other dates: `422 date_not_playable`.
- One submission per `(playerId, date)`, enforced by a `UNIQUE` constraint. A repeat returns `409 already_submitted` with the original result in `error.details`.
- Rate limited per IP (`SUBMIT_LIMIT_PER_MIN`, default 20) with `429` + `Retry-After`.
- Body capped at 16 KB; `Content-Type: application/json` required (`415` otherwise).
- `percentile` = % of *other* players that day with a strictly lower score.

### Error codes

`validation_failed` (400, `details: [{ field, message }]`), `invalid_json`, `invalid_body`, `invalid_date`, `invalid_limit` (400), `not_found` (404), `method_not_allowed` (405, `Allow` header), `already_submitted` (409), `payload_too_large` (413), `unsupported_media_type` (415), `date_not_playable` (422), `rate_limited` (429), `internal` (500).

## Files

```
server.js          entry: loads .env (process.loadEnvFile), opens DB, seeds, listens
src/app.js         routes + validation
src/db.js          node:sqlite connection + repository (prepared statements only)
src/http.js        router, JSON body reader, CORS, error shape, limiter
src/seed.js        deterministic demo data (idempotent)
schema.sql         SQLite schema (applied on start)
schema.mysql.sql   MySQL 8 equivalent, for a production port
test/api.test.js   integration tests against a real listening server
```

## Example

```bash
curl -s localhost:8787/api/puzzle/today
curl -s -X POST localhost:8787/api/submissions -H 'content-type: application/json' \
  -d '{"playerId":"6f1c2a9e-1b2c-4d3e-8f00-123456789abc","date":"2026-11-19","nickname":"Me",
       "guesses":[{"h":10,"s":50,"l":50},{"h":100,"s":50,"l":50},{"h":200,"s":50,"l":50},{"h":300,"s":50,"l":50},{"h":50,"s":50,"l":50}]}'
curl -s "localhost:8787/api/leaderboard/2026-11-19?limit=5"
```
