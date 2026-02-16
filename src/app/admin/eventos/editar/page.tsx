'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, DoorOpen, Pencil, Save, RefreshCw, ChevronUp, ChevronDown, PlusCircle } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import AssociationSelector from '@/components/AssociationSelector';
import { supabase } from '@/lib/supabase';
import { exportResultsAll } from '@/lib/export-results';
import { exportWeeklyDetailed, type WeeklyExportRow } from '@/lib/export-weekly';
import { compareCardsForTieBreak } from '@/lib/rankings';
import * as XLSX from 'xlsx';
import { useLanguage } from '@/context/language-context';

type EventLite = { id: string; name: string; event_date: string | null };
type CourseLite = { id: string; name: string };

type MatchPlayFormat = 'classic' | 'groups';
type GroupMode = 'single' | 'multi';
type StablefordMode = 'classic' | 'best_card' | 'best_hole' | 'weekly';
type PointsMode = 'manual' | 'percent';
type ChampHubEventDraft = {
  eventId: string;
  kind: 'simple' | 'doble';
  pointsMode: PointsMode;
  firstRaw: string;
  decayRaw: string;
  podiumRaw: string;
  tableRaw: string;
};

const CATEGORY_OPTIONS = ['Masculino', 'Femenino', 'Senior', 'Senior+', 'Junior'];

type RegisteredPlayer = { id: string; name: string; category?: string | null };

type BracketMatch = {
  p1: string;
  p2: string;
  p1_id: string | null;
  p2_id: string | null;
  result?: string | null;
  winner?: string | null;
};
type BracketRound = { name: string; matches: BracketMatch[]; anchorTargets?: number[] };
type BracketLabels = {
  placeholder: string;
  preliminaryRound: string;
  preliminaryWinner: string;
  defaultRound: string;
  firstRound: string;
};

type FinalClassificationRow = {
  user_id: string;
  position: number;
  strokes?: number | null;
  rounds?: Array<number | null>;
  note?: string | null;
};

type WeeklyCard = {
  userId: string;
  holes: Array<number | null>;
  holesPlayed: number;
  total: number | null;
  isComplete: boolean;
  gameId: string;
  gameDate: string | null;
};

type WeeklyRowDraft = WeeklyExportRow & {
  isComplete: boolean;
  holesPlayed: number;
};

const inputClassName =
  'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200';
const selectClassName =
  'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200';
const textareaClassName =
  'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200';

const buildDefaultChampHubEvent = (): ChampHubEventDraft => ({
  eventId: '',
  kind: 'simple',
  pointsMode: 'percent',
  firstRaw: '100',
  decayRaw: '8',
  podiumRaw: '3',
  tableRaw: '',
});

const getCategoryLabel = (category: string, t: (path: string) => string) => {
  switch (category) {
    case 'Masculino':
      return t('categories.male');
    case 'Femenino':
      return t('categories.female');
    case 'Senior':
      return t('categories.senior');
    case 'Senior+':
      return t('categories.seniorPlus');
    case 'Junior':
      return t('categories.junior');
    default:
      return category;
  }
};

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseIntList(raw: string): number[] {
  const s = String(raw || '').trim();
  if (!s) return [];
  return s
    .split(/[^0-9]+/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => Number.parseInt(x, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function normalizeChampHubEventDraft(draft: ChampHubEventDraft) {
  const first = Number.parseInt(draft.firstRaw, 10);
  const decay = Number.parseFloat(draft.decayRaw);
  const podium = Number.parseInt(draft.podiumRaw, 10);
  const table = parseIntList(draft.tableRaw);
  return {
    eventId: String(draft.eventId || '').trim(),
    kind: draft.kind === 'doble' ? 'doble' : 'simple',
    pointsMode: draft.pointsMode === 'manual' ? 'manual' : 'percent',
    first: Number.isFinite(first) ? first : 0,
    decayPercent: Number.isFinite(decay) ? decay : 0,
    podiumCount: Number.isFinite(podium) ? podium : 0,
    table,
  };
}

function parseDateList(raw: string): string[] {
  const s = String(raw || '').trim();
  if (!s) return [];
  return s
    .split(/[^0-9-]+/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter(isIsoDate);
}

function normalizeIdArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x || '')).map((x) => x.trim()).filter(Boolean);
}

function normalizeHeaderKey(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeNameKey(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function previousPowerOfTwo(n: number) {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

function selectPlaceholderPositions(targetPlayers: number, extra: number) {
  if (extra <= 0) return [] as number[];
  if (extra === 1) return [0];
  if (extra === 2) return [0, targetPlayers - 1];

  const desired = Array.from({ length: extra }, (_, i) => {
    const t = (targetPlayers - 1) * (i / (extra - 1));
    return Math.round(t);
  });

  const used = new Set<number>();
  const positions: number[] = [];

  const findFree = (pos: number) => {
    if (pos < 0) return 0;
    if (pos >= targetPlayers) return targetPlayers - 1;
    if (!used.has(pos)) return pos;

    for (let offset = 1; offset < targetPlayers; offset += 1) {
      const right = pos + offset;
      if (right < targetPlayers && !used.has(right)) return right;
      const left = pos - offset;
      if (left >= 0 && !used.has(left)) return left;
    }
    return pos;
  };

  desired.forEach((pos) => {
    const free = findFree(pos);
    used.add(free);
    positions.push(free);
  });

  return positions;
}

function buildMatchesFromSlots(slots: { id: string | null; name: string }[], placeholderLabel: string) {
  const out: BracketMatch[] = [];
  for (let i = 0; i < slots.length; i += 2) {
    const a = slots[i] || null;
    const b = slots[i + 1] || null;
    out.push({
      p1: a?.name || placeholderLabel,
      p2: b?.name || placeholderLabel,
      p1_id: a?.id || null,
      p2_id: b?.id || null,
    });
  }
  return out;
}

function buildMatchPlayBracket(
  players: RegisteredPlayer[],
  mainRoundName: string,
  labels: BracketLabels
): BracketRound[] {
  if (players.length < 2) return [];

  const baseSize = previousPowerOfTwo(players.length);
  const extraPlayers = players.length - baseSize;

  if (extraPlayers <= 0) {
    const mainMatches = buildMatchesFromSlots(players.map((p) => ({ id: p.id, name: p.name })), labels.placeholder);
    return [{ name: mainRoundName, matches: mainMatches }];
  }

  const prelimPlayers = players.slice(-extraPlayers * 2);
  const mainPlayers = players.slice(0, players.length - extraPlayers * 2);
  const prelimMatches = buildMatchesFromSlots(prelimPlayers.map((p) => ({ id: p.id, name: p.name })), labels.placeholder);

  const placeholderPositions = selectPlaceholderPositions(baseSize, extraPlayers);
  const placeholderOrderByPos = new Map<number, number>();
  placeholderPositions.forEach((pos, idx) => {
    placeholderOrderByPos.set(pos, idx + 1);
  });

  const slots: { id: string | null; name: string }[] = [];
  let mainIdx = 0;
  for (let i = 0; i < baseSize; i += 1) {
    const order = placeholderOrderByPos.get(i);
    if (order) {
      slots.push({ id: null, name: labels.preliminaryWinner.replace('{order}', String(order)) });
    } else {
      const p = mainPlayers[mainIdx];
      mainIdx += 1;
      slots.push({ id: p?.id || null, name: p?.name || labels.placeholder });
    }
  }

  const mainMatches = buildMatchesFromSlots(slots, labels.placeholder);
  const anchorTargets = placeholderPositions.map((pos) => Math.floor(pos / 2));

  return [
    { name: labels.preliminaryRound, matches: prelimMatches, anchorTargets },
    { name: mainRoundName, matches: mainMatches },
  ];
}

function normalizeManualBracketRounds(raw: any, labels: BracketLabels): BracketRound[] {
  const rounds = Array.isArray(raw) ? raw : [];
  return rounds
    .map((round: any) => ({
      name: String(round?.name || labels.defaultRound),
      anchorTargets: Array.isArray(round?.anchorTargets)
        ? round.anchorTargets.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n))
        : undefined,
      matches: Array.isArray(round?.matches)
        ? round.matches.map((m: any) => ({
            p1: String(m?.p1 || labels.placeholder),
            p2: String(m?.p2 || labels.placeholder),
            p1_id: m?.p1_id != null ? String(m.p1_id) : null,
            p2_id: m?.p2_id != null ? String(m.p2_id) : null,
            result: typeof m?.result === 'string' ? m.result : null,
            winner: m?.winner != null ? String(m.winner) : null,
          }))
        : [],
    }))
    .filter((round: BracketRound) => round.matches.length > 0);
}

function buildManualBracketSeed(
  rounds: BracketRound[],
  players: RegisteredPlayer[],
  labels: BracketLabels
): BracketRound[] {
  if (rounds.length > 0) return rounds;

  const slots = players.map((p) => ({ id: p.id, name: p.name }));
  if (slots.length % 2 !== 0) slots.push({ id: null, name: labels.placeholder });

  return [{ name: labels.firstRound, matches: buildMatchesFromSlots(slots, labels.placeholder) }];
}

function normalizeRounds(raw: any, roundCount: number, fallbackTotal?: number | null) {
  const list = Array.isArray(raw) ? raw : [];
  const rounds = Array.from({ length: roundCount }, (_, idx) => {
    const v = list[idx];
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  });
  if (fallbackTotal != null && rounds.every((v) => v == null)) {
    rounds[0] = fallbackTotal;
  }
  return rounds;
}

const DEFAULT_WEEKLY_HOLES = 18;
const DEFAULT_PAR_VALUE = 4;

function buildCoursePars(course: any, holeCount: number) {
  const pars = Array.isArray(course?.pars)
    ? course.pars.map((value: any) => Number(value)).filter((value: number) => Number.isFinite(value))
    : [];
  if (pars.length >= holeCount) return pars.slice(0, holeCount);

  const holesFromInfo = Array.isArray(course?.hole_info?.holes) ? course.hole_info.holes : [];
  const infoPars = holesFromInfo
    .map((hole: any) => Number(hole?.par))
    .filter((value: number) => Number.isFinite(value));
  if (infoPars.length >= holeCount) return infoPars.slice(0, holeCount);

  return Array.from({ length: holeCount }, () => DEFAULT_PAR_VALUE);
}

function summarizeWeeklyCard(holes: Array<number | null>, holeCount: number) {
  const limited = Array.from({ length: holeCount }, (_, idx) => holes[idx] ?? null);
  const holesPlayed = limited.filter((value) => typeof value === 'number' && value > 0).length;
  const total = limited.reduce((sum, value) => sum + (typeof value === 'number' && value > 0 ? value : 0), 0);
  const hasAny = holesPlayed > 0;
  return {
    holes: limited,
    holesPlayed,
    total: hasAny ? total : null,
    isComplete: holesPlayed >= holeCount,
  };
}

function compareWeeklyCards(a: WeeklyCard, b: WeeklyCard) {
  if (a.isComplete !== b.isComplete) return a.isComplete ? -1 : 1;
  if (a.holesPlayed !== b.holesPlayed) return b.holesPlayed - a.holesPlayed;

  if (a.total != null && b.total != null && a.total !== b.total) return a.total - b.total;
  if (a.total == null && b.total != null) return 1;
  if (a.total != null && b.total == null) return -1;

  if (a.isComplete && b.isComplete) {
    const cardA = a.holes.map((value) => value ?? 0);
    const cardB = b.holes.map((value) => value ?? 0);
    const tieBreak = compareCardsForTieBreak(cardA, cardB);
    if (tieBreak !== 0) return tieBreak;
  }

  const timeA = a.gameDate ? new Date(a.gameDate).getTime() : 0;
  const timeB = b.gameDate ? new Date(b.gameDate).getTime() : 0;
  return timeA - timeB;
}

function pickBestWeeklyCard(cards: WeeklyCard[]) {
  if (!cards.length) return null;
  const sorted = [...cards].sort(compareWeeklyCards);
  return sorted[0] || null;
}

function buildDiffLabel(total: number | null, parTotal: number | null) {
  if (total == null || parTotal == null) return null;
  const diff = total - parTotal;
  if (diff === 0) return 'E';
  if (diff > 0) return `+${diff}`;
  return String(diff);
}

function buildFinalClassificationFromPlayers(
  players: RegisteredPlayer[],
  prev: any,
  roundCount: number
): FinalClassificationRow[] {
  const prevRows = Array.isArray(prev) ? prev : [];
  const prevMap = new Map<string, any>();
  prevRows.forEach((r: any) => {
    const uid = String(r?.user_id || '').trim();
    if (uid) prevMap.set(uid, r);
  });

  return players.map((p, idx) => {
    const old = prevMap.get(p.id);
    const strokesRaw = old?.strokes;
    const strokesNum = typeof strokesRaw === 'number' && Number.isFinite(strokesRaw) ? strokesRaw : null;
    const note = typeof old?.note === 'string' ? old.note : null;
    const rounds = normalizeRounds(old?.rounds, roundCount, strokesNum);
    return {
      user_id: p.id,
      position: idx + 1,
      strokes: strokesNum,
      rounds,
      note,
    };
  });
}

function reorder<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  const copy = arr.slice();
  if (fromIndex < 0 || fromIndex >= copy.length) return copy;
  if (toIndex < 0 || toIndex >= copy.length) return copy;
  const [item] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, item);
  return copy;
}

export default function AdminEditarEventoPage() {
  const { user, profile, loading, isAdmin, currentAssociationId } = useAuth();
  const { t } = useLanguage();

  const bracketLabels = useMemo<BracketLabels>(() => ({
    placeholder: t('common.notAvailable'),
    preliminaryRound: t('adminEventsEdit.bracketPrelimRound'),
    preliminaryWinner: t('adminEventsEdit.bracketPrelimWinner'),
    defaultRound: t('adminEventsEdit.bracketRoundLabel'),
    firstRound: t('adminEventsEdit.bracketFirstRound'),
  }), [t]);

  const nameRef = useRef<HTMLInputElement | null>(null);

  const [events, setEvents] = useState<EventLite[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  const [courses, setCourses] = useState<CourseLite[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);

  const [loadingEvent, setLoadingEvent] = useState(false);
  const [saving, setSaving] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Editable fields
  const [name, setName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');
  const [registrationStart, setRegistrationStart] = useState('');
  const [registrationEnd, setRegistrationEnd] = useState('');
  const [status, setStatus] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [courseId, setCourseId] = useState('');
  const [competitionMode, setCompetitionMode] = useState('');
  const [maxPlayersRaw, setMaxPlayersRaw] = useState('');
  const [teamCompetitionEnabled, setTeamCompetitionEnabled] = useState(false);
  const [teamBestPlayersRaw, setTeamBestPlayersRaw] = useState('');

  const [matchPlayFormat, setMatchPlayFormat] = useState<MatchPlayFormat>('classic');
  const [groupMode, setGroupMode] = useState<GroupMode>('single');
  const [groupHolesRaw, setGroupHolesRaw] = useState('18');
  const [groupMatchesPerDayRaw, setGroupMatchesPerDayRaw] = useState('');
  const [groupDatesRaw, setGroupDatesRaw] = useState('');
  const [groupCountRaw, setGroupCountRaw] = useState('');
  const [groupAdvanceRaw, setGroupAdvanceRaw] = useState('');
  const [groupHasConsolation, setGroupHasConsolation] = useState(false);
  const [groupManualRaw, setGroupManualRaw] = useState('');

  const [stablefordMode, setStablefordMode] = useState<StablefordMode>('classic');
  const [classicRoundsRaw, setClassicRoundsRaw] = useState('1');
  const [bestCardRoundsRaw, setBestCardRoundsRaw] = useState('2');
  const [bestHoleRoundsRaw, setBestHoleRoundsRaw] = useState('2');
  const [weeklyAllowExtraAttempts, setWeeklyAllowExtraAttempts] = useState(false);
  const [weeklyMaxAttemptsRaw, setWeeklyMaxAttemptsRaw] = useState('');
  const [courseParRaw, setCourseParRaw] = useState('');

  const [pointsMode, setPointsMode] = useState<PointsMode>('percent');
  const [pointsFirstRaw, setPointsFirstRaw] = useState('100');
  const [pointsDecayRaw, setPointsDecayRaw] = useState('8');
  const [pointsPodiumRaw, setPointsPodiumRaw] = useState('3');
  const [pointsTableRaw, setPointsTableRaw] = useState('');

  const [champEnabled, setChampEnabled] = useState(false);
  const [champTotalRaw, setChampTotalRaw] = useState('');
  const [champSimpleRaw, setChampSimpleRaw] = useState('');
  const [champDoubleRaw, setChampDoubleRaw] = useState('');
  const [champBestSimpleRaw, setChampBestSimpleRaw] = useState('');
  const [champBestDoubleRaw, setChampBestDoubleRaw] = useState('');
  const [champCategories, setChampCategories] = useState<string[]>(CATEGORY_OPTIONS);

  const [champHubEnabled, setChampHubEnabled] = useState(false);
  const [champHubCategories, setChampHubCategories] = useState<string[]>(CATEGORY_OPTIONS);
  const [champHubEvents, setChampHubEvents] = useState<ChampHubEventDraft[]>([]);

  // Match Play config (optional)
  const [holesPerRoundRaw, setHolesPerRoundRaw] = useState('');
  const [hasConsolation, setHasConsolation] = useState(false);
  const [consolationHolesPerRoundRaw, setConsolationHolesPerRoundRaw] = useState('');
  const [hasSeeds, setHasSeeds] = useState(false);
  const [seedCountRaw, setSeedCountRaw] = useState('');
  const [manualBracketOpen, setManualBracketOpen] = useState(false);
  const [manualBracketRounds, setManualBracketRounds] = useState<BracketRound[]>([]);
  const [manualSlotOpen, setManualSlotOpen] = useState<{ roundIdx: number; matchIdx: number; side: 'p1' | 'p2' } | null>(null);
  const [manualPlayerSearch, setManualPlayerSearch] = useState('');

  const [registeredPlayers, setRegisteredPlayers] = useState<RegisteredPlayer[]>([]);
  const [eventConfig, setEventConfig] = useState<any>({});
  const [paidPlayerIds, setPaidPlayerIds] = useState<string[]>([]);
  const [paymentBusyId, setPaymentBusyId] = useState<string | null>(null);
  const [finalClassification, setFinalClassification] = useState<FinalClassificationRow[]>([]);
  const [finalClassificationLocked, setFinalClassificationLocked] = useState(false);
  const [classificationCategoryFilter, setClassificationCategoryFilter] = useState('Todas');
  const [classificationNameFilter, setClassificationNameFilter] = useState('');
  const [classificationHistory, setClassificationHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportTarget, setExportTarget] = useState<'final' | 'points' | 'championship' | 'weekly'>('final');
  const [championshipCategoryFilter, setChampionshipCategoryFilter] = useState('');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const isMatchPlay = useMemo(() => {
    const s = competitionMode.trim().toLowerCase();
    return !!s && (s.includes('match') || s.includes('mp'));
  }, [competitionMode]);

  const isStableford = useMemo(() => {
    const s = competitionMode.trim().toLowerCase();
    return !!s && s.includes('stable');
  }, [competitionMode]);

  const isEventClosed = useMemo(() => {
    const s = String(status || '').trim().toLowerCase();
    return ['closed', 'finished', 'finalizado', 'cerrado'].includes(s);
  }, [status]);

  const isWeeklyExport = exportTarget === 'weekly';

  useEffect(() => {
    document.body.classList.add('premium-admin-bg');
    return () => document.body.classList.remove('premium-admin-bg');
  }, []);

  useEffect(() => {
    setOkMsg(null);
    setErrorMsg(null);
  }, [currentAssociationId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingEvents(true);
      try {
        const assoc = String(currentAssociationId || '').trim();
        if (!assoc) {
          if (active) {
            setEvents([]);
            setSelectedEventId('');
          }
          return;
        }

        const sessionRes = await supabase.auth.getSession();
        const token = sessionRes?.data?.session?.access_token;
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(`/api/admin/events/list?association_id=${encodeURIComponent(assoc)}`, { headers });
        const json = await res.json().catch(() => null);
        const list = Array.isArray(json?.events) ? (json.events as any[]) : [];
        const mapped: EventLite[] = list.map((r) => ({
          id: String(r.id),
          name: String(r.name || ''),
          event_date: r.event_date ? String(r.event_date) : null,
        }));
        if (active) {
          setEvents(mapped);
          if (mapped.length === 0) setSelectedEventId('');
        }
      } catch (e) {
        if (active) setEvents([]);
      } finally {
        if (active) setLoadingEvents(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [currentAssociationId]);

  useEffect(() => {
    let active = true;
    const loadCourses = async () => {
      setLoadingCourses(true);
      try {
        const assoc = String(currentAssociationId || '').trim();
        if (!assoc) {
          if (active) setCourses([]);
          return;
        }
        const { data, error } = await supabase
          .from('courses')
          .select('id, name')
          .eq('association_id', assoc)
          .order('name', { ascending: true });
        if (!active) return;
        if (error) {
          setCourses([]);
          return;
        }
        setCourses(((data as any[]) || []).map((r) => ({ id: String(r.id), name: String(r.name || '') })));
      } finally {
        if (active) setLoadingCourses(false);
      }
    };
    void loadCourses();
    return () => {
      active = false;
    };
  }, [currentAssociationId]);

  const resetForm = () => {
    setName('');
    setEventDate('');
    setEventEndDate('');
    setRegistrationStart('');
    setRegistrationEnd('');
    setStatus('');
    setLocation('');
    setDescription('');
    setCourseId('');
    setCompetitionMode('');
    setMaxPlayersRaw('');
    setTeamCompetitionEnabled(false);
    setTeamBestPlayersRaw('');
    setMatchPlayFormat('classic');
    setGroupMode('single');
    setGroupHolesRaw('18');
    setGroupMatchesPerDayRaw('');
    setGroupDatesRaw('');
    setGroupCountRaw('');
    setGroupAdvanceRaw('');
    setGroupHasConsolation(false);
    setGroupManualRaw('');
    setStablefordMode('classic');
    setClassicRoundsRaw('1');
    setBestCardRoundsRaw('2');
    setBestHoleRoundsRaw('2');
    setWeeklyAllowExtraAttempts(false);
    setWeeklyMaxAttemptsRaw('');
    setCourseParRaw('');
    setPointsMode('percent');
    setPointsFirstRaw('100');
    setPointsDecayRaw('8');
    setPointsPodiumRaw('3');
    setPointsTableRaw('');
    setChampEnabled(false);
    setChampTotalRaw('');
    setChampSimpleRaw('');
    setChampDoubleRaw('');
    setChampBestSimpleRaw('');
    setChampBestDoubleRaw('');
    setChampCategories(CATEGORY_OPTIONS);
    setChampHubEnabled(false);
    setChampHubCategories(CATEGORY_OPTIONS);
    setChampHubEvents([]);

    setHolesPerRoundRaw('');
    setHasConsolation(false);
    setConsolationHolesPerRoundRaw('');
    setHasSeeds(false);
    setSeedCountRaw('');
    setManualBracketOpen(false);
    setManualBracketRounds([]);
    setManualSlotOpen(null);
    setManualPlayerSearch('');

    setRegisteredPlayers([]);
    setPaidPlayerIds([]);
    setPaymentBusyId(null);
    setFinalClassification([]);
    setFinalClassificationLocked(false);
    setClassificationCategoryFilter('Todas');
    setClassificationHistory([]);
    setHistoryError('');
    setHistoryLoading(false);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      setOkMsg(null);
      setErrorMsg(null);

      const eventId = String(selectedEventId || '').trim();
      if (!eventId) {
        resetForm();
        return;
      }

      setLoadingEvent(true);
      try {
        const sessionRes = await supabase.auth.getSession();
        const token = sessionRes?.data?.session?.access_token;
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`, { headers });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !json?.ok) {
          setErrorMsg(String(json?.error || t('adminEventsEdit.errors.loadEventHttpError').replace('{status}', String(res.status))));
          return;
        }

        const ev = json?.event as any;
        const players = Array.isArray(json?.registeredPlayers) ? (json.registeredPlayers as any[]) : [];
        const mappedPlayers: RegisteredPlayer[] = players.map((p) => ({
          id: String(p.id),
          name: String(p.name || p.id),
          category: p?.category || null,
        }));

        setName(String(ev?.name || ''));
        setEventDate(String(ev?.event_date || ''));
        setEventEndDate(String((ev?.config as any)?.event_end_date || ''));
        setRegistrationStart(String(ev?.registration_start || ''));
        setRegistrationEnd(String(ev?.registration_end || ''));
        setStatus(String(ev?.status || ''));
        setLocation(String(ev?.location || ''));
        setDescription(String(ev?.description || ''));
        setCourseId(String(ev?.course_id || ''));
        setCompetitionMode(String(ev?.competition_mode || ''));

        const config = (ev?.config && typeof ev.config === 'object') ? ev.config : {};
        const mpMax = config?.maxPlayers;
        const maxStr = mpMax == null ? '' : String(mpMax);
        setMaxPlayersRaw(maxStr);

        setEventConfig(config);
        setPaidPlayerIds(normalizeIdArray(config?.paid_player_ids));
        setTeamCompetitionEnabled(!!config?.teamCompetitionEnabled);
        setTeamBestPlayersRaw(config?.teamBestPlayers != null ? String(config.teamBestPlayers) : '');
        setMatchPlayFormat((config?.matchPlayFormat as MatchPlayFormat) || 'classic');
        setGroupMode((config?.groupMode as GroupMode) || 'single');
        setGroupHolesRaw(config?.groupHoles != null ? String(config.groupHoles) : '18');
        setGroupMatchesPerDayRaw(config?.groupMatchesPerDay != null ? String(config.groupMatchesPerDay) : '');
        setGroupDatesRaw(Array.isArray(config?.groupDates) ? config.groupDates.join(', ') : '');
        setGroupCountRaw(config?.groupCount != null ? String(config.groupCount) : '');
        setGroupAdvanceRaw(config?.groupAdvanceCount != null ? String(config.groupAdvanceCount) : '');
        setGroupHasConsolation(!!config?.groupHasConsolation);
        setGroupManualRaw(typeof config?.groupManual === 'string' ? config.groupManual : '');
        setStablefordMode((config?.stableford?.mode as StablefordMode) || 'classic');
        setClassicRoundsRaw(config?.stableford?.classicRounds != null ? String(config.stableford.classicRounds) : '1');
        setBestCardRoundsRaw(config?.stableford?.bestCardRounds != null ? String(config.stableford.bestCardRounds) : '2');
        setBestHoleRoundsRaw(config?.stableford?.bestHoleRounds != null ? String(config.stableford.bestHoleRounds) : '2');
        const weeklyConfig = config?.stableford?.weekly;
        const weeklyMaxAttempts = Number(weeklyConfig?.maxAttempts);
        const weeklyHasMax = Number.isFinite(weeklyMaxAttempts) && weeklyMaxAttempts > 1;
        const weeklyAllow = !!weeklyConfig && (weeklyConfig?.requireAdminApproval || weeklyHasMax);
        setWeeklyAllowExtraAttempts(weeklyAllow);
        setWeeklyMaxAttemptsRaw(weeklyHasMax ? String(weeklyMaxAttempts) : '');
        setPointsMode((config?.stableford?.classicPoints?.mode as PointsMode) || 'percent');
        setPointsFirstRaw(config?.stableford?.classicPoints?.first != null ? String(config.stableford.classicPoints.first) : '100');
        setPointsDecayRaw(config?.stableford?.classicPoints?.decayPercent != null ? String(config.stableford.classicPoints.decayPercent) : '8');
        setPointsPodiumRaw(config?.stableford?.classicPoints?.podiumCount != null ? String(config.stableford.classicPoints.podiumCount) : '3');
        setPointsTableRaw(Array.isArray(config?.stableford?.classicPoints?.table) ? config.stableford.classicPoints.table.join(', ') : '');
        setCourseParRaw(config?.coursePar != null ? String(config.coursePar) : '');
        setChampEnabled(!!config?.championship?.enabled);
        setChampTotalRaw(config?.championship?.totalEvents != null ? String(config.championship.totalEvents) : '');
        setChampSimpleRaw(config?.championship?.simpleEvents != null ? String(config.championship.simpleEvents) : '');
        setChampDoubleRaw(config?.championship?.doubleEvents != null ? String(config.championship.doubleEvents) : '');
        setChampBestSimpleRaw(config?.championship?.bestSimpleCount != null ? String(config.championship.bestSimpleCount) : '');
        setChampBestDoubleRaw(config?.championship?.bestDoubleCount != null ? String(config.championship.bestDoubleCount) : '');
        setChampCategories(Array.isArray(config?.championship?.categories) ? config.championship.categories : CATEGORY_OPTIONS);

        const hub = (config as any)?.championshipHub;
        setChampHubEnabled(!!hub?.enabled);
        setChampHubCategories(Array.isArray(hub?.categories) ? hub.categories : CATEGORY_OPTIONS);
        setChampHubEvents(
          Array.isArray(hub?.events)
            ? hub.events.map((row: any) => ({
                eventId: String(row?.eventId || ''),
                kind: row?.kind === 'doble' ? 'doble' : 'simple',
                pointsMode: row?.pointsMode === 'manual' ? 'manual' : 'percent',
                firstRaw: row?.first != null ? String(row.first) : '100',
                decayRaw: row?.decayPercent != null ? String(row.decayPercent) : '8',
                podiumRaw: row?.podiumCount != null ? String(row.podiumCount) : '3',
                tableRaw: Array.isArray(row?.table) ? row.table.join(', ') : '',
              }))
            : []
        );

        const holes = Array.isArray(config?.holesPerRound) ? config.holesPerRound : [];
        setHolesPerRoundRaw(holes.length ? holes.join(', ') : '');
        setHasConsolation(!!config?.hasConsolation);
        const conso = Array.isArray(config?.consolationHolesPerRound) ? config.consolationHolesPerRound : [];
        setConsolationHolesPerRoundRaw(conso.length ? conso.join(', ') : '');
        setHasSeeds(!!config?.hasSeeds);
        const sc = config?.seedCount;
        setSeedCountRaw(sc == null ? '' : String(sc));
        setManualBracketOpen(false);
        setManualBracketRounds([]);
        setManualSlotOpen(null);
        setManualPlayerSearch('');

        setRegisteredPlayers(mappedPlayers);

        const prevFinal = config?.finalClassification;
        const roundCountFromConfig = config?.stableford?.mode === 'classic'
          ? Number.parseInt(String(config?.stableford?.classicRounds || '1'), 10)
          : 1;
        setFinalClassification(buildFinalClassificationFromPlayers(mappedPlayers, prevFinal, roundCountFromConfig));

        setFinalClassificationLocked(!!config?.finalClassificationLocked);

        setHistoryLoading(true);
        setHistoryError('');
        try {
          const historyRes = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}/classification-history`, { headers });
          const historyJson = await historyRes.json().catch(() => null);
          if (!historyRes.ok || !historyJson?.ok) {
            setHistoryError(String(historyJson?.error || t('adminEventsEdit.errors.historyLoadError')));
            setClassificationHistory([]);
          } else {
            setClassificationHistory(Array.isArray(historyJson?.data) ? historyJson.data : []);
          }
        } catch (e: any) {
          setHistoryError(e?.message || t('adminEventsEdit.errors.historyLoadError'));
          setClassificationHistory([]);
        } finally {
          setHistoryLoading(false);
        }

        window.setTimeout(() => nameRef.current?.focus(), 50);
      } catch (e: any) {
        if (active) setErrorMsg(e?.message || t('adminEventsEdit.errors.loadEventError'));
      } finally {
        if (active) setLoadingEvent(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId]);

  const canSave = useMemo(() => {
    if (!selectedEventId.trim()) return false;
    if (!name.trim()) return false;
    if (eventDate && !isIsoDate(eventDate)) return false;
    if (eventEndDate && !isIsoDate(eventEndDate)) return false;
    if (eventEndDate && eventDate && eventEndDate < eventDate) return false;
    if (registrationStart && !isIsoDate(registrationStart)) return false;
    if (registrationEnd && !isIsoDate(registrationEnd)) return false;

    if (maxPlayersRaw.trim()) {
      const n = Number.parseInt(maxPlayersRaw, 10);
      if (!Number.isFinite(n) || n < 2 || n > 256) return false;
    }

    if (teamCompetitionEnabled && teamBestPlayersRaw.trim()) {
      const n = Number.parseInt(teamBestPlayersRaw, 10);
      if (!Number.isFinite(n) || n < 1) return false;
    }

    if (isStableford) {
      if (stablefordMode === 'classic') {
        const rounds = Number.parseInt(classicRoundsRaw, 10);
        if (!Number.isFinite(rounds) || rounds < 1 || rounds > 4) return false;

        if (pointsMode === 'manual') {
          const table = parseIntList(pointsTableRaw);
          if (table.length === 0) return false;
        } else {
          const first = Number.parseInt(pointsFirstRaw, 10);
          const decay = Number.parseFloat(pointsDecayRaw);
          const podium = Number.parseInt(pointsPodiumRaw, 10);
          if (!Number.isFinite(first) || first < 1) return false;
          if (!Number.isFinite(decay) || decay < 0 || decay > 100) return false;
          if (!Number.isFinite(podium) || podium < 1) return false;
        }
      } else if (stablefordMode === 'best_card') {
        const rounds = Number.parseInt(bestCardRoundsRaw, 10);
        if (!Number.isFinite(rounds) || rounds < 2) return false;
      } else if (stablefordMode === 'best_hole') {
        const rounds = Number.parseInt(bestHoleRoundsRaw, 10);
        if (!Number.isFinite(rounds) || rounds < 2) return false;
      } else {
        if (weeklyAllowExtraAttempts && weeklyMaxAttemptsRaw.trim()) {
          const maxAttempts = Number.parseInt(weeklyMaxAttemptsRaw, 10);
          if (!Number.isFinite(maxAttempts) || maxAttempts < 1) return false;
        }
      }

      if (champEnabled) {
        const total = Number.parseInt(champTotalRaw, 10);
        if (!Number.isFinite(total) || total < 1) return false;

        const simple = champSimpleRaw.trim() ? Number.parseInt(champSimpleRaw, 10) : 0;
        const double = champDoubleRaw.trim() ? Number.parseInt(champDoubleRaw, 10) : 0;
        if ((champSimpleRaw.trim() && (!Number.isFinite(simple) || simple < 0)) ||
            (champDoubleRaw.trim() && (!Number.isFinite(double) || double < 0))) {
          return false;
        }
        if ((simple + double) > total) return false;

        const bestSimple = champBestSimpleRaw.trim() ? Number.parseInt(champBestSimpleRaw, 10) : 0;
        const bestDouble = champBestDoubleRaw.trim() ? Number.parseInt(champBestDoubleRaw, 10) : 0;
        if ((champBestSimpleRaw.trim() && (!Number.isFinite(bestSimple) || bestSimple < 0)) ||
            (champBestDoubleRaw.trim() && (!Number.isFinite(bestDouble) || bestDouble < 0))) {
          return false;
        }
        if (bestSimple > simple || bestDouble > double) return false;

        if (!champCategories.length) return false;
      }

      if (champHubEnabled) {
        if (!champHubCategories.length) return false;
        if (!champHubEvents.length) return false;
        for (const draft of champHubEvents) {
          const normalized = normalizeChampHubEventDraft(draft);
          if (!normalized.eventId) return false;
          if (normalized.pointsMode === 'manual') {
            if (!normalized.table.length) return false;
          } else {
            if (!Number.isFinite(normalized.first) || normalized.first < 1) return false;
            if (!Number.isFinite(normalized.decayPercent) || normalized.decayPercent < 0 || normalized.decayPercent > 100) return false;
            if (!Number.isFinite(normalized.podiumCount) || normalized.podiumCount < 1) return false;
          }
        }
      }
    }

    if (courseParRaw.trim()) {
      const par = Number.parseInt(courseParRaw, 10);
      if (!Number.isFinite(par) || par < 1 || par > 200) return false;
    }

    if (isMatchPlay) {
      if (matchPlayFormat === 'classic') {
        const holes = parseIntList(holesPerRoundRaw);
        if (holes.length === 0) return false;
        if (hasConsolation) {
          const conso = parseIntList(consolationHolesPerRoundRaw);
          if (conso.length === 0) return false;
        }
        if (hasSeeds) {
          const sc = Number.parseInt(seedCountRaw, 10);
          const allowed = [2, 4, 8, 16, 32, 64];
          if (!Number.isFinite(sc) || !allowed.includes(sc)) return false;
        }
      } else {
        const holes = Number.parseInt(groupHolesRaw, 10);
        if (!Number.isFinite(holes) || holes < 1 || holes > 36) return false;

        if (groupMatchesPerDayRaw.trim()) {
          const mpd = Number.parseInt(groupMatchesPerDayRaw, 10);
          if (!Number.isFinite(mpd) || mpd < 1) return false;
        }

        const dates = groupDatesRaw.trim() ? parseDateList(groupDatesRaw) : [];
        if (groupDatesRaw.trim() && dates.length === 0) return false;

        if (groupMode === 'multi') {
          const gc = Number.parseInt(groupCountRaw, 10);
          if (!Number.isFinite(gc) || gc < 2) return false;
          const adv = Number.parseInt(groupAdvanceRaw, 10);
          if (!Number.isFinite(adv) || adv < 1 || adv > gc) return false;
        }
      }
    }

    return true;
  }, [selectedEventId, name, eventDate, eventEndDate, registrationStart, registrationEnd, maxPlayersRaw, teamCompetitionEnabled, teamBestPlayersRaw, isMatchPlay, isStableford, matchPlayFormat, holesPerRoundRaw, hasConsolation, consolationHolesPerRoundRaw, hasSeeds, seedCountRaw, groupMode, groupHolesRaw, groupMatchesPerDayRaw, groupDatesRaw, groupCountRaw, groupAdvanceRaw, stablefordMode, classicRoundsRaw, bestCardRoundsRaw, bestHoleRoundsRaw, weeklyAllowExtraAttempts, weeklyMaxAttemptsRaw, courseParRaw, pointsMode, pointsFirstRaw, pointsDecayRaw, pointsPodiumRaw, pointsTableRaw, champEnabled, champTotalRaw, champSimpleRaw, champDoubleRaw, champBestSimpleRaw, champBestDoubleRaw, champCategories, champHubEnabled, champHubCategories, champHubEvents]);

  const onSave = async () => {
    setOkMsg(null);
    setErrorMsg(null);

    const eventId = String(selectedEventId || '').trim();
    if (!eventId) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg(t('adminEventsEdit.errors.nameRequired'));
      return;
    }

    const config: any = {};
    const maxPlayers = maxPlayersRaw.trim() ? Number.parseInt(maxPlayersRaw, 10) : null;
    if (maxPlayers != null && Number.isFinite(maxPlayers)) config.maxPlayers = maxPlayers;

    config.teamCompetitionEnabled = !!teamCompetitionEnabled;
    if (teamCompetitionEnabled && teamBestPlayersRaw.trim()) {
      const n = Number.parseInt(teamBestPlayersRaw, 10);
      config.teamBestPlayers = Number.isFinite(n) && n > 0 ? n : null;
    } else {
      config.teamBestPlayers = null;
    }
    if (eventEndDate) {
      config.event_end_date = eventEndDate;
    } else {
      config.event_end_date = null;
    }

    config.finalClassificationLocked = !!finalClassificationLocked;
    config.paid_player_ids = normalizeIdArray(paidPlayerIds);

    if (courseParRaw.trim()) {
      const par = Number.parseInt(courseParRaw, 10);
      config.coursePar = Number.isFinite(par) ? par : null;
    } else {
      config.coursePar = null;
    }

    if (isStableford) {
      const classicRounds = Number.parseInt(classicRoundsRaw, 10);
      const bestCardRounds = Number.parseInt(bestCardRoundsRaw, 10);
      const bestHoleRounds = Number.parseInt(bestHoleRoundsRaw, 10);
      const weeklyMaxAttempts = weeklyMaxAttemptsRaw.trim()
        ? Number.parseInt(weeklyMaxAttemptsRaw, 10)
        : NaN;
      if (stablefordMode === 'weekly' && weeklyAllowExtraAttempts && weeklyMaxAttemptsRaw.trim()) {
        if (!Number.isFinite(weeklyMaxAttempts) || weeklyMaxAttempts < 1) {
          setErrorMsg(t('adminEventsEdit.errors.weeklyMaxAttemptsInvalid'));
          return;
        }
      }
      const existingWeeklyExtras = (eventConfig as any)?.stableford?.weekly?.extraAttemptsByUser;
      const safeWeeklyExtras = existingWeeklyExtras && typeof existingWeeklyExtras === 'object'
        ? existingWeeklyExtras
        : {};

      config.stableford = {
        mode: stablefordMode,
        classicRounds: Number.isFinite(classicRounds) ? classicRounds : null,
        bestCardRounds: Number.isFinite(bestCardRounds) ? bestCardRounds : null,
        bestHoleRounds: Number.isFinite(bestHoleRounds) ? bestHoleRounds : null,
        weekly: stablefordMode === 'weekly'
          ? {
              minAttempts: 1,
              maxAttempts: Number.isFinite(weeklyMaxAttempts) && weeklyAllowExtraAttempts
                ? weeklyMaxAttempts
                : 1,
              requireAdminApproval: weeklyAllowExtraAttempts && !Number.isFinite(weeklyMaxAttempts),
              extraAttemptsByUser: safeWeeklyExtras,
            }
          : null,
        classicPoints: {
          mode: pointsMode,
          first: Number.parseInt(pointsFirstRaw, 10) || 0,
          decayPercent: Number.parseFloat(pointsDecayRaw) || 0,
          podiumCount: Number.parseInt(pointsPodiumRaw, 10) || 0,
          table: pointsMode === 'manual' ? parseIntList(pointsTableRaw) : [],
        },
      };

      if (champEnabled) {
        const total = Number.parseInt(champTotalRaw, 10);
        const simple = Number.parseInt(champSimpleRaw, 10);
        const double = Number.parseInt(champDoubleRaw, 10);
        const bestSimple = Number.parseInt(champBestSimpleRaw, 10);
        const bestDouble = Number.parseInt(champBestDoubleRaw, 10);

        config.championship = {
          enabled: true,
          totalEvents: Number.isFinite(total) ? total : null,
          simpleEvents: Number.isFinite(simple) ? simple : null,
          doubleEvents: Number.isFinite(double) ? double : null,
          bestSimpleCount: Number.isFinite(bestSimple) ? bestSimple : null,
          bestDoubleCount: Number.isFinite(bestDouble) ? bestDouble : null,
          categories: champCategories,
        };
      } else {
        config.championship = { enabled: false };
      }

      if (champHubEnabled) {
        const normalizedHubEvents = champHubEvents
          .map(normalizeChampHubEventDraft)
          .filter((e) => e.eventId);
        config.championshipHub = {
          enabled: true,
          categories: champHubCategories,
          events: normalizedHubEvents,
        };
      } else {
        config.championshipHub = { enabled: false };
      }
    }

    if (isMatchPlay) {
      config.matchPlayFormat = matchPlayFormat;
      if (matchPlayFormat === 'classic') {
        const holes = parseIntList(holesPerRoundRaw);
        config.holesPerRound = holes;
        config.hasConsolation = !!hasConsolation;
        if (hasConsolation) {
          config.consolationHolesPerRound = parseIntList(consolationHolesPerRoundRaw);
        }
        config.hasSeeds = !!hasSeeds;
        if (hasSeeds) {
          config.seedCount = Number.parseInt(seedCountRaw, 10);
        }
      } else {
        const holes = Number.parseInt(groupHolesRaw, 10);
        config.groupMode = groupMode;
        config.groupHoles = Number.isFinite(holes) ? holes : null;
        config.groupMatchesPerDay = groupMatchesPerDayRaw.trim()
          ? Number.parseInt(groupMatchesPerDayRaw, 10)
          : null;
        config.groupDates = groupDatesRaw.trim() ? parseDateList(groupDatesRaw) : [];
        config.groupManual = groupManualRaw.trim() ? groupManualRaw.trim() : null;
        if (groupMode === 'multi') {
          config.groupCount = Number.parseInt(groupCountRaw, 10);
          config.groupAdvanceCount = Number.parseInt(groupAdvanceRaw, 10);
          config.groupHasConsolation = !!groupHasConsolation;
        } else {
          config.groupCount = null;
          config.groupAdvanceCount = null;
          config.groupHasConsolation = false;
        }
      }
    }

    // Preserve existing waitlist / bracket / any other config by loading current event config first
    // We merge shallowly here by sending final merged config; server will store as provided.
    // Load existing config from current selection state via GET payload stored in classification.

    const idsInEvent = new Set(normalizeIdArray(registeredPlayers.map((p) => p.id)));
    const roundCount = Number.parseInt(classicRoundsRaw, 10);
    const safeRoundCount = Number.isFinite(roundCount) && roundCount > 0 ? Math.min(roundCount, 4) : 1;
    const fc = finalClassification
      .filter((r) => idsInEvent.has(r.user_id))
      .map((r, idx) => {
        const rounds = normalizeRounds(r.rounds, safeRoundCount, r.strokes ?? null);
        const total = rounds.some((v) => v != null)
          ? rounds.reduce((sum, v) => sum + (v || 0), 0)
          : (r.strokes == null || r.strokes === ('' as any) ? null : Number(r.strokes));
        return {
          user_id: r.user_id,
          position: idx + 1,
          rounds,
          strokes: total == null || Number.isNaN(total) ? null : total,
          note: typeof r.note === 'string' ? r.note : null,
        };
      });
    config.finalClassification = fc;

    setSaving(true);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      // Fetch current event config to merge in-place (waitlist/brackets/etc)
      const currentRes = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`, { headers });
      const currentJson = await currentRes.json().catch(() => null);
      const currentEv = currentJson?.event as any;
      const currentConfig = (currentEv?.config && typeof currentEv.config === 'object') ? currentEv.config : {};
      const mergedConfig = { ...currentConfig, ...config };

      const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          name: trimmedName,
          event_date: eventDate || null,
          registration_start: registrationStart || null,
          registration_end: registrationEnd || null,
          competition_mode: competitionMode.trim() || null,
          status: status.trim() || null,
          location: location.trim() || null,
          description: description.trim() || null,
          course_id: courseId.trim() || null,
          has_handicap_ranking: false,
          config: mergedConfig,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErrorMsg(String(json?.error || t('adminEventsEdit.errors.saveHttpError').replace('{status}', String(res.status))));
        return;
      }

      setOkMsg(t('adminEventsEdit.saved'));
    } catch (e: any) {
      setErrorMsg(e?.message || t('adminEventsEdit.errors.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const onMoveUp = (index: number) => {
    setFinalClassification((prev) => reorder(prev, index, index - 1).map((r, i) => ({ ...r, position: i + 1 })));
  };

  const onMoveDown = (index: number) => {
    setFinalClassification((prev) => reorder(prev, index, index + 1).map((r, i) => ({ ...r, position: i + 1 })));
  };

  const onTogglePaid = async (playerId: string) => {
    if (!playerId || saving || loadingEvent) return;

    const eventId = String(selectedEventId || '').trim();
    if (!eventId) return;

    setOkMsg(null);
    setErrorMsg(null);

    const prevList = normalizeIdArray(paidPlayerIds);
    const nextPaid = new Set(prevList);
    if (nextPaid.has(playerId)) {
      nextPaid.delete(playerId);
    } else {
      nextPaid.add(playerId);
    }

    const nextList = Array.from(nextPaid);
    setPaidPlayerIds(nextList);
    setPaymentBusyId(playerId);

    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const currentRes = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`, { headers });
      const currentJson = await currentRes.json().catch(() => null);
      const currentEv = currentJson?.event as any;
      const currentConfig = (currentEv?.config && typeof currentEv.config === 'object') ? currentEv.config : {};

      const mergedConfig = { ...currentConfig, paid_player_ids: nextList };

      const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          name: name.trim() || currentEv?.name || '',
          event_date: eventDate || null,
          registration_start: registrationStart || null,
          registration_end: registrationEnd || null,
          competition_mode: competitionMode.trim() || null,
          status: status.trim() || null,
          location: location.trim() || null,
          description: description.trim() || null,
          course_id: courseId.trim() || null,
          has_handicap_ranking: false,
          config: mergedConfig,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErrorMsg(String(json?.error || t('adminEventsEdit.errors.saveHttpError').replace('{status}', String(res.status))));
        setPaidPlayerIds(prevList);
        return;
      }

      setEventConfig(mergedConfig);
    } catch (e: any) {
      setErrorMsg(e?.message || t('adminEventsEdit.errors.savePaymentError'));
      setPaidPlayerIds(prevList);
    } finally {
      setPaymentBusyId(null);
    }
  };

  const onGenerateBracket = async () => {
    setOkMsg(null);
    setErrorMsg(null);

    const eventId = String(selectedEventId || '').trim();
    if (!eventId) return;

    if (!isMatchPlay) {
      setErrorMsg(t('adminEventsEdit.errors.notMatchPlay'));
      return;
    }

    if (matchPlayFormat !== 'classic') {
      setErrorMsg(t('adminEventsEdit.errors.bracketOnlyClassic'));
      return;
    }

    if (registeredPlayers.length < 2) {
      setErrorMsg(t('adminEventsEdit.errors.needTwoPlayers'));
      return;
    }

    if (!window.confirm(t('adminEventsEdit.errors.confirmGenerateBracket'))) {
      return;
    }

    setSaving(true);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const currentRes = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`, { headers });
      const currentJson = await currentRes.json().catch(() => null);
      const currentEv = currentJson?.event as any;
      const currentConfig = (currentEv?.config && typeof currentEv.config === 'object') ? currentEv.config : {};
      const mainRoundName =
        String(
          currentConfig?.mainBracket?.rounds?.[0]?.name ||
          eventConfig?.mainBracket?.rounds?.[0]?.name ||
          bracketLabels.firstRound
        );

      const rounds = buildMatchPlayBracket(registeredPlayers, mainRoundName, bracketLabels);
      if (rounds.length === 0) {
        setErrorMsg(t('adminEventsEdit.errors.generateBracketFailed'));
        return;
      }

      const mergedConfig = { ...currentConfig, mainBracket: { rounds }, paid_player_ids: normalizeIdArray(paidPlayerIds) };

      const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          name: name.trim() || currentEv?.name || '',
          event_date: eventDate || null,
          registration_start: registrationStart || null,
          registration_end: registrationEnd || null,
          competition_mode: competitionMode.trim() || null,
          status: status.trim() || null,
          location: location.trim() || null,
          description: description.trim() || null,
          course_id: courseId.trim() || null,
          has_handicap_ranking: false,
          config: mergedConfig,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErrorMsg(String(json?.error || t('adminEventsEdit.errors.saveHttpError').replace('{status}', String(res.status))));
        return;
      }

      setEventConfig(mergedConfig);
      setOkMsg(t('adminEventsEdit.bracketGenerated'));
    } catch (e: any) {
      setErrorMsg(e?.message || t('adminEventsEdit.errors.generateBracketError'));
    } finally {
      setSaving(false);
    }
  };

  const onGenerateGroupDraw = () => {
    setOkMsg(null);
    setErrorMsg(t('adminEventsEdit.errors.groupDrawPending'));
  };

  const classificationRoundCount = useMemo(() => {
    if (!isStableford || stablefordMode !== 'classic') return 1;
    const rounds = Number.parseInt(classicRoundsRaw, 10);
    return Number.isFinite(rounds) && rounds > 0 ? Math.min(rounds, 4) : 1;
  }, [classicRoundsRaw, isStableford, stablefordMode]);

  useEffect(() => {
    setFinalClassification((prev) =>
      prev.map((r) => ({
        ...r,
        rounds: normalizeRounds(r.rounds, classificationRoundCount, r.strokes ?? null),
      }))
    );
  }, [classificationRoundCount]);

  const playerNameById = useMemo(() => {
    const m = new Map<string, string>();
    registeredPlayers.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [registeredPlayers]);

  const playerCategoryById = useMemo(() => {
    const m = new Map<string, string | null>();
    registeredPlayers.forEach((p) => m.set(p.id, p.category || null));
    return m;
  }, [registeredPlayers]);

  const manualPlayerOptions = useMemo(
    () => registeredPlayers.map((p) => ({ value: `id:${p.id}`, label: p.name })),
    [registeredPlayers]
  );

  const openManualBracketEditor = () => {
    const existing = normalizeManualBracketRounds((eventConfig as any)?.mainBracket?.rounds, bracketLabels);
    const seeded = buildManualBracketSeed(existing, registeredPlayers, bracketLabels);
    setManualBracketRounds(seeded);
    setManualSlotOpen(null);
    setManualPlayerSearch('');
    setManualBracketOpen(true);
  };

  const getManualSlotValue = (match: BracketMatch, side: 'p1' | 'p2') => {
    const id = side === 'p1' ? match.p1_id : match.p2_id;
    if (id) return `id:${id}`;
    const name = side === 'p1' ? match.p1 : match.p2;
    if (name && name !== 'N/A') return `name:${name}`;
    return 'bye';
  };

  const updateManualSlot = (roundIdx: number, matchIdx: number, side: 'p1' | 'p2', value: string) => {
    setManualBracketRounds((prev) =>
      prev.map((round, rIdx) => {
        if (rIdx !== roundIdx) return round;
        return {
          ...round,
          matches: round.matches.map((match, mIdx) => {
            if (mIdx !== matchIdx) return match;
            const next = { ...match, result: null, winner: null } as BracketMatch;
            if (value === 'bye') {
              if (side === 'p1') {
                next.p1 = 'N/A';
                next.p1_id = null;
              } else {
                next.p2 = 'N/A';
                next.p2_id = null;
              }
              return next;
            }

            if (value.startsWith('id:')) {
              const id = value.slice(3);
              const name = playerNameById.get(id) || 'N/A';
              if (side === 'p1') {
                next.p1 = name;
                next.p1_id = id;
              } else {
                next.p2 = name;
                next.p2_id = id;
              }
              return next;
            }

            if (value.startsWith('name:')) {
              const name = value.slice(5) || 'N/A';
              if (side === 'p1') {
                next.p1 = name;
                next.p1_id = null;
              } else {
                next.p2 = name;
                next.p2_id = null;
              }
            }

            return next;
          }),
        };
      })
    );
  };

  const resetManualBracket = () => {
    const seeded = buildManualBracketSeed([], registeredPlayers, bracketLabels);
    setManualBracketRounds(seeded);
    setManualSlotOpen(null);
    setManualPlayerSearch('');
  };

  const onSaveManualBracket = async () => {
    setOkMsg(null);
    setErrorMsg(null);

    const eventId = String(selectedEventId || '').trim();
    if (!eventId) return;

    if (!isMatchPlay) {
      setErrorMsg(t('adminEventsEdit.errors.notMatchPlay'));
      return;
    }

    if (manualBracketRounds.length === 0) {
      setErrorMsg(t('adminEventsEdit.errors.noBracketsToSave'));
      return;
    }

    setSaving(true);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const currentRes = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`, { headers });
      const currentJson = await currentRes.json().catch(() => null);
      const currentEv = currentJson?.event as any;
      const currentConfig = (currentEv?.config && typeof currentEv.config === 'object') ? currentEv.config : {};

      const mergedConfig = {
        ...currentConfig,
        mainBracket: { rounds: manualBracketRounds },
        paid_player_ids: normalizeIdArray(paidPlayerIds),
      };

      const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          name: name.trim() || currentEv?.name || '',
          event_date: eventDate || null,
          registration_start: registrationStart || null,
          registration_end: registrationEnd || null,
          competition_mode: competitionMode.trim() || null,
          status: status.trim() || null,
          location: location.trim() || null,
          description: description.trim() || null,
          course_id: courseId.trim() || null,
          has_handicap_ranking: false,
          config: mergedConfig,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErrorMsg(String(json?.error || t('adminEventsEdit.errors.saveHttpError').replace('{status}', String(res.status))));
        return;
      }

      setEventConfig(mergedConfig);
      setManualBracketOpen(false);
      setOkMsg(t('adminEventsEdit.manualSaved'));
    } catch (e: any) {
      setErrorMsg(e?.message || t('adminEventsEdit.errors.saveManualBracketsError'));
    } finally {
      setSaving(false);
    }
  };

  const pointsByCategory = useMemo(() => {
    const raw = (eventConfig as any)?.eventPointsByCategory || {};
    if (!raw || typeof raw !== 'object') return {} as Record<string, any[]>;
    return raw as Record<string, any[]>;
  }, [eventConfig]);

  const orderedPointCategories = useMemo(() => {
    const keys = Object.keys(pointsByCategory);
    keys.sort((a, b) => {
      if (a === 'General') return -1;
      if (b === 'General') return 1;
      return a.localeCompare(b);
    });
    return keys;
  }, [pointsByCategory]);

  const championshipStandings = useMemo(() => {
    return (eventConfig as any)?.championshipHub?.standings || null;
  }, [eventConfig]);

  const championshipCategories = useMemo(() => {
    const list = Array.isArray(championshipStandings?.categories) ? championshipStandings?.categories : [];
    return list.length ? list : [];
  }, [championshipStandings]);

  useEffect(() => {
    if (!championshipCategories.length) {
      if (championshipCategoryFilter) setChampionshipCategoryFilter('');
      return;
    }
    if (!championshipCategoryFilter || !championshipCategories.includes(championshipCategoryFilter)) {
      const next = championshipCategories.includes('General') ? 'General' : championshipCategories[0];
      setChampionshipCategoryFilter(next);
    }
  }, [championshipCategories, championshipCategoryFilter]);

  const championshipRows = useMemo(() => {
    const key = championshipCategoryFilter || 'General';
    const rows = (championshipStandings as any)?.byCategory?.[key];
    return Array.isArray(rows) ? rows : [];
  }, [championshipCategoryFilter, championshipStandings]);

  const championshipEventsMeta = useMemo(() => {
    const list = (championshipStandings as any)?.events;
    return Array.isArray(list) ? list : [];
  }, [championshipStandings]);

  const handleExportWeeklyDetailed = async (format: 'xlsx' | 'pdf') => {
    const eventId = String(selectedEventId || '').trim();
    if (!eventId) return;

    setErrorMsg(null);

    try {
      const { data: games, error: gamesError } = await supabase
        .from('games')
        .select('id, players, created_at')
        .eq('tournament_id', eventId);

      if (gamesError) throw gamesError;
      if (!games || games.length === 0) {
        setErrorMsg(t('adminEventsEdit.weeklyExportNoGames'));
        return;
      }

      const gameIds = games.map((game: any) => String(game?.id || '')).filter(Boolean);
      const gameDateById = new Map(
        games.map((game: any) => [String(game?.id || ''), game?.created_at ? String(game.created_at) : null])
      );
      const playersFromGames = games.flatMap((game: any) => normalizeIdArray(game?.players));

      const { data: scoreRows, error: scoreError } = await supabase
        .from('scores')
        .select('game_id, user_id, hole_number, strokes')
        .in('game_id', gameIds);

      if (scoreError) throw scoreError;
      if (!scoreRows || scoreRows.length === 0) {
        setErrorMsg(t('adminEventsEdit.weeklyExportNoScores'));
        return;
      }

      const playersFromScores = scoreRows
        .map((row: any) => String(row?.user_id || '').trim())
        .filter(Boolean);
      const allPlayerIds = Array.from(new Set([...playersFromGames, ...playersFromScores]));

      const profileNameById = new Map<string, string>();
      const profileCategoryById = new Map<string, string | null>();
      if (allPlayerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, category')
          .in('id', allPlayerIds);

        (profiles || []).forEach((row: any) => {
          const id = String(row?.id || '').trim();
          if (!id) return;
          const name = [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim();
          profileNameById.set(id, name || id);
          profileCategoryById.set(id, row?.category || null);
        });
      }

      registeredPlayers.forEach((player) => {
        if (!profileNameById.has(player.id)) profileNameById.set(player.id, player.name || player.id);
        if (!profileCategoryById.has(player.id)) profileCategoryById.set(player.id, player.category || null);
      });

      let pars = Array.from({ length: DEFAULT_WEEKLY_HOLES }, () => DEFAULT_PAR_VALUE);
      const courseRef = courseId.trim();
      if (courseRef) {
        const { data: course } = await supabase
          .from('courses')
          .select('pars, hole_info')
          .eq('id', courseRef)
          .single();
        pars = buildCoursePars(course, DEFAULT_WEEKLY_HOLES);
      }

      const holeCount = pars.length || DEFAULT_WEEKLY_HOLES;
      const cardMap = new Map<string, WeeklyCard>();

      scoreRows.forEach((row: any) => {
        const gameId = String(row?.game_id || '').trim();
        const userId = String(row?.user_id || '').trim();
        const holeNumber = Number(row?.hole_number);
        const strokes = Number(row?.strokes);

        if (!gameId || !userId || !Number.isFinite(holeNumber) || !Number.isFinite(strokes)) return;
        const holeIndex = holeNumber - 1;
        if (holeIndex < 0 || holeIndex >= holeCount) return;

        const key = `${gameId}:${userId}`;
        let card = cardMap.get(key);
        if (!card) {
          card = {
            userId,
            holes: Array.from({ length: holeCount }, () => null),
            holesPlayed: 0,
            total: null,
            isComplete: false,
            gameId,
            gameDate: gameDateById.get(gameId) || null,
          };
          cardMap.set(key, card);
        }

        card.holes[holeIndex] = strokes;
      });

      const cardsByUser = new Map<string, WeeklyCard[]>();
      cardMap.forEach((card) => {
        const summary = summarizeWeeklyCard(card.holes, holeCount);
        const nextCard: WeeklyCard = {
          ...card,
          holes: summary.holes,
          holesPlayed: summary.holesPlayed,
          total: summary.total,
          isComplete: summary.isComplete,
        };
        const list = cardsByUser.get(card.userId) || [];
        list.push(nextCard);
        cardsByUser.set(card.userId, list);
      });

      const parTotal = pars.reduce((sum, value) => sum + (Number(value) || 0), 0);
      const rowDrafts: WeeklyRowDraft[] = [];

      cardsByUser.forEach((cards, userId) => {
        const best = pickBestWeeklyCard(cards);
        if (!best) return;
        const name = profileNameById.get(userId) || userId;
        rowDrafts.push({
          position: 0,
          name,
          holes: best.holes,
          total: best.total,
          diffLabel: buildDiffLabel(best.total, parTotal),
          isComplete: best.isComplete,
          holesPlayed: best.holesPlayed,
        });
      });

      if (rowDrafts.length === 0) {
        setErrorMsg(t('adminEventsEdit.weeklyExportNoCards'));
        return;
      }

      const sorted = [...rowDrafts].sort((a, b) => {
        if (a.isComplete !== b.isComplete) return a.isComplete ? -1 : 1;
        if (a.holesPlayed !== b.holesPlayed) return b.holesPlayed - a.holesPlayed;
        if (a.total == null && b.total == null) return 0;
        if (a.total == null) return 1;
        if (b.total == null) return -1;
        if (a.total !== b.total) return a.total - b.total;
        if (a.isComplete && b.isComplete) {
          const tieBreak = compareCardsForTieBreak(
            a.holes.map((value) => value ?? 0),
            b.holes.map((value) => value ?? 0)
          );
          if (tieBreak !== 0) return tieBreak;
        }
        return 0;
      });

      const exportRows: WeeklyExportRow[] = sorted.map((row, index) => ({
        position: index + 1,
        name: row.name,
        holes: row.holes,
        total: row.total,
        diffLabel: row.diffLabel,
      }));

      await exportWeeklyDetailed({
        eventName: name || t('adminEventsEdit.eventFallback'),
        eventDate: eventDate || null,
        pars,
        rows: exportRows,
        formats: [format],
      });
    } catch (e: any) {
      setErrorMsg(e?.message || t('adminEventsEdit.errors.weeklyExportFailed'));
    }
  };

  const handleExportResults = async (format: 'csv' | 'xlsx' | 'pdf') => {
    if (exportTarget === 'weekly') {
      if (format === 'xlsx' || format === 'pdf') {
        await handleExportWeeklyDetailed(format);
      }
      return;
    }
    const finalRows = finalClassification.map((row) => {
      const rounds = normalizeRounds(row.rounds, classificationRoundCount, row.strokes ?? null);
      const total = rounds.some((v) => v != null)
        ? rounds.reduce((sum, v) => sum + (v || 0), 0)
        : (row.strokes == null ? null : Number(row.strokes));
      const par = courseParRaw.trim() ? Number.parseInt(courseParRaw, 10) : null;
      const parTotal = par && Number.isFinite(par) ? par * classificationRoundCount : null;
      const diff = total != null && parTotal != null ? total - parTotal : null;
      const diffLabel = diff == null ? '' : diff === 0 ? 'E' : diff > 0 ? `+${diff}` : String(diff);
      return {
        position: row.position ?? null,
        name: playerNameById.get(row.user_id) || row.user_id,
        category: playerCategoryById.get(row.user_id) || null,
        rounds,
        total: total ?? null,
        diffLabel,
      };
    });

    const championship = championshipStandings
      ? {
          categories: Array.isArray(championshipStandings.categories) ? championshipStandings.categories : [],
          events: Array.isArray(championshipStandings.events) ? championshipStandings.events : [],
          byCategory: championshipStandings.byCategory || {},
        }
      : null;

    await exportResultsAll({
      eventName: name || t('adminEventsEdit.eventFallback'),
      eventDate: eventDate || null,
      finalRows,
      pointsByCategory,
      championship,
      formats: [format],
      includeFinal: exportTarget === 'final',
      includePoints: exportTarget === 'points',
      includeChampionship: exportTarget === 'championship',
    });
  };

  const openExportModal = (target: 'final' | 'points' | 'championship' | 'weekly') => {
    setExportTarget(target);
    setExportModalOpen(true);
  };

  const importFinalClassification = async (file: File) => {
    setImportError(null);
    setImportBusy(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames?.[0];
      if (!sheetName) {
        setImportError(t('adminEventsEdit.errors.importNoSheet'));
        return;
      }

      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        setImportError(t('adminEventsEdit.errors.importSheetReadError'));
        return;
      }

      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as Array<Array<any>>;
      if (!rows || rows.length < 2) {
        setImportError(t('adminEventsEdit.errors.importNoRows'));
        return;
      }

      const headers = rows[0].map((cell) => normalizeHeaderKey(cell));
      const findIndex = (aliases: string[]) => headers.findIndex((h) => aliases.includes(h));

      const posIdx = findIndex(['pos', 'posicion', 'position', 'rank']);
      const userIdIdx = findIndex(['userid', 'user_id', 'id', 'uuid']);
      const nameIdx = findIndex(['nombre', 'name', 'jugador', 'player']);
      const categoryIdx = findIndex(['categoria', 'category']);
      const strokesIdx = findIndex(['golpes', 'strokes', 'total', 'score']);
      const noteIdx = findIndex(['nota', 'note', 'comentario', 'comment']);

      const roundColumnIndex = new Map<number, number>();
      headers.forEach((header, index) => {
        const match = header.match(/^(r|round|ronda)(\d+)$/);
        if (!match) return;
        const roundIndex = Number.parseInt(match[2], 10) - 1;
        if (!Number.isFinite(roundIndex) || roundIndex < 0) return;
        roundColumnIndex.set(roundIndex, index);
      });

      const playersByName = new Map<string, RegisteredPlayer[]>();
      registeredPlayers.forEach((p) => {
        const key = normalizeNameKey(p.name);
        if (!key) return;
        const list = playersByName.get(key) || [];
        list.push(p);
        playersByName.set(key, list);
      });

      const parsedRows: Array<{ row: FinalClassificationRow; hasPosition: boolean }> = [];
      const missingPlayers: string[] = [];

      rows.slice(1).forEach((row) => {
        if (!Array.isArray(row) || row.every((cell) => String(cell || '').trim() === '')) return;

        const positionRaw = posIdx >= 0 ? row[posIdx] : null;
        const positionParsed = Number.parseInt(String(positionRaw || ''), 10);
        const hasPosition = Number.isFinite(positionParsed) && positionParsed > 0;

        const userIdRaw = userIdIdx >= 0 ? String(row[userIdIdx] || '').trim() : '';
        const nameRaw = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : '';
        const categoryRaw = categoryIdx >= 0 ? String(row[categoryIdx] || '').trim() : '';
        let userId = userIdRaw;

        if (!userId && nameRaw) {
          const nameKey = normalizeNameKey(nameRaw);
          const candidates = playersByName.get(nameKey) || [];
          if (candidates.length === 1) {
            userId = candidates[0].id;
          } else if (candidates.length > 1 && categoryRaw) {
            const categoryKey = normalizeNameKey(categoryRaw);
            const match = candidates.find((c) => normalizeNameKey(c.category || '') === categoryKey);
            userId = match?.id || '';
          } else if (candidates.length > 1) {
            userId = candidates[0].id;
          }
        }

        if (!userId) {
          if (nameRaw) missingPlayers.push(nameRaw);
          return;
        }

        const rounds = Array.from({ length: classificationRoundCount }, (_, idx) => {
          const colIndex = roundColumnIndex.get(idx);
          if (colIndex == null) return null;
          const value = Number.parseInt(String(row[colIndex] || ''), 10);
          return Number.isFinite(value) ? value : null;
        });

        const strokesValue = strokesIdx >= 0 ? Number.parseInt(String(row[strokesIdx] || ''), 10) : NaN;
        const noteValue = noteIdx >= 0 ? String(row[noteIdx] || '').trim() : '';

        parsedRows.push({
          row: {
            user_id: userId,
            position: hasPosition ? positionParsed : 0,
            strokes: Number.isFinite(strokesValue) ? strokesValue : null,
            rounds,
            note: noteValue || null,
          },
          hasPosition,
        });
      });

      if (missingPlayers.length > 0) {
        const unique = Array.from(new Set(missingPlayers));
        const preview = unique.slice(0, 6).join(', ');
        const suffix = unique.length > 6 ? ` (+${unique.length - 6})` : '';
        setImportError(t('adminEventsEdit.errors.importMissingPlayers').replace('{list}', `${preview}${suffix}`));
        return;
      }

      if (parsedRows.length === 0) {
        setImportError(t('adminEventsEdit.errors.importNoValidRows'));
        return;
      }

      const ordered = parsedRows
        .slice()
        .sort((a, b) => {
          if (a.hasPosition && b.hasPosition) return a.row.position - b.row.position;
          if (a.hasPosition) return -1;
          if (b.hasPosition) return 1;
          return 0;
        })
        .map((entry, idx) => ({
          ...entry.row,
          position: idx + 1,
        }));

      setFinalClassification(ordered);
      setImportModalOpen(false);
      setOkMsg(t('adminEventsEdit.importSuccess'));
    } catch (e: any) {
      setImportError(e?.message || t('adminEventsEdit.errors.importError'));
    } finally {
      setImportBusy(false);
    }
  };

  const availableClassificationCategories = useMemo(() => {
    const set = new Set<string>(CATEGORY_OPTIONS);
    registeredPlayers.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['Todas', ...Array.from(set)];
  }, [registeredPlayers]);

  const filteredFinalClassification = useMemo(() => {
    const byCategory = classificationCategoryFilter === 'Todas'
      ? finalClassification
      : finalClassification.filter(
          (row) => (playerCategoryById.get(row.user_id) || 'Sin categoria') === classificationCategoryFilter
        );
    const q = classificationNameFilter.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter((row) => {
      const name = playerNameById.get(row.user_id) || row.user_id;
      return String(name || '').toLowerCase().includes(q);
    });
  }, [classificationCategoryFilter, classificationNameFilter, finalClassification, playerCategoryById, playerNameById]);

  const classificationWinners = useMemo(() => {
    const winners = new Map<string, string>();
    const bestByCategory = new Map<string, { position: number | null; userId: string }>();
    finalClassification.forEach((row) => {
      const category = playerCategoryById.get(row.user_id) || 'Sin categoria';
      const pos = row.position ?? null;
      const current = bestByCategory.get(category);
      if (!current || (pos != null && (current.position == null || pos < current.position))) {
        bestByCategory.set(category, { position: pos, userId: row.user_id });
      }
    });
    bestByCategory.forEach((value, category) => winners.set(category, value.userId));
    return winners;
  }, [finalClassification, playerCategoryById]);

  const formatHistoryStamp = (value: string | null) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-700">{t('common.loading')}</div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-800">
          {t('common.noSession')}{' '}
          <Link href="/login" className="text-blue-600">
            {t('common.login')}
          </Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-700">{t('admin.noAccess')}</div>
      </div>
    );
  }

  return (
    <>
      <div className="premium-particles" />
      <div className="min-h-screen px-4 py-6 sm:px-6">
        <header className="max-w-3xl mx-auto mb-4 flex items-center justify-between">
          <div>
            <div className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
              <Pencil className="h-5 w-5" /> {t('adminEventsEdit.title')}
            </div>
            <div className="text-xs text-gray-700">{t('adminEventsEdit.subtitle')}</div>
          </div>
          <div className="flex items-center gap-2">
            <AssociationSelector />
            <Link href="/admin/eventos" className="premium-back-btn" aria-label={t('common.back')}>
              <ArrowLeft className="h-4 w-4" />
              <DoorOpen className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <main className="max-w-3xl mx-auto">
          <section className="premium-card w-full space-y-4">
            {!currentAssociationId && (
              <div className="text-sm text-gray-700">
                {t('adminEventsEdit.selectAssociationHint')}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.tournamentLabel')}</div>
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className={selectClassName}
                  disabled={loadingEvents || !currentAssociationId}
                >
                  <option value="">{loadingEvents ? t('adminEventsEdit.loadingEvents') : t('adminEventsEdit.selectTournament')}</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.event_date ? `${ev.event_date} — ${ev.name}` : ev.name}
                    </option>
                  ))}
                </select>
                <div className="text-[11px] text-gray-500">
                  {t('adminEventsEdit.tournamentNote')}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.actionsLabel')}</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-2 rounded-xl text-sm bg-white border border-gray-200 text-gray-700 disabled:opacity-50"
                    onClick={() => setSelectedEventId('')}
                    disabled={saving || loadingEvent}
                  >
                    <RefreshCw className="h-4 w-4 inline-block mr-2" />
                    {t('adminEventsEdit.clear')}
                  </button>
                  <Link
                    href="/admin/eventos/crear"
                    className="px-3 py-2 rounded-xl text-sm bg-blue-600 text-white"
                  >
                    {t('adminEventsEdit.create')}
                  </Link>
                </div>
              </div>
            </div>

            {errorMsg && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                {errorMsg}
              </div>
            )}
            {okMsg && (
              <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                {okMsg}
              </div>
            )}

            {selectedEventId && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.nameLabel')}</div>
                    <input
                      ref={nameRef}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputClassName}
                      disabled={saving || loadingEvent}
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.startDateLabel')}</div>
                    <input
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className={inputClassName}
                      disabled={saving || loadingEvent}
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.endDateLabel')}</div>
                    <input
                      type="date"
                      value={eventEndDate}
                      onChange={(e) => setEventEndDate(e.target.value)}
                      className={inputClassName}
                      disabled={saving || loadingEvent}
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.registrationStartLabel')}</div>
                    <input
                      type="date"
                      value={registrationStart}
                      onChange={(e) => setRegistrationStart(e.target.value)}
                      className={inputClassName}
                      disabled={saving || loadingEvent}
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.registrationEndLabel')}</div>
                    <input
                      type="date"
                      value={registrationEnd}
                      onChange={(e) => setRegistrationEnd(e.target.value)}
                      className={inputClassName}
                      disabled={saving || loadingEvent}
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.statusLabel')}</div>
                    <input
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className={inputClassName}
                      placeholder={t('adminEventsEdit.statusPlaceholder')}
                      disabled={saving || loadingEvent}
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.competitionModeLabel')}</div>
                    <input
                      value={competitionMode}
                      onChange={(e) => setCompetitionMode(e.target.value)}
                      className={inputClassName}
                      placeholder={t('adminEventsEdit.competitionModePlaceholder')}
                      disabled={saving || loadingEvent}
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.teamCompetitionLabel')}</div>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={teamCompetitionEnabled}
                        onChange={(e) => setTeamCompetitionEnabled(e.target.checked)}
                        disabled={saving || loadingEvent}
                      />
                      {t('adminEventsEdit.teamCompetitionEnabled')}
                    </label>
                    <div className="text-[11px] text-gray-500">{t('adminEventsEdit.teamCompetitionHint')}</div>
                    {teamCompetitionEnabled && (
                      <div className="mt-2">
                        <div className="text-[11px] text-gray-500">{t('adminEventsEdit.teamBestPlayersLabel')}</div>
                        <input
                          inputMode="numeric"
                          value={teamBestPlayersRaw}
                          onChange={(e) => setTeamBestPlayersRaw(e.target.value)}
                          className={inputClassName}
                          placeholder={t('adminEventsEdit.teamBestPlayersPlaceholder')}
                          disabled={saving || loadingEvent}
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.courseLabel')}</div>
                    <select
                      value={courseId}
                      onChange={(e) => setCourseId(e.target.value)}
                      className={selectClassName}
                      disabled={saving || loadingEvent || loadingCourses}
                    >
                      <option value="">{t('adminEventsEdit.courseNone')}</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.maxPlayersLabel')}</div>
                    <input
                      value={maxPlayersRaw}
                      onChange={(e) => setMaxPlayersRaw(e.target.value)}
                      className={inputClassName}
                      placeholder={t('adminEventsEdit.maxPlayersPlaceholder')}
                      disabled={saving || loadingEvent}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.locationLabel')}</div>
                    <input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className={inputClassName}
                      disabled={saving || loadingEvent}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.descriptionLabel')}</div>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className={textareaClassName}
                      rows={3}
                      disabled={saving || loadingEvent}
                    />
                  </div>
                </div>

                {isStableford && (
                  <div className="border border-gray-200 rounded-2xl p-3 bg-white/70 space-y-3">
                    <div className="text-sm font-extrabold text-gray-900">{t('adminEventsCreate.stablefordTitle')}</div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.stablefordModeLabel')}</div>
                        <select
                          value={stablefordMode}
                          onChange={(e) => setStablefordMode(e.target.value as StablefordMode)}
                          disabled={saving || loadingEvent}
                          className={selectClassName}
                        >
                          <option value="classic">{t('adminEventsCreate.stablefordClassicLabel')}</option>
                          <option value="best_card">{t('adminEventsCreate.stablefordBestCardLabel')}</option>
                          <option value="best_hole">{t('adminEventsCreate.stablefordBestHoleLabel')}</option>
                          <option value="weekly">{t('adminEventsCreate.stablefordWeeklyLabel')}</option>
                        </select>
                      </div>

                      {stablefordMode === 'classic' && (
                        <>
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.stablefordRoundsLabel')}</div>
                            <input
                              value={classicRoundsRaw}
                              onChange={(e) => setClassicRoundsRaw(e.target.value)}
                              className={inputClassName}
                              placeholder={t('adminEventsCreate.stablefordRoundsPlaceholder')}
                              disabled={saving || loadingEvent}
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.courseParLabel')}</div>
                            <input
                              value={courseParRaw}
                              onChange={(e) => setCourseParRaw(e.target.value)}
                              className={inputClassName}
                              placeholder={t('adminEventsEdit.courseParPlaceholder')}
                              disabled={saving || loadingEvent}
                            />
                          </div>
                        </>
                      )}

                      {stablefordMode === 'best_card' && (
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.roundsCountLabel')}</div>
                          <input
                            value={bestCardRoundsRaw}
                            onChange={(e) => setBestCardRoundsRaw(e.target.value)}
                            className={inputClassName}
                            placeholder={t('adminEventsCreate.roundsMinPlaceholder')}
                            disabled={saving || loadingEvent}
                          />
                        </div>
                      )}

                      {stablefordMode === 'best_hole' && (
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.roundsCountLabel')}</div>
                          <input
                            value={bestHoleRoundsRaw}
                            onChange={(e) => setBestHoleRoundsRaw(e.target.value)}
                            className={inputClassName}
                            placeholder={t('adminEventsCreate.roundsMinPlaceholder')}
                            disabled={saving || loadingEvent}
                          />
                        </div>
                      )}

                      {stablefordMode === 'weekly' && (
                        <div className="space-y-2 sm:col-span-2">
                          <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.weeklyAttemptsTitle')}</div>
                          <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={weeklyAllowExtraAttempts}
                              onChange={(e) => setWeeklyAllowExtraAttempts(e.target.checked)}
                              disabled={saving || loadingEvent}
                            />
                            {t('adminEventsCreate.weeklyAllowExtraLabel')}
                          </label>
                          {weeklyAllowExtraAttempts && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.weeklyMaxAttemptsLabel')}</div>
                                <input
                                  value={weeklyMaxAttemptsRaw}
                                  onChange={(e) => setWeeklyMaxAttemptsRaw(e.target.value)}
                                  className={inputClassName}
                                  placeholder={t('adminEventsCreate.weeklyMaxAttemptsPlaceholder')}
                                  disabled={saving || loadingEvent}
                                />
                              </div>
                              <div className="text-[11px] text-gray-600 flex items-center">
                                {t('adminEventsCreate.weeklyApprovalHint')}
                              </div>
                            </div>
                          )}
                          <div className="text-[11px] text-gray-600">{t('adminEventsCreate.weeklyMinHint')}</div>
                        </div>
                      )}
                    </div>

                    {stablefordMode === 'classic' && (
                      <div className="rounded-xl border border-gray-200 bg-white/80 p-3 space-y-2">
                        <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.pointsTitle')}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.pointsModeLabel')}</div>
                            <select
                              value={pointsMode}
                              onChange={(e) => setPointsMode(e.target.value as PointsMode)}
                              disabled={saving || loadingEvent}
                              className={selectClassName}
                            >
                              <option value="percent">{t('adminEventsCreate.pointsModePercent')}</option>
                              <option value="manual">{t('adminEventsCreate.pointsModeManual')}</option>
                            </select>
                          </div>

                          {pointsMode === 'percent' ? (
                            <>
                              <div className="space-y-1">
                                <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.pointsFirstLabel')}</div>
                                <input
                                  value={pointsFirstRaw}
                                  onChange={(e) => setPointsFirstRaw(e.target.value)}
                                  className={inputClassName}
                                  placeholder="100"
                                  disabled={saving || loadingEvent}
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.pointsDecayLabel')}</div>
                                <input
                                  value={pointsDecayRaw}
                                  onChange={(e) => setPointsDecayRaw(e.target.value)}
                                  className={inputClassName}
                                  placeholder="8"
                                  disabled={saving || loadingEvent}
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.pointsPodiumLabel')}</div>
                                <input
                                  value={pointsPodiumRaw}
                                  onChange={(e) => setPointsPodiumRaw(e.target.value)}
                                  className={inputClassName}
                                  placeholder="3"
                                  disabled={saving || loadingEvent}
                                />
                              </div>
                            </>
                          ) : (
                            <div className="space-y-1 sm:col-span-2">
                              <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.pointsTableLabel')}</div>
                              <input
                                value={pointsTableRaw}
                                onChange={(e) => setPointsTableRaw(e.target.value)}
                                className={inputClassName}
                                placeholder={t('adminEventsCreate.pointsTablePlaceholder')}
                                disabled={saving || loadingEvent}
                              />
                            </div>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-600">
                          {t('adminEventsCreate.pointsTieHint').replace('{count}', pointsPodiumRaw || '3')}
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-gray-200 bg-white/80 p-3 space-y-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={champEnabled}
                          onChange={(e) => setChampEnabled(e.target.checked)}
                          disabled={saving || loadingEvent}
                        />
                        {t('adminEventsCreate.championshipEnabledLabel')}
                      </label>

                      {champEnabled && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.championshipTotal')}</div>
                              <input
                                value={champTotalRaw}
                                onChange={(e) => setChampTotalRaw(e.target.value)}
                                className={inputClassName}
                                placeholder="12"
                                disabled={saving || loadingEvent}
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.championshipSimple')}</div>
                              <input
                                value={champSimpleRaw}
                                onChange={(e) => setChampSimpleRaw(e.target.value)}
                                className={inputClassName}
                                placeholder="8"
                                disabled={saving || loadingEvent}
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.championshipDouble')}</div>
                              <input
                                value={champDoubleRaw}
                                onChange={(e) => setChampDoubleRaw(e.target.value)}
                                className={inputClassName}
                                placeholder="4"
                                disabled={saving || loadingEvent}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.championshipBestSimple')}</div>
                              <input
                                value={champBestSimpleRaw}
                                onChange={(e) => setChampBestSimpleRaw(e.target.value)}
                                className={inputClassName}
                                placeholder="6"
                                disabled={saving || loadingEvent}
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.championshipBestDouble')}</div>
                              <input
                                value={champBestDoubleRaw}
                                onChange={(e) => setChampBestDoubleRaw(e.target.value)}
                                className={inputClassName}
                                placeholder="3"
                                disabled={saving || loadingEvent}
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.championshipCategories')}</div>
                            <div className="flex flex-wrap gap-2">
                              {CATEGORY_OPTIONS.map((cat) => (
                                <label key={cat} className="flex items-center gap-2 text-xs text-gray-700">
                                  <input
                                    type="checkbox"
                                    checked={champCategories.includes(cat)}
                                    onChange={(e) => {
                                      setChampCategories((prev) => {
                                        if (e.target.checked) return Array.from(new Set([...prev, cat]));
                                        return prev.filter((c) => c !== cat);
                                      });
                                    }}
                                    disabled={saving || loadingEvent}
                                  />
                                  {getCategoryLabel(cat, t)}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white/80 p-3 space-y-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={champHubEnabled}
                          onChange={(e) => setChampHubEnabled(e.target.checked)}
                          disabled={saving || loadingEvent}
                        />
                        {t('adminEventsCreate.championshipHubLabel')}
                      </label>

                      {champHubEnabled && (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.championshipCategories')}</div>
                            <div className="flex flex-wrap gap-2">
                              {CATEGORY_OPTIONS.map((cat) => (
                                <label key={cat} className="flex items-center gap-2 text-xs text-gray-700">
                                  <input
                                    type="checkbox"
                                    checked={champHubCategories.includes(cat)}
                                    onChange={(e) => {
                                      setChampHubCategories((prev) => {
                                        if (e.target.checked) return Array.from(new Set([...prev, cat]));
                                        return prev.filter((c) => c !== cat);
                                      });
                                    }}
                                    disabled={saving || loadingEvent}
                                  />
                                  {getCategoryLabel(cat, t)}
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            {champHubEvents.length === 0 ? (
                              <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipHubEmpty')}</div>
                            ) : (
                              <div className="space-y-2">
                                {champHubEvents.map((row, idx) => (
                                  <div key={`hub-${idx}`} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                      <div className="space-y-1">
                                        <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.championshipHubEvent')}</div>
                                        <select
                                          value={row.eventId}
                                          onChange={(e) => {
                                            const next = e.target.value;
                                            setChampHubEvents((prev) => prev.map((r, i) => i === idx ? ({ ...r, eventId: next }) : r));
                                          }}
                                          disabled={saving || loadingEvent}
                                          className={selectClassName}
                                        >
                                          <option value="">{t('adminEventsCreate.championshipHubSelect')}</option>
                                          {events.map((ev) => (
                                            <option key={ev.id} value={ev.id}>{ev.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="space-y-1">
                                        <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.championshipHubType')}</div>
                                        <select
                                          value={row.kind}
                                          onChange={(e) => {
                                            const next = e.target.value === 'doble' ? 'doble' : 'simple';
                                            setChampHubEvents((prev) => prev.map((r, i) => i === idx ? ({ ...r, kind: next }) : r));
                                          }}
                                          disabled={saving || loadingEvent}
                                          className={selectClassName}
                                        >
                                          <option value="simple">{t('adminEventsCreate.championshipHubTypeSimple')}</option>
                                          <option value="doble">{t('adminEventsCreate.championshipHubTypeDouble')}</option>
                                        </select>
                                      </div>
                                      <div className="space-y-1">
                                        <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.championshipHubPointsMode')}</div>
                                        <select
                                          value={row.pointsMode}
                                          onChange={(e) => {
                                            const next = e.target.value === 'manual' ? 'manual' : 'percent';
                                            setChampHubEvents((prev) => prev.map((r, i) => i === idx ? ({ ...r, pointsMode: next }) : r));
                                          }}
                                          disabled={saving || loadingEvent}
                                          className={selectClassName}
                                        >
                                          <option value="percent">{t('adminEventsCreate.pointsModePercent')}</option>
                                          <option value="manual">{t('adminEventsCreate.pointsModeManual')}</option>
                                        </select>
                                      </div>
                                    </div>

                                    {row.pointsMode === 'manual' ? (
                                      <div className="space-y-1">
                                        <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.pointsTableLabel')}</div>
                                        <input
                                          value={row.tableRaw}
                                          onChange={(e) => {
                                            const next = e.target.value;
                                            setChampHubEvents((prev) => prev.map((r, i) => i === idx ? ({ ...r, tableRaw: next }) : r));
                                          }}
                                          disabled={saving || loadingEvent}
                                          className={inputClassName}
                                          placeholder={t('adminEventsCreate.pointsTablePlaceholder')}
                                        />
                                      </div>
                                    ) : (
                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                        <div className="space-y-1">
                                          <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.pointsFirstLabel')}</div>
                                          <input
                                            value={row.firstRaw}
                                            onChange={(e) => {
                                              const next = e.target.value;
                                              setChampHubEvents((prev) => prev.map((r, i) => i === idx ? ({ ...r, firstRaw: next }) : r));
                                            }}
                                            disabled={saving || loadingEvent}
                                            className={inputClassName}
                                            placeholder="100"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.pointsDecayLabel')}</div>
                                          <input
                                            value={row.decayRaw}
                                            onChange={(e) => {
                                              const next = e.target.value;
                                              setChampHubEvents((prev) => prev.map((r, i) => i === idx ? ({ ...r, decayRaw: next }) : r));
                                            }}
                                            disabled={saving || loadingEvent}
                                            className={inputClassName}
                                            placeholder="8"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.pointsPodiumLabel')}</div>
                                          <input
                                            value={row.podiumRaw}
                                            onChange={(e) => {
                                              const next = e.target.value;
                                              setChampHubEvents((prev) => prev.map((r, i) => i === idx ? ({ ...r, podiumRaw: next }) : r));
                                            }}
                                            disabled={saving || loadingEvent}
                                            className={inputClassName}
                                            placeholder="3"
                                          />
                                        </div>
                                      </div>
                                    )}

                                    <div className="flex items-center justify-end">
                                      <button
                                        type="button"
                                        onClick={() => setChampHubEvents((prev) => prev.filter((_, i) => i !== idx))}
                                        className="text-xs text-red-600"
                                        disabled={saving || loadingEvent}
                                      >
                                        {t('adminEventsCreate.remove')}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => setChampHubEvents((prev) => [...prev, buildDefaultChampHubEvent()])}
                              className="inline-flex items-center gap-2 text-xs text-blue-700"
                              disabled={saving || loadingEvent}
                            >
                              <PlusCircle className="h-4 w-4" />
                              {t('adminEventsCreate.championshipHubAdd')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {isMatchPlay && (
                  <div className="border border-gray-200 rounded-2xl p-3 bg-white/70 space-y-3">
                    <div className="text-sm font-extrabold text-gray-900">{t('adminEventsCreate.matchTitle')}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.matchFormatLabel')}</div>
                        <select
                          value={matchPlayFormat}
                          onChange={(e) => setMatchPlayFormat(e.target.value as MatchPlayFormat)}
                          className={selectClassName}
                          disabled={saving || loadingEvent}
                        >
                          <option value="classic">{t('adminEventsCreate.matchFormatClassic')}</option>
                          <option value="groups">{t('adminEventsCreate.matchFormatGroups')}</option>
                        </select>
                      </div>
                    </div>

                    {matchPlayFormat === 'classic' ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.matchHolesPerRoundLabel')}</div>
                            <input
                              value={holesPerRoundRaw}
                              onChange={(e) => setHolesPerRoundRaw(e.target.value)}
                              className={inputClassName}
                              placeholder={t('adminEventsEdit.matchHolesPerRoundPlaceholder')}
                              disabled={saving || loadingEvent}
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.matchSeedsLabel')}</div>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={hasSeeds}
                                onChange={(e) => setHasSeeds(e.target.checked)}
                                disabled={saving || loadingEvent}
                              />
                              <input
                                value={seedCountRaw}
                                onChange={(e) => setSeedCountRaw(e.target.value)}
                                className={inputClassName}
                                placeholder={t('adminEventsEdit.matchSeedsPlaceholder')}
                                disabled={saving || loadingEvent || !hasSeeds}
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.matchConsolationLabel')}</div>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={hasConsolation}
                                onChange={(e) => setHasConsolation(e.target.checked)}
                                disabled={saving || loadingEvent}
                              />
                              <input
                                value={consolationHolesPerRoundRaw}
                                onChange={(e) => setConsolationHolesPerRoundRaw(e.target.value)}
                                className={inputClassName}
                                placeholder={t('adminEventsEdit.matchConsolationPlaceholder')}
                                disabled={saving || loadingEvent || !hasConsolation}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {matchPlayFormat === 'classic' ? (
                            <button
                              type="button"
                              onClick={onGenerateBracket}
                              disabled={saving || loadingEvent}
                              className="px-3 py-2 rounded-xl text-sm bg-white border border-gray-200 text-gray-700 disabled:opacity-50"
                            >
                              {t('adminEventsEdit.generateMatchDraw')}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={onGenerateGroupDraw}
                              disabled={saving || loadingEvent}
                              className="px-3 py-2 rounded-xl text-sm bg-white border border-gray-200 text-gray-700 disabled:opacity-50"
                            >
                              {t('adminEventsEdit.generateGroupDraw')}
                            </button>
                          )}

                          {matchPlayFormat === 'classic' ? (
                            <button
                              type="button"
                              onClick={openManualBracketEditor}
                              disabled={saving || loadingEvent}
                              className="px-3 py-2 rounded-xl text-sm bg-white border border-gray-200 text-gray-700 disabled:opacity-50"
                            >
                              {t('adminEventsEdit.assignManualBrackets')}
                            </button>
                          ) : null}
                        </div>

                        {matchPlayFormat === 'classic' && manualBracketOpen ? (
                          <div className="rounded-2xl border border-gray-200 bg-white/80 p-3 space-y-3">
                            <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.manualBracketsTitle')}</div>
                            <div className="text-[11px] text-gray-500">{t('adminEventsEdit.manualBracketsHint')}</div>
                            <div className="space-y-4">
                              {manualBracketRounds.map((round, roundIdx) => (
                                <div key={`manual-round-${roundIdx}`} className="space-y-2">
                                  <div className="text-xs font-semibold text-gray-600">{round.name}</div>
                                  <div className="space-y-2">
                                    {round.matches.map((match, matchIdx) => {
                                      const p1Label = match.p1 && match.p1 !== 'N/A' ? match.p1 : t('adminEventsEdit.manualUnassigned');
                                      const p2Label = match.p2 && match.p2 !== 'N/A' ? match.p2 : t('adminEventsEdit.manualUnassigned');
                                      const isP1Open = manualSlotOpen?.roundIdx === roundIdx && manualSlotOpen?.matchIdx === matchIdx && manualSlotOpen?.side === 'p1';
                                      const isP2Open = manualSlotOpen?.roundIdx === roundIdx && manualSlotOpen?.matchIdx === matchIdx && manualSlotOpen?.side === 'p2';
                                      const q = manualPlayerSearch.trim().toLowerCase();
                                      const filteredOptions = manualPlayerOptions.filter((opt) => opt.label.toLowerCase().includes(q));

                                      return (
                                        <div key={`manual-${roundIdx}-${matchIdx}`} className="space-y-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => setManualSlotOpen({ roundIdx, matchIdx, side: 'p1' })}
                                              className="rounded-lg border border-gray-200 px-2 py-1 text-sm text-left hover:bg-gray-50"
                                              disabled={saving || loadingEvent}
                                            >
                                              {p1Label}
                                            </button>
                                            <div className="text-[11px] text-gray-400 text-center">{t('adminEventsEdit.vsLabel')}</div>
                                            <button
                                              type="button"
                                              onClick={() => setManualSlotOpen({ roundIdx, matchIdx, side: 'p2' })}
                                              className="rounded-lg border border-gray-200 px-2 py-1 text-sm text-left hover:bg-gray-50"
                                              disabled={saving || loadingEvent}
                                            >
                                              {p2Label}
                                            </button>
                                          </div>

                                          {(isP1Open || isP2Open) && (
                                            <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-2 space-y-2">
                                              <input
                                                value={manualPlayerSearch}
                                                onChange={(e) => setManualPlayerSearch(e.target.value)}
                                                placeholder={t('adminEventsEdit.searchPlayerPlaceholder')}
                                                className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs"
                                              />
                                              <div className="max-h-48 overflow-y-auto space-y-1">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    updateManualSlot(roundIdx, matchIdx, isP1Open ? 'p1' : 'p2', 'bye');
                                                    setManualSlotOpen(null);
                                                  }}
                                                  className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-left"
                                                >
                                                  {t('adminEventsEdit.manualUnassigned')}
                                                </button>
                                                {filteredOptions.map((opt) => (
                                                  <button
                                                    key={`manual-opt-${roundIdx}-${matchIdx}-${opt.value}`}
                                                    type="button"
                                                    onClick={() => {
                                                      updateManualSlot(roundIdx, matchIdx, isP1Open ? 'p1' : 'p2', opt.value);
                                                      setManualSlotOpen(null);
                                                    }}
                                                    className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-left"
                                                  >
                                                    {opt.label}
                                                  </button>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={resetManualBracket}
                                disabled={saving || loadingEvent}
                                className="px-3 py-2 rounded-xl text-xs bg-white border border-gray-200 text-gray-600"
                              >
                                {t('adminEventsEdit.manualReset')}
                              </button>
                              <button
                                type="button"
                                onClick={onSaveManualBracket}
                                disabled={saving || loadingEvent}
                                className="px-3 py-2 rounded-xl text-xs bg-emerald-600 text-white"
                              >
                                {t('adminEventsEdit.manualSave')}
                              </button>
                              <button
                                type="button"
                                onClick={() => setManualBracketOpen(false)}
                                disabled={saving || loadingEvent}
                                className="px-3 py-2 rounded-xl text-xs text-gray-500"
                              >
                                {t('common.close')}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.groupModeLabel')}</div>
                            <select
                              value={groupMode}
                              onChange={(e) => setGroupMode(e.target.value as GroupMode)}
                              className={selectClassName}
                              disabled={saving || loadingEvent}
                            >
                              <option value="single">{t('adminEventsCreate.groupModeSingle')}</option>
                              <option value="multi">{t('adminEventsCreate.groupModeMulti')}</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.groupHolesLabel')}</div>
                            <input
                              value={groupHolesRaw}
                              onChange={(e) => setGroupHolesRaw(e.target.value)}
                              className={inputClassName}
                              placeholder={t('adminEventsCreate.groupHolesPlaceholder')}
                              disabled={saving || loadingEvent}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.groupMatchesPerDayLabel')}</div>
                            <input
                              value={groupMatchesPerDayRaw}
                              onChange={(e) => setGroupMatchesPerDayRaw(e.target.value)}
                              className={inputClassName}
                              placeholder={t('adminEventsCreate.groupMatchesPerDayPlaceholder')}
                              disabled={saving || loadingEvent}
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.groupDatesLabel')}</div>
                            <input
                              value={groupDatesRaw}
                              onChange={(e) => setGroupDatesRaw(e.target.value)}
                              className={inputClassName}
                              placeholder={t('adminEventsCreate.groupDatesPlaceholder')}
                              disabled={saving || loadingEvent}
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-gray-700">{t('adminEventsEdit.groupManualLabel')}</div>
                          <textarea
                            value={groupManualRaw}
                            onChange={(e) => setGroupManualRaw(e.target.value)}
                            className={inputClassName}
                            rows={3}
                            placeholder={t('adminEventsEdit.groupManualPlaceholder')}
                            disabled={saving || loadingEvent}
                          />
                          <div className="text-[11px] text-gray-500">
                            {t('adminEventsEdit.groupManualHint')}
                          </div>
                        </div>

                        {groupMode === 'multi' && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.groupCountLabel')}</div>
                              <input
                                value={groupCountRaw}
                                onChange={(e) => setGroupCountRaw(e.target.value)}
                                className={inputClassName}
                                placeholder={t('adminEventsCreate.groupCountPlaceholder')}
                                disabled={saving || loadingEvent}
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.groupAdvanceLabel')}</div>
                              <input
                                value={groupAdvanceRaw}
                                onChange={(e) => setGroupAdvanceRaw(e.target.value)}
                                className={inputClassName}
                                placeholder={t('adminEventsCreate.groupAdvancePlaceholder')}
                                disabled={saving || loadingEvent}
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.groupConsolationLabel')}</div>
                              <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={groupHasConsolation}
                                  onChange={(e) => setGroupHasConsolation(e.target.checked)}
                                  disabled={saving || loadingEvent}
                                />
                                {t('adminEventsCreate.groupConsolationHint')}
                              </label>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="border border-gray-200 rounded-2xl p-3 bg-white/70 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-extrabold text-gray-900">{t('adminEventsEdit.paymentsTitle')}</div>
                      <div className="text-[11px] text-gray-600">{t('adminEventsEdit.paymentsHint')}</div>
                    </div>
                  </div>

                  {registeredPlayers.length === 0 ? (
                    <div className="text-sm text-gray-700">{t('adminEventsEdit.noRegistered')}</div>
                  ) : (
                    <div className="space-y-2">
                      {registeredPlayers.map((p) => {
                        const isPaid = paidPlayerIds.includes(p.id);
                        const busy = paymentBusyId === p.id;
                        return (
                          <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2 bg-white">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">{p.name}</div>
                              <div className="text-[11px] text-gray-500 truncate">{p.id}</div>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={isPaid}
                                onChange={() => onTogglePaid(p.id)}
                                disabled={saving || loadingEvent || busy}
                              />
                              {t('adminEventsEdit.paidLabel')}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="border border-gray-200 rounded-2xl p-3 bg-white/70 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-extrabold text-gray-900">{t('adminEventsEdit.finalClassificationTitle')}</div>
                      <div className="text-[11px] text-gray-600">
                        {t('adminEventsEdit.finalClassificationHint')}
                      </div>
                      {finalClassificationLocked && (
                        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-2 py-1 inline-block mt-2">
                          {t('adminEventsEdit.classificationLocked')}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={classificationNameFilter}
                        onChange={(e) => setClassificationNameFilter(e.target.value)}
                        placeholder={t('adminEventsEdit.searchPlayerPlaceholder')}
                        className="px-2 py-2 rounded-xl text-sm bg-white border border-gray-200 text-gray-700"
                        disabled={saving || loadingEvent}
                      />
                      <select
                        value={classificationCategoryFilter}
                        onChange={(e) => setClassificationCategoryFilter(e.target.value)}
                        className="px-2 py-2 rounded-xl text-sm bg-white border border-gray-200 text-gray-700"
                        disabled={saving || loadingEvent}
                      >
                        {availableClassificationCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat === 'Todas'
                              ? t('adminEventsEdit.allCategories')
                              : cat === 'Sin categoria'
                                ? t('adminEventsEdit.uncategorized')
                                : getCategoryLabel(cat, t)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl text-sm bg-white border border-gray-200 text-gray-700 disabled:opacity-50"
                        onClick={() => setFinalClassificationLocked((v) => !v)}
                        disabled={saving || loadingEvent}
                      >
                        {finalClassificationLocked ? t('adminEventsEdit.unlock') : t('adminEventsEdit.lock')}
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl text-sm bg-white border border-gray-200 text-gray-700 disabled:opacity-50"
                        onClick={() => setFinalClassification(buildFinalClassificationFromPlayers(registeredPlayers, finalClassification, classificationRoundCount))}
                        disabled={saving || loadingEvent || registeredPlayers.length === 0}
                      >
                        {t('adminEventsEdit.regenerate')}
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 rounded-xl text-sm bg-white border border-gray-200 text-gray-700 disabled:opacity-50"
                        onClick={() => {
                          setImportError(null);
                          setImportModalOpen(true);
                        }}
                        disabled={saving || loadingEvent}
                      >
                        {t('adminEventsEdit.importCsvXlsx')}
                      </button>
                    </div>
                  </div>

                  {championshipStandings && (
                    <div className="border border-gray-200 rounded-2xl p-3 bg-white/70 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-extrabold text-gray-900">{t('adminEventsEdit.championshipTitle')}</div>
                          <div className="text-[11px] text-gray-600">
                            {t('adminEventsEdit.updatedAtLabel')}{' '}
                            {championshipStandings?.updatedAt ? new Date(championshipStandings.updatedAt).toLocaleString() : '-'}
                          </div>
                        </div>
                        <select
                          value={championshipCategoryFilter}
                          onChange={(e) => setChampionshipCategoryFilter(e.target.value)}
                          className="px-2 py-2 rounded-xl text-sm bg-white border border-gray-200 text-gray-700"
                          disabled={saving || loadingEvent}
                        >
                          {championshipCategories.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>

                      {championshipRows.length === 0 ? (
                        <div className="text-sm text-gray-700">{t('adminEventsEdit.noChampionshipData')}</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-[640px] w-full text-xs">
                            <thead>
                              <tr className="text-left text-gray-500">
                                <th className="py-2 pr-2 w-10">#</th>
                                <th className="py-2 pr-2 min-w-[180px]">{t('adminEventsEdit.playerLabel')}</th>
                                <th className="py-2 pr-2 w-16 text-right">{t('adminEventsEdit.totalLabel')}</th>
                                {championshipEventsMeta.map((ev: any) => (
                                  <th key={ev.eventId} className="py-2 pr-2 text-right min-w-[110px]">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-[0.12em]">
                                      {ev.kind === 'doble' ? t('adminEventsCreate.championshipHubTypeDouble') : t('adminEventsCreate.championshipHubTypeSimple')}
                                    </div>
                                    <div className="text-[11px] text-gray-700 truncate">{ev.name}</div>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {championshipRows.map((row: any, idx: number) => {
                                const rowClass = idx === 0
                                  ? 'bg-amber-200/70'
                                  : idx === 1
                                  ? 'bg-gray-200/70'
                                  : idx === 2
                                  ? 'bg-amber-700/30'
                                  : '';
                                return (
                                  <tr key={row.user_id} className={`border-t border-gray-100 ${rowClass}`}>
                                    <td className="py-2 pr-2 font-semibold text-gray-700">{idx + 1}</td>
                                    <td className="py-2 pr-2 font-semibold text-gray-900 truncate">{row.name || row.user_id}</td>
                                    <td className="py-2 pr-2 text-right font-semibold text-emerald-700">{row.total}</td>
                                    {championshipEventsMeta.map((ev: any) => (
                                      <td key={`${row.user_id}-${ev.eventId}`} className="py-2 pr-2 text-right text-gray-700">
                                        {row.events?.[ev.eventId] ?? 0}
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {isEventClosed && championshipRows.length > 0 ? (
                        <div className="flex justify-end pt-2">
                          <button
                            type="button"
                            onClick={() => openExportModal('championship')}
                            className="px-3 py-2 rounded-xl text-sm bg-pink-500 border border-pink-500 text-white"
                            disabled={saving || loadingEvent}
                          >
                            {t('adminEventsEdit.export')}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}

                  <div className="border border-gray-200 rounded-2xl p-3 bg-white/70 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-extrabold text-gray-900">{t('adminEventsEdit.pointsTitle')}</div>
                        <div className="text-[11px] text-gray-600">{t('adminEventsEdit.pointsSubtitle')}</div>
                      </div>
                    </div>

                    {orderedPointCategories.length === 0 ? (
                      <div className="text-sm text-gray-700">{t('adminEventsEdit.noPointsData')}</div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {orderedPointCategories.map((category) => {
                          const rows = Array.isArray(pointsByCategory[category]) ? pointsByCategory[category] : [];
                          return (
                            <div key={category} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                              <div className="text-sm font-semibold text-gray-900">{category}</div>
                              {rows.length === 0 ? (
                                <div className="text-xs text-gray-500">{t('adminEventsEdit.noData')}</div>
                              ) : (
                                <div className="space-y-2">
                                  {rows.map((row: any) => {
                                    const pos = Number(row.position) || 0;
                                    const rowClass = pos === 1
                                      ? 'bg-amber-200/70 border-amber-200'
                                      : pos === 2
                                      ? 'bg-gray-200/70 border-gray-200'
                                      : pos === 3
                                      ? 'bg-amber-700/30 border-amber-300'
                                      : pos > 0 && pos <= 10
                                      ? 'bg-emerald-50 border-emerald-200'
                                      : 'bg-white border-gray-200';
                                    return (
                                      <div
                                        key={`${row.user_id}-${row.position}`}
                                        className={`flex items-center justify-between gap-3 rounded-lg border px-2 py-1 ${rowClass}`}
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <div className="w-5 text-center text-xs font-extrabold text-gray-900">{pos || '-'}</div>
                                          <div className="text-xs font-semibold text-gray-900 truncate">{row.name || row.user_id}</div>
                                        </div>
                                        <div className="text-xs font-semibold text-emerald-700">{row.points} {t('adminEventsEdit.pointsShort')}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {isEventClosed && orderedPointCategories.length > 0 ? (
                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={() => openExportModal('points')}
                          className="px-3 py-2 rounded-xl text-sm bg-pink-500 border border-pink-500 text-white"
                          disabled={saving || loadingEvent}
                        >
                          {t('adminEventsEdit.export')}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {registeredPlayers.length === 0 ? (
                    <div className="text-sm text-gray-700">{t('adminEventsEdit.noRegisteredForClassification')}</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-[11px] text-gray-500 pl-12">
                        {Array.from({ length: classificationRoundCount }, (_, rIdx) => (
                          <div key={`rh-${rIdx}`} className="w-16 text-center">
                            {t('adminEventsEdit.roundLabel').replace('{round}', String(rIdx + 1))}
                          </div>
                        ))}
                        <div className="w-20 text-center">{t('adminEventsEdit.totalLabel')}</div>
                      </div>
                      {filteredFinalClassification.map((row, idx) => {
                        const pname = playerNameById.get(row.user_id) || row.user_id;
                        const category = playerCategoryById.get(row.user_id) || 'Sin categoria';
                        const isWinner = classificationWinners.get(category) === row.user_id;
                        const rounds = normalizeRounds(row.rounds, classificationRoundCount, row.strokes ?? null);
                        const total = rounds.some((v) => v != null)
                          ? rounds.reduce((sum, v) => sum + (v || 0), 0)
                          : (row.strokes == null ? null : Number(row.strokes));
                        const par = courseParRaw.trim() ? Number.parseInt(courseParRaw, 10) : null;
                        const parTotal = par && Number.isFinite(par) ? par * classificationRoundCount : null;
                        const diff = total != null && parTotal != null ? total - parTotal : null;
                        const diffLabel = diff == null ? '' : diff === 0 ? 'E' : diff > 0 ? `+${diff}` : String(diff);
                        return (
                          <div
                            key={row.user_id}
                            className={`flex items-center gap-2 border rounded-xl p-2 ${
                              isWinner ? 'border-amber-300 bg-amber-50/70' : 'border-gray-200 bg-white'
                            }`}
                          >
                            <div className="w-10 text-center text-sm font-extrabold text-gray-900">{row.position ?? idx + 1}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold text-gray-900 truncate">{pname}</div>
                                {isWinner ? (
                                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                                    {t('adminEventsEdit.winnerLabel')}
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-[11px] text-gray-500 truncate">{row.user_id}</div>
                            </div>
                            {rounds.map((value, roundIdx) => (
                              <div key={`r-${row.user_id}-${roundIdx}`} className="w-16">
                                <input
                                  value={value == null ? '' : String(value)}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setFinalClassification((prev) => prev.map((r, i) => {
                                      if (i !== idx) return r;
                                      const nextRounds = normalizeRounds(r.rounds, classificationRoundCount, r.strokes ?? null);
                                      nextRounds[roundIdx] = v === '' ? null : Number.parseInt(v, 10);
                                      return { ...r, rounds: nextRounds };
                                    }));
                                  }}
                                  className={inputClassName}
                                  placeholder={t('adminEventsEdit.roundInputPlaceholder').replace('{round}', String(roundIdx + 1))}
                                  disabled={saving || loadingEvent}
                                />
                              </div>
                            ))}
                            <div className="w-20 text-center">
                              <div className="text-sm font-semibold text-gray-900">{total == null ? '-' : total}</div>
                              {diffLabel ? <div className="text-[11px] text-gray-500">{diffLabel}</div> : null}
                            </div>
                            <div className="w-44">
                              <input
                                value={row.note || ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setFinalClassification((prev) => prev.map((r, i) => i === idx ? ({ ...r, note: v }) : r));
                                }}
                                className={inputClassName}
                                placeholder={t('adminEventsEdit.tieNotePlaceholder')}
                                disabled={saving || loadingEvent}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                className="p-2 rounded-lg border border-gray-200 bg-white disabled:opacity-50"
                                onClick={() => onMoveUp(idx)}
                                disabled={saving || loadingEvent || idx === 0}
                                aria-label={t('adminEventsEdit.moveUp')}
                              >
                                <ChevronUp className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className="p-2 rounded-lg border border-gray-200 bg-white disabled:opacity-50"
                                onClick={() => onMoveDown(idx)}
                                disabled={saving || loadingEvent || idx === finalClassification.length - 1}
                                aria-label={t('adminEventsEdit.moveDown')}
                              >
                                <ChevronDown className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {isEventClosed && finalClassification.length > 0 ? (
                        <div className="flex justify-end pt-2">
                          <button
                            type="button"
                            className="px-3 py-2 rounded-xl text-sm bg-pink-500 border border-pink-500 text-white disabled:opacity-50"
                            onClick={() => openExportModal('final')}
                            disabled={saving || loadingEvent}
                          >
                            {t('adminEventsEdit.export')}
                          </button>
                        </div>
                      ) : null}

                      {isEventClosed && isStableford && stablefordMode === 'weekly' ? (
                        <div className="flex justify-end pt-2">
                          <button
                            type="button"
                            className="px-3 py-2 rounded-xl text-sm bg-emerald-600 border border-emerald-600 text-white disabled:opacity-50"
                            onClick={() => openExportModal('weekly')}
                            disabled={saving || loadingEvent}
                          >
                            {t('adminEventsEdit.weeklyExport')}
                          </button>
                        </div>
                      ) : null}

                      <div className="border border-gray-200 rounded-2xl p-3 bg-white/70 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-extrabold text-gray-900">{t('adminEventsEdit.historyTitle')}</div>
                            <div className="text-[11px] text-gray-600">
                              {t('adminEventsEdit.historySubtitle')}
                            </div>
                          </div>
                        </div>

                        {historyLoading ? (
                          <div className="text-sm text-gray-600">{t('adminEventsEdit.historyLoading')}</div>
                        ) : historyError ? (
                          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                            {historyError}
                          </div>
                        ) : classificationHistory.length === 0 ? (
                          <div className="text-sm text-gray-600">{t('adminEventsEdit.historyEmpty')}</div>
                        ) : (
                          <div className="space-y-2">
                            {classificationHistory.map((row) => {
                              const snapshot = Array.isArray(row?.final_classification_snapshot) ? row.final_classification_snapshot : [];
                              const label = row?.action === 'lock'
                                ? t('adminEventsEdit.historyLock')
                                : row?.action === 'unlock'
                                ? t('adminEventsEdit.historyUnlock')
                                : t('adminEventsEdit.historyUpdate');
                              const actorName = row?.actor?.name || row?.actor_user_id || t('adminEventsEdit.historySystem');
                              return (
                                <div key={row.id} className="rounded-xl border border-gray-200 px-3 py-2 bg-white">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-semibold text-gray-900">{label}</div>
                                    <div className="text-xs text-gray-500">{formatHistoryStamp(row?.created_at || null)}</div>
                                  </div>
                                  <div className="text-xs text-gray-500">{t('adminEventsEdit.historyBy').replace('{name}', actorName)}</div>
                                  <div className="text-xs text-gray-500">{t('adminEventsEdit.historyEntries').replace('{count}', String(snapshot.length))}</div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl text-sm bg-blue-600 text-white disabled:opacity-50"
                    onClick={onSave}
                    disabled={saving || loadingEvent || !canSave}
                  >
                    <Save className="h-4 w-4 inline-block mr-2" />
                    {saving ? t('adminEventsEdit.saving') : t('adminEventsEdit.saveChanges')}
                  </button>
                </div>

                {!canSave && selectedEventId && (
                  <div className="text-[11px] text-gray-500">
                    {t('adminEventsEdit.saveHint')}
                  </div>
                )}
              </div>
            )}
          </section>
        </main>

        {exportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
              <div className="text-sm font-semibold text-gray-900">{t('adminEventsEdit.exportTitle')}</div>
              <div className="text-xs text-gray-500 mt-1">{t('adminEventsEdit.exportSubtitle')}</div>
              <div className="mt-4 grid grid-cols-1 gap-2">
                {!isWeeklyExport ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await handleExportResults('csv');
                      setExportModalOpen(false);
                    }}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-700"
                  >
                    CSV
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={async () => {
                    await handleExportResults('xlsx');
                    setExportModalOpen(false);
                  }}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-700"
                >
                  XLSX
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleExportResults('pdf');
                    setExportModalOpen(false);
                  }}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-700"
                >
                  PDF
                </button>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setExportModalOpen(false)}
                  className="text-xs text-gray-500"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {importModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
              <div className="text-sm font-semibold text-gray-900">{t('adminEventsEdit.importTitle')}</div>
              <div className="text-xs text-gray-500 mt-1">
                {t('adminEventsEdit.importSubtitle')}
              </div>
              <div className="mt-3">
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void importFinalClassification(file);
                  }}
                  disabled={importBusy}
                />
              </div>
              {importError ? (
                <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-2">
                  {importError}
                </div>
              ) : null}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  className="text-xs text-gray-500"
                  disabled={importBusy}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
