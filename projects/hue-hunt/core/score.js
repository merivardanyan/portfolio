// Scoring, validation and sharing helpers. Plain ESM, zero dependencies.
import { deltaEHsl, normalizeHue } from './color.js';
import { ROUND_COUNT } from './seed.js';

/**
 * Falloff constant for the score curve: score = 100 / (1 + (dE / K)^2).
 * dE 1 (barely visible) -> 99.6, dE 5 -> 90, dE 10 -> 69.2, dE 25 -> 26.5, dE 50 -> 8.3.
 */
export const SCORE_K = 15;

/** Share-grid tiers, highest first. */
export const TIERS = [
  { min: 90, emoji: '🟩', label: 'perfect' },
  { min: 70, emoji: '🟨', label: 'close' },
  { min: 45, emoji: '🟧', label: 'off' },
  { min: 0, emoji: '🟥', label: 'miss' },
];

const round1 = (v) => Math.round(v * 10) / 10;

/** Map a ΔE2000 value to a 0-100 score (1 decimal). */
export function scoreFromDeltaE(dE) {
  if (!Number.isFinite(dE) || dE < 0) throw new RangeError('deltaE must be a finite number >= 0');
  return round1(100 / (1 + (dE / SCORE_K) ** 2));
}

/** Tier object for a 0-100 score. */
export function tierFor(score) {
  return TIERS.find((t) => score >= t.min) ?? TIERS[TIERS.length - 1];
}

/**
 * Is `g` a well-formed HSL guess? h 0-360, s 0-100, l 0-100, finite numbers.
 * @param {unknown} g
 */
export function isValidGuess(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return false;
  const { h, s, l } = /** @type {any} */ (g);
  const ok = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  return ok(h, 0, 360) && ok(s, 0, 100) && ok(l, 0, 100);
}

/**
 * Validate a guesses array. Returns `{ ok: true, guesses }` with values
 * normalised (rounded to 2 dp, hue wrapped) or `{ ok: false, error }`.
 * @param {unknown} guesses
 * @param {number} [count=ROUND_COUNT]
 */
export function validateGuesses(guesses, count = ROUND_COUNT) {
  if (!Array.isArray(guesses)) return { ok: false, error: 'guesses must be an array' };
  if (guesses.length !== count) return { ok: false, error: `expected ${count} guesses, got ${guesses.length}` };
  for (let i = 0; i < guesses.length; i++) {
    if (!isValidGuess(guesses[i])) return { ok: false, error: `guess ${i} must be {h:0-360, s:0-100, l:0-100}` };
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    ok: true,
    guesses: guesses.map(({ h, s, l }) => ({ h: r2(normalizeHue(h)), s: r2(s), l: r2(l) })),
  };
}

/**
 * Score a single round.
 * @param {{h:number,s:number,l:number}} target
 * @param {{h:number,s:number,l:number}} guess
 */
export function scoreRound(target, guess) {
  const deltaE = deltaEHsl(target, guess);
  const score = scoreFromDeltaE(deltaE);
  return { target, guess, deltaE: Math.round(deltaE * 100) / 100, score, tier: tierFor(score).label };
}

/**
 * Score a whole game. Total = mean of round scores (1 decimal).
 * @param {Array<{h:number,s:number,l:number}>} targets
 * @param {Array<{h:number,s:number,l:number}>} guesses
 */
export function scoreGame(targets, guesses) {
  if (!Array.isArray(targets) || !Array.isArray(guesses) || targets.length !== guesses.length || targets.length === 0) {
    throw new RangeError('targets and guesses must be non-empty arrays of equal length');
  }
  const rounds = targets.map((t, i) => scoreRound(t, guesses[i]));
  const score = round1(rounds.reduce((sum, r) => sum + r.score, 0) / rounds.length);
  return { score, rounds };
}

/** Emoji grid for a list of round scores (or round objects). */
export function emojiGrid(rounds) {
  return rounds.map((r) => tierFor(typeof r === 'number' ? r : r.score).emoji).join('');
}

/**
 * Wordle-style share text, e.g. "Hue Hunt #142 - 87.4% 🟩🟩🟨🟥🟩".
 * @param {{ number?: number, score: number, rounds: Array<number|{score:number}>, url?: string, practice?: boolean }} r
 */
export function shareText({ number, score, rounds, url, practice = false }) {
  const label = practice || number == null ? 'Hue Hunt (practice)' : `Hue Hunt #${number}`;
  const line = `${label} - ${score.toFixed(1)}% ${emojiGrid(rounds)}`;
  return url ? `${line}\n${url}` : line;
}

/**
 * Percentage (0-100, integer) of `others` that `score` strictly beats.
 * Returns 100 when there is nobody else to compare against.
 * @param {number} score
 * @param {number[]} others
 */
export function percentile(score, others) {
  if (!others.length) return 100;
  const below = others.reduce((n, s) => n + (s < score ? 1 : 0), 0);
  return Math.round((below / others.length) * 100);
}

/**
 * Histogram of 0-100 scores into `buckets` equal-width bins (100 lands in the last bin).
 * @param {number[]} scores
 * @param {number} [buckets=10]
 */
export function histogram(scores, buckets = 10) {
  const out = new Array(buckets).fill(0);
  for (const s of scores) {
    const i = Math.min(buckets - 1, Math.max(0, Math.floor((s / 100) * buckets)));
    out[i]++;
  }
  return out;
}

/** Arithmetic mean rounded to 1 dp (0 for an empty list). */
export function mean(scores) {
  return scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
}
