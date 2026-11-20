# Hue Hunt core

Pure, zero-dependency ES modules shared by the React app and the Node server. No DOM, no Node APIs, so the same file runs in Vite and in `node`.

```js
import { dailyPuzzle, dateKey, scoreGame, shareText } from '../core/index.js';
// or deep imports: '../core/seed.js', '../core/color.js', '../core/score.js'
```

Tests: `cd core && npm test` (node:test, 100% line/branch/function coverage via `npm run coverage`). Test files live in `core/test/*.js` (not `*.test.js`) so Vitest in the app does not pick them up.

## Conventions

| Space | Shape | Ranges |
|---|---|---|
| HSL (game guesses/targets) | `{ h, s, l }` | h 0-360, s 0-100, l 0-100 |
| RGB | `{ r, g, b }` | 0-255, may be fractional |
| Lab | `{ L, a, b }` | CIE L\*a\*b\*, D65 |
| OKLCH | `{ l, c, h }` | l 0-1, c >= 0, h 0-360 |
| Date key | `'YYYY-MM-DD'` | strict, validated calendar day |

## `seed.js`

| Export | Description |
|---|---|
| `ROUND_COUNT` | `5` rounds per daily puzzle |
| `EPOCH_DATE` | `'2026-01-01'` is puzzle #1 |
| `mulberry32(seed) -> () => number` | Seeded PRNG, floats in [0, 1) |
| `hashString(str) -> uint32` | FNV-1a 32-bit |
| `isDateKey(x) -> boolean` | Strict `YYYY-MM-DD` and a real date |
| `dateKey(date = new Date(), { utc = false })` | Format a Date. Client uses the player's **local** day (default); server uses `{ utc: true }` |
| `daysBetween(a, b)`, `addDays(key, n)` | Date-key arithmetic (UTC based, DST safe) |
| `puzzleNumber(key)` | Days since `EPOCH_DATE` + 1 |
| `seedForDate(key)` | `hashString('hue-hunt:' + key)` |
| `randomColor(rng) -> {h,s,l}` | Integer HSL; s 30-90, l 28-75 (no near-black/white/grey targets) |
| `colorsFromSeed(seed, count = 5)` | Use for **practice mode**: `colorsFromSeed(Math.random() * 2**32 >>> 0)` |
| `dailyColors(key, count = 5)` | Today's targets, identical on every device and on the server |
| `dailyPuzzle(key) -> { date, number, roundCount, colors }` | Convenience bundle |

## `color.js`

| Export | Description |
|---|---|
| `normalizeHue(h)` | Wrap to [0, 360) |
| `hslToRgb`, `rgbToHsl`, `rgbToHex`, `hexToRgb`, `hslToHex` | Basic conversions |
| `hslToCss({h,s,l}) -> 'hsl(h s% l%)'` | CSS string for swatches |
| `srgbToLinear`, `linearToSrgb` | sRGB transfer functions |
| `rgbToXyz`, `xyzToLab`, `rgbToLab`, `hslToLab` | To CIE Lab (D65) |
| `rgbToOklch(rgb)`, `oklchToRgb(lch) -> {r,g,b,clipped}` | OKLCH for a perceptual picker; out-of-gamut input is chroma-reduced (hue/lightness kept), `clipped` tells you it happened |
| `deltaE2000(lab1, lab2)` | CIEDE2000, verified against the Sharma et al. test set |
| `deltaEHsl(hsl1, hsl2)` | ΔE2000 straight from HSL |

## `score.js`

| Export | Description |
|---|---|
| `SCORE_K` | `15`. Curve: `score = 100 / (1 + (ΔE / 15)^2)`. ΔE 1 = 99.6, 5 = 90, 10 = 69.2, 25 = 26.5 |
| `scoreFromDeltaE(dE)` | 0-100, 1 decimal |
| `TIERS`, `tierFor(score) -> { min, emoji, label }` | >=90 green `perfect`, >=70 yellow `close`, >=45 orange `off`, else red `miss` |
| `isValidGuess(g)` | `{h:0-360, s:0-100, l:0-100}` finite numbers |
| `validateGuesses(guesses, count = 5)` | `{ ok: true, guesses }` (normalised to 2dp, hue wrapped) or `{ ok: false, error }` |
| `scoreRound(target, guess) -> { target, guess, deltaE, score, tier }` | One round |
| `scoreGame(targets, guesses) -> { score, rounds }` | Total = mean of round scores (1 dp). This is exactly what the server recomputes |
| `emojiGrid(rounds)` | Accepts numbers or `{ score }` objects |
| `shareText({ number, score, rounds, url?, practice? })` | `'Hue Hunt #142 - 87.4% 🟩🟩🟨🟥🟩'` (+ `\nurl` if given) |
| `percentile(score, others)` | Integer % of `others` strictly below `score` (100 if `others` is empty) |
| `histogram(scores, buckets = 10)` | Equal-width bins over 0-100 |
| `mean(scores)` | 1 dp, 0 for empty |

## Local adapter recipe (static demo)

```js
const date = dateKey();                       // player's local day
const { number, colors } = dailyPuzzle(date);
const result = scoreGame(colors, guesses);
// Fake percentile from a seeded distribution:
const rng = mulberry32(seedForDate(date) ^ 0x9e3779b9);
const fake = Array.from({ length: 500 }, () => Math.min(100, Math.max(0, 62 + (rng() + rng() + rng() - 1.5) * 30)));
const pct = percentile(result.score, fake);
```

The server contract is the same shape: `POST /api/submissions { playerId, date, guesses }` returns `{ score, rounds, percentile }` where `rounds` is `scoreGame(...).rounds`.
