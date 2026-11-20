import './styles.css'
import './components/tl-lane.js'
import './components/tl-controls.js'
import './components/tl-server-log.js'
import { createSim, runBoundaryBurst, ALGOS, ALGO_INFO, DEFAULT_CONFIG } from './sim.js'
import { decodeScenario, encodeScenario, toLimiterConfig } from './scenario.js'
import { api } from './api/index.js'

const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const live = document.getElementById('live')
const story = document.getElementById('story')
const controls = document.createElement('tl-controls')
const lanesEl = document.getElementById('lanes')

let scenario = decodeScenario(location.hash)
const sim = createSim({ config: toLimiterConfig(scenario) })
sim.setTraffic({ mode: scenario.traffic, rate: scenario.rate })
let paused = false
let serverOn = false
let serverLog = null

controls.setAttribute('server', api.mode === 'http' ? 'Also hit the real server' : 'Also send to the API (in-browser emulation)')
document.getElementById('controls-slot').replaceWith(controls)

serverLog = document.createElement('tl-server-log')
serverLog.setAttribute('heading', api.mode === 'http' ? 'Real server responses' : 'API responses (in-browser emulation)')
serverLog.setAttribute('label', api.label)
serverLog.setAttribute('key', api.key)
serverLog.hidden = true
document.getElementById('server-slot').append(serverLog)

const lanes = ALGOS.map((algo) => {
  const lane = document.createElement('tl-lane')
  lane.setAttribute('algo', algo)
  lanesEl.append(lane)
  return lane
})

function announce(msg) {
  live.textContent = ''
  requestAnimationFrame(() => { live.textContent = msg })
}

function saveScenario() {
  const hash = encodeScenario(scenario)
  history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search)
}

function setStory(text) {
  story.textContent = text
  story.hidden = !text
}

function renderAll(force = false) {
  for (const lane of lanes) lane.render({ sim, reducedMotion: reduced.matches, force })
  controls.setTime(sim.now)
}

function summarize(created) {
  const parts = ALGOS.map((algo) => {
    const mine = created.filter((e) => e.algo === algo)
    const ok = mine.filter((e) => e.allowed).length
    return `${ALGO_INFO[algo].label} ${ok}/${mine.length}`
  })
  return `Allowed: ${parts.join(', ')}.`
}

async function hitServer(count) {
  if (!serverOn) return
  for (let i = 0; i < count; i++) {
    await Promise.all(ALGOS.map((algo) => api.hit(algo)
      .then((r) => serverLog.add(r))
      .catch((err) => serverLog.add({ algo, status: err.status || null, message: err.message }))))
  }
}

function pushConfig() {
  Promise.all(ALGOS.map((a) => api.configure(a, sim.config))).catch((e) => controls.showError(`API: ${e.message}`))
}

const actions = {
  fire({ count }) {
    const created = sim.fire(count)
    setStory('')
    announce(`${count === 1 ? 'Request' : `Burst of ${count}`} sent. ${summarize(created)}`)
    renderAll(true)
    hitServer(count)
  },
  step({ ms }) {
    sim.tick(ms)
    renderAll(true)
    announce(`Clock advanced ${ms} ms to ${(sim.now / 1000).toFixed(3)} s.`)
  },
  pause() {
    paused = !paused
    controls.setPaused(paused)
    announce(paused ? 'Clock paused. Step it with the +100 ms and +1 s buttons.' : 'Clock running.')
  },
  traffic(detail) {
    sim.setTraffic(detail)
    scenario = { ...scenario, traffic: sim.traffic.mode, rate: sim.traffic.rate }
    saveScenario()
  },
  speed({ speed }) {
    scenario = { ...scenario, speed }
    saveScenario()
  },
  'burst-size'({ burst }) {
    scenario = { ...scenario, burst }
    saveScenario()
  },
  config(partial) {
    const next = { ...scenario, ...partial }
    try {
      sim.configure(toLimiterConfig(next))
      scenario = next
      saveScenario()
      renderAll(true)
      if (serverOn) pushConfig()
    } catch (e) {
      controls.showError(e.message)
    }
  },
  boundary() {
    runBoundaryBurst(sim)
    scenario = { ...scenario, ...{ limit: DEFAULT_CONFIG.limit, windowSec: DEFAULT_CONFIG.windowMs / 1000, refillPerSec: DEFAULT_CONFIG.refillPerSec }, traffic: 'off' }
    paused = true
    controls.sync(scenario, paused)
    saveScenario()
    renderAll(true)
    for (const lane of lanes) lane.selectLatestDenied()
    const text = 'Boundary burst: 5 requests at 9 s, 5 more at 10.5 s. Fixed window allowed all 10 in 1.5 s, twice its limit, because its counter reset at the 10 s boundary. The other three still remember the first burst. The clock is paused; step it forward or click any dot.'
    setStory(text)
    announce(text)
  },
  async copy() {
    saveScenario()
    try {
      await navigator.clipboard.writeText(location.href)
      announce('Link copied. It opens with these limits and traffic settings.')
      setStory('Link copied: it opens with these limits and traffic settings.')
    } catch {
      window.prompt('Copy this link:', location.href)
    }
  },
  reset() {
    sim.reset()
    setStory('')
    for (const lane of lanes) lane.select(null)
    renderAll(true)
    if (serverOn) ALGOS.forEach((a) => api.reset(a).catch(() => {}))
    announce('Simulation reset to 0 s.')
  },
  server({ on }) {
    serverOn = on
    serverLog.hidden = !on
    if (on) pushConfig()
  },
}

document.addEventListener('tl-action', (e) => {
  const { type, ...detail } = e.detail
  actions[type]?.(detail)
})

controls.sync(scenario, paused)

let last = performance.now()
function frame(t) {
  const dt = Math.max(0, Math.min(100, t - last))
  last = t
  if (!paused) sim.tick(dt * scenario.speed)
  renderAll()
  requestAnimationFrame(frame)
}
renderAll(true)
requestAnimationFrame(frame)
