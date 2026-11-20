# Fair Share server

Real-time bill splitting API. `node:http` + built-in `node:sqlite` + `ws` (the only dependency). Every write goes through the same pure reducer the client uses (`../core/bill.js`), so client and server can never disagree on what an op means.

## Run

```bash
cd projects/fair-share/server
npm install              # installs ws
cp .env.example .env     # optional
npm start                # http://127.0.0.1:8788, ws://127.0.0.1:8788/ws
npm test                 # REST + WebSocket integration tests, then core unit tests
```

First start creates `./data/fair-share.sqlite` and seeds a sample bill **`TASTY234`** (3 participants `ana`, `ben`, `chloe`, with some claims). The host token and the three participant tokens are printed **once** to the console (only their hashes are stored).

## Protocol changes (v2, fix round)

1. `POST /api/bills/:id/participants` now returns a one-time **`participantToken`**. It is required to claim/unclaim.
2. WebSocket identity is no longer taken from the URL. Connect as `/ws?bill=<id>` (any `participant=` query param is ignored), then send `{ type: 'auth', participantId, token, reqId? }`. Reply: `{ type: 'authed', participantId, reqId? }` or `{ type: 'error', code: 'invalid_token', reqId? }`. Re-send `auth` after every reconnect, before re-sending pending ops (messages are processed in order, so `auth` and the ops can go back to back).
3. PATCH ops may carry a **`reqId`**; the matching `patch` broadcast echoes it, so the host's client drops its pending op on confirm exactly like WS ops. The PATCH response adds `applied: [{ reqId?, version }]` and `noops: [reqId]`. The join body may also carry `reqId` (echoed on its `participant.join` patch).
4. **Every** WS error that rejects a message carries that message's `reqId`, including `rate_limited` (the server parses before rate limiting). Only unparseable frames get an error without one.
5. A second participant with the same name (case-insensitive, trimmed) gets `409 duplicate_name`.
6. An oversized frame (> 4 KB) closes only that socket with code **1009**; it no longer crashes the process.
7. `BILL_ID_ALPHABET`, `BILL_ID_RE` and `newBillId()` are exported from `core/bill.js` for the local adapter.

## Architecture

```
client --REST--> app.js ─┐
client --WS----> app.js ─┼─> commit(billId, [{ op, ctx, reqId? }, ...])
                         │     1. applyOp(...) for every op   (core/bill.js, pure, validates + authorises; any error aborts all)
                         │     2. store.persistSteps(...)      ONE SQLite transaction (BEGIN IMMEDIATE) + version check
                         │     3. cache, then broadcast { type:'patch', version, op, reqId? } per op to the bill's room
                         └─> GET reads: store.load() -> state (+ computeSplit for convenience)
```

node:sqlite is synchronous, so writes to a bill are serialised within the process. The server is designed to run as **one process**. The `WHERE version = ?` check is a safety net: if a second process wrote the bill, the write fails with `409 conflict`, the cached state is dropped and the next request reloads from SQLite (clients should `sync`).

## Auth model

- **Bill id**: 8 chars from a 31-symbol alphabet (~8.5e11 combinations). Anyone with the link can read the bill and join.
- **Host token**: 32 random bytes (base64url), returned once from `POST /api/bills`. Only `sha256(token)` is stored; comparison is constant-time. Send as `Authorization: Bearer <token>`. The host may also claim/unclaim **on behalf of any participant** through PATCH (`{ op: 'claim', itemId, participantId }`).
- **Participant token**: 32 random bytes returned once from the join call; stored as a hash, compared in constant time, never broadcast. Participant **ids** stay public (they appear in snapshots and patches) but are no longer a credential: a socket only acts as a participant after `auth` with the matching token, and claims always use the socket's authenticated id (a `participantId` in the message body is ignored). 5 failed `auth` attempts close the socket with 1008. Store the token next to the participant id (e.g. localStorage per bill); if it is lost, the person must join again under a new name or ask the host.
- Tokens travel in the first WS message, not the URL, so they don't end up in access logs.

## REST

Errors: `{ "error": { "code", "message", "details?" } }`. Money is always integer minor units; `tip.value` is basis points when `mode: 'percent'` (1800 = 18%).

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/api/health` | | | `{ ok: true }` |
| POST | `/api/bills` | | `{ title?, currency?='USD', taxCents?, tip?: { mode, value }, items?: [{ name, unitCents, qty? }] }` | `201 { id, hostToken, bill }` (server assigns item ids) |
| GET | `/api/bills/:id` | | | `{ bill, split }` (`bill` = snapshot state, `split` = `computeSplit(bill)`) |
| PATCH | `/api/bills/:id` | Bearer host token | `{ ops: [{ op, ...fields, reqId? }, ...] }` (1-100 ops: `bill.set`, `bill.lock`, `item.add`, `item.update`, `item.remove`, `claim`, `unclaim`) | `{ version, bill, applied: [{ reqId?, version }], noops: [reqId] }` |
| POST | `/api/bills/:id/participants` | | `{ name, color?: '#RRGGBB', reqId? }` | `201 { participantId, participantToken, participant, version }` |

A PATCH batch is all-or-nothing: every op runs through the reducer first, then all of them are written in one transaction. After the commit each op is broadcast as its own patch (one version each), echoing its `reqId`. `reqId` is a string matching `[\w.:-]{1,64}` or a safe integer (`400 invalid_req_id` otherwise). For `item.add` the client may choose the item `id` (`[A-Za-z0-9_-]{1,40}`, e.g. `newId()` from core) so it can render optimistically.

Status mapping for reducer errors: `forbidden` 403, `bill_locked` / `duplicate_*` (incl. `duplicate_name`) 409, `*_not_found` 404, other validation 422. Also `unauthorized` 401, `conflict` 409, `bad_request` (malformed URL encoding) / `invalid_body` / `invalid_ops` / `invalid_op` / `invalid_req_id` / `invalid_json` 400, `payload_too_large` 413, `unsupported_media_type` 415, `rate_limited` 429 (`Retry-After`).

Rate limits per IP per minute: create bill 10, join 30, read 300. Behind reverse proxies set `TRUST_PROXY=<number of proxies>`; the client IP is then taken that many hops from the **right** of `X-Forwarded-For` (left-most entries are client-controlled).

## WebSocket protocol

Connect: `ws://host:8788/ws?bill=<billId>`. Every socket starts as a read-only **spectator** (fine for the locked summary view). To claim, authenticate first:

```js
ws.send(JSON.stringify({ type: 'auth', participantId, token: participantToken, reqId: 'auth-1' }));
ws.send(JSON.stringify({ type: 'claim', itemId, reqId: 'c-17' }));   // may follow immediately
```

Upgrade is refused with 404 for unknown bills or paths and 403 for an `Origin` not in `CORS_ORIGIN`. Max frame 4 KB (bigger frames close the socket with **1009**; other frame-level protocol errors close with 1002/1007), 40 messages per 5 s per socket, server pings every 30 s and drops dead sockets.

### Client to server

| Message | Meaning |
|---|---|
| `{ type: 'auth', participantId, token, reqId? }` | Bind this socket to a participant. Required before `claim`/`unclaim`; repeat after every reconnect |
| `{ type: 'claim', itemId, reqId? }` | Claim an item for the authenticated participant |
| `{ type: 'unclaim', itemId, reqId? }` | Release a claim |
| `{ type: 'sync' }` | Ask for a fresh snapshot (after a version gap or reconnect) |
| `{ type: 'ping', t? }` | App-level ping, answered with `{ type: 'pong', t }` (`t` echoed if it is a number) |

`reqId` (string `[\w.:-]{1,64}` or safe integer) is echoed back so the client can match its optimistic op.

### Server to client

| Message | When |
|---|---|
| `{ type: 'snapshot', version, bill }` | On connect and after `sync` |
| `{ type: 'authed', participantId, reqId? }` | `auth` succeeded |
| `{ type: 'patch', version, op, reqId? }` | After **any** committed change (WS claims, REST host edits, joins), to every socket in the room, including the sender. `op` is canonical (normalised by the reducer). `reqId` is the originating request's id: WS message, PATCH op or join body |
| `{ type: 'ack', reqId, version }` | The op was valid but a no-op (e.g. claiming something you already claimed); nothing was broadcast |
| `{ type: 'error', reqId?, code, message }` | Message rejected: `invalid_token`, `forbidden` (not authenticated), `bill_locked`, `item_not_found`, `invalid_message`, `unknown_type`, `rate_limited`, `conflict`, ... `reqId` is always present when the rejected message had a valid one. Drop the matching pending op; on `rate_limited` or `conflict`, also `sync` |

### Client loop

`version` increases by exactly 1 per committed op. Rules (`applyPatch` / `rebase` in core):

- `patch.version === local.version + 1` -> apply, then drop the pending op whose `reqId` equals `patch.reqId` (same rule for WS claims **and** REST host ops).
- `patch.version <= local.version` -> already seen, ignore.
- otherwise -> gap: keep pending ops, send **one** `{ type: 'sync' }` and replace confirmed state with the snapshot.
- `ack` / `error` with a `reqId` -> drop that pending op.
- Reconnect (exponential backoff): the server sends a snapshot; send `auth` again, then re-send still-pending ops once (claims are idempotent). Use a single resend path.

## Files

```
server.js         entry: .env, open DB, seed sample bill, listen
src/app.js        REST routes, WebSocket rooms, commit() write path
src/db.js         node:sqlite connection + store (prepared statements, op -> SQL)
src/http.js       router, JSON body reader, CORS, error shape, limiter (this project's own copy, see its header)
src/crypto.js     token generation, sha256, constant-time compare
src/seed.js       sample bill TASTY234
schema.sql        SQLite schema (applied on start)
schema.mysql.sql  MySQL 8 equivalent
test/api.test.js  integration tests using Node's built-in WebSocket client
```

## Example

```bash
curl -s -X POST localhost:8788/api/bills -H 'content-type: application/json' \
  -d '{"title":"Tacos","taxCents":250,"tip":{"mode":"percent","value":1800},"items":[{"name":"Al pastor","unitCents":450,"qty":3}]}'
# -> {"id":"K7QM2XPA","hostToken":"...","bill":{...}}
curl -s -X POST localhost:8788/api/bills/K7QM2XPA/participants -H 'content-type: application/json' -d '{"name":"Ana"}'
# -> {"participantId":"...","participantToken":"...","participant":{...},"version":1}
curl -s -X PATCH localhost:8788/api/bills/K7QM2XPA -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"ops":[{"op":"bill.lock","locked":true}]}'
```
