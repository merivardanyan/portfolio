import {
  dailyPuzzle,
  dateKey,
  histogram,
  mean,
  mulberry32,
  percentile,
  scoreGame,
  seedForDate,
  validateGuesses,
} from '../../core/index.js';
import { ApiError } from './errors.js';
import { validateNickname } from '../lib/nickname.js';

const FAKE_PLAYERS = 480;
const NAMES = [
  'tealdeal', 'mauve_over', 'ochreophile', 'pixelpete', 'saffronic', 'cobaltkid', 'lilac.l', 'rustbelt',
  'vermilion', 'sagewise', 'umberella', 'chartreuse!', 'periwink', 'magenta_m', 'cerulean_c', 'hexhunter',
  'olivia_g', 'fuchsiafan', 'indigoing', 'amberlamp',
];

function crowd(date) {
  const rng = mulberry32(seedForDate(date) ^ 0x9e3779b9);
  return Array.from({ length: FAKE_PLAYERS }, () => {
    const s = 62 + (rng() + rng() + rng() - 1.5) * 30;
    return Math.round(Math.min(98.6, Math.max(2, s)) * 10) / 10;
  });
}

export const localAdapter = {
  name: 'local',

  async getToday() {
    const { date, number, roundCount } = dailyPuzzle(dateKey());
    return { date, number, roundCount };
  },

  async submit({ date, guesses, nickname }) {
    const details = [];
    const nick = validateNickname(nickname);
    if (!nick.ok) details.push({ field: 'nickname', message: nick.error });
    const { number, colors } = dailyPuzzle(date);
    const valid = validateGuesses(guesses, colors.length);
    if (!valid.ok) details.push({ field: 'guesses', message: valid.error });
    if (details.length) throw new ApiError(400, 'validation_failed', 'Submission is invalid', details);
    const { score, rounds } = scoreGame(colors, valid.guesses);
    return { date, number, score, rounds, percentile: percentile(score, crowd(date)), simulated: true };
  },

  async getLeaderboard(date, limit = 10) {
    const rng = mulberry32(seedForDate(date) ^ 0x51ed27);
    const top = [...crowd(date)].sort((a, b) => b - a).slice(0, limit);
    const used = new Set();
    return top.map((score) => {
      let name;
      do {
        name = NAMES[Math.floor(rng() * NAMES.length)];
        if (used.size >= NAMES.length) name += Math.floor(rng() * 99);
      } while (used.has(name));
      used.add(name);
      return { nickname: name, score };
    });
  },

  async getStats(date) {
    const scores = crowd(date);
    return { players: scores.length, mean: mean(scores), histogram: histogram(scores), simulated: true };
  },
};
