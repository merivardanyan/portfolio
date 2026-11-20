import { describe, expect, it } from 'vitest';
import { localAdapter } from '../src/api/localAdapter.js';
import { ApiError } from '../src/api/errors.js';
import { formatClock, formatDuration } from '../src/format.js';
import { init, reducer } from '../src/hooks/useRecorder.js';
import { LIMITS } from '../core/codec.js';
import { makeSample } from '../core/sample.js';

describe('localAdapter', () => {
  it('creates a hash link that resolves back to the replay', async () => {
    const { hash, bytes } = await localAdapter.createLink(makeSample());
    expect(hash.startsWith('#r=')).toBe(true);
    expect(bytes).toBe(hash.length - 3);
    const replay = await localAdapter.resolve(hash);
    expect(replay.title).toBe('An apology, unedited');
  });

  it('returns null without a replay and throws ApiError for a damaged one', async () => {
    expect(await localAdapter.resolve('#example')).toBeNull();
    const err = await localAdapter.resolve('#r=zAAAA').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'invalid_replay' });
  });
});

describe('format', () => {
  it('shows sub-second replays with tenths instead of 0:00', () => {
    expect(formatClock(400, true)).toBe('0:00.4');
    expect(formatClock(65_400)).toBe('1:05');
    expect(formatDuration(400)).toBe('0.4 s');
    expect(formatDuration(125_000)).toBe('2 min 5 s');
  });
});

describe('recorder limits', () => {
  it('rejects an edit that would exceed the text cap without locking the recorder', () => {
    let s = init(null);
    s = reducer(s, { type: 'commit', value: 'hi', caret: 2, t: 0 });
    const huge = 'hi' + 'x'.repeat(LIMITS.maxTextChars);
    const rejected = reducer(s, { type: 'commit', value: huge, caret: huge.length, t: 10 });
    expect(rejected.overLimit).toBe(true);
    expect(rejected.text).toBe('hi');
    expect(rejected.events).toHaveLength(1);
    const after = reducer(rejected, { type: 'commit', value: 'hi!', caret: 3, t: 20 });
    expect(after.overLimit).toBe(false);
    expect(after.events).toHaveLength(2);
  });
});
