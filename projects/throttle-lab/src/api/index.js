import { createLocalAdapter } from './localAdapter.js'
import { createHttpAdapter } from './httpAdapter.js'

export { ApiError } from './errors.js'

// VITE_API_URL set (and VITE_API_MODE not forced to "local") -> real server; otherwise in-browser emulation.
const url = import.meta.env.VITE_API_URL || ''
const mode = import.meta.env.VITE_API_MODE || (url ? 'http' : 'local')

export const api = mode === 'http' && url ? createHttpAdapter(url) : createLocalAdapter()
