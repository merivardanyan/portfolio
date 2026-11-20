import { defineStore } from 'pinia'
import { reactive, ref, computed, toRaw } from 'vue'
import { createGarden, findPlant, MAX_PLANTS, PLANT_INFO, cloneGarden, GRID_SIZE } from '../state/garden.js'
import { createHistory } from '../state/history.js'
import { setField, addPlant, removePlant, setStep, replaceGarden } from '../state/commands.js'
import { encodeGarden, decodeGarden, gardenFromHash, hashHasGarden } from '../state/serialize.js'
import { randomGarden, demoGarden, patternFor } from '../state/randomize.js'

const STORAGE_KEY = 'seed-sequencer:garden'
const VOLUME_KEY = 'seed-sequencer:volume'
const COLUMNS = 'ABCDEFGH'

export const cellName = (x, y) => `${COLUMNS[x]}${y + 1}`

function readStorage(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, value) } catch { /* private mode or quota */ }
}

export const useGardenStore = defineStore('garden', () => {
  const garden = reactive(createGarden())
  const history = createHistory()
  const revision = ref(0)
  const selected = ref(null)
  const seedType = ref('pluck')
  const playing = ref(false)
  const playhead = ref(-1)
  const storedVolume = Number(readStorage(VOLUME_KEY) ?? 0.7)
  const volume = ref(Number.isFinite(storedVolume) ? Math.min(1, Math.max(0, storedVolume)) : 0.7)
  const brokenLink = ref(false)
  const announcement = ref('')
  const remixed = ref(false)

  const canUndo = computed(() => revision.value >= 0 && history.canUndo)
  const canRedo = computed(() => revision.value >= 0 && history.canRedo)
  const selectedPlant = computed(() => (selected.value ? findPlant(garden, selected.value.x, selected.value.y) : null))
  const isFull = computed(() => garden.plants.length >= MAX_PLANTS)

  function announce(text) {
    announcement.value = ''
    queueMicrotask(() => { announcement.value = text })
  }

  function exec(cmd) {
    history.execute(garden, cmd)
    revision.value++
    persist()
    return cmd
  }

  function persist() {
    writeStorage(STORAGE_KEY, encodeGarden(toRaw(garden)))
  }

  function load(next) {
    const copy = cloneGarden(next)
    for (const k of ['tempo', 'key', 'scale', 'season']) garden[k] = copy[k]
    garden.plants = copy.plants
  }

  function init(hash) {
    const shared = gardenFromHash(hash)
    brokenLink.value = !shared && hashHasGarden(hash)
    if (shared) {
      load(shared)
      remixed.value = true
      persist()
      return 'shared'
    }
    const saved = readStorage(STORAGE_KEY)
    if (saved) {
      try {
        load(decodeGarden(saved))
        return 'saved'
      } catch { /* fall through to the demo garden */ }
    }
    load(demoGarden())
    return 'demo'
  }

  function openShared(hash) {
    const shared = gardenFromHash(hash)
    if (!shared) {
      if (!hashHasGarden(hash)) return false
      brokenLink.value = true
      announce('That garden link is damaged, so your current garden stays open.')
      return true
    }
    brokenLink.value = false
    exec(replaceGarden(toRaw(garden), shared, 'Open shared garden'))
    selected.value = null
    remixed.value = true
    announce('Shared garden loaded. It is your copy now; edit away.')
    return true
  }

  function setGlobal(field, value, label) {
    if (garden[field] === value) return
    exec(setField(field, garden[field], value, label))
  }

  function plant(x, y, type = seedType.value) {
    if (findPlant(garden, x, y)) return false
    if (isFull.value) {
      announce(`The garden is full (${MAX_PLANTS} plants). Remove one first.`)
      return false
    }
    exec(addPlant(x, y, type, patternFor(type)))
    selected.value = { x, y }
    announce(`Planted ${PLANT_INFO[type].label} at ${cellName(x, y)}.`)
    return true
  }

  function uproot(x, y) {
    const p = findPlant(garden, x, y)
    if (!p) return false
    exec(removePlant(p))
    if (selected.value?.x === x && selected.value?.y === y) selected.value = null
    announce(`Removed ${PLANT_INFO[p.type].label} from ${cellName(x, y)}.`)
    return true
  }

  function toggleStep(x, y, step, degree) {
    const p = findPlant(garden, x, y)
    if (!p) return 0
    const from = p.steps[step]
    const to = from === degree ? 0 : degree
    exec(setStep(x, y, step, from, to))
    return to
  }

  function regrow(x, y) {
    const p = findPlant(garden, x, y)
    if (!p) return
    const after = cloneGarden(toRaw(garden))
    findPlant(after, x, y).steps = patternFor(p.type)
    exec(replaceGarden(toRaw(garden), after, `Regrow ${PLANT_INFO[p.type].short.toLowerCase()}`))
    announce(`New pattern for ${PLANT_INFO[p.type].label}.`)
  }

  function prune(x, y) {
    const p = findPlant(garden, x, y)
    if (!p || p.steps.every((s) => s === 0)) return
    const after = cloneGarden(toRaw(garden))
    findPlant(after, x, y).steps = new Uint8Array(16)
    exec(replaceGarden(toRaw(garden), after, 'Prune all steps'))
    announce('All steps cleared.')
  }

  function randomize() {
    const next = randomGarden(Math.random, { tempo: garden.tempo, key: garden.key, scale: garden.scale, season: garden.season })
    exec(replaceGarden(toRaw(garden), next, 'Randomize garden'))
    selected.value = null
    announce(`New garden with ${next.plants.length} plants.`)
  }

  function clearAll() {
    if (!garden.plants.length) return
    exec(replaceGarden(toRaw(garden), { ...toRaw(garden), plants: [] }, 'Clear garden'))
    selected.value = null
    announce('Garden cleared. Undo to bring it back.')
  }

  function afterTimeTravel(cmd, verb) {
    if (!cmd) return
    revision.value++
    persist()
    if (selected.value && !findPlant(garden, selected.value.x, selected.value.y)) selected.value = null
    announce(`${verb}: ${cmd.label}`)
  }

  function undo() { afterTimeTravel(history.undo(garden), 'Undid') }
  function redo() { afterTimeTravel(history.redo(garden), 'Redid') }

  function select(x, y) {
    selected.value = x === null ? null : { x: Math.min(x, GRID_SIZE - 1), y: Math.min(y, GRID_SIZE - 1) }
  }

  function setVolume(v) {
    volume.value = v
    writeStorage(VOLUME_KEY, String(v))
  }

  return {
    garden, selected, selectedPlant, seedType, playing, playhead, volume, announcement, remixed, brokenLink,
    canUndo, canRedo, isFull,
    init, openShared, setGlobal, plant, uproot, toggleStep, regrow, prune, randomize, clearAll,
    undo, redo, select, setVolume, announce,
  }
})
