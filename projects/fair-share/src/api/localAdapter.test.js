import { beforeEach, describe, expect, it } from 'vitest';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { localAdapter, SAMPLE_BILL_ID } = await import('./localAdapter.js');
const { BILL_ID_RE } = await import('../../core/index.js');

function listen(id) {
  const messages = [];
  const conn = localAdapter.connect(id, { onMessage: (m) => messages.push(m), onStatus: () => {} });
  const next = (type) => waitFor(() => messages.find((m) => m.type === type && !m.seen));
  return { conn, messages, next };
}

async function waitFor(fn, timeout = 1000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) {
      v.seen = true;
      return v;
    }
    if (Date.now() - start > timeout) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
}

async function tacoBill() {
  return localAdapter.createBill({
    title: 'Tacos',
    currency: 'USD',
    taxCents: 100,
    tip: { mode: 'percent', value: 1500 },
    items: [{ name: 'Al pastor', unitCents: 450, qty: 3 }],
  });
}

describe('localAdapter (mirror of the server protocol)', () => {
  beforeEach(() => store.clear());

  it('seeds the sample bill on first read', async () => {
    const { bill, split } = await localAdapter.getBill(SAMPLE_BILL_ID);
    expect(bill.participants.map((p) => p.name)).toEqual(['Ana', 'Ben', 'Chloe']);
    expect(split.totalCents).toBe(split.people.reduce((s, p) => s + p.totalCents, 0) + split.unclaimed.totalCents);
  });

  it('uses the server bill-id alphabet', async () => {
    const { id } = await tacoBill();
    expect(id).toMatch(BILL_ID_RE);
  });

  it('requires auth with the participant token before claiming', async () => {
    const { id, bill } = await tacoBill();
    const itemId = bill.items[0].id;
    const { participantId, participantToken } = await localAdapter.join(id, { name: 'Ana', reqId: 'j1' });
    expect(participantToken).toMatch(/^[\w-]{20,}$/);

    const tab = listen(id);
    await tab.next('snapshot');
    tab.conn.send({ type: 'claim', itemId, reqId: 'c0' });
    expect(await tab.next('error')).toMatchObject({ code: 'forbidden', reqId: 'c0' });

    tab.conn.send({ type: 'auth', participantId, token: 'wrong', reqId: 'a0' });
    expect(await tab.next('error')).toMatchObject({ code: 'invalid_token', reqId: 'a0' });

    tab.conn.send({ type: 'auth', participantId, token: participantToken, reqId: 'a1' });
    expect(await tab.next('authed')).toMatchObject({ participantId, reqId: 'a1' });

    tab.conn.send({ type: 'claim', itemId, reqId: 'c1' });
    const patch = await tab.next('patch');
    expect(patch).toMatchObject({ reqId: 'c1', op: { op: 'claim', itemId, participantId } });

    tab.conn.send({ type: 'claim', itemId, reqId: 'c2' });
    expect(await tab.next('ack')).toMatchObject({ reqId: 'c2' });
    tab.conn.close();
  });

  it('echoes the reqId of every host op in its patch broadcast', async () => {
    const { id, hostToken } = await tacoBill();
    const tab = listen(id);
    const snap = await tab.next('snapshot');
    const res = await localAdapter.patchBill(id, hostToken, [
      { reqId: 'h1', op: { op: 'item.add', item: { id: 'soda', name: 'Soda', unitCents: 250, qty: 1 } } },
      { reqId: 'h2', op: { op: 'bill.set', taxCents: 200 } },
    ]);
    expect(res.applied).toEqual([
      { reqId: 'h1', version: snap.version + 1 },
      { reqId: 'h2', version: snap.version + 2 },
    ]);
    expect((await tab.next('patch')).reqId).toBe('h1');
    expect((await tab.next('patch')).reqId).toBe('h2');
    tab.conn.close();
  });

  it('enforces the host token and the lock', async () => {
    const { id, hostToken } = await tacoBill();
    await expect(localAdapter.patchBill(id, 'wrong', [{ op: { op: 'bill.lock', locked: true } }])).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
    });
    const res = await localAdapter.patchBill(id, hostToken, [{ reqId: 'l', op: { op: 'bill.lock', locked: true } }]);
    expect(res.bill.locked).toBe(true);
    await expect(localAdapter.join(id, { name: 'Ben' })).rejects.toMatchObject({ code: 'bill_locked', status: 409 });
  });

  it('validates a host batch as a whole before applying anything', async () => {
    const { id, hostToken } = await localAdapter.createBill({ currency: 'USD', items: [] });
    await expect(
      localAdapter.patchBill(id, hostToken, [
        { op: { op: 'item.add', item: { id: 'ok', name: 'Fine', unitCents: 100 } } },
        { op: { op: 'item.remove', id: 'missing' } },
      ]),
    ).rejects.toMatchObject({ code: 'item_not_found' });
    const { bill } = await localAdapter.getBill(id);
    expect(bill.items).toEqual([]);
  });
});
