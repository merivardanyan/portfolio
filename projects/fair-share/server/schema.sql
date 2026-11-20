-- Fair Share schema (SQLite via node:sqlite). Idempotent. Money is INTEGER minor units.
CREATE TABLE IF NOT EXISTS bills (
  id               TEXT PRIMARY KEY,                     -- 8-char unguessable code
  host_token_hash  TEXT NOT NULL,                        -- sha256(hostToken), hex
  title            TEXT NOT NULL DEFAULT '',
  currency         TEXT NOT NULL CHECK (length(currency) = 3),
  tax_cents        INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  tip_mode         TEXT NOT NULL CHECK (tip_mode IN ('percent', 'amount')),
  tip_value        INTEGER NOT NULL DEFAULT 0 CHECK (tip_value >= 0),
  locked           INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  version          INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS items (
  id          TEXT NOT NULL,
  bill_id     TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  unit_cents  INTEGER NOT NULL CHECK (unit_cents >= 0),
  qty         INTEGER NOT NULL DEFAULT 1 CHECK (qty BETWEEN 1 AND 99),
  position    INTEGER NOT NULL,
  PRIMARY KEY (bill_id, id)
);
CREATE INDEX IF NOT EXISTS idx_items_bill_pos ON items (bill_id, position);

CREATE TABLE IF NOT EXISTS participants (
  id         TEXT NOT NULL,
  bill_id    TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  joined_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  seq        INTEGER NOT NULL,                           -- join order
  token_hash TEXT,                                       -- sha256(participantToken); never sent to clients
  PRIMARY KEY (bill_id, id)
);

CREATE TABLE IF NOT EXISTS claims (
  bill_id         TEXT NOT NULL,
  item_id         TEXT NOT NULL,
  participant_id  TEXT NOT NULL,
  seq             INTEGER NOT NULL,                      -- claim order (stable claimer lists)
  PRIMARY KEY (bill_id, item_id, participant_id),
  FOREIGN KEY (bill_id, item_id) REFERENCES items(bill_id, id) ON DELETE CASCADE,
  FOREIGN KEY (bill_id, participant_id) REFERENCES participants(bill_id, id) ON DELETE CASCADE
);
