<script setup>
import { useGardenStore } from '../stores/garden.js'
import { PLANT_TYPES, PLANT_INFO, MAX_PLANTS } from '../state/garden.js'
import PlantSprite from './PlantSprite.vue'

const store = useGardenStore()
const sample = {
  bass: Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0]),
  pad: Uint8Array.from([3, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0]),
  pluck: Uint8Array.from([2, 0, 4, 0, 5, 0, 3, 0, 2, 0, 4, 0, 6, 0, 5, 0]),
  bell: Uint8Array.from([0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0]),
}
</script>

<template>
  <fieldset class="seeds">
    <legend>Seed to plant <span class="count">{{ store.garden.plants.length }}/{{ MAX_PLANTS }} plants</span></legend>
    <div class="seeds__list">
      <label v-for="type in PLANT_TYPES" :key="type" class="seed" :class="{ 'is-on': store.seedType === type }">
        <input v-model="store.seedType" class="visually-hidden" type="radio" name="seed" :value="type" />
        <span class="seed__icon"><PlantSprite :type="type" :steps="sample[type]" :animate="false" /></span>
        <span class="seed__label">{{ PLANT_INFO[type].label }}</span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.seeds { border: 0; margin: 0; padding: 0; min-width: 0; }
legend { padding: 0; margin-bottom: 0.5rem; font-weight: 600; display: flex; gap: 0.5rem; align-items: baseline; }
.count { font-family: var(--mono); font-size: 0.75rem; color: var(--muted); font-weight: 400; }
.seeds__list { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.5rem; }
.seed {
  display: grid;
  justify-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.25rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel-2);
  cursor: pointer;
  text-align: center;
}
.seed:hover { border-color: var(--ink); }
.seed.is-on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.seed:has(input:focus-visible) { outline: 3px solid var(--focus); outline-offset: 2px; }
.seed__icon { width: 40px; height: 40px; }
.seed__label { font-size: 0.78rem; line-height: 1.2; }
</style>
