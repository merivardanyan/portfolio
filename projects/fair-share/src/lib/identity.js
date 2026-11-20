import { api } from '../api/index.js';

const KEY = 'fair-share:identity:v1';
const SEAT_KEYS = ['participantId', 'participantToken'];

// In the static demo every tab is its own person (seats live in sessionStorage), so two tabs
// can join the same bill as different people. With a real server, seats persist per browser.
function seatStorage() {
  const tabScoped = api.name === 'local' && typeof sessionStorage !== 'undefined';
  return tabScoped ? sessionStorage : globalThis.localStorage;
}

function read(storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage.getItem(KEY)) ?? { bills: {} };
  } catch {
    return { bills: {} };
  }
}

function write(data, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable */
  }
}

const pick = (obj, keys, keep) =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => keys.includes(k) === keep));

export function getIdentity(billId) {
  const shared = pick(read().bills[billId] ?? {}, SEAT_KEYS, false);
  const seat = pick(read(seatStorage()).bills[billId] ?? {}, SEAT_KEYS, true);
  return { ...shared, ...seat };
}

export function remember(billId, patch) {
  const seatPatch = pick(patch, SEAT_KEYS, true);
  const sharedPatch = pick(patch, SEAT_KEYS, false);
  const data = read();
  data.bills[billId] = { ...data.bills[billId], ...sharedPatch, seenAt: Date.now() };
  write(data);
  if (Object.keys(seatPatch).length) {
    const seats = read(seatStorage());
    seats.bills[billId] = { ...seats.bills[billId], ...seatPatch };
    write(seats, seatStorage());
  }
}

export function forget(billId, keys) {
  for (const storage of new Set([globalThis.localStorage, seatStorage()])) {
    const data = read(storage);
    if (!data.bills[billId]) continue;
    const entry = { ...data.bills[billId] };
    for (const k of keys) delete entry[k];
    data.bills[billId] = entry;
    write(data, storage);
  }
}

export function recentBills(limit = 6) {
  return Object.entries(read().bills)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.seenAt - a.seenAt)
    .slice(0, limit);
}
