import { applyEvent, duration } from './engine.js';

const WORD_CHAR = /[\p{L}\p{N}'’-]/u;
const BOUNDARY = /[^\p{L}\p{N}'’-]/u;

function wordAt(text, pos) {
  let start = Math.min(pos, text.length);
  let end = start;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
  while (end < text.length && WORD_CHAR.test(text[end])) end++;
  return text.slice(start, end).replace(/^['’-]+|['’-]+$/g, '');
}

export function computeStats(events) {
  const total = duration(events);
  let text = '';
  let deletions = 0;
  let deletedChars = 0;
  let longestPause = 0;
  let prevT = 0;
  let pending = null;
  const rewritten = new Map();

  const settle = () => {
    if (pending === null) return;
    const word = wordAt(text, pending).toLowerCase();
    if (word.length > 1) rewritten.set(word, (rewritten.get(word) ?? 0) + 1);
    pending = null;
  };

  for (const e of events) {
    longestPause = Math.max(longestPause, e.t - prevT);
    prevT = e.t;
    text = applyEvent(text, e);
    if (e.type === 'delete') {
      deletions++;
      deletedChars += e.len;
      pending = pending === null ? e.pos : Math.min(pending, e.pos);
    } else if (pending !== null) {
      if (e.pos < pending) pending += e.text.length;
      else if (BOUNDARY.test(e.text)) settle();
    }
  }
  settle();

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const minutes = total / 60000;
  let mostRewritten = null;
  for (const [word, count] of rewritten) {
    if (!mostRewritten || count > mostRewritten.count) mostRewritten = { word, count };
  }

  return {
    durationMs: total,
    words,
    characters: text.length,
    wpm: minutes > 0 ? Math.round(words / minutes) : 0,
    deletions,
    deletedChars,
    longestPauseMs: longestPause,
    mostRewritten,
  };
}
