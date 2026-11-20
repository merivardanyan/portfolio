import { cloneGarden, createPlant, findPlant, sortPlants, PLANT_INFO } from './garden.js'

const GLOBAL_FIELDS = ['tempo', 'key', 'scale', 'season']

export function setField(field, from, to, label = `Change ${field}`) {
  return {
    label,
    to,
    mergeKey: `field:${field}`,
    do: (g) => { g[field] = to },
    undo: (g) => { g[field] = from },
    merge: (next) => setField(field, from, next.to, label),
  }
}

export function addPlant(x, y, type, steps) {
  return {
    label: `Plant ${PLANT_INFO[type].short.toLowerCase()}`,
    do: (g) => {
      if (findPlant(g, x, y)) return
      g.plants.push(createPlant(x, y, type, steps))
      sortPlants(g.plants)
    },
    undo: (g) => {
      g.plants = g.plants.filter((p) => !(p.x === x && p.y === y))
    },
  }
}

export function removePlant(plant) {
  const inverse = addPlant(plant.x, plant.y, plant.type, Uint8Array.from(plant.steps))
  return {
    label: `Remove ${PLANT_INFO[plant.type].short.toLowerCase()}`,
    do: inverse.undo,
    undo: inverse.do,
  }
}

export function setStep(x, y, step, from, to) {
  const apply = (value) => (g) => {
    const plant = findPlant(g, x, y)
    if (!plant) return
    // Vue does not track typed-array indices, so swap in a new array.
    const next = Uint8Array.from(plant.steps)
    next[step] = value
    plant.steps = next
  }
  return {
    label: to ? `Set step ${step + 1} to degree ${to}` : `Clear step ${step + 1}`,
    do: apply(to),
    undo: apply(from),
  }
}

export function replaceGarden(before, after, label) {
  const a = cloneGarden(before)
  const b = cloneGarden(after)
  const assign = (src) => (g) => {
    const next = cloneGarden(src)
    for (const k of GLOBAL_FIELDS) g[k] = next[k]
    g.plants = next.plants
  }
  return { label, do: assign(b), undo: assign(a) }
}
