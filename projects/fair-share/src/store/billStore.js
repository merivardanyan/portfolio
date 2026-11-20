import { create } from 'zustand';
import { newId } from '../../core/index.js';
import { api } from '../api/index.js';
import { forget, getIdentity, remember } from '../lib/identity.js';
import { derive, describeRejection, reduceMessage, toggleClaimOp } from '../lib/session.js';

const NOT_FOUND = 'This bill does not exist (or was created in another browser).';

const initial = {
  billId: null,
  confirmed: null,
  pending: [],
  syncing: false,
  view: null,
  split: null,
  status: 'idle',
  loadError: null,
  notice: null,
  me: null,
  authed: false,
  hostToken: null,
};

let conn = null;

export const useBillStore = create((set, get) => {
  function commitState(next) {
    const d = derive(next.confirmed, next.pending);
    const notice = d.rejected.length
      ? { kind: 'error', text: 'Some of your changes no longer applied and were undone.' }
      : next.notice;
    set({ ...next, pending: d.pending, view: d.view, split: d.split, notice });
  }

  function sendAuth() {
    const { billId, me } = get();
    const { participantToken } = getIdentity(billId);
    if (me && participantToken) conn?.send({ type: 'auth', participantId: me, token: participantToken, reqId: `auth-${newId(6)}` });
  }

  function onMessage(msg) {
    const s = get();
    if (msg.type === 'authed') {
      set({ authed: true });
      return;
    }
    if (msg.type === 'error' && msg.code === 'invalid_token') {
      forget(s.billId, ['participantId', 'participantToken']);
      commitState({
        confirmed: s.confirmed,
        pending: s.pending.filter((p) => p.via !== 'ws'),
        me: null,
        authed: false,
        notice: { kind: 'error', text: 'Your seat on this bill is no longer valid in this browser. Join again to keep claiming.' },
      });
      return;
    }
    if (msg.type === 'error' && msg.code === 'not_found' && !s.confirmed) {
      set({ loadError: NOT_FOUND, status: 'error' });
      return;
    }

    const r = reduceMessage({ confirmed: s.confirmed, pending: s.pending, syncing: s.syncing }, msg);
    commitState({
      confirmed: r.confirmed,
      pending: r.pending,
      syncing: r.syncing,
      notice: r.error ? { kind: 'error', text: describeRejection(r.error, s.view) } : get().notice,
    });
    if (r.sendSync) conn?.send({ type: 'sync' });
    if (r.resend) {
      sendAuth();
      for (const p of get().pending) {
        if (p.via === 'ws') conn?.send({ type: p.op.op, itemId: p.op.itemId, reqId: p.reqId });
      }
    }
    const view = get().view;
    if (view) remember(view.id, { title: view.title });
  }

  function connect(billId) {
    conn?.close();
    conn = api.connect(billId, { onMessage, onStatus: (status) => set({ status }) });
  }

  return {
    ...initial,

    open(billId) {
      const ident = getIdentity(billId);
      conn?.close();
      conn = null;
      set({
        ...initial,
        billId,
        me: ident.participantId && ident.participantToken ? ident.participantId : null,
        hostToken: ident.hostToken ?? null,
        status: 'connecting',
      });
      api
        .getBill(billId)
        .then(({ bill }) => {
          if (get().billId !== billId) return;
          if (get().me && !bill.participants.some((p) => p.id === get().me)) set({ me: null });
          if (!get().confirmed) commitState({ confirmed: bill, pending: get().pending, notice: null });
          remember(billId, { title: bill.title });
          connect(billId);
        })
        .catch((err) => {
          if (get().billId !== billId) return;
          set({ status: 'error', loadError: err.status === 404 ? NOT_FOUND : err.message });
        });
    },

    close() {
      conn?.close();
      conn = null;
      set({ ...initial });
    },

    toggleClaim(itemId) {
      const { view, me, pending, confirmed, syncing } = get();
      if (!view || !me || view.locked) return;
      const op = toggleClaimOp(view, itemId, me);
      const reqId = newId(10);
      commitState({
        confirmed,
        syncing,
        pending: [...pending, { reqId, op, ctx: { role: 'participant', participantId: me }, via: 'ws' }],
        notice: null,
      });
      conn?.send({ type: op.op, itemId, reqId });
    },

    async hostOps(ops) {
      const { billId, hostToken } = get();
      if (!hostToken) return false;
      const entries = ops.map((op) => ({ reqId: newId(10), op, ctx: { role: 'host' }, via: 'rest' }));
      const ids = new Set(entries.map((e) => e.reqId));
      commitState({ confirmed: get().confirmed, pending: [...get().pending, ...entries], notice: null });
      const without = () => get().pending.filter((p) => !ids.has(p.reqId));
      try {
        const { bill } = await api.patchBill(billId, hostToken, entries);
        const current = get().confirmed;
        commitState({
          confirmed: !current || bill.version > current.version ? bill : current,
          pending: without(),
          notice: get().notice,
        });
        return true;
      } catch (err) {
        commitState({ confirmed: get().confirmed, pending: without(), notice: { kind: 'error', text: err.message } });
        return false;
      }
    },

    async join(name, color) {
      const { billId } = get();
      try {
        const { participantId, participantToken } = await api.join(billId, { name, color, reqId: `join-${newId(6)}` });
        remember(billId, { participantId, participantToken });
        set({ me: participantId, authed: false });
        sendAuth();
        return true;
      } catch (err) {
        set({ notice: { kind: 'error', text: err.message } });
        return false;
      }
    },

    dismissNotice() {
      set({ notice: null });
    },
  };
});
