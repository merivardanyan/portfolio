<script setup>
import { computed, nextTick, ref } from 'vue'
import { useGardenStore, cellName } from '../stores/garden.js'
import { GRID_SIZE, PLANT_INFO, cellIndex } from '../state/garden.js'
import PlantSprite from './PlantSprite.vue'

const props = defineProps({ reducedMotion: { type: Boolean, default: false } })
const emit = defineEmits(['edit'])

const store = useGardenStore()
const focus = ref({ x: 0, y: 0 })
const cellEls = {}

const rows = computed(() => {
  const byCell = new Map(store.garden.plants.map((p) => [cellIndex(p.x, p.y), p]))
  return Array.from({ length: GRID_SIZE }, (_, y) =>
    Array.from({ length: GRID_SIZE }, (_, x) => ({ x, y, plant: byCell.get(cellIndex(x, y)) ?? null })),
  )
})

function label(cell) {
  const where = cellName(cell.x, cell.y)
  if (!cell.plant) return `${where}, empty soil`
  const notes = cell.plant.steps.reduce((n, d) => n + (d ? 1 : 0), 0)
  return `${where}, ${PLANT_INFO[cell.plant.type].label}, ${notes} ${notes === 1 ? 'note' : 'notes'}`
}

const isSelected = (cell) => store.selected?.x === cell.x && store.selected?.y === cell.y

function moveTo(x, y) {
  focus.value = { x: Math.max(0, Math.min(GRID_SIZE - 1, x)), y: Math.max(0, Math.min(GRID_SIZE - 1, y)) }
  nextTick(() => cellEls[cellIndex(focus.value.x, focus.value.y)]?.focus())
}

function activate(cell) {
  focus.value = { x: cell.x, y: cell.y }
  if (cell.plant) {
    store.select(cell.x, cell.y)
    emit('edit', cell)
  } else {
    store.plant(cell.x, cell.y)
  }
}

function onKeydown(e, cell) {
  const { x, y } = cell
  const map = {
    ArrowRight: () => moveTo(x + 1, y),
    ArrowLeft: () => moveTo(x - 1, y),
    ArrowDown: () => moveTo(x, y + 1),
    ArrowUp: () => moveTo(x, y - 1),
    Home: () => moveTo(0, e.ctrlKey ? 0 : y),
    End: () => moveTo(GRID_SIZE - 1, e.ctrlKey ? GRID_SIZE - 1 : y),
    Enter: () => activate(cell),
    ' ': () => activate(cell),
    Delete: () => store.uproot(x, y),
    Backspace: () => store.uproot(x, y),
  }
  const fn = map[e.key]
  if (!fn) return
  e.preventDefault()
  fn()
}

function onFocus(cell) {
  focus.value = { x: cell.x, y: cell.y }
}
</script>

<template>
  <div class="soil-wrap">
    <div
      class="soil"
      role="grid"
      aria-label="Garden soil, 8 by 8. Arrow keys move, Enter plants or edits, Delete removes."
      aria-describedby="soil-help"
    >
      <div v-for="(row, y) in rows" :key="y" class="soil__row" role="row">
        <div
          v-for="cell in row"
          :key="cell.x"
          :ref="(el) => { if (el) cellEls[cellIndex(cell.x, cell.y)] = el }"
          class="soil__cell"
          :class="{ 'has-plant': cell.plant, 'is-selected': isSelected(cell) }"
          role="gridcell"
          :aria-label="label(cell)"
          :aria-selected="isSelected(cell) ? 'true' : 'false'"
          :tabindex="focus.x === cell.x && focus.y === cell.y ? 0 : -1"
          @click="activate(cell)"
          @keydown="onKeydown($event, cell)"
          @focus="onFocus(cell)"
        >
          <PlantSprite
            v-if="cell.plant"
            :type="cell.plant.type"
            :steps="cell.plant.steps"
            :playhead="store.playhead"
            :animate="!props.reducedMotion"
          />
          <span v-else class="soil__seed" aria-hidden="true" />
        </div>
      </div>
    </div>
    <p id="soil-help" class="soil-help">
      Click or press Enter on empty soil to plant the selected seed. Select a plant to edit its 16 steps.
    </p>
  </div>
</template>

<style scoped>
.soil-wrap { width: 100%; }
.soil {
  display: grid;
  grid-template-rows: repeat(8, 1fr);
  gap: 4px;
  aspect-ratio: 1;
  width: 100%;
  padding: 6px;
  border-radius: 14px;
  background: var(--soil-deep);
  box-shadow: inset 0 0 0 1px var(--line);
}
.soil__row { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; }
.soil__cell {
  position: relative;
  display: grid;
  place-items: center;
  min-width: 0;
  padding: 2px;
  border-radius: 8px;
  background: var(--soil);
  cursor: pointer;
  transition: background-color 150ms ease;
}
.soil__cell:hover { background: var(--soil-hover); }
.soil__cell:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; z-index: 1; }
.soil__cell.is-selected { box-shadow: inset 0 0 0 2px var(--ink); }
.soil__seed {
  width: 18%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--line);
  opacity: 0.6;
}
.soil__cell:hover .soil__seed, .soil__cell:focus-visible .soil__seed { background: var(--accent); opacity: 1; }
.soil-help { margin: 0.6rem 0 0; font-size: 0.85rem; color: var(--muted); }
@media (prefers-reduced-motion: reduce) {
  .soil__cell { transition: none; }
}
</style>
