// Bill state + patch ops reducer, shared by client (optimistic updates) and server (authoritative).
// Pure and immutable: applyOp never mutates its input.
import { isCents, isCurrency } from './money.js';

export const LIMITS = Object.freeze({
  titleMax: 80, itemNameMax: 60, participantNameMax: 32, maxItems: 200, maxParticipants: 50, maxQty: 99, maxTipBp: 10_000,
});

export const PARTICIPANT_COLORS = Object.freeze([
  '#E4572E', '#29335C', '#F3A712', '#669BBC', '#A8C686', '#8E5572', '#2E933C', '#D1495B', '#00798C', '#6A4C93',
]);

/** Ops only the host may perform. */
export const HOST_OPS = new Set(['bill.set', 'bill.lock', 'item.add', 'item.update', 'item.remove']);
/** Ops a participant may perform over the socket. */
export const PARTICIPANT_OPS = new Set(['claim', 'unclaim']);
/** Ops only the server emits. */
export const SERVER_OPS = new Set(['participant.join']);

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** Bill codes: 8 chars, no look-alikes (0/O, 1/I/L). Shared by the server and the local adapter. */
export const BILL_ID_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const BILL_ID_RE = /^[A-HJKMNP-Z2-9]{8}$/;

/** Random bill code using Web Crypto (unbiased: 248 = 8 * 31). */
export function newBillId() {
  const bytes = new Uint8Array(16);
  let out = '';
  while (out.length < 8) {
    globalThis.crypto.getRandomValues(bytes);
    for (const x of bytes) if (x < 248 && out.length < 8) out += BILL_ID_ALPHABET[x % 31];
  }
  return out;
}
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export class BillError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'BillError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new BillError(code, message); };

/** Random URL-safe id using Web Crypto (available in browsers and Node 19+). */
export function newId(len = 12) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  // 256 % 56 != 0 -> reject-sample to avoid modulo bias
  let out = '';
  for (let i = 0; out.length < len; i++) {
    if (i >= bytes.length) { globalThis.crypto.getRandomValues(bytes); i = 0; }
    if (bytes[i] < 224) out += alphabet[bytes[i] % 56];
  }
  return out;
}

const cleanText = (s) => s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();

function text(v, field, max, { allowEmpty = false } = {}) {
  if (typeof v !== 'string') fail('invalid_' + field, `${field} must be a string`);
  const t = cleanText(v);
  if (!allowEmpty && t.length === 0) fail('invalid_' + field, `${field} is required`);
  if (t.length > max) fail('invalid_' + field, `${field} must be at most ${max} characters`);
  return t;
}

function id(v, field = 'id') {
  if (typeof v !== 'string' || !ID_RE.test(v)) fail('invalid_' + field, `${field} must match ${ID_RE}`);
  return v;
}

function cents(v, field) {
  if (!isCents(v)) fail('invalid_' + field, `${field} must be a non-negative integer number of minor units`);
  return v;
}

/** Validate a tip descriptor. percent values are basis points (1800 = 18%). */
export function validateTip(tip) {
  if (!tip || typeof tip !== 'object') fail('invalid_tip', 'tip must be { mode, value }');
  if (tip.mode === 'percent') {
    if (!Number.isInteger(tip.value) || tip.value < 0 || tip.value > LIMITS.maxTipBp) fail('invalid_tip', 'percent tip must be 0-10000 basis points');
  } else if (tip.mode === 'amount') {
    cents(tip.value, 'tip');
  } else {
    fail('invalid_tip', "tip.mode must be 'percent' or 'amount'");
  }
  return { mode: tip.mode, value: tip.value };
}

/** Validate and normalise a line item. */
export function validateItem(item) {
  if (!item || typeof item !== 'object') fail('invalid_item', 'item must be an object');
  const qty = item.qty ?? 1;
  if (!Number.isInteger(qty) || qty < 1 || qty > LIMITS.maxQty) fail('invalid_qty', `qty must be an integer 1-${LIMITS.maxQty}`);
  return { id: id(item.id), name: text(item.name, 'name', LIMITS.itemNameMax), unitCents: cents(item.unitCents, 'unitCents'), qty };
}

/** Validate and normalise a participant. */
export function validateParticipant(p) {
  if (!p || typeof p !== 'object') fail('invalid_participant', 'participant must be an object');
  const color = p.color ?? PARTICIPANT_COLORS[0];
  if (typeof color !== 'string' || !COLOR_RE.test(color)) fail('invalid_color', 'color must be #RRGGBB');
  return { id: id(p.id), name: text(p.name, 'name', LIMITS.participantNameMax), color };
}

/**
 * Build a fresh, validated bill state.
 * @param {{ id: string, title?: string, currency?: string, taxCents?: number, tip?: object, items?: object[] }} input
 */
export function createBill({ id: billId, title = '', currency = 'USD', taxCents = 0, tip = { mode: 'percent', value: 0 }, items = [] }) {
  if (!isCurrency(currency)) fail('invalid_currency', 'currency must be an ISO-4217 code');
  if (!Array.isArray(items) || items.length > LIMITS.maxItems) fail('invalid_items', `items must be an array of at most ${LIMITS.maxItems}`);
  const its = items.map(validateItem);
  if (new Set(its.map((i) => i.id)).size !== its.length) fail('duplicate_item', 'item ids must be unique');
  return {
    id: id(billId, 'billId'),
    title: text(title, 'title', LIMITS.titleMax, { allowEmpty: true }),
    currency,
    taxCents: cents(taxCents, 'taxCents'),
    tip: validateTip(tip),
    locked: false,
    version: 0,
    items: its,
    participants: [],
    claims: {},
  };
}

/**
 * Apply one op and return the next state (version + 1). Throws BillError on invalid ops.
 *
 * @param {object} state current bill state
 * @param {{ op: string, [k: string]: any }} op
 * @param {{ role?: 'host'|'participant'|'server', participantId?: string }} [ctx]
 *   role 'server' may do anything (used when replaying authoritative patches).
 *   participants may only claim/unclaim for themselves.
 */
export function applyOp(state, op, ctx = { role: 'server' }) {
  if (!op || typeof op !== 'object' || typeof op.op !== 'string') fail('invalid_op', 'op must be { op: string, ... }');
  const role = ctx.role ?? 'server';
  if (role === 'participant' && !PARTICIPANT_OPS.has(op.op)) fail('forbidden', `participants cannot ${op.op}`);
  if (role === 'host' && !HOST_OPS.has(op.op) && !PARTICIPANT_OPS.has(op.op)) fail('forbidden', `host cannot ${op.op}`);
  if (state.locked && !(op.op === 'bill.lock')) fail('bill_locked', 'the bill is locked');

  const next = { ...state, version: state.version + 1 };

  switch (op.op) {
    case 'bill.set': {
      if (op.title !== undefined) next.title = text(op.title, 'title', LIMITS.titleMax, { allowEmpty: true });
      if (op.currency !== undefined) {
        if (!isCurrency(op.currency)) fail('invalid_currency', 'currency must be an ISO-4217 code');
        next.currency = op.currency;
      }
      if (op.taxCents !== undefined) next.taxCents = cents(op.taxCents, 'taxCents');
      if (op.tip !== undefined) next.tip = validateTip(op.tip);
      return next;
    }
    case 'bill.lock': {
      if (typeof op.locked !== 'boolean') fail('invalid_locked', 'locked must be a boolean');
      next.locked = op.locked;
      return next;
    }
    case 'item.add': {
      const item = validateItem(op.item);
      if (state.items.length >= LIMITS.maxItems) fail('too_many_items', `at most ${LIMITS.maxItems} items`);
      if (state.items.some((i) => i.id === item.id)) fail('duplicate_item', 'item id already exists');
      const items = [...state.items];
      const at = op.index === undefined ? items.length : op.index;
      if (!Number.isInteger(at) || at < 0 || at > items.length) fail('invalid_index', 'index out of range');
      items.splice(at, 0, item);
      next.items = items;
      return next;
    }
    case 'item.update': {
      const idx = state.items.findIndex((i) => i.id === op.id);
      if (idx < 0) fail('item_not_found', 'no such item');
      const cur = state.items[idx];
      const merged = validateItem({
        id: cur.id,
        name: op.name !== undefined ? op.name : cur.name,
        unitCents: op.unitCents !== undefined ? op.unitCents : cur.unitCents,
        qty: op.qty !== undefined ? op.qty : cur.qty,
      });
      next.items = state.items.map((i, k) => (k === idx ? merged : i));
      return next;
    }
    case 'item.remove': {
      if (!state.items.some((i) => i.id === op.id)) fail('item_not_found', 'no such item');
      next.items = state.items.filter((i) => i.id !== op.id);
      const { [op.id]: _drop, ...rest } = state.claims;
      next.claims = rest;
      return next;
    }
    case 'participant.join': {
      const p = validateParticipant(op.participant);
      if (state.participants.length >= LIMITS.maxParticipants) fail('too_many_participants', `at most ${LIMITS.maxParticipants} participants`);
      if (state.participants.some((x) => x.id === p.id)) fail('duplicate_participant', 'participant already joined');
      const key = p.name.normalize('NFC').toLocaleLowerCase();
      if (state.participants.some((x) => x.name.normalize('NFC').toLocaleLowerCase() === key)) fail('duplicate_name', 'someone with that name already joined');
      next.participants = [...state.participants, p];
      return next;
    }
    case 'claim':
    case 'unclaim': {
      const pid = op.participantId;
      if (role === 'participant' && pid !== ctx.participantId) fail('forbidden', 'you can only claim for yourself');
      if (!state.participants.some((p) => p.id === pid)) fail('participant_not_found', 'no such participant');
      if (!state.items.some((i) => i.id === op.itemId)) fail('item_not_found', 'no such item');
      const cur = state.claims[op.itemId] ?? [];
      const has = cur.includes(pid);
      // Idempotent: claiming twice or unclaiming nothing is a no-op (no version bump).
      if ((op.op === 'claim' && has) || (op.op === 'unclaim' && !has)) return state;
      const list = op.op === 'claim' ? [...cur, pid] : cur.filter((x) => x !== pid);
      const claims = { ...state.claims };
      if (list.length) claims[op.itemId] = list; else delete claims[op.itemId];
      next.claims = claims;
      return next;
    }
    default:
      return fail('unknown_op', `unknown op ${op.op}`);
  }
}

/** Apply a list of ops in order (all-or-nothing, since it is pure). */
export function applyOps(state, ops, ctx) {
  if (!Array.isArray(ops) || ops.length === 0) fail('invalid_ops', 'ops must be a non-empty array');
  return ops.reduce((s, op) => applyOp(s, op, ctx), state);
}

/** Pick the next unused avatar colour. */
export function nextColor(state) {
  const used = new Set(state.participants.map((p) => p.color.toUpperCase()));
  return PARTICIPANT_COLORS.find((c) => !used.has(c)) ?? PARTICIPANT_COLORS[state.participants.length % PARTICIPANT_COLORS.length];
}

/**
 * Apply an authoritative server patch `{ version, op }` to a confirmed client state.
 * - 'applied': patch.version === state.version + 1
 * - 'stale':   already seen (version <= state.version), state unchanged
 * - 'gap':     missed patches; caller should request a fresh snapshot
 */
export function applyPatch(state, patch) {
  if (patch.version <= state.version) return { state, status: 'stale' };
  if (patch.version !== state.version + 1) return { state, status: 'gap' };
  const next = applyOp(state, patch.op, { role: 'server' });
  return { state: next === state ? { ...state, version: patch.version } : { ...next, version: patch.version }, status: 'applied' };
}

/**
 * Optimistic view: confirmed server state with the client's pending ops replayed on top.
 * Pending ops that no longer apply (e.g. item was removed) are dropped and returned as `rejected`.
 */
export function rebase(confirmed, pending) {
  let view = confirmed;
  const kept = [], rejected = [];
  for (const p of pending) {
    try { view = applyOp(view, p.op, p.ctx ?? { role: 'server' }); kept.push(p); } catch { rejected.push(p); }
  }
  return { view, pending: kept, rejected };
}
