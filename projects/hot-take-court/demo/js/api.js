import { createLocalAdapter } from './local-adapter.js'
import { createHttpAdapter } from './http-adapter.js'

// Set window.HTC_API_URL in config.js to point the demo at the PHP app; otherwise it runs on localStorage.
const apiUrl = typeof window !== 'undefined' ? window.HTC_API_URL : ''

export const api = apiUrl ? createHttpAdapter(apiUrl) : createLocalAdapter()
export { ApiError } from './local-adapter.js'
