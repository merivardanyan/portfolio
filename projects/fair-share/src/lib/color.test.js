import { describe, expect, it } from 'vitest';
import { PARTICIPANT_COLORS } from '../../core/index.js';
import { inkFor, initials } from './color.js';

function contrast(a, b) {
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('avatar colors', () => {
  it('picks the higher-contrast ink, at least 3:1 (large-text AA) on every participant color', () => {
    for (const c of PARTICIPANT_COLORS) {
      const ink = inkFor(c);
      const other = ink === '#ffffff' ? '#141414' : '#ffffff';
      expect(contrast(c, ink)).toBeGreaterThanOrEqual(contrast(c, other));
      expect(contrast(c, ink)).toBeGreaterThanOrEqual(3);
    }
  });

  it('builds initials from one or more names, including emoji', () => {
    expect(initials('ana')).toBe('A');
    expect(initials('Ben van Dijk')).toBe('BD');
    expect(initials('  ')).toBe('?');
    expect(initials('🍕 lover')).toBe('🍕L');
  });
});
