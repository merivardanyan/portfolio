import { ref, onMounted, onBeforeUnmount } from 'vue'

export function useReducedMotion() {
  const reduced = ref(false)
  let mq = null
  const update = () => { reduced.value = !!mq?.matches }
  onMounted(() => {
    mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    update()
    mq?.addEventListener?.('change', update)
  })
  onBeforeUnmount(() => mq?.removeEventListener?.('change', update))
  return reduced
}
