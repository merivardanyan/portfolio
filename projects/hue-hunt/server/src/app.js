import { createServer } from 'node:http';
import { addDays, dateKey, isDateKey, puzzleNumber, dailyColors, ROUND_COUNT } from '../../core/seed.js';
import { scoreGame, validateGuesses } from '../../core/score.js';
import { createRepo } from './db.js';
import { HttpError, applyCors, clientIp, createLimiter, createRouter, readJson, sendError, sendJson } from './http.js';

class Reply { constructor(status, body) { this.status = status; this.body = body; } }
const reply = (status, body) => new Reply(status, body);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NICK_RE = /^[\p{L}\p{N} _.\-]{1,24}$/u;

/**
 * Build the request handler.
 * @param {{ db: import('node:sqlite').DatabaseSync, now?: () => number, corsOrigin?: string, trustProxy?: boolean,
 *           submitLimit?: number }} opts
 */
export function createApp({ db, now = Date.now, corsOrigin = '*', trustProxy = false, submitLimit = 20 }) {
  const repo = createRepo(db);
  const router = createRouter();
  const limitSubmit = createLimiter({ limit: submitLimit, windowMs: 60_000, now });

  const today = () => dateKey(new Date(now()), { utc: true });

  /** A player's local calendar day can be UTC-1..UTC+1; anything else is rejected. */
  function assertPlayableDate(date) {
    if (!isDateKey(date)) throw new HttpError(400, 'invalid_date', 'date must be YYYY-MM-DD');
    const t = today();
    if (date < addDays(t, -1) || date > addDays(t, 1)) {
      throw new HttpError(422, 'date_not_playable', 'Only today\'s puzzle can be submitted', { today: t });
    }
  }

  function assertDate(date) {
    if (!isDateKey(date)) throw new HttpError(400, 'invalid_date', 'date must be YYYY-MM-DD');
    if (date > addDays(today(), 1)) throw new HttpError(404, 'not_found', 'No puzzle for that date yet');
  }

  router.get('/api/health', () => ({ ok: true }));

  // No colours in the response: the client derives them from the shared seed.
  router.get('/api/puzzle/today', () => {
    const date = today();
    return { date, number: puzzleNumber(date), roundCount: ROUND_COUNT };
  });

  router.post('/api/submissions', async (req) => {
    limitSubmit(clientIp(req, trustProxy));
    const body = await readJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_body', 'Expected a JSON object');
    const { playerId, date, guesses, nickname } = body;
    const details = [];
    if (typeof playerId !== 'string' || !UUID_RE.test(playerId)) details.push({ field: 'playerId', message: 'must be a UUID' });
    if (nickname !== undefined && (typeof nickname !== 'string' || !NICK_RE.test(nickname.trim()))) {
      details.push({ field: 'nickname', message: '1-24 letters, digits, spaces, _ . -' });
    }
    const v = validateGuesses(guesses, ROUND_COUNT);
    if (!v.ok) details.push({ field: 'guesses', message: v.error });
    if (details.length) throw new HttpError(400, 'validation_failed', 'Invalid submission', details);
    assertPlayableDate(date);

    // Anti-cheat: the client never sends a score. We recompute it from the shared seed.
    const targets = dailyColors(date);
    const { score, rounds } = scoreGame(targets, v.guesses);
    const pid = playerId.toLowerCase();
    const created = repo.createSubmission({ playerId: pid, nickname: nickname?.trim(), date, guesses: v.guesses, score });
    if (!created) {
      const prev = repo.getSubmission(pid, date);
      const prevGame = scoreGame(targets, prev.guesses);
      throw new HttpError(409, 'already_submitted', 'You already played this puzzle', {
        score: prev.score, rounds: prevGame.rounds, percentile: repo.percentile(date, prev.score, pid),
      });
    }
    return reply(201, { date, number: puzzleNumber(date), score, rounds, percentile: repo.percentile(date, score, pid) });
  });

  router.get('/api/leaderboard/:date', (req, { date }, url) => {
    assertDate(date);
    const raw = url.searchParams.get('limit');
    const limit = raw == null ? 20 : Number(raw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, 'invalid_limit', 'limit must be an integer 1-100');
    return repo.leaderboard(date, limit);
  });

  router.get('/api/stats/:date', (req, { date }) => {
    assertDate(date);
    return repo.stats(date);
  });

  return async function handler(req, res) {
    try {
      applyCors(req, res, corsOrigin);
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      const url = new URL(req.url, 'http://localhost');
      const { handler: h, params } = router.match(req.method, url.pathname);
      const out = await h(req, params, url);
      const [status, body] = out instanceof Reply ? [out.status, out.body] : [200, out];
      sendJson(res, status, body);
    } catch (err) {
      sendError(res, err);
    }
  };
}

export function createHttpServer(opts) {
  return createServer(createApp(opts));
}
