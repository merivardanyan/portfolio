import { describe, expect, it } from 'vitest';
import { currentStreak, emptyStats, loadStats, recordResult, summarize } from './stats.js';

const r = (score) => ({ score, rounds: [] });

function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
}

describe('stats', () => {
  it('builds a streak over consecutive days, including across month ends', () => {
    let s = emptyStats();
    s = recordResult(s, '2026-01-30', r(80));
    s = recordResult(s, '2026-01-31', r(70));
    s = recordResult(s, '2026-02-01', r(90));
    expect(s.streak).toBe(3);
    expect(s.maxStreak).toBe(3);
    expect(s.played).toBe(3);
  });

  it('resets the streak after a missed day but keeps the best streak', () => {
    let s = emptyStats();
    s = recordResult(s, '2026-03-01', r(50));
    s = recordResult(s, '2026-03-02', r(50));
    s = recordResult(s, '2026-03-04', r(50));
    expect(s.streak).toBe(1);
    expect(s.maxStreak).toBe(2);
  });

  it('ignores a second result for the same day', () => {
    let s = recordResult(emptyStats(), '2026-03-01', r(50));
    const again = recordResult(s, '2026-03-01', r(99));
    expect(again).toBe(s);
  });

  it('reports a live streak only if the last game was today or yesterday', () => {
    const s = recordResult(emptyStats(), '2026-03-01', r(50));
    expect(currentStreak(s, '2026-03-01')).toBe(1);
    expect(currentStreak(s, '2026-03-02')).toBe(1);
    expect(currentStreak(s, '2026-03-03')).toBe(0);
  });

  it('summarizes average and histogram', () => {
    let s = emptyStats();
    s = recordResult(s, '2026-03-01', r(95));
    s = recordResult(s, '2026-03-02', r(45));
    const sum = summarize(s, '2026-03-02');
    expect(sum.average).toBe(70);
    expect(sum.histogram.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('recovers from corrupt storage', () => {
    expect(loadStats(memoryStorage({ 'hue-hunt:stats:v1': '{oops' }))).toEqual(emptyStats());
    expect(loadStats(memoryStorage())).toEqual(emptyStats());
  });
});
