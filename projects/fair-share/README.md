# Fair Share

Paste the receipt and send one link. Everyone taps what they ate, and the math settles itself in real time, tax and tip included. Every group dinner needs this, and each use spreads the link to 3-8 new people who don't have to install or sign up for anything. Under the hood, money is handled as integer cents and split with the largest-remainder method, so the shares always add up to the exact total, and updates are optimistic with server reconciliation over WebSockets.

![Fair Share screenshot](./docs/screenshot.png)

**Stack:** React 18, Vite, Zustand, Vitest, `qrcode-generator` · Node 26, `ws`, `node:sqlite` (server) · shared plain-ESM `core/`.

## Architecture

```
                    core/  (pure ESM, shared by browser and server)
   money.js  integer minor units, largest-remainder allocate()
   split.js  computeSplit(bill) → per person subtotal / tax / tip / total + unclaimed bucket
   bill.js   applyOp(state, op, ctx) reducer · applyPatch (version check) · rebase (optimistic view)
   parse.js  "2 Margherita 24.00" → items, tax, tip
        │                                              │
  ┌─────┴──────────────── browser ──────────┐   ┌──────┴─────── server/ ────────────┐
  │ components ──► store/billStore (Zustand)│   │ REST  POST/GET/PATCH /api/bills    │
  │                 confirmed + pending[]   │   │ WS    /ws?bill=  + auth message    │
  │                 view = rebase(...)      │   │ commit: applyOp → SQLite tx →      │
  │                 split = computeSplit    │   │         broadcast {patch, version} │
  │                      │                  │   └────────────────────────────────────┘
  │            src/api/index.js             │                 ▲
  │   ┌──────────────────┴───────────────┐  │                 │ VITE_API_MODE=http
  │   │ localAdapter                     │  │   httpAdapter ──┘ (fetch + WebSocket,
  │   │ localStorage + BroadcastChannel  │  │                    backoff reconnect)
  │   │ + Web Locks, same message shapes │  │
  │   └──────────────────────────────────┘  │
  └─────────────────────────────────────────┘
```

### The client loop

1. **Joining** returns a `participantId` (public) and a `participantToken` (secret, stored per bill in localStorage, never broadcast). Every socket starts as a spectator and sends `{ type: 'auth', participantId, token }` before it may claim. Knowing someone's id is not enough to claim as them.
2. A tap adds `{ reqId, op: claim|unclaim }` to `pending` and sends it. The UI renders `rebase(confirmed, pending)`, so the claim shows instantly.
3. The server answers with `patch { version, op, reqId }` (broadcast to everyone), `ack` (no-op) or `error { reqId }`. A patch is applied to `confirmed` and drops the pending entry with the same `reqId`, so every optimistic op is confirmed by exactly one event and never applied twice. An error drops its op and the user is told what failed ("Couldn't claim Tiramisu: bill is locked"); `rate_limited` and `conflict` also trigger a resync.
4. Host edits go over REST (`PATCH` with the host token as a Bearer token). Each op carries its own `reqId`, which the server echoes in the broadcast, so host edits go through exactly the same confirm path as claims.
5. If a version is skipped (`gap`), the client sends one `sync` and waits. Its own ops confirmed in the meantime stay visible and are dropped when the snapshot (which contains them) arrives. On reconnect the server sends a snapshot; the client re-authenticates and re-sends still-pending ops once. There is a single resend path (no outbox), so a reconnect never doubles the traffic.

All of this is a pure function, `reduceMessage` in `src/lib/session.js`, and it is unit tested, including a dropped-frame recovery and a host `item.add` that must be applied exactly once.

### Static demo: `localAdapter`

The demo build has no server, but it speaks **the same protocol**: participant tokens and `auth`, `reqId` echoed on every patch, ack and error, all-or-nothing host batches, and the server's bill-id alphabet. Bills are stored in localStorage, every commit runs the same `applyOp` reducer the server uses, and patches go to other tabs through `BroadcastChannel`. Each commit (validate, persist, broadcast) runs inside one `navigator.locks.request()`, so two tabs claiming at the same moment are serialized rather than overwriting each other. Both adapters throw the same `ApiError(status, code, message, details)`, and `src/api/contract.test.js` runs one set of REST assertions against both (the http one against a fake `fetch` that speaks the server's wire format). Open the sample bill in two tabs and join as two different people (in the demo, each tab keeps its seat in sessionStorage); claims in one tab show up in the other instantly.

`VITE_API_MODE=local|http` picks the adapter at build time (default `local`; `VITE_API_URL` alone also switches to `http`).

## Run locally

```bash
npm install
npm run dev            # static demo with the sample bill TASTY234
npm test               # session reducer, store, adapter contract + protocol, avatar contrast
npm run build          # dist/, works from any sub-path

# with the real server
cd server && npm install && npm start     # http://127.0.0.1:8788, seeds TASTY234
cd .. && VITE_API_MODE=http VITE_API_URL=http://127.0.0.1:8788 npm run dev

# money/split/reducer tests (node:test)
cd core && npm test
```

## Design decisions

- **One reducer, three places.** The server, the optimistic client view and the static demo all apply ops through `core/bill.js`. Client and server can't disagree about what a claim means, and the demo isn't a fake: it runs the real rules.
- **Integer cents and largest remainder.** Tax and tip are split in proportion to each person's subtotal, and shared items are split evenly with the spare cent rotating between people. Unclaimed items get their own bucket, so `sum(people) + unclaimed === total` holds on every render.
- **Versioned patches, not "last write wins".** Each committed op bumps `version` by exactly 1. Clients detect gaps instead of silently drifting, which makes reconnects after a phone sleeps safe.
- **Optimistic, but honest.** Pending ops are a list replayed on top of the confirmed state. If the server rejects one (the bill was locked, the item was removed), it disappears and a notice explains why. Nothing is left in a half-applied state.
- **Accessible tapping.** Items are real `<button aria-pressed>` toggles with at least 44px targets, the connection state is a live `role="status"`, and colors are never the only signal (names are always shown next to avatars).

## What I'd do next

- A host link that carries the token, so the host can edit from a second device
- Edit item name, price and quantity inline (the reducer already supports `item.update`)
- "Settle up" deep links (Venmo, PayPal.me, SEPA QR codes) on the locked summary
- Receipt photo OCR (Tesseract in a worker) feeding the same parser
- Per-item custom split ratios ("I had 2 of the 3 beers")
