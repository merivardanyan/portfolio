// Pure bill splitting: (bill, claims) -> per-person totals, exact to the cent.
import { allocate, applyBasisPoints, splitEvenly } from './money.js';

/** Line total of an item in minor units. */
export const lineCents = (item) => item.unitCents * item.qty;

/** Bill subtotal (all items, claimed or not). */
export const billSubtotal = (bill) => bill.items.reduce((s, it) => s + lineCents(it), 0);

/** Tip in minor units for a bill. Percent tips are on the pre-tax subtotal, half-up. */
export function tipCents(bill) {
  const tip = bill.tip ?? { mode: 'amount', value: 0 };
  return tip.mode === 'percent' ? applyBasisPoints(billSubtotal(bill), tip.value) : tip.value;
}

/** Small stable string hash used to rotate tie-breaks per item. */
function rot(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Compute what everyone owes.
 *
 * - Each item's line total is split evenly among its claimers (integer cents; the spare
 *   cents rotate between claimers per item so nobody systematically pays more).
 * - Tax and tip are allocated proportionally to each person's subtotal using the
 *   largest-remainder method. Unclaimed items form their own bucket, so
 *   `sum(people.totalCents) + unclaimed.totalCents === totalCents` always holds.
 *
 * @param {{ currency?: string, taxCents: number, tip: {mode:'percent'|'amount', value:number},
 *           items: Array<{id:string,name:string,unitCents:number,qty:number}>,
 *           participants: Array<{id:string,name:string,color?:string}>,
 *           claims?: Record<string,string[]> }} bill
 * @param {Record<string,string[]>} [claims=bill.claims] itemId -> participantIds
 */
export function computeSplit(bill, claims = bill.claims ?? {}) {
  const people = bill.participants.map((p) => ({
    participantId: p.id, name: p.name, color: p.color, subtotalCents: 0, taxCents: 0, tipCents: 0, totalCents: 0, items: [],
  }));
  const byId = new Map(people.map((p, i) => [p.participantId, i]));
  const unclaimed = { subtotalCents: 0, taxCents: 0, tipCents: 0, totalCents: 0, itemIds: [] };

  for (const item of bill.items) {
    const line = lineCents(item);
    // only claimers who are actual participants, in participant (join) order, deduplicated
    const claimers = [...new Set(claims[item.id] ?? [])].filter((pid) => byId.has(pid)).sort((a, b) => byId.get(a) - byId.get(b));
    if (claimers.length === 0) {
      unclaimed.subtotalCents += line;
      unclaimed.itemIds.push(item.id);
      continue;
    }
    const shares = splitEvenly(line, claimers.length, rot(item.id) % claimers.length);
    claimers.forEach((pid, k) => {
      const p = people[byId.get(pid)];
      p.subtotalCents += shares[k];
      p.items.push({ itemId: item.id, name: item.name, shareCents: shares[k], splitWays: claimers.length });
    });
  }

  const subtotal = billSubtotal(bill);
  const tax = bill.taxCents;
  const tip = tipCents(bill);
  const weights = [...people.map((p) => p.subtotalCents), unclaimed.subtotalCents];
  // Zero subtotal (e.g. only free items) -> nobody can be weighted; park extras as unclaimed.
  const spread = (amount) => (subtotal === 0 ? [...people.map(() => 0), amount] : allocate(amount, weights));
  const taxShares = spread(tax);
  const tipShares = spread(tip);

  people.forEach((p, i) => {
    p.taxCents = taxShares[i];
    p.tipCents = tipShares[i];
    p.totalCents = p.subtotalCents + p.taxCents + p.tipCents;
  });
  unclaimed.taxCents = taxShares[people.length];
  unclaimed.tipCents = tipShares[people.length];
  unclaimed.totalCents = unclaimed.subtotalCents + unclaimed.taxCents + unclaimed.tipCents;

  return {
    currency: bill.currency,
    subtotalCents: subtotal,
    taxCents: tax,
    tipCents: tip,
    totalCents: subtotal + tax + tip,
    people,
    unclaimed,
    allClaimed: bill.items.length > 0 && unclaimed.itemIds.length === 0,
  };
}
