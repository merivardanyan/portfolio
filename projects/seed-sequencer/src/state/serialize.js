import { SCALE_IDS, MAX_DEGREE } from '../music/theory.js'
import {
  GRID_SIZE, STEPS, MAX_PLANTS, TEMPO_MIN, TEMPO_MAX, PLANT_TYPES, SEASONS, createGarden, createPlant, cellIndex,
} from './garden.js'

const VERSION = 1
const HEADER_BYTES = 6
const PLANT_BYTES = 2 + STEPS / 2

export function toBase64Url(bytes) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(str) {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) throw new Error('Invalid base64url')
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * Binary layout: [v, tempo, key, scale, season, count], then per plant
 * [y<<4 | x, type, 8 bytes of step nibbles (two steps per byte, high nibble first)].
 * 16 plants fit in 166 bytes, about 222 URL characters.
 */
export function encodeGarden(garden) {
  const plants = garden.plants.slice(0, MAX_PLANTS)
  const bytes = new Uint8Array(HEADER_BYTES + plants.length * PLANT_BYTES)
  bytes[0] = VERSION
  bytes[1] = garden.tempo
  bytes[2] = garden.key
  bytes[3] = Math.max(0, SCALE_IDS.indexOf(garden.scale))
  bytes[4] = Math.max(0, SEASONS.indexOf(garden.season))
  bytes[5] = plants.length
  plants.forEach((p, i) => {
    const o = HEADER_BYTES + i * PLANT_BYTES
    bytes[o] = (p.y << 4) | p.x
    bytes[o + 1] = PLANT_TYPES.indexOf(p.type)
    for (let s = 0; s < STEPS; s += 2) {
      bytes[o + 2 + s / 2] = (p.steps[s] << 4) | p.steps[s + 1]
    }
  })
  return toBase64Url(bytes)
}

export function decodeGarden(str) {
  const bytes = fromBase64Url(str)
  if (bytes.length < HEADER_BYTES) throw new Error('Garden data is too short')
  if (bytes[0] !== VERSION) throw new Error(`Unsupported garden version ${bytes[0]}`)
  const [, tempo, key, scaleIdx, seasonIdx, count] = bytes
  if (tempo < TEMPO_MIN || tempo > TEMPO_MAX) throw new Error('Tempo out of range')
  if (key > 11) throw new Error('Key out of range')
  if (scaleIdx >= SCALE_IDS.length || seasonIdx >= SEASONS.length) throw new Error('Unknown scale or season')
  if (count > MAX_PLANTS) throw new Error('Too many plants')
  if (bytes.length !== HEADER_BYTES + count * PLANT_BYTES) throw new Error('Garden data has the wrong length')

  const plants = []
  const seen = new Set()
  for (let i = 0; i < count; i++) {
    const o = HEADER_BYTES + i * PLANT_BYTES
    const x = bytes[o] & 0x0f
    const y = bytes[o] >> 4
    const type = PLANT_TYPES[bytes[o + 1]]
    if (x >= GRID_SIZE || y >= GRID_SIZE || !type) throw new Error('Invalid plant')
    const cell = cellIndex(x, y)
    if (seen.has(cell)) throw new Error('Two plants share a cell')
    seen.add(cell)
    const steps = new Uint8Array(STEPS)
    for (let s = 0; s < STEPS; s += 2) {
      const b = bytes[o + 2 + s / 2]
      steps[s] = b >> 4
      steps[s + 1] = b & 0x0f
    }
    if (steps.some((d) => d > MAX_DEGREE)) throw new Error('Invalid scale degree')
    plants.push(createPlant(x, y, type, steps))
  }

  return createGarden({
    tempo, key, scale: SCALE_IDS[scaleIdx], season: SEASONS[seasonIdx], plants,
  })
}

/** True when the hash carries a garden payload at all, valid or not. */
export function hashHasGarden(hash) {
  return /(?:^#|&)g=/.test(hash || '')
}

export function gardenFromHash(hash) {
  const match = /(?:^#|&)g=([^&]*)/.exec(hash || '')
  if (!match) return null
  try {
    return decodeGarden(match[1])
  } catch {
    return null
  }
}

export function shareUrl(garden, { origin, pathname, search = '' }) {
  return `${origin}${pathname}${search}#g=${encodeGarden(garden)}`
}
