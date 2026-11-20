import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MemoryStore, SqliteStore, tokenBucket, slidingLog, createManualClock } from '../index.js';

test('MemoryStore: ttl, clone isolation, prune, eviction', () => {
  const s = new MemoryStore({ maxKeys: 2 });
  s.set('a', { n: 1 }, 100, 0);
  const got = s.get('a', 50);
  got.n = 99;
  assert.deepEqual(s.get('a', 50), { n: 1 });
  assert.equal(s.get('a', 100), undefined); // expired
  assert.equal(s.get('missing'), undefined);
  s.set('a', { n: 1 }, 100, 0);
  s.set('b', { n: 2 }, 10, 0);
  s.set('c', { n: 3 }, 100, 50); // full: prune drops expired b
  assert.deepEqual([...s.map.keys()].sort(), ['a', 'c']);
  s.set('d', { n: 4 }, 100, 60); // full, nothing expired: evict oldest (a)
  assert.deepEqual([...s.map.keys()].sort(), ['c', 'd']);
  s.set('d', { n: 5 }, 100, 60); // overwrite existing doesn't evict
  assert.equal(s.size, 2);
  assert.equal(s.prune(1000), 2);
  s.set('x', {}, 0, 0); // ttl floors at 1ms
  assert.deepEqual(s.get('x', 0), {});
  s.delete('x');
  assert.equal(s.size, 0);
  const def = new MemoryStore();
  def.set('k', { v: 1 }, 60_000);
  assert.deepEqual(def.get('k'), { v: 1 });
  assert.equal(def.update('k', (st) => ({ state: { v: st.v + 1 }, ttlMs: 1000, value: 'ok' })), 'ok');
  assert.equal(def.prune(), 0);
});

test('SqliteStore: same behaviour as memory, persisted rows match the plan schema', () => {
  const db = new DatabaseSync(':memory:');
  const store = new SqliteStore(db);
  const clock = createManualClock(0);
  const l = tokenBucket({ limit: 3, refillPerSec: 1, clock, store });
  const mem = tokenBucket({ limit: 3, refillPerSec: 1, clock });
  for (let i = 0; i < 20; i++) {
    clock.advance(i % 3 === 0 ? 400 : 50);
    assert.deepEqual(l.consume('ip-1'), mem.consume('ip-1'));
  }
  const row = db.prepare('SELECT key, algo, state_json FROM buckets').get();
  assert.equal(row.key, 'ip-1');
  assert.equal(row.algo, 'tokenBucket');
  assert.ok(JSON.parse(row.state_json).last > 0);
  assert.deepEqual(l.inspect('ip-1'), mem.inspect('ip-1'));
  l.reset('ip-1');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM buckets').get().n, 0);

  // keys without a namespace, expiry and prune
  store.set('bare', { a: 1 }, 10, 0);
  assert.deepEqual(store.get('bare', 5), { a: 1 });
  assert.equal(store.get('bare', 10), undefined);
  assert.equal(store.prune(100), 1);
  store.set('z:1', { a: 1 }, 10);
  assert.deepEqual(store.get('z:1'), { a: 1 });
  store.delete('z:1');
  assert.equal(store.prune(), 0);
});

test('SqliteStore: update is atomic and rolls back on error', () => {
  const db = new DatabaseSync(':memory:');
  const store = new SqliteStore(db, { table: 'rl' });
  store.set('x:k', { n: 1 }, 1000, 0);
  assert.throws(() => store.update('x:k', () => { throw new Error('boom'); }, 0), /boom/);
  assert.deepEqual(store.get('x:k', 0), { n: 1 });
  assert.equal(db.isTransaction, false);
  assert.throws(() => new SqliteStore(db, { table: 'bad name; DROP' }), TypeError);
});

test('SqliteStore: two connections to one file never double-spend', async (t) => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'tl-'));
  const file = join(dir, 'rl.sqlite');
  const a = new DatabaseSync(file), b = new DatabaseSync(file);
  t.after(() => { a.close(); b.close(); rmSync(dir, { recursive: true, force: true }); });
  b.exec('PRAGMA busy_timeout = 2000');
  const clock = createManualClock(0);
  const la = slidingLog({ limit: 5, windowMs: 1000, clock, store: new SqliteStore(a) });
  const lb = slidingLog({ limit: 5, windowMs: 1000, clock, store: new SqliteStore(b) });
  const results = [];
  for (let i = 0; i < 10; i++) results.push((i % 2 ? la : lb).consume('shared').allowed);
  assert.equal(results.filter(Boolean).length, 5);
});
