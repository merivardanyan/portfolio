import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createScheduler } from '../src/audio/scheduler.js'
import { hashHasGarden, gardenFromHash } from '../src/state/serialize.js'
import { createGarden, createPlant } from '../src/state/garden.js'

class Param {
  constructor(v = 0) { this.value = v; this.events = [] }
  setValueAtTime(v, t) { this.events.push(['set', v, t]); this.value = v }
  linearRampToValueAtTime(v, t) { this.events.push(['linear', v, t]); this.value = v }
  exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]) }
  setTargetAtTime(v, t) { this.events.push(['target', v, t]) }
  cancelScheduledValues(t) { this.events.push(['cancel', t]) }
}
class Node {
  constructor(ctx) { this.ctx = ctx; this.outputs = new Set() }
  connect(n) { this.outputs.add(n); return n }
  disconnect() { this.outputs.clear() }
}
class Gain extends Node { constructor(c) { super(c); this.gain = new Param(1) } }
class Osc extends Node {
  constructor(c) { super(c); this.frequency = new Param(); this.detune = new Param(); this.listeners = []; c.oscillators.push(this) }
  start(t) { this.startAt = t }
  stop(t) { this.stopAt = Math.min(this.stopAt ?? Infinity, t) }
  addEventListener(type, fn) { this.listeners.push(fn) }
}
class FakeAudioContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 8000; this.oscillators = []; this.destination = new Node(this) }
  createGain() { return new Gain(this) }
  createOscillator() { return new Osc(this) }
  createBiquadFilter() { const n = new Node(this); n.frequency = new Param(); n.Q = new Param(); return n }
  createStereoPanner() { const n = new Node(this); n.pan = new Param(); return n }
  createConvolver() { return new Node(this) }
  createDynamicsCompressor() { const n = new Node(this); n.threshold = new Param(); n.ratio = new Param(); return n }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) } }
  resume() {}
  close() { this.closed = true }
}

describe('engine stop()', () => {
  let ctx
  beforeEach(() => {
    vi.useFakeTimers()
    globalThis.window = { AudioContext: class extends FakeAudioContext { constructor() { super(); ctx = this } } }
    globalThis.document = { hidden: false }
  })
  afterEach(() => {
    vi.useRealTimers()
    delete globalThis.window
    delete globalThis.document
  })

  it('cuts notes already scheduled inside the look-ahead window', async () => {
    const { createEngine } = await import('../src/audio/engine.js')
    const garden = createGarden({ tempo: 120, plants: [createPlant(0, 0, 'pluck', new Array(16).fill(3))] })
    const engine = createEngine({ getGarden: () => garden })
    engine.start()
    const scheduled = ctx.oscillators.length
    expect(scheduled).toBeGreaterThan(0)
    expect(engine.pendingSources).toBe(scheduled)
    ctx.currentTime = 0.01
    engine.stop()
    expect(engine.playing).toBe(false)
    expect(ctx.oscillators.every((o) => o.stopAt <= 0.01 + 0.031)).toBe(true)
    expect(engine.pendingSources).toBe(0)
    engine.close()
    expect(ctx.closed).toBe(true)
  })

  it('previews are not cut by stopping a run', async () => {
    const { createEngine } = await import('../src/audio/engine.js')
    const garden = createGarden()
    const engine = createEngine({ getGarden: () => garden })
    engine.preview('bell', 5)
    const previewOsc = ctx.oscillators.slice()
    engine.stop()
    expect(previewOsc.every((o) => o.stopAt > 1)).toBe(true)
  })
})

describe('scheduler queue while hidden', () => {
  it('keeps at most one bar of visual steps when nobody drains it', () => {
    let now = 0
    const timers = []
    const s = createScheduler({
      getTime: () => now,
      getStepDuration: () => 0.125,
      onStep: () => {},
      getLookahead: () => 1.5,
      setTimer: (fn) => { timers.push(fn); return 1 },
      clearTimer: () => {},
    })
    s.start()
    for (let i = 0; i < 3600; i++) { now += 1; timers.shift()() }
    expect(s.backlog).toBeLessThanOrEqual(16)
    expect(s.currentStep(now)).not.toBeNull()
  })
})

describe('damaged links', () => {
  it('detects a garden payload even when it is invalid', () => {
    expect(hashHasGarden('#g=%%%bad')).toBe(true)
    expect(gardenFromHash('#g=%%%bad')).toBeNull()
    expect(hashHasGarden('#x=1')).toBe(false)
    expect(hashHasGarden('')).toBe(false)
  })
})
