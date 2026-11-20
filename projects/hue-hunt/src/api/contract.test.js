import { describe, expect, it } from 'vitest';
import { dailyColors, dailyPuzzle, dateKey, histogram, scoreGame } from '../../core/index.js';
import { localAdapter } from './localAdapter.js';
import { createHttpAdapter } from './httpAdapter.js';
import { ApiError } from './errors.js';
import { validateNickname } from '../lib/nickname.js';

function json(status, body) {
  return { ok: status < 400, status, json: async () => body };
}

function fakeServer() {
  return async (url, init = {}) => {
    const { pathname } = new URL(url);
    if (pathname === '/api/puzzle/today') {
      const { date, number, roundCount } = dailyPuzzle(dateKey());
      return json(200, { date, number, roundCount });
    }
    if (pathname === '/api/submissions' && init.method === 'POST') {
      const body = JSON.parse(init.body);
      if (body.nickname !== undefined && !validateNickname(body.nickname).ok) {
        return json(400, {
          error: { code: 'validation_failed', message: 'Invalid', details: [{ field: 'nickname', message: 'bad name' }] },
        });
      }
      const { score, rounds } = scoreGame(dailyColors(body.date), body.guesses);
      return json(201, { date: body.date, number: 1, score, rounds, percentile: 50 });
    }
    if (pathname.startsWith('/api/leaderboard/')) return json(200, [{ nickname: 'Ana', score: 91.2 }]);
    if (pathname.startsWith('/api/stats/')) return json(200, { players: 3, mean: 70, histogram: histogram([60, 70, 80]) });
    return json(404, { error: { code: 'not_found', message: 'Not found' } });
  };
}

const httpAdapter = createHttpAdapter('http://api.test');
const adapters = [
  ['localAdapter', localAdapter, () => {}],
  ['httpAdapter', httpAdapter, () => (globalThis.fetch = fakeServer())],
];

const date = dateKey();
const guesses = dailyColors(date).map(({ h, s, l }) => ({ h: (h + 20) % 360, s, l }));

describe.each(adapters)('%s contract', (_name, api, setup) => {
  it('getToday returns the puzzle header without colors', async () => {
    setup();
    const t = await api.getToday();
    expect(t).toEqual({ date: expect.any(String), number: expect.any(Number), roundCount: 5 });
    expect(t).not.toHaveProperty('colors');
  });

  it('submit scores the guesses and returns rounds and a percentile', async () => {
    setup();
    const res = await api.submit({ playerId: crypto.randomUUID(), date, guesses, nickname: 'Zoë 🎨' });
    expect(res.rounds).toHaveLength(5);
    expect(res.score).toBeGreaterThan(0);
    expect(res.percentile).toEqual(expect.any(Number));
  });

  it('rejects an invalid nickname with ApiError(400, validation_failed)', async () => {
    setup();
    const err = await api
      .submit({ playerId: crypto.randomUUID(), date, guesses, nickname: '<script>' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'validation_failed', isValidation: true });
    expect(err.details[0].field).toBe('nickname');
  });

  it('serves a leaderboard and day stats', async () => {
    setup();
    const board = await api.getLeaderboard(date, 5);
    expect(board[0]).toEqual({ nickname: expect.any(String), score: expect.any(Number) });
    const stats = await api.getStats(date);
    expect(stats.histogram).toHaveLength(10);
    expect(stats.players).toBeGreaterThan(0);
  });
});

describe('httpAdapter errors', () => {
  it('maps a network failure to ApiError(0, network)', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    const err = await httpAdapter.getToday().catch((e) => e);
    expect(err).toMatchObject({ status: 0, code: 'network', isNetwork: true });
  });

  it('returns the original result when the day was already submitted', async () => {
    const original = { score: 80, rounds: [], percentile: 40 };
    globalThis.fetch = async () =>
      json(409, { error: { code: 'already_submitted', message: 'dup', details: original } });
    expect(await httpAdapter.submit({ playerId: 'x', date, guesses })).toEqual(original);
  });
});
