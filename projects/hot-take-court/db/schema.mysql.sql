-- Hot Take Court schema, MySQL 8 (production).
-- mysql -u root -p -e "CREATE DATABASE hot_take_court CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
-- mysql -u root -p hot_take_court < db/schema.mysql.sql
-- then: DB_DSN="mysql:host=127.0.0.1;dbname=hot_take_court;charset=utf8mb4" php db/seed.php

SET NAMES utf8mb4;

CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(32)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME     NOT NULL,
  UNIQUE KEY uq_users_username (username)          -- _ai_ci collation: case-insensitive like SQLite NOCASE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE cases (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  body          VARCHAR(140) NOT NULL,
  category      ENUM('Food', 'Tech', 'Life', 'Pop Culture', 'Work') NOT NULL,
  created_at    DATETIME     NOT NULL,
  closes_at     DATETIME     NOT NULL,
  guilty_count  INT UNSIGNED NOT NULL DEFAULT 0,
  acquit_count  INT UNSIGNED NOT NULL DEFAULT 0,
  KEY idx_cases_closes_at (closes_at),
  KEY idx_cases_category_created (category, created_at),
  KEY idx_cases_created (created_at),
  KEY idx_cases_user (user_id),
  CONSTRAINT fk_cases_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_cases_body CHECK (CHAR_LENGTH(body) BETWEEN 1 AND 140)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE votes (
  case_id     INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  verdict     ENUM('guilty', 'acquit') NOT NULL,
  created_at  DATETIME NOT NULL,
  PRIMARY KEY (case_id, user_id),                  -- one vote per user per case
  KEY idx_votes_created (created_at, case_id),
  KEY idx_votes_user (user_id),
  CONSTRAINT fk_votes_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_votes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE arguments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id     INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  side        ENUM('guilty', 'acquit') NOT NULL,
  body        VARCHAR(120) NOT NULL,
  upvotes     INT UNSIGNED NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL,
  UNIQUE KEY uq_arguments_case_user (case_id, user_id),
  KEY idx_arguments_case_side (case_id, side, upvotes),
  CONSTRAINT fk_args_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_args_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE argument_upvotes (
  argument_id INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  PRIMARY KEY (argument_id, user_id),
  CONSTRAINT fk_upv_arg FOREIGN KEY (argument_id) REFERENCES arguments(id) ON DELETE CASCADE,
  CONSTRAINT fk_upv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE rate_limits (
  bucket       VARCHAR(32)  NOT NULL,
  subject      VARCHAR(128) NOT NULL,
  window_start INT UNSIGNED NOT NULL,
  hits         INT UNSIGNED NOT NULL,
  PRIMARY KEY (bucket, subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
