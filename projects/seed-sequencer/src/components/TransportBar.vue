<script setup>
import { useGardenStore } from '../stores/garden.js'
import { KEYS, SCALES, SCALE_IDS } from '../music/theory.js'
import { SEASONS, SEASON_INFO, TEMPO_MIN, TEMPO_MAX } from '../state/garden.js'

const emit = defineEmits(['toggle-play', 'share'])
const store = useGardenStore()

const onTempo = (e) => store.setGlobal('tempo', Number(e.target.value), 'Change tempo')
const onKey = (e) => store.setGlobal('key', Number(e.target.value), 'Change key')
const onScale = (e) => store.setGlobal('scale', e.target.value, 'Change scale')
const onSeason = (e) => store.setGlobal('season', e.target.value, 'Change season')
const onVolume = (e) => store.setVolume(Number(e.target.value))
</script>

<template>
  <div class="transport" role="group" aria-label="Playback and garden settings">
    <button
      type="button"
      class="play"
      :aria-pressed="store.playing ? 'true' : 'false'"
      @click="emit('toggle-play')"
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <rect v-if="store.playing" x="5" y="5" width="10" height="10" rx="1.5" />
        <path v-else d="M6 4.5v11l9.5-5.5z" />
      </svg>
      <span>{{ store.playing ? 'Stop' : 'Play' }}</span>
    </button>

    <label class="field field--range">
      <span class="field__label">Tempo <output class="mono">{{ store.garden.tempo }} bpm</output></span>
      <input type="range" :min="TEMPO_MIN" :max="TEMPO_MAX" step="1" :value="store.garden.tempo" @input="onTempo" />
    </label>

    <label class="field">
      <span class="field__label">Key</span>
      <select :value="store.garden.key" @change="onKey">
        <option v-for="(k, i) in KEYS" :key="k" :value="i">{{ k }}</option>
      </select>
    </label>

    <label class="field">
      <span class="field__label">Scale</span>
      <select :value="store.garden.scale" @change="onScale">
        <option v-for="id in SCALE_IDS" :key="id" :value="id">{{ SCALES[id].label }}</option>
      </select>
    </label>

    <label class="field">
      <span class="field__label">Season</span>
      <select :value="store.garden.season" @change="onSeason">
        <option v-for="s in SEASONS" :key="s" :value="s">{{ SEASON_INFO[s].label }}</option>
      </select>
    </label>

    <label class="field field--range">
      <span class="field__label">Volume <output class="mono">{{ Math.round(store.volume * 100) }}%</output></span>
      <input type="range" min="0" max="1" step="0.01" :value="store.volume" @input="onVolume" />
    </label>

    <div class="tools">
      <button type="button" class="btn" :disabled="!store.canUndo" aria-keyshortcuts="Control+Z" @click="store.undo()">Undo</button>
      <button type="button" class="btn" :disabled="!store.canRedo" aria-keyshortcuts="Control+Shift+Z" @click="store.redo()">Redo</button>
      <button type="button" class="btn" @click="store.randomize()">Randomize</button>
      <button type="button" class="btn" :disabled="!store.garden.plants.length" @click="store.clearAll()">Clear</button>
      <button type="button" class="btn btn--primary" @click="emit('share')">Share link</button>
    </div>
  </div>
</template>

<style scoped>
.transport {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem 1rem;
  padding: 0.9rem;
  border-radius: 14px;
  background: var(--panel);
  box-shadow: inset 0 0 0 1px var(--line);
}
.play {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0 1.1rem;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-ink);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.play svg { width: 18px; height: 18px; fill: currentColor; }
.play:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.field { display: grid; gap: 0.3rem; min-width: 0; }
.field--range { flex: 1 1 150px; }
.field__label { font-size: 0.78rem; color: var(--muted); display: flex; justify-content: space-between; gap: 0.5rem; }
.field__label output { color: var(--ink); }
.mono { font-family: var(--mono); }
select {
  min-height: 36px;
  padding: 0 0.5rem;
  border: 1px solid var(--input-border);
  border-radius: 8px;
  background: var(--panel-2);
  color: var(--ink);
  font: inherit;
  font-size: 0.9rem;
}
input[type='range'] { width: 100%; min-height: 36px; accent-color: var(--accent); }
select:focus-visible, input:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.tools { display: flex; flex-wrap: wrap; gap: 0.5rem; flex: 1 1 100%; }
</style>
