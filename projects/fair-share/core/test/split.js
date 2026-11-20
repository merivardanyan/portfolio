import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSplit, lineCents, billSubtotal, tipCents } from '../split.js';

const P = (id, name = id) => ({ id, name, color: '#000000' });
const I = (id, unitCents, qty = 1) => ({ id, name: id, unitCents, qty });
const bill = (over = {}) => ({
  currency: 'USD', taxCents: 0, tip: { mode: 'percent', value: 0 },
  items: [], participants: [], claims: {}, ...over,
});
const sumTotals = (r) => r.people.reduce((s, p) => s + p.totalCents, 0) + r.unclaimed.totalCents;

test('helpers', () => {
  assert.equal(lineCents(I('a', 250, 3)), 750);
  assert.equal(billSubtotal(bill({ items: [I('a', 100, 2), I('b', 5)] })), 205);
  assert.equal(tipCents(bill({ items: [I('a', 1000)], tip: { mode: 'percent', value: 1500 } })), 150);
  assert.equal(tipCents(bill({ tip: { mode: 'amount', value: 321 } })), 321);
  assert.equal(tipCents({ items: [] }), 0);
});

test('empty bill', () => {
  const r = computeSplit(bill());
  assert.equal(r.totalCents, 0);
  assert.equal(r.allClaimed, false);
  assert.deepEqual(r.people, []);
});

test('single person claims everything, zero tip', () => {
  const b = bill({ items: [I('pizza', 1200, 2)], participants: [P('ann')], taxCents: 200, claims: { pizza: ['ann'] } });
  const r = computeSplit(b);
  assert.equal(r.people[0].subtotalCents, 2400);
  assert.equal(r.people[0].taxCents, 200);
  assert.equal(r.people[0].tipCents, 0);
  assert.equal(r.people[0].totalCents, 2600);
  assert.equal(r.allClaimed, true);
  assert.equal(r.unclaimed.totalCents, 0);
  assert.deepEqual(r.people[0].items, [{ itemId: 'pizza', name: 'pizza', shareCents: 2400, splitWays: 1 }]);
});

test('shared item: 1-cent remainder goes to exactly one claimer', () => {
  const b = bill({ items: [I('wine', 1000)], participants: [P('a'), P('b'), P('c')], claims: { wine: ['c', 'a', 'b'] } });
  const r = computeSplit(b);
  const shares = r.people.map((p) => p.subtotalCents).sort();
  assert.deepEqual(shares, [333, 333, 334]);
  assert.equal(sumTotals(r), 1000);
  r.people.forEach((p) => assert.equal(p.items[0].splitWays, 3));
});

test('spare cents rotate across items instead of always hitting the first person', () => {
  const items = Array.from({ length: 30 }, (_, k) => I(`item${k}`, 100));
  const claims = Object.fromEntries(items.map((it) => [it.id, ['a', 'b', 'c']]));
  const r = computeSplit(bill({ items, participants: [P('a'), P('b'), P('c')], claims }));
  const subs = r.people.map((p) => p.subtotalCents);
  assert.equal(subs.reduce((a, b) => a + b, 0), 3000);
  // without rotation 'a' would get 30 extra cents
  assert.ok(Math.max(...subs) - Math.min(...subs) < 30, String(subs));
});

test('unclaimed items keep their own tax/tip bucket so the bill still reconciles', () => {
  const b = bill({
    items: [I('a', 1000), I('b', 3000)], participants: [P('x')], taxCents: 400, tip: { mode: 'percent', value: 2000 },
    claims: { a: ['x'] },
  });
  const r = computeSplit(b);
  assert.equal(r.tipCents, 800);
  assert.equal(r.totalCents, 5200);
  assert.equal(r.people[0].taxCents, 100);
  assert.equal(r.people[0].tipCents, 200);
  assert.equal(r.people[0].totalCents, 1300);
  assert.deepEqual(r.unclaimed.itemIds, ['b']);
  assert.equal(r.unclaimed.totalCents, 3900);
  assert.equal(r.allClaimed, false);
  assert.equal(sumTotals(r), r.totalCents);
});

test('tax is proportional with largest remainder', () => {
  // subtotals 1/3 each, tax 100 -> 34/33/33
  const b = bill({
    items: [I('a', 500), I('b', 500), I('c', 500)], participants: [P('x'), P('y'), P('z')], taxCents: 100,
    claims: { a: ['x'], b: ['y'], c: ['z'] },
  });
  const r = computeSplit(b);
  assert.deepEqual(r.people.map((p) => p.taxCents).sort(), [33, 33, 34]);
  assert.equal(sumTotals(r), 1600);
});

test('claims by unknown participants or for unknown items are ignored; duplicates collapse', () => {
  const b = bill({ items: [I('a', 100)], participants: [P('x')], claims: { a: ['ghost', 'x', 'x'], zzz: ['x'] } });
  const r = computeSplit(b);
  assert.equal(r.people[0].subtotalCents, 100);
  assert.equal(r.people[0].items[0].splitWays, 1);
  const r2 = computeSplit(bill({ items: [I('a', 100)], participants: [P('x')] }), { a: ['ghost'] });
  assert.deepEqual(r2.unclaimed.itemIds, ['a']);
});

test('participants with no claims owe zero; claims arg overrides bill.claims', () => {
  const b = bill({ items: [I('a', 100)], participants: [P('x'), P('y')], taxCents: 10, claims: { a: ['x'] } });
  const r = computeSplit(b, { a: ['y'] });
  assert.equal(r.people[0].totalCents, 0);
  assert.equal(r.people[1].totalCents, 110);
  const r2 = computeSplit({ ...b, claims: undefined });
  assert.equal(r2.unclaimed.totalCents, 110);
});

test('free items only: tax/tip amount parks in unclaimed', () => {
  const b = bill({ items: [I('water', 0)], participants: [P('x')], taxCents: 50, tip: { mode: 'amount', value: 25 }, claims: { water: ['x'] } });
  const r = computeSplit(b);
  assert.equal(r.people[0].totalCents, 0);
  assert.equal(r.unclaimed.totalCents, 75);
  assert.equal(sumTotals(r), 75);
  assert.equal(r.allClaimed, true);
});

test('property: random bills always reconcile to the cent', () => {
  let seed = 99;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let k = 0; k < 500; k++) {
    const participants = Array.from({ length: 1 + rnd(8) }, (_, i) => P('p' + i));
    const items = Array.from({ length: rnd(12) }, (_, i) => I('i' + i, rnd(5000), 1 + rnd(4)));
    const claims = {};
    for (const it of items) {
      const who = participants.filter(() => rnd(3) === 0).map((p) => p.id);
      if (who.length) claims[it.id] = who;
    }
    const b = bill({
      items, participants, claims, taxCents: rnd(2000),
      tip: rnd(2) ? { mode: 'percent', value: rnd(3000) } : { mode: 'amount', value: rnd(2000) },
    });
    const r = computeSplit(b);
    assert.equal(sumTotals(r), r.totalCents);
    assert.equal(r.people.reduce((s, p) => s + p.subtotalCents, 0) + r.unclaimed.subtotalCents, r.subtotalCents);
    assert.equal(r.people.reduce((s, p) => s + p.taxCents, 0) + r.unclaimed.taxCents, r.taxCents);
    assert.equal(r.people.reduce((s, p) => s + p.tipCents, 0) + r.unclaimed.tipCents, r.tipCents);
    for (const p of r.people) assert.ok(Number.isSafeInteger(p.totalCents) && p.totalCents >= 0);
  }
});
