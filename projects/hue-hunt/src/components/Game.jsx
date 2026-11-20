import { useEffect, useRef, useState } from 'react';
import { hslToCss, scoreRound } from '../../core/index.js';
import ColorPicker from './ColorPicker.jsx';
import CountUp from './CountUp.jsx';
import { useReducedMotion } from '../lib/useReducedMotion.js';
import styles from './Game.module.css';

export const MEMORIZE_MS = 3000;

function startGuess() {
  return { h: Math.floor(Math.random() * 360), s: 50, l: 50 };
}

export default function Game({ mode, getTarget, roundCount, onFinish, onQuit }) {
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState('ready');
  const [guess, setGuess] = useState(startGuess);
  const [results, setResults] = useState([]);
  const [remaining, setRemaining] = useState(MEMORIZE_MS);
  const [announce, setAnnounce] = useState('');
  const reduced = useReducedMotion();
  const padRef = useRef(null);
  const nextRef = useRef(null);
  const readyRef = useRef(null);
  const target = getTarget(round);
  const endless = roundCount === Infinity;
  const isLast = !endless && round === roundCount - 1;

  useEffect(() => {
    if (phase === 'ready') readyRef.current?.focus();
    if (phase === 'pick') padRef.current?.focus();
    if (phase === 'reveal') nextRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (phase !== 'memorize') return undefined;
    setAnnounce(`Memorize the color. ${MEMORIZE_MS / 1000} seconds.`);
    const start = performance.now();
    const id = setInterval(() => {
      const left = Math.max(0, MEMORIZE_MS - (performance.now() - start));
      setRemaining(left);
      if (left === 0) {
        clearInterval(id);
        setPhase('pick');
        setAnnounce('Now rebuild the color from memory.');
      }
    }, 100);
    return () => clearInterval(id);
  }, [phase]);

  function submitGuess() {
    const result = scoreRound(target, guess);
    setResults((r) => [...r, result]);
    setPhase('reveal');
    setAnnounce(`${result.score.toFixed(1)} percent, ${result.tier}.`);
  }

  function next() {
    if (isLast) {
      onFinish(results);
      return;
    }
    setRound((r) => r + 1);
    setGuess(startGuess());
    setRemaining(MEMORIZE_MS);
    setPhase('ready');
  }

  const last = results[results.length - 1];
  const progressLabel = endless ? `Round ${round + 1}` : `Round ${round + 1} of ${roundCount}`;

  return (
    <section className={styles.game} aria-labelledby="round-title">
      <div className={styles.topbar}>
        <h1 id="round-title" className={styles.round}>
          {mode === 'practice' ? 'Practice · ' : ''}
          {progressLabel}
        </h1>
        {!endless && (
          <ol className={styles.pips} aria-hidden="true">
            {Array.from({ length: roundCount }, (_, i) => (
              <li
                key={i}
                className={i === round && i >= results.length ? styles.pipNow : undefined}
                style={i < results.length ? { background: hslToCss(results[i].target) } : undefined}
              />
            ))}
          </ol>
        )}
        <button type="button" className="btn btn-quiet" onClick={() => onQuit(results)}>
          {endless && results.length ? 'Finish' : 'Quit'}
        </button>
      </div>

      {phase === 'ready' && (
        <div className={styles.stage}>
          <div className={styles.readyCard}>
            <p className={styles.readyText}>
              A color appears for {MEMORIZE_MS / 1000} seconds. Remember it, then rebuild it.
            </p>
            <button
              ref={readyRef}
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => setPhase('memorize')}
            >
              Show color
            </button>
          </div>
        </div>
      )}

      {phase === 'memorize' && (
        <div className={styles.stage}>
          <div className={styles.swatch} style={{ background: hslToCss(target) }}>
            <div className={styles.timer} aria-hidden="true">
              {reduced ? (
                <span className={styles.timerNum}>{Math.ceil(remaining / 1000)}</span>
              ) : (
                <svg viewBox="0 0 48 48" className={styles.ring}>
                  <circle cx="24" cy="24" r="20" className={styles.ringBg} />
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    pathLength="100"
                    className={styles.ringFg}
                    style={{ animationDuration: `${MEMORIZE_MS}ms` }}
                  />
                </svg>
              )}
            </div>
          </div>
        </div>
      )}

      {phase === 'pick' && (
        <div className={styles.pickLayout}>
          <ColorPicker ref={padRef} value={guess} onChange={setGuess} onSubmit={submitGuess} />
          <div className={styles.side}>
            <div className={styles.preview} style={{ background: hslToCss(guess) }} aria-hidden="true" />
            <p className={styles.values} aria-hidden="true">
              <span>H {guess.h}</span>
              <span>S {guess.s}</span>
              <span>L {guess.l}</span>
            </p>
            <button type="button" className="btn btn-primary btn-lg" onClick={submitGuess}>
              Lock it in
            </button>
            <p className={styles.keys}>
              Arrows adjust, <kbd>Shift</kbd> for big steps, <kbd>Enter</kbd> locks in.
            </p>
          </div>
        </div>
      )}

      {phase === 'reveal' && last && (
        <div className={styles.stage}>
          <div className={`${styles.compare} ${reduced ? '' : styles.animate}`}>
            <figure className={styles.half} style={{ background: hslToCss(last.target) }}>
              <figcaption>Target</figcaption>
            </figure>
            <figure className={styles.half} style={{ background: hslToCss(last.guess) }}>
              <figcaption>Yours</figcaption>
            </figure>
          </div>
          <div className={styles.verdict}>
            <p className={styles.score}>
              <CountUp value={last.score} />
              <span>%</span>
            </p>
            <p className={styles.tier} data-tier={last.tier}>
              {last.tier} · ΔE {last.deltaE.toFixed(1)}
            </p>
            <button ref={nextRef} type="button" className="btn btn-primary btn-lg" onClick={next}>
              {isLast ? 'See results' : 'Next color'}
            </button>
          </div>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </section>
  );
}
