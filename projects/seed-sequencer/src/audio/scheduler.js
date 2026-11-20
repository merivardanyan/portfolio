/**
 * Look-ahead scheduler ("A Tale of Two Clocks"): a coarse JS timer wakes up every `intervalMs`
 * and schedules every step whose start time falls inside the next `lookahead` seconds of the
 * audio clock. Notes are placed on the sample-accurate AudioContext timeline, so timer jitter
 * never reaches the audio.
 */
export function createScheduler({
  getTime,
  getStepDuration,
  onStep,
  steps = 16,
  lookahead = 0.12,
  getLookahead = () => lookahead,
  intervalMs = 25,
  startDelay = 0.05,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
}) {
  let timer = null
  let nextTime = 0
  let step = 0
  const queue = []

  function tick() {
    const now = getTime()
    // Timer starved (throttled tab): skip missed steps instead of firing them all at once.
    while (nextTime < now - 0.02) {
      nextTime += getStepDuration()
      step = (step + 1) % steps
    }
    const horizon = now + getLookahead()
    while (nextTime < horizon) {
      onStep(step, nextTime)
      queue.push({ step, time: nextTime })
      // rAF (the only consumer) pauses in hidden tabs; keep just the latest bar.
      if (queue.length > steps) queue.splice(0, queue.length - steps)
      nextTime += getStepDuration()
      step = (step + 1) % steps
    }
    timer = setTimer(tick, intervalMs)
  }

  return {
    start() {
      if (timer !== null) return
      step = 0
      queue.length = 0
      nextTime = getTime() + startDelay
      tick()
    },
    stop() {
      if (timer !== null) clearTimer(timer)
      timer = null
      queue.length = 0
    },
    get backlog() {
      return queue.length
    },
    get running() {
      return timer !== null
    },
    /** Most recent step whose start time has passed, or null if none since the last call. */
    currentStep(now = getTime()) {
      let current = -1
      while (queue.length && queue[0].time <= now) current = queue.shift().step
      if (current === -1) return null
      return current
    },
  }
}
