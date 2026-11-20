import { GRID_SIZE, STEPS, PLANT_TYPES, SEASONS, createGarden, createPlant, sortPlants, cellIndex } from './garden.js'
import { SCALE_IDS } from '../music/theory.js'

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)]

const PATTERNS = {
  bass(rng) {
    const steps = new Uint8Array(STEPS)
    const hits = pick(rng, [[0, 8], [0, 6, 8, 14], [0, 3, 8, 11], [0, 10]])
    hits.forEach((s, i) => { steps[s] = i % 2 === 0 ? 1 : pick(rng, [1, 3, 4]) })
    return steps
  },
  pad(rng) {
    const steps = new Uint8Array(STEPS)
    steps[0] = pick(rng, [1, 3, 5])
    if (rng() < 0.7) steps[8] = pick(rng, [2, 3, 4, 5])
    return steps
  },
  pluck(rng) {
    const steps = new Uint8Array(STEPS)
    let degree = pick(rng, [1, 2, 3, 4, 5])
    for (let s = 0; s < STEPS; s++) {
      if (rng() < (s % 2 === 0 ? 0.55 : 0.22)) {
        degree = Math.min(7, Math.max(1, degree + pick(rng, [-2, -1, 1, 1, 2])))
        steps[s] = degree
      }
    }
    return steps
  },
  bell(rng) {
    const steps = new Uint8Array(STEPS)
    for (let s = 2; s < STEPS; s += 4) if (rng() < 0.45) steps[s] = pick(rng, [3, 5, 6, 7])
    if (steps.every((d) => d === 0)) steps[2] = 5
    return steps
  },
}

export function patternFor(type, rng = Math.random) {
  return PATTERNS[type](rng)
}

export function randomGarden(rng = Math.random, base = {}) {
  const counts = {
    bass: 1,
    pad: rng() < 0.75 ? 1 : 0,
    pluck: 2 + Math.floor(rng() * 2),
    bell: 1 + Math.floor(rng() * 2),
  }
  const used = new Set()
  const plants = []
  for (const type of PLANT_TYPES) {
    for (let i = 0; i < counts[type]; i++) {
      let x
      let y
      do {
        x = Math.floor(rng() * GRID_SIZE)
        y = Math.floor(rng() * GRID_SIZE)
      } while (used.has(cellIndex(x, y)))
      used.add(cellIndex(x, y))
      plants.push(createPlant(x, y, type, PATTERNS[type](rng)))
    }
  }
  return createGarden({
    tempo: base.tempo ?? 80 + Math.floor(rng() * 40),
    key: base.key ?? Math.floor(rng() * 12),
    scale: base.scale ?? pick(rng, SCALE_IDS),
    season: base.season ?? pick(rng, SEASONS),
    plants: sortPlants(plants),
  })
}

export function demoGarden() {
  return randomGarden(mulberry32(20261119), { tempo: 92, key: 2, scale: 'majorPentatonic', season: 'spring' })
}
