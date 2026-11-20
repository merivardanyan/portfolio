<script setup>
import { computed, ref, watch } from 'vue'
import { STEPS } from '../state/garden.js'

const props = defineProps({
  type: { type: String, required: true },
  steps: { type: Uint8Array, required: true },
  playhead: { type: Number, default: -1 },
  animate: { type: Boolean, default: true },
})

const root = ref(null)

const leaves = computed(() => {
  const out = []
  for (let s = 0; s < STEPS; s++) {
    const d = props.steps[s]
    if (!d) continue
    const r0 = 15
    const len = 10 + d * 4
    const w = 3.2 + d * 0.35
    const mid = r0 + len / 2
    out.push({
      step: s,
      d: `M0 ${-r0} Q ${w} ${-mid} 0 ${-(r0 + len)} Q ${-w} ${-mid} 0 ${-r0} Z`,
      angle: (s / STEPS) * 360,
    })
  }
  return out
})

const GLYPHS = {
  bass: 'M-8 -6 Q-8 -9 -5 -9 L5 -9 Q8 -9 8 -6 L8 6 Q8 9 5 9 L-5 9 Q-8 9 -8 6 Z',
  pad: 'M0 -9 A9 9 0 1 1 -0.01 -9 Z',
  pluck: 'M0 -10 L9 7 Q9 9 7 9 L-7 9 Q-9 9 -9 7 Z',
  bell: 'M0 -10 L2.9 -4 9.5 -3.1 4.7 1.5 5.9 8.1 0 5 -5.9 8.1 -4.7 1.5 -9.5 -3.1 -2.9 -4 Z',
}

const playheadAngle = computed(() => (props.playhead / STEPS) * 360)

watch(() => props.playhead, (step) => {
  if (step < 0 || !props.animate || !props.steps[step] || !root.value?.animate) return
  root.value.animate(
    [
      { transform: 'scale(1) rotate(0deg)' },
      { transform: 'scale(1.14) rotate(4deg)', offset: 0.25 },
      { transform: 'scale(1) rotate(0deg)' },
    ],
    { duration: 380, easing: 'ease-out' },
  )
  const leaf = root.value.querySelector(`[data-step="${step}"]`)
  leaf?.animate([{ opacity: 1, strokeWidth: 3 }, { opacity: 0.85, strokeWidth: 0 }], { duration: 420, easing: 'ease-out' })
})
</script>

<template>
  <svg class="sprite" :class="`sprite--${type}`" viewBox="-54 -54 108 108" aria-hidden="true" focusable="false">
    <g ref="root" class="sprite__body">
      <circle class="sprite__branch" r="15" />
      <path
        v-for="leaf in leaves"
        :key="leaf.step"
        class="sprite__leaf"
        :class="{ 'is-current': leaf.step === playhead }"
        :data-step="leaf.step"
        :d="leaf.d"
        :transform="`rotate(${leaf.angle})`"
      />
      <path class="sprite__glyph" :d="GLYPHS[type]" />
    </g>
    <circle
      v-if="playhead >= 0"
      class="sprite__tick"
      r="2.4"
      cy="-15"
      :transform="`rotate(${playheadAngle})`"
    />
  </svg>
</template>

<style scoped>
.sprite {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  --c: var(--c-pluck);
}
.sprite--bass { --c: var(--c-bass); }
.sprite--pad { --c: var(--c-pad); }
.sprite--bell { --c: var(--c-bell); }
.sprite__body { transform-box: fill-box; transform-origin: center; }
.sprite__branch { fill: none; stroke: var(--c); stroke-width: 2; opacity: 0.55; }
.sprite__leaf { fill: var(--c); stroke: var(--ink); stroke-width: 0; opacity: 0.85; }
.sprite__leaf.is-current { opacity: 1; stroke-width: 2; }
.sprite__glyph { fill: var(--c); stroke: var(--soil-deep); stroke-width: 1.5; }
.sprite__tick { fill: var(--ink); }
</style>
