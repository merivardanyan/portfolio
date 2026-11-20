import { LIMITS, SPEEDS } from '../scenario.js'

const range = (name, l) => `min="${l.min}" max="${l.max}" step="${l.step}" name="${name}"`

class TlControls extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return
    this.dataset.ready = '1'
    const server = this.getAttribute('server')
    this.innerHTML = `
      <form class="controls" novalidate>
        <fieldset class="group">
          <legend>Traffic</legend>
          <div class="row">
            <button type="button" class="btn btn--primary" data-act="fire">Send 1 request</button>
          </div>
          <div class="row">
            <button type="button" class="btn" data-act="burst">Burst</button>
            <label class="inline">× <span class="vh">requests per burst</span><input type="number" inputmode="numeric" ${range('burst', LIMITS.burst)} class="num"></label>
          </div>
          <div class="seg" role="radiogroup" aria-label="Background traffic">
            <label><input type="radio" name="traffic" value="off"><span>Off</span></label>
            <label><input type="radio" name="traffic" value="steady"><span>Steady</span></label>
            <label><input type="radio" name="traffic" value="poisson"><span>Realistic</span></label>
          </div>
          <label class="field">
            <span>Rate <output data-out="rate"></output></span>
            <input type="range" ${range('rate', LIMITS.rate)}>
          </label>
          <p class="hint">Realistic = Poisson arrivals: random gaps that average the chosen rate.</p>
        </fieldset>

        <fieldset class="group">
          <legend>Simulated clock</legend>
          <p class="clock" aria-live="off"><span class="vh">Simulated time </span><output data-out="time">0.000 s</output></p>
          <div class="row">
            <button type="button" class="btn" data-act="pause" aria-pressed="false">Pause</button>
            <button type="button" class="btn" data-act="step" data-ms="100">+100 ms</button>
            <button type="button" class="btn" data-act="step" data-ms="1000">+1 s</button>
          </div>
          <label class="field field--inline">
            <span>Speed</span>
            <select name="speed">${SPEEDS.map((s) => `<option value="${s}">${s}×</option>`).join('')}</select>
          </label>
        </fieldset>

        <fieldset class="group">
          <legend>Limits (all lanes)</legend>
          <label class="field field--inline"><span>Limit / capacity</span><input type="number" class="num" ${range('limit', LIMITS.limit)}></label>
          <label class="field field--inline"><span>Window (s)</span><input type="number" class="num" ${range('windowSec', LIMITS.windowSec)}></label>
          <label class="field field--inline"><span>Refill (tokens/s)</span><input type="number" class="num" ${range('refillPerSec', LIMITS.refillPerSec)}></label>
          <p class="error" role="alert" data-error hidden></p>
        </fieldset>

        <fieldset class="group">
          <legend>Scenarios</legend>
          <button type="button" class="btn btn--accent" data-act="boundary">Play: burst at a window boundary</button>
          <div class="row">
            <button type="button" class="btn" data-act="copy">Copy link to this setup</button>
            <button type="button" class="btn" data-act="reset">Reset</button>
          </div>
          ${server ? `<label class="check"><input type="checkbox" name="server"> ${server}</label>` : ''}
        </fieldset>
      </form>`
    this.form = this.querySelector('form')
    this.form.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]')
      if (!btn) return
      const act = btn.dataset.act
      if (act === 'step') this.#emit('step', { ms: Number(btn.dataset.ms) })
      else if (act === 'burst') this.#emit('fire', { count: Number(this.form.burst.value) })
      else if (act === 'fire') this.#emit('fire', { count: 1 })
      else this.#emit(act)
    })
    this.form.addEventListener('input', (e) => {
      const t = e.target
      if (t.name === 'rate') {
        this.#out('rate', `${t.value} req/s`)
        this.#emit('traffic', { rate: Number(t.value) })
      }
    })
    this.form.addEventListener('change', (e) => {
      const t = e.target
      if (t.name === 'traffic') this.#emit('traffic', { mode: t.value })
      else if (t.name === 'speed') this.#emit('speed', { speed: Number(t.value) })
      else if (t.name === 'burst') this.#emit('burst-size', { burst: Number(t.value) })
      else if (['limit', 'windowSec', 'refillPerSec'].includes(t.name)) {
        if (!t.checkValidity() || t.value === '') return this.showError(`${t.closest('label').querySelector('span').textContent}: enter ${t.min} to ${t.max}.`)
        this.showError('')
        this.#emit('config', { [t.name]: Number(t.value) })
      } else if (t.name === 'server') this.#emit('server', { on: t.checked })
    })
    this.form.addEventListener('submit', (e) => e.preventDefault())
  }

  sync(s, paused) {
    const f = this.form
    f.burst.value = s.burst
    f.rate.value = s.rate
    this.#out('rate', `${s.rate} req/s`)
    for (const r of f.querySelectorAll('[name="traffic"]')) r.checked = r.value === s.traffic
    f.speed.value = String(s.speed)
    f.limit.value = s.limit
    f.windowSec.value = s.windowSec
    f.refillPerSec.value = s.refillPerSec
    this.setPaused(paused)
  }

  setPaused(paused) {
    const b = this.querySelector('[data-act="pause"]')
    b.setAttribute('aria-pressed', String(paused))
    b.textContent = paused ? 'Resume' : 'Pause'
  }

  setTime(ms) {
    this.#out('time', `${(ms / 1000).toFixed(3)} s`)
  }

  showError(msg) {
    const el = this.querySelector('[data-error]')
    el.textContent = msg
    el.hidden = !msg
  }

  #out(name, text) {
    const o = this.querySelector(`[data-out="${name}"]`)
    if (o.textContent !== text) o.textContent = text
  }

  #emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent('tl-action', { bubbles: true, detail: { type, ...detail } }))
  }
}

customElements.define('tl-controls', TlControls)
