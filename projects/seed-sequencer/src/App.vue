<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { useGardenStore } from './stores/garden.js'
import { shareUrl } from './state/serialize.js'
import { usePlayback } from './composables/usePlayback.js'
import { useReducedMotion } from './composables/useReducedMotion.js'
import TransportBar from './components/TransportBar.vue'
import SoilGrid from './components/SoilGrid.vue'
import SeedPicker from './components/SeedPicker.vue'
import PlantEditor from './components/PlantEditor.vue'

const store = useGardenStore()
const reducedMotion = useReducedMotion()
const playback = usePlayback(store)
const editorPanel = ref(null)
const link = ref('')
const linkStatus = ref('')
const linkInput = ref(null)

function stripHash() {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search)
}

store.init(location.hash)
stripHash()

watchEffect(() => {
  document.documentElement.dataset.season = store.garden.season
})

async function share() {
  link.value = shareUrl(store.garden, location)
  linkStatus.value = ''
  try {
    await navigator.clipboard.writeText(link.value)
    linkStatus.value = 'Link copied. Anyone who opens it gets an editable copy.'
  } catch {
    linkStatus.value = 'Copy the link below.'
  }
  store.announce(linkStatus.value)
  await nextTick()
  linkInput.value?.select()
}

function onEdit() {
  if (!window.matchMedia('(max-width: 900px)').matches) return
  nextTick(() => editorPanel.value?.scrollIntoView({ block: 'nearest', behavior: reducedMotion.value ? 'auto' : 'smooth' }))
}

function closeEditor() {
  const sel = store.selected
  store.select(null)
  if (sel) document.querySelector('.soil__cell[tabindex="0"]')?.focus()
}

function onKeydown(e) {
  const t = e.target
  const typing = t instanceof HTMLElement && (t.isContentEditable || (t.tagName === 'INPUT' && t.type === 'text') || t.tagName === 'TEXTAREA')
  const mod = e.ctrlKey || e.metaKey
  if (mod && !typing && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) store.redo()
    else store.undo()
  } else if (mod && !typing && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    store.redo()
  } else if (e.key === ' ' && (t === document.body || t === document.documentElement)) {
    e.preventDefault()
    playback.toggle()
  } else if (e.key === 'Escape' && store.selected) {
    closeEditor()
  }
}

function onHashChange() {
  if (store.openShared(location.hash)) stripHash()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('hashchange', onHashChange)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('hashchange', onHashChange)
})
</script>

<template>
  <a class="back-pill" href="../../">← Portfolio</a>
  <div class="app">
    <header class="masthead">
      <h1>Seed Sequencer</h1>
      <p class="tagline">Every plant is a loop. Plant seeds, prune leaves, share the song.</p>
    </header>

    <div v-if="store.brokenLink" class="banner banner--warn" role="alert">
      <p>That garden link is damaged or incomplete, so it couldn’t be opened. {{ store.garden.plants.length ? 'Your last garden is shown instead.' : '' }} Ask the sender to copy it again.</p>
      <button type="button" class="btn btn--ghost" @click="store.brokenLink = false">Dismiss</button>
    </div>

    <p v-if="store.remixed && !store.brokenLink" class="banner" role="status">
      You opened a shared garden. This is your own copy, so remix away. The original link is unchanged.
    </p>

    <TransportBar @toggle-play="playback.toggle()" @share="share" />

    <div v-if="link" class="share">
      <label for="share-link" class="share__label">Link to this garden</label>
      <div class="share__row">
        <input id="share-link" ref="linkInput" class="share__input" type="text" readonly :value="link" @focus="$event.target.select()" />
        <button type="button" class="btn" @click="share">Copy again</button>
      </div>
      <p class="share__status">{{ linkStatus }}</p>
    </div>

    <main class="layout">
      <section class="garden" aria-label="Garden">
        <SoilGrid :reduced-motion="reducedMotion" @edit="onEdit" />
      </section>
      <aside ref="editorPanel" class="panel">
        <SeedPicker />
        <PlantEditor
          v-if="store.selectedPlant"
          :reduced-motion="reducedMotion"
          @preview="(p) => playback.preview(p.type, p.degree, p.x)"
          @close="closeEditor"
        />
        <p v-else class="panel__empty">
          Pick a seed, then click empty soil to plant it. Click a plant to edit its leaves: each leaf is a note,
          and its length is the pitch. Everything snaps to a pentatonic scale, so it always sounds good.
        </p>
      </aside>
    </main>

    <footer class="foot">
      <p>Static demo: your garden lives in your browser and in the link you share. Nothing is uploaded.</p>
      <p class="keys">
        <kbd>Space</kbd> play/stop · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> redo ·
        <kbd>Esc</kbd> close editor
      </p>
    </footer>
  </div>
  <p class="visually-hidden" aria-live="polite">{{ store.announcement }}</p>
</template>
