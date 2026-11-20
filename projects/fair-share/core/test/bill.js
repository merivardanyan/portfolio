import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBill, applyOp, applyOps, applyPatch, rebase, nextColor, newId, validateTip, validateItem, validateParticipant,
  BillError, LIMITS, PARTICIPANT_COLORS, BILL_ID_ALPHABET, BILL_ID_RE, newBillId,
} from '../bill.js';

const base = () => createBill({ id: 'BILL1234', title: ' Dinner ', items: [{ id: 'i1', name: 'Pizza', unitCents: 1200, qty: 2 }] });
const join = (s, id) => applyOp(s, { op: 'participant.join', participant: { id, name: id.toUpperCase(), color: '#112233' } });
const code = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof BillError); return e.code; } assert.fail('expected BillError'); };

test('createBill normalises and validates', () => {
  const b = base();
  assert.equal(b.title, 'Dinner');
  assert.equal(b.version, 0);
  assert.equal(b.locked, false);
  assert.deepEqual(b.tip, { mode: 'percent', value: 0 });
  assert.equal(b.items[0].qty, 2);
  assert.equal(createBill({ id: 'x', items: [{ id: 'a', name: 'n', unitCents: 1 }] }).items[0].qty, 1);
  assert.equal(code(() => createBill({ id: 'x', currency: 'usd' })), 'invalid_currency');
  assert.equal(code(() => createBill({ id: 'bad id!' })), 'invalid_billId');
  assert.equal(code(() => createBill({ id: 'x', items: 'nope' })), 'invalid_items');
  assert.equal(code(() => createBill({ id: 'x', items: [{ id: 'a', name: 'n', unitCents: 1 }, { id: 'a', name: 'm', unitCents: 1 }] })), 'duplicate_item');
  assert.equal(code(() => createBill({ id: 'x', title: 'x'.repeat(81) })), 'invalid_title');
  assert.equal(code(() => createBill({ id: 'x', taxCents: -1 })), 'invalid_taxCents');
});

test('validators', () => {
  assert.deepEqual(validateTip({ mode: 'amount', value: 5 }), { mode: 'amount', value: 5 });
  assert.equal(code(() => validateTip(null)), 'invalid_tip');
  assert.equal(code(() => validateTip({ mode: 'percent', value: 10001 })), 'invalid_tip');
  assert.equal(code(() => validateTip({ mode: 'percent', value: 1.5 })), 'invalid_tip');
  assert.equal(code(() => validateTip({ mode: 'amount', value: -1 })), 'invalid_tip');
  assert.equal(code(() => validateTip({ mode: 'other', value: 1 })), 'invalid_tip');
  assert.equal(code(() => validateItem(null)), 'invalid_item');
  assert.equal(code(() => validateItem({ id: 'a', name: 'x', unitCents: 1, qty: 0 })), 'invalid_qty');
  assert.equal(code(() => validateItem({ id: 'a', name: '   ', unitCents: 1 })), 'invalid_name');
  assert.equal(code(() => validateItem({ id: 'a', name: 5, unitCents: 1 })), 'invalid_name');
  assert.equal(validateItem({ id: 'a', name: ' a\u0000  b ', unitCents: 1 }).name, 'a b');
  assert.equal(code(() => validateParticipant(undefined)), 'invalid_participant');
  assert.equal(code(() => validateParticipant({ id: 'p', name: 'x', color: 'red' })), 'invalid_color');
  assert.equal(validateParticipant({ id: 'p', name: 'x' }).color, PARTICIPANT_COLORS[0]);
});

test('bill.set / bill.lock', () => {
  let s = applyOp(base(), { op: 'bill.set', title: 'Lunch', currency: 'EUR', taxCents: 300, tip: { mode: 'amount', value: 500 } }, { role: 'host' });
  assert.equal(s.version, 1);
  assert.equal(s.title, 'Lunch');
  assert.equal(s.currency, 'EUR');
  assert.equal(s.taxCents, 300);
  assert.equal(applyOp(s, { op: 'bill.set' }).title, 'Lunch');
  assert.equal(code(() => applyOp(s, { op: 'bill.set', currency: 'XX' })), 'invalid_currency');
  s = applyOp(s, { op: 'bill.lock', locked: true }, { role: 'host' });
  assert.equal(s.locked, true);
  assert.equal(code(() => applyOp(s, { op: 'bill.set', title: 'x' })), 'bill_locked');
  assert.equal(code(() => applyOp(s, { op: 'bill.lock', locked: 'yes' })), 'invalid_locked');
  s = applyOp(s, { op: 'bill.lock', locked: false });
  assert.equal(s.locked, false);
});

test('items: add, update, remove (removing clears claims)', () => {
  let s = base();
  s = applyOp(s, { op: 'item.add', item: { id: 'i2', name: 'Beer', unitCents: 600, qty: 1 } });
  s = applyOp(s, { op: 'item.add', item: { id: 'i0', name: 'Bread', unitCents: 300 }, index: 0 });
  assert.deepEqual(s.items.map((i) => i.id), ['i0', 'i1', 'i2']);
  assert.equal(code(() => applyOp(s, { op: 'item.add', item: { id: 'i0', name: 'x', unitCents: 1 } })), 'duplicate_item');
  assert.equal(code(() => applyOp(s, { op: 'item.add', item: { id: 'i9', name: 'x', unitCents: 1 }, index: 9 })), 'invalid_index');
  s = applyOp(s, { op: 'item.update', id: 'i2', unitCents: 650, qty: 3 });
  assert.deepEqual(s.items[2], { id: 'i2', name: 'Beer', unitCents: 650, qty: 3 });
  s = applyOp(s, { op: 'item.update', id: 'i2', name: 'IPA' });
  assert.equal(s.items[2].name, 'IPA');
  assert.equal(code(() => applyOp(s, { op: 'item.update', id: 'nope', name: 'x' })), 'item_not_found');
  s = join(s, 'ann');
  s = applyOp(s, { op: 'claim', itemId: 'i2', participantId: 'ann' });
  s = applyOp(s, { op: 'claim', itemId: 'i1', participantId: 'ann' });
  s = applyOp(s, { op: 'item.remove', id: 'i2' });
  assert.deepEqual(Object.keys(s.claims), ['i1']);
  assert.equal(code(() => applyOp(s, { op: 'item.remove', id: 'i2' })), 'item_not_found');
});

test('item limit', () => {
  let s = createBill({ id: 'x' });
  s = { ...s, items: Array.from({ length: LIMITS.maxItems }, (_, i) => ({ id: 'i' + i, name: 'n', unitCents: 1, qty: 1 })) };
  assert.equal(code(() => applyOp(s, { op: 'item.add', item: { id: 'new', name: 'n', unitCents: 1 } })), 'too_many_items');
});

test('participants and claims', () => {
  let s = join(base(), 'ann');
  assert.equal(code(() => join(s, 'ann')), 'duplicate_participant');
  assert.equal(code(() => applyOp(s, { op: 'participant.join', participant: { id: 'ann2', name: ' ann ' } })), 'duplicate_name');
  s = join(s, 'bob');
  const v = s.version;
  s = applyOp(s, { op: 'claim', itemId: 'i1', participantId: 'ann' }, { role: 'participant', participantId: 'ann' });
  s = applyOp(s, { op: 'claim', itemId: 'i1', participantId: 'bob' });
  assert.deepEqual(s.claims.i1, ['ann', 'bob']);
  assert.equal(s.version, v + 2);
  // idempotent: same object back, no version bump
  assert.equal(applyOp(s, { op: 'claim', itemId: 'i1', participantId: 'bob' }), s);
  s = applyOp(s, { op: 'unclaim', itemId: 'i1', participantId: 'ann' });
  s = applyOp(s, { op: 'unclaim', itemId: 'i1', participantId: 'bob' });
  assert.equal(s.claims.i1, undefined);
  assert.equal(applyOp(s, { op: 'unclaim', itemId: 'i1', participantId: 'bob' }), s);
  assert.equal(code(() => applyOp(s, { op: 'claim', itemId: 'i1', participantId: 'ghost' })), 'participant_not_found');
  assert.equal(code(() => applyOp(s, { op: 'claim', itemId: 'zzz', participantId: 'ann' })), 'item_not_found');
  let full = createBill({ id: 'x' });
  full = { ...full, participants: Array.from({ length: LIMITS.maxParticipants }, (_, i) => ({ id: 'p' + i, name: 'n', color: '#000000' })) };
  assert.equal(code(() => join(full, 'one-more')), 'too_many_participants');
});

test('roles are enforced', () => {
  const s = join(base(), 'ann');
  const asAnn = { role: 'participant', participantId: 'ann' };
  assert.equal(code(() => applyOp(s, { op: 'item.remove', id: 'i1' }, asAnn)), 'forbidden');
  assert.equal(code(() => applyOp(s, { op: 'claim', itemId: 'i1', participantId: 'bob' }, asAnn)), 'forbidden');
  assert.equal(code(() => applyOp(s, { op: 'participant.join', participant: { id: 'z', name: 'z' } }, { role: 'host' })), 'forbidden');
  assert.equal(applyOp(s, { op: 'claim', itemId: 'i1', participantId: 'ann' }, { role: 'host' }).claims.i1[0], 'ann');
  assert.equal(code(() => applyOp(s, null)), 'invalid_op');
  assert.equal(code(() => applyOp(s, { op: 'explode' })), 'unknown_op');
  assert.equal(applyOp(s, { op: 'bill.set', title: 'x' }).title, 'x'); // default ctx = server
  const locked = applyOp(s, { op: 'bill.lock', locked: true });
  assert.equal(code(() => applyOp(locked, { op: 'claim', itemId: 'i1', participantId: 'ann' }, asAnn)), 'bill_locked');
});

test('applyOps is all-or-nothing', () => {
  const s = base();
  const out = applyOps(s, [{ op: 'bill.set', title: 'A' }, { op: 'bill.set', taxCents: 5 }]);
  assert.equal(out.version, 2);
  assert.throws(() => applyOps(s, [{ op: 'bill.set', title: 'A' }, { op: 'nope' }]), BillError);
  assert.equal(s.title, 'Dinner');
  assert.equal(code(() => applyOps(s, [])), 'invalid_ops');
});

test('applyPatch: applied / stale / gap', () => {
  const s = join(base(), 'ann'); // version 1
  const p = { version: 2, op: { op: 'claim', itemId: 'i1', participantId: 'ann' } };
  const r = applyPatch(s, p);
  assert.equal(r.status, 'applied');
  assert.equal(r.state.version, 2);
  assert.equal(applyPatch(r.state, p).status, 'stale');
  assert.equal(applyPatch(s, { version: 5, op: p.op }).status, 'gap');
  // patch that is a no-op locally (already claimed optimistically) still advances version
  const dup = applyPatch(r.state, { version: 3, op: p.op });
  assert.equal(dup.status, 'applied');
  assert.equal(dup.state.version, 3);
});

test('rebase replays pending optimistic ops and drops rejected ones', () => {
  const s = join(base(), 'ann');
  const pending = [
    { id: 1, op: { op: 'claim', itemId: 'i1', participantId: 'ann' } },
    { id: 2, op: { op: 'claim', itemId: 'gone', participantId: 'ann' } },
  ];
  const r = rebase(s, pending);
  assert.deepEqual(r.view.claims.i1, ['ann']);
  assert.deepEqual(r.pending.map((p) => p.id), [1]);
  assert.deepEqual(r.rejected.map((p) => p.id), [2]);
  const r2 = rebase(s, [{ op: { op: 'item.remove', id: 'i1' }, ctx: { role: 'participant', participantId: 'ann' } }]);
  assert.equal(r2.rejected.length, 1);
});

test('bill ids', () => {
  for (let i = 0; i < 300; i++) assert.match(newBillId(), BILL_ID_RE);
  assert.equal(BILL_ID_ALPHABET.length, 31);
  assert.ok(!/[01OIL]/.test(BILL_ID_ALPHABET));
});

test('nextColor and newId', () => {
  let s = createBill({ id: 'x' });
  assert.equal(nextColor(s), PARTICIPANT_COLORS[0]);
  s = applyOp(s, { op: 'participant.join', participant: { id: 'a', name: 'a', color: PARTICIPANT_COLORS[0].toLowerCase() } });
  assert.equal(nextColor(s), PARTICIPANT_COLORS[1]);
  s = { ...s, participants: PARTICIPANT_COLORS.map((c, i) => ({ id: 'p' + i, name: 'n', color: c })) };
  assert.equal(nextColor(s), PARTICIPANT_COLORS[0]);
  const ids = new Set(Array.from({ length: 500 }, () => newId()));
  assert.equal(ids.size, 500);
  for (const x of ids) assert.match(x, /^[A-Za-z0-9]{12}$/);
  assert.equal(newId(300).length, 300); // forces a refill of the random buffer
});
