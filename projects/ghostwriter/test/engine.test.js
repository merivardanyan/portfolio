import { describe, expect, it } from 'vitest';
import {
  activityBuckets,
  applyEvent,
  buildSnapshots,
  compressPauses,
  stateAt,
  textAtCount,
} from '../core/engine.js';
import { diffEdit } from '../core/diff.js';
import { computeStats } from '../core/stats.js';
import { makeSample } from '../core/sample.js';

function record(steps) {
  const events = [];
  let prev = '';
  let t = 0;
  for (const [next, caret] of steps) {
    t += 100;
    const d = diffEdit(prev, next, caret);
    if (d.removed) events.push({ t, type: 'delete', pos: d.pos, len: d.removed });
    if (d.inserted) events.push({ t, type: 'insert', pos: d.pos, text: d.inserted });
    prev = next;
  }
  return events;
}

describe('diffEdit', () => {
  it('uses the caret to place inserts inside repeated runs', () => {
    expect(diffEdit('aa', 'aaa', 2)).toEqual({ pos: 1, removed: 0, inserted: 'a' });
    expect(diffEdit('aa', 'aaa', 3)).toEqual({ pos: 2, removed: 0, inserted: 'a' });
  });

  it('uses the caret to place backspaces inside repeated runs', () => {
    expect(diffEdit('aaa', 'aa', 1)).toEqual({ pos: 1, removed: 1, inserted: '' });
  });

  it('handles replace-selection and paste', () => {
    expect(diffEdit('hello world', 'hello there', 11)).toEqual({ pos: 6, removed: 5, inserted: 'there' });
    expect(diffEdit('ab', 'aXYZb', 4)).toEqual({ pos: 1, removed: 0, inserted: 'XYZ' });
  });

  it('never splits a surrogate pair', () => {
    const d = diffEdit('😀', '😃', 2);
    expect(d.pos).toBe(0);
    expect(d.removed).toBe(2);
    expect(d.inserted).toBe('😃');
  });

  it('records a sequence that replays to the same text', () => {
    const steps = [['h', 1], ['he', 2], ['hel', 3], ['he', 2], ['hey', 3], ['hey!', 4], ['oh hey!', 3]];
    const events = record(steps);
    expect(textAtCount(events, events.length)).toBe('oh hey!');
  });
});

describe('engine', () => {
  const sample = makeSample();
  const events = sample.events;

  it('applies inserts and deletes', () => {
    expect(applyEvent('abc', { type: 'insert', pos: 1, text: 'X' })).toBe('aXbc');
    expect(applyEvent('abc', { type: 'delete', pos: 1, len: 2 })).toBe('a');
  });

  it('snapshot seek equals replay-from-zero at every event boundary', () => {
    const snaps = buildSnapshots(events, 25);
    for (let i = 0; i < events.length; i += 7) {
      const t = events[i].t;
      const fast = stateAt(events, t, snaps, 25);
      const slow = stateAt(events, t);
      expect(fast).toEqual(slow);
    }
  });

  it('returns empty state before the first event and full text after the last', () => {
    expect(stateAt(events, -1)).toEqual({ text: '', caret: 0, count: 0 });
    const end = stateAt(events, Infinity, buildSnapshots(events));
    expect(end.count).toBe(events.length);
  });

  it('compresses long pauses but keeps order and short gaps', () => {
    const ev = [
      { t: 100, type: 'insert', pos: 0, text: 'a' },
      { t: 5100, type: 'insert', pos: 1, text: 'b' },
      { t: 5200, type: 'insert', pos: 2, text: 'c' },
    ];
    const out = compressPauses(ev, 1200, 600);
    expect(out.map((e) => e.t)).toEqual([100, 700, 800]);
  });

  it('buckets activity across the timeline', () => {
    const b = activityBuckets(events, 10);
    expect(b).toHaveLength(10);
    expect(b.reduce((a, x) => a + x, 0)).toBeGreaterThan(0);
  });
});

describe('stats', () => {
  it('reports deletions, pauses and the most rewritten word', () => {
    const s = computeStats(makeSample().events);
    expect(s.deletions).toBeGreaterThan(10);
    expect(s.longestPauseMs).toBeGreaterThanOrEqual(2600);
    expect(s.wpm).toBeGreaterThan(0);
    expect(s.mostRewritten?.word).toBeTruthy();
  });

  it('handles an empty recording', () => {
    const s = computeStats([]);
    expect(s).toMatchObject({ words: 0, wpm: 0, deletions: 0, mostRewritten: null });
  });
});
