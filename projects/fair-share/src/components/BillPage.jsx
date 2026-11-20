import { useEffect, useRef, useState } from 'react';
import { api } from '../api/index.js';
import { useBillStore } from '../store/billStore.js';
import { StatusPill } from './bits.jsx';
import HostPanel from './HostPanel.jsx';
import ItemList from './ItemList.jsx';
import JoinCard from './JoinCard.jsx';
import SharePanel from './SharePanel.jsx';
import Summary from './Summary.jsx';

export default function BillPage({ billId }) {
  const open = useBillStore((s) => s.open);
  const close = useBillStore((s) => s.close);
  const view = useBillStore((s) => s.view);
  const split = useBillStore((s) => s.split);
  const status = useBillStore((s) => s.status);
  const loadError = useBillStore((s) => s.loadError);
  const me = useBillStore((s) => s.me);
  const hostToken = useBillStore((s) => s.hostToken);
  const notice = useBillStore((s) => s.notice);
  const dismissNotice = useBillStore((s) => s.dismissNotice);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSeen, setShareSeen] = useState(false);
  const noticeRef = useRef(null);

  useEffect(() => {
    open(billId);
    return () => close();
  }, [billId, open, close]);

  useEffect(() => {
    if (view && hostToken && !shareSeen && view.participants.length === 0) {
      setShareOpen(true);
      setShareSeen(true);
    }
  }, [view, hostToken, shareSeen]);

  useEffect(() => {
    if (view) document.title = `${view.title || 'Bill'} · Fair Share`;
  }, [view]);

  if (loadError) {
    return (
      <section className="panel" aria-labelledby="err-title">
        <h1 id="err-title">Bill not found</h1>
        <p>{loadError}</p>
        <a className="btn btn-primary" href="#/new">
          Start a new bill
        </a>
      </section>
    );
  }

  if (!view || !split) {
    return (
      <p className="loading" role="status">
        Loading bill…
      </p>
    );
  }

  const meP = view.participants.find((p) => p.id === me) ?? null;

  return (
    <div className="bill">
      <header className="bill-head">
        <div>
          <p className="kicker mono">
            Bill {view.id} · {view.currency}
          </p>
          <h1>{view.title || 'Untitled bill'}</h1>
        </div>
        <div className="bill-head-actions">
          <StatusPill status={status} />
          <button
            type="button"
            className="btn"
            aria-expanded={shareOpen}
            aria-controls="share-panel"
            onClick={() => setShareOpen((o) => !o)}
          >
            Share link
          </button>
        </div>
      </header>

      {shareOpen && <SharePanel id="share-panel" billId={view.id} />}

      {notice && (
        <div ref={noticeRef} className={`notice notice-${notice.kind}`} role="alert">
          <span>{notice.text}</span>
          <button type="button" className="link-btn" onClick={dismissNotice}>
            Dismiss
          </button>
        </div>
      )}

      {view.locked && (
        <p className="locked-banner">
          <strong>Locked by the host.</strong> These are the final amounts.
        </p>
      )}

      {split.allClaimed && !view.locked && (
        <p className="celebrate" role="status">
          <span aria-hidden="true">🎉 </span>
          Everything&apos;s claimed. The bill adds up to the cent.
        </p>
      )}

      <div className="bill-grid">
        <div className="bill-main">
          {!meP && !view.locked && <JoinCard />}
          {meP && !view.locked && (
            <p className="you-are">
              You&apos;re <strong>{meP.name}</strong>. Tap what you had; tap again to undo.
            </p>
          )}
          <ItemList view={view} split={split} me={me} />
        </div>
        <Summary view={view} split={split} me={me} />
      </div>

      {hostToken && <HostPanel view={view} />}

      {api.name === 'local' && (
        <p className="demo-note">
          Static demo: this bill lives in your browser.{' '}
          <a href={window.location.href} target="_blank" rel="noopener">
            Open it in a second tab
          </a>{' '}
          and join as someone else: each tab is its own person, and claims sync live.
        </p>
      )}
    </div>
  );
}
