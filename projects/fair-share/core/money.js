// Integer minor-unit ("cents") money math. Plain ESM, zero dependencies.
// Amounts are always safe integers in the currency's minor unit (cents for USD/EUR,
// yen for JPY). Floats never touch money; intermediate products use BigInt.

export const MAX_CENTS = 1_000_000_000; // 10 million major units: generous for a dinner bill

/**
 * Number of minor-unit digits for an ISO-4217 code (USD 2, JPY 0, BHD 3).
 * Falls back to 2 for unknown codes.
 * @param {string} currency
 */
export function currencyDigits(currency) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

/** Is `code` a 3-letter currency that Intl knows how to format? */
export function isCurrency(code) {
  if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code)) return false;
  return knownCurrencies().has(code);
}

let currencySet;
/** ISO-4217 codes known to this runtime (falls back to a common list on old engines). */
function knownCurrencies() {
  if (!currencySet) {
    currencySet = new Set(typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('currency')
      : /* c8 ignore next */ ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'MXN', 'BRL', 'SEK', 'NOK', 'DKK', 'PLN', 'NZD']);
  }
  return currencySet;
}

/** Is `v` a non-negative safe integer no larger than MAX_CENTS? */
export const isCents = (v) => Number.isSafeInteger(v) && v >= 0 && v <= MAX_CENTS;

/**
 * Parse a user-typed amount into minor units without floating point.
 * Accepts "24", "24.5", "24.50", "$1,234.56", "1.234,56", "12,50", " 7 ".
 * Returns null for anything that is not a non-negative amount with at most `digits` decimals.
 * @param {string|number} input
 * @param {number} [digits=2]
 * @returns {number|null}
 */
export function parseMoney(input, digits = 2) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null;
    input = input.toFixed(digits);
  }
  if (typeof input !== 'string' || input.includes('-')) return null;
  let s = input.trim().replace(/^[^\d.,]+|[^\d.,]+$/g, '').replace(/[\s ']/g, '');
  if (!s || /[^\d.,]/.test(s)) return null;
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  let intPart, frac = '';
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    const [i, f, ...rest] = s.split(dec);
    if (rest.length) return null;
    intPart = i.split(thou).join('');
    frac = f;
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = s.split(sep);
    const tail = parts[parts.length - 1];
    if (parts.length === 2 && tail.length <= digits && !(tail.length === 3 && digits < 3)) {
      intPart = parts[0];
      frac = tail;
    } else if ((sep === ',' || parts.length > 2) && parts.slice(1).every((p) => p.length === 3) && parts[0].length >= 1 && parts[0].length <= 3) {
      intPart = parts.join(''); // thousands separators only
    } else {
      return null;
    }
  } else {
    intPart = s;
  }
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac) || frac.length > digits || (intPart === '' && frac === '')) return null;
  const minor = BigInt(intPart || '0') * 10n ** BigInt(digits) + BigInt((frac || '').padEnd(digits, '0') || '0');
  if (minor > BigInt(MAX_CENTS)) return null;
  return Number(minor);
}

/**
 * Format minor units for display.
 * @param {number} cents
 * @param {string} [currency='USD']
 * @param {string} [locale]
 */
export function formatMoney(cents, currency = 'USD', locale = undefined) {
  const digits = currencyDigits(currency);
  const major = cents / 10 ** digits; // display only
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(major);
}

/** Plain decimal string ("12.50") for inputs, exact (no float). */
export function centsToDecimal(cents, digits = 2) {
  if (!Number.isSafeInteger(cents)) throw new TypeError('cents must be a safe integer');
  const neg = cents < 0;
  const s = String(Math.abs(cents)).padStart(digits + 1, '0');
  const out = digits ? `${s.slice(0, -digits)}.${s.slice(-digits)}` : s;
  return neg ? `-${out}` : out;
}

/**
 * `amount * basisPoints / 10000`, rounded half-up, exact. 1800 bp = 18%.
 * @param {number} amount integer minor units
 * @param {number} bp integer basis points
 */
export function applyBasisPoints(amount, bp) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('amount must be a non-negative safe integer');
  if (!Number.isSafeInteger(bp) || bp < 0) throw new RangeError('basis points must be a non-negative safe integer');
  return Number((BigInt(amount) * BigInt(bp) + 5000n) / 10000n);
}

/**
 * Largest-remainder (Hamilton) allocation: split `total` into integer parts
 * proportional to `weights`, so that the parts always sum to exactly `total`.
 *
 * Ties on the remainder are broken by `tieOrder` (array of indices, earliest wins);
 * default is index order. Callers can rotate `tieOrder` so the same person does not
 * always receive the spare cent.
 *
 * @param {number} total non-negative safe integer
 * @param {number[]} weights non-negative safe integers, at least one > 0 (unless total is 0)
 * @param {number[]} [tieOrder]
 * @returns {number[]}
 */
export function allocate(total, weights, tieOrder) {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError('total must be a non-negative safe integer');
  if (!Array.isArray(weights) || weights.length === 0) throw new RangeError('weights must be a non-empty array');
  if (!weights.every((w) => Number.isSafeInteger(w) && w >= 0)) throw new RangeError('weights must be non-negative safe integers');
  const sum = weights.reduce((a, w) => a + BigInt(w), 0n);
  if (sum === 0n) {
    if (total === 0) return weights.map(() => 0);
    throw new RangeError('cannot allocate a non-zero total across zero weights');
  }
  const T = BigInt(total);
  const parts = weights.map((w) => (T * BigInt(w)) / sum);
  const rems = weights.map((w) => (T * BigInt(w)) % sum);
  let left = Number(T - parts.reduce((a, p) => a + p, 0n));
  const order = tieOrder ?? weights.map((_, i) => i);
  const rank = new Map(order.map((idx, pos) => [idx, pos]));
  const idx = weights.map((_, i) => i).sort((a, b) => {
    if (rems[a] !== rems[b]) return rems[b] > rems[a] ? 1 : -1;
    return (rank.get(a) ?? a + weights.length) - (rank.get(b) ?? b + weights.length);
  });
  for (let k = 0; left > 0; k++, left--) parts[idx[k]] += 1n;
  return parts.map(Number);
}

/** Split `total` into `n` near-equal integer parts (first-ranked parts get the extra unit). */
export function splitEvenly(total, n, offset = 0) {
  if (!Number.isSafeInteger(n) || n < 1) throw new RangeError('n must be a positive integer');
  const order = Array.from({ length: n }, (_, i) => (i + offset) % n);
  return allocate(total, new Array(n).fill(1), order);
}
