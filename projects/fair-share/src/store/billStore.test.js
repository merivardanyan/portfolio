import { describe, expect, it } from 'vitest';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { localAdapter } = await import('../api/localAdapter.js');
const { remember } = await import('../lib/identity.js');
const { useBillStore } = await import('./billStore.js');

async function until(fn, timeout = 1000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('billStore on the static-demo adapter', () => {
  it('applies a host item.add exactly once with no "changes undone" notice', async () => {
    const { id, hostToken } = await localAdapter.createBill({
      currency: 'USD',
      items: [{ name: 'Soup', unitCents: 500, qty: 1 }],
    });
    remember(id, { hostToken });
    const s = useBillStore.getState();
    s.open(id);
    await until(() => useBillStore.getState().status === 'live' && useBillStore.getState().confirmed);

    const ok = await useBillStore
      .getState()
      .hostOps([{ op: 'item.add', item: { id: 'bread', name: 'Bread', unitCents: 300, qty: 1 } }]);
    expect(ok).toBe(true);

    const st = useBillStore.getState();
    expect(st.notice).toBeNull();
    expect(st.pending).toEqual([]);
    expect(st.view.items.map((i) => i.name)).toEqual(['Soup', 'Bread']);
    expect(st.confirmed.items).toHaveLength(2);
    st.close();
  });

  it('joins, authenticates and claims; the claim is confirmed exactly once', async () => {
    const { id, bill } = await localAdapter.createBill({
      currency: 'USD',
      items: [{ name: 'Soup', unitCents: 500, qty: 1 }],
    });
    useBillStore.getState().open(id);
    await until(() => useBillStore.getState().status === 'live' && useBillStore.getState().confirmed);

    expect(await useBillStore.getState().join('Ana', '#E4572E')).toBe(true);
    await until(() => useBillStore.getState().authed);

    useBillStore.getState().toggleClaim(bill.items[0].id);
    expect(useBillStore.getState().view.claims[bill.items[0].id]).toHaveLength(1);
    await until(() => useBillStore.getState().pending.length === 0);

    const st = useBillStore.getState();
    expect(st.notice).toBeNull();
    expect(st.confirmed.claims[bill.items[0].id]).toEqual([st.me]);
    st.close();
  });
});
