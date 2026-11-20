-- Hot Take Court schema, SQLite variant (local dev + tests).
-- Mirrors db/schema.mysql.sql: ENUMs become TEXT + CHECK, AUTO_INCREMENT becomes INTEGER PRIMARY KEY.
-- Datetimes are stored as UTC 'YYYY-MM-DD HH:MM:SS' strings in both engines.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      VARCHAR(32)  NOT NULL UNIQUE COLLATE NOCASE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME     NOT NULL
);

CREATE TABLE cases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          VARCHAR(140) NOT NULL CHECK (length(body) BETWEEN 1 AND 140),
  category      TEXT         NOT NULL CHECK (category IN ('Food', 'Tech', 'Life', 'Pop Culture', 'Work')),
  created_at    DATETIME     NOT NULL,
  closes_at     DATETIME     NOT NULL,
  guilty_count  INTEGER      NOT NULL DEFAULT 0 CHECK (guilty_count >= 0),
  acquit_count  INTEGER      NOT NULL DEFAULT 0 CHECK (acquit_count >= 0)
);
CREATE INDEX idx_cases_closes_at ON cases (closes_at);
CREATE INDEX idx_cases_category_created ON cases (category, created_at);
CREATE INDEX idx_cases_created ON cases (created_at);
CREATE INDEX idx_cases_user ON cases (user_id);

-- One vote per user per case, enforced by the primary key.
CREATE TABLE votes (
  case_id     INTEGER  NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id     INTEGER  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verdict     TEXT     NOT NULL CHECK (verdict IN ('guilty', 'acquit')),
  created_at  DATETIME NOT NULL,
  PRIMARY KEY (case_id, user_id)
);
CREATE INDEX idx_votes_created ON votes (created_at, case_id);
CREATE INDEX idx_votes_user ON votes (user_id);

-- One argument per user per case.
CREATE TABLE arguments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id     INTEGER      NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  side        TEXT         NOT NULL CHECK (side IN ('guilty', 'acquit')),
  body        VARCHAR(120) NOT NULL CHECK (length(body) BETWEEN 1 AND 120),
  upvotes     INTEGER      NOT NULL DEFAULT 0 CHECK (upvotes >= 0),
  created_at  DATETIME     NOT NULL,
  UNIQUE (case_id, user_id)
);
CREATE INDEX idx_arguments_case_side ON arguments (case_id, side, upvotes);

CREATE TABLE argument_upvotes (
  argument_id INTEGER NOT NULL REFERENCES arguments(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (argument_id, user_id)
);

-- Fixed-window rate limiting (login, register, filing, voting).
CREATE TABLE rate_limits (
  bucket       VARCHAR(32)  NOT NULL,
  subject      VARCHAR(128) NOT NULL,
  window_start INTEGER      NOT NULL,
  hits         INTEGER      NOT NULL,
  PRIMARY KEY (bucket, subject)
);
