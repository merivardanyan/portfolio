function envelope(ctx, time, { attack, peak, decay, sustain = 0, release = 0.05, hold = 0 }) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, time)
  g.gain.linearRampToValueAtTime(peak, time + attack)
  if (sustain > 0) {
    g.gain.setTargetAtTime(sustain, time + attack, decay / 3)
    g.gain.setValueAtTime(sustain, time + attack + hold)
    g.gain.linearRampToValueAtTime(0.0001, time + attack + hold + release)
  } else {
    g.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay)
  }
  const end = time + attack + (sustain > 0 ? hold + release : decay) + 0.02
  return { gain: g, end }
}

function osc(ctx, type, freq, time, detune = 0) {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, time)
  o.detune.setValueAtTime(detune, time)
  return o
}

function finish(nodes, end) {
  for (const n of nodes) {
    n.start?.(n.startAt)
    n.stop?.(end)
  }
  nodes[0].onended = () => nodes.forEach((n) => n.disconnect())
  return nodes.filter((n) => typeof n.start === 'function')
}

const VOICES = {
  bass(ctx, { freq, time, stepDur, out }) {
    const env = envelope(ctx, time, { attack: 0.008, peak: 0.55, decay: 0.12, sustain: 0.35, hold: stepDur * 1.6, release: 0.12 })
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(900, time)
    lp.frequency.exponentialRampToValueAtTime(220, time + 0.25)
    lp.Q.value = 2
    const a = osc(ctx, 'triangle', freq, time)
    const b = osc(ctx, 'square', freq / 2, time)
    const bGain = ctx.createGain()
    bGain.gain.value = 0.18
    a.connect(lp)
    b.connect(bGain).connect(lp)
    lp.connect(env.gain).connect(out)
    a.startAt = time
    b.startAt = time
    return finish([a, b, bGain, lp, env.gain], env.end)
  },
  pad(ctx, { freq, time, stepDur, out }) {
    const hold = stepDur * 6
    const env = envelope(ctx, time, { attack: 0.35, peak: 0.16, decay: 0.6, sustain: 0.12, hold, release: 0.9 })
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(700, time)
    lp.frequency.linearRampToValueAtTime(1600, time + hold * 0.6)
    const a = osc(ctx, 'sawtooth', freq, time, -8)
    const b = osc(ctx, 'sawtooth', freq, time, 8)
    const c = osc(ctx, 'sine', freq * 2, time)
    ;[a, b, c].forEach((o) => { o.startAt = time; o.connect(lp) })
    lp.connect(env.gain).connect(out)
    return finish([a, b, c, lp, env.gain], env.end)
  },
  pluck(ctx, { freq, time, out }) {
    const env = envelope(ctx, time, { attack: 0.003, peak: 0.32, decay: 0.45 })
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(freq * 8, time)
    lp.frequency.exponentialRampToValueAtTime(freq * 1.2, time + 0.3)
    const a = osc(ctx, 'triangle', freq, time)
    const b = osc(ctx, 'square', freq, time, 4)
    const bGain = ctx.createGain()
    bGain.gain.value = 0.25
    a.startAt = time
    b.startAt = time
    a.connect(lp)
    b.connect(bGain).connect(lp)
    lp.connect(env.gain).connect(out)
    return finish([a, b, bGain, lp, env.gain], env.end)
  },
  bell(ctx, { freq, time, out }) {
    const env = envelope(ctx, time, { attack: 0.002, peak: 0.2, decay: 1.6 })
    const carrier = osc(ctx, 'sine', freq, time)
    const mod = osc(ctx, 'sine', freq * 3.5, time)
    const modGain = ctx.createGain()
    modGain.gain.setValueAtTime(freq * 2.2, time)
    modGain.gain.exponentialRampToValueAtTime(freq * 0.05, time + 1.2)
    mod.connect(modGain).connect(carrier.frequency)
    carrier.connect(env.gain).connect(out)
    carrier.startAt = time
    mod.startAt = time
    return finish([carrier, mod, modGain, env.gain], env.end)
  },
}

/** Schedules one note and returns its source nodes so a caller can cut them short. */
export function playVoice(ctx, type, params) {
  const voice = VOICES[type]
  if (!voice) throw new Error(`Unknown voice ${type}`)
  return voice(ctx, params)
}

export function createImpulse(ctx, seconds, decay = 2.5) {
  const rate = ctx.sampleRate
  const length = Math.max(1, Math.floor(rate * seconds))
  const buffer = ctx.createBuffer(2, length, rate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay
    }
  }
  return buffer
}
