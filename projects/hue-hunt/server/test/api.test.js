import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDb } from '../src/db.js';
import { createHttpServer } from '../src/app.js';
import { seedDemoData } from '../src/seed.js';
import { dailyColors, dateKey, addDays, puzzleNumber } from '../../core/seed.js';
import { scoreGame } from '../../core/score.js';

const NOW = Date.UTC(2026, 10, 19, 15, 0, 0);
const TODAY = dateKey(new Date(NOW), { utc: true });
let server, base, db;

before(async () => {
  db = openDb(':memory:');
  server = createHttpServer({ db, now: () => NOW, corsOrigin: 'http://allowed.test', submitLimit: 1000 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

const post = (path, body, headers = {}) => fetch(base + path, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('GET /api/puzzle/today returns no colours', async () => {
  const res = await fetch(`${base}/api/puzzle/today`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { date: TODAY, number: puzzleNumber(TODAY), roundCount: 5 });
});

test('submission is scored server-side and is one-per-day', async () => {
  const playerId = randomUUID();
  const targets = dailyColors(TODAY);
  const res = await post('/api/submissions', { playerId, date: TODAY, guesses: targets, nickname: 'Perfect Pat', score: 0 });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.score, 100);
  assert.equal(body.rounds.length, 5);
  assert.equal(body.percentile, 100);

  const dup = await post('/api/submissions', { playerId, date: TODAY, guesses: targets.map((t) => ({ ...t, h: 0 })) });
  assert.equal(dup.status, 409);
  const err = await dup.json();
  assert.equal(err.error.code, 'already_submitted');
  assert.equal(err.error.details.score, 100);
});

test('percentile reflects other players', async () => {
  const targets = dailyColors(TODAY);
  const bad = targets.map((t) => ({ h: (t.h + 180) % 360, s: t.s, l: t.l }));
  const r1 = await (await post('/api/submissions', { playerId: randomUUID(), date: TODAY, guesses: bad })).json();
  assert.equal(r1.score, scoreGame(targets, bad).score);
  assert.equal(r1.percentile, 0); // the only other player scored 100
  const mid = targets.map((t) => ({ ...t, l: Math.min(100, t.l + 8) }));
  const r2 = await (await post('/api/submissions', { playerId: randomUUID(), date: TODAY, guesses: mid })).json();
  assert.equal(r2.percentile, 50);
});

test('validation errors use the shared error shape', async () => {
  let res = await post('/api/submissions', { playerId: 'nope', date: TODAY, guesses: [{ h: 999 }] });
  assert.equal(res.status, 400);
  let body = await res.json();
  assert.equal(body.error.code, 'validation_failed');
  assert.deepEqual(body.error.details.map((d) => d.field).sort(), ['guesses', 'playerId']);

  res = await post('/api/submissions', { playerId: randomUUID(), date: addDays(TODAY, -3), guesses: dailyColors(TODAY) });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error.code, 'date_not_playable');

  res = await post('/api/submissions', '{bad json');
  assert.equal((await res.json()).error.code, 'invalid_json');

  res = await post('/api/submissions', { playerId: randomUUID(), date: TODAY, guesses: dailyColors(TODAY), nickname: '<script>' });
  assert.equal(res.status, 400);

  res = await fetch(`${base}/api/submissions`, { method: 'POST', body: '{}' });
  assert.equal(res.status, 415);

  res = await post('/api/submissions', [1, 2]);
  assert.equal((await res.json()).error.code, 'invalid_body');

  res = await post('/api/submissions', 'x'.repeat(20_000));
  assert.equal(res.status, 413);
});

test('timezone tolerance: yesterday/tomorrow (UTC) are playable', async () => {
  for (const date of [addDays(TODAY, -1), addDays(TODAY, 1)]) {
    const res = await post('/api/submissions', { playerId: randomUUID(), date, guesses: dailyColors(date) });
    assert.equal(res.status, 201, date);
  }
});

test('leaderboard and stats', async () => {
  let res = await fetch(`${base}/api/leaderboard/${TODAY}?limit=2`);
  const lb = await res.json();
  assert.equal(lb.length, 2);
  assert.deepEqual(lb[0], { nickname: 'Perfect Pat', score: 100 });
  assert.ok(lb[0].score >= lb[1].score);

  res = await fetch(`${base}/api/leaderboard/${TODAY}?limit=500`);
  assert.equal(res.status, 400);
  res = await fetch(`${base}/api/leaderboard/2026-02-31`);
  assert.equal(res.status, 400);
  res = await fetch(`${base}/api/leaderboard/2030-01-01`);
  assert.equal(res.status, 404);

  const stats = await (await fetch(`${base}/api/stats/${TODAY}`)).json();
  assert.equal(stats.players, 3);
  assert.equal(stats.histogram.length, 10);
  assert.equal(stats.histogram.reduce((a, b) => a + b, 0), 3);
  assert.equal(stats.histogram[9], 1);
  const empty = await (await fetch(`${base}/api/stats/2026-01-05`)).json();
  assert.deepEqual(empty, { players: 0, mean: 0, histogram: new Array(10).fill(0) });
});

test('routing, CORS and method errors', async () => {
  let res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'not_found');
  res = await fetch(`${base}/api/submissions`);
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'POST');
  res = await fetch(`${base}/api/puzzle/today`, { method: 'OPTIONS', headers: { origin: 'http://allowed.test' } });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://allowed.test');
  res = await fetch(`${base}/api/puzzle/today`, { headers: { origin: 'http://evil.test' } });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('submission endpoint is rate limited', async () => {
  const d = openDb(':memory:');
  const s = createHttpServer({ db: d, now: () => NOW, submitLimit: 2 });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${s.address().port}/api/submissions`;
  const send = () => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ playerId: randomUUID(), date: TODAY, guesses: dailyColors(TODAY) }) });
  assert.equal((await send()).status, 201);
  assert.equal((await send()).status, 201);
  const res = await send();
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get('retry-after')) > 0);
  await new Promise((r) => s.close(r));
});

test('seedDemoData is deterministic and idempotent', () => {
  const d = openDb(':memory:');
  const n = seedDemoData(d, { days: 3, playersPerDay: 20, now: () => NOW });
  assert.ok(n > 0 && n <= 60);
  assert.equal(seedDemoData(d, { days: 3, now: () => NOW }), 0);
  const d2 = openDb(':memory:');
  assert.equal(seedDemoData(d2, { days: 3, playersPerDay: 20, now: () => NOW }), n);
});
