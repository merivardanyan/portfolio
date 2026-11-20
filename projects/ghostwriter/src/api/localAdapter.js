import { CodecError, decode, encode } from '../../core/codec.js';
import { clearDraft, loadDraft, saveDraft } from './drafts.js';
import { ApiError } from './errors.js';

function toApiError(err) {
  if (err instanceof ApiError) return err;
  if (err instanceof CodecError) return new ApiError(400, 'invalid_replay', err.message);
  return new ApiError(500, 'internal', err?.message ?? 'Unexpected error');
}

export const localAdapter = {
  name: 'local',
  saveDraft,
  loadDraft,
  clearDraft,

  async createLink(replay) {
    try {
      const payload = await encode(replay);
      return { hash: `#r=${payload}`, bytes: payload.length };
    } catch (err) {
      throw toApiError(err);
    }
  },

  async resolve(hash) {
    const payload = new URLSearchParams(hash.replace(/^#/, '')).get('r');
    if (!payload) return null;
    try {
      return await decode(payload);
    } catch (err) {
      throw toApiError(err);
    }
  },
};
