import { useCallback, useReducer, useRef } from 'react';
import { diffEdit } from '../../core/diff.js';
import { textAtCount } from '../../core/engine.js';
import { LIMITS } from '../../core/codec.js';

export const MAX_EVENTS = LIMITS.maxEvents;
const RESUME_GAP_MS = 1000;

const insertedChars = (events) => events.reduce((n, e) => n + (e.type === 'insert' ? e.text.length : 0), 0);

export function init(draft) {
  const events = Array.isArray(draft?.events) ? draft.events : [];
  let text = '';
  try {
    text = textAtCount(events, events.length);
  } catch {
    return { events: [], text: '', committed: '', textChars: 0, full: false };
  }
  return { events, text, committed: text, textChars: insertedChars(events), full: events.length >= MAX_EVENTS };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'compose':
      return { ...state, text: action.value };
    case 'commit': {
      const { value, caret, t } = action;
      if (value === state.committed) return { ...state, text: value };
      if (state.full) return { ...state, text: state.committed };
      const d = diffEdit(state.committed, value, caret);
      const added = [];
      if (d.removed) added.push({ t, type: 'delete', pos: d.pos, len: d.removed });
      if (d.inserted) added.push({ t, type: 'insert', pos: d.pos, text: d.inserted });
      const textChars = state.textChars + d.inserted.length;
      if (textChars > LIMITS.maxTextChars || value.length > LIMITS.maxDocChars) {
        return { ...state, text: state.committed, overLimit: true };
      }
      const events = state.events.concat(added);
      return { events, text: value, committed: value, textChars, overLimit: false, full: events.length >= MAX_EVENTS };
    }
    case 'reset':
      return init(null);
    default:
      return state;
  }
}

export function useRecorder(draft) {
  const [state, dispatch] = useReducer(reducer, draft, init);
  const composing = useRef(false);
  const origin = useRef(null);

  const now = useCallback(() => {
    const t = performance.now();
    if (origin.current === null) {
      const last = state.events.length ? state.events[state.events.length - 1].t : -RESUME_GAP_MS;
      origin.current = t - (last + RESUME_GAP_MS);
    }
    return Math.round(t - origin.current);
  }, [state.events]);

  const commit = useCallback(
    (el) => dispatch({ type: 'commit', value: el.value, caret: el.selectionEnd, t: now() }),
    [now],
  );

  const handlers = {
    onChange: (e) => {
      if (composing.current || e.nativeEvent?.isComposing) {
        dispatch({ type: 'compose', value: e.target.value });
      } else {
        commit(e.target);
      }
    },
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (e) => {
      composing.current = false;
      commit(e.target);
    },
  };

  const reset = useCallback(() => {
    origin.current = null;
    dispatch({ type: 'reset' });
  }, []);

  return { ...state, handlers, reset };
}
