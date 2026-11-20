import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32, hashString, isDateKey, dateKey, daysBetween, addDays, puzzleNumber,
  seedForDate, randomColor, colorsFromSeed, dailyColors, dailyPuzzle, ROUND_COUNT, EPOCH_DATE,
} from '../seed.js';

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test('hashString is FNV-1a 32', () => {
  assert.equal(hashString(''), 0x811c9dc5);
  assert.equal(hashString('a'), 0xe40c292c);
  assert.equal(hashString('foobar'), 0xbf9cf968);
});

test('isDateKey accepts only real YYYY-MM-DD dates', () => {
  assert.ok(isDateKey('2026-01-01'));
  assert.ok(isDateKey('2024-02-29'));
  assert.ok(!isDateKey('2025-02-29'));
  assert.ok(!isDateKey('2026-13-01'));
  assert.ok(!isDateKey('2026-1-01'));
  assert.ok(!isDateKey(20260101));
  assert.ok(!isDateKey(null));
});

test('dateKey formats local and UTC days', () => {
  const d = new Date(Date.UTC(2026, 10, 19, 12, 0, 0));
  assert.equal(dateKey(d, { utc: true }), '2026-11-19');
  assert.match(dateKey(d), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(dateKey(), /^\d{4}-\d{2}-\d{2}$/);
});

test('date arithmetic and puzzle numbers', () => {
  assert.equal(daysBetween('2026-01-01', '2026-01-31'), 30);
  assert.equal(daysBetween('2026-03-01', '2026-02-28'), -1);
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(puzzleNumber(EPOCH_DATE), 1);
  assert.equal(puzzleNumber('2026-01-02'), 2);
  assert.throws(() => puzzleNumber('nope'), TypeError);
  assert.throws(() => seedForDate('2026-02-30'), TypeError);
});

test('randomColor stays inside the playable range', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 2000; i++) {
    const c = randomColor(rng);
    assert.ok(Number.isInteger(c.h) && c.h >= 0 && c.h < 360);
    assert.ok(c.s >= 30 && c.s <= 90);
    assert.ok(c.l >= 28 && c.l <= 75);
  }
});

test('dailyColors is stable per date and differs between dates', () => {
  const a = dailyColors('2026-11-19');
  assert.equal(a.length, ROUND_COUNT);
  assert.deepEqual(a, dailyColors('2026-11-19'));
  assert.notDeepEqual(a, dailyColors('2026-11-20'));
  assert.deepEqual(colorsFromSeed(seedForDate('2026-11-19')), a);
  assert.equal(colorsFromSeed(1, 3).length, 3);
});

test('dailyPuzzle descriptor', () => {
  const p = dailyPuzzle('2026-01-10');
  assert.equal(p.number, 10);
  assert.equal(p.roundCount, ROUND_COUNT);
  assert.equal(p.colors.length, ROUND_COUNT);
  assert.equal(p.date, '2026-01-10');
});
