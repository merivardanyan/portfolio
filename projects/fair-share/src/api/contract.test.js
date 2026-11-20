import { describe, expect, it } from 'vitest';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { localAdapter } = await import('./localAdapter.js');
const { createHttpAdapter } = await import('./httpAdapter.js');
const { ApiError } = await import('./errors.js');

// A fake server speaking the documented REST wire format (server/README.md), backed by the
// local adapter's state. It checks what the http adapter actually puts on the wire.
function fakeFetch() {
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
  return async (url, init = {}) => {
    const { pathname } = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    const token = init.headers?.Authorization?.replace(/^Bearer /, '');
    try {
      let m;
      if (pathname === '/api/bills' && init.method === 'POST') return reply(201, await localAdapter.createBill(body));
      if ((m = pathname.match(/^\/api\/bills\/(\w+)$/)) && init.method === 'PATCH') {
        const entries = body.ops.map(({ reqId, ...op }) => ({ reqId, op }));
        return reply(200, await localAdapter.patchBill(m[1], token, entries));
      }
      if ((m = pathname.match(/^\/api\/bills\/(\w+)$/))) return reply(200, await localAdapter.getBill(m[1]));
      if ((m = pathname.match(/^\/api\/bills\/(\w+)\/participants$/))) return reply(201, await localAdapter.join(m[1], body));
      return reply(404, { error: { code: 'not_found', message: 'Not found' } });
    } catch (err) {
      return reply(err.status ?? 500, { error: { code: err.code, message: err.message } });
    }
  };
}

const http = createHttpAdapter('http://api.test');

describe.each([
  ['localAdapter', localAdapter, () => {}],
  ['httpAdapter', http, () => (globalThis.fetch = fakeFetch())],
])('%s REST contract', (_name, api, setup) => {
  it('creates, reads, patches (echoing reqIds) and joins', async () => {
    setup();
    const { id, hostToken, bill } = await api.createBill({
      currency: 'EUR',
      items: [{ name: 'Soup', unitCents: 500, qty: 2 }],
    });
    expect(bill.items[0]).toMatchObject({ name: 'Soup', unitCents: 500, qty: 2, id: expect.any(String) });

    const read = await api.getBill(id);
    expect(read.split.totalCents).toBe(1000);

    const patched = await api.patchBill(id, hostToken, [{ reqId: 'r1', op: { op: 'bill.set', taxCents: 90 } }]);
    expect(patched.applied).toEqual([{ reqId: 'r1', version: bill.version + 1 }]);
    expect(patched.bill.taxCents).toBe(90);

    const joined = await api.join(id, { name: 'Ana', color: '#E4572E' });
    expect(joined).toMatchObject({
      participantId: expect.any(String),
      participantToken: expect.any(String),
      participant: { name: 'Ana', color: '#E4572E' },
    });
  });

  it('throws ApiError with status and code', async () => {
    setup();
    const missing = await api.getBill('NOPE2345').catch((e) => e);
    expect(missing).toBeInstanceOf(ApiError);
    expect(missing).toMatchObject({ status: 404, code: 'not_found' });

    const { id } = await api.createBill({ currency: 'USD', items: [] });
    const denied = await api.patchBill(id, 'bad', [{ op: { op: 'bill.lock', locked: true } }]).catch((e) => e);
    expect(denied).toMatchObject({ status: 401, code: 'unauthorized' });
  });
});

describe('httpAdapter transport', () => {
  it('maps a network failure to ApiError(0, network)', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(http.getBill('TASTY234')).rejects.toMatchObject({ status: 0, code: 'network' });
  });
});
