'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, DoorOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import MatchPlayDrawModal from '@/components/MatchPlayDrawModal';
import { exportResultsAll } from '@/lib/export-results';

interface EventRow {
  id: string;
  name: string;
  status: string | null;
  competition_mode: string | null;
  registration_start: string | null;
  registration_end: string | null;
  event_date: string | null;
  course_id: string | null;
  config: any | null;
  registered_player_ids: string[] | null;
  has_handicap_ranking?: boolean | null;
}

interface RegistrationRow {
  user_id: string;
  category?: string | null;
  name: string;
  team_name?: string | null;
  is_waitlist?: boolean;
}

type ClassificationSort =
  | { type: 'round'; index: number }
  | { type: 'total' }
  | { type: 'score' };

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
};

const ALL_CATEGORIES_VALUE = '__ALL__';

const DEFAULT_CATEGORIES = ['Masculino', 'Femenino', 'Senior', 'Senior+', 'Junior'];
const CATEGORY_LABELS = new Map<string, string>([
  ['masculino', 'Masculino'],
  ['femenino', 'Femenino'],
  ['senior+', 'Senior+'],
  ['senior plus', 'Senior+'],
  ['senior', 'Senior'],
  ['junior', 'Junior'],
]);

function normalizeCategoryLabel(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return 'General';
  const key = raw.toLowerCase();
  for (const [match, label] of CATEGORY_LABELS.entries()) {
    if (key === match || key.includes(match)) return label;
  }
  return raw;
}

function uniq(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

function normalizeIdArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x || '')).map((x) => x.trim()).filter(Boolean);
}

async function getAuthHeaders() {
  const sessionRes = await supabase.auth.getSession();
  const token = sessionRes?.data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const formatLabel = (format?: string | null) => {
  if (!format) return 'General';
  const value = format.toLowerCase();
  if (value.includes('match') || value.includes('mp')) return 'Match Play';
  if (value.includes('stable')) return 'Stableford';
  if (value.includes('stroke')) return 'Stroke Play';
  return format;
};

const formatStartMode = (mode: string | null | undefined, t: (key: string) => string) => {
  const value = String(mode || '').toLowerCase();
  if (value === 'tiro') return t('events.startModeShotgun');
  if (value === 'hoyo_intervalo') return t('events.startModeIntervals');
  if (value === 'libre') return t('events.startModeFree');
  return t('events.startModeUnknown');
};

function isMatchPlay(mode?: string | null) {
  const v = String(mode || '').toLowerCase();
  return v.includes('match');
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

function normalizeRoundKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function inferTargetPlayers(roundName: string, playerCount: number) {
  const key = normalizeRoundKey(roundName);
  if (!key) return null;
  if (key.includes('final')) return 2;
  if (key.includes('semifinal')) return 4;
  if (key.includes('cuartos')) return 8;
  if (key.includes('octavos')) return 16;
  if (key.includes('dieciseisavos')) return playerCount <= 20 ? 16 : 32;
  return null;
}

function isByeName(value: string) {
  const v = String(value || '').trim().toLowerCase();
  return !v || v === 'n/a' || v === 'bye';
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

function extractPlayers(matches: BracketMatch[]) {
  const seen = new Set<string>();
  const out: { id: string | null; name: string }[] = [];
  for (const m of matches) {
    const pairs: Array<{ id: string | null; name: string }> = [
      { id: m.p1_id || null, name: m.p1 },
      { id: m.p2_id || null, name: m.p2 },
    ];
    for (const p of pairs) {
      if (isByeName(p.name)) continue;
      const key = p.id ? `id:${p.id}` : `name:${p.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: p.id, name: p.name });
    }
  }
  return out;
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

function previousPowerOfTwo(value: number) {
  let power = 1;
  while (power * 2 <= value) power *= 2;
  return power;
}

function buildMatchPlayBracket(
  players: RegistrationRow[],
  mainRoundName: string,
  labels: BracketLabels
): BracketRound[] {
  if (players.length < 2) return [];

  const baseSize = previousPowerOfTwo(players.length);
  const extraPlayers = players.length - baseSize;

  if (extraPlayers <= 0) {
    const mainMatches = buildMatchesFromSlots(
      players.map((p) => ({ id: p.user_id, name: p.name })),
      labels.placeholder
    );
    return [{ name: mainRoundName, matches: mainMatches }];
  }

  const prelimPlayers = players.slice(-extraPlayers * 2);
  const mainPlayers = players.slice(0, players.length - extraPlayers * 2);
  const prelimMatches = buildMatchesFromSlots(
    prelimPlayers.map((p) => ({ id: p.user_id, name: p.name })),
    labels.placeholder
  );

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
      slots.push({ id: p?.user_id || null, name: p?.name || labels.placeholder });
    }
  }

  const mainMatches = buildMatchesFromSlots(slots, labels.placeholder);
  const anchorTargets = placeholderPositions.map((pos) => Math.floor(pos / 2));

  return [
    { name: labels.preliminaryRound, matches: prelimMatches, anchorTargets },
    { name: mainRoundName, matches: mainMatches },
  ];
}

function buildDisplayRounds(rounds: BracketRound[], labels: BracketLabels, fallbackRoundName: string): BracketRound[] {
  if (!Array.isArray(rounds) || rounds.length === 0) return [];
  const round0 = rounds[0];
  if (!round0?.matches?.length) return rounds;

  const players = extractPlayers(round0.matches);
  const inferredCount = inferTargetPlayers(round0.name, players.length);
  if (!inferredCount || players.length <= inferredCount) return rounds;

  const roundName = String(round0.name || fallbackRoundName);
  return buildMatchPlayBracket(
    players.map((p) => ({ user_id: p.id || '', name: p.name } as RegistrationRow)),
    roundName,
    labels
  );
}

const toDate = (value?: string | null) => (value ? new Date(value) : null);

const isBetween = (value: Date, start?: Date | null, end?: Date | null) => {
  if (!start || !end) return false;
  return value >= start && value <= end;
};

export default function EventDetailPage() {
  const params = useParams();
  const eventId = params?.id as string | undefined;
  const { user, isAdmin } = useAuth();
  const { t } = useLanguage();

  const bracketLabels = useMemo<BracketLabels>(() => ({
    placeholder: t('common.notAvailable'),
    preliminaryRound: t('events.preliminaryRound'),
    preliminaryWinner: t('events.preliminaryWinner'),
  }), [t]);

  const [event, setEvent] = useState<EventRow | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [alreadyOpen, setAlreadyOpen] = useState(false);
  const [confirmMismatchOpen, setConfirmMismatchOpen] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [profileCategory, setProfileCategory] = useState<string | null>(null);
  const [drawOpen, setDrawOpen] = useState(false);
  const [pointsCategoryFilter, setPointsCategoryFilter] = useState<string>('');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportTarget, setExportTarget] = useState<'final' | 'points' | 'championship'>('final');
  const [classificationCategoryFilter, setClassificationCategoryFilter] = useState<string>(ALL_CATEGORIES_VALUE);
  const [classificationNameFilter, setClassificationNameFilter] = useState('');
  const [classificationModalOpen, setClassificationModalOpen] = useState(false);
  const [attemptMessage, setAttemptMessage] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [expandedRound, setExpandedRound] = useState(0);
  const [sortMode, setSortMode] = useState<ClassificationSort | null>(null);
  const [profileNameById, setProfileNameById] = useState<Record<string, string>>({});
  const [profileCategoryById, setProfileCategoryById] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!eventId) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      const { data: eventData } = await supabase
        .from('events')
        .select('id, name, status, competition_mode, registration_start, registration_end, event_date, course_id, config, registered_player_ids, has_handicap_ranking')
        .eq('id', eventId)
        .single();

      const ids = (eventData as EventRow | null)?.registered_player_ids ?? [];
      const config = (eventData as EventRow | null)?.config || {};
      const teamCompetitionEnabled = !!(config as any)?.teamCompetitionEnabled;
      const waitlistIds = normalizeIdArray((config as any)?.waitlist_player_ids);

      const finalIds = Array.isArray((config as any)?.finalClassification)
        ? (config as any).finalClassification
            .map((row: any) => String(row?.user_id || '').trim())
            .filter(Boolean)
        : [];
      const allIds = uniq([...(ids || []), ...waitlistIds, ...finalIds]);
      let regData: RegistrationRow[] = [];
      if (allIds.length > 0) {
        const profileColumns = teamCompetitionEnabled
          ? 'id, first_name, last_name, category, team'
          : 'id, first_name, last_name, category';
        const { data: profileData } = await supabase
          .from('profiles')
          .select(profileColumns)
          .in('id', allIds);

        const teamNameByPlayerId = new Map<string, string>();
        if (teamCompetitionEnabled) {
          for (const row of (profileData as any[]) || []) {
            const playerId = String((row as any)?.id || '');
            const name = String((row as any)?.team || '').trim();
            if (playerId && name) teamNameByPlayerId.set(playerId, name);
          }
        }

        const safeProfiles = (profileData as any[]) || [];
        const nameMap = new Map(
          safeProfiles.map((row) => [row.id, [row.first_name, row.last_name].filter(Boolean).join(' ')])
        );
        const categoryMap = new Map(
          safeProfiles.map((row) => [row.id, row.category || null])
        );
        setProfileNameById(
          safeProfiles.reduce<Record<string, string>>((acc, row) => {
            const id = String(row?.id || '').trim();
            if (!id) return acc;
            acc[id] = [row?.first_name, row?.last_name].filter(Boolean).join(' ');
            return acc;
          }, {})
        );
        setProfileCategoryById(
          safeProfiles.reduce<Record<string, string | null>>((acc, row) => {
            const id = String(row?.id || '').trim();
            if (!id) return acc;
            acc[id] = row?.category || null;
            return acc;
          }, {})
        );

        const registeredList = (ids || []).map((id) => ({
          user_id: id,
          name: nameMap.get(id) || t('events.playerFallback'),
          category: categoryMap.get(id) || null,
          team_name: teamNameByPlayerId.get(id) || null,
          is_waitlist: false,
        }));

        const waitlistList = waitlistIds
          .filter((id) => !(ids || []).includes(id))
          .map((id) => ({
            user_id: id,
            name: nameMap.get(id) || t('events.playerFallback'),
            category: categoryMap.get(id) || null,
            team_name: teamNameByPlayerId.get(id) || null,
            is_waitlist: true,
          }));

        regData = [...registeredList, ...waitlistList];
      }

      if (active) {
        setEvent((eventData as EventRow) || null);
        setRegistrations(regData);
        const priceConfig = (eventData as EventRow | null)?.config?.prices ?? [];
        setSelectedCategory(priceConfig?.[0]?.category || '');
        setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [eventId]);

  const isEventStarted = useMemo(() => {
    const raw = String(event?.status || '').toLowerCase();
    return [
      'en_juego',
      'en juego',
      'in_progress',
      'started',
      'playing',
      'finalizado',
      'finalizada',
      'cerrado',
      'cerrada',
      'closed',
      'finished',
    ].includes(raw);
  }, [event]);

  const isMatchPlayEvent = useMemo(() => isMatchPlay(event?.competition_mode), [event]);
  const isEventClosed = useMemo(() => {
    const status = String(event?.status || '').trim().toLowerCase();
    return ['closed', 'finished', 'finalizado', 'cerrado'].includes(status);
  }, [event]);

  const classificationPhase = useMemo(() => {
    if (isEventClosed) return 'closed';
    if (isEventStarted) return 'live';
    return 'registration';
  }, [isEventClosed, isEventStarted]);

  const registrationOpen = useMemo(() => {
    const now = new Date();
    const inWindow = isBetween(now, toDate(event?.registration_start), toDate(event?.registration_end));
    if (isAttemptBased) return inWindow;
    return !isEventStarted && inWindow;
  }, [event, isAttemptBased, isEventStarted]);

  const currentRegistration = useMemo(() => {
    if (!user) return null;
    return registrations.find((reg) => reg.user_id === user.id) || null;
  }, [registrations, user]);

  const maxPlayers = useMemo(() => {
    const raw = (event?.config as any)?.maxPlayers;
    const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw || ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [event]);

  const waitlistCount = useMemo(() => {
    const wl = normalizeIdArray((event?.config as any)?.waitlist_player_ids);
    return wl.length;
  }, [event]);

  const registeredCount = useMemo(() => (event?.registered_player_ids || []).length, [event]);

  const teamCompetitionEnabled = useMemo(() => {
    return !!(event?.config as any)?.teamCompetitionEnabled;
  }, [event]);

  const finalClassificationLocked = useMemo(() => {
    return !!(event?.config as any)?.finalClassificationLocked;
  }, [event]);

  const finalClassification = useMemo(() => {
    const raw = (event?.config as any)?.finalClassification;
    const list = Array.isArray(raw) ? raw : [];
    return list
      .map((row: any) => {
        const user_id = String(row?.user_id || '').trim();
        const positionRaw = row?.position;
        const position = Number.isFinite(positionRaw) ? Number(positionRaw) : Number.parseInt(String(positionRaw || ''), 10);
        const strokesRaw = row?.strokes;
        const strokes = strokesRaw == null || strokesRaw === '' ? null : Number(strokesRaw);
        const roundsRaw = Array.isArray(row?.rounds) ? row.rounds : [];
        const rounds = roundsRaw
          .map((v: any) => (v == null || v === '' ? null : Number(v)))
          .map((v: any) => (Number.isFinite(v) ? Number(v) : null));
        const note = typeof row?.note === 'string' ? row.note : null;
        return {
          user_id,
          position: Number.isFinite(position) && position > 0 ? position : null,
          strokes: Number.isFinite(strokes as any) ? (strokes as number) : null,
          rounds,
          note,
        };
      })
      .filter((row: any) => row.user_id)
      .sort((a: any, b: any) => (a.position ?? 9999) - (b.position ?? 9999));
  }, [event]);

  const stablefordConfig = useMemo(() => {
    return (event?.config as any)?.stableford || null;
  }, [event]);

  const isAttemptBased = useMemo(() => {
    const mode = String(stablefordConfig?.mode || '').toLowerCase();
    return mode === 'weekly' || mode === 'best_card';
  }, [stablefordConfig]);

  const flights = useMemo(() => {
    const raw = (event?.config as any)?.flights;
    return Array.isArray(raw) ? raw : [];
  }, [event]);

  const attemptsByUser = useMemo(() => {
    const raw = stablefordConfig?.attemptsByUser;
    return raw && typeof raw === 'object' ? raw : {};
  }, [stablefordConfig]);

  const currentAttemptsUsed = useMemo(() => {
    if (!user) return 0;
    return Number(attemptsByUser?.[user.id] || 0);
  }, [attemptsByUser, user]);

  const currentMaxAttempts = useMemo(() => {
    if (!user) return null;
    return getMaxAttemptsForUser(user.id);
  }, [stablefordConfig, user]);

  const getMaxAttemptsForUser = (userId: string) => {
    const mode = String(stablefordConfig?.mode || '').toLowerCase();
    if (mode === 'weekly') {
      const weekly = stablefordConfig?.weekly || {};
      const base = Number(weekly?.maxAttempts);
      const extraRaw = weekly?.extraAttemptsByUser?.[userId];
      const extra = Number(extraRaw || 0);
      const baseSafe = Number.isFinite(base) && base > 0 ? base : 1;
      return baseSafe + (Number.isFinite(extra) && extra > 0 ? extra : 0);
    }
    if (mode === 'best_card') {
      const raw = Number(stablefordConfig?.bestCardMaxAttempts);
      return Number.isFinite(raw) && raw > 0 ? raw : null;
    }
    return null;
  };

  const championshipConfig = useMemo(() => {
    return (event?.config as any)?.championship || null;
  }, [event]);

  const startingConfig = useMemo(() => {
    return (event?.config as any)?.starting || null;
  }, [event]);

  const championshipHub = useMemo(() => {
    return (event?.config as any)?.championshipHub || null;
  }, [event]);

  const championshipStandings = useMemo(() => {
    return (championshipHub as any)?.standings || null;
  }, [championshipHub]);

  const championshipCategories = useMemo(() => {
    const list = Array.isArray(championshipStandings?.categories) ? championshipStandings?.categories : [];
    return list.length ? list : [];
  }, [championshipStandings]);

  const [championshipCategoryFilter, setChampionshipCategoryFilter] = useState<string>('');

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

  const championshipStage = useMemo(() => {
    return (event?.config as any)?.championshipStage ?? championshipConfig?.stage ?? null;
  }, [event, championshipConfig]);

  const championshipEventType = useMemo(() => {
    const raw = (event?.config as any)?.championshipEventType ?? championshipConfig?.eventType ?? null;
    const value = String(raw || '').toLowerCase();
    if (value === 'double' || value === 'doble') return t('events.doubleLabel');
    if (value === 'simple') return t('events.singleLabel');
    return raw ? String(raw) : null;
  }, [event, championshipConfig, t]);

  const pointsByCategory = useMemo(() => {
    const raw = (event?.config as any)?.eventPointsByCategory || {};
    if (!raw || typeof raw !== 'object') return {} as Record<string, any[]>;
    return raw as Record<string, any[]>;
  }, [event]);

  const pointsCategoryByUser = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(pointsByCategory).forEach(([category, list]) => {
      if (!Array.isArray(list)) return;
      list.forEach((row: any) => {
        const userId = String(row?.user_id || '').trim();
        if (!userId) return;
        map.set(userId, category);
      });
    });
    return map;
  }, [pointsByCategory]);

  const availablePointCategories = useMemo(() => {
    const keys = Object.keys(pointsByCategory);
    keys.sort((a, b) => {
      if (a === 'General') return -1;
      if (b === 'General') return 1;
      return a.localeCompare(b);
    });
    return keys;
  }, [pointsByCategory]);

  useEffect(() => {
    if (!availablePointCategories.length) {
      if (pointsCategoryFilter) setPointsCategoryFilter('');
      return;
    }
    if (!pointsCategoryFilter || !availablePointCategories.includes(pointsCategoryFilter)) {
      const next = availablePointCategories.includes('General')
        ? 'General'
        : availablePointCategories[0];
      setPointsCategoryFilter(next);
    }
  }, [availablePointCategories, pointsCategoryFilter]);

  const filteredPointsRows = useMemo(() => {
    if (!pointsCategoryFilter) return [];
    return (pointsByCategory[pointsCategoryFilter] || []).slice();
  }, [pointsByCategory, pointsCategoryFilter]);

  const registrationByUserId = useMemo(() => {
    const m = new Map<string, RegistrationRow>();
    registrations.forEach((r) => m.set(r.user_id, r));
    return m;
  }, [registrations]);

  const classificationRoundCount = useMemo(() => {
    if (!stablefordConfig || stablefordConfig?.mode !== 'classic') {
      const maxRounds = finalClassification.reduce((max, row) => Math.max(max, (row.rounds || []).length), 0);
      return Math.max(1, maxRounds || 1);
    }
    const rounds = Number.parseInt(String(stablefordConfig?.classicRounds || '1'), 10);
    return Number.isFinite(rounds) && rounds > 0 ? Math.min(rounds, 4) : 1;
  }, [finalClassification, stablefordConfig]);

  useEffect(() => {
    setExpandedRound((prev) => (prev >= classificationRoundCount ? 0 : prev));
  }, [classificationRoundCount]);

  const coursePar = useMemo(() => {
    const raw = (event?.config as any)?.coursePar;
    const n = Number.parseInt(String(raw || ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [event]);

  const classificationCategories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    Object.keys(pointsByCategory).forEach((cat) => {
      const label = normalizeCategoryLabel(cat);
      if (label && label !== 'General') set.add(label);
    });
    registrations.forEach((reg) => {
      const label = normalizeCategoryLabel(reg?.category || null);
      if (label && label !== 'General') set.add(label);
    });
    finalClassification.forEach((row) => {
      const reg = registrationByUserId.get(row.user_id);
      const profileCategory = profileCategoryById[row.user_id] || null;
      const pointsCategory = pointsCategoryByUser.get(row.user_id) || null;
      const label = normalizeCategoryLabel(reg?.category || profileCategory || pointsCategory || null);
      if (label && label !== 'General') set.add(label);
    });
    return Array.from(set);
  }, [finalClassification, pointsByCategory, pointsCategoryByUser, profileCategoryById, registrationByUserId, registrations]);

  const classificationCategoryOptions = useMemo(() => (
    [
      { value: ALL_CATEGORIES_VALUE, label: t('events.allCategories') },
      ...classificationCategories.map((cat) => ({ value: cat, label: cat })),
    ]
  ), [classificationCategories, t]);

  const classificationRows = useMemo(() => {
    const parTotal = coursePar ? coursePar * classificationRoundCount : null;
    const rows = finalClassification.map((row) => {
      const reg = registrationByUserId.get(row.user_id);
      const profileCategory = profileCategoryById[row.user_id] || null;
      const pointsCategory = pointsCategoryByUser.get(row.user_id) || null;
      const profileName = profileNameById[row.user_id];
      const rounds = normalizeRounds(row.rounds, classificationRoundCount, row.strokes ?? null);
      const total = rounds.some((v) => v != null)
        ? rounds.reduce((sum, v) => sum + (v || 0), 0)
        : (row.strokes == null ? null : Number(row.strokes));
      const diff = total != null && parTotal != null ? total - parTotal : null;
      const diffLabel = diff == null ? '' : diff === 0 ? 'E' : diff > 0 ? `+${diff}` : String(diff);
      return {
        ...row,
        name: profileName || reg?.name || t('events.playerFallback'),
        category: normalizeCategoryLabel(reg?.category || profileCategory || pointsCategory || null),
        team_name: reg?.team_name || null,
        rounds,
        total,
        diffValue: diff,
        diffLabel,
        categoryPosition: null as number | null,
      };
    });

    const grouped = new Map<string, any[]>();
    rows.forEach((row) => {
      const list = grouped.get(row.category) || [];
      list.push(row);
      grouped.set(row.category, list);
    });
    grouped.forEach((list) => {
      list
        .slice()
        .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999))
        .forEach((row, idx) => {
          row.categoryPosition = idx + 1;
        });
    });

    return rows;
  }, [classificationRoundCount, coursePar, finalClassification, pointsCategoryByUser, profileCategoryById, profileNameById, registrationByUserId]);

  const registrationClassificationRows = useMemo(() => {
    const rounds = Array.from({ length: classificationRoundCount }, () => 0);
    const rows = registrations.map((reg) => {
      const profileName = profileNameById[reg.user_id];
      return {
        user_id: reg.user_id,
        position: null as number | null,
        name: profileName || reg.name || t('events.playerFallback'),
        category: normalizeCategoryLabel(reg?.category || null),
        team_name: reg?.team_name || null,
        rounds,
        total: 0,
        diffLabel: '0',
        categoryPosition: null as number | null,
      };
    });

    const grouped = new Map<string, any[]>();
    rows.forEach((row) => {
      const list = grouped.get(row.category) || [];
      list.push(row);
      grouped.set(row.category, list);
    });
    grouped.forEach((list) => {
      list.forEach((row, idx) => {
        row.categoryPosition = idx + 1;
      });
    });

    return rows;
  }, [classificationRoundCount, profileNameById, registrations, t]);

  const handleExportResults = async (format: 'csv' | 'xlsx' | 'pdf', target: 'final' | 'points' | 'championship') => {
    if (!event) return;
    const finalRows = classificationRows.map((row) => ({
      position: row.position ?? null,
      name: row.name,
      category: row.category ?? null,
      rounds: row.rounds,
      total: row.total ?? null,
      diffLabel: row.diffLabel ?? null,
    }));
    const championship = championshipStandings
      ? {
          categories: Array.isArray(championshipStandings.categories) ? championshipStandings.categories : [],
          events: Array.isArray(championshipStandings.events) ? championshipStandings.events : [],
          byCategory: championshipStandings.byCategory || {},
        }
      : null;
    await exportResultsAll({
      eventName: event.name,
      eventDate: event.event_date,
      finalRows,
      pointsByCategory,
      championship,
      formats: [format],
      includeFinal: target === 'final',
      includePoints: target === 'points',
      includeChampionship: target === 'championship',
    });
  };

  const openExportModal = (target: 'final' | 'points' | 'championship') => {
    setExportTarget(target);
    setExportModalOpen(true);
  };

  const filteredClassificationRows = useMemo(() => {
    const byCategory = classificationCategoryFilter === ALL_CATEGORIES_VALUE
      ? classificationRows
      : classificationRows.filter((row) => row.category === classificationCategoryFilter);
    const q = classificationNameFilter.trim().toLowerCase();
    const byName = q
      ? byCategory.filter((row) => String(row.name || '').toLowerCase().includes(q))
      : byCategory;
    if (!sortMode) return byName;
    return byName.slice().sort((a, b) => {
      if (sortMode.type === 'round') {
        const aValue = a.rounds?.[sortMode.index];
        const bValue = b.rounds?.[sortMode.index];
        const aScore = aValue == null ? Number.POSITIVE_INFINITY : Number(aValue);
        const bScore = bValue == null ? Number.POSITIVE_INFINITY : Number(bValue);
        if (aScore !== bScore) return aScore - bScore;
        return (a.position ?? 9999) - (b.position ?? 9999);
      }

      if (sortMode.type === 'total') {
        const aScore = a.total == null ? Number.POSITIVE_INFINITY : Number(a.total);
        const bScore = b.total == null ? Number.POSITIVE_INFINITY : Number(b.total);
        if (aScore !== bScore) return aScore - bScore;
        return (a.position ?? 9999) - (b.position ?? 9999);
      }

      const aScore = a.diffValue == null ? Number.POSITIVE_INFINITY : Number(a.diffValue);
      const bScore = b.diffValue == null ? Number.POSITIVE_INFINITY : Number(b.diffValue);
      if (aScore !== bScore) return aScore - bScore;
      return (a.position ?? 9999) - (b.position ?? 9999);
    });
  }, [classificationCategoryFilter, classificationNameFilter, classificationRows, sortMode]);

  const filteredRegistrationRows = useMemo(() => {
    const byCategory = classificationCategoryFilter === ALL_CATEGORIES_VALUE
      ? registrationClassificationRows
      : registrationClassificationRows.filter((row) => row.category === classificationCategoryFilter);
    const q = classificationNameFilter.trim().toLowerCase();
    return q
      ? byCategory.filter((row) => String(row.name || '').toLowerCase().includes(q))
      : byCategory;
  }, [classificationCategoryFilter, classificationNameFilter, registrationClassificationRows]);

  const matchPlayChampion = useMemo(() => {
    if (!isMatchPlayEvent) return null;
    const top = finalClassification.find((row) => row.position === 1) || finalClassification[0];
    if (!top) return null;
    return (
      profileNameById[top.user_id] ||
      registrationByUserId.get(top.user_id)?.name ||
      t('events.championFallback')
    );
  }, [finalClassification, isMatchPlayEvent, profileNameById, registrationByUserId, t]);

  const fetchProfileCategory = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('category')
      .eq('id', userId)
      .single();
    return (data as { category?: string | null } | null)?.category ?? null;
  };

  const handleStartAttempt = async (targetUserId: string) => {
    if (!eventId) return;
    setAttemptMessage('');

    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
      body: JSON.stringify({ target_user_id: targetUserId }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      setAttemptMessage(String(json?.error || t('events.errorRegistering')));
      return;
    }

    setAttemptMessage(t('events.attemptStarted'));
    setEvent((prev) => {
      if (!prev) return prev;
      const nextConfig = { ...(prev.config || {}) } as any;
      nextConfig.stableford = {
        ...(nextConfig.stableford || {}),
        attemptsByUser: { ...attemptsByUser, [targetUserId]: json.used },
      };
      return { ...prev, config: nextConfig };
    });
  };

  const applyRegistration = async (categoryOverride?: string | null) => {
    if (!user || !eventId) return;
    const effectiveCategory = categoryOverride ?? (selectedCategory || null);
    if (currentRegistration) {
      setAlreadyOpen(true);
      return;
    }

    setMessage('');
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/registration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
      body: JSON.stringify({ category: effectiveCategory }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok || json?.ok === false) {
      setMessage(String(json?.error || t('events.errorRegistering')));
      return;
    }

    const nextIds = normalizeIdArray(json?.registered_player_ids);
    const nextWaitlist = normalizeIdArray(json?.waitlist_player_ids);
    const nextConfig = { ...((event?.config as any) || {}), waitlist_player_ids: nextWaitlist };

    setMessage(String(json?.message || t('events.registrationUpdated')));
    const profileColumns = teamCompetitionEnabled
      ? 'id, first_name, last_name, category, team'
      : 'id, first_name, last_name, category';
    const { data: profileData } = await supabase
      .from('profiles')
      .select(profileColumns)
      .in('id', uniq([...nextIds, ...nextWaitlist]));

    const teamNameByPlayerId = new Map<string, string>();
    if (teamCompetitionEnabled) {
      for (const row of (profileData as any[]) || []) {
        const playerId = String((row as any)?.id || '');
        const name = String((row as any)?.team || '').trim();
        if (playerId && name) teamNameByPlayerId.set(playerId, name);
      }
    }
    const safeProfiles = (profileData as any[]) || [];
    const nameMap = new Map(
      safeProfiles.map((row) => [row.id, [row.first_name, row.last_name].filter(Boolean).join(' ')])
    );
    const categoryMap = new Map(
      safeProfiles.map((row) => [row.id, row.category || null])
    );
    setProfileNameById(
      safeProfiles.reduce<Record<string, string>>((acc, row) => {
        const id = String(row?.id || '').trim();
        if (!id) return acc;
        acc[id] = [row?.first_name, row?.last_name].filter(Boolean).join(' ');
        return acc;
      }, {})
    );
    setProfileCategoryById(
      safeProfiles.reduce<Record<string, string | null>>((acc, row) => {
        const id = String(row?.id || '').trim();
        if (!id) return acc;
        acc[id] = row?.category || null;
        return acc;
      }, {})
    );

    const registeredList = nextIds.map((id) => ({
      user_id: id,
      name: nameMap.get(id) || t('events.playerFallback'),
      category: id === user.id && effectiveCategory ? effectiveCategory : categoryMap.get(id) || null,
      team_name: teamNameByPlayerId.get(id) || null,
      is_waitlist: false,
    }));

    const waitlistList = nextWaitlist
      .filter((id) => !nextIds.includes(id))
      .map((id) => ({
        user_id: id,
        name: nameMap.get(id) || t('events.playerFallback'),
        category: categoryMap.get(id) || null,
        team_name: teamNameByPlayerId.get(id) || null,
        is_waitlist: true,
      }));

    setRegistrations([...registeredList, ...waitlistList]);
    setEvent((prev) => (prev ? { ...prev, registered_player_ids: nextIds, config: nextConfig } : prev));
  };

  const handleRegister = async () => {
    if (!user || !eventId) return;

    setMessage('');
    const categoryFromProfile = await fetchProfileCategory(user.id);
    setProfileCategory(categoryFromProfile);

    if (selectedCategory && categoryFromProfile && selectedCategory !== categoryFromProfile) {
      setPendingCategory(selectedCategory);
      setConfirmMismatchOpen(true);
      return;
    }

    await applyRegistration(selectedCategory);
  };

  const handleRemove = async () => {
    if (!currentRegistration) return;
    setMessage('');

    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/registration`, {
      method: 'DELETE',
      headers: { ...(await getAuthHeaders()) },
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok || json?.ok === false) {
      setMessage(String(json?.error || t('events.errorCanceling')));
      return;
    }

    const nextIds = normalizeIdArray(json?.registered_player_ids);
    const nextWaitlist = normalizeIdArray(json?.waitlist_player_ids);
    const nextConfig = { ...((event?.config as any) || {}), waitlist_player_ids: nextWaitlist };

    setMessage(String(json?.message || t('events.registrationUpdated')));

    const allIds = uniq([...nextIds, ...nextWaitlist]);
    const profileColumns = teamCompetitionEnabled
      ? 'id, first_name, last_name, category, team'
      : 'id, first_name, last_name, category';
    const { data: profileData } = await supabase
      .from('profiles')
      .select(profileColumns)
      .in('id', allIds);

    const teamNameByPlayerId = new Map<string, string>();
    if (teamCompetitionEnabled) {
      for (const row of (profileData as any[]) || []) {
        const playerId = String((row as any)?.id || '');
        const name = String((row as any)?.team || '').trim();
        if (playerId && name) teamNameByPlayerId.set(playerId, name);
      }
    }
    const safeProfiles = (profileData as any[]) || [];
    const nameMap = new Map(
      safeProfiles.map((row) => [row.id, [row.first_name, row.last_name].filter(Boolean).join(' ')])
    );
    const categoryMap = new Map(safeProfiles.map((row) => [row.id, row.category || null]));
    setProfileNameById(
      safeProfiles.reduce<Record<string, string>>((acc, row) => {
        const id = String(row?.id || '').trim();
        if (!id) return acc;
        acc[id] = [row?.first_name, row?.last_name].filter(Boolean).join(' ');
        return acc;
      }, {})
    );
    setProfileCategoryById(
      safeProfiles.reduce<Record<string, string | null>>((acc, row) => {
        const id = String(row?.id || '').trim();
        if (!id) return acc;
        acc[id] = row?.category || null;
        return acc;
      }, {})
    );

    const registeredList = nextIds.map((id) => ({
      user_id: id,
      name: nameMap.get(id) || t('events.playerFallback'),
      category: categoryMap.get(id) || null,
      team_name: teamNameByPlayerId.get(id) || null,
      is_waitlist: false,
    }));
    const waitlistList = nextWaitlist
      .filter((id) => !nextIds.includes(id))
      .map((id) => ({
        user_id: id,
        name: nameMap.get(id) || t('events.playerFallback'),
        category: categoryMap.get(id) || null,
        team_name: teamNameByPlayerId.get(id) || null,
        is_waitlist: true,
      }));

    setRegistrations([...registeredList, ...waitlistList]);
    setEvent((prev) => (prev ? { ...prev, registered_player_ids: nextIds, config: nextConfig } : prev));
  };

  const classificationSection = (
    <div className="relative overflow-hidden rounded-3xl border-2 border-red-500/90 bg-gradient-to-br from-[#fff7e6] via-white to-[#fffaf0] p-4 sm:p-5 shadow-[0_30px_80px_rgba(220,38,38,0.25)] space-y-3">
      <div className="pointer-events-none absolute -top-20 -right-24 h-56 w-56 rounded-full bg-amber-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-20 h-56 w-56 rounded-full bg-orange-200/30 blur-3xl" />

      <div className="text-sm font-semibold text-gray-800">
        {classificationPhase === 'registration'
          ? 'Jugadores inscritos'
          : classificationPhase === 'live'
            ? 'Clasificacion en vivo'
            : 'Clasificacion final'}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div />
        {user && (finalClassification.length > 0 || registrations.length > 0) && (
          <div className="flex items-center gap-2">
            <input
              value={classificationNameFilter}
              onChange={(e) => setClassificationNameFilter(e.target.value)}
              placeholder="Buscar jugador"
              className="border border-white/70 bg-white/80 backdrop-blur rounded-xl px-2 py-1 text-xs shadow-sm"
            />
            <select
              value={classificationCategoryFilter}
              onChange={(e) => setClassificationCategoryFilter(e.target.value)}
              className="border border-white/70 bg-white/80 backdrop-blur rounded-xl px-2 py-1 text-xs shadow-sm"
            >
              {classificationCategoryOptions.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {classificationPhase === 'registration' ? (
        registrations.length === 0 ? (
          <div className="text-sm text-gray-500">Aún no hay jugadores inscritos.</div>
        ) : !user ? (
          <div className="text-sm text-gray-700">
            Inicia sesión para ver la clasificación.{' '}
            <Link href="/login" className="text-blue-600">Login</Link>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.18em] text-amber-700/70">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-10 text-center"></div>
                <div className="text-left">Nombre</div>
              </div>
              <div className="flex items-center gap-1">
                {Array.from({ length: classificationRoundCount }, (_, rIdx) => (
                  <div key={`reg-r-${rIdx}`} className="w-9 text-center text-gray-500">
                    R{rIdx + 1}
                  </div>
                ))}
                <div className="w-12 text-center text-gray-500">{t('events.strokesLabel')}</div>
                <div className="w-10 text-center text-gray-500">{t('events.scoreLabel')}</div>
              </div>
            </div>
            {filteredRegistrationRows.map((row: any) => {
              const meta = row.team_name
                ? t('events.teamLabel').replace('{name}', row.team_name)
                : null;
              return (
                <div
                  key={`reg-row-${row.user_id}`}
                  className="w-full text-left flex items-center justify-between gap-2 rounded-2xl border border-white/70 bg-white/85 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 text-center text-sm font-semibold text-gray-900">
                      {classificationCategoryFilter === ALL_CATEGORIES_VALUE
                        ? '-'
                        : (row.categoryPosition ?? '-')}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{row.name}</div>
                      {meta ? <div className="text-xs text-gray-500 truncate">{meta}</div> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {row.rounds.map((value: any, idx: number) => (
                      <div key={`reg-r-${row.user_id}-${idx}`} className="w-8 text-center text-xs text-gray-700">
                        {value}
                      </div>
                    ))}
                    <div className="w-10 text-center text-xs font-semibold text-gray-900">
                      {row.total}
                    </div>
                    <div className="w-9 text-center text-xs font-semibold text-gray-900">
                      {row.diffLabel}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : finalClassification.length === 0 ? (
        <div className="text-sm text-gray-500">
          {classificationPhase === 'live'
            ? 'Aún no hay clasificacion en vivo publicada.'
            : 'Aún no hay clasificación final publicada.'}
        </div>
      ) : !user ? (
        <div className="text-sm text-gray-700">
          Inicia sesión para ver la clasificación.{" "}
          <Link href="/login" className="text-blue-600">Login</Link>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.18em] text-amber-700/70">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-10 text-center"></div>
              <div className="text-left">Nombre</div>
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: classificationRoundCount }, (_, rIdx) => {
                const isSorted = sortMode?.type === 'round' && sortMode.index === rIdx;
                return (
                  <button
                    key={`rhd-${rIdx}`}
                    type="button"
                    onClick={() =>
                      setSortMode((prev) => (prev?.type === 'round' && prev.index === rIdx ? null : { type: 'round', index: rIdx }))
                    }
                    className={`w-9 text-center rounded-full border px-1 py-0.5 transition ${
                      isSorted
                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                        : 'border-transparent text-gray-500 hover:border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    R{rIdx + 1}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setSortMode((prev) => (prev?.type === 'total' ? null : { type: 'total' }))}
                className={`w-12 text-center rounded-full border px-1 py-0.5 transition ${
                  sortMode?.type === 'total'
                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-transparent text-gray-500 hover:border-gray-200 hover:bg-gray-50'
                }`}
              >
                {t('events.strokesLabel')}
              </button>
              <button
                type="button"
                onClick={() => setSortMode((prev) => (prev?.type === 'score' ? null : { type: 'score' }))}
                className={`w-10 text-center rounded-full border px-1 py-0.5 transition ${
                  sortMode?.type === 'score'
                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-transparent text-gray-500 hover:border-gray-200 hover:bg-gray-50'
                }`}
              >
                {t('events.scoreLabel')}
              </button>
            </div>
          </div>
          {filteredClassificationRows.map((row: any) => {
            const meta = row.team_name
              ? t('events.teamLabel').replace('{name}', row.team_name)
              : null;
            const categoryTheme = String(row.category || '').toLowerCase();
            const rowStyle = categoryTheme.includes('mascul')
              ? 'border-blue-300 bg-blue-100/90'
              : categoryTheme.includes('femen')
                ? 'border-rose-300 bg-rose-100/90'
                : categoryTheme.includes('junior')
                  ? 'border-amber-200 bg-amber-50/80'
                  : categoryTheme.includes('senior+')
                    ? 'border-yellow-300 bg-yellow-100/90'
                    : categoryTheme.includes('senior')
                      ? 'border-emerald-300 bg-emerald-100/80'
                      : 'border-white/70 bg-white/85';
            const isExpanded = expandedUserId === row.user_id;

            return (
              <div key={`fc-${row.user_id}-${row.position ?? 'x'}`} className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = isExpanded ? null : row.user_id;
                    setExpandedUserId(next);
                    setExpandedRound(0);
                  }}
                  className={`w-full text-left flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 transition hover:-translate-y-0.5 hover:shadow-lg ${rowStyle}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 text-center text-sm font-semibold text-gray-900">
                      {classificationCategoryFilter === ALL_CATEGORIES_VALUE
                        ? (row.position ?? '-')
                        : (row.categoryPosition ?? '-')}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{row.name}</div>
                      {meta ? <div className="text-xs text-gray-500 truncate">{meta}</div> : null}
                      {row.note ? <div className="text-xs text-gray-500 truncate">{row.note}</div> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {row.rounds.map((value: any, idx: number) => (
                      <div key={`r-${row.user_id}-${idx}`} className="w-8 text-center text-xs text-gray-700">
                        {value == null ? '-' : value}
                      </div>
                    ))}
                    <div className="w-10 text-center text-xs font-semibold text-gray-900">
                      {row.total == null ? '-' : row.total}
                    </div>
                    <div className="w-9 text-center text-xs font-semibold text-gray-900">
                      {row.diffLabel || '-'}
                    </div>
                  </div>
                </button>
                {isExpanded && (
                  <div className="rounded-2xl border border-gray-200 bg-white/80 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      {Array.from({ length: classificationRoundCount }, (_, idx) => (
                        <button
                          key={`tab-${row.user_id}-${idx}`}
                          type="button"
                          onClick={() => setExpandedRound(idx)}
                          className={`px-3 py-1 text-xs rounded-full border ${
                            expandedRound === idx
                              ? 'border-gray-900 bg-gray-900 text-white'
                              : 'border-gray-200 bg-white text-gray-700'
                          }`}
                        >
                          R{idx + 1}
                        </button>
                      ))}
                    </div>
                    <div className="text-sm text-gray-700">
                      {t('events.roundCardLabel').replace('{round}', String(expandedRound + 1))}{' '}
                      <span className="font-semibold text-gray-900">
                        {row.rounds[expandedRound] == null
                          ? t('events.noData')
                          : t('events.strokesValue').replace('{strokes}', String(row.rounds[expandedRound]))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {isEventClosed && finalClassification.length > 0 ? (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => openExportModal('final')}
                className="border border-pink-500 bg-pink-500 text-white rounded-xl px-3 py-1 text-xs shadow-sm"
              >
                  {t('events.export')}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-500">{t('common.loading')}</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-500">{t('events.notFound')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 pb-24">
      <header className="max-w-3xl mx-auto mb-4 flex items-center justify-between">
        <Link href="/events" className="premium-back-btn" aria-label={t('common.back')}>
          <ArrowLeft className="h-4 w-4" />
          <DoorOpen className="h-4 w-4" />
        </Link>
        <div className="text-sm text-gray-500">{t('events.detailTitle')}</div>
        <div className="w-12" />
      </header>

      <main className="max-w-3xl mx-auto space-y-4">
        <div className="bg-white/90 rounded-3xl border border-white/70 p-4 sm:p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)] space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-gray-900">{event.name}</div>
              <div className="text-xs text-gray-500">
                {event.event_date ? new Date(event.event_date).toLocaleDateString() : t('events.noDate')}
              </div>
            </div>
            <div className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
              {event.status || t('events.pendingStatus')}
            </div>
          </div>
          {!isMatchPlayEvent && classificationPhase === 'live' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setClassificationModalOpen(true)}
                className="rounded-xl px-3 py-2 text-xs font-semibold bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
              >
                {t('events.viewLiveClassification')}
              </button>
            </div>
          )}
        </div>

        {!isMatchPlayEvent && classificationPhase !== 'live' ? classificationSection : null}

        {(!isEventStarted || isAttemptBased) && !isEventClosed && (
          <div className="bg-white/90 rounded-3xl border-2 border-amber-300/90 p-4 sm:p-5 shadow-[0_24px_70px_rgba(217,119,6,0.22)] space-y-3">
            <div className="text-sm font-semibold">{t('events.registrationTitle')}</div>
            <div className="text-xs text-gray-500">
              {event.registration_start
                ? t('events.registrationFrom').replace('{date}', new Date(event.registration_start).toLocaleDateString())
                : t('events.registrationDateUndefined')}
              {event.registration_end
                ? ` · ${t('events.registrationTo').replace('{date}', new Date(event.registration_end).toLocaleDateString())}`
                : ''}
            </div>
            {message ? <div className="text-xs text-amber-700">{message}</div> : null}
            {attemptMessage ? <div className="text-xs text-emerald-700">{attemptMessage}</div> : null}
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
              >
                {(event.config?.prices || []).map((price: any) => (
                  <option key={`${price.category}-${price.price}`} value={price.category || ''}>
                    {price.category || t('events.categoryFallback')}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleRegister}
                disabled={!registrationOpen || !user}
                className="rounded-xl px-3 py-2 text-sm bg-blue-500 text-white shadow-sm shadow-blue-500/30 disabled:opacity-60"
              >
                {currentRegistration
                  ? t('events.registered')
                  : registrationOpen
                    ? t('events.registerCta')
                    : t('events.registrationClosed')}
              </button>
              {currentRegistration && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="rounded-xl px-3 py-2 text-sm bg-gray-100 text-gray-700"
                >
                  {t('common.cancel')}
                </button>
              )}
            </div>
            {isAttemptBased && currentRegistration && user && (
              <div className="text-xs text-gray-600">
                {t('events.attemptsLabel')}: {currentMaxAttempts != null ? `${currentAttemptsUsed}/${currentMaxAttempts}` : `${currentAttemptsUsed}`}
              </div>
            )}
          </div>
        )}

        {(startingConfig || flights.length > 0) && (
          <div className="bg-white/90 rounded-3xl border border-white/70 p-4 sm:p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)] space-y-3">
            <div className="text-sm font-semibold">{t('events.startInfoTitle')}</div>
            {startingConfig && (
              <div className="text-xs text-gray-600">
                {t('events.startModeLabel')}: {formatStartMode(startingConfig?.mode, t)}
                {String(startingConfig?.mode || '').toLowerCase() === 'hoyo_intervalo' && (
                  <> · {t('events.startHoleLabel')}: {startingConfig?.startHole ?? '-'} · {t('events.startTimeLabel')}: {startingConfig?.startTime || '-'} · {t('events.startIntervalLabel')}: {startingConfig?.intervalMinutes || '-'}m</>
                )}
              </div>
            )}

            {flights.length === 0 ? (
              <div className="text-xs text-gray-500">{t('events.flightsEmpty')}</div>
            ) : (
              <div className="space-y-3">
                {flights.map((flight: any, idx: number) => {
                  const flightPlayers = Array.isArray(flight?.playerIds) ? flight.playerIds : [];
                  return (
                    <div key={`flight-${flight.id || idx}`} className="rounded-2xl border border-gray-200 bg-white/80 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-gray-900">{flight?.name || `${t('events.flightLabel')} ${idx + 1}`}</div>
                        <div className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${flight?.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                          {flight?.active ? t('events.flightActive') : t('events.flightInactive')}
                        </div>
                      </div>
                      {flightPlayers.length === 0 ? (
                        <div className="text-[11px] text-gray-500">{t('events.flightsEmptyPlayers')}</div>
                      ) : (
                        <div className="space-y-2">
                          {flightPlayers.map((playerId: string) => {
                            const name = profileNameById[playerId] || registrationByUserId.get(playerId)?.name || t('events.playerFallback');
                            const used = Number(attemptsByUser?.[playerId] || 0);
                            const maxAttempts = getMaxAttemptsForUser(playerId);
                            const canStart = isAttemptBased && !!flight?.active && user && (isAdmin || user.id === playerId);
                            return (
                              <div key={`${flight.id}-${playerId}`} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-gray-900 truncate">{name}</div>
                                  {isAttemptBased && (isAdmin || user?.id === playerId) && (
                                    <div className="text-[11px] text-gray-500">
                                      {t('events.attemptsLabel')}: {maxAttempts != null ? `${used}/${maxAttempts}` : `${used}`}
                                    </div>
                                  )}
                                </div>
                                {canStart && (
                                  <button
                                    type="button"
                                    onClick={() => handleStartAttempt(playerId)}
                                    className="text-xs font-semibold rounded-xl px-3 py-1 bg-emerald-500 text-white shadow-sm"
                                  >
                                    {t('events.startCard')}
                                  </button>
                                )}
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
          </div>
        )}

        {championshipConfig?.enabled && (
          <div className="bg-white/90 rounded-3xl border border-white/70 p-4 sm:p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)] space-y-2">
            <div className="text-sm font-semibold">{t('events.championshipTitle')}</div>
            <div className="text-xs text-gray-500">
              {t('events.stageLabel')}: {championshipStage ?? '-'} · {t('events.modalityLabel')}: {championshipEventType ?? '-'}
            </div>
          </div>
        )}

        {championshipHub?.enabled && championshipStandings && (
          <div className="bg-white/90 rounded-3xl border-2 border-amber-300/80 p-4 sm:p-5 shadow-[0_24px_70px_rgba(217,119,6,0.18)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{t('events.championshipStandingsTitle')}</div>
                <div className="text-xs text-gray-500">
                  {t('events.updatedLabel')} {(championshipStandings as any)?.updatedAt ? new Date((championshipStandings as any).updatedAt).toLocaleString() : '-'}
                </div>
              </div>
              <select
                value={championshipCategoryFilter}
                onChange={(e) => setChampionshipCategoryFilter(e.target.value)}
                className="border border-gray-200 rounded-xl px-2 py-1 text-xs"
              >
                {championshipCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {championshipRows.length === 0 ? (
              <div className="text-sm text-gray-500">{t('events.noStandings')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[640px] w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-2 pr-2 w-10">#</th>
                      <th className="py-2 pr-2 min-w-[180px]">{t('events.playerHeader')}</th>
                      <th className="py-2 pr-2 w-16 text-right">{t('events.totalHeader')}</th>
                      {championshipEventsMeta.map((ev: any) => (
                        <th key={ev.eventId} className="py-2 pr-2 text-right min-w-[110px]">
                          <div className="text-[10px] text-gray-400 uppercase tracking-[0.12em]">
                            {ev.kind === 'doble' ? t('events.doubleLabel') : t('events.singleLabel')}
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
                  className="border border-pink-500 bg-pink-500 text-white rounded-xl px-3 py-1 text-xs"
                >
                  {t('events.export')}
                </button>
              </div>
            ) : null}

            {Array.isArray((championshipHub as any)?.eventHistory) && (championshipHub as any).eventHistory.length > 0 && (
              <div className="border border-gray-200 rounded-2xl p-3 bg-white/80 space-y-2">
                <div className="text-xs font-semibold text-gray-700">{t('events.eventHistoryTitle')}</div>
                <div className="space-y-1">
                  {(championshipHub as any).eventHistory.slice().reverse().map((entry: any, idx: number) => (
                    <div key={`eh-${idx}`} className="text-[11px] text-gray-600">
                      {entry.ts ? new Date(entry.ts).toLocaleString() : '-'} · {entry.action === 'remove' ? t('events.historyRemoved') : t('events.historyAdded')} · {entry.eventName || entry.eventId}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray((championshipHub as any)?.history) && (championshipHub as any).history.length > 0 && (
              <div className="border border-gray-200 rounded-2xl p-3 bg-white/80 space-y-2">
                <div className="text-xs font-semibold text-gray-700">{t('events.championshipHistoryTitle')}</div>
                <div className="space-y-1">
                  {(championshipHub as any).history.slice().reverse().map((entry: any, idx: number) => (
                    <div key={`ch-${idx}`} className="text-[11px] text-gray-600">
                      {entry.ts ? new Date(entry.ts).toLocaleString() : '-'} · {entry.totals?.players || 0} {t('events.playersLabel')} · {entry.totals?.categories || 0} {t('events.categoriesLabel')}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {Object.keys(pointsByCategory).length > 0 && (
          <div className="bg-white/90 rounded-3xl border-2 border-amber-300/90 p-4 sm:p-5 shadow-[0_24px_70px_rgba(217,119,6,0.22)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{t('events.pointsTitle')}</div>
                <div className="text-xs text-gray-500">{t('events.pointsUpdatedHint')}</div>
              </div>
              <select
                value={pointsCategoryFilter}
                onChange={(e) => setPointsCategoryFilter(e.target.value)}
                className="border border-gray-200 rounded-xl px-2 py-1 text-xs"
              >
                {availablePointCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {filteredPointsRows.length === 0 ? (
              <div className="text-sm text-gray-500">{t('events.noPointsData')}</div>
            ) : (
              <div className="space-y-2">
                {filteredPointsRows.map((row) => {
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
                      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${rowClass}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-6 text-center text-sm font-extrabold text-gray-900">{pos || '-'}</div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{row.name || row.user_id}</div>
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-emerald-700">{row.points} {t('events.pointsSuffix')}</div>
                    </div>
                  );
                })}
              </div>
            )}
            {isEventClosed && filteredPointsRows.length > 0 ? (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => openExportModal('points')}
                  className="border border-pink-500 bg-pink-500 text-white rounded-xl px-3 py-1 text-xs"
                >
                  {t('events.export')}
                </button>
              </div>
            ) : null}
          </div>
        )}

        {isMatchPlayEvent && (
          (() => {
            const fallbackRoundName = t('events.firstRound');
            const rounds = buildDisplayRounds((event.config as any)?.mainBracket?.rounds || [], bracketLabels, fallbackRoundName);
            const consolationRounds = buildDisplayRounds((event.config as any)?.consolationBracket?.rounds || [], bracketLabels, fallbackRoundName);
            const roundName = String(rounds[0]?.name || fallbackRoundName);
            if (!rounds.length) return null;

            const hasResults = rounds.some((round) =>
              (round.matches || []).some((m) => m?.result || m?.winner)
            );

            return (
              <div className="bg-white/90 rounded-3xl border border-white/70 p-4 sm:p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{t('events.formatMatchPlay')}</div>
                    <div className="text-xs text-gray-500">{roundName}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawOpen(true)}
                    className="rounded-xl px-3 py-2 text-sm bg-blue-500 text-white shadow-sm shadow-blue-500/30"
                  >
                    {t('events.viewBrackets')}
                  </button>
                </div>

                <MatchPlayDrawModal
                  open={drawOpen}
                  onClose={() => setDrawOpen(false)}
                  eventName={event.name}
                  rounds={rounds}
                  consolationRounds={consolationRounds}
                  championName={matchPlayChampion}
                  forceRevealAll={hasResults}
                  autoStart={false}
                />
              </div>
            );
          })()
        )}

      </main>

      {classificationModalOpen && classificationPhase === 'live' && !isMatchPlayEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-4xl max-h-[85vh] overflow-auto rounded-3xl bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-900">{t('events.liveClassificationTitle')}</div>
              <button
                type="button"
                onClick={() => setClassificationModalOpen(false)}
                className="text-xs text-gray-500"
              >
                {t('common.cancel')}
              </button>
            </div>
            {classificationSection}
          </div>
        </div>
      )}

      {exportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
            <div className="text-sm font-semibold text-gray-900">{t('events.exportResultsTitle')}</div>
            <div className="text-xs text-gray-500 mt-1">{t('events.exportResultsHint')}</div>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={async () => {
                  await handleExportResults('csv', exportTarget);
                  setExportModalOpen(false);
                }}
                className="rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-700"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleExportResults('xlsx', exportTarget);
                  setExportModalOpen(false);
                }}
                className="rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-700"
              >
                XLSX
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleExportResults('pdf', exportTarget);
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

      {alreadyOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-4 shadow-xl max-w-xs w-full space-y-3">
            <div className="text-sm font-semibold">{t('events.alreadyRegisteredTitle')}</div>
            <div className="text-xs text-gray-500">{t('events.alreadyRegisteredMessage')}</div>
            <button
              type="button"
              onClick={() => setAlreadyOpen(false)}
              className="w-full bg-blue-500 text-white rounded-xl py-2 text-sm"
            >
              {t('common.ok')}
            </button>
          </div>
        </div>
      )}

      {confirmMismatchOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-4 shadow-xl max-w-xs w-full space-y-3">
            <div className="text-sm font-semibold">{t('events.categoryMismatchTitle')}</div>
            <div className="text-xs text-gray-500">
              {t('events.categoryMismatchMessage')
                .replace('{profile}', String(profileCategory || t('events.noCategory')))
                .replace('{selected}', String(pendingCategory || ''))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmMismatchOpen(false);
                  setPendingCategory(null);
                }}
                className="w-full bg-gray-100 text-gray-700 rounded-xl py-2 text-sm"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const selected = pendingCategory;
                  setConfirmMismatchOpen(false);
                  setPendingCategory(null);
                  await applyRegistration(selected);
                }}
                className="w-full bg-blue-500 text-white rounded-xl py-2 text-sm"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
