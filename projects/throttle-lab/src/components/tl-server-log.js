import { ALGO_INFO } from '../sim.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

class TlServerLog extends HTMLElement {
  #rows = []

  connectedCallback() {
    if (this.dataset.ready) return
    this.dataset.ready = '1'
    this.innerHTML = `
      <section class="server-log" aria-labelledby="server-log-h">
        <h2 id="server-log-h">${esc(this.getAttribute('heading'))}</h2>
        <p class="hint">The same requests, sent through the API adapter (${esc(this.getAttribute('label'))}) with client key <code>${esc(this.getAttribute('key'))}</code>, on the real clock.</p>
        <ol class="server-log__list" aria-live="polite"></ol>
      </section>`
  }

  add(entry) {
    this.#rows.unshift(entry)
    this.#rows = this.#rows.slice(0, 12)
    this.querySelector('ol').innerHTML = this.#rows.map((r) => `
      <li class="${r.status === 429 ? 'no' : r.status === 200 ? 'ok' : ''}">
        <span class="mono">${esc(r.status ?? 'ERR')}</span>
        <span>${esc(ALGO_INFO[r.algo]?.label ?? r.algo)}</span>
        <span class="mono">${r.remaining !== null && r.remaining !== undefined ? `remaining ${esc(r.remaining)}` : ''}${r.retryAfterSec ? ` · Retry-After ${esc(r.retryAfterSec)}s` : ''}</span>
        ${r.message ? `<span class="server-log__msg">${esc(r.message)}</span>` : ''}
      </li>`).join('')
  }
}

customElements.define('tl-server-log', TlServerLog)
