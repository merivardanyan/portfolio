import { useId, useRef } from 'react';
import { emojiGrid } from '../../core/index.js';
import { api } from '../api/index.js';
import StatsView from './StatsView.jsx';
import styles from './Home.module.css';

export default function Home({
  today,
  played,
  summary,
  nickname,
  nicknameError,
  onNickname,
  serverOnline,
  onPlay,
  onShowToday,
  onPractice,
}) {
  const nickId = useId();
  const nickRef = useRef(null);
  return (
    <div className={styles.home}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <p className={styles.kicker}>
          Daily #{today.number} · {today.date}
        </p>
        <h1 id="hero-title" className={styles.title} tabIndex={-1}>
          Hue Hunt
        </h1>
        <p className={styles.lede}>
          You see a color for 3 seconds. Then you rebuild it from memory. How close can you get?
        </p>

        <div className={styles.cta}>
          {played ? (
            <>
              <p className={styles.done}>
                Today: <strong>{played.score.toFixed(1)}%</strong>{' '}
                <span aria-hidden="true">{emojiGrid(played.rounds)}</span>
              </p>
              <button type="button" className="btn btn-primary btn-lg" onClick={onShowToday}>
                See today&apos;s result
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => {
                if (!onPlay()) nickRef.current?.focus();
              }}
            >
              Play today&apos;s 5 colors
            </button>
          )}
          <button type="button" className="btn btn-lg" onClick={onPractice}>
            Practice
          </button>
        </div>

        {api.name === 'http' && serverOnline === false && (
          <p className={styles.offline} role="status">
            The leaderboard is offline right now. You can still play; your score will be saved on this device.
          </p>
        )}

        {api.name === 'http' && (
          <div className={styles.nick}>
            <label htmlFor={nickId}>Leaderboard name (optional)</label>
            <input
              id={nickId}
              ref={nickRef}
              type="text"
              value={nickname}
              autoComplete="nickname"
              aria-invalid={Boolean(nicknameError) || undefined}
              aria-describedby={nicknameError ? `${nickId}-err` : undefined}
              onChange={(e) => onNickname(e.target.value)}
            />
            {nicknameError && (
              <p id={`${nickId}-err`} className={styles.fieldError}>
                {nicknameError}
              </p>
            )}
          </div>
        )}
      </section>

      <section className={styles.how} aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol>
          <li>Press “Show color”. You get 3 seconds to memorize it.</li>
          <li>
            Rebuild it with the pad (hue and saturation) and the lightness slider. Mouse, touch or arrow keys.
          </li>
          <li>
            Each round is scored with CIEDE2000, the color difference formula print shops use, so the score
            matches what your eyes see.
          </li>
        </ol>
        <p className={styles.legend} aria-label="Score tiers">
          <span>🟩 90+</span>
          <span>🟨 70+</span>
          <span>🟧 45+</span>
          <span>🟥 below</span>
        </p>
      </section>

      <StatsView summary={summary} />

      {api.name === 'local' && (
        <p className={styles.demoNote}>Static demo: your stats stay in this browser.</p>
      )}
    </div>
  );
}
