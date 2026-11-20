import { useEffect, useId, useRef, useState } from 'react';
import { formatBytes } from '../format.js';

export const WARN_BYTES = 8 * 1024;

export default function ShareBox({ url, bytes }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);
  const id = useId();
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      inputRef.current?.select();
      document.execCommand?.('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="share panel" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Your replay link</h2>
      <div className="share-row">
        <label htmlFor={id} className="sr-only">
          Replay link
        </label>
        <input id={id} ref={inputRef} type="text" readOnly value={url} onFocus={(e) => e.target.select()} />
        <button type="button" className="btn btn-primary" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        {canShare && (
          <button type="button" className="btn" onClick={() => navigator.share({ url }).catch(() => {})}>
            Share…
          </button>
        )}
      </div>
      <p className="hint" aria-live="polite">
        {copied ? 'Link copied to clipboard. ' : ''}
        {`Payload: ${formatBytes(bytes)} after compression. The whole replay is inside the link.`}
      </p>
      {bytes > WARN_BYTES && (
        <p className="warning">
          This link is over 8 KB. Most browsers handle it, but some chat apps cut long links short.
          A shorter message, or fewer rewrites, keeps it safe.
        </p>
      )}
    </section>
  );
}
