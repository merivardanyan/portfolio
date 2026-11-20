import { useEffect, useId, useRef } from 'react';
import { validateNickname } from '../lib/nickname.js';
import styles from './Home.module.css';

export default function SubmitRetry({ error, nickname, onNickname, onRetry, onKeepLocal }) {
  const id = useId();
  const headingRef = useRef(null);
  const check = validateNickname(nickname);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className={styles.retry} aria-labelledby={`${id}-title`}>
      <h1 id={`${id}-title`} ref={headingRef} tabIndex={-1}>
        The leaderboard didn&apos;t accept that
      </h1>
      <p role="alert" className={styles.retryError}>
        {error}
      </p>
      <p>Your guesses are safe. Fix the name and submit again, or submit without a name.</p>
      <form
        className={styles.nick}
        onSubmit={(e) => {
          e.preventDefault();
          if (check.ok) onRetry(check.value);
        }}
        noValidate
      >
        <label htmlFor={id}>Leaderboard name (optional)</label>
        <input
          id={id}
          type="text"
          value={nickname}
          autoComplete="nickname"
          aria-invalid={!check.ok || undefined}
          aria-describedby={check.ok ? undefined : `${id}-err`}
          onChange={(e) => onNickname(e.target.value)}
        />
        {!check.ok && (
          <p id={`${id}-err`} className={styles.fieldError}>
            {check.error}
          </p>
        )}
        <div className={styles.retryActions}>
          <button type="submit" className="btn btn-primary" disabled={!check.ok}>
            Submit again
          </button>
          <button type="button" className="btn" onClick={() => onRetry('')}>
            Submit without a name
          </button>
          <button type="button" className="btn btn-quiet" onClick={onKeepLocal}>
            Keep my score on this device only
          </button>
        </div>
      </form>
    </section>
  );
}
