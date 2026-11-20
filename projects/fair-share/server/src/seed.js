import { createBill, applyOp, PARTICIPANT_COLORS } from '../../core/bill.js';
import { createStore } from './db.js';
import { sha256, newToken } from './crypto.js';

export const SAMPLE_BILL_ID = 'TASTY234';

/**
 * Seed a sample receipt with three participants and some claims. Idempotent.
 * Returns `{ hostToken, participantTokens }` on first creation (printed once by server.js) or null.
 */
export function seedSample(db) {
  const store = createStore(db);
  if (store.exists(SAMPLE_BILL_ID)) return null;
  let s = createBill({
    id: SAMPLE_BILL_ID, title: 'Friday at Luigi\'s', currency: 'USD', taxCents: 712, tip: { mode: 'percent', value: 1800 },
    items: [
      { id: 'marg', name: 'Margherita', unitCents: 1400, qty: 2 },
      { id: 'diav', name: 'Diavola', unitCents: 1650, qty: 1 },
      { id: 'burr', name: 'Burrata', unitCents: 1300, qty: 1 },
      { id: 'wine', name: 'Bottle of Chianti', unitCents: 3800, qty: 1 },
      { id: 'tira', name: 'Tiramisu', unitCents: 900, qty: 1 },
      { id: 'espr', name: 'Espresso', unitCents: 350, qty: 3 },
    ],
  });
  const hostToken = newToken();
  store.create(s, sha256(hostToken));
  const participantTokens = {};
  const people = [['ana', 'Ana'], ['ben', 'Ben'], ['chloe', 'Chloe']];
  const steps = [];
  const start = s;
  people.forEach(([id, name], i) => {
    participantTokens[id] = newToken();
    const op = { op: 'participant.join', participant: { id, name, color: PARTICIPANT_COLORS[i] } };
    s = applyOp(s, op);
    steps.push({ op, next: s, extra: { tokenHash: sha256(participantTokens[id]) } });
  });
  for (const [itemId, pid] of [['marg', 'ana'], ['diav', 'ben'], ['wine', 'ana'], ['wine', 'ben'], ['wine', 'chloe'], ['burr', 'chloe']]) {
    const op = { op: 'claim', itemId, participantId: pid };
    s = applyOp(s, op);
    steps.push({ op, next: s });
  }
  store.persistSteps(start, steps);
  return { hostToken, participantTokens };
}
