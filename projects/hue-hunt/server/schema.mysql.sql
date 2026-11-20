-- Hue Hunt schema, MySQL 8 equivalent of schema.sql (reference for a production port;
-- the Node server itself uses node:sqlite as the plan specifies).
CREATE TABLE IF NOT EXISTS players (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  nickname    VARCHAR(24)  NOT NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS submissions (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  player_id    CHAR(36)     NOT NULL,
  puzzle_date  DATE         NOT NULL,
  guesses_json JSON         NOT NULL,
  score        DECIMAL(4,1) NOT NULL CHECK (score BETWEEN 0 AND 100),
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_player_date (player_id, puzzle_date),
  KEY idx_submissions_date_score (puzzle_date, score),
  CONSTRAINT fk_sub_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
