import { localAdapter } from './localAdapter.js';
import { createHttpAdapter } from './httpAdapter.js';

const url = import.meta.env.VITE_API_URL;
const mode = import.meta.env.VITE_API_MODE ?? (url ? 'http' : 'local');

export const api = mode === 'http' ? createHttpAdapter(url ?? '') : localAdapter;
export { ApiError, describeError } from './errors.js';
