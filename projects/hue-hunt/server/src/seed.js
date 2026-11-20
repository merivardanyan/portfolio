import { addDays, dailyColors, dateKey, mulberry32, hashString } from '../../core/seed.js';
import { scoreGame } from '../../core/score.js';
import { createRepo } from './db.js';

const NAMES = ['Ochre', 'Teal Deal', 'Magenta Max', 'Huebert', 'Chroma Kid', 'Pantone Pat', 'Sienna', 'Cobalt', 'Vermilion',
  'Lilac Lou', 'Saffron', 'Indigo Jo', 'Mauve Dave', 'Cerulean', 'Umber', 'Taupe Tom', 'Coral Cat', 'Moss', 'Plum', 'Azure'];

/** Deterministic fake UUID v4 from an integer. */
function fakeUuid(rng) {
  const hex = Array.from({ length: 32 }, () => Math.floor(rng() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/**
 * Seed demo players and submissions for the last `days` days (including today, UTC).
 * Guesses are the real targets plus seeded noise, so scores follow a believable curve.
 * Idempotent: does nothing if submissions already exist.
 */
export function seedDemoData(db, { days = 7, playersPerDay = 60, now = Date.now } = {}) {
  const repo = createRepo(db);
  if (repo.countSubmissions() > 0) return 0;
  const rng = mulberry32(hashString('hue-hunt-seed'));
  const players = Array.from({ length: playersPerDay * 2 }, (_, i) => ({
    id: fakeUuid(rng), nickname: `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ' ' + (i + 1) : ''}`, skill: 5 + rng() * 40,
  }));
  const today = dateKey(new Date(now()), { utc: true });
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  let inserted = 0;
  for (let d = days - 1; d >= 0; d--) {
    const date = addDays(today, -d);
    const targets = dailyColors(date);
    // a different, overlapping crowd each day
    const crowd = players.filter(() => rng() < 0.5).slice(0, playersPerDay);
    for (const p of crowd) {
      const noise = () => (rng() + rng() + rng() - 1.5) * p.skill;
      const guesses = targets.map((t) => ({
        h: Math.round((((t.h + noise() * 1.2) % 360) + 360) % 360 * 100) / 100,
        s: Math.round(clamp(t.s + noise(), 0, 100) * 100) / 100,
        l: Math.round(clamp(t.l + noise() * 0.6, 0, 100) * 100) / 100,
      }));
      const { score } = scoreGame(targets, guesses);
      if (repo.createSubmission({ playerId: p.id, nickname: p.nickname, date, guesses, score })) inserted++;
    }
  }
  return inserted;
}
