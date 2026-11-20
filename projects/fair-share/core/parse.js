// Quick-entry receipt parser: paste lines like "2 Margherita 24.00".
import { parseMoney } from './money.js';

const PRICE_RE = /\s+[$€£¥]?\s?(\d[\d.,']*)\s*[$€£¥]?$/;
const QTY_RE = /^(\d{1,2})\s*[x×*]?\s+(?=\S)/i;
const TAX_RE = /^(sales\s+)?(tax|vat|gst|hst)\b/i;
const TIP_RE = /^(tip|gratuity|service(\s+charge)?)\b/i;
const SKIP_RE = /^(sub\s*-?\s*total|total|amount\s+due|balance|change|cash|card|visa|mastercard|amex|thank)/i;

/**
 * Parse pasted receipt text. The price on each line is the **line total** (receipt
 * convention). For "2 Margherita 24.00", unitCents = 1200, qty = 2. If the total does
 * not divide evenly by qty, the line is kept as qty 1 with the quantity in the name
 * ("3x Beer" at 13.00) so no cent is ever invented or lost.
 *
 * @param {string} text
 * @param {{ digits?: number }} [opts] minor-unit digits of the bill currency
 * @returns {{ items: Array<{name:string, unitCents:number, qty:number}>, taxCents: number|null,
 *            tipCents: number|null, skipped: string[] }}
 */
export function parseReceipt(text, { digits = 2 } = {}) {
  const items = [];
  const skipped = [];
  let taxCents = null, tipCents = null;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const pm = PRICE_RE.exec(' ' + line);
    const cents = pm ? parseMoney(pm[1], digits) : null;
    if (cents === null) { skipped.push(line); continue; }
    let label = (' ' + line).slice(0, pm.index).trim().replace(/[\s.:\-–]+$/, '');
    if (TAX_RE.test(label)) { taxCents = (taxCents ?? 0) + cents; continue; }
    if (TIP_RE.test(label)) { tipCents = (tipCents ?? 0) + cents; continue; }
    if (SKIP_RE.test(label)) { skipped.push(line); continue; }
    let qty = 1;
    const qm = QTY_RE.exec(label);
    if (qm && Number(qm[1]) === 0) { skipped.push(line); continue; } // '0 Free thing 0': nothing to split
    if (qm) {
      qty = Number(qm[1]);
      label = label.slice(qm[0].length).trim();
    }
    if (!label || /^\d+$/.test(label)) { skipped.push(line); continue; }
    label = label.slice(0, 60);
    if (qty > 1 && cents % qty !== 0) items.push({ name: `${qty}x ${label}`.slice(0, 60), unitCents: cents, qty: 1 });
    else items.push({ name: label, unitCents: cents / qty, qty });
  }
  return { items, taxCents, tipCents, skipped };
}
