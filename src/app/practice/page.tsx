'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, DoorOpen, Home } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useGameCardTheme } from '@/hooks/use-game-card-theme';
import { useLanguage } from '@/context/language-context';

const PAR_VALUE = 4;
const DEFAULT_HOLES = 18;

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getPlayerNameClass = (index: number) => (index === 0 ? 'text-blue-600' : 'text-violet-600');
const getMatchCellClass = (result: number | null) => {
  if (result === 1) return 'bg-blue-500 text-white';
  if (result === -1) return 'bg-violet-500 text-white';
  if (result === 0) return 'bg-orange-400 text-white';
  return 'bg-gray-100 text-gray-400';
};

const getDisplayName = (name?: string | null, surname?: string | null, email?: string | null) => {
  const full = [name, surname].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (email) return email.split('@')[0];
  return '';
};

const getResultBadge = (strokes: number | null, par: number) => {
  if (!strokes || Number.isNaN(strokes)) {
    return { label: '-', className: 'bg-gray-100 text-gray-500 border border-gray-200', inputClassName: 'bg-white text-gray-700 border-gray-200' };
  }

  const diff = strokes - par;

  if (diff <= -2) {
    return {
      label: 'Eagle+',
      className: 'bg-sky-600 text-white',
      inputClassName: 'bg-sky-300 text-sky-950 border-sky-600',
    };
  }
  if (diff === -1) {
    return {
      label: 'Birdie',
      className: 'bg-green-600 text-white',
      inputClassName: 'bg-green-300 text-green-950 border-green-600',
    };
  }
  if (diff === 0) {
    return { label: 'Par', className: 'bg-white text-gray-800 border border-gray-200', inputClassName: 'bg-white text-gray-800 border-gray-200' };
  }
  if (diff === 1) {
    return {
      label: 'Bogey',
      className: 'bg-red-700 text-white',
      inputClassName: 'bg-red-200 text-red-950 border-red-700',
    };
  }
  return {
    label: 'Doble+',
    className: 'bg-red-900 text-white',
    inputClassName: 'bg-red-800 text-white border-red-900',
  };
};

const getStablefordTotals = (scores: number[]) => {
  const played = scores.filter((value) => value > 0).length;
  const total = scores.reduce((sum, value) => sum + (value > 0 ? value : 0), 0);
  const parTotal = played * PAR_VALUE;
  const diff = total - parTotal;
  return { played, total, parTotal, diff };
};

const formatStablefordTotal = (total: number, parTotal: number, diff: number, played: number) => {
  if (played === 0) return '-';
  const diffLabel = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`;
  return `${total} (${diffLabel})`;
};

const getMatchBadge = (result: number, p1: string, p2: string) => {
  if (result === 1) {
    return { label: `Gana ${p1}`, className: 'bg-green-500 text-white' };
  }
  if (result === -1) {
    return { label: `Gana ${p2}`, className: 'bg-red-500 text-white' };
  }
  return { label: 'Empate', className: 'bg-orange-400 text-white' };
};

export default function PracticePage() {
  const { user, profile, isGuest } = useAuth();
  const { t } = useLanguage();
  const { theme: gameCardTheme, toggle: toggleGameCardTheme } = useGameCardTheme();
  const primaryName = useMemo(
    () => getDisplayName(profile?.first_name, profile?.last_name, user?.email ?? null),
    [profile?.first_name, profile?.last_name, user?.email]
  );

  const gameCardShellClassName =
    gameCardTheme === 'dark'
      ? 'bg-black text-white border border-white/20'
      : 'bg-white text-black border border-black/10';

  const gameCardPanelClassName =
    gameCardTheme === 'dark'
      ? 'border border-white/20 rounded-2xl p-4 bg-black'
      : 'border border-black/10 rounded-2xl p-4 bg-white';

  const gameCardSubtleTextClassName = gameCardTheme === 'dark' ? 'text-white' : 'text-black';
  const strokeStepperShellClassName =
    gameCardTheme === 'dark' ? 'border-white/30 bg-black text-white' : 'border-gray-200 bg-white text-gray-800';
  const strokeStepperBtnClassName = gameCardTheme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-gray-50';
  const gameCardBorderBtnClassName =
    gameCardTheme === 'dark'
      ? 'px-3 py-2 text-xs border border-white/30 rounded-xl text-white'
      : 'px-3 py-2 text-xs border border-black/20 rounded-xl text-black';

  const gameCardToggleLabel =
    gameCardTheme === 'dark' ? t('practice.toggleLight') : t('practice.toggleDark');

  const [setupOpen, setSetupOpen] = useState(true);
  const [mode, setMode] = useState<'stableford' | 'match' | null>(null);
  const [playerCount, setPlayerCount] = useState(1);
  const [players, setPlayers] = useState<string[]>([]);
  const [holesCount, setHolesCount] = useState(DEFAULT_HOLES);

  const [stablefordHole, setStablefordHole] = useState(0);
  const [strokes, setStrokes] = useState<number[][]>([]);
  const [showStablefordTotal, setShowStablefordTotal] = useState(false);
  const [stablefordFinalized, setStablefordFinalized] = useState(false);

  const [matchHole, setMatchHole] = useState(0);
  const [matchResults, setMatchResults] = useState<Array<number | null>>([]);
  const [showMatchTotal, setShowMatchTotal] = useState(false);
  const [matchFinalized, setMatchFinalized] = useState(false);
  const [playoffResult, setPlayoffResult] = useState<number | null>(null);

  useEffect(() => {
    setPlayers((prev) => {
      const next = [...prev];
      while (next.length < playerCount) next.push('');
      if (next.length > playerCount) next.length = playerCount;
      if (primaryName && !next[0]) next[0] = primaryName;
      return next;
    });
  }, [playerCount, primaryName]);

  useEffect(() => {
    if (mode === 'match') {
      setPlayerCount(2);
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'stableford') return;

    setStrokes((prev) => {
      const next = [...prev].map((row) => [...row]);
      while (next.length < playerCount) next.push(Array(DEFAULT_HOLES).fill(0));
      if (next.length > playerCount) next.length = playerCount;
      next.forEach((row, index) => {
        if (row.length !== DEFAULT_HOLES) {
          next[index] = Array(DEFAULT_HOLES).fill(0).map((_, idx) => row[idx] ?? 0);
        }
      });
      return next;
    });
  }, [mode, playerCount]);

  useEffect(() => {
    if (mode !== 'match') return;

    setMatchResults((prev) => {
      const next = [...prev];
      if (next.length !== holesCount) {
        const copy = Array(holesCount).fill(null) as Array<number | null>;
        next.forEach((value, idx) => {
          if (idx < holesCount) copy[idx] = value;
        });
        return copy;
      }
      return next;
    });
  }, [mode, holesCount]);

  useEffect(() => {
    if (setupOpen) {
      setStablefordFinalized(false);
      setMatchFinalized(false);
      setPlayoffResult(null);
    }
  }, [setupOpen]);

  useEffect(() => {
    setStablefordFinalized(false);
    setMatchFinalized(false);
    setPlayoffResult(null);
  }, [mode]);

  const handleStart = () => {
    if (!mode) return;
    setSetupOpen(false);
  };

  const updatePlayer = (index: number, value: string) => {
    setPlayers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const updateStroke = (playerIndex: number, holeIndex: number, value: string) => {
    const numeric = clampNumber(Number(value), 0, 15);
    setStrokes((prev) => {
      const next = prev.map((row) => [...row]);
      if (!next[playerIndex]) next[playerIndex] = Array(DEFAULT_HOLES).fill(0);
      next[playerIndex][holeIndex] = numeric;
      return next;
    });
  };

  const setMatchOutcome = (holeIndex: number, result: number) => {
    setMatchResults((prev) => {
      const next = [...prev];
      next[holeIndex] = result;
      return next;
    });
  };

  const matchTotals = useMemo(() => {
    const p1 = matchResults.reduce((sum, result) => sum + (result === 1 ? 1 : result === 0 ? 0.5 : 0), 0);
    const p2 = matchResults.reduce((sum, result) => sum + (result === -1 ? 1 : result === 0 ? 0.5 : 0), 0);
    return { p1, p2 };
  }, [matchResults]);

  const regularMatchComplete = matchResults.length === holesCount && matchResults.every((value) => value !== null);
  const matchTied = regularMatchComplete && matchTotals.p1 === matchTotals.p2;

  const confirmExit = () => {
    if (setupOpen) return true;
    return window.confirm(t('practice.confirmExit'));
  };

  const handleBackClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!confirmExit()) {
      event.preventDefault();
    }
  };

  const handleHideCard = () => {
    if (confirmExit()) {
      setSetupOpen(true);
    }
  };

  const handleFinalizeStableford = () => {
    if (!stablefordFinalized && window.confirm(t('practice.confirmFinalize'))) {
      setStablefordFinalized(true);
    }
  };

  const handleFinalizeMatch = () => {
    if (!matchFinalized && window.confirm(t('practice.confirmFinalize'))) {
      setMatchFinalized(true);
    }
  };
  return (
    <div className="min-h-screen px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between mb-5">
        <Link
          href="/dashboard"
          className="premium-back-btn text-sm inline-flex items-center gap-1.5"
          onClick={handleBackClick}
          aria-label="Atras"
        >
          <ArrowLeft className="h-4 w-4" />
          <DoorOpen className="h-4 w-4" />
        </Link>
        <div className="text-sm font-semibold text-gray-800">{t('practice.title')}</div>
        <div className="w-[72px]" />
      </header>
      {setupOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-40">
          <div className="bg-white/95 rounded-3xl shadow-[0_24px_80px_rgba(15,23,42,0.18)] w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden border border-white/70">
            <div className="p-5 border-b border-gray-100/80 flex items-start justify-between bg-gradient-to-r from-white via-white to-sky-50">
              <div>
                <div className="text-lg font-semibold">{t('practice.setupTitle')}</div>
                <div className="text-xs text-blue-600">{t('practice.setupSubtitle')}</div>
              </div>
              <button type="button" onClick={() => setSetupOpen(false)} className="text-sm text-gray-400">{t('common.close')}</button>
            </div>

            <div className="p-5 pt-4 space-y-4 overflow-y-auto flex-1">
              <div className="space-y-2">
                <label className="text-xs text-gray-500">{t('practice.courseLabel')}</label>
                <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80" disabled>
                  <option>{t('practice.defaultCourse')}</option>
                </select>
                <div className="text-xs text-blue-600">{t('practice.guestCourseHint')}</div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-500">{t('practice.modeLabel')}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('stableford')}
                    className={mode === 'stableford' ? 'px-3 py-2 rounded-xl border border-blue-500 text-blue-600 text-sm bg-blue-50' : 'px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm'}
                  >
                    {t('practice.modeStableford')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('match')}
                    className={mode === 'match' ? 'px-3 py-2 rounded-xl border border-blue-500 text-blue-600 text-sm bg-blue-50' : 'px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm'}
                  >
                    {t('practice.modeMatchPlay')}
                  </button>
                </div>
              </div>

              {mode === 'stableford' && (
                <div className="space-y-2">
                  <label className="text-xs text-gray-500">{t('practice.playersCount')}</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPlayerCount((value) => clampNumber(value - 1, 1, 4))}
                      className="h-9 w-9 rounded-xl border border-gray-200"
                    >
                      &lt;
                    </button>
                    <div className="h-9 w-12 border border-gray-200 rounded-xl flex items-center justify-center text-sm">
                      {playerCount}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPlayerCount((value) => clampNumber(value + 1, 1, 4))}
                      className="h-9 w-9 rounded-xl border border-gray-200"
                    >
                      &gt;
                    </button>
                  </div>
                </div>
              )}

              {mode === 'match' && (
                <div className="space-y-2">
                  <label className="text-xs text-gray-500">{t('practice.holesCount')}</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setHolesCount((value) => clampNumber(value - 1, 1, 36))}
                      className="h-9 w-9 rounded-xl border border-gray-200"
                    >
                      &lt;
                    </button>
                    <input
                      type="number"
                      value={holesCount}
                      onChange={(event) => setHolesCount(clampNumber(Number(event.target.value || 1), 1, 36))}
                      className="h-9 w-16 border border-gray-200 rounded-xl text-center text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setHolesCount((value) => clampNumber(value + 1, 1, 36))}
                      className="h-9 w-9 rounded-xl border border-gray-200"
                    >
                      &gt;
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[3, 6, 9, 18].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setHolesCount(value)}
                        className={holesCount === value ? 'px-3 py-1 text-xs border border-blue-500 rounded-xl text-blue-600 bg-blue-50' : 'px-3 py-1 text-xs border border-gray-200 rounded-xl'}
                      >
                        {t('practice.holesShortcut').replace('{count}', String(value))}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs text-gray-500">{t('practice.playersLabel')}</label>
                {Array.from({ length: mode === 'match' ? 2 : playerCount }, (_, idx) => (
                  <input
                    key={`player-${idx}`}
                    type="text"
                    value={players[idx] ?? ''}
                    onChange={(event) => updatePlayer(idx, event.target.value)}
                    placeholder={
                      idx === 0 && !isGuest
                        ? t('practice.playerNameRegistered')
                        : t('practice.playerNamePlaceholder')
                    }
                    className={`w-full border border-gray-200 rounded-xl px-3 py-2 text-sm ${getPlayerNameClass(idx)}`}
                  />
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 bg-white/90">
              <button
                type="button"
                onClick={handleStart}
                className="w-full bg-blue-500 text-white rounded-xl py-2.5 text-sm shadow-md shadow-blue-500/30"
                disabled={!mode}
              >
                {t('practice.startTraining')}
              </button>
              <Link
                href="/dashboard"
                className="premium-back-btn text-sm mt-2 inline-flex items-center justify-center gap-1.5"
                onClick={handleBackClick}
                aria-label="Atras"
              >
                <ArrowLeft className="h-4 w-4" />
                <DoorOpen className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {!setupOpen && mode === 'stableford' && (
        <section
          className={`max-w-3xl mx-auto rounded-3xl p-4 sm:p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)] space-y-4 ${gameCardShellClassName}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold">{t('practice.cardTitle')}</div>
              <div className="text-xs text-blue-600">{t('practice.cardSubtitle')}</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={toggleGameCardTheme} className={gameCardBorderBtnClassName}>
                {gameCardToggleLabel}
              </button>
              <button type="button" onClick={handleHideCard} className={gameCardBorderBtnClassName}>
                {t('common.exit')}
              </button>
            </div>
          </div>

          <div className={gameCardPanelClassName}>
            <div className="grid grid-cols-3 rounded-xl bg-blue-500 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white mb-3">
              <div>{t('practice.playerLabel')}</div>
              <div className="text-center">{t('practice.scoreLabel')}</div>
              <div className="text-right">
                {t('practice.holeParLabel')
                  .replace('{hole}', String(stablefordHole + 1))
                  .replace('{par}', String(PAR_VALUE))}
              </div>
            </div>
            <div className="space-y-3">
              {Array.from({ length: playerCount }, (_, idx) => {
                const badge = getResultBadge(strokes[idx]?.[stablefordHole] ?? 0, PAR_VALUE);
                const strokeValue = strokes[idx]?.[stablefordHole] ?? 0;
                const totals = getStablefordTotals(strokes[idx] ?? []);
                return (
                  <div key={`score-${idx}`} className="flex items-center justify-between">
                    <div className={`text-sm font-semibold ${getPlayerNameClass(idx)}`}>
                      {players[idx] || t('practice.playerShort').replace('{num}', String(idx + 1))}
                    </div>
                    <div className={`text-sm font-semibold ${gameCardSubtleTextClassName}`}>
                      {formatStablefordTotal(totals.total, totals.parTotal, totals.diff, totals.played)}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={15}
                        value={strokeValue}
                        onChange={(event) => updateStroke(idx, stablefordHole, event.target.value)}
                        disabled={stablefordFinalized}
                        className={`h-9 w-16 border rounded-xl text-center text-sm ${badge.inputClassName}`}
                      />
                      <div className={`h-9 w-9 overflow-hidden rounded-xl border ${strokeStepperShellClassName} flex flex-col`}>
                        <button
                          type="button"
                          aria-label="Subir golpes"
                          disabled={stablefordFinalized || strokeValue >= 15}
                          onClick={() => updateStroke(idx, stablefordHole, String(strokeValue + 1))}
                          className={`flex-1 text-[11px] leading-none ${strokeStepperBtnClassName} disabled:opacity-40`}
                        >
                          ▲
                        </button>
                        <div className={gameCardTheme === 'dark' ? 'h-px bg-white/20' : 'h-px bg-gray-200'} />
                        <button
                          type="button"
                          aria-label="Bajar golpes"
                          disabled={stablefordFinalized || strokeValue <= 0}
                          onClick={() => updateStroke(idx, stablefordHole, String(strokeValue - 1))}
                          className={`flex-1 text-[11px] leading-none ${strokeStepperBtnClassName} disabled:opacity-40`}
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-4">
              <button
                type="button"
                onClick={() => setStablefordHole((value) => clampNumber(value - 1, 0, DEFAULT_HOLES - 1))}
                className={gameCardBorderBtnClassName}
              >
                {t('common.prev')}
              </button>
              <div className="text-sm font-semibold">
                {t('practice.holeOf')
                  .replace('{hole}', String(stablefordHole + 1))
                  .replace('{total}', String(DEFAULT_HOLES))}
              </div>
              <button
                type="button"
                onClick={() => setStablefordHole((value) => clampNumber(value + 1, 0, DEFAULT_HOLES - 1))}
                className={gameCardBorderBtnClassName}
              >
                {t('common.next')}
              </button>
            </div>
          </div>

          <div className={gameCardPanelClassName}>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowStablefordTotal((prev) => !prev)}
                className="text-sm font-semibold text-blue-600 transition hover:text-blue-800"
              >
                {showStablefordTotal ? t('practice.hideTotalCard') : t('practice.showTotalCard')}
              </button>
              <button
                type="button"
                onClick={handleFinalizeStableford}
                className={
                  stablefordFinalized
                    ? 'px-4 py-2 text-xs rounded-xl bg-gray-200 text-gray-500'
                    : 'px-4 py-2 text-xs rounded-xl bg-blue-500 text-white'
                }
                disabled={stablefordFinalized}
              >
                {t('practice.closeCard')}
              </button>
            </div>
            {showStablefordTotal && (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className={`text-left ${gameCardSubtleTextClassName}`}>
                      <th className="py-2 pr-3">{t('practice.holeLabel')}</th>
                      {Array.from({ length: playerCount }, (_, idx) => (
                        <th key={`head-${idx}`} className={`py-2 pr-3 ${getPlayerNameClass(idx)}`}>
                          {players[idx] || t('practice.playerShort').replace('{num}', String(idx + 1))}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: DEFAULT_HOLES }, (_, holeIdx) => (
                      <tr key={`row-${holeIdx}`} className={gameCardTheme === 'dark' ? 'border-t border-white/10' : 'border-t border-black/10'}>
                        <td className="py-2 pr-3">{holeIdx + 1}</td>
                        {Array.from({ length: playerCount }, (_, idx) => {
                          const badge = getResultBadge(strokes[idx]?.[holeIdx] ?? 0, PAR_VALUE);
                          return (
                            <td key={`cell-${holeIdx}-${idx}`} className="py-2 pr-3">
                              <span className={`inline-flex px-2 py-1 rounded text-[10px] font-semibold ${badge.className}`}>
                                {strokes[idx]?.[holeIdx] ? strokes[idx][holeIdx] : '-'}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {!setupOpen && mode === 'match' && (
        <section
          className={`max-w-2xl mx-auto rounded-3xl p-4 sm:p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)] space-y-4 ${gameCardShellClassName}`}
        >
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={toggleGameCardTheme} className={gameCardBorderBtnClassName}>
              {gameCardToggleLabel}
            </button>
            <button type="button" onClick={handleHideCard} className={gameCardBorderBtnClassName} aria-label="Inicio">
              <Home className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-3 sm:grid-cols-[1fr,140px,280px] rounded-xl bg-blue-500 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white">
              <div>{t('practice.playerLabel')}</div>
              <div className="text-center">{t('practice.scoreLabel')}</div>
              <div className="text-right">{t('practice.holeShort').replace('{hole}', String(matchHole + 1))}</div>
            </div>

            {/* Mobile: keep stacked layout */}
            <div className="space-y-3 sm:hidden">
              <div className="space-y-3">
                {[0, 1].map((idx) => (
                  <div key={`mp-m-${idx}`} className="grid grid-cols-3 items-center gap-2">
                    <div className={`min-w-0 truncate text-sm font-semibold ${getPlayerNameClass(idx)}`}>
                      {players[idx] || t('practice.playerShort').replace('{num}', String(idx + 1))}
                    </div>
                    <div className="text-sm font-semibold text-center tabular-nums">{idx === 0 ? matchTotals.p1 : matchTotals.p2}</div>
                    <div className={`min-w-0 truncate text-right text-xs ${gameCardSubtleTextClassName}`}>
                      {t('practice.winsLabel').replace(
                        '{player}',
                        players[idx] || t('practice.playerShort').replace('{num}', String(idx + 1))
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setMatchOutcome(matchHole, 1)}
                  disabled={matchFinalized}
                  className={
                    matchResults[matchHole] === 1
                      ? 'w-full bg-green-500 text-white rounded-xl py-2 text-sm'
                      : matchResults[matchHole] === -1
                        ? 'w-full bg-red-500 text-white rounded-xl py-2 text-sm'
                        : gameCardTheme === 'dark'
                          ? 'w-full bg-black text-white border border-white/30 rounded-xl py-2 text-sm'
                          : 'w-full bg-white text-black border border-black/20 rounded-xl py-2 text-sm'
                  }
                >
                  {matchResults[matchHole] === -1 ? (
                    t('practice.loser')
                  ) : (
                    <>
                      {t('practice.winnerPrefix')}{' '}
                      <span className="text-blue-600">{players[0] || t('practice.playerShort').replace('{num}', '1')}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setMatchOutcome(matchHole, 0)}
                  disabled={matchFinalized}
                  className={
                    matchResults[matchHole] === 0
                      ? 'w-full bg-orange-400 text-white rounded-xl py-2 text-sm'
                      : gameCardTheme === 'dark'
                        ? 'w-full bg-black text-white border border-white/30 rounded-xl py-2 text-sm'
                        : 'w-full bg-white text-black border border-black/20 rounded-xl py-2 text-sm'
                  }
                >
                  {t('practice.tie')}
                </button>
                <button
                  type="button"
                  onClick={() => setMatchOutcome(matchHole, -1)}
                  disabled={matchFinalized}
                  className={
                    matchResults[matchHole] === -1
                      ? 'w-full bg-green-500 text-white rounded-xl py-2 text-sm'
                      : matchResults[matchHole] === 1
                        ? 'w-full bg-red-500 text-white rounded-xl py-2 text-sm'
                        : gameCardTheme === 'dark'
                          ? 'w-full bg-black text-white border border-white/30 rounded-xl py-2 text-sm'
                          : 'w-full bg-white text-black border border-black/20 rounded-xl py-2 text-sm'
                  }
                >
                  {matchResults[matchHole] === 1 ? (
                    t('practice.loser')
                  ) : (
                    <>
                      {t('practice.winnerPrefix')}{' '}
                      <span className="text-violet-600">{players[1] || t('practice.playerShort').replace('{num}', '2')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Desktop: grid aligned like reference */}
            <div className="hidden sm:block">
              <div className="grid gap-2 sm:grid-cols-[1fr,140px,280px] sm:items-stretch">
                <div className={`text-sm font-semibold ${getPlayerNameClass(0)} self-center`}>
                  {players[0] || t('practice.playerShort').replace('{num}', '1')}
                </div>
                <div className="text-sm font-semibold text-center self-center">{matchTotals.p1}</div>
                <div className="row-span-2 flex flex-col gap-2 self-stretch">
                  <button
                    type="button"
                    onClick={() => setMatchOutcome(matchHole, 1)}
                    disabled={matchFinalized}
                    className={
                      matchResults[matchHole] === 1
                        ? 'w-full bg-green-500 text-white rounded-xl py-2 text-sm'
                        : matchResults[matchHole] === -1
                          ? 'w-full bg-red-500 text-white rounded-xl py-2 text-sm'
                          : gameCardTheme === 'dark'
                            ? 'w-full bg-black text-white border border-white/30 rounded-xl py-2 text-sm'
                            : 'w-full bg-white text-black border border-black/20 rounded-xl py-2 text-sm'
                    }
                  >
                    {matchResults[matchHole] === -1 ? (
                      t('practice.loser')
                    ) : (
                      <>
                        {t('practice.winnerPrefix')}{' '}
                        <span className="text-blue-600">{players[0] || t('practice.playerShort').replace('{num}', '1')}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMatchOutcome(matchHole, 0)}
                    disabled={matchFinalized}
                    className={
                      matchResults[matchHole] === 0
                        ? 'w-full bg-orange-400 text-white rounded-xl py-2 text-sm'
                        : gameCardTheme === 'dark'
                          ? 'w-full bg-black text-white border border-white/30 rounded-xl py-2 text-sm'
                          : 'w-full bg-white text-black border border-black/20 rounded-xl py-2 text-sm'
                    }
                  >
                    {t('practice.tie')}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMatchOutcome(matchHole, -1)}
                    disabled={matchFinalized}
                    className={
                      matchResults[matchHole] === -1
                        ? 'w-full bg-green-500 text-white rounded-xl py-2 text-sm'
                        : matchResults[matchHole] === 1
                          ? 'w-full bg-red-500 text-white rounded-xl py-2 text-sm'
                          : gameCardTheme === 'dark'
                            ? 'w-full bg-black text-white border border-white/30 rounded-xl py-2 text-sm'
                            : 'w-full bg-white text-black border border-black/20 rounded-xl py-2 text-sm'
                    }
                  >
                    {matchResults[matchHole] === 1 ? (
                      t('practice.loser')
                    ) : (
                      <>
                        {t('practice.winnerPrefix')}{' '}
                        <span className="text-violet-600">{players[1] || t('practice.playerShort').replace('{num}', '2')}</span>
                      </>
                    )}
                  </button>
                </div>

                <div className={`text-sm font-semibold ${getPlayerNameClass(1)} self-center`}>
                  {players[1] || t('practice.playerShort').replace('{num}', '2')}
                </div>
                <div className="text-sm font-semibold text-center self-center">{matchTotals.p2}</div>
              </div>
            </div>
          </div>

          {matchTied && (
            <div className={`${gameCardPanelClassName} space-y-2`}>
              <div className="text-sm font-semibold">{t('practice.playoffTitle')}</div>
              <div className={`text-xs ${gameCardSubtleTextClassName}`}>{t('practice.playoffHint')}</div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setPlayoffResult(1)}
                  disabled={matchFinalized}
                  className={
                    playoffResult === 1
                      ? 'w-full bg-green-500 text-white rounded-xl py-2 text-sm'
                      : playoffResult === -1
                        ? 'w-full bg-red-500 text-white rounded-xl py-2 text-sm'
                        : gameCardTheme === 'dark'
                          ? 'w-full bg-black text-white border border-white/30 rounded-xl py-2 text-sm'
                          : 'w-full bg-white text-black border border-black/20 rounded-xl py-2 text-sm'
                  }
                >
                  {t('practice.winnerPrefix')}{' '}
                  <span className="text-blue-600">{players[0] || t('practice.playerShort').replace('{num}', '1')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPlayoffResult(-1)}
                  disabled={matchFinalized}
                  className={
                    playoffResult === -1
                      ? 'w-full bg-green-500 text-white rounded-xl py-2 text-sm'
                      : playoffResult === 1
                        ? 'w-full bg-red-500 text-white rounded-xl py-2 text-sm'
                        : gameCardTheme === 'dark'
                          ? 'w-full bg-black text-white border border-white/30 rounded-xl py-2 text-sm'
                          : 'w-full bg-white text-black border border-black/20 rounded-xl py-2 text-sm'
                  }
                >
                  {t('practice.winnerPrefix')}{' '}
                  <span className="text-violet-600">{players[1] || t('practice.playerShort').replace('{num}', '2')}</span>
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMatchHole((value) => clampNumber(value - 1, 0, holesCount - 1))}
              className={gameCardBorderBtnClassName}
            >
              {t('common.prev')}
            </button>
            <div className="text-sm font-semibold">
              {t('practice.holeOf')
                .replace('{hole}', String(matchHole + 1))
                .replace('{total}', String(holesCount))}
            </div>
            <button
              type="button"
              onClick={() => setMatchHole((value) => clampNumber(value + 1, 0, holesCount - 1))}
              className={gameCardBorderBtnClassName}
            >
              {t('common.next')}
            </button>
          </div>

          <div className={gameCardPanelClassName}>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowMatchTotal((prev) => !prev)}
                className="text-sm font-semibold text-blue-600 transition hover:text-blue-800"
              >
                {showMatchTotal ? t('practice.hideTotalCard') : t('practice.showTotalCard')}
              </button>
              <button
                type="button"
                onClick={handleFinalizeMatch}
                className={
                  matchFinalized
                    ? 'px-4 py-2 text-xs rounded-xl bg-gray-200 text-gray-500'
                    : 'px-4 py-2 text-xs rounded-xl bg-blue-500 text-white'
                }
                disabled={matchFinalized}
              >
                {t('practice.closeCard')}
              </button>
            </div>
            {showMatchTotal && (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className={`text-left ${gameCardSubtleTextClassName}`}>
                      {Array.from({ length: holesCount }, (_, holeIdx) => (
                        <th key={`head-hole-${holeIdx}`} className="py-2 pr-2 text-center">
                          {holeIdx + 1}
                        </th>
                      ))}
                      {matchTied && (
                        <th className="py-2 pr-2 text-center">{t('practice.playoffShort')}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={gameCardTheme === 'dark' ? 'border-t border-white/10' : 'border-t border-black/10'}>
                      {Array.from({ length: holesCount }, (_, holeIdx) => {
                        const result = matchResults[holeIdx];
                        return (
                          <td key={`match-cell-${holeIdx}`} className="py-2 pr-2">
                            <div className={`h-8 rounded-lg ${getMatchCellClass(result)}`} />
                          </td>
                        );
                      })}
                      {matchTied && (
                        <td className="py-2 pr-2">
                          <div className={`h-8 rounded-lg ${getMatchCellClass(playoffResult)}`} />
                        </td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
