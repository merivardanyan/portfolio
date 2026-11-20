import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHue, hslToRgb, rgbToHsl, rgbToHex, hexToRgb, hslToHex, hslToCss, srgbToLinear, linearToSrgb,
  rgbToXyz, xyzToLab, rgbToLab, hslToLab, rgbToOklch, oklchToRgb, deltaE2000, deltaEHsl,
} from '../color.js';

const near = (a, b, eps = 1e-4, msg) => assert.ok(Math.abs(a - b) <= eps, msg ?? `${a} !~ ${b}`);

test('normalizeHue wraps', () => {
  assert.equal(normalizeHue(360), 0);
  assert.equal(normalizeHue(-30), 330);
  assert.equal(normalizeHue(725), 5);
});

test('hsl <-> rgb <-> hex', () => {
  assert.deepEqual(hslToRgb({ h: 0, s: 100, l: 50 }), { r: 255, g: 0, b: 0 });
  assert.equal(hslToHex({ h: 120, s: 100, l: 25 }), '#008000');
  assert.equal(hslToHex({ h: 240, s: 100, l: 50 }), '#0000ff');
  assert.equal(hslToHex({ h: 0, s: 0, l: 100 }), '#ffffff');
  assert.equal(hslToHex({ h: 0, s: 150, l: -5 }), '#000000'); // clamps
  for (const hex of ['#3a7bd5', '#ff00ff', '#123456', '#00ffcc', '#808080', '#ffff00', '#00ff00']) {
    assert.equal(hslToHex(rgbToHsl(hexToRgb(hex))), hex);
  }
  assert.equal(rgbToHsl({ r: 128, g: 128, b: 128 }).s, 0);
  assert.deepEqual(hexToRgb('#fff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hexToRgb('00ff00'), { r: 0, g: 255, b: 0 });
  assert.throws(() => hexToRgb('#ggg'), TypeError);
  assert.equal(rgbToHex({ r: 300, g: -2, b: 15.6 }), '#ff0010');
  assert.equal(hslToCss({ h: 370, s: 50.04, l: 33.333 }), 'hsl(10 50% 33.3%)');
});

test('sRGB transfer functions round-trip', () => {
  for (let i = 0; i <= 20; i++) near(linearToSrgb(srgbToLinear(i / 20)), i / 20, 1e-9);
  near(srgbToLinear(0.02), 0.02 / 12.92, 1e-12);
});

test('rgb -> Lab matches reference values (D65)', () => {
  const white = rgbToLab({ r: 255, g: 255, b: 255 });
  near(white.L, 100, 1e-3); near(white.a, 0, 1e-2); near(white.b, 0, 1e-2);
  near(rgbToLab({ r: 0, g: 0, b: 0 }).L, 0, 1e-9);
  const red = rgbToLab({ r: 255, g: 0, b: 0 });
  near(red.L, 53.24, 0.02); near(red.a, 80.09, 0.05); near(red.b, 67.2, 0.05);
  near(rgbToXyz({ r: 255, g: 255, b: 255 }).y, 1, 1e-6);
  assert.deepEqual(hslToLab({ h: 0, s: 100, l: 50 }), red);
  const dark = xyzToLab({ x: 0.001, y: 0.001, z: 0.001 });
  assert.ok(dark.L > 0 && dark.L < 2);
});

test('OKLCH round-trips and gamut-maps', () => {
  const o = rgbToOklch({ r: 255, g: 0, b: 0 });
  near(o.l, 0.62796, 1e-3); near(o.c, 0.25768, 1e-3); near(o.h, 29.23, 0.05);
  const back = oklchToRgb(o);
  near(back.r, 255, 0.5); near(back.g, 0, 0.5); near(back.b, 0, 0.5);
  assert.equal(back.clipped, false);
  assert.equal(rgbToOklch({ r: 128, g: 128, b: 128 }).h, 0);
  const wild = oklchToRgb({ l: 0.7, c: 0.4, h: 150 });
  assert.equal(wild.clipped, true);
  for (const ch of [wild.r, wild.g, wild.b]) assert.ok(ch >= 0 && ch <= 255);
});

// Sharma, Wu and Dalal (2005) CIEDE2000 test data (subset).
const SHARMA = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
  [[50, 0, 0], [50, -1, 2], 2.3669],
  [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
  [[50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
  [[50, 2.5, 0], [73, 25, -18], 27.1492],
  [[50, 2.5, 0], [61, -5, 29], 22.8977],
  [[50, 2.5, 0], [56, -27, -3], 31.903],
  [[50, 2.5, 0], [58, 24, 15], 19.4535],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
  [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
];

test('deltaE2000 matches Sharma reference data', () => {
  for (const [[L1, a1, b1], [L2, a2, b2], want] of SHARMA) {
    const got = deltaE2000({ L: L1, a: a1, b: b1 }, { L: L2, a: a2, b: b2 });
    near(got, want, 1e-4, `dE(${L1},${a1},${b1} / ${L2},${a2},${b2}) = ${got}, want ${want}`);
    near(deltaE2000({ L: L2, a: a2, b: b2 }, { L: L1, a: a1, b: b1 }), want, 1e-4);
  }
  assert.equal(deltaE2000({ L: 50, a: 0, b: 0 }, { L: 50, a: 0, b: 0 }), 0);
});

test('deltaEHsl is perceptual and hue-wrapping', () => {
  assert.equal(deltaEHsl({ h: 10, s: 50, l: 50 }, { h: 10, s: 50, l: 50 }), 0);
  assert.ok(deltaEHsl({ h: 359, s: 70, l: 50 }, { h: 1, s: 70, l: 50 }) < 2);
  assert.ok(deltaEHsl({ h: 0, s: 100, l: 50 }, { h: 180, s: 100, l: 50 }) > 50);
});
