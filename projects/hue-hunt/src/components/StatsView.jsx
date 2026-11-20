import styles from './StatsView.module.css';

export default function StatsView({ summary, highlight }) {
  const max = Math.max(1, ...summary.histogram);
  const cells = [
    ['Played', summary.played],
    ['Streak', summary.streak],
    ['Best streak', summary.maxStreak],
    ['Average', summary.played ? `${summary.average}%` : '–'],
  ];
  return (
    <section className={styles.stats} aria-labelledby="your-stats">
      <h2 id="your-stats">Your stats</h2>
      <dl className={styles.grid}>
        {cells.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <h3 className={styles.sub}>Score distribution</h3>
      <ol className={styles.hist}>
        {summary.histogram
          .map((count, i) => ({ count, i }))
          .reverse()
          .map(({ count, i }) => {
            const label = i === 9 ? '90-100' : `${i * 10}-${i * 10 + 9}`;
            const active = highlight != null && Math.min(9, Math.floor(highlight / 10)) === i;
            return (
              <li key={i} className={active ? styles.active : undefined}>
                <span className={styles.range}>{label}</span>
                <span className={styles.barTrack}>
                  <span className={styles.bar} style={{ width: `${(count / max) * 100}%` }} />
                </span>
                <span className={styles.count}>
                  {count}
                  <span className="sr-only"> {count === 1 ? 'game' : 'games'}</span>
                </span>
              </li>
            );
          })}
      </ol>
    </section>
  );
}
