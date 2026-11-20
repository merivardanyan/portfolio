import { useCallback, useEffect, useState } from 'react';
import { api } from './api/index.js';
import { makeSample } from '../core/sample.js';
import Editor from './components/Editor.jsx';
import Player from './components/Player.jsx';

function readHash() {
  return window.location.hash;
}

export default function App() {
  const [hash, setHash] = useState(readHash);
  const [route, setRoute] = useState({ view: 'loading' });
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    const onHash = () => {
      setPreview(null);
      setHash(readHash());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (hash === '#example') {
      setRoute({ view: 'play', replay: makeSample(), source: 'example' });
      return undefined;
    }
    if (!/^#r=/.test(hash)) {
      setRoute({ view: 'write' });
      return undefined;
    }
    setRoute({ view: 'loading' });
    api
      .resolve(hash)
      .then((replay) => {
        if (!cancelled) setRoute(replay ? { view: 'play', replay, source: 'link' } : { view: 'write' });
      })
      .catch((err) => {
        if (!cancelled) setRoute({ view: 'error', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [hash]);

  const goWrite = useCallback(() => {
    setPreview(null);
    if (window.location.hash) {
      history.pushState(null, '', window.location.pathname + window.location.search);
    }
    setHash('');
  }, []);

  useEffect(() => {
    document.title =
      route.view === 'play' && route.replay.title
        ? `${route.replay.title} · Ghostwriter`
        : 'Ghostwriter: watch any text being written';
  }, [route]);

  let content;
  if (preview) {
    content = <Player key="preview" replay={preview} source="preview" onExit={() => setPreview(null)} />;
  } else if (route.view === 'play') {
    content = <Player key={hash} replay={route.replay} source={route.source} onExit={goWrite} />;
  } else if (route.view === 'error') {
    content = (
      <section className="panel error-panel" aria-labelledby="err-title">
        <h1 id="err-title">This replay link is damaged</h1>
        <p>
          It may have been cut off when it was copied. Ask the sender for the full link. ({route.message})
        </p>
        <button type="button" className="btn btn-primary" onClick={goWrite}>
          Write your own
        </button>
      </section>
    );
  } else if (route.view === 'write') {
    content = <Editor onPreview={setPreview} />;
  } else {
    content = <p className="loading" role="status">Loading replay…</p>;
  }

  return (
    <>
      <a className="portfolio-pill" href="../../">
        <span aria-hidden="true">←</span> Portfolio
      </a>
      <header className="site-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            goWrite();
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          Ghostwriter
        </a>
        <a className="header-link" href="#example">
          Watch an example
        </a>
      </header>
      <main id="main">{content}</main>
      <footer className="site-footer">
        <p>
          Static app, no server: your text lives only inside the link you share.
        </p>
      </footer>
    </>
  );
}
