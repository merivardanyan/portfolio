import { useState } from 'react';
import { QrCode } from './bits.jsx';

export default function SharePanel({ id, billId }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${window.location.pathname}${window.location.search}#/b/${billId}`;
  const canShare = typeof navigator.share === 'function';

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section id={id} className="share panel" aria-labelledby={`${id}-title`}>
      <div className="share-text">
        <h2 id={`${id}-title`}>Send this to the table</h2>
        <p className="muted">Anyone with the link can join and claim items. Only you can edit the bill.</p>
        <div className="share-row">
          <label htmlFor={`${id}-url`} className="sr-only">
            Bill link
          </label>
          <input id={`${id}-url`} type="text" readOnly value={url} onFocus={(e) => e.target.select()} className="mono" />
          <button type="button" className="btn btn-primary" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          {canShare && (
            <button type="button" className="btn" onClick={() => navigator.share({ url, title: 'Fair Share' }).catch(() => {})}>
              Share…
            </button>
          )}
        </div>
        <p className="sr-only" aria-live="polite">
          {copied ? 'Link copied' : ''}
        </p>
      </div>
      <QrCode text={url} label={`QR code for ${url}`} />
    </section>
  );
}
