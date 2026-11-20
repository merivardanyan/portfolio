# Throttle Lab: rate limiting you can see

Fire requests at four rate-limiting algorithms side by side (fixed window, sliding window log, sliding window counter, token bucket) and watch exactly why a request gets a 429. Each lane draws its live internals: window progress, logged timestamps, the weighted estimate, the bucket level. Click any red dot for a plain-English reason ("the bucket had 0.75 tokens (needs 1); the next token arrives in 500 ms"). The browser runs the same zero-dependency library that guards the real Node endpoints, on a simulated clock you can pause and step.

![Screenshot placeholder](docs/screenshot.webp)

## What's here

| Folder | What | Owner docs |
|---|---|---|
| `lib/` | The library: four algorithms as pure step functions, limiter wrapper, memory + `node:sqlite` stores, `node:http`/Express middleware, `explain()` | [lib/README.md](lib/README.md) |
| `server/` | Demo server with `/api/limited/:algo` endpoints, standard `RateLimit-*` / `Retry-After` headers, and a load script | [server/README.md](server/README.md) |
| `src/`, `index.html` | The visualizer: vanilla JS + Web Components + Canvas, built with Vite | this file |

## Run

```bash
npm install
npm run dev          # visualizer at http://localhost:5173 (static mode, no server needed)
npm test             # visualizer tests (Vitest); `npm run test:all` also runs lib tests
npm run build        # dist/, relative paths, works from any sub-path

# with the real server
cd server && npm start                                   # http://127.0.0.1:8789
VITE_API_URL=http://127.0.0.1:8789 npm run dev           # shows "Also hit the real server"
```

The server's `CORS_ORIGIN` defaults to `http://localhost:5173`. Point it at wherever you serve the visualizer from.

## Architecture

```
            ┌──────────────── lib/ (shared, zero deps) ────────────────┐
            │ algorithms.js: step(state, now, cost, cfg) / view(...)   │
            │ limiter.js + stores + clock.js + explain.js              │
            └──────────────┬───────────────────────────┬───────────────┘
                           │                           │
   browser: src/sim.js (manual clock)        server/: middleware + MemoryStore | SqliteStore
     ├─ traffic generator (steady / Poisson)          GET /api/limited/:algo
     ├─ 4 limiters on one simulated clock             RateLimit-* headers, 429 + Retry-After
     └─ event log + totals                                      ▲
                           │                                    │ api.js (http adapter, opt-in)
   <tl-controls> ─ tl-action events ─▶ main.js ─ rAF ─▶ <tl-lane> ×4 (canvas)   <tl-server-log>
```

- **Deterministic simulation.** Arrivals are scheduled at exact simulated timestamps and processed in order inside `tick(dt)`. Results are identical whether the frame rate is 30 or 144 Hz, and the tests rely on that (`tests/sim.test.js`).
- **Adapter pattern.** `src/api.js` picks the local adapter by default. With `VITE_API_URL` set, the HTTP adapter also sends each request to the real server, pushes limit changes via `POST /api/config/:algo`, and lists status codes and headers in a log panel.
- **Shareable setups.** Limits, traffic mode, rate, burst size and speed live in the URL hash (`#limit=8&traffic=poisson`), so "Copy link to this setup" reproduces the scenario.

## Design decisions

- **No framework, on purpose.** Three custom elements in light DOM, one CSS file, about 11 KB gzipped of JS. Lanes redraw canvases every frame, but their DOM text updates at most every 200 ms.
- **One clock to rule them all.** All four limiters share a single manual clock, so "Pause", "+100 ms" and the speed control are exact, and comparisons between lanes are fair.
- **The boundary-burst story.** One click plays 5 requests at 9 s and 5 more at 10.5 s. Fixed window lets all 10 through (twice its limit), while the other three deny the second burst, each with its own reason. That's the trade-off table made tangible.
- **Accessible canvas.** Each timeline is focusable: ←/→ step through requests, Shift+←/→ jumps between denials, Home/End and Esc work too. The explanation sits in a polite live region, and every action announces a per-algorithm summary.
- **Background tabs.** Frame deltas are clamped to 100 ms, so a hidden tab resumes where it left off instead of fast-forwarding through minutes of traffic.

## What I'd do next

- Per-request cost (weighted requests) and per-key lanes (several clients sharing one limiter).
- A "replay" mode that loads a recorded traffic trace (e.g. from `server/load.js`).
- An export of the timeline as a PNG for blog posts and design docs.
