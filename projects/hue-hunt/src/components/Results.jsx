import { useEffect, useRef, useState } from 'react';
import { emojiGrid, hslToCss, shareText } from '../../core/index.js';
import { api } from '../api/index.js';
import { downloadCard, drawCard } from '../lib/card.js';
import CountUp from './CountUp.jsx';
import styles from './Results.module.css';

function pageUrl() {
  return window.location.href.split('#')[0];
}

export default function Results({ mode, number, date, result, error, onHome, onPracticeAgain, children }) {
  const [copied, setCopied] = useState(false);
  const [board, setBoard] = useState(null);
  const [players, setPlayers] = useState(null);
  const headingRef = useRef(null);
  const canvasRef = useRef(null);
  const daily = mode === 'daily';
  const { score, rounds, percentile } = result;
  const title = daily ? `Hue Hunt #${number}` : 'Hue Hunt practice';

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!daily) return;
    let cancelled = false;
    api
      .getLeaderboard(date, 10)
      .then((rows) => !cancelled && setBoard(rows))
      .catch(() => !cancelled && setBoard([]));
    api
      .getStats(date)
      .then((s) => !cancelled && setPlayers(s.players))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [daily, date]);

  useEffect(() => {
    if (canvasRef.current && rounds.length) {
      drawCard(canvasRef.current, {
        title,
        score,
        rounds,
        percentile: daily && (players === null || players > 1) ? percentile : null,
        footer: daily ? date : `${rounds.length} rounds`,
      });
    }
  }, [title, score, rounds, percentile, daily, date, players]);

  const text = shareText({ number: daily ? number : null, score, rounds, url: pageUrl(), practice: !daily });

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={styles.results} aria-labelledby="results-title">
      <header className={styles.head}>
        <h1 id="results-title" ref={headingRef} tabIndex={-1} className={styles.title}>
          {title}
        </h1>
        <p className={styles.score}>
          <CountUp value={score} duration={1200} />
          <span>%</span>
        </p>
        {daily && !error && players !== null && players <= 1 && (
          <p className={styles.percentile}>You&apos;re the first player to finish today.</p>
        )}
        {daily && percentile != null && (players === null || players > 1) && (
          <p className={styles.percentile}>
            You beat <strong>{percentile}%</strong> of players today
            {api.name === 'local' && <span className={styles.note}> (simulated in the static demo)</span>}
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </header>

      <ol className={styles.rounds}>
        {rounds.map((r, i) => (
          <li key={i}>
            <span className={styles.pair} aria-hidden="true">
              <span style={{ background: hslToCss(r.target) }} />
              <span style={{ background: hslToCss(r.guess) }} />
            </span>
            <span className={styles.roundScore}>
              <span className="sr-only">Round {i + 1}: </span>
              {r.score.toFixed(1)}
            </span>
            <span className={styles.roundTier} data-tier={r.tier}>
              {r.tier}
            </span>
          </li>
        ))}
      </ol>

      <div className={styles.share}>
        <p className={styles.shareText} aria-label="Share text">
          {text.split('\n')[0]}
        </p>
        <div className={styles.actions}>
          <button type="button" className="btn btn-primary" onClick={copy}>
            {copied ? 'Copied' : 'Copy result'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => downloadCard(canvasRef.current, `hue-hunt-${daily ? number : 'practice'}.png`)}
          >
            Download card
          </button>
          {!daily && (
            <button type="button" className="btn" onClick={onPracticeAgain}>
              Practice again
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={onHome}>
            Home
          </button>
        </div>
        <p className="sr-only" aria-live="polite">
          {copied ? 'Result copied to clipboard' : ''}
        </p>
      </div>

      <figure className={styles.cardFigure}>
        <canvas ref={canvasRef} width={1200} height={630} className={styles.card} role="img" aria-label={`Result card: ${title}, ${score.toFixed(1)}%, ${emojiGrid(rounds)}`} />
        <figcaption>Preview of the 1200×630 share card</figcaption>
      </figure>

      {daily && (
        <section className={styles.board} aria-labelledby="board-title">
          <h2 id="board-title">
            Today&apos;s top 10
            {api.name === 'local' && <span className={styles.note}> (simulated)</span>}
          </h2>
          {board === null ? (
            <p className={styles.note}>Loading…</p>
          ) : board.length === 0 ? (
            <p className={styles.note}>No scores yet. You could be first.</p>
          ) : (
            <ol className={styles.boardList}>
              {board.map((row, i) => (
                <li key={i}>
                  <span>{row.nickname || 'anonymous'}</span>
                  <span>{Number(row.score).toFixed(1)}%</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {children}
    </section>
  );
}
