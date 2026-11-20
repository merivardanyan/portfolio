import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHttpServer, DEFAULTS } from '../src/app.js';
import { createManualClock, SqliteStore } from '../../lib/index.js';

const clock = createManualClock(1_000_000);
let server, base;

before(async () => {
  server = createHttpServer({ clock, corsOrigin: 'http://lab.test' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('each algorithm guards its endpoint with standard headers', async () => {
  for (const algo of Object.keys(DEFAULTS)) {
    const statuses = [];
    let last;
    for (let i = 0; i < 6; i++) {
      last = await fetch(`${base}/api/limited/${algo}?key=t1`);
      statuses.push(last.status);
      if (i === 0) {
        assert.equal(last.headers.get('ratelimit-limit'), '5');
        assert.equal(last.headers.get('ratelimit-remaining'), '4');
        assert.ok(last.headers.get('ratelimit-reset'));
        const body = await last.json();
        assert.equal(body.ok, true);
        assert.equal(body.remaining, 4);
      }
    }
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429], algo);
    assert.ok(Number(last.headers.get('retry-after')) >= 1);
    const err = await last.json();
    assert.equal(err.error.code, 'rate_limited');
    assert.match(err.error.message, /^Denied \(429\)/);
    assert.ok(err.error.details.retryAfterMs > 0);
  }
});

test('inspect shows internals and advances with the injected clock', async () => {
  let r = await (await fetch(`${base}/api/inspect/tokenBucket?key=t1`)).json();
  assert.equal(r.state.algo, 'tokenBucket');
  assert.equal(r.state.remaining, 0);
  assert.equal(r.state.nextTokenInMs, 2000);
  clock.advance(2000);
  r = await (await fetch(`${base}/api/inspect/tokenBucket?key=t1`)).json();
  assert.equal(r.state.remaining, 1);
  assert.equal((await fetch(`${base}/api/limited/tokenBucket?key=t1`)).status, 200);
  const log = await (await fetch(`${base}/api/inspect/slidingLog?key=t1`)).json();
  assert.equal(log.state.log.length, 5);
});

test('keys: default is client IP, custom keys validated', async () => {
  assert.equal((await fetch(`${base}/api/limited/fixedWindow`)).status, 200);
  const ip = await (await fetch(`${base}/api/inspect/fixedWindow`)).json();
  assert.match(ip.state.key, /127\.0\.0\.1/);
  const bad = await fetch(`${base}/api/limited/fixedWindow?key=${encodeURIComponent('a b<')}`);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'invalid_key');
});

test('config endpoint validates and applies; reset clears a key', async () => {
  let r = await post('/api/config/fixedWindow', { limit: 2, windowMs: 1000 });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).config, { limit: 2, windowMs: 1000 });
  r = await post('/api/config/tokenBucket', { refillPerSec: 0.25 });
  assert.equal((await r.json()).config.refillPerSec, 0.25);
  r = await post('/api/config/fixedWindow', { refillPerSec: 1, limit: 0, windowMs: 1.5 });
  assert.equal(r.status, 422);
  const err = await r.json();
  assert.deepEqual(err.error.details.map((d) => d.field).sort(), ['limit', 'refillPerSec', 'windowMs']);
  r = await post('/api/config/fixedWindow', [1]);
  assert.equal(r.status, 400);
  const algos = await (await fetch(`${base}/api/algorithms`)).json();
  assert.deepEqual(algos.find((a) => a.algo === 'fixedWindow').config, { limit: 2, windowMs: 1000 });

  await fetch(`${base}/api/limited/fixedWindow?key=r1`);
  await fetch(`${base}/api/limited/fixedWindow?key=r1`);
  assert.equal((await fetch(`${base}/api/limited/fixedWindow?key=r1`)).status, 429);
  assert.equal((await post('/api/reset/fixedWindow?key=r1', {})).status, 200);
  assert.equal((await fetch(`${base}/api/limited/fixedWindow?key=r1`)).status, 200);
});

test('errors: unknown algorithm, unknown route, CORS exposes rate-limit headers', async () => {
  let r = await fetch(`${base}/api/limited/leakyBucket`);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error.code, 'unknown_algorithm');
  r = await fetch(`${base}/api/limited/__proto__`);
  assert.equal(r.status, 404);
  r = await fetch(`${base}/nope`);
  assert.equal(r.status, 404);
  r = await fetch(`${base}/api/limited/tokenBucket`, { headers: { origin: 'http://lab.test' } });
  assert.equal(r.headers.get('access-control-allow-origin'), 'http://lab.test');
  assert.match(r.headers.get('access-control-expose-headers'), /Retry-After/);
  r = await fetch(`${base}/api/limited/tokenBucket`, { method: 'OPTIONS', headers: { origin: 'http://lab.test' } });
  assert.equal(r.status, 204);
});

test('production mode disables config; SQLite store works end to end', async () => {
  const db = new DatabaseSync(':memory:');
  const s = createHttpServer({ allowConfig: false, store: new SqliteStore(db), clock: createManualClock(0) });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${s.address().port}`;
  const r = await fetch(`${url}/api/config/fixedWindow`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"limit":1}' });
  assert.equal(r.status, 403);
  assert.equal((await fetch(`${url}/api/reset/fixedWindow`, { method: 'POST' })).status, 403);
  for (let i = 0; i < 5; i++) assert.equal((await fetch(`${url}/api/limited/slidingCounter?key=s`)).status, 200);
  assert.equal((await fetch(`${url}/api/limited/slidingCounter?key=s`)).status, 429);
  const row = db.prepare('SELECT key, algo FROM buckets').get();
  assert.deepEqual({ ...row }, { key: 's', algo: 'slidingCounter' });
  await new Promise((r2) => s.close(r2));
});
