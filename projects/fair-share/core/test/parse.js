import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt } from '../parse.js';

test('parses quantities, names and line totals', () => {
  const r = parseReceipt(`2 Margherita 24.00
Tiramisu 7.5
3x Beer 13.00
1 x Espresso   $2.80
2× Fries 9,00

Subtotal 56.30
Tax 4.50
Tip: 10.00
VISA ****1234 70.80
just some words`);
  assert.deepEqual(r.items, [
    { name: 'Margherita', unitCents: 1200, qty: 2 },
    { name: 'Tiramisu', unitCents: 750, qty: 1 },
    { name: '3x Beer', unitCents: 1300, qty: 1 },
    { name: 'Espresso', unitCents: 280, qty: 1 },
    { name: 'Fries', unitCents: 450, qty: 2 },
  ]);
  assert.equal(r.taxCents, 450);
  assert.equal(r.tipCents, 1000);
  assert.deepEqual(r.skipped, ['Subtotal 56.30', 'VISA ****1234 70.80', 'just some words']);
});

test('edge cases', () => {
  assert.deepEqual(parseReceipt(''), { items: [], taxCents: null, tipCents: null, skipped: [] });
  assert.deepEqual(parseReceipt(null).items, []);
  assert.deepEqual(parseReceipt('2 12.00').skipped, ['2 12.00']); // price but no name
  assert.deepEqual(parseReceipt('Ramen 1200', { digits: 0 }).items, [{ name: 'Ramen', unitCents: 1200, qty: 1 }]);
  assert.deepEqual(parseReceipt('VAT 1.00\nGST 2.00').taxCents, 300);
  assert.deepEqual(parseReceipt('Service charge 5.00\ngratuity 1.00').tipCents, 600);
  assert.equal(parseReceipt('x'.repeat(100) + ' 1.00').items[0].name.length, 60);
  assert.deepEqual(parseReceipt('Room 101 Burger 9.99').items, [{ name: 'Room 101 Burger', unitCents: 999, qty: 1 }]);
  assert.deepEqual(parseReceipt('0 Ghost 1.00').items, []);
  assert.deepEqual(parseReceipt('0 Free thing 0'), { items: [], taxCents: null, tipCents: null, skipped: ['0 Free thing 0'] });
  assert.deepEqual(parseReceipt('00 x Nope 1.00').skipped, ['00 x Nope 1.00']);
});
