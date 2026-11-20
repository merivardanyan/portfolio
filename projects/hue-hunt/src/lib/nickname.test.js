import { describe, expect, it } from 'vitest';
import { validateNickname } from './nickname.js';

describe('validateNickname', () => {
  it.each([
    'Ana',
    'Zoë',
    'José María',
    "O'Brien",
    'chartreuse!',
    '色彩ハンター',
    'Привет',
    'tealdeal 🎨',
    '👩🏽‍🎨',
    'a.b_c-d',
  ])('accepts %s', (name) => {
    expect(validateNickname(name)).toMatchObject({ ok: true });
  });

  it.each(['<script>', 'a\u0000b', 'name@domain', 'x'.repeat(25), '🎨'.repeat(25)])('rejects %j', (name) => {
    expect(validateNickname(name).ok).toBe(false);
  });

  it('treats empty as "no name", trims and collapses spaces', () => {
    expect(validateNickname('   ')).toEqual({ ok: true, value: '' });
    expect(validateNickname('  Ana   Lee ')).toEqual({ ok: true, value: 'Ana Lee' });
  });

  it('counts emoji by grapheme, not by code unit', () => {
    expect(validateNickname('👩🏽‍🎨'.repeat(24)).ok).toBe(true);
  });
});
