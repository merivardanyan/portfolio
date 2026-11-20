import { ApiError } from './errors.js';

export function createHttpAdapter(baseUrl) {
  const root = baseUrl.replace(/\/$/, '');
  const wsRoot = (root || globalThis.location?.origin || '').replace(/^http/, 'ws');

  async function request(path, { method = 'GET', body, token } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(`${root}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, 'network', 'Network error: the server is unreachable');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = data.error ?? {};
      throw new ApiError(res.status, e.code ?? 'http_error', e.message ?? `Request failed (${res.status})`, e.details);
    }
    return data;
  }

  return {
    name: 'http',

    createBill: (input) => request('/api/bills', { method: 'POST', body: input }),
    getBill: (id) => request(`/api/bills/${encodeURIComponent(id)}`),
    patchBill: (id, token, entries) =>
      request(`/api/bills/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { ops: entries.map(({ reqId, op }) => ({ ...op, reqId })) },
        token,
      }),
    join: (id, participant) =>
      request(`/api/bills/${encodeURIComponent(id)}/participants`, { method: 'POST', body: participant }),

    connect(id, { onMessage, onStatus }) {
      let ws;
      let closed = false;
      let attempt = 0;
      let timer;

      const open = () => {
        onStatus(attempt === 0 ? 'connecting' : 'reconnecting');
        ws = new WebSocket(`${wsRoot}/ws?${new URLSearchParams({ bill: id })}`);
        ws.onopen = () => {
          attempt = 0;
          onStatus('live');
        };
        ws.onmessage = (e) => {
          try {
            onMessage(JSON.parse(e.data));
          } catch {
            /* ignore malformed frames */
          }
        };
        ws.onclose = () => {
          if (closed) return;
          onStatus(navigator.onLine === false ? 'offline' : 'reconnecting');
          const delay = Math.min(10000, 500 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
          attempt++;
          timer = setTimeout(open, delay);
        };
      };
      open();

      return {
        send(msg) {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
        },
        close() {
          closed = true;
          clearTimeout(timer);
          ws?.close();
        },
      };
    },
  };
}
