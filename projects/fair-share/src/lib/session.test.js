import { describe, expect, it } from 'vitest';
import { applyOp, createBill } from '../../core/index.js';
import { derive, describeRejection, reduceMessage, toggleClaimOp } from './session.js';

function sample() {
  let bill = createBill({
    id: 'TESTBILL',
    currency: 'USD',
    taxCents: 100,
    tip: { mode: 'percent', value: 1000 },
    items: [
      { id: 'a', name: 'Pasta', unitCents: 1000, qty: 1 },
      { id: 'b', name: 'Salad', unitCents: 500, qty: 1 },
    ],
  });
  bill = applyOp(bill, { op: 'participant.join', participant: { id: 'me', name: 'Me' } });
  bill = applyOp(bill, { op: 'participant.join', participant: { id: 'you', name: 'You' } });
  return bill;
}

const claimMe = (itemId, reqId) => ({
  reqId,
  op: { op: 'claim', itemId, participantId: 'me' },
  ctx: { role: 'participant', participantId: 'me' },
});

describe('optimistic session', () => {
  it('shows a pending claim before the server confirms it', () => {
    const confirmed = sample();
    const { view, split } = derive(confirmed, [claimMe('a', 'r1')]);
    expect(view.claims.a).toEqual(['me']);
    expect(split.people.find((p) => p.participantId === 'me').subtotalCents).toBe(1000);
    expect(confirmed.claims.a).toBeUndefined();
  });

  it('drops the pending op when its patch arrives and applies the patch', () => {
    const confirmed = sample();
    const s0 = { confirmed, pending: [claimMe('a', 'r1')] };
    const op = { op: 'claim', itemId: 'a', participantId: 'me' };
    const s1 = reduceMessage(s0, { type: 'patch', version: confirmed.version + 1, op, reqId: 'r1' });
    expect(s1.pending).toEqual([]);
    expect(s1.confirmed.claims.a).toEqual(['me']);
    expect(s1.confirmed.version).toBe(confirmed.version + 1);
  });

  it('recovers from a really dropped frame: one sync, own op kept until the snapshot, applied once', () => {
    const confirmed = sample();
    const mine = { op: 'claim', itemId: 'b', participantId: 'me' };
    let s = { confirmed, pending: [claimMe('b', 'r2')], syncing: false };

    // Frame v+1 (someone else's claim) is lost; v+2 confirms my claim.
    s = reduceMessage(s, { type: 'patch', version: confirmed.version + 2, op: mine, reqId: 'r2' });
    expect(s.sendSync).toBe(true);
    expect(s.syncing).toBe(true);
    expect(s.confirmed).toBe(confirmed);
    expect(derive(s.confirmed, s.pending).view.claims.b).toEqual(['me']);

    // Further patches while waiting do not trigger another sync.
    s = reduceMessage(s, { type: 'patch', version: confirmed.version + 3, op: { op: 'unclaim', itemId: 'a', participantId: 'you' } });
    expect(s.sendSync).toBe(false);

    let server = applyOp(confirmed, { op: 'claim', itemId: 'a', participantId: 'you' });
    server = applyOp(server, mine);
    server = applyOp(server, { op: 'unclaim', itemId: 'a', participantId: 'you' });
    s = reduceMessage(s, { type: 'snapshot', version: server.version, bill: server });
    expect(s.syncing).toBe(false);
    expect(s.pending).toEqual([]);
    const d = derive(s.confirmed, s.pending);
    expect(d.rejected).toEqual([]);
    expect(d.view.claims).toEqual({ b: ['me'] });
  });

  it('applies a host item.add exactly once when its patch arrives before the HTTP response', () => {
    const confirmed = sample();
    const op = { op: 'item.add', item: { id: 'c', name: 'Bread', unitCents: 300, qty: 1 } };
    let s = { confirmed, pending: [{ reqId: 'h1', op, ctx: { role: 'host' }, via: 'rest' }], syncing: false };
    expect(derive(s.confirmed, s.pending).view.items).toHaveLength(3);

    s = reduceMessage(s, { type: 'patch', version: confirmed.version + 1, op, reqId: 'h1' });
    expect(s.pending).toEqual([]);
    const d = derive(s.confirmed, s.pending);
    expect(d.rejected).toEqual([]);
    expect(d.view.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('drops the rate-limited op, tells the user and resyncs once', () => {
    const confirmed = sample();
    const s = reduceMessage({ confirmed, pending: [claimMe('a', 'r8')], syncing: false }, {
      type: 'error',
      reqId: 'r8',
      code: 'rate_limited',
      message: 'Slow down',
    });
    expect(s.pending).toEqual([]);
    expect(s.sendSync).toBe(true);
    expect(describeRejection(s.error, confirmed)).toBe("Couldn't claim Pasta: Slow down");
    const again = reduceMessage({ ...s, pending: [] }, { type: 'error', code: 'rate_limited', message: 'Slow down' });
    expect(again.sendSync).toBe(false);
  });

  it('resyncs once when a rate-limit error carries no reqId', () => {
    const confirmed = sample();
    const s = reduceMessage({ confirmed, pending: [claimMe('a', 'r9')], syncing: false }, {
      type: 'error',
      code: 'rate_limited',
      message: 'Slow down',
    });
    expect(s.sendSync).toBe(true);
    expect(s.pending).toHaveLength(1);
    expect(s.error.code).toBe('rate_limited');
  });

  it('ignores stale patches', () => {
    const confirmed = sample();
    const s1 = reduceMessage({ confirmed, pending: [] }, {
      type: 'patch',
      version: confirmed.version,
      op: { op: 'claim', itemId: 'a', participantId: 'you' },
    });
    expect(s1.confirmed).toBe(confirmed);
  });

  it('rolls back a rejected op and surfaces the error', () => {
    const confirmed = sample();
    const s1 = reduceMessage({ confirmed, pending: [claimMe('a', 'r3')] }, {
      type: 'error',
      reqId: 'r3',
      code: 'bill_locked',
      message: 'Bill is locked',
    });
    expect(s1.pending).toEqual([]);
    expect(s1.error.code).toBe('bill_locked');
    expect(describeRejection(s1.error, confirmed)).toBe("Couldn't claim Pasta: Bill is locked");
    expect(derive(s1.confirmed, s1.pending).view.claims.a).toBeUndefined();
  });

  it('replaces state on snapshot and marks pending ops for resend', () => {
    const fresh = applyOp(sample(), { op: 'claim', itemId: 'b', participantId: 'you' });
    const s1 = reduceMessage({ confirmed: null, pending: [claimMe('a', 'r4')] }, {
      type: 'snapshot',
      version: fresh.version,
      bill: fresh,
    });
    expect(s1.confirmed).toBe(fresh);
    expect(s1.resend).toBe(true);
    const { view } = derive(s1.confirmed, s1.pending);
    expect(view.claims).toEqual({ a: ['me'], b: ['you'] });
  });

  it('discards pending ops that no longer apply after a rebase', () => {
    const confirmed = applyOp(sample(), { op: 'item.remove', id: 'a' });
    const { pending, rejected } = derive(confirmed, [claimMe('a', 'r5')]);
    expect(pending).toEqual([]);
    expect(rejected).toHaveLength(1);
  });

  it('toggles between claim and unclaim', () => {
    const view = applyOp(sample(), { op: 'claim', itemId: 'a', participantId: 'me' });
    expect(toggleClaimOp(view, 'a', 'me').op).toBe('unclaim');
    expect(toggleClaimOp(view, 'b', 'me').op).toBe('claim');
  });
});
