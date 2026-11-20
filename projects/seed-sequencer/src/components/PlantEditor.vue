<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useGardenStore, cellName } from '../stores/garden.js'
import { PLANT_INFO, STEPS } from '../state/garden.js'
import { MAX_DEGREE } from '../music/theory.js'
import PlantSprite from './PlantSprite.vue'

const props = defineProps({ reducedMotion: { type: Boolean, default: false } })
const emit = defineEmits(['preview', 'close'])

const store = useGardenStore()
const plant = computed(() => store.selectedPlant)
const info = computed(() => (plant.value ? PLANT_INFO[plant.value.type] : null))
const where = computed(() => (plant.value ? cellName(plant.value.x, plant.value.y) : ''))

const degrees = Array.from({ length: MAX_DEGREE }, (_, i) => MAX_DEGREE - i)
const bars = [0, 1].map((b) => Array.from({ length: STEPS / 2 }, (_, i) => b * (STEPS / 2) + i))

const focus = ref({ step: 0, degree: 1 })
const buttons = {}
const heading = ref(null)

watch(() => store.selected, (sel, prev) => {
  if (!sel || (prev && sel.x === prev.x && sel.y === prev.y)) return
  const first = plant.value?.steps.findIndex((d) => d > 0) ?? -1
  focus.value = first >= 0 ? { step: first, degree: plant.value.steps[first] } : { step: 0, degree: 1 }
}, { immediate: true })

function key(step, degree) {
  return `${step}:${degree}`
}

function moveTo(step, degree) {
  focus.value = {
    step: (step + STEPS) % STEPS,
    degree: Math.max(1, Math.min(MAX_DEGREE, degree)),
  }
  nextTick(() => buttons[key(focus.value.step, focus.value.degree)]?.focus())
}

function toggle(step, degree) {
  const p = plant.value
  focus.value = { step, degree }
  const on = store.toggleStep(p.x, p.y, step, degree)
  if (on) emit('preview', { type: p.type, degree, x: p.x })
}

function onKeydown(e, step, degree) {
  const map = {
    ArrowRight: () => moveTo(step + 1, degree),
    ArrowLeft: () => moveTo(step - 1, degree),
    ArrowUp: () => moveTo(step, degree + 1),
    ArrowDown: () => moveTo(step, degree - 1),
    Home: () => moveTo(0, degree),
    End: () => moveTo(STEPS - 1, degree),
    PageUp: () => moveTo(step, MAX_DEGREE),
    PageDown: () => moveTo(step, 1),
    Delete: () => { if (plant.value.steps[step]) store.toggleStep(plant.value.x, plant.value.y, step, plant.value.steps[step]) },
  }
  const fn = map[e.key]
  if (!fn) return
  e.preventDefault()
  fn()
}

function focusHeading() {
  nextTick(() => heading.value?.focus())
}

defineExpose({ focusHeading })
</script>

<template>
  <section
    v-if="plant"
    class="editor"
    aria-labelledby="editor-title"
    :style="{ '--plant-color': `var(--c-${plant.type})` }"
  >
    <div class="editor__head">
      <div class="editor__preview">
        <PlantSprite :type="plant.type" :steps="plant.steps" :playhead="store.playhead" :animate="!props.reducedMotion" />
      </div>
      <div>
        <h2 id="editor-title" ref="heading" tabindex="-1">{{ info.label }} <span class="mono">{{ where }}</span></h2>
        <p class="editor__hint">
          Each column is a step, each row a scale degree. Arrow keys move, Enter toggles a leaf, Delete clears the step.
        </p>
      </div>
    </div>

    <div class="roll">
      <div
        v-for="(bar, b) in bars"
        :key="b"
        class="roll__bar"
        role="grid"
        :aria-label="`Steps ${bar[0] + 1} to ${bar[bar.length - 1] + 1}`"
      >
        <div class="roll__row" role="row">
          <span class="roll__corner" role="columnheader"><span class="visually-hidden">Degree</span></span>
          <span
            v-for="s in bar"
            :key="s"
            role="columnheader"
            class="roll__num"
            :class="{ 'is-beat': s % 4 === 0, 'is-now': s === store.playhead }"
          >{{ s + 1 }}</span>
        </div>
        <div v-for="d in degrees" :key="d" class="roll__row" role="row">
          <span role="rowheader" class="roll__deg"><span class="visually-hidden">Degree </span>{{ d }}</span>
          <span v-for="s in bar" :key="s" role="gridcell" class="roll__cellwrap" :class="{ 'is-now': s === store.playhead }">
            <button
              :ref="(el) => { if (el) buttons[key(s, d)] = el }"
              type="button"
              class="roll__cell"
              :class="{ 'is-beat': s % 4 === 0 }"
              :aria-pressed="plant.steps[s] === d ? 'true' : 'false'"
              :aria-label="`Step ${s + 1}, degree ${d}`"
              :tabindex="focus.step === s && focus.degree === d ? 0 : -1"
              @click="toggle(s, d)"
              @keydown="onKeydown($event, s, d)"
            />
          </span>
        </div>
      </div>
    </div>

    <div class="editor__actions">
      <button type="button" class="btn" @click="store.regrow(plant.x, plant.y)">Regrow pattern</button>
      <button type="button" class="btn" @click="store.prune(plant.x, plant.y)">Prune all</button>
      <button type="button" class="btn btn--danger" @click="store.uproot(plant.x, plant.y)">Uproot</button>
      <button type="button" class="btn btn--ghost" @click="emit('close')">Done</button>
    </div>
  </section>
</template>

<style scoped>
.editor { display: grid; gap: 1rem; }
.editor__head { display: flex; gap: 1rem; align-items: center; }
.editor__preview { flex: 0 0 72px; height: 72px; }
h2 { margin: 0; font-size: 1.15rem; }
h2:focus { outline: none; }
h2:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.mono { font-family: var(--mono); font-size: 0.85em; color: var(--muted); margin-left: 0.25rem; }
.editor__hint { margin: 0.25rem 0 0; font-size: 0.85rem; color: var(--muted); }

.roll { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.roll__bar { flex: 1 1 260px; display: grid; gap: 3px; min-width: 0; }
.roll__row { display: grid; grid-template-columns: 1.4rem repeat(8, 1fr); gap: 3px; align-items: center; }
.roll__num, .roll__deg {
  font-family: var(--mono);
  font-size: 0.7rem;
  color: var(--muted);
  text-align: center;
}
.roll__num.is-beat { color: var(--ink); }
.roll__num.is-now { color: var(--accent); }
.roll__cellwrap { display: block; border-radius: 6px; }
.roll__cellwrap.is-now { background: var(--line); }
.roll__cell {
  display: block;
  width: 100%;
  height: 28px;
  border: 1px solid var(--input-border);
  border-radius: 6px;
  background: var(--soil);
  cursor: pointer;
  padding: 0;
}
.roll__cell.is-beat { background: var(--soil-hover); }
.roll__cell:hover { border-color: var(--ink); }
.roll__cell[aria-pressed='true'] {
  background: var(--plant-color, var(--accent));
  border-color: var(--ink);
}
.roll__cell:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; position: relative; z-index: 1; }

.editor__actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
</style>
