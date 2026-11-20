import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  activityBuckets,
  buildSnapshots,
  compressPauses,
  countAt,
  duration,
  stateAt,
} from '../../core/engine.js';
import { computeStats } from '../../core/stats.js';
import { usePlayback } from '../hooks/usePlayback.js';
import { formatClock, formatDate, formatDuration } from '../format.js';
import StatsPanel from './StatsPanel.jsx';
import Timeline from './Timeline.jsx';

const SPEEDS = [0.5, 1, 2, 4];
const SEEK_STEP = 2000;

function prepare(events) {
  return { events, snapshots: buildSnapshots(events), total: duration(events), buckets: activityBuckets(events, 72) };
}

function isTextField(el) {
  if (!el) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(el.type);
}

export default function Player({ replay, source, onExit }) {
  const [skipPauses, setSkipPauses] = useState(false);
  const raw = useMemo(() => prepare(replay.events), [replay]);
  const skipped = useMemo(() => prepare(compressPauses(replay.events)), [replay]);
  const stats = useMemo(() => computeStats(replay.events), [replay]);
  const active = skipPauses ? skipped : raw;
  const pb = usePlayback(active.total);
  const [announce, setAnnounce] = useState('');
  const [started, setStarted] = useState(false);
  const paperRef = useRef(null);
  const caretRef = useRef(null);
  const playBtnRef = useRef(null);

  const view = stateAt(active.events, pb.time, active.snapshots);
  const fine = active.total < 10000;
  const hidden = replay.reveal && !pb.ended;
  const showStats = !replay.reveal || pb.ended;

  const toggle = () => {
    setStarted(true);
    if (pb.playing) {
      pb.pause();
      setAnnounce(`Paused at ${formatClock(pb.time, active.total < 10000)}`);
    } else {
      pb.play();
      setAnnounce(`Playing at ${pb.speed}x`);
    }
  };

  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  const seekRef = useRef(null);
  seekRef.current = (delta) => {
    setStarted(true);
    pb.seek(pb.time + delta);
  };

  useEffect(() => {
    if (pb.ended) setAnnounce(replay.reveal ? 'Playback finished. The message is revealed.' : 'Playback finished.');
  }, [pb.ended, replay.reveal]);

  useEffect(() => {
    let handledSpace = false;
    const onKeyDown = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTextField(e.target)) return;
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        handledSpace = e.key === ' ';
        if (!e.repeat) toggleRef.current();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        seekRef.current(e.key === 'ArrowLeft' ? -SEEK_STEP : SEEK_STEP);
      }
    };
    const onKeyUp = (e) => {
      if (e.key === ' ' && handledSpace) {
        e.preventDefault();
        handledSpace = false;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useLayoutEffect(() => {
    const paper = paperRef.current;
    const caret = caretRef.current;
    if (!paper || !caret) return;
    const top = caret.offsetTop;
    if (top < paper.scrollTop + 8) paper.scrollTop = Math.max(0, top - 24);
    else if (top + caret.offsetHeight > paper.scrollTop + paper.clientHeight - 8) {
      paper.scrollTop = top + caret.offsetHeight - paper.clientHeight + 24;
    }
  }, [view.text, view.caret]);

  function changeSkip(next) {
    const from = skipPauses ? skipped : raw;
    const to = next ? skipped : raw;
    const count = countAt(from.events, pb.time);
    const t = count > 0 ? to.events[count - 1].t : 0;
    setSkipPauses(next);
    pb.seek(Math.min(t, to.total));
  }

  const meta = [replay.createdAt ? `Written ${formatDate(replay.createdAt)}` : null, `${raw.total < 60000 ? formatDuration(raw.total) : formatClock(raw.total)} long`]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="player" aria-labelledby="replay-title">
      <div className="player-head">
        <p className="eyebrow">
          {source === 'preview' ? 'Preview' : source === 'example' ? 'Example replay' : 'Someone wrote you something'}
        </p>
        <h1 id="replay-title">{replay.title || 'Untitled replay'}</h1>
        <p className="meta">{meta}</p>
      </div>

      <div className="paper-wrap">
        <div
          ref={paperRef}
          className={`paper paper-output${hidden ? ' is-hidden' : ''}`}
          aria-hidden={hidden || undefined}
        >
          <span>{view.text.slice(0, view.caret)}</span>
          <span ref={caretRef} className={`caret${pb.playing ? ' is-typing' : ''}`} aria-hidden="true" />
          <span>{view.text.slice(view.caret)}</span>
        </div>
        {hidden && <p className="sr-only">The text stays hidden until playback finishes.</p>}
        {!started && (
          <button
            type="button"
            className="big-play"
            onClick={() => {
              toggle();
              playBtnRef.current?.focus();
            }}
          >
            <span className="big-play-icon" aria-hidden="true" />
            Play replay
          </button>
        )}
      </div>

      <div className="controls" role="group" aria-label="Playback controls">
        <button
          ref={playBtnRef}
          type="button"
          className="btn btn-primary btn-icon"
          onClick={toggle}
          aria-label={pb.playing ? 'Pause' : pb.ended ? 'Replay from start' : 'Play'}
        >
          <span className={`icon ${pb.playing ? 'icon-pause' : 'icon-play'}`} aria-hidden="true" />
        </button>
        <span className="clock" aria-hidden="true">
          {formatClock(pb.time, fine)} / {formatClock(active.total, fine)}
        </span>
        <Timeline buckets={active.buckets} time={pb.time} total={active.total} onSeek={(t) => {
            setStarted(true);
            pb.seek(t);
          }} />
      </div>

      <div className="controls-row">
        <div className="speeds" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              aria-pressed={pb.speed === s}
              onClick={() => {
                pb.setSpeed(s);
                setAnnounce(`Speed ${s}x`);
              }}
            >
              {s}x
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={skipPauses} onChange={(e) => changeSkip(e.target.checked)} />
          Skip long pauses
        </label>
      </div>
      <p className="hint kbd-hint">
        <kbd>Space</kbd> play/pause · <kbd>←</kbd> <kbd>→</kbd> seek 2 s
      </p>

      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      {pb.ended ? (
        <StatsPanel stats={stats} />
      ) : (
        showStats && (
          <details className="spoiler">
            <summary>Writing stats (spoilers)</summary>
            <StatsPanel stats={stats} />
          </details>
        )
      )}

      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={onExit}>
          {source === 'preview' ? 'Back to editing' : 'Write your own'}
        </button>
      </div>
    </article>
  );
}
