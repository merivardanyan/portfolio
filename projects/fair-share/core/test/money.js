import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currencyDigits, isCurrency, isCents, parseMoney, formatMoney, centsToDecimal, applyBasisPoints, allocate, splitEvenly, MAX_CENTS,
} from '../money.js';

test('currency helpers', () => {
  assert.equal(currencyDigits('USD'), 2);
  assert.equal(currencyDigits('JPY'), 0);
  assert.equal(currencyDigits('BHD'), 3);
  assert.equal(currencyDigits('nope'), 2);
  assert.ok(isCurrency('EUR'));
  assert.ok(!isCurrency('usd'));
  assert.ok(!isCurrency('ZZZZ'));
  assert.ok(!isCurrency(12));
  assert.ok(isCents(0) && isCents(MAX_CENTS));
  assert.ok(!isCents(-1) && !isCents(1.5) && !isCents(MAX_CENTS + 1) && !isCents('1'));
});

test('parseMoney is exact and strict', () => {
  const cases = {
    '24': 2400, '24.5': 2450, '24.50': 2450, '0.07': 7, '.5': 50, '$1,234.56': 123456, '1.234,56': 123456,
    '12,50': 1250, ' 7 ': 700, '1,234': 123400, '1,234,567.89': 123456789, '€ 3.10': 310, "1'000.00": 100000, '0.1': 10,
  };
  for (const [input, want] of Object.entries(cases)) assert.equal(parseMoney(input), want, input);
  for (const bad of ['', 'abc', '-5', '1.234.5', '12.345', '1,2,3', '1.2.3,4,5', '.', '$', null, undefined, {}, '12..5', '1e5']) {
    assert.equal(parseMoney(bad), null, String(bad));
  }
  assert.equal(parseMoney('1,200', 0), 1200);
  assert.equal(parseMoney('12.5', 0), null);
  assert.equal(parseMoney('1.234', 3), 1234);
  assert.equal(parseMoney(12.34), 1234);
  assert.equal(parseMoney(0.1 + 0.2), 30);
  assert.equal(parseMoney(-1), null);
  assert.equal(parseMoney(NaN), null);
  assert.equal(parseMoney('99999999999'), null);
});

test('format and decimal strings', () => {
  assert.equal(formatMoney(123456, 'USD', 'en-US'), '$1,234.56');
  assert.equal(formatMoney(1200, 'JPY', 'en-US'), '¥1,200');
  assert.match(formatMoney(5), /0\.05/);
  assert.equal(centsToDecimal(5), '0.05');
  assert.equal(centsToDecimal(123456), '1234.56');
  assert.equal(centsToDecimal(-250), '-2.50');
  assert.equal(centsToDecimal(1200, 0), '1200');
  assert.throws(() => centsToDecimal(1.5), TypeError);
});

test('applyBasisPoints rounds half up, exactly', () => {
  assert.equal(applyBasisPoints(10000, 1800), 1800);
  assert.equal(applyBasisPoints(1, 5000), 1); // 0.5 -> 1
  assert.equal(applyBasisPoints(1, 4999), 0);
  assert.equal(applyBasisPoints(3333, 1500), 500); // 499.95 -> 500
  assert.equal(applyBasisPoints(0, 2000), 0);
  assert.equal(applyBasisPoints(Number.MAX_SAFE_INTEGER, 10000), Number.MAX_SAFE_INTEGER);
  assert.throws(() => applyBasisPoints(-1, 10), RangeError);
  assert.throws(() => applyBasisPoints(1, 1.5), RangeError);
});

test('allocate: largest remainder always sums to total', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocate(100, [1, 1, 1], [2, 0, 1]), [33, 33, 34]);
  assert.deepEqual(allocate(10, [1, 2, 7]), [1, 2, 7]);
  assert.deepEqual(allocate(1, [3, 3]), [1, 0]);
  assert.deepEqual(allocate(0, [0, 0]), [0, 0]);
  assert.deepEqual(allocate(5, [0, 1]), [0, 5]);
  assert.deepEqual(allocate(7, [1, 1, 1], [1]), [2, 3, 2]); // partial tieOrder: listed index wins first
  // remainders: 100*[1,2,4]/7 = 14.28, 28.57, 57.14 -> 14, 29, 57
  assert.deepEqual(allocate(100, [1, 2, 4]), [14, 29, 57]);
  // big numbers stay exact through BigInt
  const big = allocate(MAX_CENTS, [Number.MAX_SAFE_INTEGER, 1, 1]);
  assert.equal(big.reduce((a, b) => a + b, 0), MAX_CENTS);
  for (const bad of [[-1, [1]], [1.5, [1]], [1, []], [1, 'x'], [1, [1, -1]], [1, [0.5]], [1, [0, 0]]]) {
    assert.throws(() => allocate(...bad), RangeError, JSON.stringify(bad));
  }
});

test('allocate property: random inputs reconcile and stay within 1 unit of exact', () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let k = 0; k < 2000; k++) {
    const total = rnd(100000);
    const weights = Array.from({ length: 1 + rnd(8) }, () => rnd(5000));
    if (weights.every((w) => w === 0)) weights[0] = 1;
    const parts = allocate(total, weights);
    assert.equal(parts.reduce((a, b) => a + b, 0), total);
    const sum = weights.reduce((a, b) => a + b, 0);
    parts.forEach((p, i) => assert.ok(Math.abs(p - (total * weights[i]) / sum) < 1));
  }
});

test('splitEvenly rotates the spare cent', () => {
  assert.deepEqual(splitEvenly(10, 3), [4, 3, 3]);
  assert.deepEqual(splitEvenly(10, 3, 1), [3, 4, 3]);
  assert.deepEqual(splitEvenly(11, 3, 2), [4, 3, 4]);
  assert.deepEqual(splitEvenly(0, 2), [0, 0]);
  assert.throws(() => splitEvenly(10, 0), RangeError);
});
