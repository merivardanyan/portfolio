/**
 * SQLite store for Node. Takes an already-open `node:sqlite` DatabaseSync (or any object with
 * the same `exec`/`prepare` API), so this file never imports a Node built-in and stays
 * bundle-safe.
 *
 * Keys look like "<limiterName>:<userKey>"; the part before the first ":" fills the `algo`
 * column so rows match the plan's `buckets(key, algo, state_json, updated_at)` schema.
 * Atomic updates use BEGIN IMMEDIATE, which takes the write lock before reading, so two
 * processes sharing the file cannot both read the same state and double-spend a token.
 */
export class SqliteStore {
  /** @param {import('node:sqlite').DatabaseSync} db */
  constructor(db, { table = 'buckets' } = {}) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw new TypeError('invalid table name');
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS ${table} (
      key TEXT NOT NULL, algo TEXT NOT NULL, state_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      PRIMARY KEY (key, algo))`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_expires ON ${table} (expires_at)`);
    this.q = {
      get: db.prepare(`SELECT state_json, expires_at FROM ${table} WHERE key = ? AND algo = ?`),
      upsert: db.prepare(`INSERT INTO ${table} (key, algo, state_json, updated_at, expires_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(key, algo) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at, expires_at = excluded.expires_at`),
      del: db.prepare(`DELETE FROM ${table} WHERE key = ? AND algo = ?`),
      prune: db.prepare(`DELETE FROM ${table} WHERE expires_at <= ?`),
    };
  }

  static split(key) {
    const i = key.indexOf(':');
    return i < 0 ? ['', key] : [key.slice(0, i), key.slice(i + 1)];
  }

  get(key, now = Date.now()) {
    const [algo, k] = SqliteStore.split(key);
    const row = this.q.get.get(k, algo);
    if (!row || Number(row.expires_at) <= now) return undefined;
    return JSON.parse(row.state_json);
  }

  set(key, state, ttlMs, now = Date.now()) {
    const [algo, k] = SqliteStore.split(key);
    this.q.upsert.run(k, algo, JSON.stringify(state), Math.floor(now), Math.floor(now + Math.max(1, ttlMs)));
  }

  delete(key) {
    const [algo, k] = SqliteStore.split(key);
    this.q.del.run(k, algo);
  }

  update(key, fn, now = Date.now()) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const { state, ttlMs, value } = fn(this.get(key, now));
      this.set(key, state, ttlMs, now);
      this.db.exec('COMMIT');
      return value;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  prune(now = Date.now()) {
    return Number(this.q.prune.run(Math.floor(now)).changes);
  }
}
