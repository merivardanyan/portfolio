import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import {
  createBill, applyOp, nextColor, newId, newBillId, BillError, BILL_ID_RE, HOST_OPS, PARTICIPANT_OPS,
} from '../../core/bill.js';
import { computeSplit } from '../../core/split.js';
import { createStore, ConflictError } from './db.js';
import { sha256, newToken, tokenMatches, TOKEN_RE } from './crypto.js';
import { HttpError, applyCors, clientIp, createLimiter, createRouter, readJson, sendError, sendJson } from './http.js';

const created = (body) => ({ status: 201, body });
const REQ_ID_RE = /^[\w.:-]{1,64}$/;
const MAX_AUTH_FAILURES = 5;

/** Accept a client-chosen request id (string <= 64 chars or safe integer) so it can be echoed back. */
function readReqId(v) {
  if (Number.isSafeInteger(v)) return v;
  if (typeof v === 'string' && REQ_ID_RE.test(v)) return v;
  return undefined;
}

/** Map core BillError codes to HTTP statuses. */
function billErrorToHttp(e) {
  const status = e.code === 'forbidden' ? 403
    : e.code === 'bill_locked' || e.code.startsWith('duplicate_') ? 409
      : e.code.endsWith('_not_found') ? 404
        : 422;
  return new HttpError(status, e.code, e.message);
}

const asHttp = (e) => {
  if (e instanceof BillError) return billErrorToHttp(e);
  if (e instanceof ConflictError) return new HttpError(409, 'conflict', 'The bill changed underneath this request; resync and retry');
  return e;
};

/** Canonical op to broadcast: values as normalised by the reducer, never raw client input. */
function canonicalOp(op, next) {
  switch (op.op) {
    case 'bill.set': return { op: 'bill.set', title: next.title, currency: next.currency, taxCents: next.taxCents, tip: next.tip };
    case 'bill.lock': return { op: 'bill.lock', locked: next.locked };
    case 'item.add': {
      const index = next.items.findIndex((i) => i.id === op.item.id);
      return { op: 'item.add', item: next.items[index], index };
    }
    case 'item.update': {
      const it = next.items.find((i) => i.id === op.id);
      return { op: 'item.update', id: it.id, name: it.name, unitCents: it.unitCents, qty: it.qty };
    }
    case 'item.remove': return { op: 'item.remove', id: op.id };
    case 'participant.join': return { op: 'participant.join', participant: next.participants[next.participants.length - 1] };
    default: return { op: op.op, itemId: op.itemId, participantId: op.participantId };
  }
}

/**
 * @param {{ db: import('node:sqlite').DatabaseSync, corsOrigin?: string, trustProxy?: boolean,
 *           limits?: { createPerMin?: number, joinPerMin?: number, readPerMin?: number, wsMsgsPer5s?: number },
 *           heartbeatMs?: number, log?: (msg: string) => void }} opts
 */
export function createApp({ db, corsOrigin = '*', trustProxy = false, limits = {}, heartbeatMs = 30_000, log = (m) => console.warn(m) }) {
  const store = createStore(db);
  const router = createRouter();
  const limitCreate = createLimiter({ limit: limits.createPerMin ?? 10, windowMs: 60_000 });
  const limitJoin = createLimiter({ limit: limits.joinPerMin ?? 30, windowMs: 60_000 });
  const limitRead = createLimiter({ limit: limits.readPerMin ?? 300, windowMs: 60_000 });
  const wsMsgLimit = limits.wsMsgsPer5s ?? 40;

  /** billId -> Set<WebSocket> */
  const rooms = new Map();
  /** billId -> state (only cached while a room is open) */
  const cache = new Map();

  function getState(id) {
    if (!BILL_ID_RE.test(id)) throw new HttpError(404, 'bill_not_found', 'No such bill');
    const st = cache.get(id) ?? store.load(id);
    if (!st) throw new HttpError(404, 'bill_not_found', 'No such bill');
    if (rooms.has(id)) cache.set(id, st);
    return st;
  }

  function broadcast(id, msg) {
    const room = rooms.get(id);
    if (!room) return;
    const data = JSON.stringify(msg);
    for (const ws of room) if (ws.readyState === 1) ws.send(data);
  }

  /**
   * The one write path. Entries are `{ op, ctx, reqId?, extra? }`.
   * 1. run every op through the pure reducer (validates + authorises; any error aborts the batch)
   * 2. persist all effective steps in ONE transaction with a version check
   * 3. update the cache, then broadcast one `patch` per step, echoing its reqId
   * node:sqlite is synchronous, so writes to a bill are serialised within this process.
   */
  function commit(id, entries) {
    const start = getState(id);
    let state = start;
    const steps = [];
    const noops = [];
    try {
      for (const e of entries) {
        const next = applyOp(state, e.op, e.ctx);
        if (next === state) { noops.push(e.reqId); continue; }
        steps.push({ op: e.op, next, extra: e.extra, reqId: e.reqId });
        state = next;
      }
      store.persistSteps(start, steps);
    } catch (e) {
      if (e instanceof ConflictError) cache.delete(id); // reload from the DB on the next request
      throw asHttp(e);
    }
    if (rooms.has(id)) cache.set(id, state);
    for (const st of steps) {
      const patch = { type: 'patch', version: st.next.version, op: canonicalOp(st.op, st.next) };
      if (st.reqId !== undefined) patch.reqId = st.reqId;
      broadcast(id, patch);
    }
    return {
      state,
      applied: steps.map((s) => ({ reqId: s.reqId, version: s.next.version })),
      noops: noops.filter((r) => r !== undefined),
    };
  }

  function requireHost(req, id) {
    const m = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
    const hash = store.hostTokenHash(id);
    if (!hash) throw new HttpError(404, 'bill_not_found', 'No such bill');
    if (!m || !TOKEN_RE.test(m[1])) throw new HttpError(401, 'unauthorized', 'Missing or malformed host token');
    if (!tokenMatches(m[1], hash)) throw new HttpError(403, 'forbidden', 'Invalid host token');
  }

  const object = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_body', 'Expected a JSON object');
    return body;
  };

  router.get('/api/health', () => ({ ok: true }));

  router.post('/api/bills', async (req) => {
    limitCreate(clientIp(req, trustProxy));
    const body = object(await readJson(req, 64 * 1024));
    const items = body.items ?? [];
    if (!Array.isArray(items)) throw new HttpError(422, 'invalid_items', 'items must be an array');
    let state;
    try {
      state = createBill({
        id: newBillId(), title: body.title ?? '', currency: body.currency ?? 'USD', taxCents: body.taxCents ?? 0,
        tip: body.tip ?? { mode: 'percent', value: 0 },
        items: items.map((it) => ({ ...(it && typeof it === 'object' ? it : {}), id: newId() })),
      });
    } catch (e) { throw asHttp(e); }
    const hostToken = newToken();
    store.create(state, sha256(hostToken));
    return created({ id: state.id, hostToken, bill: state });
  });

  router.get('/api/bills/:id', (req, { id }) => {
    limitRead(clientIp(req, trustProxy));
    const bill = getState(id);
    return { bill, split: computeSplit(bill) };
  });

  router.patch('/api/bills/:id', async (req, { id }) => {
    requireHost(req, id);
    const body = object(await readJson(req, 64 * 1024));
    const ops = body.ops;
    if (!Array.isArray(ops) || ops.length === 0 || ops.length > 100) throw new HttpError(400, 'invalid_ops', 'ops must be an array of 1-100 ops');
    const entries = ops.map((raw) => {
      if (!raw || typeof raw !== 'object' || !(HOST_OPS.has(raw.op) || PARTICIPANT_OPS.has(raw.op))) {
        throw new HttpError(400, 'invalid_op', `unsupported op ${raw?.op}`);
      }
      const { reqId, ...op } = raw;
      if (reqId !== undefined && readReqId(reqId) === undefined) throw new HttpError(400, 'invalid_req_id', 'reqId must be a short string or integer');
      return { op, ctx: { role: 'host' }, reqId };
    });
    const r = commit(id, entries);
    return { version: r.state.version, bill: r.state, applied: r.applied, noops: r.noops };
  });

  router.post('/api/bills/:id/participants', async (req, { id }) => {
    limitJoin(clientIp(req, trustProxy));
    const body = object(await readJson(req));
    const state = getState(id);
    const participant = { id: newId(), name: body.name, color: body.color ?? nextColor(state) };
    const participantToken = newToken();
    const r = commit(id, [{
      op: { op: 'participant.join', participant }, ctx: { role: 'server' },
      reqId: readReqId(body.reqId), extra: { tokenHash: sha256(participantToken) },
    }]);
    // The token is returned exactly once and never broadcast; only its hash is stored.
    return created({ participantId: participant.id, participantToken, participant: r.state.participants.at(-1), version: r.state.version });
  });

  async function handler(req, res) {
    try {
      applyCors(req, res, corsOrigin);
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      const url = new URL(req.url, 'http://localhost');
      const { handler: h, params } = router.match(req.method, url.pathname);
      const out = await h(req, params, url);
      if (out && out.status === 201 && 'body' in out) sendJson(res, 201, out.body); else sendJson(res, 200, out);
    } catch (err) {
      sendError(res, err);
    }
  }

  // ---------------- WebSocket ----------------
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  wss.on('error', (err) => log(`ws server error: ${err.message}`));
  const allowedOrigins = String(corsOrigin).split(',').map((s) => s.trim());

  function rejectUpgrade(socket, status, text) {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  }

  function onUpgrade(req, socket, head) {
    socket.on('error', () => socket.destroy()); // never let a raw socket error escape
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return rejectUpgrade(socket, 400, 'Bad Request'); }
    if (url.pathname !== '/ws') return rejectUpgrade(socket, 404, 'Not Found');
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes('*') && !allowedOrigins.includes(origin)) return rejectUpgrade(socket, 403, 'Forbidden');
    const billId = url.searchParams.get('bill') ?? '';
    try { getState(billId); } catch { return rejectUpgrade(socket, 404, 'Not Found'); }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, billId));
  }

  function onConnection(ws, billId) {
    if (!rooms.has(billId)) rooms.set(billId, new Set());
    rooms.get(billId).add(ws);
    ws.isAlive = true;
    ws.participantId = null; // spectator until a successful `auth`
    let authFailures = 0;

    // Frame-level errors (oversized frame, bad opcode, invalid UTF-8...). `ws` has already sent
    // a close frame with the right code (1009 too big, 1002 protocol, 1007 bad data); we just
    // make sure the error never becomes an uncaught exception and the socket really goes away.
    ws.on('error', (err) => {
      log(`ws client error on bill ${billId}: ${err.code ?? ''} ${err.message}`);
      if (ws.readyState === 1) ws.close(1011, 'error');
      setTimeout(() => { if (ws.readyState !== 3) ws.terminate(); }, 1000).unref();
    });
    ws.on('pong', () => { ws.isAlive = true; });
    const send = (msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
    const snapshot = () => { const bill = getState(billId); send({ type: 'snapshot', version: bill.version, bill }); };
    snapshot();

    let windowStart = Date.now(), count = 0;
    ws.on('message', (data, isBinary) => {
      let msg = null;
      try { msg = isBinary ? null : JSON.parse(data.toString('utf8')); } catch { msg = null; }
      const reqId = msg && typeof msg === 'object' ? readReqId(msg.reqId) : undefined;
      const fail = (code, message) => send(reqId === undefined ? { type: 'error', code, message } : { type: 'error', reqId, code, message });

      // Rate limit after parsing so the rejection can carry the reqId of the dropped op.
      const now = Date.now();
      if (now - windowStart > 5000) { windowStart = now; count = 0; }
      if (++count > wsMsgLimit) return fail('rate_limited', 'Too many messages; slow down and resync');

      if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.type !== 'string') {
        return fail('invalid_message', 'Expected a JSON object with a type');
      }
      try {
        switch (msg.type) {
          case 'ping': return send({ type: 'pong', t: typeof msg.t === 'number' ? msg.t : undefined });
          case 'sync': return snapshot();
          case 'auth': {
            const pid = typeof msg.participantId === 'string' ? msg.participantId : '';
            const ok = /^[A-Za-z0-9_-]{1,40}$/.test(pid) && tokenMatches(msg.token, store.participantTokenHash(billId, pid));
            if (!ok) {
              if (++authFailures >= MAX_AUTH_FAILURES) ws.close(1008, 'too many auth failures');
              return fail('invalid_token', 'Unknown participant or wrong participant token');
            }
            ws.participantId = pid;
            return send(reqId === undefined ? { type: 'authed', participantId: pid } : { type: 'authed', participantId: pid, reqId });
          }
          case 'claim':
          case 'unclaim': {
            if (!ws.participantId) throw new HttpError(403, 'forbidden', 'Send { type: "auth", participantId, token } before claiming');
            const r = commit(billId, [{
              op: { op: msg.type, itemId: msg.itemId, participantId: ws.participantId },
              ctx: { role: 'participant', participantId: ws.participantId }, reqId,
            }]);
            if (!r.applied.length) send({ type: 'ack', reqId, version: r.state.version }); // valid no-op: nothing broadcast
            return undefined;
          }
          default: throw new HttpError(400, 'unknown_type', `Unknown message type ${msg.type}`);
        }
      } catch (e) {
        if (!(e instanceof HttpError)) log(`ws handler error: ${e.stack ?? e}`);
        return fail(e instanceof HttpError ? e.code : 'internal', e instanceof HttpError ? e.message : 'Internal error');
      }
    });
    ws.on('close', () => {
      const room = rooms.get(billId);
      room?.delete(ws);
      if (room && room.size === 0) { rooms.delete(billId); cache.delete(billId); }
    });
  }

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  function close() {
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  }

  return { handler, onUpgrade, close, rooms };
}

export function createHttpServer(opts) {
  const app = createApp(opts);
  const server = createServer(app.handler);
  server.on('upgrade', app.onUpgrade);
  const origClose = server.close.bind(server);
  server.close = (cb) => { app.close(); return origClose(cb); };
  server.app = app;
  return server;
}
