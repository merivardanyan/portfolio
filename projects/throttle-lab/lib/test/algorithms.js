import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixedWindow, slidingLog, slidingCounter, tokenBucket, createLimiter, createManualClock, MemoryStore } from '../index.js';

const burst = (l, n, key = 'k') => Array.from({ length: n }, () => l.consume(key));

test('fixed window: allows limit per aligned window, resets at boundary', () => {
  const clock = createManualClock(1000);
  const l = fixedWindow({ limit: 3, windowMs: 1000, clock });
  const rs = burst(l, 4);
  assert.deepEqual(rs.map((r) => r.allowed), [true, true, true, false]);
  assert.deepEqual(rs.map((r) => r.remaining), [2, 1, 0, 0]);
  assert.equal(rs[3].retryAfterMs, 1000);
  assert.equal(rs[3].resetMs, 1000);
  clock.advance(999);
  assert.equal(l.consume('k').allowed, false);
  assert.equal(l.consume('k').retryAfterMs, 1);
  clock.advance(1);
  assert.equal(l.consume('k').allowed, true);
  // boundary burst: the known weakness, 2x limit across a boundary
  clock.set(5999);
  const c2 = fixedWindow({ limit: 3, windowMs: 1000, clock });
  assert.equal(burst(c2, 3, 'b').every((r) => r.allowed), true);
  clock.advance(1);
  assert.equal(burst(c2, 3, 'b').every((r) => r.allowed), true);
  const v = c2.inspect('b');
  assert.deepEqual({ s: v.windowStart, e: v.windowEnd, c: v.count, r: v.remaining }, { s: 6000, e: 7000, c: 3, r: 0 });
  assert.equal(l.consume('other').allowed, true); // keys are independent
});

test('sliding log: exact, retryAfter is when enough entries expire', () => {
  const clock = createManualClock(0);
  const l = slidingLog({ limit: 3, windowMs: 1000, clock });
  l.consume('k'); clock.advance(100);
  l.consume('k'); clock.advance(100);
  l.consume('k'); clock.advance(100); // t=300, log = [0, 100, 200]
  const d = l.consume('k');
  assert.equal(d.allowed, false);
  assert.equal(d.retryAfterMs, 700); // entry at 0 expires at 1000
  assert.equal(d.resetMs, 700);
  const cost2 = l.consume('k', clock.now(), 2);
  assert.equal(cost2.retryAfterMs, 800); // entries at 0 and 100 must both expire
  clock.set(1000);
  assert.equal(l.consume('k').allowed, true); // 0 is out (window is (now-1000, now])
  const v = l.inspect('k');
  assert.deepEqual(v.log, [100, 200, 1000]);
  assert.equal(v.remaining, 0);
  assert.equal(slidingLog({ limit: 1, windowMs: 10, clock }).inspect('new').count, 0);
  const empty = slidingLog({ limit: 5, windowMs: 10, clock });
  assert.equal(empty.consume('x', clock.now(), 5).resetMs, 10);
});

test('sliding counter: weighted estimate smooths the boundary', () => {
  const clock = createManualClock(0);
  const l = slidingCounter({ limit: 10, windowMs: 1000, clock });
  clock.set(900);
  assert.equal(burst(l, 10).every((r) => r.allowed), true);
  assert.equal(l.consume('k').allowed, false);
  clock.set(1000); // new window, prev=10, weight=1 -> estimate 10
  const d = l.consume('k');
  assert.equal(d.allowed, false);
  assert.equal(d.info.estimate, 10);
  assert.equal(d.retryAfterMs, 100); // weight must fall to 0.9
  clock.set(1100);
  assert.equal(l.consume('k').allowed, true); // 10*0.9 + 0 + 1 = 10 <= 10
  assert.equal(l.consume('k').allowed, false);
  clock.set(1500); // 10*0.5 + 1 = 6 -> 4 more allowed
  assert.deepEqual(burst(l, 5).map((r) => r.allowed), [true, true, true, true, false]);
  const v = l.inspect('k');
  assert.equal(v.previousCount, 10);
  assert.equal(v.currentCount, 5);
  assert.equal(v.estimate, 10);
  clock.set(3500); // two windows later: everything gone
  assert.equal(l.inspect('k').estimate, 0);
});

test('sliding counter: retryAfter when only the next window can fit', () => {
  const clock = createManualClock(0);
  const l = slidingCounter({ limit: 4, windowMs: 1000, clock });
  burst(l, 4);
  const d = l.consume('k'); // count 4, prev 0 -> next window; need 4*(1-e) + 1 <= 4 -> e = 0.25
  assert.equal(d.allowed, false);
  assert.equal(d.retryAfterMs, 1250);
  clock.set(1249);
  assert.equal(l.consume('k').allowed, false);
  clock.set(1250);
  assert.equal(l.consume('k').allowed, true);
  // prev > 0 but current alone already full
  clock.set(1600);
  const l2 = slidingCounter({ limit: 2, windowMs: 1000, clock });
  l2.consume('z'); l2.consume('z');
  const d2 = l2.consume('z');
  assert.equal(d2.allowed, false);
  assert.equal(d2.retryAfterMs, 400 + 500); // next window at 2000, then weight must fall to 0.5
  // retry with zero count in next window: cost fits immediately at window start
  const l3 = slidingCounter({ limit: 3, windowMs: 1000, clock: createManualClock(0) });
  l3.consume('q', 0, 3);
  assert.equal(l3.consume('q', 0, 1).retryAfterMs, 1000 + 334);
});

test('token bucket: burst to capacity, steady refill, fractional tokens', () => {
  const clock = createManualClock(0);
  const l = tokenBucket({ limit: 5, refillPerSec: 2, clock });
  const rs = burst(l, 6);
  assert.deepEqual(rs.map((r) => r.allowed), [true, true, true, true, true, false]);
  assert.equal(rs[5].retryAfterMs, 500);
  assert.equal(rs[4].resetMs, 2500);
  clock.advance(300); // 0.6 tokens
  const d = l.consume('k');
  assert.equal(d.allowed, false);
  assert.ok(Math.abs(d.info.tokens - 0.6) < 1e-9);
  assert.equal(d.retryAfterMs, 200);
  const v = l.inspect('k');
  assert.equal(v.nextTokenInMs, 200);
  assert.equal(v.remaining, 0);
  clock.advance(200);
  assert.equal(l.consume('k').allowed, true);
  clock.advance(100_000);
  assert.equal(l.inspect('k').tokens, 5); // capped
  assert.equal(l.inspect('k').nextTokenInMs, 0);
  // clock going backwards never mints tokens
  const back = tokenBucket({ limit: 1, refillPerSec: 1, clock: createManualClock(1000) });
  back.consume('b', 1000);
  assert.equal(back.consume('b', 500).allowed, false);
  assert.equal(tokenBucket({ limit: 2, refillPerSec: 1, clock }).inspect('fresh').tokens, 2);
});

test('cost, validation and configure', () => {
  const clock = createManualClock(0);
  const l = tokenBucket({ limit: 5, refillPerSec: 1, clock });
  assert.equal(l.consume('k', 0, 5).allowed, true);
  assert.throws(() => l.consume('k', 0, 0), RangeError);
  assert.throws(() => l.consume('k', 0, 6), RangeError);
  assert.throws(() => l.consume('k', 0, 1.5), RangeError);
  assert.throws(() => createLimiter('nope', {}), TypeError);
  assert.throws(() => fixedWindow({ limit: 0, windowMs: 1 }), RangeError);
  assert.throws(() => fixedWindow({ limit: 1 }), RangeError);
  assert.throws(() => tokenBucket({ limit: 1, refillPerSec: 0 }), RangeError);
  assert.throws(() => tokenBucket({ limit: 1, refillPerSec: Infinity }), RangeError);
  assert.deepEqual(l.configure({ limit: 10 }), { limit: 10, refillPerSec: 1 });
  assert.equal(l.config.limit, 10);
  assert.throws(() => l.configure({ limit: -1 }), RangeError);
  assert.equal(l.config.limit, 10);
  l.reset('k');
  assert.equal(l.inspect('k').tokens, 10);
  assert.equal(l.name, 'tokenBucket');
  assert.equal(l.algo, 'tokenBucket');
  // default key and default (system) clock
  const sys = fixedWindow({ limit: 2, windowMs: 60_000 });
  assert.equal(sys.consume().allowed, true);
  assert.equal(sys.inspect().count, 1);
  assert.equal(sys.inspect().key, 'global');
  sys.reset();
  assert.equal(sys.inspect().count, 0);
});

test('limiters sharing a store are isolated by name', () => {
  const store = new MemoryStore();
  const clock = createManualClock(0);
  const a = fixedWindow({ limit: 1, windowMs: 1000, clock, store, name: 'a' });
  const b = fixedWindow({ limit: 1, windowMs: 1000, clock, store, name: 'b' });
  assert.equal(a.consume('k').allowed, true);
  assert.equal(b.consume('k').allowed, true);
  assert.equal(a.consume('k').allowed, false);
  assert.equal(store.size, 2);
});

test('determinism: same clock script gives identical results across all algorithms', () => {
  const run = () => {
    const clock = createManualClock(0);
    const ls = [fixedWindow({ limit: 5, windowMs: 1000, clock }), slidingLog({ limit: 5, windowMs: 1000, clock }),
      slidingCounter({ limit: 5, windowMs: 1000, clock }), tokenBucket({ limit: 5, refillPerSec: 5, clock })];
    const out = [];
    for (let i = 0; i < 200; i++) { clock.advance((i * 37) % 120); for (const l of ls) out.push(l.consume('k').allowed); }
    return out;
  };
  assert.deepEqual(run(), run());
});

test('invariant: no algorithm except fixed window lets more than limit through in any sliding window', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const clock = createManualClock(0);
  const L = 10, W = 1000;
  const log = slidingLog({ limit: L, windowMs: W, clock });
  const allowedAt = [];
  for (let i = 0; i < 3000; i++) {
    clock.advance(Math.floor(rnd() * 60));
    if (log.consume('k').allowed) allowedAt.push(clock.now());
  }
  for (let i = 0; i + L < allowedAt.length; i++) assert.ok(allowedAt[i + L] - allowedAt[i] >= W, `window violated at ${i}`);
  // token bucket: over any interval T, allowed <= capacity + rate*T
  const tb = tokenBucket({ limit: L, refillPerSec: 5, clock: createManualClock(0) });
  const times = [];
  let t = 0;
  for (let i = 0; i < 3000; i++) { t += Math.floor(rnd() * 60); if (tb.consume('k', t).allowed) times.push(t); }
  for (let i = 0; i < times.length; i += 17) {
    for (let j = i; j < Math.min(times.length, i + 200); j++) assert.ok(j - i + 1 <= L + (5 * (times[j] - times[i])) / 1000 + 1e-9);
  }
});
