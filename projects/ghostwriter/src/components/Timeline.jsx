import { useId } from 'react';
import { formatClock } from '../format.js';

export default function Timeline({ buckets, time, total, onSeek }) {
  const id = useId();
  const max = Math.max(1, ...buckets);
  const progress = total > 0 ? time / total : 0;
  const w = 100 / buckets.length;

  return (
    <div className="timeline">
      <svg className="sparkline" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {buckets.map((v, i) => {
          const h = v === 0 ? 0.6 : 2 + (v / max) * 22;
          return (
            <rect
              key={i}
              x={i * w + w * 0.12}
              y={24 - h}
              width={w * 0.76}
              height={h}
              className={(i + 0.5) * w <= progress * 100 ? 'bar played' : 'bar'}
            />
          );
        })}
      </svg>
      <label htmlFor={id} className="sr-only">
        Seek
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={Math.max(1, Math.round(total))}
        step={total < 10000 ? 10 : 100}
        value={Math.round(time)}
        aria-valuetext={`${formatClock(time, total < 10000)} of ${formatClock(total, total < 10000)}`}
        onChange={(e) => onSeek(Number(e.target.value))}
        style={{ '--progress': `${progress * 100}%` }}
      />
    </div>
  );
}
