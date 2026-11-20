import { formatDuration } from '../format.js';

export default function StatsPanel({ stats }) {
  const items = [
    ['Speed', `${stats.wpm} WPM`],
    ['Time spent', formatDuration(stats.durationMs)],
    ['Deletions', `${stats.deletions.toLocaleString()} (${stats.deletedChars.toLocaleString()} chars)`],
    ['Longest pause', formatDuration(stats.longestPauseMs)],
    [
      'Most rewritten word',
      stats.mostRewritten ? `“${stats.mostRewritten.word}” ×${stats.mostRewritten.count}` : 'none',
    ],
  ];
  return (
    <section className="stats panel" aria-labelledby="stats-h">
      <h2 id="stats-h">How it was written</h2>
      <dl>
        {items.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
