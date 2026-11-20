export const GRID_SIZE = 8
export const STEPS = 16
export const MAX_PLANTS = 16
export const TEMPO_MIN = 60
export const TEMPO_MAX = 140

export const PLANT_TYPES = ['bass', 'pad', 'pluck', 'bell']

export const PLANT_INFO = {
  bass: { label: 'Root bass', short: 'Bass', baseMidi: 36 },
  pad: { label: 'Fern pad', short: 'Pad', baseMidi: 48 },
  pluck: { label: 'Tulip pluck', short: 'Pluck', baseMidi: 60 },
  bell: { label: 'Bellflower', short: 'Bell', baseMidi: 72 },
}

export const SEASONS = ['spring', 'summer', 'autumn', 'winter']

export const SEASON_INFO = {
  spring: { label: 'Spring', reverbSeconds: 1.8, wet: 0.22 },
  summer: { label: 'Summer', reverbSeconds: 1.1, wet: 0.14 },
  autumn: { label: 'Autumn', reverbSeconds: 2.6, wet: 0.3 },
  winter: { label: 'Winter', reverbSeconds: 4.2, wet: 0.42 },
}

export function createGarden(overrides = {}) {
  return {
    v: 1,
    tempo: 96,
    key: 0,
    scale: 'majorPentatonic',
    season: 'spring',
    plants: [],
    ...overrides,
  }
}

export function createPlant(x, y, type, steps) {
  return { x, y, type, steps: steps ? Uint8Array.from(steps) : new Uint8Array(STEPS) }
}

export function cellIndex(x, y) {
  return y * GRID_SIZE + x
}

export function findPlant(garden, x, y) {
  return garden.plants.find((p) => p.x === x && p.y === y)
}

export function cloneGarden(garden) {
  return {
    ...garden,
    plants: garden.plants.map((p) => createPlant(p.x, p.y, p.type, p.steps)),
  }
}

export function sortPlants(plants) {
  return plants.sort((a, b) => cellIndex(a.x, a.y) - cellIndex(b.x, b.y))
}
