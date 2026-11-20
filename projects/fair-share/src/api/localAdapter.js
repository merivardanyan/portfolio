import {
  PARTICIPANT_COLORS,
  applyOp,
  applyOps,
  computeSplit,
  createBill,
  newBillId,
  newId,
  nextColor,
} from '../../core/index.js';
import { ApiError, statusFor } from './errors.js';

// Mirrors server/ in the browser: same reducer, same message shapes, same auth model
// (participant token on join, `auth` message before claims, reqId echoed everywhere).
// localStorage is the database, BroadcastChannel is the room, Web Locks serialise commits.

const PREFIX = 'fair-share:bill:';
export const SAMPLE_BILL_ID = 'TASTY234';

const tabConnections = new Map();
const channels = new Map();

function load(id) {
  try {
    const raw = globalThis.localStorage.getItem(PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save(id, record) {
  globalThis.localStorage.setItem(PREFIX + id, JSON.stringify(record));
}

function withLock(id, fn) {
  const locks = globalThis.navigator?.locks;
  return locks ? locks.request(`fair-share:${id}`, fn) : Promise.resolve().then(fn);
}

function channelFor(id) {
  if (typeof BroadcastChannel !== 'function') return null;
  let ch = channels.get(id);
  if (!ch) {
    ch = new BroadcastChannel(`fair-share:${id}`);
    ch.onmessage = (e) => {
      for (const conn of tabConnections.get(id) ?? []) conn.receive(e.data);
    };
    channels.set(id, ch);
  }
  return ch;
}

function broadcast(id, msg) {
  for (const conn of tabConnections.get(id) ?? []) conn.receive(msg);
  channelFor(id)?.postMessage(msg);
}

function toApiError(err) {
  if (err instanceof ApiError) return err;
  if (err?.code) return new ApiError(statusFor(err.code), err.code, err.message);
  return new ApiError(500, 'internal', err?.message ?? 'Unexpected error');
}

function requireRecord(id) {
  const rec = load(id);
  if (!rec) throw new ApiError(404, 'not_found', 'Bill not found');
  return rec;
}

/**
 * The one write path, like the server's commit(): validate every entry against the latest
 * state, persist once, then broadcast one patch per applied op (echoing its reqId).
 * Runs entirely inside the Web Lock, so another tab can't interleave.
 */
function commit(id, entries, mutateRecord) {
  return withLock(id, () => {
    const rec = requireRecord(id);
    let state = rec.bill;
    const steps = [];
    const noops = [];
    for (const e of entries) {
      const next = applyOp(state, e.op, e.ctx);
      if (next === state) {
        noops.push(e.reqId);
        continue;
      }
      steps.push({ op: e.op, version: next.version, reqId: e.reqId });
      state = next;
    }
    if (steps.length) save(id, mutateRecord ? mutateRecord({ ...rec, bill: state }) : { ...rec, bill: state });
    for (const s of steps) broadcast(id, { type: 'patch', version: s.version, op: s.op, ...(s.reqId != null && { reqId: s.reqId }) });
    return { state, applied: steps.map((s) => ({ reqId: s.reqId, version: s.version })), noops };
  });
}

export function seedSample() {
  if (load(SAMPLE_BILL_ID)) return;
  let bill = createBill({
    id: SAMPLE_BILL_ID,
    title: "Friday at Luigi's",
    currency: 'USD',
    taxCents: 712,
    tip: { mode: 'percent', value: 1800 },
    items: [
      { id: 'marg', name: 'Margherita', unitCents: 1400, qty: 2 },
      { id: 'diav', name: 'Diavola', unitCents: 1650, qty: 1 },
      { id: 'burr', name: 'Burrata', unitCents: 1300, qty: 1 },
      { id: 'wine', name: 'Bottle of Chianti', unitCents: 3800, qty: 1 },
      { id: 'tira', name: 'Tiramisu', unitCents: 900, qty: 1 },
      { id: 'espr', name: 'Espresso', unitCents: 350, qty: 3 },
    ],
  });
  bill = applyOps(bill, [
    { op: 'participant.join', participant: { id: 'ana', name: 'Ana', color: PARTICIPANT_COLORS[0] } },
    { op: 'participant.join', participant: { id: 'ben', name: 'Ben', color: PARTICIPANT_COLORS[1] } },
    { op: 'participant.join', participant: { id: 'chloe', name: 'Chloe', color: PARTICIPANT_COLORS[2] } },
    { op: 'claim', itemId: 'marg', participantId: 'ana' },
    { op: 'claim', itemId: 'diav', participantId: 'ben' },
    { op: 'claim', itemId: 'wine', participantId: 'ana' },
    { op: 'claim', itemId: 'wine', participantId: 'ben' },
    { op: 'claim', itemId: 'wine', participantId: 'chloe' },
    { op: 'claim', itemId: 'burr', participantId: 'chloe' },
  ]);
  save(SAMPLE_BILL_ID, { bill, hostToken: null, participantTokens: {} });
}

export const localAdapter = {
  name: 'local',

  async createBill({ title, currency, taxCents, tip, items = [] }) {
    try {
      let id = newBillId();
      while (load(id)) id = newBillId();
      const bill = createBill({
        id,
        title,
        currency,
        taxCents,
        tip,
        items: items.map((it) => ({ ...it, id: it.id ?? newId() })),
      });
      const hostToken = newId(32);
      save(id, { bill, hostToken, participantTokens: {} });
      return { id, hostToken, bill };
    } catch (err) {
      throw toApiError(err);
    }
  },

  async getBill(id) {
    seedSample();
    const { bill } = requireRecord(id);
    return { bill, split: computeSplit(bill) };
  },

  async patchBill(id, hostToken, entries) {
    const rec = requireRecord(id);
    if (!hostToken || rec.hostToken !== hostToken) throw new ApiError(401, 'unauthorized', 'Host token required');
    try {
      const r = await commit(
        id,
        entries.map(({ reqId, op }) => ({ op, reqId, ctx: { role: 'host' } })),
      );
      return { version: r.state.version, bill: r.state, applied: r.applied, noops: r.noops };
    } catch (err) {
      throw toApiError(err);
    }
  },

  async join(id, { name, color, reqId }) {
    const participantId = newId();
    const participantToken = newId(32);
    try {
      const r = await commit(
        id,
        [
          {
            op: { op: 'participant.join', participant: { id: participantId, name, color: color ?? nextColor(requireRecord(id).bill) } },
            ctx: { role: 'server' },
            reqId,
          },
        ],
        (rec) => ({ ...rec, participantTokens: { ...rec.participantTokens, [participantId]: participantToken } }),
      );
      return {
        participantId,
        participantToken,
        participant: r.state.participants.find((p) => p.id === participantId),
        version: r.state.version,
      };
    } catch (err) {
      throw toApiError(err);
    }
  },

  connect(id, { onMessage, onStatus }) {
    let closed = false;
    let participantId = null;
    const conn = {
      receive(msg) {
        if (!closed) onMessage(msg);
      },
    };
    const set = tabConnections.get(id) ?? new Set();
    set.add(conn);
    tabConnections.set(id, set);
    channelFor(id);

    const reply = (msg, reqId) => conn.receive(reqId == null ? msg : { ...msg, reqId });
    const fail = (code, message, reqId) => reply({ type: 'error', code, message }, reqId);
    const snapshot = () => {
      const rec = load(id);
      if (rec) conn.receive({ type: 'snapshot', version: rec.bill.version, bill: rec.bill });
      else fail('not_found', 'Bill not found');
    };

    queueMicrotask(() => {
      if (closed) return;
      onStatus('live');
      snapshot();
    });

    return {
      send(msg) {
        if (closed) return;
        const { reqId } = msg;
        switch (msg.type) {
          case 'sync':
            return snapshot();
          case 'ping':
            return conn.receive({ type: 'pong', t: msg.t });
          case 'auth': {
            const token = load(id)?.participantTokens?.[msg.participantId];
            if (!token || token !== msg.token) return fail('invalid_token', 'Unknown participant or wrong participant token', reqId);
            participantId = msg.participantId;
            return reply({ type: 'authed', participantId }, reqId);
          }
          case 'claim':
          case 'unclaim': {
            if (!participantId) return fail('forbidden', 'Send { type: "auth", participantId, token } before claiming', reqId);
            const entry = {
              op: { op: msg.type, itemId: msg.itemId, participantId },
              ctx: { role: 'participant', participantId },
              reqId,
            };
            commit(id, [entry])
              .then((r) => {
                if (!r.applied.length) reply({ type: 'ack', version: r.state.version }, reqId);
              })
              .catch((err) => {
                const e = toApiError(err);
                fail(e.code, e.message, reqId);
              });
            return undefined;
          }
          default:
            return fail('unknown_type', `Unknown message type ${msg.type}`, reqId);
        }
      },
      close() {
        closed = true;
        set.delete(conn);
      },
    };
  },
};
