-- Hue Hunt schema (SQLite, used by node:sqlite). Idempotent.
CREATE TABLE IF NOT EXISTS players (
  id          TEXT PRIMARY KEY,              -- uuid generated in the browser (localStorage)
  nickname    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id    TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  puzzle_date  TEXT NOT NULL CHECK (puzzle_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  guesses_json TEXT NOT NULL,
  score        REAL NOT NULL CHECK (score BETWEEN 0 AND 100),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (player_id, puzzle_date)
);

CREATE INDEX IF NOT EXISTS idx_submissions_date_score ON submissions (puzzle_date, score);
