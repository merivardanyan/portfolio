/**
 * In-memory store (a Map). Browser-safe. Expired entries are dropped lazily and by `prune`.
 * Store interface (shared with SqliteStore):
 *   get(key, now) -> state | undefined
 *   set(key, state, ttlMs, now)
 *   delete(key)
 *   update(key, fn, now) -> value   where fn(state|undefined) -> { state, ttlMs, value }   (atomic)
 */
export class MemoryStore {
  constructor({ maxKeys = 100_000 } = {}) {
    this.map = new Map();
    this.maxKeys = maxKeys;
  }

  get(key, now = Date.now()) {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= now) { this.map.delete(key); return undefined; }
    return structuredClone(e.state);
  }

  set(key, state, ttlMs, now = Date.now()) {
    if (!this.map.has(key) && this.map.size >= this.maxKeys) {
      this.prune(now);
      if (this.map.size >= this.maxKeys) this.map.delete(this.map.keys().next().value); // evict oldest insert
    }
    this.map.set(key, { state: structuredClone(state), expiresAt: now + Math.max(1, ttlMs) });
  }

  delete(key) { this.map.delete(key); }

  // JS is single-threaded and fn is synchronous, so get+set is already atomic here.
  update(key, fn, now = Date.now()) {
    const { state, ttlMs, value } = fn(this.get(key, now));
    this.set(key, state, ttlMs, now);
    return value;
  }

  prune(now = Date.now()) {
    let n = 0;
    for (const [k, e] of this.map) if (e.expiresAt <= now) { this.map.delete(k); n++; }
    return n;
  }

  get size() { return this.map.size; }
}
