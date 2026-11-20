// Plain-English explanations of a consume() result. Browser-safe.

const ms = (v) => (v >= 1000 ? `${+(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)} s` : `${Math.round(v)} ms`);
const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
const plural = (n, word) => `${num(n)} ${word}${n === 1 ? '' : 's'}`;

/**
 * Explain why a request was allowed or denied.
 * @param {{ algo: string, allowed: boolean, limit: number, remaining: number, retryAfterMs: number, resetMs: number, info: object }} r
 * @returns {string}
 */
export function explain(r) {
  const i = r.info ?? {};
  const verdict = r.allowed ? 'Allowed' : 'Denied (429)';
  switch (r.algo) {
    case 'fixedWindow':
      return r.allowed
        ? `${verdict}: ${plural(i.count + i.cost, 'request')} of ${r.limit} used in this window; it resets in ${ms(r.resetMs)}.`
        : `${verdict}: this window already has ${i.count}/${r.limit} requests. The counter resets at the window boundary in ${ms(r.retryAfterMs)}.`;
    case 'slidingLog':
      return r.allowed
        ? `${verdict}: ${plural(i.count + i.cost, 'request')} logged inside the sliding window (limit ${r.limit}); the oldest expires in ${ms(r.resetMs)}.`
        : `${verdict}: the log holds ${i.count} timestamps inside the sliding window (limit ${r.limit}). The oldest one falls out in ${ms(r.retryAfterMs)}.`;
    case 'slidingCounter': {
      const est = `${num(i.prev)} x ${Math.round(i.weight * 100)}% of the previous window + ${i.count} in this one = ${num(i.estimate)}`;
      return r.allowed
        ? `${verdict}: estimated load was ${est}, under the limit of ${r.limit}.`
        : `${verdict}: estimated load is ${est}, and one more would exceed ${r.limit}. As the previous window's weight decays, room frees up in ${ms(r.retryAfterMs)}.`;
    }
    case 'tokenBucket':
      return r.allowed
        ? `${verdict}: the bucket had ${plural(i.tokens, 'token')}; ${num(r.remaining)} left after this request (refills ${num(i.refillPerSec)}/s).`
        : `${verdict}: the bucket had ${plural(i.tokens, 'token')} (needs ${i.cost}). At ${num(i.refillPerSec)}/s the next token arrives in ${ms(r.retryAfterMs)}.`;
    default:
      return `${verdict}.`;
  }
}
