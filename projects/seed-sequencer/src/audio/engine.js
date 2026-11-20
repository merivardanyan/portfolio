import { createScheduler } from './scheduler.js'
import { playVoice, createImpulse } from './voices.js'
import { noteFrequency, stepDuration } from '../music/theory.js'
import { GRID_SIZE, PLANT_INFO, SEASON_INFO } from '../state/garden.js'

const STOP_FADE = 0.015

/**
 * Owns the AudioContext and the signal graph:
 *   voices -> column panner -> run gain -> bus -> (dry | convolver -> wet) -> master -> compressor -> out
 * Each play run gets its own gain + panners, so stop() can silence notes that were already
 * scheduled inside the look-ahead window without touching the next run or previews.
 * The context is created lazily inside a user gesture (autoplay policy).
 */
export function createEngine({ getGarden }) {
  let ctx = null
  let bus, master, wet, convolver
  let previewOut = []
  let run = null
  let volume = 0.7
  let season = null
  let scheduler = null

  function makePanners(dest) {
    return Array.from({ length: GRID_SIZE }, (_, x) => {
      const p = ctx.createStereoPanner()
      p.pan.value = (x / (GRID_SIZE - 1)) * 1.2 - 0.6
      p.connect(dest)
      return p
    })
  }

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext
    ctx = new AC({ latencyHint: 'interactive' })
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -14
    compressor.ratio.value = 6
    compressor.connect(ctx.destination)
    master = ctx.createGain()
    master.gain.value = volume
    master.connect(compressor)
    bus = ctx.createGain()
    bus.connect(master)
    convolver = ctx.createConvolver()
    wet = ctx.createGain()
    bus.connect(convolver).connect(wet).connect(master)
    previewOut = makePanners(bus)
    scheduler = createScheduler({
      getTime: () => ctx.currentTime,
      getStepDuration: () => stepDuration(getGarden().tempo),
      onStep: scheduleStep,
      // Background tabs throttle timers to ~1 s, so look further ahead while hidden.
      getLookahead: () => (document.hidden ? 1.5 : 0.12),
    })
  }

  function ensure() {
    if (!ctx) build()
    if (ctx.state === 'suspended') ctx.resume()
    applySeason(getGarden().season)
    return ctx
  }

  function applySeason(next) {
    if (!ctx || next === season) return
    season = next
    const info = SEASON_INFO[next] ?? SEASON_INFO.spring
    convolver.buffer = createImpulse(ctx, info.reverbSeconds)
    wet.gain.setTargetAtTime(info.wet, ctx.currentTime, 0.1)
  }

  function trigger(type, degree, x, time, out) {
    const g = getGarden()
    const freq = noteFrequency({ degree, key: g.key, scale: g.scale, baseMidi: PLANT_INFO[type].baseMidi })
    return playVoice(ctx, type, { freq, time, stepDur: stepDuration(g.tempo), out: out[x] ?? bus })
  }

  function scheduleStep(step, time) {
    if (!run) return
    for (const plant of getGarden().plants) {
      const degree = plant.steps[step]
      if (!degree) continue
      for (const src of trigger(plant.type, degree, plant.x, time, run.panners)) {
        run.sources.add(src)
        src.addEventListener('ended', () => run?.sources.delete(src))
      }
    }
  }

  function startRun() {
    const gain = ctx.createGain()
    gain.connect(bus)
    run = { gain, panners: makePanners(gain), sources: new Set() }
  }

  function endRun() {
    if (!run) return
    const { gain, panners, sources } = run
    run = null
    const now = ctx.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(0, now + STOP_FADE)
    for (const src of sources) {
      try { src.stop(now + STOP_FADE * 2) } catch { /* already stopped */ }
    }
    setTimeout(() => {
      gain.disconnect()
      panners.forEach((p) => p.disconnect())
    }, 200)
  }

  return {
    get supported() {
      return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext)
    },
    get playing() {
      return !!scheduler?.running
    },
    /** Number of notes scheduled by the current run that haven't ended. Exposed for tests. */
    get pendingSources() {
      return run ? run.sources.size : 0
    },
    start() {
      ensure()
      endRun()
      startRun()
      scheduler.start()
    },
    stop() {
      scheduler?.stop()
      if (ctx) endRun()
    },
    preview(type, degree, x = 3) {
      ensure()
      trigger(type, degree, x, ctx.currentTime + 0.01, previewOut)
    },
    setVolume(v) {
      volume = v
      if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.03)
    },
    setSeason: applySeason,
    currentStep() {
      return scheduler?.running ? scheduler.currentStep(ctx.currentTime) : null
    },
    close() {
      this.stop()
      ctx?.close()
      ctx = null
    },
  }
}
