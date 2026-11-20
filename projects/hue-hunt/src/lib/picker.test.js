import { describe, expect, it } from 'vitest';
import { describeColor, hsToPoint, padKey, pointToHs } from './picker.js';

describe('picker math', () => {
  it('maps pad coordinates to hue and saturation and clamps outside points', () => {
    expect(pointToHs(0, 0, 200, 100)).toEqual({ h: 0, s: 100 });
    expect(pointToHs(200, 100, 200, 100)).toEqual({ h: 359, s: 0 });
    expect(pointToHs(-50, 500, 200, 100)).toEqual({ h: 0, s: 0 });
  });

  it('round-trips through point percentages', () => {
    const p = hsToPoint({ h: 180, s: 25 });
    expect(pointToHs(p.x, p.y, 100, 100)).toEqual({ h: 180, s: 25 });
  });

  it('wraps hue on arrow keys and clamps saturation', () => {
    expect(padKey('ArrowLeft', { h: 0, s: 50 })).toEqual({ h: 358, s: 50 });
    expect(padKey('ArrowRight', { h: 359, s: 50 }, true)).toEqual({ h: 14, s: 50 });
    expect(padKey('ArrowUp', { h: 10, s: 99 })).toEqual({ h: 10, s: 100 });
    expect(padKey('PageDown', { h: 10, s: 5 })).toEqual({ h: 10, s: 0 });
    expect(padKey('Home', { h: 10, s: 5 })).toEqual({ h: 0, s: 5 });
    expect(padKey('End', { h: 10, s: 5 })).toEqual({ h: 359, s: 5 });
    expect(padKey('a', { h: 10, s: 5 })).toBeNull();
  });

  it('describes colors in words for screen readers', () => {
    expect(describeColor({ h: 220, s: 80, l: 20 })).toMatch(/^dark blue/);
    expect(describeColor({ h: 5, s: 5, l: 80 })).toMatch(/^light grey/);
    expect(describeColor({ h: 350, s: 60, l: 50 })).toMatch(/^red/);
  });
});
