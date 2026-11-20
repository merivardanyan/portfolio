import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  middleware, setRateLimitHeaders, explain, fixedWindow, tokenBucket, slidingLog, slidingCounter, createManualClock,
} from '../index.js';

function fakeRes() {
  return {
    headers: {}, status: 200, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    writeHead(s, h = {}) { this.status = s; for (const [k, v] of Object.entries(h)) this.setHeader(k, v); },
    end(b = '') { this.body = b; },
  };
}
const req = (ip = '1.2.3.4') => ({ socket: { remoteAddress: ip }, headers: {} });

test('node:http style: handler runs when allowed, 429 JSON + headers when denied', () => {
  const clock = createManualClock(0);
  const l = fixedWindow({ limit: 1, windowMs: 10_000, clock });
  let calls = 0;
  const mw = middleware(l, (rq, rs) => { calls++; rs.end('ok'); });
  const r1 = fakeRes();
  mw(req(), r1);
  assert.equal(calls, 1);
  assert.equal(r1.body, 'ok');
  assert.equal(r1.headers['ratelimit-limit'], '1');
  assert.equal(r1.headers['ratelimit-remaining'], '0');
  assert.equal(r1.headers['ratelimit-reset'], '10');
  assert.equal(r1.headers['ratelimit-policy'], '1;w=10');
  assert.equal(r1.headers['retry-after'], undefined);
  const r2 = fakeRes();
  mw(req(), r2);
  assert.equal(calls, 1);
  assert.equal(r2.status, 429);
  assert.equal(r2.headers['retry-after'], '10');
  assert.equal(JSON.parse(r2.body).error.code, 'rate_limited');
  const r3 = fakeRes();
  mw(req('5.6.7.8'), r3); // different key
  assert.equal(calls, 2);
});

test('express style: next(), custom key/cost/onLimited, headers off, errors to next', () => {
  const l = tokenBucket({ limit: 3, refillPerSec: 1, clock: createManualClock(0) });
  let nexts = 0, limited = 0, err;
  const mw = middleware(l, { key: (r) => r.headers['x-api-key'], cost: () => 2, headers: false, onLimited: () => { limited++; } });
  const rq = { headers: { 'x-api-key': 'abc' } };
  const res = fakeRes();
  mw(rq, res, () => nexts++);
  mw(rq, res, () => nexts++);
  assert.equal(nexts, 1);
  assert.equal(limited, 1);
  assert.deepEqual(res.headers, {});
  assert.equal(rq.rateLimit.allowed, false);
  const tooBig = middleware(l, { cost: () => 99 });
  tooBig(req(), fakeRes(), (e) => { err = e; });
  assert.ok(err instanceof RangeError);
  assert.throws(() => tooBig(req(), fakeRes()), RangeError);
  // no handler, no next: just sets headers and returns
  const bare = middleware(fixedWindow({ limit: 5, windowMs: 1000 }));
  assert.equal(bare({ headers: {} }, fakeRes()), undefined);
});

test('headers: policy for token bucket, Retry-After floor of 1s', () => {
  const res = fakeRes();
  setRateLimitHeaders(res, { limit: 10, remaining: 0, resetMs: 1500, retryAfterMs: 200, allowed: false }, { limit: 10, refillPerSec: 2 });
  assert.equal(res.headers['ratelimit-policy'], '10;w=5');
  assert.equal(res.headers['retry-after'], '1');
  assert.equal(res.headers['ratelimit-reset'], '2');
  const r2 = fakeRes();
  setRateLimitHeaders(r2, { limit: 1, remaining: 1, resetMs: 0, retryAfterMs: 0, allowed: true });
  assert.equal(r2.headers['ratelimit-policy'], undefined);
});

test('works on a real node:http server', async () => {
  const server = createServer(middleware(fixedWindow({ limit: 2, windowMs: 60_000 }), (rq, rs) => rs.end('hi')));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const statuses = [];
  for (let i = 0; i < 3; i++) statuses.push((await fetch(url)).status);
  assert.deepEqual(statuses, [200, 200, 429]);
  await new Promise((r) => server.close(r));
});

test('explain() produces plain English for every algorithm and outcome', () => {
  const clock = createManualClock(0);
  const cases = [
    [fixedWindow({ limit: 1, windowMs: 1000, clock }), /window/],
    [slidingLog({ limit: 1, windowMs: 1500, clock }), /oldest/],
    [slidingCounter({ limit: 1, windowMs: 1000, clock }), /previous window/],
    [tokenBucket({ limit: 1, refillPerSec: 2.5, clock }), /bucket had/],
  ];
  for (const [l, re] of cases) {
    const ok = explain(l.consume('k'));
    const no = explain(l.consume('k'));
    assert.match(ok, /^Allowed/);
    assert.match(no, /^Denied \(429\)/);
    assert.match(ok + no, re);
  }
  clock.advance(300);
  const tb = tokenBucket({ limit: 1, refillPerSec: 2, clock });
  tb.consume('z'); clock.advance(200);
  assert.equal(explain(tb.consume('z')), 'Denied (429): the bucket had 0.40 tokens (needs 1). At 2/s the next token arrives in 300 ms.');
  assert.equal(explain({ algo: 'custom', allowed: true }), 'Allowed.');
  assert.equal(explain({ algo: 'custom', allowed: false, info: undefined }), 'Denied (429).');
  const fw = fixedWindow({ limit: 1, windowMs: 2000, clock: createManualClock(0) });
  fw.consume('a');
  assert.match(explain(fw.consume('a')), /in 2 s\.$/);
});
