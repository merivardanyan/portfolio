import { onBeforeUnmount, watch, toRaw } from 'vue'
import { createEngine } from '../audio/engine.js'

/** Bridges the audio engine and the store; the rAF loop maps the audio clock to `playhead`. */
export function usePlayback(store) {
  const engine = createEngine({ getGarden: () => toRaw(store.garden) })
  let raf = 0

  function frame() {
    const step = engine.currentStep()
    if (step !== null) store.playhead = step
    raf = requestAnimationFrame(frame)
  }

  function play() {
    if (!engine.supported) {
      store.announce('Web Audio is not available in this browser.')
      return
    }
    engine.setVolume(store.volume)
    engine.start()
    store.playing = true
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(frame)
  }

  function stop() {
    engine.stop()
    store.playing = false
    store.playhead = -1
    cancelAnimationFrame(raf)
  }

  function toggle() {
    if (store.playing) stop()
    else play()
  }

  function preview(type, degree, x) {
    if (!store.playing && engine.supported) {
      engine.setVolume(store.volume)
      engine.preview(type, degree, x)
    }
  }

  watch(() => store.volume, (v) => engine.setVolume(v))
  watch(() => store.garden.season, (s) => engine.setSeason(s))

  onBeforeUnmount(() => {
    stop()
    engine.close()
  })

  return { play, stop, toggle, preview }
}
