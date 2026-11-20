import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(resolve(here, '../schema.sql'), 'utf8');

/** Open (and migrate) the database. Use ':memory:' for tests. */
export function openDb(file = ':memory:') {
  if (file !== ':memory:') mkdirSync(dirname(resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

/** Repository: every query is a prepared statement with bound parameters. */
export function createRepo(db) {
  const q = {
    upsertPlayer: db.prepare(`INSERT INTO players (id, nickname) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET nickname = excluded.nickname`),
    insertPlayerIfMissing: db.prepare('INSERT OR IGNORE INTO players (id, nickname) VALUES (?, ?)'),
    getSubmission: db.prepare('SELECT guesses_json, score FROM submissions WHERE player_id = ? AND puzzle_date = ?'),
    insertSubmission: db.prepare('INSERT INTO submissions (player_id, puzzle_date, guesses_json, score) VALUES (?, ?, ?, ?)'),
    countBelow: db.prepare(`SELECT COUNT(*) AS below FROM submissions WHERE puzzle_date = ? AND score < ? AND player_id <> ?`),
    countOthers: db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE puzzle_date = ? AND player_id <> ?'),
    leaderboard: db.prepare(`SELECT p.nickname, s.score FROM submissions s JOIN players p ON p.id = s.player_id
      WHERE s.puzzle_date = ? ORDER BY s.score DESC, s.created_at ASC, s.id ASC LIMIT ?`),
    stats: db.prepare('SELECT COUNT(*) AS players, AVG(score) AS mean FROM submissions WHERE puzzle_date = ?'),
    buckets: db.prepare(`SELECT MIN(9, CAST(score / 10 AS INTEGER)) AS bucket, COUNT(*) AS n
      FROM submissions WHERE puzzle_date = ? GROUP BY bucket`),
    countAll: db.prepare('SELECT COUNT(*) AS n FROM submissions'),
  };

  return {
    countSubmissions: () => Number(q.countAll.get().n),

    /** Insert player (nickname optional) + submission atomically. Returns false on duplicate. */
    createSubmission({ playerId, nickname, date, guesses, score }) {
      db.exec('BEGIN IMMEDIATE');
      try {
        if (nickname) q.upsertPlayer.run(playerId, nickname);
        else q.insertPlayerIfMissing.run(playerId, `Player-${playerId.slice(0, 4)}`);
        if (q.getSubmission.get(playerId, date)) { db.exec('ROLLBACK'); return false; }
        q.insertSubmission.run(playerId, date, JSON.stringify(guesses), score);
        db.exec('COMMIT');
        return true;
      } catch (e) {
        db.exec('ROLLBACK');
        if (/UNIQUE constraint failed/.test(e.message)) return false;
        throw e;
      }
    },

    getSubmission(playerId, date) {
      const row = q.getSubmission.get(playerId, date);
      return row ? { guesses: JSON.parse(row.guesses_json), score: row.score } : null;
    },

    /** Integer % of *other* players on this date with a strictly lower score. */
    percentile(date, score, playerId) {
      const n = Number(q.countOthers.get(date, playerId).n);
      if (n === 0) return 100;
      const below = Number(q.countBelow.get(date, score, playerId).below);
      return Math.round((below / n) * 100);
    },

    leaderboard(date, limit) {
      return q.leaderboard.all(date, limit).map((r) => ({ nickname: r.nickname, score: r.score }));
    },

    stats(date) {
      const { players, mean } = q.stats.get(date);
      const histogram = new Array(10).fill(0);
      for (const r of q.buckets.all(date)) histogram[Number(r.bucket)] = Number(r.n);
      return { players: Number(players), mean: mean == null ? 0 : Math.round(mean * 10) / 10, histogram };
    },
  };
}
