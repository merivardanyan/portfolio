import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreFromDeltaE, tierFor, isValidGuess, validateGuesses, scoreRound, scoreGame, emojiGrid,
  shareText, percentile, histogram, mean, SCORE_K, TIERS,
} from '../score.js';
import { dailyColors, ROUND_COUNT } from '../seed.js';

test('score curve', () => {
  assert.equal(scoreFromDeltaE(0), 100);
  assert.equal(scoreFromDeltaE(SCORE_K), 50);
  assert.equal(scoreFromDeltaE(5), 90);
  assert.equal(scoreFromDeltaE(10), 69.2);
  assert.ok(scoreFromDeltaE(100) < 3);
  assert.throws(() => scoreFromDeltaE(-1), RangeError);
  assert.throws(() => scoreFromDeltaE(NaN), RangeError);
  let prev = 101;
  for (let d = 0; d <= 100; d += 0.5) { const s = scoreFromDeltaE(d); assert.ok(s <= prev); prev = s; }
});

test('tiers', () => {
  assert.equal(tierFor(100).label, 'perfect');
  assert.equal(tierFor(90).emoji, '\u{1F7E9}');
  assert.equal(tierFor(89.9).emoji, '\u{1F7E8}');
  assert.equal(tierFor(45).emoji, '\u{1F7E7}');
  assert.equal(tierFor(0).emoji, '\u{1F7E5}');
  assert.equal(tierFor(-5), TIERS[TIERS.length - 1]);
});

test('guess validation', () => {
  assert.ok(isValidGuess({ h: 0, s: 0, l: 0 }));
  assert.ok(isValidGuess({ h: 360, s: 100, l: 100 }));
  for (const bad of [null, [], 'x', { h: 361, s: 0, l: 0 }, { h: 0, s: -1, l: 0 }, { h: 0, s: 0, l: 101 },
    { h: '1', s: 0, l: 0 }, { h: Infinity, s: 0, l: 0 }, { h: 0, s: 0 }]) {
    assert.equal(isValidGuess(bad), false, JSON.stringify(bad));
  }
  assert.deepEqual(validateGuesses('nope'), { ok: false, error: 'guesses must be an array' });
  assert.equal(validateGuesses([{ h: 0, s: 0, l: 0 }]).ok, false);
  const five = Array.from({ length: 5 }, () => ({ h: 0, s: 0, l: 0 }));
  five[3] = { h: 0, s: 0, l: 900 };
  assert.match(validateGuesses(five).error, /guess 3/);
  assert.deepEqual(validateGuesses([{ h: 360, s: 1.23456, l: 2 }], 1), { ok: true, guesses: [{ h: 0, s: 1.23, l: 2 }] });
});

test('scoreRound / scoreGame', () => {
  const t = { h: 200, s: 60, l: 50 };
  const r = scoreRound(t, t);
  assert.equal(r.score, 100);
  assert.equal(r.deltaE, 0);
  assert.equal(r.tier, 'perfect');
  const targets = dailyColors('2026-11-19');
  const perfect = scoreGame(targets, targets);
  assert.equal(perfect.score, 100);
  assert.equal(perfect.rounds.length, ROUND_COUNT);
  const off = scoreGame(targets, targets.map((c) => ({ ...c, h: (c.h + 180) % 360 })));
  assert.ok(off.score < 60);
  assert.throws(() => scoreGame([], []), RangeError);
  assert.throws(() => scoreGame(targets, targets.slice(1)), RangeError);
  assert.throws(() => scoreGame(null, null), RangeError);
});

test('share text and grid', () => {
  const G = '\u{1F7E9}', Y = '\u{1F7E8}', O = '\u{1F7E7}', R = '\u{1F7E5}';
  assert.equal(emojiGrid([95, 80, 50, 10, { score: 91 }]), G + Y + O + R + G);
  assert.equal(shareText({ number: 142, score: 87.4, rounds: [95, 95, 75, 20, 95] }), `Hue Hunt #142 - 87.4% ${G}${G}${Y}${R}${G}`);
  assert.equal(shareText({ score: 50, rounds: [50] }), `Hue Hunt (practice) - 50.0% ${O}`);
  assert.equal(shareText({ number: 1, practice: true, score: 50, rounds: [50] }), `Hue Hunt (practice) - 50.0% ${O}`);
  assert.equal(shareText({ number: 3, score: 100, rounds: [100], url: 'https://x.test' }), `Hue Hunt #3 - 100.0% ${G}\nhttps://x.test`);
});

test('stats helpers', () => {
  assert.equal(percentile(50, []), 100);
  assert.equal(percentile(50, [10, 20, 60, 50]), 50);
  assert.equal(percentile(0, [0, 0]), 0);
  assert.deepEqual(histogram([0, 5, 10, 99.9, 100], 10), [2, 1, 0, 0, 0, 0, 0, 0, 0, 2]);
  assert.deepEqual(histogram([-3, 150], 4), [1, 0, 0, 1]);
  assert.equal(histogram([]).length, 10);
  assert.equal(mean([]), 0);
  assert.equal(mean([1, 2, 2]), 1.7);
});
