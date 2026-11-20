export const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const SCALES = {
  majorPentatonic: { label: 'Major pentatonic', intervals: [0, 2, 4, 7, 9] },
  minorPentatonic: { label: 'Minor pentatonic', intervals: [0, 3, 5, 7, 10] },
}
export const SCALE_IDS = Object.keys(SCALES)

export const MAX_DEGREE = 7

export function degreeToSemitone(degree, scaleId) {
  if (!Number.isInteger(degree) || degree < 1 || degree > MAX_DEGREE) {
    throw new RangeError(`degree must be 1-${MAX_DEGREE}, got ${degree}`)
  }
  const intervals = (SCALES[scaleId] ?? SCALES.majorPentatonic).intervals
  const i = degree - 1
  return intervals[i % intervals.length] + 12 * Math.floor(i / intervals.length)
}

export function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12)
}

export function noteFrequency({ degree, key, scale, baseMidi }) {
  return midiToFrequency(baseMidi + key + degreeToSemitone(degree, scale))
}

export function stepDuration(tempo) {
  return 60 / tempo / 4
}
