-- Fair Share schema, MySQL 8 equivalent of schema.sql (reference for a production port;
-- the Node server uses node:sqlite as the plan specifies).
CREATE TABLE IF NOT EXISTS bills (
  id               CHAR(8)      NOT NULL PRIMARY KEY,
  host_token_hash  CHAR(64)     NOT NULL,
  title            VARCHAR(80)  NOT NULL DEFAULT '',
  currency         CHAR(3)      NOT NULL,
  tax_cents        INT UNSIGNED NOT NULL DEFAULT 0,
  tip_mode         ENUM('percent','amount') NOT NULL,
  tip_value        INT UNSIGNED NOT NULL DEFAULT 0,
  locked           TINYINT(1)   NOT NULL DEFAULT 0,
  version          INT UNSIGNED NOT NULL DEFAULT 0,
  created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS items (
  id          VARCHAR(40)  NOT NULL,
  bill_id     CHAR(8)      NOT NULL,
  name        VARCHAR(60)  NOT NULL,
  unit_cents  INT UNSIGNED NOT NULL,
  qty         TINYINT UNSIGNED NOT NULL DEFAULT 1,
  position    SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (bill_id, id),
  KEY idx_items_bill_pos (bill_id, position),
  CONSTRAINT fk_items_bill FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS participants (
  id         VARCHAR(40) NOT NULL,
  bill_id    CHAR(8)     NOT NULL,
  name       VARCHAR(32) NOT NULL,
  color      CHAR(7)     NOT NULL,
  joined_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  seq        SMALLINT UNSIGNED NOT NULL,
  token_hash CHAR(64)    NULL,
  PRIMARY KEY (bill_id, id),
  CONSTRAINT fk_part_bill FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS claims (
  bill_id         CHAR(8)     NOT NULL,
  item_id         VARCHAR(40) NOT NULL,
  participant_id  VARCHAR(40) NOT NULL,
  seq             INT UNSIGNED NOT NULL,
  PRIMARY KEY (bill_id, item_id, participant_id),
  CONSTRAINT fk_claim_item FOREIGN KEY (bill_id, item_id) REFERENCES items(bill_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_claim_part FOREIGN KEY (bill_id, participant_id) REFERENCES participants(bill_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
