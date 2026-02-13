'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/context/language-context';

type RoundMatch = {
  p1: string;
  p2: string;
  p1_id?: string | null;
  p2_id?: string | null;
  result?: string | null;
  winner?: string | null;
};

type BracketRound = {
  name: string;
  matches: RoundMatch[];
  anchorTargets?: number[];
};

function normalizeName(value: unknown) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (v.toLowerCase() === 'n/a') return 'BYE';
  return v;
}

function computeRoundCenters(
  rounds: { name: string; matchCount: number; anchorTargets?: number[] }[],
  cardHeight: number,
  gap: number
) {
  if (!rounds.length) return [] as number[][];

  const step = cardHeight + gap;
  const centersByRound: number[][] = [];

  const hasAnchoredPrelim = rounds.length > 1 && (rounds[0]?.anchorTargets?.length || 0) > 0;
  const baseIndex = hasAnchoredPrelim ? 1 : 0;

  centersByRound[baseIndex] = Array.from(
    { length: rounds[baseIndex].matchCount },
    (_, i) => i * step + cardHeight / 2
  );

  for (let r = baseIndex + 1; r < rounds.length; r++) {
    const prev = centersByRound[r - 1] || [];
    const count = rounds[r].matchCount;
    centersByRound[r] = Array.from({ length: count }, (_, i) => {
      const a = prev[i * 2];
      const b = prev[i * 2 + 1];
      if (typeof a === 'number' && typeof b === 'number') return (a + b) / 2;
      if (typeof a === 'number') return a;
      if (typeof b === 'number') return b;
      return i * step + cardHeight / 2;
    });
  }

  for (let r = baseIndex - 1; r >= 0; r--) {
    const anchors = rounds[r]?.anchorTargets || [];
    if (anchors.length > 0) {
      const target = centersByRound[r + 1] || [];
      const count = rounds[r].matchCount;
      const points = anchors.slice(0, count).map((idx, i) => {
        const c = target[idx];
        if (typeof c === 'number') return c;
        return i * step + cardHeight / 2;
      });
      if (points.length < count) {
        for (let i = points.length; i < count; i += 1) {
          points.push(i * step + cardHeight / 2);
        }
      }
      centersByRound[r] = points;
    } else {
      centersByRound[r] = Array.from({ length: rounds[r].matchCount }, (_, i) => i * step + cardHeight / 2);
    }
  }

  return centersByRound;
}

export default function MatchPlayDrawModal({
  open,
  onClose,
  eventName,
  rounds,
  consolationRounds = [],
  championName,
  forceRevealAll = false,
  autoStart = false,
}: {
  open: boolean;
  onClose: () => void;
  eventName: string;
  rounds: BracketRound[];
  consolationRounds?: BracketRound[];
  championName?: string | null;
  forceRevealAll?: boolean;
  autoStart?: boolean;
}) {
  const intervalRef = useRef<number | null>(null);
  const { t } = useLanguage();

  const normalizedRounds = useMemo(() => {
    return (rounds || [])
      .map((r) => ({
        name: String(r?.name || 'Ronda'),
        anchorTargets: Array.isArray(r?.anchorTargets)
          ? r.anchorTargets.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n))
          : undefined,
        matches: (r?.matches || []).map((m) => ({
          p1: normalizeName(m?.p1),
          p2: normalizeName(m?.p2),
          p1_id: m?.p1_id ?? null,
          p2_id: m?.p2_id ?? null,
          result: typeof m?.result === 'string' ? m.result : null,
          winner: m?.winner != null ? String(m.winner) : null,
        })),
      }))
      .filter((r) => r.matches.length > 0);
  }, [rounds]);

  const normalizedConsolationRounds = useMemo(() => {
    return (consolationRounds || [])
      .map((r) => ({
        name: String(r?.name || 'Consolacion'),
        anchorTargets: Array.isArray(r?.anchorTargets)
          ? r.anchorTargets.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n))
          : undefined,
        matches: (r?.matches || []).map((m) => ({
          p1: normalizeName(m?.p1),
          p2: normalizeName(m?.p2),
          p1_id: m?.p1_id ?? null,
          p2_id: m?.p2_id ?? null,
          result: typeof m?.result === 'string' ? m.result : null,
          winner: m?.winner != null ? String(m.winner) : null,
        })),
      }))
      .filter((r) => r.matches.length > 0);
  }, [consolationRounds]);

  const roundsMeta = useMemo(() => {
    if (normalizedRounds.length === 0) {
      return [] as { name: string; matchCount: number; anchorTargets?: number[] }[];
    }
    return normalizedRounds.map((r) => ({
      name: r.name,
      matchCount: r.matches.length,
      anchorTargets: r.anchorTargets,
    }));
  }, [normalizedRounds]);

  const CARD_H = 104;
  const GAP = 22;

  const centersByRound = useMemo(() => computeRoundCenters(roundsMeta, CARD_H, GAP), [roundsMeta]);
  const totalHeight = useMemo(() => {
    const maxMatches = Math.max(0, ...roundsMeta.map((r) => r.matchCount || 0));
    if (maxMatches <= 0) return 0;
    return maxMatches * CARD_H + (maxMatches - 1) * GAP;
  }, [roundsMeta]);

  const slots = useMemo(() => {
    const out: { roundIndex: number; matchIndex: number; side: 'p1' | 'p2'; name: string }[] = [];
    normalizedRounds.forEach((round, roundIndex) => {
      round.matches.forEach((m, matchIndex) => {
        out.push({ roundIndex, matchIndex, side: 'p1', name: m.p1 || '' });
        out.push({ roundIndex, matchIndex, side: 'p2', name: m.p2 || '' });
      });
    });
    return out;
  }, [normalizedRounds]);

  const slotOffsets = useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    normalizedRounds.forEach((round) => {
      offsets.push(acc);
      acc += round.matches.length * 2;
    });
    return offsets;
  }, [normalizedRounds]);

  const [revealedCount, setRevealedCount] = useState(0);
  const [running, setRunning] = useState(false);

  const stop = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRunning(false);
  };

  const finalize = () => {
    stop();
    setRevealedCount(slots.length);
  };

  const reset = () => {
    stop();
    setRevealedCount(0);
  };

  const start = () => {
    reset();
    if (slots.length === 0) return;
    setRunning(true);

    intervalRef.current = window.setInterval(() => {
      setRevealedCount((prev) => {
        const next = prev + 1;
        if (next >= slots.length) {
          stop();
          return slots.length;
        }
        return next;
      });
    }, 3000);

    // Reveal first slot immediately
    setRevealedCount(1);
  };

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }

    if (forceRevealAll) {
      setRevealedCount(slots.length);
      return;
    }

    if (autoStart) {
      const t = window.setTimeout(() => start(), 400);
      return () => {
        window.clearTimeout(t);
      };
    }

    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const round0Name = String(normalizedRounds[0]?.name || 'Primera ronda');
  const championLabel = championName ? String(championName) : '';
  const derivedChampionLabel = useMemo(() => {
    const normalizedChampion = championLabel.trim().toLowerCase();
    const isGenericChampion = normalizedChampion === 'jugador' || normalizedChampion === 'campeon' || normalizedChampion === 'campeon jugador';
    if (championLabel && !isGenericChampion) return championLabel;
    const lastRound = normalizedRounds[normalizedRounds.length - 1];
    const finalMatch = lastRound?.matches?.[0];
    if (!finalMatch) return '';
    const winner = finalMatch.winner;
    if (winner === finalMatch.p1_id || winner === finalMatch.p1 || winner === 'p1') {
      return finalMatch.p1 || '';
    }
    if (winner === finalMatch.p2_id || winner === finalMatch.p2 || winner === 'p2') {
      return finalMatch.p2 || '';
    }
    return '';
  }, [championLabel, normalizedRounds]);

  if (!open) return null;

  const isRevealed = (roundIndex: number, matchIndex: number, side: 'p1' | 'p2') => {
    const base = slotOffsets[roundIndex] || 0;
    const idx = base + matchIndex * 2 + (side === 'p2' ? 1 : 0);
    return idx < revealedCount;
  };

  const renderPlayerLine = (
    roundIndex: number,
    matchIndex: number,
    side: 'p1' | 'p2',
    name: string,
    outcome: 'winner' | 'loser' | 'final-winner' | 'final-loser' | 'consolation-winner' | null,
    forceShown: boolean
  ) => {
    const shown = forceShown ? true : isRevealed(roundIndex, matchIndex, side);
    const safeName = name || '—';
    const display = shown ? safeName : '—';
    const isBye = shown && String(name || '').toLowerCase() === 'bye';

    return (
      <div
        className={
          'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ' +
          'transition-all duration-700 ease-out ' +
          (shown ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1') +
          (shown && outcome === 'final-winner'
            ? ' bg-amber-200/70 border border-amber-100/80'
            : '') +
          (shown && (outcome === 'winner' || outcome === 'consolation-winner')
            ? ' bg-emerald-300/20 border border-emerald-200/60'
            : '') +
          (shown && outcome === 'loser' ? ' bg-rose-300/15 border border-rose-200/50' : '') +
          (shown && outcome === 'final-loser'
            ? ' bg-slate-200/70 border border-slate-100/80'
            : '')
        }
      >
        <div
          className={
            'font-semibold truncate ' +
            (isBye
              ? 'text-amber-200'
              : outcome === 'final-loser' || outcome === 'final-winner'
                ? 'text-slate-900'
                : 'text-white')
          }
          title={display}
        >
          {display}
        </div>
        {isBye ? (
          <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-200/50 bg-amber-300/10 text-amber-200">
            bye
          </span>
        ) : null}
      </div>
    );
  };

  const renderBracketBlock = (
    title: string,
    bracketRounds: typeof normalizedRounds,
    bracketMeta: { name: string; matchCount: number; anchorTargets?: number[] }[],
    revealEnabled: boolean,
    baseRoundName: string,
    showChampion: boolean,
    bracketKind: 'main' | 'consolation'
  ) => {
    if (!bracketRounds.length || !bracketMeta.length) return null;
    const centers = computeRoundCenters(bracketMeta, CARD_H, GAP);
    const maxMatches = Math.max(0, ...bracketMeta.map((r) => r.matchCount || 0));
    const height = maxMatches > 0 ? maxMatches * CARD_H + (maxMatches - 1) * GAP : 0;

    return (
      <div className="space-y-3">
        <div className="text-white/80 text-xs font-semibold uppercase tracking-wide">
          {title}
        </div>
        <div className="min-w-[920px]">
          <div className="flex items-start gap-6">
            {bracketMeta.map((r, roundIndex) => {
              const matchCount = r.matchCount;
              const roundMatches = bracketRounds[roundIndex]?.matches || [];
              const tops = (centers[roundIndex] || []).map((c) => Math.max(0, c - CARD_H / 2));
              const isFinalRound = roundIndex === bracketMeta.length - 1 && matchCount === 1;

              return (
                <div key={`${title}-${r.name}-${matchCount}`} className="w-[260px] shrink-0">
                  <div className="text-white/80 text-xs font-semibold uppercase tracking-wide mb-3">
                    {roundIndex === 0 ? baseRoundName : r.name}
                  </div>

                  <div className="relative" style={{ height: height ? `${height}px` : undefined }}>
                    {Array.from({ length: matchCount }).map((_, matchIndex) => {
                      const m = roundMatches[matchIndex];
                      const p1 = m?.p1 || '';
                      const p2 = m?.p2 || '';
                      const top = tops[matchIndex] ?? 0;
                      const winner = m?.winner || null;
                      const result = m?.result || null;
                      const isP1Winner = !!winner && (winner === m?.p1_id || winner === m?.p1 || winner === 'p1');
                      const isP2Winner = !!winner && (winner === m?.p2_id || winner === m?.p2 || winner === 'p2');
                      const hasWinner = !!winner && (isP1Winner || isP2Winner);
                      const isFinalMatch = isFinalRound && matchIndex === 0;
                      const p1Outcome = hasWinner
                        ? isP1Winner
                          ? bracketKind === 'consolation' && isFinalMatch
                            ? 'consolation-winner'
                            : bracketKind === 'main' && isFinalMatch
                              ? 'final-winner'
                              : 'winner'
                          : bracketKind === 'main' && isFinalMatch
                            ? 'final-loser'
                            : 'loser'
                        : null;
                      const p2Outcome = hasWinner
                        ? isP2Winner
                          ? bracketKind === 'consolation' && isFinalMatch
                            ? 'consolation-winner'
                            : bracketKind === 'main' && isFinalMatch
                              ? 'final-winner'
                              : 'winner'
                          : bracketKind === 'main' && isFinalMatch
                            ? 'final-loser'
                            : 'loser'
                        : null;

                      return (
                        <div key={`${title}-${roundIndex}-${matchIndex}`} className="absolute left-0 right-0" style={{ top: `${top}px` }}>
                          <div
                            className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm overflow-hidden"
                            style={{ height: `${CARD_H}px` }}
                          >
                            <div className="p-2">
                              <div className="flex items-center justify-between text-[11px] text-white/70 px-1 pb-1">
                                <span>{result ? 'Resultado' : ''}</span>
                                <span className="text-white/90 font-semibold">{result || ''}</span>
                              </div>
                              {renderPlayerLine(roundIndex, matchIndex, 'p1', p1, p1Outcome, !revealEnabled || forceRevealAll)}
                              <div className="h-px bg-white/10 mx-2" />
                              {renderPlayerLine(roundIndex, matchIndex, 'p2', p2, p2Outcome, !revealEnabled || forceRevealAll)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {showChampion && derivedChampionLabel ? (
              <div className="w-[220px] shrink-0">
                <div className="text-white/80 text-xs font-semibold uppercase tracking-wide mb-3">Campeon</div>
                <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-200 via-amber-100 to-yellow-100 text-amber-900 shadow-[0_12px_36px_rgba(251,191,36,0.35)] p-4 text-center">
                  <div className="text-[11px] uppercase tracking-wide">Campeon</div>
                  <div className="text-sm font-semibold mt-1">{derivedChampionLabel}</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="absolute inset-0 p-3 sm:p-6 flex items-center justify-center">
        <div
          className="relative w-full max-w-6xl h-[85vh] rounded-3xl overflow-hidden border border-white/20 shadow-[0_30px_90px_rgba(0,0,0,0.45)]"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: 'url(/matchplay.jpg)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/55 to-black/75" />

          <div className="relative h-full flex flex-col">
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-white/15">
              <div className="min-w-0">
                <div className="text-white font-semibold truncate">{eventName}</div>
                <div className="text-white/70 text-xs truncate">Sorteo Match Play · {round0Name}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => (running ? null : start())}
                  className={
                    'rounded-xl px-3 py-2 text-sm border ' +
                    (running
                      ? 'border-white/15 bg-white/10 text-white/50 cursor-not-allowed'
                      : 'border-white/20 bg-white/10 text-white hover:bg-white/15')
                  }
                  disabled={running}
                >
                  {t('common.start')}
                </button>
                <button
                  type="button"
                  onClick={finalize}
                  className="rounded-xl px-3 py-2 text-sm border border-white/20 bg-white/10 text-white hover:bg-white/15"
                >
                  {t('common.finish')}
                </button>
                {!running && revealedCount > 0 ? (
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-xl px-3 py-2 text-sm border border-white/20 bg-white/10 text-white hover:bg-white/15"
                  >
                    {t('common.reset')}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl px-3 py-2 text-sm border border-white/20 bg-white/10 text-white hover:bg-white/15"
                  aria-label={t('common.close')}
                >
                  {t('common.close')}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <div className="h-full overflow-auto p-4 sm:p-6">
                <div className="space-y-10">
                  {renderBracketBlock('Cuadro principal', normalizedRounds, roundsMeta, true, round0Name, true, 'main')}
                  {normalizedConsolationRounds.length > 0
                    ? renderBracketBlock(
                        'Consolacion',
                        normalizedConsolationRounds,
                        normalizedConsolationRounds.map((r) => ({
                          name: r.name,
                          matchCount: r.matches.length,
                          anchorTargets: r.anchorTargets,
                        })),
                        false,
                        String(normalizedConsolationRounds[0]?.name || 'Consolacion'),
                        false,
                        'consolation'
                      )
                    : null}
                </div>
              </div>
            </div>

            <div className="px-4 sm:px-6 py-3 border-t border-white/15 text-xs text-white/60">
              {running ? 'Sorteando…' : revealedCount > 0 ? `Revelados: ${revealedCount}/${slots.length}` : 'Listo para sortear.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
