import { ApiError } from './errors.js';

export function createHttpAdapter(baseUrl) {
  const root = baseUrl.replace(/\/$/, '');

  async function request(path, init = {}) {
    let res;
    try {
      res = await fetch(`${root}${path}`, {
        ...init,
        headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
      });
    } catch {
      throw new ApiError(0, 'network', 'The leaderboard server is unreachable');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = data.error ?? {};
      throw new ApiError(res.status, err.code ?? 'http_error', err.message ?? `Request failed (${res.status})`, err.details);
    }
    return data;
  }

  return {
    name: 'http',

    getToday: () => request('/api/puzzle/today'),

    async submit({ playerId, date, guesses, nickname }) {
      try {
        return await request('/api/submissions', {
          method: 'POST',
          body: JSON.stringify({ playerId, date, guesses, nickname: nickname || undefined }),
        });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'already_submitted' && err.details) return err.details;
        throw err;
      }
    },

    getLeaderboard: (date, limit = 10) => request(`/api/leaderboard/${date}?limit=${limit}`),
    getStats: (date) => request(`/api/stats/${date}`),
  };
}
