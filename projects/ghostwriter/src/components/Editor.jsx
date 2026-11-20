import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../api/index.js';
import { MAX_EVENTS, useRecorder } from '../hooks/useRecorder.js';
import { duration } from '../../core/engine.js';
import { LIMITS } from '../../core/codec.js';
import { formatClock } from '../format.js';
import ShareBox from './ShareBox.jsx';

export default function Editor({ onPreview }) {
  const draft = useMemo(() => api.loadDraft(), []);
  const rec = useRecorder(draft);
  const [title, setTitle] = useState(draft?.title ?? '');
  const [reveal, setReveal] = useState(Boolean(draft?.reveal));
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);
  const ids = { title: useId(), text: useId(), hint: useId(), reveal: useId() };

  useEffect(() => {
    const id = setTimeout(() => api.saveDraft({ title, reveal, events: rec.events }), 400);
    return () => clearTimeout(id);
  }, [title, reveal, rec.events]);

  useEffect(() => {
    setLink(null);
  }, [title, reveal, rec.events]);

  const hasContent = rec.events.length > 0;
  const replay = () => ({ v: 1, title: title.trim() || undefined, reveal, createdAt: Date.now(), events: rec.events });

  async function createLink() {
    setBusy(true);
    setError('');
    try {
      const { hash, bytes } = await api.createLink(replay());
      const url = `${window.location.origin}${window.location.pathname}${window.location.search}${hash}`;
      setLink({ url, bytes });
    } catch (err) {
      setError(`Could not create the link: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    if (hasContent && !window.confirm('Discard this recording and start over?')) return;
    rec.reset();
    setTitle('');
    setReveal(false);
    api.clearDraft();
    textareaRef.current?.focus();
  }

  return (
    <section className="editor" aria-labelledby="editor-title">
      <div className="intro">
        <h1 id="editor-title">Write it once. Let them watch you write it.</h1>
        <p className="lede">
          Every keystroke, pause and backspace is recorded. Share a link that plays it back exactly
          as it happened, typos and hesitations included.
        </p>
      </div>

      <div className="field">
        <label htmlFor={ids.title}>
          Title <span className="optional">(optional)</span>
        </label>
        <input
          id={ids.title}
          type="text"
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="For Sam"
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label htmlFor={ids.text}>Your message</label>
        <div className="paper paper-input">
          <textarea
            id={ids.text}
            ref={textareaRef}
            value={rec.text}
            {...rec.handlers}
            aria-describedby={ids.hint}
            placeholder="Start typing. The recording starts with your first keystroke."
            spellCheck="true"
            rows={10}
          />
        </div>
        <p id={ids.hint} className="hint">
          {hasContent
            ? `${rec.events.length.toLocaleString()} edits · ${formatClock(duration(rec.events))} recorded · draft saved in this browser`
            : 'Nothing recorded yet. Pasting works too, it shows up as one big jump.'}
        </p>
        {(rec.full || rec.overLimit) && (
          <p className="warning" role="alert">
            Recording limit reached (at most {MAX_EVENTS.toLocaleString()} edits and {LIMITS.maxTextChars.toLocaleString()} characters per replay). Further changes are not recorded.
          </p>
        )}
      </div>

      <div className="check">
        <input id={ids.reveal} type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} />
        <label htmlFor={ids.reveal}>Keep the words blurred until the replay ends</label>
      </div>

      <div className="actions">
        <button type="button" className="btn btn-primary" disabled={!hasContent || busy} onClick={createLink}>
          {busy ? 'Creating…' : 'Create link'}
        </button>
        <button type="button" className="btn" disabled={!hasContent} onClick={() => onPreview(replay())}>
          Preview replay
        </button>
        <button type="button" className="btn btn-quiet" disabled={!hasContent && !title} onClick={startOver}>
          Start over
        </button>
      </div>

      {error && (
        <p className="warning" role="alert">
          {error}
        </p>
      )}
      {link && <ShareBox {...link} />}
    </section>
  );
}
