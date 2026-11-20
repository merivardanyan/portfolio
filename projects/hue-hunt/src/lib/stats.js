import { addDays, histogram } from '../../core/index.js';

export const STATS_KEY = 'hue-hunt:stats:v1';

export function emptyStats() {
  return { played: 0, streak: 0, maxStreak: 0, lastDate: null, results: {} };
}

export function recordResult(stats, date, result) {
  if (stats.results[date]) return stats;
  const consecutive = stats.lastDate && addDays(stats.lastDate, 1) === date;
  const streak = consecutive ? stats.streak + 1 : 1;
  return {
    played: stats.played + 1,
    streak,
    maxStreak: Math.max(stats.maxStreak, streak),
    lastDate: !stats.lastDate || date > stats.lastDate ? date : stats.lastDate,
    results: { ...stats.results, [date]: result },
  };
}

export function currentStreak(stats, today) {
  if (!stats.lastDate) return 0;
  return stats.lastDate === today || addDays(stats.lastDate, 1) === today ? stats.streak : 0;
}

export function summarize(stats, today) {
  const scores = Object.values(stats.results).map((r) => r.score);
  return {
    played: stats.played,
    streak: currentStreak(stats, today),
    maxStreak: stats.maxStreak,
    average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0,
    histogram: histogram(scores),
  };
}

export function loadStats(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(STATS_KEY));
    if (parsed && typeof parsed.played === 'number' && parsed.results) return parsed;
  } catch {
    /* fall through */
  }
  return emptyStats();
}

export function saveStats(stats, storage = globalThis.localStorage) {
  try {
    storage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    /* storage unavailable: stats are best-effort */
  }
}

export function playerId(storage = globalThis.localStorage) {
  const key = 'hue-hunt:player';
  try {
    let id = storage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      storage.setItem(key, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
