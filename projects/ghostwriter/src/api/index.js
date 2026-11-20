import { localAdapter } from './localAdapter.js';

// Ghostwriter is serverless by design: the replay lives in the URL hash, so `local` is the
// only adapter. The module keeps the same shape as the other projects (api + ApiError).
export const api = localAdapter;
export { ApiError } from './errors.js';
