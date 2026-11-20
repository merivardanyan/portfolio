// Deterministic, seeded puzzle generation shared by the browser and the server.
// Plain ESM, zero dependencies.

/** Number of rounds in a daily puzzle. */
export const ROUND_COUNT = 5;

/** Puzzle #1 is this UTC date. */
export const EPOCH_DATE = '2026-01-01';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/**
 * mulberry32 PRNG. Returns a function producing floats in [0, 1).
 * @param {number} seed 32-bit integer seed
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a 32-bit hash of a string (UTF-16 code units). Used to turn a date key
 * into a mulberry32 seed.
 * @param {string} str
 * @returns {number} unsigned 32-bit integer
 */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Is `s` a real calendar date in strict `YYYY-MM-DD` form?
 * @param {unknown} s
 */
export function isDateKey(s) {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * Format a Date as `YYYY-MM-DD`.
 * @param {Date} [date=new Date()]
 * @param {{ utc?: boolean }} [opts] utc=true uses the UTC calendar day (server); default is the local day (player).
 */
export function dateKey(date = new Date(), { utc = false } = {}) {
  return utc
    ? `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
    : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Milliseconds since epoch for 00:00 UTC of a date key. Throws on invalid keys. */
function keyToUtcMs(key) {
  if (!isDateKey(key)) throw new TypeError(`Invalid date key: ${key}`);
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Whole days between two date keys (b - a).
 * @param {string} a
 * @param {string} b
 */
export function daysBetween(a, b) {
  return Math.round((keyToUtcMs(b) - keyToUtcMs(a)) / DAY_MS);
}

/**
 * Add `days` to a date key.
 * @param {string} key
 * @param {number} days
 */
export function addDays(key, days) {
  return dateKey(new Date(keyToUtcMs(key) + days * DAY_MS), { utc: true });
}

/**
 * Puzzle number for a date (EPOCH_DATE is #1).
 * @param {string} key
 */
export function puzzleNumber(key) {
  return daysBetween(EPOCH_DATE, key) + 1;
}

/** Seed for a given daily puzzle. */
export function seedForDate(key) {
  if (!isDateKey(key)) throw new TypeError(`Invalid date key: ${key}`);
  return hashString(`hue-hunt:${key}`);
}

/**
 * Draw one target colour from a PRNG. Saturation and lightness are kept away
 * from the extremes so every target is a recognisable, rebuildable colour.
 * @param {() => number} rng
 * @returns {{h:number, s:number, l:number}} integer HSL (h 0-359, s/l 0-100)
 */
export function randomColor(rng) {
  const h = Math.floor(rng() * 360);
  const s = 30 + Math.floor(rng() * 61); // 30..90
  const l = 28 + Math.floor(rng() * 48); // 28..75
  return { h, s, l };
}

/**
 * Generate `count` colours from a numeric seed.
 * @param {number} seed
 * @param {number} [count=ROUND_COUNT]
 */
export function colorsFromSeed(seed, count = ROUND_COUNT) {
  const rng = mulberry32(seed);
  const out = [];
  for (let i = 0; i < count; i++) out.push(randomColor(rng));
  return out;
}

/**
 * The daily puzzle's target colours. Identical in every browser and on the server.
 * @param {string} key `YYYY-MM-DD`
 * @param {number} [count=ROUND_COUNT]
 */
export function dailyColors(key, count = ROUND_COUNT) {
  return colorsFromSeed(seedForDate(key), count);
}

/**
 * Full daily puzzle descriptor.
 * @param {string} key
 */
export function dailyPuzzle(key) {
  return { date: key, number: puzzleNumber(key), roundCount: ROUND_COUNT, colors: dailyColors(key) };
}
