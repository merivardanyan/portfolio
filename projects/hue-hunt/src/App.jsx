import { useCallback, useEffect, useRef, useState } from 'react';
import { colorsFromSeed, dailyPuzzle, dateKey, mean, scoreGame } from '../core/index.js';
import { ApiError, api, describeError } from './api/index.js';
import { validateNickname } from './lib/nickname.js';
import SubmitRetry from './components/SubmitRetry.jsx';
import { loadStats, playerId, recordResult, saveStats, summarize } from './lib/stats.js';
import Game from './components/Game.jsx';
import Home from './components/Home.jsx';
import Results from './components/Results.jsx';
import StatsView from './components/StatsView.jsx';

const NICK_KEY = 'hue-hunt:nickname';
const PRACTICE_POOL = 200;

function readNick() {
  try {
    return localStorage.getItem(NICK_KEY) ?? '';
  } catch {
    return '';
  }
}

export default function App() {
  const [today, setToday] = useState(() => dailyPuzzle(dateKey()));
  const [server, setServer] = useState({ online: null });
  const [stats, setStats] = useState(loadStats);
  const [screen, setScreen] = useState({ name: 'home' });
  const [nickname, setNickname] = useState(readNick);
  const practiceColors = useRef([]);
  const mainRef = useRef(null);

  const summary = summarize(stats, today.date);
  const playedToday = stats.results[today.date] ?? null;

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    if (screen.name === 'home') mainRef.current?.querySelector('h1')?.focus();
  }, [screen.name]);

  useEffect(() => {
    let cancelled = false;
    api
      .getToday()
      .then(() => !cancelled && setServer({ online: true }))
      .catch(() => !cancelled && setServer({ online: false }));
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshToday = useCallback(() => {
    const key = dateKey();
    if (key === today.date) return today;
    const fresh = dailyPuzzle(key);
    setToday(fresh);
    return fresh;
  }, [today]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && screen.name === 'home') refreshToday();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [screen.name, refreshToday]);

  const nickCheck = validateNickname(nickname);

  const updateNick = (v) => {
    setNickname(v);
    try {
      localStorage.setItem(NICK_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const record = useCallback(
    (result) => {
      const next = recordResult(stats, today.date, result);
      setStats(next);
      saveStats(next);
    },
    [stats, today.date],
  );

  const keepLocal = useCallback(
    (rounds, error) => {
      const local = scoreGame(today.colors, rounds.map((r) => r.guess));
      const result = { ...local, percentile: null };
      record(result);
      setScreen({ name: 'results', mode: 'daily', result, error });
    },
    [today.colors, record],
  );

  const finishDaily = useCallback(
    async (rounds, nick = nickCheck.ok ? nickCheck.value : '') => {
      setScreen({ name: 'submitting' });
      const guesses = rounds.map((r) => r.guess);
      try {
        const res = await api.submit({ playerId: playerId(), date: today.date, guesses, nickname: nick || undefined });
        const result = { score: res.score, rounds: res.rounds, percentile: res.percentile ?? null };
        record(result);
        setScreen({ name: 'results', mode: 'daily', result, error: null });
      } catch (err) {
        if (err instanceof ApiError && err.isValidation) {
          setScreen({ name: 'retry', rounds, error: describeError(err) });
          return;
        }
        keepLocal(rounds, `Couldn't reach the leaderboard (${err.message}). Your score was calculated on this device.`);
      }
    },
    [today.date, nickCheck.ok, nickCheck.value, record, keepLocal],
  );

  const startPractice = useCallback(() => {
    practiceColors.current = colorsFromSeed(Math.floor(Math.random() * 2 ** 32) >>> 0, PRACTICE_POOL);
    setScreen({ name: 'game', mode: 'practice', key: Date.now() });
  }, []);

  const finishPractice = useCallback((rounds) => {
    if (!rounds.length) {
      setScreen({ name: 'home' });
      return;
    }
    const score = mean(rounds.map((r) => r.score));
    setScreen({ name: 'results', mode: 'practice', result: { score, rounds, percentile: null } });
  }, []);

  let content;
  if (screen.name === 'game' && screen.mode === 'daily') {
    content = (
      <Game
        mode="daily"
        roundCount={today.roundCount}
        getTarget={(i) => today.colors[i]}
        onFinish={finishDaily}
        onQuit={() => setScreen({ name: 'home' })}
      />
    );
  } else if (screen.name === 'game') {
    content = (
      <Game
        key={screen.key}
        mode="practice"
        roundCount={Infinity}
        getTarget={(i) => practiceColors.current[i % PRACTICE_POOL]}
        onFinish={finishPractice}
        onQuit={finishPractice}
      />
    );
  } else if (screen.name === 'submitting') {
    content = (
      <p role="status" className="loading">
        Scoring your guesses…
      </p>
    );
  } else if (screen.name === 'retry') {
    content = (
      <SubmitRetry
        error={screen.error}
        nickname={nickname}
        onNickname={updateNick}
        onRetry={(nick) => finishDaily(screen.rounds, nick)}
        onKeepLocal={() =>
          keepLocal(screen.rounds, 'Not submitted to the leaderboard. Your score was calculated on this device.')
        }
      />
    );
  } else if (screen.name === 'results') {
    content = (
      <Results
        mode={screen.mode}
        number={today.number}
        date={today.date}
        result={screen.result}
        error={screen.error}
        onHome={() => setScreen({ name: 'home' })}
        onPracticeAgain={startPractice}
      >
        {screen.mode === 'daily' && <StatsView summary={summary} highlight={screen.result.score} />}
      </Results>
    );
  } else {
    content = (
      <Home
        today={today}
        played={playedToday}
        summary={summary}
        nickname={nickname}
        nicknameError={nickCheck.ok ? null : nickCheck.error}
        onNickname={updateNick}
        serverOnline={server.online}
        onPlay={() => {
          if (!nickCheck.ok) return false;
          const fresh = refreshToday();
          if (fresh && stats.results[fresh.date]) return true;
          setScreen({ name: 'game', mode: 'daily' });
          return true;
        }}
        onShowToday={() => setScreen({ name: 'results', mode: 'daily', result: playedToday })}
        onPractice={startPractice}
      />
    );
  }

  return (
    <>
      <a className="portfolio-pill" href="../../">
        <span aria-hidden="true">←</span> Portfolio
      </a>
      <main id="main" ref={mainRef} className="shell">
        {content}
      </main>
    </>
  );
}
