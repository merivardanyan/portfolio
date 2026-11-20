import { useCallback, useEffect, useRef, useState } from 'react';

export function usePlayback(total) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timeRef = useRef(0);

  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(now - last, 250);
      last = now;
      const next = Math.min(total, timeRef.current + dt * speed);
      timeRef.current = next;
      setTime(next);
      if (next >= total) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, total]);

  const seek = useCallback(
    (t) => {
      const clamped = Math.max(0, Math.min(total, t));
      timeRef.current = clamped;
      setTime(clamped);
    },
    [total],
  );

  const play = useCallback(() => {
    if (timeRef.current >= total) seek(0);
    setPlaying(true);
  }, [seek, total]);

  const pause = useCallback(() => setPlaying(false), []);

  return { time, playing, speed, setSpeed, seek, play, pause, ended: total > 0 && time >= total };
}
