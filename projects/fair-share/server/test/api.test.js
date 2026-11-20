import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, createStore } from '../src/db.js';
import { createHttpServer } from '../src/app.js';
import { clientIp } from '../src/http.js';
import { seedSample, SAMPLE_BILL_ID } from '../src/seed.js';
import { applyPatch, rebase } from '../../core/bill.js';
import { computeSplit } from '../../core/split.js';

let server, base, wsBase, db;
const logs = [];

before(async () => {
  db = openDb(':memory:');
  server = createHttpServer({ db, corsOrigin: 'http://app.test', limits: { createPerMin: 100, joinPerMin: 100 }, log: (m) => logs.push(m) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  wsBase = base.replace('http', 'ws');
});
after(() => new Promise((r) => server.close(r)));

const json = (method, path, body, headers = {}) => fetch(base + path, {
  method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
});
const auth = (t) => ({ authorization: `Bearer ${t}` });

/** WebSocket client (Node's built-in WebSocket) with an awaitable message queue. */
function connect(billId, url = wsBase) {
  const ws = new WebSocket(`${url}/ws?bill=${billId}`);
  const queue = [], waiters = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    const i = waiters.findIndex((w) => w.pred(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg); else queue.push(msg);
  });
  const next = (pred = () => true, ms = 2000) => {
    const i = queue.findIndex(pred);
    if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      waiters.push({ pred, resolve });
      setTimeout(() => reject(new Error('timeout waiting for ws message')), ms).unref();
    });
  };
  const opened = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const closed = new Promise((res) => ws.addEventListener('close', (e) => res(e)));
  const send = (m) => ws.send(JSON.stringify(m));
  return { ws, next, opened, closed, queue, send, close: () => ws.close() };
}

/** Connect and authenticate as a participant. */
async function connectAs(billId, participantId, token) {
  const c = connect(billId);
  await c.opened;
  await c.next((m) => m.type === 'snapshot');
  c.send({ type: 'auth', participantId, token, reqId: 'auth' });
  const r = await c.next((m) => m.type === 'authed' || m.type === 'error');
  assert.equal(r.type, 'authed', JSON.stringify(r));
  return c;
}

async function newBill(extra = {}) {
  const res = await json('POST', '/api/bills', {
    title: 'Test dinner', currency: 'USD', taxCents: 300, tip: { mode: 'percent', value: 2000 },
    items: [{ name: 'Pizza', unitCents: 1200, qty: 2 }, { name: 'Wine', unitCents: 1000 }], ...extra,
  });
  assert.equal(res.status, 201);
  return res.json();
}
const join = async (id, name) => (await json('POST', `/api/bills/${id}/participants`, { name })).json();

test('create bill -> snapshot -> join returns a one-time participant token', async () => {
  const { id, hostToken, bill } = await newBill();
  assert.match(id, /^[A-HJKMNP-Z2-9]{8}$/);
  assert.ok(hostToken.length >= 40);
  assert.ok(bill.items.every((i) => /^[A-Za-z0-9]{12}$/.test(i.id)));

  const snap = await (await fetch(`${base}/api/bills/${id}`)).json();
  assert.equal(snap.split.totalCents, 3400 + 300 + 680);

  const j = await json('POST', `/api/bills/${id}/participants`, { name: '  Ana ', reqId: 'j1' });
  assert.equal(j.status, 201);
  const jb = await j.json();
  assert.equal(jb.participant.name, 'Ana');
  assert.match(jb.participantToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(jb.version, 1);
  // tokens and hashes never leak through reads
  const after = JSON.stringify(await (await fetch(`${base}/api/bills/${id}`)).json());
  assert.ok(!after.includes(jb.participantToken) && !/token/i.test(after));
});

test('duplicate names are rejected (double-tap join creates one person)', async () => {
  const { id } = await newBill();
  assert.equal((await json('POST', `/api/bills/${id}/participants`, { name: 'Ana' })).status, 201);
  const r = await json('POST', `/api/bills/${id}/participants`, { name: 'ana ' });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error.code, 'duplicate_name');
});

test('bill creation validation and malformed URLs', async () => {
  let r = await json('POST', '/api/bills', { currency: 'XXXX' });
  assert.equal((await r.json()).error.code, 'invalid_currency');
  r = await json('POST', '/api/bills', { items: [{ name: 'x', unitCents: 1.5 }] });
  assert.equal((await r.json()).error.code, 'invalid_unitCents');
  r = await json('POST', '/api/bills', { items: 'x' });
  assert.equal((await r.json()).error.code, 'invalid_items');
  r = await json('POST', '/api/bills', [1]);
  assert.equal((await r.json()).error.code, 'invalid_body');
  r = await fetch(`${base}/api/bills/ZZZZZZZZ`);
  assert.equal((await r.json()).error.code, 'bill_not_found');
  r = await fetch(`${base}/api/bills/%E0%A4%A`);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, 'bad_request');
});

test('PATCH: host auth, atomic batch, reqIds echoed on broadcasts and in the response', async () => {
  const { id, hostToken, bill } = await newBill();
  let r = await json('PATCH', `/api/bills/${id}`, { ops: [{ op: 'bill.set', title: 'x' }] });
  assert.equal(r.status, 401);
  r = await json('PATCH', `/api/bills/${id}`, { ops: [{ op: 'bill.set', title: 'x' }] }, auth('A'.repeat(43)));
  assert.equal(r.status, 403);

  r = await json('PATCH', `/api/bills/${id}`, { ops: [{ op: 'bill.set', title: 'Renamed' }, { op: 'item.remove', id: 'nope' }] }, auth(hostToken));
  assert.equal(r.status, 404);
  assert.equal(createStore(db).load(id).title, 'Test dinner', 'nothing from a failed batch is persisted');
  r = await json('PATCH', `/api/bills/${id}`, { ops: [{ op: 'bill.set', reqId: 'has spaces!' }] }, auth(hostToken));
  assert.equal((await r.json()).error.code, 'invalid_req_id');

  const watcher = connect(id);
  await watcher.opened;
  await watcher.next((m) => m.type === 'snapshot');
  r = await json('PATCH', `/api/bills/${id}`, {
    ops: [
      { op: 'bill.set', title: 'Renamed', taxCents: 500, reqId: 'h1' },
      { op: 'item.add', item: { id: 'dessert1', name: 'Gelato', unitCents: 600, qty: 2 }, index: 0, reqId: 'h2' },
      { op: 'item.update', id: bill.items[1].id, unitCents: 1100 },
      { op: 'item.remove', id: bill.items[0].id, reqId: 7 },
    ],
  }, auth(hostToken));
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.version, 4);
  assert.deepEqual(out.applied, [{ reqId: 'h1', version: 1 }, { reqId: 'h2', version: 2 }, { version: 3 }, { reqId: 7, version: 4 }]);
  const patches = [];
  for (let i = 0; i < 4; i++) patches.push(await watcher.next((m) => m.type === 'patch'));
  assert.deepEqual(patches.map((p) => [p.version, p.reqId]), [[1, 'h1'], [2, 'h2'], [3, undefined], [4, 7]]);
  assert.deepEqual(createStore(db).load(id), out.bill);
  watcher.close();
});

test('regression (review #2): a host op confirmed by its broadcast is not double-applied by rebase', async () => {
  const { id, hostToken } = await newBill();
  const c = connect(id);
  await c.opened;
  let confirmed = (await c.next((m) => m.type === 'snapshot')).bill;
  let pending = [{ reqId: 'add-1', op: { op: 'item.add', item: { id: 'fries01', name: 'Fries', unitCents: 400 } } }];
  const http = json('PATCH', `/api/bills/${id}`, { ops: [{ ...pending[0].op, reqId: 'add-1' }] }, auth(hostToken));
  const patch = await c.next((m) => m.type === 'patch');
  assert.equal(patch.reqId, 'add-1');
  confirmed = applyPatch(confirmed, patch).state;
  pending = pending.filter((p) => p.reqId !== patch.reqId); // the client's drop-on-confirm step
  const { view, rejected } = rebase(confirmed, pending);
  assert.deepEqual(rejected, []);
  assert.equal(view.items.filter((i) => i.id === 'fries01').length, 1);
  assert.equal((await http).status, 200);
  c.close();
});

test('WebSocket: auth required to claim; claims broadcast with reqId; acks; errors carry reqId', async () => {
  const { id, bill } = await newBill();
  const ana = await join(id, 'Ana');
  const ben = await join(id, 'Ben');
  const a = await connectAs(id, ana.participantId, ana.participantToken);
  const b = await connectAs(id, ben.participantId, ben.participantToken);
  const spectator = connect(id);
  await spectator.opened;
  await spectator.next((m) => m.type === 'snapshot');

  const pizza = bill.items[0].id;
  a.send({ type: 'claim', itemId: pizza, reqId: 'r1' });
  const pa = await a.next((m) => m.type === 'patch');
  const pb = await b.next((m) => m.type === 'patch');
  assert.deepEqual(pa, pb);
  assert.deepEqual(pa, { type: 'patch', version: 3, op: { op: 'claim', itemId: pizza, participantId: ana.participantId }, reqId: 'r1' });

  // the body can't choose who you claim for: participantId comes from the authenticated socket
  a.send({ type: 'claim', itemId: bill.items[1].id, participantId: ben.participantId, reqId: 'r1b' });
  assert.equal((await a.next((m) => m.reqId === 'r1b')).op.participantId, ana.participantId);

  a.send({ type: 'claim', itemId: pizza, reqId: 'r2' });
  assert.deepEqual(await a.next((m) => m.type === 'ack'), { type: 'ack', reqId: 'r2', version: 4 });

  spectator.send({ type: 'claim', itemId: pizza, reqId: 9 });
  assert.deepEqual(await spectator.next((m) => m.type === 'error'),
    { type: 'error', reqId: 9, code: 'forbidden', message: 'Send { type: "auth", participantId, token } before claiming' });
  a.send({ type: 'claim', itemId: 'missing', reqId: 'r3' });
  assert.deepEqual(await a.next((m) => m.type === 'error'), { type: 'error', reqId: 'r3', code: 'item_not_found', message: 'no such item' });
  a.ws.send('not json');
  assert.equal((await a.next((m) => m.type === 'error')).code, 'invalid_message');
  a.send({ type: 'dance', reqId: 'r4' });
  assert.deepEqual([(await a.next((m) => m.type === 'error')).reqId], ['r4']);
  a.send({ type: 'ping', t: 42 });
  assert.deepEqual(await a.next((m) => m.type === 'pong'), { type: 'pong', t: 42 });

  b.send({ type: 'sync' });
  const fresh = await b.next((m) => m.type === 'snapshot');
  assert.deepEqual(fresh.bill.claims[pizza], [ana.participantId]);
  a.close(); b.close(); spectator.close();
});

test('FS-2: impersonation with a public participant id is rejected; the host can act on someone\'s behalf', async () => {
  const { id, hostToken, bill } = await newBill();
  const ana = await join(id, 'Ana');
  const mallory = await join(id, 'Mallory');
  const m = connect(id);
  await m.opened;
  const snap = await m.next((x) => x.type === 'snapshot');
  assert.ok(snap.bill.participants.some((p) => p.id === ana.participantId), 'ids are public');
  // Mallory knows Ana's public id but not her token
  m.send({ type: 'auth', participantId: ana.participantId, token: mallory.participantToken, reqId: 'imp' });
  assert.deepEqual(await m.next((x) => x.type === 'error'), { type: 'error', reqId: 'imp', code: 'invalid_token', message: 'Unknown participant or wrong participant token' });
  m.send({ type: 'auth', participantId: ana.participantId, token: 'garbage' });
  assert.equal((await m.next((x) => x.type === 'error')).code, 'invalid_token');
  m.send({ type: 'claim', itemId: bill.items[0].id, reqId: 'c' });
  assert.equal((await m.next((x) => x.reqId === 'c')).code, 'forbidden');
  for (let i = 0; i < 3; i++) m.send({ type: 'auth', participantId: ana.participantId, token: 'x'.repeat(43) });
  assert.equal((await m.closed).code, 1008, 'closed after repeated auth failures');
  assert.equal(createStore(db).load(id).claims[bill.items[0].id], undefined);

  // the host acts for Ana through PATCH (host role may claim/unclaim for any participant)
  const r = await json('PATCH', `/api/bills/${id}`, { ops: [{ op: 'claim', itemId: bill.items[0].id, participantId: ana.participantId, reqId: 'host-claim' }] }, auth(hostToken));
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).bill.claims[bill.items[0].id], [ana.participantId]);
  // ...but not with a participant's token
  const r2 = await json('PATCH', `/api/bills/${id}`, { ops: [{ op: 'bill.lock', locked: true }] }, auth(ana.participantToken));
  assert.equal(r2.status, 403);
});

test('FS-1 regression: an oversized WebSocket frame closes that socket (1009) and the server survives', async () => {
  const { id } = await newBill();
  const ana = await join(id, 'Ana');
  const bystander = await connectAs(id, ana.participantId, ana.participantToken);
  const attacker = connect(id);
  await attacker.opened;
  await attacker.next((m) => m.type === 'snapshot');
  attacker.ws.send(JSON.stringify({ type: 'ping', t: 'x'.repeat(5000) }));
  const ev = await attacker.closed;
  assert.equal(ev.code, 1009);
  // process still up: HTTP works, the other socket still works, new sockets connect
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  bystander.send({ type: 'ping', t: 1 });
  assert.equal((await bystander.next((m) => m.type === 'pong')).t, 1);
  const again = connect(id);
  await again.opened;
  assert.equal((await again.next((m) => m.type === 'snapshot')).type, 'snapshot');
  assert.ok(logs.some((l) => /Max payload|1009|UNSUPPORTED_MESSAGE_LENGTH/i.test(l)));
  again.close(); bystander.close();
});

test('WebSocket upgrade is rejected for unknown bills, bad paths and foreign origins', async () => {
  const { id } = await newBill();
  const fails = async (url, opts) => {
    const ws = new WebSocket(url, opts);
    await new Promise((resolve, reject) => { ws.addEventListener('error', resolve); ws.addEventListener('open', () => reject(new Error('opened'))); });
  };
  await fails(`${wsBase}/ws?bill=ZZZZZZZZ`);
  await fails(`${wsBase}/nope?bill=${id}`);
  await fails(`${wsBase}/ws?bill=${id}`, { headers: { origin: 'http://evil.test' } });
});

test('locked bills reject claims and joins', async () => {
  const { id, hostToken, bill } = await newBill();
  const ana = await join(id, 'Ana');
  const a = await connectAs(id, ana.participantId, ana.participantToken);
  await json('PATCH', `/api/bills/${id}`, { ops: [{ op: 'bill.lock', locked: true }] }, auth(hostToken));
  a.send({ type: 'claim', itemId: bill.items[0].id, reqId: 'r9' });
  assert.equal((await a.next((m) => m.type === 'error' && m.reqId === 'r9')).code, 'bill_locked');
  assert.equal((await json('POST', `/api/bills/${id}/participants`, { name: 'Late' })).status, 409);
  a.close();
});

test('rate limits: WS errors carry the reqId of the dropped op; bill creation 429', async () => {
  const d = openDb(':memory:');
  const s = createHttpServer({ db: d, limits: { createPerMin: 1, wsMsgsPer5s: 2 } });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${s.address().port}`;
  const mk = () => fetch(`${url}/api/bills`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"items":[{"name":"x","unitCents":1}]}' });
  const first = await mk();
  assert.equal(first.status, 201);
  const { id } = await first.json();
  assert.equal((await mk()).status, 429);

  const c = connect(id, url.replace('http', 'ws'));
  await c.opened;
  await c.next((m) => m.type === 'snapshot');
  c.send({ type: 'ping' });
  c.send({ type: 'ping' });
  c.send({ type: 'claim', itemId: 'x', reqId: 'dropped-1' });
  assert.deepEqual(await c.next((m) => m.type === 'error'), { type: 'error', reqId: 'dropped-1', code: 'rate_limited', message: 'Too many messages; slow down and resync' });
  c.close();
  await new Promise((r) => s.close(r));
});

test('sample seed: idempotent, consistent, participant tokens work', async () => {
  const d = openDb(':memory:');
  const seeded = seedSample(d);
  assert.ok(seeded.hostToken && seeded.participantTokens.ana);
  assert.equal(seedSample(d), null);
  const bill = createStore(d).load(SAMPLE_BILL_ID);
  assert.equal(bill.participants.length, 3);
  assert.deepEqual(bill.claims.wine, ['ana', 'ben', 'chloe']);
  assert.equal(bill.version, 9);
  const split = computeSplit(bill);
  assert.equal(split.people.reduce((s, p) => s + p.totalCents, 0) + split.unclaimed.totalCents, split.totalCents);
  assert.match(createStore(d).participantTokenHash(SAMPLE_BILL_ID, 'ana'), /^[0-9a-f]{64}$/);
});

test('legacy databases are migrated in place (token_hash column added)', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join: pjoin } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(pjoin(tmpdir(), 'fs-mig-'));
  const file = pjoin(dir, 'old.sqlite');
  const old = new DatabaseSync(file);
  old.exec('CREATE TABLE participants (id TEXT NOT NULL, bill_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL, joined_at TEXT, seq INTEGER NOT NULL, PRIMARY KEY (bill_id, id))');
  old.close();
  const m = openDb(file);
  assert.ok(m.prepare('PRAGMA table_info(participants)').all().some((c) => c.name === 'token_hash'));
  m.close();
  rmSync(dir, { recursive: true, force: true });
});

test('clientIp uses the right-most untrusted X-Forwarded-For hop', () => {
  const req = (xff) => ({ headers: { 'x-forwarded-for': xff }, socket: { remoteAddress: '10.0.0.1' } });
  assert.equal(clientIp(req('6.6.6.6, 1.2.3.4'), 1), '1.2.3.4'); // client-supplied 6.6.6.6 ignored
  assert.equal(clientIp(req('6.6.6.6, 1.2.3.4, 10.0.0.2'), 2), '1.2.3.4');
  assert.equal(clientIp(req('1.2.3.4'), 5), '1.2.3.4');
  assert.equal(clientIp(req('6.6.6.6'), 0), '10.0.0.1');
  assert.equal(clientIp(req(''), true), '10.0.0.1');
});

test('CORS preflight', async () => {
  const r = await fetch(`${base}/api/bills`, { method: 'OPTIONS', headers: { origin: 'http://app.test' } });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), 'http://app.test');
  assert.match(r.headers.get('access-control-allow-methods'), /PATCH/);
});
