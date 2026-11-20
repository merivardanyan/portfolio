import { describe, it, expect } from 'vitest'
import { degreeToSemitone, midiToFrequency, noteFrequency, stepDuration } from '../src/music/theory.js'
import { createGarden, createPlant, findPlant, cloneGarden, sortPlants, cellIndex, MAX_PLANTS } from '../src/state/garden.js'
import {
  encodeGarden, decodeGarden, gardenFromHash, shareUrl, toBase64Url, fromBase64Url,
} from '../src/state/serialize.js'
import { createHistory } from '../src/state/history.js'
import { setField, addPlant, removePlant, setStep, replaceGarden } from '../src/state/commands.js'
import { mulberry32, randomGarden, demoGarden, patternFor } from '../src/state/randomize.js'
import { createScheduler } from '../src/audio/scheduler.js'

const steps = (arr) => Uint8Array.from(arr)

describe('theory', () => {
  it('maps degrees onto pentatonic scales across octaves', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => degreeToSemitone(d, 'majorPentatonic'))).toEqual([0, 2, 4, 7, 9, 12, 14])
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => degreeToSemitone(d, 'minorPentatonic'))).toEqual([0, 3, 5, 7, 10, 12, 15])
  })
  it('falls back to major pentatonic for unknown scales', () => {
    expect(degreeToSemitone(3, 'nope')).toBe(4)
  })
  it('rejects invalid degrees', () => {
    expect(() => degreeToSemitone(0, 'majorPentatonic')).toThrow(RangeError)
    expect(() => degreeToSemitone(8, 'majorPentatonic')).toThrow(RangeError)
    expect(() => degreeToSemitone(1.5, 'majorPentatonic')).toThrow(RangeError)
  })
  it('converts midi to frequency', () => {
    expect(midiToFrequency(69)).toBe(440)
    expect(midiToFrequency(81)).toBe(880)
    expect(noteFrequency({ degree: 1, key: 9, scale: 'majorPentatonic', baseMidi: 60 })).toBe(440)
  })
  it('computes sixteenth-note step duration', () => {
    expect(stepDuration(60)).toBe(0.25)
    expect(stepDuration(120)).toBe(0.125)
  })
})

describe('garden model', () => {
  it('creates, finds, clones and sorts plants', () => {
    const g = createGarden({ plants: [createPlant(3, 2, 'bell'), createPlant(0, 0, 'bass')] })
    sortPlants(g.plants)
    expect(g.plants.map((p) => cellIndex(p.x, p.y))).toEqual([0, 19])
    expect(findPlant(g, 3, 2).type).toBe('bell')
    expect(findPlant(g, 5, 5)).toBeUndefined()
    const c = cloneGarden(g)
    c.plants[0].steps[0] = 4
    expect(g.plants[0].steps[0]).toBe(0)
  })
})

describe('serialize', () => {
  const sample = () => createGarden({
    tempo: 120, key: 7, scale: 'minorPentatonic', season: 'winter',
    plants: [
      createPlant(0, 0, 'bass', steps([1, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0])),
      createPlant(7, 7, 'bell', steps([7, 6, 5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5, 6, 7, 0])),
    ],
  })

  it('round-trips a garden', () => {
    const g = sample()
    const decoded = decodeGarden(encodeGarden(g))
    expect(decoded).toEqual(g)
  })

  it('produces URL-safe output with no padding', () => {
    const s = encodeGarden(sample())
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(s.length).toBeLessThan(40)
  })

  it('keeps a full garden compact', () => {
    const plants = Array.from({ length: MAX_PLANTS + 2 }, (_, i) => createPlant(i % 8, Math.floor(i / 8), 'pluck', steps(new Array(16).fill(7))))
    const s = encodeGarden(createGarden({ plants }))
    expect(decodeGarden(s).plants).toHaveLength(MAX_PLANTS)
    expect(s.length).toBeLessThan(230)
  })

  it('base64url handles every byte value', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes)
    expect(() => fromBase64Url('a+b')).toThrow()
  })

  const corrupt = (mutate) => {
    const bytes = fromBase64Url(encodeGarden(sample()))
    const out = mutate(bytes) ?? bytes
    return toBase64Url(out)
  }

  it.each([
    ['too short', () => Uint8Array.from([1, 2])],
    ['wrong version', (b) => { b[0] = 9 }],
    ['tempo out of range', (b) => { b[1] = 20 }],
    ['key out of range', (b) => { b[2] = 12 }],
    ['unknown scale', (b) => { b[3] = 5 }],
    ['unknown season', (b) => { b[4] = 9 }],
    ['too many plants', (b) => { b[5] = 40 }],
    ['wrong length', (b) => b.slice(0, b.length - 1)],
    ['invalid plant type', (b) => { b[7] = 9 }],
    ['plant outside the grid', (b) => { b[6] = 0x09 }],
    ['duplicate cell', (b) => { b[16] = b[6] }],
    ['degree out of range', (b) => { b[8] = 0xf0 }],
  ])('rejects %s', (_, mutate) => {
    expect(() => decodeGarden(corrupt(mutate))).toThrow()
  })

  it('reads gardens from a hash and ignores junk', () => {
    const s = encodeGarden(sample())
    expect(gardenFromHash(`#g=${s}`)).toEqual(sample())
    expect(gardenFromHash(`#x=1&g=${s}`)).toEqual(sample())
    expect(gardenFromHash('#g=@@@')).toBeNull()
    expect(gardenFromHash('#g=AAAA')).toBeNull()
    expect(gardenFromHash('')).toBeNull()
    expect(gardenFromHash(undefined)).toBeNull()
  })

  it('builds a share URL that keeps the path', () => {
    const url = shareUrl(sample(), { origin: 'https://x.dev', pathname: '/demos/seed-sequencer/' })
    expect(url).toMatch(/^https:\/\/x\.dev\/demos\/seed-sequencer\/#g=/)
    expect(gardenFromHash(new URL(url).hash)).toEqual(sample())
  })
})

describe('history + commands', () => {
  it('executes, undoes and redoes', () => {
    const g = createGarden()
    const h = createHistory()
    h.execute(g, addPlant(1, 1, 'pad', steps(new Array(16).fill(1))))
    h.execute(g, setStep(1, 1, 3, 1, 5))
    expect(findPlant(g, 1, 1).steps[3]).toBe(5)
    expect(h.undo(g).label).toMatch(/step 4/)
    expect(findPlant(g, 1, 1).steps[3]).toBe(1)
    h.undo(g)
    expect(g.plants).toHaveLength(0)
    expect(h.canUndo).toBe(false)
    expect(h.undo(g)).toBeNull()
    h.redo(g)
    h.redo(g)
    expect(findPlant(g, 1, 1).steps[3]).toBe(5)
    expect(h.redo(g)).toBeNull()
    expect(h.canRedo).toBe(false)
  })

  it('setStep replaces the steps array so Vue sees the change', () => {
    const g = createGarden({ plants: [createPlant(0, 0, 'bass')] })
    const before = g.plants[0].steps
    setStep(0, 0, 0, 0, 2).do(g)
    expect(g.plants[0].steps).not.toBe(before)
    setStep(5, 5, 0, 0, 2).do(g)
    expect(setStep(0, 0, 0, 2, 0).label).toMatch(/Clear/)
  })

  it('a new command clears the redo stack', () => {
    const g = createGarden()
    const h = createHistory()
    h.execute(g, setField('tempo', 96, 100))
    h.undo(g)
    expect(h.canRedo).toBe(true)
    h.execute(g, setField('key', 0, 3))
    expect(h.canRedo).toBe(false)
  })

  it('merges rapid edits of the same field', () => {
    let t = 0
    const g = createGarden()
    const h = createHistory({ now: () => t, mergeWindowMs: 500 })
    h.execute(g, setField('tempo', 96, 100))
    t = 100
    h.execute(g, setField('tempo', 100, 110))
    expect(h.size).toBe(1)
    t = 2000
    h.execute(g, setField('tempo', 110, 120))
    expect(h.size).toBe(2)
    h.undo(g)
    expect(g.tempo).toBe(110)
    h.undo(g)
    expect(g.tempo).toBe(96)
  })

  it('does not merge across an undo', () => {
    const g = createGarden()
    const h = createHistory({ now: () => 0 })
    h.execute(g, setField('tempo', 96, 100))
    h.execute(g, setField('key', 0, 2))
    h.undo(g)
    h.execute(g, setField('key', 0, 4))
    expect(h.size).toBe(2)
  })

  it('respects the limit and clear()', () => {
    const g = createGarden()
    const h = createHistory({ limit: 3, now: () => 0 })
    for (let i = 0; i < 5; i++) h.execute(g, addPlant(i, 0, 'pluck'))
    expect(h.size).toBe(3)
    h.clear()
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
  })

  it('addPlant is idempotent on occupied cells and removePlant restores steps', () => {
    const g = createGarden()
    addPlant(2, 2, 'bell', steps([3])).do(g)
    addPlant(2, 2, 'bass').do(g)
    expect(g.plants).toHaveLength(1)
    const rm = removePlant(g.plants[0])
    rm.do(g)
    expect(g.plants).toHaveLength(0)
    rm.undo(g)
    expect(g.plants[0].type).toBe('bell')
    expect(g.plants[0].steps[0]).toBe(3)
    expect(rm.label).toBe('Remove bell')
  })

  it('replaceGarden swaps whole snapshots without aliasing', () => {
    const before = createGarden({ plants: [createPlant(0, 0, 'bass')] })
    const after = createGarden({ tempo: 130, season: 'autumn', plants: [] })
    const g = cloneGarden(before)
    const cmd = replaceGarden(before, after, 'Clear')
    cmd.do(g)
    expect(g.tempo).toBe(130)
    expect(g.plants).toHaveLength(0)
    before.plants[0].type = 'pad'
    cmd.undo(g)
    expect(g.plants[0].type).toBe('bass')
  })
})

describe('randomize', () => {
  it('is deterministic for a seed', () => {
    expect(randomGarden(mulberry32(1))).toEqual(randomGarden(mulberry32(1)))
    expect(demoGarden()).toEqual(demoGarden())
  })
  it('makes valid, serializable gardens', () => {
    for (let seed = 0; seed < 50; seed++) {
      const g = randomGarden(mulberry32(seed))
      expect(g.plants.length).toBeGreaterThanOrEqual(3)
      expect(decodeGarden(encodeGarden(g))).toEqual(g)
      const cells = new Set(g.plants.map((p) => cellIndex(p.x, p.y)))
      expect(cells.size).toBe(g.plants.length)
    }
  })
  it('keeps base settings when given', () => {
    const g = randomGarden(mulberry32(3), { tempo: 77, key: 4, scale: 'minorPentatonic', season: 'summer' })
    expect([g.tempo, g.key, g.scale, g.season]).toEqual([77, 4, 'minorPentatonic', 'summer'])
  })
  it('every pattern type has at least one note', () => {
    for (const type of ['bass', 'pad', 'pluck', 'bell']) {
      for (let seed = 0; seed < 20; seed++) {
        const p = patternFor(type, mulberry32(seed))
        if (type !== 'pluck') expect(p.some((d) => d > 0)).toBe(true)
        expect(p.every((d) => d >= 0 && d <= 7)).toBe(true)
      }
    }
    expect(patternFor('bell').length).toBe(16)
  })
})

describe('scheduler', () => {
  function setup(opts = {}) {
    let now = 0
    const timers = []
    const fired = []
    const s = createScheduler({
      getTime: () => now,
      getStepDuration: () => 0.125,
      onStep: (step, time) => fired.push([step, +time.toFixed(4)]),
      setTimer: (fn) => { timers.push(fn); return timers.length },
      clearTimer: () => { timers.length = 0 },
      ...opts,
    })
    return {
      s, fired, timers,
      advance(t) { now = t; const fn = timers.shift(); fn?.() },
    }
  }

  it('schedules ahead on the audio clock, not at timer time', () => {
    const { s, fired, advance } = setup()
    s.start()
    expect(fired).toEqual([[0, 0.05]])
    advance(0.1)
    expect(fired.map((f) => f[0])).toEqual([0, 1])
    expect(fired[1][1]).toBe(0.175)
    expect(s.running).toBe(true)
  })

  it('wraps after 16 steps', () => {
    const { s, fired, advance } = setup()
    s.start()
    for (let t = 0.1; t < 2.2; t += 0.1) advance(t)
    expect(fired[16][0]).toBe(0)
    expect(fired[16][1]).toBe(+(0.05 + 16 * 0.125).toFixed(4))
  })

  it('skips steps missed by a starved timer instead of bunching them', () => {
    const { s, fired, advance } = setup()
    s.start()
    advance(1.0)
    const times = fired.slice(1).map((f) => f[1])
    expect(times.every((t) => t >= 0.98)).toBe(true)
    expect(fired.length).toBeLessThan(4)
  })

  it('reports the audible step for visuals', () => {
    const { s, advance } = setup()
    s.start()
    expect(s.currentStep(0)).toBeNull()
    advance(0.1)
    expect(s.currentStep(0.18)).toBe(1)
    expect(s.currentStep(0.18)).toBeNull()
  })

  it('stops cleanly and ignores double start', () => {
    const { s, fired, timers } = setup()
    s.start()
    s.start()
    expect(fired).toHaveLength(1)
    s.stop()
    expect(s.running).toBe(false)
    expect(timers).toHaveLength(0)
    s.stop()
  })

  it('uses the dynamic look-ahead', () => {
    const { s, fired } = setup({ getLookahead: () => 1 })
    s.start()
    expect(fired.length).toBe(8)
  })
})
