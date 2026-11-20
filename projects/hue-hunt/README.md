# Hue Hunt

You see a color for 3 seconds. Then you rebuild it from memory. How close can you get? Hue Hunt is a daily puzzle: five colors that are the same for everyone on a given day, scored with real perceptual color math, plus a Wordle-style result line (`Hue Hunt #142 - 87.4% 🟩🟩🟨🟥🟩`) and a PNG result card to paste into chats. It takes about a minute to play, and comparing results with friends is the fun part.

![Hue Hunt screenshot](./docs/screenshot.png)

**Stack:** React 18, Vite, CSS Modules, Vitest · Node 26, `node:http`, `node:sqlite` (server) · shared plain-ESM `core/`.

## Architecture

```
                 core/ (plain ESM, no DOM, no Node APIs)
          seed.js: mulberry32(hash('hue-hunt:' + YYYY-MM-DD)) → 5 HSL targets
          color.js: HSL → sRGB → XYZ → Lab, CIEDE2000
          score.js: ΔE → 0-100 curve, tiers, share text, percentile
                │                                      │
     ┌──────────┴──────────┐                ┌──────────┴──────────┐
     │  React app (src/)   │   guesses only │  server/            │
     │  Game → ColorPicker ├───────────────►│  recomputes targets │
     │  Results → card.js  │◄───────────────┤  and score, stores  │
     │  lib/stats.js (LS)  │ score, rounds, │  it, percentile     │
     └──────────┬──────────┘   percentile   └─────────────────────┘
                │
       src/api/index.js  ── VITE_API_MODE=local ─► localAdapter (scores in the browser, seeded fake crowd)
                         └─ VITE_API_MODE=http  ─► httpAdapter  (VITE_API_URL)
```

- **Same puzzle everywhere.** The client derives the day's colors from the date seed, so the game works offline and every device gets the same five colors. `GET /api/puzzle/today` returns only `{ date, number, roundCount }`. The app calls it on load as a health check: if it fails, the home screen says the leaderboard is offline and scores stay on the device.
- **Tamper-proof scoring, not anti-cheat.** The client submits `{ playerId, date, guesses }`, never a score. The server rebuilds the targets with the same `core/seed.js`, scores them with the same `core/score.js`, and enforces one submission per player per day with a `UNIQUE` constraint. That means nobody can post a made-up score. **Known limitation:** the colors are a public function of the date and the seed code ships in the bundle, so a script (or a player with a color picker on the 3-second swatch) can submit near-perfect guesses. Stopping that needs a server-held secret seed and per-round reveal with timing checks; it's listed under "What I'd do next". Server details are in [`server/README.md`](./server/README.md).
- **Adapter pattern.** Components call `api.getToday / submit / getLeaderboard / getStats` and don't know which backend they are talking to. Both adapters throw the same `ApiError(status, code, message, details)`, and `src/api/contract.test.js` runs one set of assertions against both (the http one against a mocked `fetch`). The static demo uses `localAdapter`: it scores in the browser and draws the percentile and leaderboard from a seeded distribution of 480 fake players (labelled "simulated" in the UI).
- **Nicknames.** Names are validated on the client with the same rules as the server (letters in any script, digits, emoji, spaces and simple punctuation, up to 24 characters). If the server still rejects a submission for a validation reason, the player sees the real message and can fix the name or submit without one; the day is only marked as played once a score is actually recorded.

## Run locally

```bash
# static demo (no server)
npm install
npm run dev                      # http://localhost:5173
npm test                         # Vitest: adapter contract, nickname rules, stats/streak, picker math
npm run build                    # dist/, works from any sub-path

# with the real API
cd server && npm start           # http://127.0.0.1:8787, seeds demo players
cd .. && VITE_API_MODE=http VITE_API_URL=http://127.0.0.1:8787 npm run dev

# core tests (node:test, 100% coverage)
cd core && npm test
```

## Design decisions

- **CIEDE2000 instead of RGB distance.** Two greens that differ by 30 RGB units can look identical, and two blues that differ by 30 can look obviously different. ΔE2000 in Lab space tracks what people actually see, so a score feels fair. The curve `100 / (1 + (ΔE/15)²)` puts "just noticeable" (ΔE around 2) near 99, and an obviously wrong color below 30.
- **An HSL pad that is exactly right.** At a fixed lightness, HSL saturation is linear between grey and the full hue, and hue is piecewise linear between the six primaries. So two stacked CSS gradients render the pad exactly, with no canvas and no redraw on every lightness change.
- **A 2D control that works from the keyboard.** The pad is a single `role="slider"`: left/right changes hue (wrapping around), up/down changes saturation, Shift takes bigger steps, and Enter locks the guess in. `aria-valuetext` describes the color in words ("dark blue, hue 220 degrees…"). Lightness is a native range input. Focus moves on its own: Show color → pad → Next.
- **Player-controlled timer.** Each round waits for "Show color" before the 3-second countdown starts, so nobody gets surprised. Under `prefers-reduced-motion`, the draining ring becomes a numeric countdown, and the reveal slide and score count-up are turned off.
- **Neutral grey UI.** Surrounding colors shift how a color is perceived, so the interface stays in neutral greys (light or dark, following the OS setting) and color only appears in the swatches.

## What I'd do next

- Real anti-cheat: an HMAC'd daily seed held by the server, targets revealed one round at a time, and guesses rejected if they arrive impossibly fast or after a deadline
- Hard mode: OKLCH picker, 1.5-second flash
- Friends leaderboard via a shareable group code
- Show the history of past days with each day's colors after midnight
- Server-sent "X players finished today" counter on the home screen
- Colorblind-aware scoring variants (simulate protan/deutan perception)
