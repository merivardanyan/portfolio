/** Real wall clock. */
export const systemClock = Object.freeze({ now: () => Date.now() });

/**
 * Manual clock for tests and the step-through visualizer.
 * @param {number} [start=0]
 */
export function createManualClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance(ms) {
      if (!(Number.isFinite(ms) && ms >= 0)) throw new RangeError('advance(ms) needs a finite ms >= 0');
      t += ms;
      return t;
    },
    set(ms) {
      if (!Number.isFinite(ms)) throw new RangeError('set(ms) needs a finite number');
      t = ms;
      return t;
    },
  };
}
