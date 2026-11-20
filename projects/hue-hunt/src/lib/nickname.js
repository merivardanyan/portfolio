export const NICKNAME_MAX = 24;

const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

export function graphemeLength(str) {
  return segmenter ? [...segmenter.segment(str)].length : Array.from(str).length;
}

// Letters, marks, digits, emoji (incl. ZWJ sequences and skin tones), spaces and common punctuation.
const ALLOWED = /^[\p{L}\p{M}\p{N}\p{Extended_Pictographic}\p{Emoji_Component}‍️ _.,!?'’&()+-]+$/u;

export function validateNickname(raw) {
  const value = (raw ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!value) return { ok: true, value: '' };
  if (graphemeLength(value) > NICKNAME_MAX) {
    return { ok: false, error: `Use at most ${NICKNAME_MAX} characters.` };
  }
  if (!ALLOWED.test(value)) {
    return { ok: false, error: "Use letters, numbers, emoji, spaces and . , ! ? ' & ( ) + - _ only." };
  }
  return { ok: true, value };
}
