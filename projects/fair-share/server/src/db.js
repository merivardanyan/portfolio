import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(resolve(here, '../schema.sql'), 'utf8');

export function openDb(file = ':memory:') {
  if (file !== ':memory:') mkdirSync(dirname(resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  // In-place migration for databases created before participant tokens existed.
  const cols = db.prepare('PRAGMA table_info(participants)').all().map((c) => c.name);
  if (!cols.includes('token_hash')) db.exec('ALTER TABLE participants ADD COLUMN token_hash TEXT');
  return db;
}

/** Thrown when another writer changed the bill since we loaded it (multi-process deployments). */
export class ConflictError extends Error {
  constructor(billId) {
    super(`version conflict on bill ${billId}`);
    this.name = 'ConflictError';
    this.billId = billId;
  }
}

/**
 * Bill store. Normalised tables per the plan; every op from core/bill.js maps to a small
 * set of parameterised statements. A batch of ops is persisted in ONE transaction together
 * with the version bump, so a failure leaves nothing half-applied.
 */
export function createStore(db) {
  const s = {
    insertBill: db.prepare(`INSERT INTO bills (id, host_token_hash, title, currency, tax_cents, tip_mode, tip_value, locked, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`),
    billExists: db.prepare('SELECT 1 FROM bills WHERE id = ?'),
    getBill: db.prepare('SELECT * FROM bills WHERE id = ?'),
    getHash: db.prepare('SELECT host_token_hash FROM bills WHERE id = ?'),
    getParticipantHash: db.prepare('SELECT token_hash FROM participants WHERE bill_id = ? AND id = ?'),
    items: db.prepare('SELECT id, name, unit_cents, qty FROM items WHERE bill_id = ? ORDER BY position'),
    participants: db.prepare('SELECT id, name, color FROM participants WHERE bill_id = ? ORDER BY seq'),
    claims: db.prepare('SELECT item_id, participant_id FROM claims WHERE bill_id = ? ORDER BY seq'),
    insertItem: db.prepare('INSERT INTO items (id, bill_id, name, unit_cents, qty, position) VALUES (?, ?, ?, ?, ?, ?)'),
    updateItem: db.prepare('UPDATE items SET name = ?, unit_cents = ?, qty = ? WHERE bill_id = ? AND id = ?'),
    setPosition: db.prepare('UPDATE items SET position = ? WHERE bill_id = ? AND id = ?'),
    deleteItem: db.prepare('DELETE FROM items WHERE bill_id = ? AND id = ?'),
    insertParticipant: db.prepare('INSERT INTO participants (id, bill_id, name, color, seq, token_hash) VALUES (?, ?, ?, ?, ?, ?)'),
    insertClaim: db.prepare(`INSERT INTO claims (bill_id, item_id, participant_id, seq)
      VALUES (?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM claims WHERE bill_id = ?))`),
    deleteClaim: db.prepare('DELETE FROM claims WHERE bill_id = ? AND item_id = ? AND participant_id = ?'),
    updateBill: db.prepare(`UPDATE bills SET title = ?, currency = ?, tax_cents = ?, tip_mode = ?, tip_value = ?, locked = ?,
      version = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND version = ?`),
  };

  function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  const renumber = (billId, items) => items.forEach((it, i) => s.setPosition.run(i, billId, it.id));

  /** Row-level effects of one op (no transaction, no version bump). */
  function applyRows(op, next, extra = {}) {
    const id = next.id;
    switch (op.op) {
      case 'item.add': {
        const it = next.items.find((i) => i.id === op.item.id);
        s.insertItem.run(it.id, id, it.name, it.unitCents, it.qty, next.items.length - 1);
        renumber(id, next.items);
        break;
      }
      case 'item.update': {
        const it = next.items.find((i) => i.id === op.id);
        s.updateItem.run(it.name, it.unitCents, it.qty, id, it.id);
        break;
      }
      case 'item.remove':
        s.deleteItem.run(id, op.id); // claims cascade
        renumber(id, next.items);
        break;
      case 'participant.join': {
        const p = next.participants[next.participants.length - 1];
        s.insertParticipant.run(p.id, id, p.name, p.color, next.participants.length, extra.tokenHash ?? null);
        break;
      }
      case 'claim': s.insertClaim.run(id, op.itemId, op.participantId, id); break;
      case 'unclaim': s.deleteClaim.run(id, op.itemId, op.participantId); break;
      default: break; // bill.set / bill.lock: covered by the bill row update
    }
  }

  return {
    exists: (id) => !!s.billExists.get(id),
    hostTokenHash: (id) => s.getHash.get(id)?.host_token_hash ?? null,
    participantTokenHash: (billId, pid) => s.getParticipantHash.get(billId, pid)?.token_hash ?? null,

    /** Insert a new bill (state from core createBill). */
    create(state, hostTokenHash) {
      tx(() => {
        s.insertBill.run(state.id, hostTokenHash, state.title, state.currency, state.taxCents, state.tip.mode, state.tip.value);
        state.items.forEach((it, i) => s.insertItem.run(it.id, state.id, it.name, it.unitCents, it.qty, i));
      });
    },

    /** Load full state, or null. */
    load(id) {
      const b = s.getBill.get(id);
      if (!b) return null;
      const claims = {};
      for (const c of s.claims.all(id)) (claims[c.item_id] ??= []).push(c.participant_id);
      return {
        id: b.id, title: b.title, currency: b.currency, taxCents: Number(b.tax_cents),
        tip: { mode: b.tip_mode, value: Number(b.tip_value) }, locked: !!b.locked, version: Number(b.version),
        items: s.items.all(id).map((r) => ({ id: r.id, name: r.name, unitCents: Number(r.unit_cents), qty: Number(r.qty) })),
        participants: s.participants.all(id).map((r) => ({ id: r.id, name: r.name, color: r.color })),
        claims,
      };
    },

    /**
     * Persist a sequence of steps `[{ op, next, extra? }]` that took `prev` to the last `next`,
     * in one transaction. The `WHERE version = prev.version` check makes a concurrent writer
     * in another process fail with ConflictError instead of silently overwriting.
     */
    persistSteps(prev, steps) {
      if (!steps.length) return;
      tx(() => {
        for (const { op, next, extra } of steps) applyRows(op, next, extra);
        const last = steps[steps.length - 1].next;
        const r = s.updateBill.run(last.title, last.currency, last.taxCents, last.tip.mode, last.tip.value, last.locked ? 1 : 0,
          last.version, last.id, prev.version);
        if (Number(r.changes) !== 1) throw new ConflictError(last.id);
      });
    },

    /** Single-op convenience (seed script, tests). */
    persist(prev, op, next, extra) {
      this.persistSteps(prev, [{ op, next, extra }]);
    },
  };
}
