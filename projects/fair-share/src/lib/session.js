import { applyPatch, computeSplit, rebase } from '../../core/index.js';

const RESYNC_ERRORS = new Set(['rate_limited', 'conflict']);

const markAcked = (pending, reqId) =>
  reqId == null ? pending : pending.map((p) => (p.reqId === reqId ? { ...p, acked: true } : p));

function drop(pending, reqId) {
  if (reqId == null) return { pending, dropped: null };
  const dropped = pending.find((p) => p.reqId === reqId) ?? null;
  return { pending: dropped ? pending.filter((p) => p !== dropped) : pending, dropped };
}

/**
 * Pure client reconciliation. `state` is `{ confirmed, pending, syncing }`.
 * Returns the next state plus effects: `sendSync` (ask for a snapshot), `resend` (replay pending
 * WS ops after a snapshot) and `error` (something to tell the user). A patch that confirms one of
 * our ops while we are waiting for a snapshot marks it `acked`: it stays visible until the snapshot
 * (which contains it) arrives, and is then dropped instead of being re-applied or re-sent.
 */
export function reduceMessage(state, msg) {
  const base = { ...state, sendSync: false, resend: false, error: null };
  switch (msg.type) {
    case 'snapshot':
      return { ...base, confirmed: msg.bill, pending: state.pending.filter((p) => !p.acked), syncing: false, resend: true };
    case 'patch': {
      if (!state.confirmed || state.syncing) {
        return { ...base, pending: markAcked(state.pending, msg.reqId), syncing: true, sendSync: !state.syncing };
      }
      const r = applyPatch(state.confirmed, msg);
      if (r.status === 'gap') {
        return { ...base, pending: markAcked(state.pending, msg.reqId), syncing: true, sendSync: true };
      }
      return { ...base, confirmed: r.state, pending: drop(state.pending, msg.reqId).pending };
    }
    case 'ack':
      return { ...base, pending: drop(state.pending, msg.reqId).pending };
    case 'error': {
      const { pending, dropped } = drop(state.pending, msg.reqId);
      const resync = RESYNC_ERRORS.has(msg.code) && !state.syncing;
      return {
        ...base,
        pending,
        syncing: state.syncing || resync,
        sendSync: resync,
        error: { code: msg.code, message: msg.message, op: dropped?.op ?? null },
      };
    }
    default:
      return base;
  }
}

export function derive(confirmed, pending) {
  if (!confirmed) return { view: null, split: null, pending, rejected: [] };
  const { view, pending: kept, rejected } = rebase(confirmed, pending);
  return { view, split: computeSplit(view), pending: kept, rejected };
}

export function toggleClaimOp(view, itemId, participantId) {
  const claimed = (view.claims[itemId] ?? []).includes(participantId);
  return { op: claimed ? 'unclaim' : 'claim', itemId, participantId };
}

export function describeRejection(error, view) {
  const op = error.op;
  if (op && (op.op === 'claim' || op.op === 'unclaim')) {
    const item = view?.items.find((i) => i.id === op.itemId);
    const verb = op.op === 'claim' ? 'claim' : 'unclaim';
    return `Couldn't ${verb} ${item ? item.name : 'that item'}: ${error.message}`;
  }
  return error.message;
}
