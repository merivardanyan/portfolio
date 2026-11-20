import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createManualClock, systemClock } from '../index.js';

test('manual clock', () => {
  const c = createManualClock();
  assert.equal(c.now(), 0);
  assert.equal(c.advance(250), 250);
  assert.equal(c.set(10), 10);
  assert.throws(() => c.advance(-1), RangeError);
  assert.throws(() => c.advance(NaN), RangeError);
  assert.throws(() => c.set(Infinity), RangeError);
  assert.ok(Math.abs(systemClock.now() - Date.now()) < 50);
});
