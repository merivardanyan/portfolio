import { ALGO_INFO } from '../sim.js'
import { drawInternals, drawTimeline } from '../draw.js'

const HINT = 'Click a red dot to see why it was denied. Keyboard: focus the timeline, then use ←/→ (Shift jumps between denials).'

class TlLane extends HTMLElement {
  #selectedId = null
  #targets = []
  #lastText = 0
  #last = null

  connectedCallback() {
    if (this.dataset.ready) return
    this.dataset.ready = '1'
    const algo = this.getAttribute('algo')
    const info = ALGO_INFO[algo]
    const id = `lane-${algo}`
    this.innerHTML = `
      <article class="lane" aria-labelledby="${id}">
        <header class="lane__head">
          <h2 id="${id}">${info.label}</h2>
          <dl class="lane__stats">
            <div><dt>Allowed</dt><dd class="ok" data-ok>0</dd></div>
            <div><dt>Denied</dt><dd class="no" data-no>0</dd></div>
            <div><dt>Remaining</dt><dd data-rem>–</dd></div>
          </dl>
        </header>
        <p class="lane__blurb">${info.blurb}</p>
        <canvas class="lane__internals" role="img" aria-label="${info.label} internals"></canvas>
        <p class="lane__readout" data-readout></p>
        <canvas class="lane__timeline" tabindex="0" role="group" aria-roledescription="request timeline"
          aria-label="${info.label} request timeline, last 20 seconds. Use arrow keys to step through requests." aria-describedby="${id}-explain"></canvas>
        <p class="lane__explain" id="${id}-explain" aria-live="polite" data-explain>${HINT}</p>
      </article>`
    this.timeline = this.querySelector('.lane__timeline')
    this.internals = this.querySelector('.lane__internals')
    this.timeline.addEventListener('click', (e) => this.#pick(e))
    this.timeline.addEventListener('keydown', (e) => this.#key(e))
  }

  get algo() {
    return this.getAttribute('algo')
  }

  render({ sim, reducedMotion, force = false }) {
    const now = sim.now
    const events = sim.events(this.algo)
    const view = sim.inspect(this.algo)
    this.#last = events
    if (this.#selectedId !== null && !events.some((e) => e.id === this.#selectedId)) this.select(null)
    drawInternals(this.internals, view, now)
    this.#targets = drawTimeline(this.timeline, {
      events, now, cfg: sim.config, algo: this.algo, selectedId: this.#selectedId, reducedMotion,
    })
    const t = performance.now()
    if (force || t - this.#lastText > 200) {
      this.#lastText = t
      const totals = sim.totals(this.algo)
      this.querySelector('[data-ok]').textContent = totals.allowed
      this.querySelector('[data-no]').textContent = totals.denied
      this.querySelector('[data-rem]').textContent = view.remaining
      this.querySelector('[data-readout]').textContent = readout(view, now)
    }
  }

  select(id) {
    this.#selectedId = id
    const el = this.querySelector('[data-explain]')
    const e = this.#last?.find((x) => x.id === id)
    el.classList.toggle('is-denied', !!e && !e.allowed)
    el.textContent = e ? `Request #${e.id} at ${(e.t / 1000).toFixed(3)} s: ${e.text}` : HINT
  }

  selectLatestDenied() {
    const list = [...(this.#last ?? [])].reverse()
    const e = list.find((x) => !x.allowed) ?? list[0]
    if (e) this.select(e.id)
  }

  #pick(ev) {
    const r = this.timeline.getBoundingClientRect()
    const x = ev.clientX - r.left
    const y = ev.clientY - r.top
    let best = null
    let bestD = 14
    for (const t of this.#targets) {
      const d = Math.hypot(t.x - x, t.y - y)
      if (d < bestD) { best = t; bestD = d }
    }
    this.select(best ? best.id : null)
  }

  #key(ev) {
    const list = (this.#last ?? []).filter((e) => !ev.shiftKey || !e.allowed)
    if (!list.length) return
    const idx = list.findIndex((e) => e.id === this.#selectedId)
    let next = null
    if (ev.key === 'ArrowLeft') next = idx === -1 ? list.length - 1 : Math.max(0, idx - 1)
    else if (ev.key === 'ArrowRight') next = idx === -1 ? list.length - 1 : Math.min(list.length - 1, idx + 1)
    else if (ev.key === 'Home') next = 0
    else if (ev.key === 'End') next = list.length - 1
    else if (ev.key === 'Escape') { this.select(null); return }
    else return
    ev.preventDefault()
    this.select(list[next].id)
  }
}

function readout(v, now) {
  switch (v.algo) {
    case 'fixedWindow': return `count ${v.count}/${v.limit} in window [${v.windowStart / 1000}s, ${v.windowEnd / 1000}s), resets in ${((v.windowEnd - now) / 1000).toFixed(1)} s`
    case 'slidingLog': return `${v.count}/${v.limit} timestamps inside (now − ${v.windowMs / 1000}s, now]`
    case 'slidingCounter': return `previous ${v.previousCount} × ${(v.previousWeight * 100).toFixed(0)}% + current ${v.currentCount} = ${v.estimate.toFixed(2)} of ${v.limit}`
    case 'tokenBucket': return `${v.tokens.toFixed(2)} of ${v.capacity} tokens, +${v.refillPerSec}/s${v.nextTokenInMs ? `, next in ${(v.nextTokenInMs / 1000).toFixed(1)} s` : ''}`
    default: return ''
  }
}

customElements.define('tl-lane', TlLane)
