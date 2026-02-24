'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, DoorOpen, PlusCircle, X } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import AssociationSelector from '@/components/AssociationSelector';
import { useLanguage } from '@/context/language-context';

type CourseLite = { id: string; name: string };

type EventFormat = 'stableford' | 'match';
type MatchPlayFormat = 'classic' | 'groups';
type GroupMode = 'single' | 'multi';
type StablefordMode = 'classic' | 'best_card' | 'best_hole';
type PairPlayMode = 'copa_canada' | 'fourball' | 'foursomes';
type PointsMode = 'manual' | 'percent';
type StartMode = 'tiro' | 'hoyo_intervalo' | 'libre';
type PriceRow = { category: string; price: string; currency: string };
type CompetitionType = 'individual' | 'parejas' | 'equipos';
type CompetitionDraft = {
  enabled: boolean;
  name: string;
  registrationStart: string;
  registrationEnd: string;
  courseId: string;
  status: string;
  statusMode: 'auto' | 'manual';
  maxPlayersRaw: string;
  priceRows: PriceRow[];
  stablefordMode: StablefordMode;
  pairsPlayMode: PairPlayMode;
  classicRoundsRaw: string;
  bestCardRoundsRaw: string;
  bestCardMaxAttemptsRaw: string;
  bestHoleRoundsRaw: string;
  pointsMode: PointsMode;
  pointsFirstRaw: string;
  pointsDecayRaw: string;
  pointsPodiumRaw: string;
  pointsTableRaw: string;
  stablefordAttemptsByUser: string;
};
type ChampHubEventDraft = {
  eventId: string;
  kind: 'simple' | 'doble';
  pointsMode: PointsMode;
  firstRaw: string;
  decayRaw: string;
  podiumRaw: string;
  tableRaw: string;
};
type EventLite = { id: string; name: string; event_date?: string | null; config?: any | null };

const CATEGORY_OPTIONS = ['General', 'Masculino', 'Femenino', 'Senior', 'Senior+', 'Junior'];
const COMPETITION_TYPES: CompetitionType[] = ['individual', 'parejas', 'equipos'];
const STABLEFORD_MODE_OPTIONS = [
  { value: 'classic', label: 'adminEventsCreate.stablefordClassicLabel' },
  { value: 'best_card', label: 'adminEventsCreate.stablefordBestCardLabel' },
  { value: 'best_hole', label: 'adminEventsCreate.stablefordBestHoleLabel' },
];

const PAIR_PLAY_MODE_OPTIONS: Array<{ value: PairPlayMode; label: string }> = [
  { value: 'copa_canada', label: 'adminEventsCreate.pairModeCanada' },
  { value: 'fourball', label: 'adminEventsCreate.pairModeFourball' },
  { value: 'foursomes', label: 'adminEventsCreate.pairModeFoursomes' },
];

const inputClassName =
  'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200';
const selectClassName =
  'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200';
const textareaClassName =
  'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200';
const STATUS_OPTIONS = [
  { value: 'inscripcion', label: 'Abierto' },
  { value: 'en_juego', label: 'En juego' },
  { value: 'cerrado', label: 'Cerrado' },
];

const TEMPLATES_STORAGE_KEY = 'adminEventTemplates';
const LEGACY_TEMPLATE_STORAGE_KEY = 'adminEventTemplate';

type EventTemplateItem = {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  updatedAt: string;
};

const buildDefaultPriceRows = (): PriceRow[] => ([
  { category: CATEGORY_OPTIONS[0], price: '', currency: 'EUR' },
]);

const buildDefaultChampHubEvent = (): ChampHubEventDraft => ({
  eventId: '',
  kind: 'simple',
  pointsMode: 'percent',
  firstRaw: '100',
  decayRaw: '8',
  podiumRaw: '3',
  tableRaw: '',
});

const getCompetitionLabel = (type: CompetitionType, t: (path: string) => string) => {
  switch (type) {
    case 'individual':
      return t('adminEventsCreate.modalityIndividual');
    case 'parejas':
      return t('adminEventsCreate.modalityPairs');
    case 'equipos':
      return t('adminEventsCreate.modalityTeams');
    default:
      return type;
  }
};

const buildCompetitionName = (eventName: string, type: CompetitionType, t: (path: string) => string) => {
  const base = eventName.trim();
  const label = getCompetitionLabel(type, t);
  return base ? `${base} - ${label}` : label;
};

const buildDefaultCompetitionDraft = (eventName: string, type: CompetitionType, t: (path: string) => string): CompetitionDraft => ({
  enabled: type === 'individual',
  name: buildCompetitionName(eventName, type, t),
  registrationStart: '',
  registrationEnd: '',
  courseId: '',
  status: 'inscripcion',
  statusMode: 'auto',
  maxPlayersRaw: '',
  priceRows: buildDefaultPriceRows(),
  stablefordMode: 'classic',
  pairsPlayMode: 'copa_canada',
  classicRoundsRaw: '1',
  bestCardRoundsRaw: '1',
  bestCardMaxAttemptsRaw: '',
  bestHoleRoundsRaw: '2',
  pointsMode: 'percent',
  pointsFirstRaw: '100',
  pointsDecayRaw: '8',
  pointsPodiumRaw: '3',
  pointsTableRaw: '',
  stablefordAttemptsByUser: '1',
});

const getCategoryLabel = (category: string, t: (path: string) => string) => {
  switch (category) {
    case 'General':
      return t('categories.general');
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

function isChampionshipEventRow(eventLike: any) {
  const config = eventLike?.config || {};
  return !!config?.isChampionship || !!config?.championshipHub?.enabled;
}

export default function AdminCrearEventoPage() {
  const { user, profile, loading, isAdmin, currentAssociationId } = useAuth();
  const { t } = useLanguage();

  const nameRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');
  const [registrationStart, setRegistrationStart] = useState('');
  const [registrationEnd, setRegistrationEnd] = useState('');
  const [description, setDescription] = useState('');
  const [courseId, setCourseId] = useState<string>('');
  const [status, setStatus] = useState<string>('inscripcion');
  const [maxPlayersRaw, setMaxPlayersRaw] = useState('');
  const [priceRows, setPriceRows] = useState<PriceRow[]>(() => buildDefaultPriceRows());

  const [format, setFormat] = useState<EventFormat>('stableford');
  const [teamCompetitionEnabled, setTeamCompetitionEnabled] = useState(false);
  const [teamBestPlayersRaw, setTeamBestPlayersRaw] = useState('');

  const [startMode, setStartMode] = useState<StartMode>('tiro');
  const [startHoleRaw, setStartHoleRaw] = useState('1');
  const [startTimeRaw, setStartTimeRaw] = useState('');
  const [startIntervalRaw, setStartIntervalRaw] = useState('');

  const [matchPlayFormat, setMatchPlayFormat] = useState<MatchPlayFormat>('classic');
  const [groupMode, setGroupMode] = useState<GroupMode>('single');
  const [groupHolesRaw, setGroupHolesRaw] = useState('18');
  const [groupMatchesPerDayRaw, setGroupMatchesPerDayRaw] = useState('');
  const [groupDatesRaw, setGroupDatesRaw] = useState('');
  const [groupCountRaw, setGroupCountRaw] = useState('');
  const [groupAdvanceRaw, setGroupAdvanceRaw] = useState('');
  const [groupHasConsolation, setGroupHasConsolation] = useState(false);

  const [competitionDrafts, setCompetitionDrafts] = useState<Record<CompetitionType, CompetitionDraft>>(() => ({
    individual: buildDefaultCompetitionDraft('', 'individual', t),
    parejas: buildDefaultCompetitionDraft('', 'parejas', t),
    equipos: buildDefaultCompetitionDraft('', 'equipos', t),
  }));

  const primaryCompetitionDraft = competitionDrafts.individual;
  const stablefordMode = primaryCompetitionDraft?.stablefordMode ?? 'classic';
  const classicRoundsRaw = primaryCompetitionDraft?.classicRoundsRaw ?? '1';
  const bestCardRoundsRaw = primaryCompetitionDraft?.bestCardRoundsRaw ?? '1';
  const bestCardMaxAttemptsRaw = primaryCompetitionDraft?.bestCardMaxAttemptsRaw ?? '';
  const bestHoleRoundsRaw = primaryCompetitionDraft?.bestHoleRoundsRaw ?? '2';
  const weeklyAllowExtraAttempts = false;
  const weeklyMaxAttemptsRaw = '';
  const pointsMode = primaryCompetitionDraft?.pointsMode ?? 'percent';
  const pointsFirstRaw = primaryCompetitionDraft?.pointsFirstRaw ?? '';
  const pointsDecayRaw = primaryCompetitionDraft?.pointsDecayRaw ?? '';
  const pointsPodiumRaw = primaryCompetitionDraft?.pointsPodiumRaw ?? '';
  const pointsTableRaw = primaryCompetitionDraft?.pointsTableRaw ?? '';

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
  const [associationEvents, setAssociationEvents] = useState<EventLite[]>([]);
  const [associationChampionships, setAssociationChampionships] = useState<EventLite[]>([]);
  const [selectedChampionshipId, setSelectedChampionshipId] = useState('');
  const [championshipMembershipIds, setChampionshipMembershipIds] = useState<string[]>([]);

  // Match Play config
  const [holesPerRoundRaw, setHolesPerRoundRaw] = useState('18');
  const [hasConsolation, setHasConsolation] = useState(false);
  const [consolationHolesPerRoundRaw, setConsolationHolesPerRoundRaw] = useState('');
  const [hasSeeds, setHasSeeds] = useState(false);
  const [seedCountRaw, setSeedCountRaw] = useState('');

  const [courses, setCourses] = useState<CourseLite[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState<EventTemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  useEffect(() => {
    document.body.classList.add('premium-admin-bg');
    return () => document.body.classList.remove('premium-admin-bg');
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => nameRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingCourses(true);
      try {
        if (!currentAssociationId) {
          if (active) setCourses([]);
          return;
        }
        const { data, error } = await supabase
          .from('courses')
          .select('id, name')
          .eq('association_id', currentAssociationId)
          .order('name', { ascending: true });
        if (!active) return;
        if (error) {
          setCourses([]);
          return;
        }
        setCourses(
          ((data as any[]) || []).map((r) => ({ id: String(r.id), name: String(r.name || '') }))
        );
      } finally {
        if (active) setLoadingCourses(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [currentAssociationId]);

  useEffect(() => {
    let active = true;
    const loadEvents = async () => {
      if (!currentAssociationId) {
        if (active) setAssociationEvents([]);
        if (active) setAssociationChampionships([]);
        return;
      }
      const { data, error } = await supabase
        .from('events')
        .select('id, name, event_date, config')
        .eq('association_id', currentAssociationId)
        .order('event_date', { ascending: false });
      if (!active) return;
      if (error) {
        setAssociationEvents([]);
        setAssociationChampionships([]);
        return;
      }
      const rows = ((data as any[]) || []).map((r) => ({
        id: String(r.id),
        name: String(r.name || ''),
        event_date: r.event_date ? String(r.event_date) : null,
        config: r.config || null,
      }));
      const championships = rows.filter((row) => isChampionshipEventRow(row));
      const tournaments = rows.filter((row) => !isChampionshipEventRow(row));
      setAssociationEvents(tournaments);
      setAssociationChampionships(championships);

      setChampionshipMembershipIds((prev) => prev.filter((id) => championships.some((row) => row.id === id)));
      setSelectedChampionshipId((prev) => (prev && championships.some((row) => row.id === prev) ? prev : ''));
    };
    void loadEvents();
    return () => {
      active = false;
    };
  }, [currentAssociationId]);

  useEffect(() => {
    const safeParse = (value: string | null) => {
      if (!value) return [] as EventTemplateItem[];
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? (parsed as EventTemplateItem[]) : [];
      } catch {
        return [] as EventTemplateItem[];
      }
    };

    const normalize = (items: EventTemplateItem[]) =>
      items
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          id: String(item.id || ''),
          name: String(item.name || ''),
          payload: (item.payload || {}) as Record<string, unknown>,
          updatedAt: String(item.updatedAt || ''),
        }))
        .filter((item) => item.id && item.name);

    let items = normalize(safeParse(localStorage.getItem(TEMPLATES_STORAGE_KEY)));
    if (!items.length) {
      const legacyRaw = localStorage.getItem(LEGACY_TEMPLATE_STORAGE_KEY);
      if (legacyRaw) {
        try {
          const legacyPayload = JSON.parse(legacyRaw) || {};
          items = [
            {
              id: String(Date.now()),
              name: t('adminEventsCreate.templateLegacyName'),
              payload: legacyPayload,
              updatedAt: new Date().toISOString(),
            },
          ];
          localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(items));
        } catch {
          items = [];
        }
      }
    }

    setTemplates(items);
    if (!selectedTemplateId && items.length) {
      setSelectedTemplateId(items[0].id);
    }
  }, [selectedTemplateId, t]);

  useEffect(() => {
    if (!selectedTemplateId) {
      if (templateName) setTemplateName('');
      return;
    }
    const selected = templates.find((item) => item.id === selectedTemplateId);
    if (selected && selected.name !== templateName) {
      setTemplateName(selected.name);
    }
  }, [selectedTemplateId, templateName, templates]);

  const updateCompetitionDraft = (type: CompetitionType, patch: Partial<CompetitionDraft>) => {
    setCompetitionDrafts((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        ...patch,
      },
    }));
  };

  const toggleCompetition = (type: CompetitionType) => {
    setCompetitionDrafts((prev) => {
      const current = prev[type];
      const nextEnabled = !current?.enabled;
      const nextName = current?.name?.trim()
        ? current.name
        : buildCompetitionName(name, type, t);
      return {
        ...prev,
        [type]: {
          ...current,
          enabled: nextEnabled,
          name: nextName,
        },
      };
    });
  };

  const canSave = useMemo(() => {
    if (!currentAssociationId) return false;
    if (!name.trim()) return false;
    if (!isIsoDate(eventDate)) return false;
    if (!courseId.trim()) return false;
    if (eventEndDate && !isIsoDate(eventEndDate)) return false;
    if (eventEndDate && isIsoDate(eventDate) && eventEndDate < eventDate) return false;
    if (registrationStart && !isIsoDate(registrationStart)) return false;
    if (registrationEnd && !isIsoDate(registrationEnd)) return false;
    if (registrationStart && registrationEnd && registrationEnd < registrationStart) return false;

    if (format !== 'stableford') {
      if (maxPlayersRaw.trim()) {
        const n = Number.parseInt(maxPlayersRaw, 10);
        if (!Number.isFinite(n) || n < 2 || n > 256) return false;
      }
    }

    if (teamCompetitionEnabled && teamBestPlayersRaw.trim()) {
      const n = Number.parseInt(teamBestPlayersRaw, 10);
      if (!Number.isFinite(n) || n < 1) return false;
    }

    if (startMode === 'hoyo_intervalo') {
      const hole = Number.parseInt(startHoleRaw, 10);
      const interval = Number.parseInt(startIntervalRaw, 10);
      if (!startTimeRaw.trim()) return false;
      if (!Number.isFinite(hole) || hole < 1 || hole > 36) return false;
      if (!Number.isFinite(interval) || interval < 1) return false;
    }

    if (format === 'stableford') {
      const enabledCompetitions = COMPETITION_TYPES.filter((type) => competitionDrafts[type]?.enabled);
      if (enabledCompetitions.length === 0) return false;

      for (const type of enabledCompetitions) {
        const draft = competitionDrafts[type];
        if (!draft) return false;

        if (draft.maxPlayersRaw.trim()) {
          const n = Number.parseInt(draft.maxPlayersRaw, 10);
          if (!Number.isFinite(n) || n < 1 || n > 256) return false;
        }

        if (draft.stablefordMode === 'classic') {
          const rounds = Number.parseInt(draft.classicRoundsRaw, 10);
          if (!Number.isFinite(rounds) || rounds < 1 || rounds > 4) return false;

          if (draft.pointsMode === 'manual') {
            const table = parseIntList(draft.pointsTableRaw);
            if (table.length === 0) return false;
          } else {
            const first = Number.parseInt(draft.pointsFirstRaw, 10);
            const decay = Number.parseFloat(draft.pointsDecayRaw);
            const podium = Number.parseInt(draft.pointsPodiumRaw, 10);
            if (!Number.isFinite(first) || first < 1) return false;
            if (!Number.isFinite(decay) || decay < 0 || decay > 100) return false;
            if (!Number.isFinite(podium) || podium < 1) return false;
          }
        } else if (draft.stablefordMode === 'best_card') {
          const rounds = Number.parseInt(draft.bestCardRoundsRaw, 10);
          if (!Number.isFinite(rounds) || rounds < 1) return false;
          if (draft.bestCardMaxAttemptsRaw.trim()) {
            const maxAttempts = Number.parseInt(draft.bestCardMaxAttemptsRaw, 10);
            if (!Number.isFinite(maxAttempts) || maxAttempts < 1) return false;
          }
        } else if (draft.stablefordMode === 'best_hole') {
          const rounds = Number.parseInt(draft.bestHoleRoundsRaw, 10);
          if (!Number.isFinite(rounds) || rounds < 2) return false;
        }
      }

      if (champEnabled) {
        if (!championshipMembershipIds.length) return false;
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

    if (format === 'match') {
      if (matchPlayFormat === 'classic') {
        const holes = parseIntList(holesPerRoundRaw);
        if (holes.length === 0) return false;
        if (holes.some((n) => n < 1 || n > 36)) return false;
        if (hasConsolation) {
          const ch = parseIntList(consolationHolesPerRoundRaw);
          if (ch.length === 0) return false;
          if (ch.some((n) => n < 1 || n > 36)) return false;
        }

        if (hasSeeds) {
          const sc = Number.parseInt(seedCountRaw, 10);
          if (!Number.isFinite(sc) || sc < 2) return false;
          const allowed = [2, 4, 8, 16, 32, 64];
          if (!allowed.includes(sc)) return false;
          if (maxPlayersRaw.trim()) {
            const mp = Number.parseInt(maxPlayersRaw, 10);
            if (Number.isFinite(mp) && sc > mp) return false;
          }
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
  }, [currentAssociationId, name, eventDate, eventEndDate, registrationStart, registrationEnd, courseId, maxPlayersRaw, teamCompetitionEnabled, teamBestPlayersRaw, startMode, startHoleRaw, startTimeRaw, startIntervalRaw, format, matchPlayFormat, holesPerRoundRaw, hasConsolation, consolationHolesPerRoundRaw, hasSeeds, seedCountRaw, groupMode, groupHolesRaw, groupMatchesPerDayRaw, groupDatesRaw, groupCountRaw, groupAdvanceRaw, competitionDrafts, champEnabled, championshipMembershipIds, champHubEnabled, champHubCategories, champHubEvents]);

  const validation = useMemo(() => {
    const endDateInvalid = !!eventEndDate && (!isIsoDate(eventEndDate) || (isIsoDate(eventDate) && eventEndDate < eventDate));
    const registrationStartInvalid = !!registrationStart && !isIsoDate(registrationStart);
    const registrationEndInvalid = !!registrationEnd && (!isIsoDate(registrationEnd) || (!!registrationStart && registrationEnd < registrationStart));

    let maxPlayersInvalid = false;
    if (format !== 'stableford' && maxPlayersRaw.trim()) {
      const n = Number.parseInt(maxPlayersRaw, 10);
      maxPlayersInvalid = !Number.isFinite(n) || n < 2 || n > 256;
    }

    let teamBestPlayersInvalid = false;
    if (teamCompetitionEnabled && teamBestPlayersRaw.trim()) {
      const n = Number.parseInt(teamBestPlayersRaw, 10);
      teamBestPlayersInvalid = !Number.isFinite(n) || n < 1;
    }

    let startModeInvalid = false;
    if (startMode === 'hoyo_intervalo') {
      const hole = Number.parseInt(startHoleRaw, 10);
      const interval = Number.parseInt(startIntervalRaw, 10);
      startModeInvalid = !startTimeRaw.trim() || !Number.isFinite(hole) || hole < 1 || hole > 36 || !Number.isFinite(interval) || interval < 1;
    }

    const enabledCompetitions = format === 'stableford'
      ? COMPETITION_TYPES.filter((type) => competitionDrafts[type]?.enabled)
      : [];
    const competitionsMissing = format === 'stableford' && enabledCompetitions.length === 0;
    const competitionNameInvalid = false;
    const competitionRegistrationInvalid = false;
    const competitionCourseInvalid = false;
    const competitionMaxPlayersInvalid = format === 'stableford'
      && enabledCompetitions.some((type) => {
        const draft = competitionDrafts[type];
        if (!draft || !draft.maxPlayersRaw.trim()) return false;
        const n = Number.parseInt(draft.maxPlayersRaw, 10);
        return !Number.isFinite(n) || n < 1 || n > 256;
      });
    const stablefordClassicRoundsInvalid = format === 'stableford'
      && enabledCompetitions.some((type) => {
        const draft = competitionDrafts[type];
        if (!draft || draft.stablefordMode !== 'classic') return false;
        const rounds = Number.parseInt(draft.classicRoundsRaw, 10);
        return !Number.isFinite(rounds) || rounds < 1 || rounds > 4;
      });
    const stablefordPointsInvalid = format === 'stableford'
      && enabledCompetitions.some((type) => {
        const draft = competitionDrafts[type];
        if (!draft || draft.stablefordMode !== 'classic') return false;
        if (draft.pointsMode === 'manual') return parseIntList(draft.pointsTableRaw).length === 0;
        const first = Number.parseInt(draft.pointsFirstRaw, 10);
        const decay = Number.parseFloat(draft.pointsDecayRaw);
        const podium = Number.parseInt(draft.pointsPodiumRaw, 10);
        return !Number.isFinite(first) || first < 1
          || !Number.isFinite(decay) || decay < 0 || decay > 100
          || !Number.isFinite(podium) || podium < 1;
      });
    const stablefordBestCardInvalid = format === 'stableford'
      && enabledCompetitions.some((type) => {
        const draft = competitionDrafts[type];
        if (!draft || draft.stablefordMode !== 'best_card') return false;
        const rounds = Number.parseInt(draft.bestCardRoundsRaw, 10);
        if (!Number.isFinite(rounds) || rounds < 1) return true;
        if (!draft.bestCardMaxAttemptsRaw.trim()) return false;
        const maxAttempts = Number.parseInt(draft.bestCardMaxAttemptsRaw, 10);
        return !Number.isFinite(maxAttempts) || maxAttempts < 1;
      });
    const stablefordBestHoleInvalid = format === 'stableford'
      && enabledCompetitions.some((type) => {
        const draft = competitionDrafts[type];
        if (!draft || draft.stablefordMode !== 'best_hole') return false;
        const rounds = Number.parseInt(draft.bestHoleRoundsRaw, 10);
        return !Number.isFinite(rounds) || rounds < 2;
      });

    return {
      nameMissing: !name.trim(),
      courseMissing: !courseId.trim(),
      eventDateInvalid: !isIsoDate(eventDate),
      endDateInvalid,
      registrationStartInvalid,
      registrationEndInvalid,
      maxPlayersInvalid,
      teamBestPlayersInvalid,
      startModeInvalid,
      competitionsMissing,
      competitionNameInvalid,
      competitionRegistrationInvalid,
      competitionCourseInvalid,
      competitionMaxPlayersInvalid,
      stablefordClassicRoundsInvalid,
      stablefordPointsInvalid,
      stablefordBestCardInvalid,
      stablefordBestHoleInvalid,
    };
  }, [competitionDrafts, courseId, eventDate, eventEndDate, format, maxPlayersRaw, name, registrationEnd, registrationStart, startHoleRaw, startIntervalRaw, startMode, startTimeRaw, teamBestPlayersRaw, teamCompetitionEnabled]);

  const withError = (base: string, hasError: boolean) =>
    hasError ? `${base} border-red-400 focus:ring-red-200` : base;

  const saveTemplate = () => {
    const trimmedTemplateName = templateName.trim();
    if (!trimmedTemplateName) {
      setErrorMsg(t('adminEventsCreate.templateNameMissing'));
      setOkMsg(null);
      return;
    }

    const payload = {
      format,
      status,
      registrationStart,
      registrationEnd,
      description,
      courseId,
      maxPlayersRaw,
      priceRows,
      teamCompetitionEnabled,
      teamBestPlayersRaw,
      startMode,
      startHoleRaw,
      startTimeRaw,
      startIntervalRaw,
      matchPlayFormat,
      groupMode,
      groupHolesRaw,
      groupMatchesPerDayRaw,
      groupDatesRaw,
      groupCountRaw,
      groupAdvanceRaw,
      groupHasConsolation,
      holesPerRoundRaw,
      hasConsolation,
      consolationHolesPerRoundRaw,
      hasSeeds,
      seedCountRaw,
      competitionDrafts,
      champEnabled,
      championshipMembershipIds,
      champTotalRaw,
      champSimpleRaw,
      champDoubleRaw,
      champBestSimpleRaw,
      champBestDoubleRaw,
      champCategories,
      champHubEnabled,
      champHubCategories,
      champHubEvents,
    };

    const now = new Date().toISOString();
    const nextTemplates = templates.slice();
    const existingIndex = nextTemplates.findIndex(
      (item) => item.name.toLowerCase() === trimmedTemplateName.toLowerCase()
    );
    if (existingIndex >= 0) {
      nextTemplates[existingIndex] = {
        ...nextTemplates[existingIndex],
        name: trimmedTemplateName,
        payload,
        updatedAt: now,
      };
      setSelectedTemplateId(nextTemplates[existingIndex].id);
    } else {
      const newItem = {
        id: String(Date.now()),
        name: trimmedTemplateName,
        payload,
        updatedAt: now,
      };
      nextTemplates.unshift(newItem);
      setSelectedTemplateId(newItem.id);
    }

    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(nextTemplates));
    setTemplates(nextTemplates);
    setOkMsg(t(existingIndex >= 0
      ? 'adminEventsCreate.templateUpdated'
      : 'adminEventsCreate.templateSaved'));
    setErrorMsg(null);
  };

  const loadTemplate = () => {
    if (!selectedTemplateId) {
      setErrorMsg(t('adminEventsCreate.templateSelectMissing'));
      setOkMsg(null);
      return;
    }

    try {
      const template = templates.find((item) => item.id === selectedTemplateId);
      if (!template) {
        setErrorMsg(t('adminEventsCreate.templateMissing'));
        setOkMsg(null);
        return;
      }

      const data = (template.payload || {}) as Record<string, any>;
      setFormat(data.format || 'stableford');
      setStatus(data.status || 'inscripcion');
      setRegistrationStart(data.registrationStart || '');
      setRegistrationEnd(data.registrationEnd || '');
      setDescription(data.description || '');
      setCourseId(data.courseId || '');
      setMaxPlayersRaw(data.maxPlayersRaw || '');
      setPriceRows(Array.isArray(data.priceRows) && data.priceRows.length ? data.priceRows : buildDefaultPriceRows());
      setTeamCompetitionEnabled(!!data.teamCompetitionEnabled);
      setTeamBestPlayersRaw(data.teamBestPlayersRaw || '');
      setStartMode(data.startMode || 'tiro');
      setStartHoleRaw(data.startHoleRaw || '1');
      setStartTimeRaw(data.startTimeRaw || '');
      setStartIntervalRaw(data.startIntervalRaw || '');
      setMatchPlayFormat(data.matchPlayFormat || 'classic');
      setGroupMode(data.groupMode || 'single');
      setGroupHolesRaw(data.groupHolesRaw || '18');
      setGroupMatchesPerDayRaw(data.groupMatchesPerDayRaw || '');
      setGroupDatesRaw(data.groupDatesRaw || '');
      setGroupCountRaw(data.groupCountRaw || '');
      setGroupAdvanceRaw(data.groupAdvanceRaw || '');
      setGroupHasConsolation(!!data.groupHasConsolation);
      setHolesPerRoundRaw(data.holesPerRoundRaw || '18');
      setHasConsolation(!!data.hasConsolation);
      setConsolationHolesPerRoundRaw(data.consolationHolesPerRoundRaw || '');
      setHasSeeds(!!data.hasSeeds);
      setSeedCountRaw(data.seedCountRaw || '');
      const draftPayload = data.competitionDrafts && typeof data.competitionDrafts === 'object'
        ? data.competitionDrafts
        : null;
      const nextDrafts = { ...competitionDrafts };
      COMPETITION_TYPES.forEach((type) => {
        const base = buildDefaultCompetitionDraft('', type, t);
        const from = draftPayload?.[type] || null;
        const draft = from && typeof from === 'object' ? from : {};
        const priceRows = Array.isArray(draft.priceRows) && draft.priceRows.length
          ? draft.priceRows
          : buildDefaultPriceRows();
        nextDrafts[type] = {
          ...base,
          ...draft,
          enabled: !!draft.enabled,
          name: String(draft.name || base.name),
          registrationStart: String(draft.registrationStart || ''),
          registrationEnd: String(draft.registrationEnd || ''),
          courseId: String(draft.courseId || ''),
          status: String(draft.status || base.status),
          statusMode: draft.statusMode === 'manual' ? 'manual' : 'auto',
          maxPlayersRaw: String(draft.maxPlayersRaw || ''),
          priceRows,
          stablefordMode: draft.stablefordMode === 'best_card' || draft.stablefordMode === 'best_hole'
            ? draft.stablefordMode
            : 'classic',
          classicRoundsRaw: String(draft.classicRoundsRaw || '1'),
          bestCardRoundsRaw: String(draft.bestCardRoundsRaw || '1'),
          bestCardMaxAttemptsRaw: String(draft.bestCardMaxAttemptsRaw || ''),
          bestHoleRoundsRaw: String(draft.bestHoleRoundsRaw || '2'),
          pointsMode: draft.pointsMode === 'manual' ? 'manual' : 'percent',
          pointsFirstRaw: String(draft.pointsFirstRaw || '100'),
          pointsDecayRaw: String(draft.pointsDecayRaw || '8'),
          pointsPodiumRaw: String(draft.pointsPodiumRaw || '3'),
          pointsTableRaw: String(draft.pointsTableRaw || ''),
          stablefordAttemptsByUser: String(draft.stablefordAttemptsByUser || '1'),
        };
      });
      setCompetitionDrafts(nextDrafts);
      setChampEnabled(!!data.champEnabled);
      setChampionshipMembershipIds(Array.isArray(data.championshipMembershipIds) ? data.championshipMembershipIds.map((x: any) => String(x || '')).filter(Boolean) : []);
      setChampTotalRaw(data.champTotalRaw || '');
      setChampSimpleRaw(data.champSimpleRaw || '');
      setChampDoubleRaw(data.champDoubleRaw || '');
      setChampBestSimpleRaw(data.champBestSimpleRaw || '');
      setChampBestDoubleRaw(data.champBestDoubleRaw || '');
      setChampCategories(Array.isArray(data.champCategories) && data.champCategories.length ? data.champCategories : CATEGORY_OPTIONS);
      setChampHubEnabled(!!data.champHubEnabled);
      setChampHubCategories(Array.isArray(data.champHubCategories) && data.champHubCategories.length ? data.champHubCategories : CATEGORY_OPTIONS);
      setChampHubEvents(Array.isArray(data.champHubEvents) ? data.champHubEvents : []);
      // Always clear name and date fields when loading a template.
      setName('');
      setEventDate('');
      setEventEndDate('');
      setOkMsg(t('adminEventsCreate.templateLoaded'));
      setErrorMsg(null);
    } catch {
      setErrorMsg(t('adminEventsCreate.templateMissing'));
      setOkMsg(null);
    }
  };

  const renameTemplate = () => {
    if (!selectedTemplateId) {
      setErrorMsg(t('adminEventsCreate.templateSelectMissing'));
      setOkMsg(null);
      return;
    }

    const trimmedName = templateName.trim();
    if (!trimmedName) {
      setErrorMsg(t('adminEventsCreate.templateNameMissing'));
      setOkMsg(null);
      return;
    }

    const index = templates.findIndex((item) => item.id === selectedTemplateId);
    if (index < 0) {
      setErrorMsg(t('adminEventsCreate.templateMissing'));
      setOkMsg(null);
      return;
    }

    const nameTaken = templates.some(
      (item) => item.id !== selectedTemplateId && item.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (nameTaken) {
      setErrorMsg(t('adminEventsCreate.templateNameExists'));
      setOkMsg(null);
      return;
    }

    const nextTemplates = templates.slice();
    nextTemplates[index] = {
      ...nextTemplates[index],
      name: trimmedName,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(nextTemplates));
    setTemplates(nextTemplates);
    setOkMsg(t('adminEventsCreate.templateRenamed'));
    setErrorMsg(null);
  };

  const deleteTemplate = () => {
    if (!selectedTemplateId) {
      setErrorMsg(t('adminEventsCreate.templateSelectMissing'));
      setOkMsg(null);
      return;
    }

    const selected = templates.find((item) => item.id === selectedTemplateId);
    if (!selected) {
      setErrorMsg(t('adminEventsCreate.templateMissing'));
      setOkMsg(null);
      return;
    }

    if (!window.confirm(t('adminEventsCreate.templateDeleteConfirm').replace('{name}', selected.name))) {
      return;
    }

    const nextTemplates = templates.filter((item) => item.id !== selectedTemplateId);
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(nextTemplates));
    setTemplates(nextTemplates);
    setSelectedTemplateId(nextTemplates[0]?.id || '');
    setOkMsg(t('adminEventsCreate.templateDeleted'));
    setErrorMsg(null);
  };

  const save = async () => {
    setErrorMsg(null);
    setOkMsg(null);
    setShowSuccessToast(false);
    setShowValidation(true);

    if (!currentAssociationId) {
      setErrorMsg(t('adminEventsCreate.errors.selectAssociation'));
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg(t('adminEventsCreate.errors.nameRequired'));
      return;
    }
    if (!courseId.trim()) {
      setErrorMsg(t('adminEventsCreate.errors.courseRequired'));
      return;
    }
    if (!isIsoDate(eventDate)) {
      setErrorMsg(t('adminEventsCreate.errors.eventDateInvalid'));
      return;
    }
    if (eventEndDate && !isIsoDate(eventEndDate)) {
      setErrorMsg(t('adminEventsCreate.errors.eventEndInvalid'));
      return;
    }
    if (eventEndDate && eventEndDate < eventDate) {
      setErrorMsg(t('adminEventsCreate.errors.eventEndBeforeStart'));
      return;
    }

    if (registrationStart && !isIsoDate(registrationStart)) {
      setErrorMsg(t('adminEventsCreate.errors.registrationStartInvalid'));
      return;
    }
    if (registrationEnd && !isIsoDate(registrationEnd)) {
      setErrorMsg(t('adminEventsCreate.errors.registrationEndInvalid'));
      return;
    }
    if (registrationStart && registrationEnd && registrationEnd < registrationStart) {
      setErrorMsg(t('adminEventsCreate.errors.registrationEndInvalid'));
      return;
    }

    if (startMode === 'hoyo_intervalo') {
      const hole = Number.parseInt(startHoleRaw, 10);
      const interval = Number.parseInt(startIntervalRaw, 10);
      if (!startTimeRaw.trim() || !Number.isFinite(hole) || hole < 1 || hole > 36 || !Number.isFinite(interval) || interval < 1) {
        setErrorMsg(t('adminEventsCreate.errors.startModeInvalid'));
        return;
      }
    }

    let maxPlayers: number | null = null;
    if (format !== 'stableford' && maxPlayersRaw.trim()) {
      const n = Number.parseInt(maxPlayersRaw, 10);
      if (!Number.isFinite(n) || n < 2 || n > 256) {
        setErrorMsg(t('adminEventsCreate.errors.maxPlayersInvalid'));
        return;
      }
      maxPlayers = n;
    }

    const config: any = {};
    if (format !== 'stableford' && maxPlayers) config.maxPlayers = maxPlayers;
    if (eventEndDate) config.event_end_date = eventEndDate;
    config.teamCompetitionEnabled = !!teamCompetitionEnabled;
    if (teamCompetitionEnabled && teamBestPlayersRaw.trim()) {
      const n = Number.parseInt(teamBestPlayersRaw, 10);
      config.teamBestPlayers = Number.isFinite(n) && n > 0 ? n : null;
    }

    if (startMode === 'hoyo_intervalo') {
      config.starting = {
        mode: 'hoyo_intervalo',
        startHole: Number.parseInt(startHoleRaw, 10),
        startTime: startTimeRaw.trim(),
        intervalMinutes: Number.parseInt(startIntervalRaw, 10),
      };
    } else {
      config.starting = { mode: startMode };
    }

    const normalizedPrices = priceRows
      .map((row) => ({
        category: String(row.category || '').trim(),
        price: Number.parseFloat(String(row.price || '')),
        currency: String(row.currency || '').trim() || 'EUR',
      }))
      .filter((row) => row.category && Number.isFinite(row.price));
    if (format !== 'stableford' && normalizedPrices.length) config.prices = normalizedPrices;

    let competitionMode: string | null = null;
    let competitionsPayload: any[] = [];
    let registrationStartValue = registrationStart;
    let registrationEndValue = registrationEnd;
    let courseIdValue = courseId;
    let statusValue = status;

    if (format === 'stableford') {
      competitionMode = 'stableford';
      const enabledCompetitions = COMPETITION_TYPES.filter((type) => competitionDrafts[type]?.enabled);
      if (enabledCompetitions.length === 0) {
        setErrorMsg(t('adminEventsCreate.errors.selectCompetition'));
        return;
      }

      competitionsPayload = enabledCompetitions.map((type) => {
        const draft = competitionDrafts[type];
        const normalizedPrices = (draft.priceRows || [])
          .map((row) => ({
            category: String(row.category || '').trim(),
            price: Number.parseFloat(String(row.price || '')),
            currency: String(row.currency || '').trim() || 'EUR',
          }))
          .filter((row) => row.category && Number.isFinite(row.price));

        const classicRounds = Number.parseInt(draft.classicRoundsRaw, 10);
        const bestCardRounds = Number.parseInt(draft.bestCardRoundsRaw, 10);
        const bestHoleRounds = Number.parseInt(draft.bestHoleRoundsRaw, 10);
        const bestCardMaxAttempts = draft.bestCardMaxAttemptsRaw.trim()
          ? Number.parseInt(draft.bestCardMaxAttemptsRaw, 10)
          : null;
        return {
          type,
          name: buildCompetitionName(trimmedName, type, t),
          registration_start: registrationStart || null,
          registration_end: registrationEnd || null,
          course_id: courseId.trim() || null,
          status: draft.status || 'inscripcion',
          status_mode: draft.statusMode === 'manual' ? 'manual' : 'auto',
          max_players: draft.maxPlayersRaw.trim()
            ? Number.parseInt(draft.maxPlayersRaw, 10)
            : null,
          config: {
            prices: normalizedPrices,
            stableford: {
              mode: draft.stablefordMode,
              pairsMode: draft.pairsPlayMode,
              classicRounds: Number.isFinite(classicRounds) ? classicRounds : null,
              bestCardRounds: Number.isFinite(bestCardRounds) ? bestCardRounds : null,
              bestCardMaxAttempts: Number.isFinite(bestCardMaxAttempts) ? bestCardMaxAttempts : null,
              bestHoleRounds: Number.isFinite(bestHoleRounds) ? bestHoleRounds : null,
              attemptsByUser: {},
              classicPoints: {
                mode: draft.pointsMode,
                first: Number.parseInt(draft.pointsFirstRaw, 10) || 0,
                decayPercent: Number.parseFloat(draft.pointsDecayRaw) || 0,
                podiumCount: Number.parseInt(draft.pointsPodiumRaw, 10) || 0,
                table: draft.pointsMode === 'manual' ? parseIntList(draft.pointsTableRaw) : [],
              },
            },
          },
        };
      });

      const primaryType = enabledCompetitions.includes('individual')
        ? 'individual'
        : enabledCompetitions[0];
      const primary = competitionsPayload.find((comp) => comp.type === primaryType) || competitionsPayload[0];

      if (primary) {
        statusValue = primary.status || 'inscripcion';

        if (primary.max_players) config.maxPlayers = primary.max_players;
        if (primary.config?.prices?.length) config.prices = primary.config.prices;
        if (primary.config?.stableford) config.stableford = primary.config.stableford;
        config.primaryCompetitionType = primaryType;
      }

      if (champEnabled && championshipMembershipIds.length > 0) {
        config.championshipMemberships = championshipMembershipIds.map((id) => {
          const found = associationChampionships.find((item) => item.id === id);
          return {
            id,
            name: found?.name || id,
          };
        });
      }

      config.championship = { enabled: false };

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
    } else {
      competitionMode = 'match-play';
      config.competitionMode = 'match-play';
      config.scoringSystem = 'match-play';
      config.matchPlayFormat = matchPlayFormat;

      if (matchPlayFormat === 'classic') {
        const holesPerRound = parseIntList(holesPerRoundRaw);
        const consolationHolesPerRound = parseIntList(consolationHolesPerRoundRaw);
        config.holesPerRound = holesPerRound;
        config.hasConsolation = !!hasConsolation;
        if (hasConsolation) config.consolationHolesPerRound = consolationHolesPerRound;

        config.hasSeeds = !!hasSeeds;
        if (hasSeeds) {
          const sc = Number.parseInt(seedCountRaw, 10);
          const allowed = [2, 4, 8, 16, 32, 64];
          if (!Number.isFinite(sc) || !allowed.includes(sc)) {
            setErrorMsg(t('adminEventsCreate.errors.seedCountInvalid'));
            return;
          }
          if (maxPlayers && sc > maxPlayers) {
            setErrorMsg(t('adminEventsCreate.errors.seedCountExceedsMax'));
            return;
          }
          config.seedCount = sc;
        }
      } else {
        const holes = Number.parseInt(groupHolesRaw, 10);
        config.groupMode = groupMode;
        config.groupHoles = Number.isFinite(holes) ? holes : null;
        config.groupMatchesPerDay = groupMatchesPerDayRaw.trim()
          ? Number.parseInt(groupMatchesPerDayRaw, 10)
          : null;
        config.groupDates = groupDatesRaw.trim() ? parseDateList(groupDatesRaw) : [];
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

    setSaving(true);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          association_id: currentAssociationId,
          name: trimmedName,
          event_date: eventDate,
          registration_start: registrationStartValue || null,
          registration_end: registrationEndValue || null,
          competition_mode: competitionMode,
          status: statusValue.trim() || null,
          description: description.trim() || null,
          course_id: courseIdValue.trim() || null,
          has_handicap_ranking: false,
          competitions: competitionsPayload,
          config,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErrorMsg(String(json?.error || t('adminEventsCreate.errors.createHttpError').replace('{status}', String(res.status))));
        return;
      }

      setCreatedId(json?.id ? String(json.id) : null);
      setOkMsg(t('adminEventsCreate.created'));
      setShowSuccessToast(true);
      setShowValidation(false);
      setName('');
      setStatus('inscripcion');
      setDescription('');
      setCourseId('');
      setRegistrationStart('');
      setRegistrationEnd('');
      setMaxPlayersRaw('');
      setEventDate('');
      setEventEndDate('');
      setFormat('stableford');
      setTeamCompetitionEnabled(false);
      setTeamBestPlayersRaw('');
      setStartMode('tiro');
      setStartHoleRaw('1');
      setStartTimeRaw('');
      setStartIntervalRaw('');
      setCompetitionDrafts({
        individual: buildDefaultCompetitionDraft('', 'individual', t),
        parejas: buildDefaultCompetitionDraft('', 'parejas', t),
        equipos: buildDefaultCompetitionDraft('', 'equipos', t),
      });
      setChampEnabled(false);
      setSelectedChampionshipId('');
      setChampionshipMembershipIds([]);
      setChampTotalRaw('');
      setChampSimpleRaw('');
      setChampDoubleRaw('');
      setChampBestSimpleRaw('');
      setChampBestDoubleRaw('');
      setChampCategories(CATEGORY_OPTIONS);
      setMatchPlayFormat('classic');
      setGroupMode('single');
      setGroupHolesRaw('18');
      setGroupMatchesPerDayRaw('');
      setGroupDatesRaw('');
      setGroupCountRaw('');
      setGroupAdvanceRaw('');
      setGroupHasConsolation(false);
      setHolesPerRoundRaw('18');
      setHasConsolation(false);
      setConsolationHolesPerRoundRaw('');
      setHasSeeds(false);
      setSeedCountRaw('');
      nameRef.current?.focus();
    } catch (e: any) {
      setErrorMsg(e?.message || t('adminEventsCreate.errors.createError'));
    } finally {
      setSaving(false);
    }
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
              <PlusCircle className="h-5 w-5" /> {t('adminEventsCreate.title')}
            </div>
            <div className="text-xs text-gray-700">{t('adminEventsCreate.subtitle')}</div>
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
              <div className="text-sm font-semibold text-amber-800">
                {t('adminEventsCreate.selectAssociationWarn')}
              </div>
            )}

            {errorMsg && <div className="text-sm text-red-700">{errorMsg}</div>}
            {okMsg && <div className="text-sm text-emerald-700">{okMsg}</div>}

            <div className="grid gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                <div className="space-y-1">
                  <div className="text-xs text-gray-500">{t('adminEventsCreate.templateSelectLabel')}</div>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    disabled={saving}
                    className={selectClassName}
                  >
                    <option value="">{t('adminEventsCreate.templateSelectPlaceholder')}</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <button
                    type="button"
                    onClick={loadTemplate}
                    disabled={saving}
                    className="px-3 py-2 rounded-xl text-xs bg-white border border-gray-200 text-gray-700"
                  >
                    {t('adminEventsCreate.templateLoad')}
                  </button>
                  <button
                    type="button"
                    onClick={renameTemplate}
                    disabled={saving}
                    className="px-3 py-2 rounded-xl text-xs bg-white border border-gray-200 text-gray-700"
                  >
                    {t('adminEventsCreate.templateRename')}
                  </button>
                  <button
                    type="button"
                    onClick={deleteTemplate}
                    disabled={saving}
                    className="px-3 py-2 rounded-xl text-xs bg-white border border-red-200 text-red-700"
                  >
                    {t('adminEventsCreate.templateDelete')}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-gray-500">
                  {t('adminEventsCreate.nameLabel')} <span className="text-red-500">**</span>
                </div>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                  className={withError(inputClassName, showValidation && validation.nameMissing)}
                  placeholder={t('adminEventsCreate.namePlaceholder')}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <div className="text-xs text-gray-500">
                    {t('adminEventsCreate.startDateLabel')} <span className="text-red-500">**</span>
                  </div>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    disabled={saving}
                    className={withError(inputClassName, showValidation && validation.eventDateInvalid)}
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-gray-500">{t('adminEventsCreate.endDateLabel')}</div>
                  <input
                    type="date"
                    value={eventEndDate}
                    onChange={(e) => setEventEndDate(e.target.value)}
                    disabled={saving}
                    className={withError(inputClassName, showValidation && validation.endDateInvalid)}
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-gray-500">{t('adminEventsCreate.formatLabel')}</div>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as EventFormat)}
                    disabled={saving}
                    className={selectClassName}
                  >
                    <option value="stableford">{t('adminEventsCreate.formatStableford')}</option>
                    <option value="match">{t('adminEventsCreate.formatMatchPlay')}</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                  <input
                    type="checkbox"
                    checked={teamCompetitionEnabled}
                    onChange={(e) => setTeamCompetitionEnabled(e.target.checked)}
                    disabled={saving}
                  />
                  {t('adminEventsCreate.teamCompetitionLabel')}
                </label>
                <div className="text-[11px] text-gray-500">{t('adminEventsCreate.teamCompetitionHint')}</div>
                {teamCompetitionEnabled && (
                  <div className="mt-2">
                    <label className="text-[11px] text-gray-500">{t('adminEventsCreate.teamBestPlayersLabel')}</label>
                    <input
                      inputMode="numeric"
                      value={teamBestPlayersRaw}
                      onChange={(e) => setTeamBestPlayersRaw(e.target.value)}
                      disabled={saving}
                      className={withError(inputClassName, showValidation && validation.teamBestPlayersInvalid)}
                      placeholder={t('adminEventsCreate.teamBestPlayersPlaceholder')}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs text-gray-500">{t('adminEventsCreate.startModeLabel')}</div>
                <select
                  value={startMode}
                  onChange={(e) => setStartMode(e.target.value as StartMode)}
                  disabled={saving}
                  className={withError(selectClassName, showValidation && validation.startModeInvalid)}
                >
                  <option value="tiro">{t('adminEventsCreate.startModeShotgun')}</option>
                  <option value="hoyo_intervalo">{t('adminEventsCreate.startModeIntervals')}</option>
                  <option value="libre">{t('adminEventsCreate.startModeFree')}</option>
                </select>
                {startMode === 'hoyo_intervalo' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <div className="text-[11px] text-gray-500">{t('adminEventsCreate.startHoleLabel')}</div>
                      <input
                        inputMode="numeric"
                        value={startHoleRaw}
                        onChange={(e) => setStartHoleRaw(e.target.value)}
                        disabled={saving}
                        className={withError(inputClassName, showValidation && validation.startModeInvalid)}
                        placeholder="1"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] text-gray-500">{t('adminEventsCreate.startTimeLabel')}</div>
                      <input
                        type="time"
                        value={startTimeRaw}
                        onChange={(e) => setStartTimeRaw(e.target.value)}
                        disabled={saving}
                        className={withError(inputClassName, showValidation && validation.startModeInvalid)}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] text-gray-500">{t('adminEventsCreate.startIntervalLabel')}</div>
                      <input
                        inputMode="numeric"
                        value={startIntervalRaw}
                        onChange={(e) => setStartIntervalRaw(e.target.value)}
                        disabled={saving}
                        className={withError(inputClassName, showValidation && validation.startModeInvalid)}
                        placeholder="10"
                      />
                    </div>
                  </div>
                )}
                <div className="text-[11px] text-gray-500">{t('adminEventsCreate.startModeHint')}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-xs text-gray-500">{t('adminEventsCreate.registrationStartLabel')}</div>
                  <input
                    type="date"
                    value={registrationStart}
                    onChange={(e) => setRegistrationStart(e.target.value)}
                    disabled={saving}
                    className={withError(inputClassName, showValidation && validation.registrationStartInvalid)}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-gray-500">{t('adminEventsCreate.registrationEndLabel')}</div>
                  <input
                    type="date"
                    value={registrationEnd}
                    onChange={(e) => setRegistrationEnd(e.target.value)}
                    disabled={saving}
                    className={withError(inputClassName, showValidation && validation.registrationEndInvalid)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-xs text-gray-500">{t('adminEventsCreate.courseLabel')}</div>
                  <select
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    disabled={saving || !currentAssociationId || loadingCourses}
                    className={withError(selectClassName, showValidation && validation.courseMissing)}
                  >
                    <option value="">{t('adminEventsCreate.courseNone')}</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {loadingCourses && <div className="text-[11px] text-gray-500">{t('adminEventsCreate.loadingCourses')}</div>}
                </div>

                {format !== 'stableford' && (
                  <div className="space-y-1">
                    <div className="text-xs text-gray-500">{t('adminEventsCreate.statusLabel')}</div>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      disabled={saving}
                      className={selectClassName}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {format !== 'stableford' && (
                <>
                  <div className="space-y-1">
                    <div className="text-xs text-gray-500">{t('adminEventsCreate.maxPlayersLabel')}</div>
                    <input
                      inputMode="numeric"
                      value={maxPlayersRaw}
                      onChange={(e) => setMaxPlayersRaw(e.target.value)}
                      disabled={saving}
                      className={withError(inputClassName, showValidation && validation.maxPlayersInvalid)}
                      placeholder={t('adminEventsCreate.maxPlayersPlaceholder')}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-gray-500">{t('adminEventsCreate.pricesLabel')}</div>
                    <div className="space-y-2">
                      {priceRows.map((row, idx) => (
                        <div key={`price-${idx}`} className="grid grid-cols-1 sm:grid-cols-[1.3fr_0.8fr_0.6fr_auto] gap-2">
                          <select
                            value={row.category}
                            onChange={(e) => {
                              const value = e.target.value;
                              setPriceRows((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], category: value };
                                return next;
                              });
                            }}
                            disabled={saving}
                            className={selectClassName}
                          >
                            {CATEGORY_OPTIONS.map((cat) => (
                              <option key={cat} value={cat}>{getCategoryLabel(cat, t)}</option>
                            ))}
                          </select>
                          <input
                            inputMode="decimal"
                            value={row.price}
                            onChange={(e) => {
                              const value = e.target.value;
                              setPriceRows((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], price: value };
                                return next;
                              });
                            }}
                            disabled={saving}
                            className={inputClassName}
                            placeholder={t('adminEventsCreate.pricePlaceholder')}
                          />
                          <input
                            value={row.currency}
                            onChange={(e) => {
                              const value = e.target.value;
                              setPriceRows((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], currency: value };
                                return next;
                              });
                            }}
                            disabled={saving}
                            className={inputClassName}
                            placeholder={t('adminEventsCreate.currencyPlaceholder')}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setPriceRows((prev) => prev.filter((_, i) => i !== idx));
                            }}
                            disabled={saving || priceRows.length <= 1}
                            className="px-3 py-2 rounded-xl text-xs bg-white border border-gray-200 text-gray-700 disabled:opacity-50"
                          >
                            {t('adminEventsCreate.removePrice')}
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPriceRows((prev) => ([
                          ...prev,
                          { category: CATEGORY_OPTIONS[0], price: '', currency: 'EUR' },
                        ]));
                      }}
                      disabled={saving}
                      className="px-3 py-2 rounded-xl text-xs bg-white border border-gray-200 text-gray-700"
                    >
                      {t('adminEventsCreate.addPrice')}
                    </button>
                  </div>
                </>
              )}

              <div className="space-y-1">
                <div className="text-xs text-gray-500">{t('adminEventsCreate.descriptionLabel')}</div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={saving}
                  rows={3}
                  className={textareaClassName}
                  placeholder={t('adminEventsCreate.descriptionPlaceholder')}
                />
              </div>

              {format === 'stableford' && (
                <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                  <div className="space-y-1">
                    <div className="text-xs text-gray-500">{t('adminEventsCreate.modalityLabel')}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {COMPETITION_TYPES.map((type) => {
                        const checked = competitionDrafts[type]?.enabled;
                        return (
                          <label key={type} className="flex items-start gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCompetition(type)}
                              disabled={saving}
                              className="mt-0.5"
                            />
                            <span>{getCompetitionLabel(type, t)}</span>
                          </label>
                        );
                      })}
                    </div>
                    {showValidation && validation.competitionsMissing && (
                      <div className="text-[11px] text-red-600">{t('adminEventsCreate.errors.selectCompetition')}</div>
                    )}
                    <div className="text-[11px] text-gray-500">{t('adminEventsCreate.modalityHint')}</div>
                  </div>

                  {COMPETITION_TYPES.filter((type) => competitionDrafts[type]?.enabled).map((type) => {
                    const draft = competitionDrafts[type];
                    if (!draft) return null;
                    const statusValue = draft.statusMode === 'auto' ? 'auto' : (draft.status || 'inscripcion');
                    return (
                      <div key={type} className="space-y-4 rounded-2xl border border-amber-200 bg-white/70 p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="font-semibold text-sm text-amber-900">
                            {getCompetitionLabel(type, t)}
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleCompetition(type)}
                            disabled={saving}
                            className="px-3 py-1.5 rounded-xl text-[11px] bg-white border border-amber-200 text-amber-800"
                          >
                            {t('adminEventsCreate.removeCompetition')}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1 sm:col-span-2">
                            <div className="text-xs text-gray-500">{t('adminEventsCreate.statusLabel')}</div>
                            <select
                              value={statusValue}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === 'auto') {
                                  updateCompetitionDraft(type, { statusMode: 'auto' });
                                } else {
                                  updateCompetitionDraft(type, { statusMode: 'manual', status: value });
                                }
                              }}
                              disabled={saving}
                              className={selectClassName}
                            >
                              <option value="auto">{t('adminEventsCreate.statusAutoLabel')}</option>
                              {STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <div className="text-[11px] text-gray-500">{t('adminEventsCreate.statusAutoHint')}</div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs text-gray-500">{t('adminEventsCreate.maxPlayersLabel')}</div>
                          <input
                            inputMode="numeric"
                            value={draft.maxPlayersRaw}
                            onChange={(e) => updateCompetitionDraft(type, { maxPlayersRaw: e.target.value })}
                            disabled={saving}
                            className={withError(inputClassName, showValidation && validation.competitionMaxPlayersInvalid)}
                            placeholder={t('adminEventsCreate.maxPlayersPlaceholder')}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs text-gray-500">{t('adminEventsCreate.pricesLabel')}</div>
                          <div className="space-y-2">
                            {draft.priceRows.map((row, idx) => (
                              <div
                                key={`${type}-price-${idx}`}
                                className="grid grid-cols-1 sm:grid-cols-[1.3fr_0.8fr_0.6fr_auto] gap-2"
                              >
                                <select
                                  value={row.category}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    updateCompetitionDraft(type, {
                                      priceRows: draft.priceRows.map((entry, entryIdx) =>
                                        entryIdx === idx ? { ...entry, category: value } : entry,
                                      ),
                                    });
                                  }}
                                  disabled={saving}
                                  className={selectClassName}
                                >
                                  {CATEGORY_OPTIONS.map((cat) => (
                                    <option key={cat} value={cat}>{getCategoryLabel(cat, t)}</option>
                                  ))}
                                </select>
                                <input
                                  inputMode="decimal"
                                  value={row.price}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    updateCompetitionDraft(type, {
                                      priceRows: draft.priceRows.map((entry, entryIdx) =>
                                        entryIdx === idx ? { ...entry, price: value } : entry,
                                      ),
                                    });
                                  }}
                                  disabled={saving}
                                  className={inputClassName}
                                  placeholder={t('adminEventsCreate.pricePlaceholder')}
                                />
                                <input
                                  value={row.currency}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    updateCompetitionDraft(type, {
                                      priceRows: draft.priceRows.map((entry, entryIdx) =>
                                        entryIdx === idx ? { ...entry, currency: value } : entry,
                                      ),
                                    });
                                  }}
                                  disabled={saving}
                                  className={inputClassName}
                                  placeholder={t('adminEventsCreate.currencyPlaceholder')}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateCompetitionDraft(type, {
                                      priceRows: draft.priceRows.filter((_, entryIdx) => entryIdx !== idx),
                                    });
                                  }}
                                  disabled={saving || draft.priceRows.length <= 1}
                                  className="px-3 py-2 rounded-xl text-xs bg-white border border-gray-200 text-gray-700 disabled:opacity-50"
                                >
                                  {t('adminEventsCreate.removePrice')}
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              updateCompetitionDraft(type, {
                                priceRows: [
                                  ...draft.priceRows,
                                  { category: CATEGORY_OPTIONS[0], price: '', currency: 'EUR' },
                                ],
                              });
                            }}
                            disabled={saving}
                            className="px-3 py-2 rounded-xl text-xs bg-white border border-gray-200 text-gray-700"
                          >
                            {t('adminEventsCreate.addPrice')}
                          </button>
                        </div>

                        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                          <div className="font-semibold text-sm text-amber-900">{t('adminEventsCreate.stablefordModeLabel')}</div>
                          {type === 'parejas' && (
                            <div className="space-y-1">
                              <div className="text-xs text-gray-500">{t('adminEventsCreate.pairModeLabel')}</div>
                              <select
                                value={draft.pairsPlayMode}
                                onChange={(e) => updateCompetitionDraft(type, { pairsPlayMode: e.target.value as PairPlayMode })}
                                disabled={saving}
                                className={selectClassName}
                              >
                                {PAIR_PLAY_MODE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {t(option.label)}
                                  </option>
                                ))}
                              </select>
                              <div className="text-[11px] text-gray-500">{t('adminEventsCreate.pairModeHint')}</div>
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {STABLEFORD_MODE_OPTIONS.map((mode) => (
                              <label key={mode.value} className="flex items-start gap-2 text-sm text-gray-700">
                                <input
                                  type="radio"
                                  name={`stablefordMode-${type}`}
                                  value={mode.value}
                                  checked={draft.stablefordMode === mode.value}
                                  onChange={(e) => {
                                    const nextMode = e.target.value as StablefordMode;
                                    if (nextMode === 'best_hole') {
                                      const rounds = Number.parseInt(draft.bestHoleRoundsRaw, 10);
                                      updateCompetitionDraft(type, {
                                        stablefordMode: nextMode,
                                        bestHoleRoundsRaw: Number.isFinite(rounds) && rounds >= 2
                                          ? draft.bestHoleRoundsRaw
                                          : '2',
                                      });
                                      return;
                                    }
                                    updateCompetitionDraft(type, { stablefordMode: nextMode });
                                  }}
                                  disabled={saving}
                                  className="mt-0.5"
                                />
                                <span>{t(mode.label)}</span>
                              </label>
                            ))}
                          </div>

                          {draft.stablefordMode === 'classic' && (
                            <div className="space-y-2">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <div className="text-xs text-gray-500">{t('adminEventsCreate.stablefordRoundsLabel')}</div>
                                  <input
                                    inputMode="numeric"
                                    value={draft.classicRoundsRaw}
                                    onChange={(e) => updateCompetitionDraft(type, { classicRoundsRaw: e.target.value })}
                                    disabled={saving}
                                    className={withError(inputClassName, showValidation && validation.stablefordClassicRoundsInvalid)}
                                    placeholder={t('adminEventsCreate.stablefordRoundsPlaceholder')}
                                  />
                                </div>
                              </div>
                              <div className="rounded-xl border border-gray-200 bg-white/80 p-3 space-y-2">
                                <div className="text-xs font-semibold text-gray-700">{t('adminEventsCreate.pointsTitle')}</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <div className="text-xs text-gray-500">{t('adminEventsCreate.pointsModeLabel')}</div>
                                    <select
                                      value={draft.pointsMode}
                                      onChange={(e) => updateCompetitionDraft(type, { pointsMode: e.target.value as PointsMode })}
                                      disabled={saving}
                                      className={selectClassName}
                                    >
                                      <option value="percent">{t('adminEventsCreate.pointsModePercent')}</option>
                                      <option value="manual">{t('adminEventsCreate.pointsModeManual')}</option>
                                    </select>
                                  </div>

                                  {draft.pointsMode === 'percent' ? (
                                    <>
                                      <div className="space-y-1">
                                        <div className="text-xs text-gray-500">{t('adminEventsCreate.pointsFirstLabel')}</div>
                                        <input
                                          value={draft.pointsFirstRaw}
                                          onChange={(e) => updateCompetitionDraft(type, { pointsFirstRaw: e.target.value })}
                                          disabled={saving}
                                          className={withError(inputClassName, showValidation && validation.stablefordPointsInvalid)}
                                          placeholder="100"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <div className="text-xs text-gray-500">{t('adminEventsCreate.pointsDecayLabel')}</div>
                                        <input
                                          value={draft.pointsDecayRaw}
                                          onChange={(e) => updateCompetitionDraft(type, { pointsDecayRaw: e.target.value })}
                                          disabled={saving}
                                          className={withError(inputClassName, showValidation && validation.stablefordPointsInvalid)}
                                          placeholder="8"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <div className="text-xs text-gray-500">{t('adminEventsCreate.pointsPodiumLabel')}</div>
                                        <input
                                          value={draft.pointsPodiumRaw}
                                          onChange={(e) => updateCompetitionDraft(type, { pointsPodiumRaw: e.target.value })}
                                          disabled={saving}
                                          className={withError(inputClassName, showValidation && validation.stablefordPointsInvalid)}
                                          placeholder="3"
                                        />
                                      </div>
                                    </>
                                  ) : (
                                    <div className="space-y-1 sm:col-span-2">
                                      <div className="text-xs text-gray-500">{t('adminEventsCreate.pointsTableLabel')}</div>
                                      <input
                                        value={draft.pointsTableRaw}
                                        onChange={(e) => updateCompetitionDraft(type, { pointsTableRaw: e.target.value })}
                                        disabled={saving}
                                        className={withError(inputClassName, showValidation && validation.stablefordPointsInvalid)}
                                        placeholder={t('adminEventsCreate.pointsTablePlaceholder')}
                                      />
                                    </div>
                                  )}
                                </div>
                                <div className="text-[11px] text-gray-600">
                                  {t('adminEventsCreate.pointsTieHint').replace('{count}', draft.pointsPodiumRaw || '3')}
                                </div>
                              </div>
                            </div>
                          )}

                          {draft.stablefordMode === 'best_card' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <div className="text-xs text-gray-500">{t('adminEventsCreate.roundsCountLabel')}</div>
                                <input
                                  value={draft.bestCardRoundsRaw}
                                  onChange={(e) => updateCompetitionDraft(type, { bestCardRoundsRaw: e.target.value })}
                                  disabled={saving}
                                  className={withError(inputClassName, showValidation && validation.stablefordBestCardInvalid)}
                                  placeholder={t('adminEventsCreate.roundsMinPlaceholder')}
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="text-xs text-gray-500">{t('adminEventsCreate.bestCardMaxAttemptsLabel')}</div>
                                <input
                                  value={draft.bestCardMaxAttemptsRaw}
                                  onChange={(e) => updateCompetitionDraft(type, { bestCardMaxAttemptsRaw: e.target.value })}
                                  disabled={saving}
                                  className={withError(inputClassName, showValidation && validation.stablefordBestCardInvalid)}
                                  placeholder={t('adminEventsCreate.bestCardMaxAttemptsPlaceholder')}
                                />
                              </div>
                            </div>
                          )}

                          {draft.stablefordMode === 'best_hole' && (
                            <div className="space-y-1">
                              <div className="text-xs text-gray-500">{t('adminEventsCreate.roundsCountLabel')}</div>
                              <input
                                value={draft.bestHoleRoundsRaw}
                                onChange={(e) => updateCompetitionDraft(type, { bestHoleRoundsRaw: e.target.value })}
                                disabled={saving}
                                className={withError(inputClassName, showValidation && validation.stablefordBestHoleInvalid)}
                                  placeholder="2"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <div className="rounded-xl border border-gray-200 bg-white/80 p-3 space-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                      <input
                        type="checkbox"
                        checked={champEnabled}
                        onChange={(e) => setChampEnabled(e.target.checked)}
                        disabled={saving}
                      />
                      {t('adminEventsCreate.championshipEnabledLabel')}
                    </label>

                    {champEnabled && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                          <select
                            value={selectedChampionshipId}
                            onChange={(e) => setSelectedChampionshipId(e.target.value)}
                            disabled={saving || associationChampionships.length === 0}
                            className={selectClassName}
                          >
                            <option value="">{t('adminEventsCreate.championshipHubSelect')}</option>
                            {associationChampionships
                              .filter((row) => !championshipMembershipIds.includes(row.id))
                              .map((row) => (
                                <option key={row.id} value={row.id}>{row.name}</option>
                              ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              if (!selectedChampionshipId) return;
                              setChampionshipMembershipIds((prev) => (
                                prev.includes(selectedChampionshipId) ? prev : [...prev, selectedChampionshipId]
                              ));
                              setSelectedChampionshipId('');
                            }}
                            className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700"
                            disabled={saving || !selectedChampionshipId}
                          >
                            {t('adminEventsCreate.championshipHubAdd')}
                          </button>
                        </div>

                        {championshipMembershipIds.length === 0 ? (
                          <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipHubEmpty')}</div>
                        ) : (
                          <div className="space-y-2">
                            {championshipMembershipIds.map((id) => {
                              const championship = associationChampionships.find((item) => item.id === id);
                              return (
                                <div key={`membership-${id}`} className="rounded-xl border border-gray-200 bg-white px-3 py-2 flex items-center justify-between gap-2">
                                  <div className="text-sm text-gray-800 truncate">{championship?.name || id}</div>
                                  <button
                                    type="button"
                                    onClick={() => setChampionshipMembershipIds((prev) => prev.filter((item) => item !== id))}
                                    className="text-xs text-red-600"
                                    disabled={saving}
                                  >
                                    {t('adminEventsCreate.remove')}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {format === 'match' && (
                <div className="w-full rounded-2xl border border-gray-200 bg-white/70 p-4 space-y-3">
                  <div className="text-sm font-extrabold text-gray-900">{t('adminEventsCreate.matchTitle')}</div>

                  <div className="space-y-1">
                    <div className="text-xs text-gray-500">{t('adminEventsCreate.matchFormatLabel')}</div>
                    <select
                      value={matchPlayFormat}
                      onChange={(e) => setMatchPlayFormat(e.target.value as MatchPlayFormat)}
                      disabled={saving}
                      className={selectClassName}
                    >
                      <option value="classic">{t('adminEventsCreate.matchFormatClassic')}</option>
                      <option value="groups">{t('adminEventsCreate.matchFormatGroups')}</option>
                    </select>
                  </div>
                  {matchPlayFormat === 'classic' ? (
                    <>
                      <div className="space-y-1">
                        <div className="text-xs text-gray-500">{t('adminEventsCreate.matchHolesLabel')}</div>
                        <input
                          value={holesPerRoundRaw}
                          onChange={(e) => setHolesPerRoundRaw(e.target.value)}
                          disabled={saving}
                          className={inputClassName}
                          placeholder={t('adminEventsCreate.matchHolesPlaceholder')}
                        />
                      </div>

                      <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                        <input
                          type="checkbox"
                          checked={hasConsolation}
                          onChange={(e) => setHasConsolation(e.target.checked)}
                          disabled={saving}
                        />
                        {t('adminEventsCreate.matchConsolationLabel')}
                      </label>

                      {hasConsolation && (
                        <div className="space-y-1">
                          <div className="text-xs text-gray-500">{t('adminEventsCreate.matchConsolationHolesLabel')}</div>
                          <input
                            value={consolationHolesPerRoundRaw}
                            onChange={(e) => setConsolationHolesPerRoundRaw(e.target.value)}
                            disabled={saving}
                            className={inputClassName}
                            placeholder={t('adminEventsCreate.matchConsolationHolesPlaceholder')}
                          />
                        </div>
                      )}

                      <div className="rounded-xl border border-gray-200 bg-white/80 p-3 space-y-2">
                        <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                          <input
                            type="checkbox"
                            checked={hasSeeds}
                            onChange={(e) => setHasSeeds(e.target.checked)}
                            disabled={saving}
                          />
                          {t('adminEventsCreate.matchSeedsLabel')}
                        </label>

                        {hasSeeds && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <div className="text-xs text-gray-500">{t('adminEventsCreate.matchSeedCountLabel')}</div>
                              <select
                                value={seedCountRaw}
                                onChange={(e) => setSeedCountRaw(e.target.value)}
                                disabled={saving}
                                className={selectClassName}
                              >
                                <option value="">{t('adminEventsCreate.matchSeedCountPlaceholder')}</option>
                                <option value="2">2</option>
                                <option value="4">4</option>
                                <option value="8">8</option>
                                <option value="16">16</option>
                                <option value="32">32</option>
                                <option value="64">64</option>
                              </select>
                            </div>
                            <div className="text-[11px] text-gray-600 sm:mt-6">
                              {t('adminEventsCreate.matchSeedHint')}
                            </div>
                          </div>
                        )}
                      </div>

                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <div className="text-xs text-gray-500">{t('adminEventsCreate.groupModeLabel')}</div>
                          <select
                            value={groupMode}
                            onChange={(e) => setGroupMode(e.target.value as GroupMode)}
                            disabled={saving}
                            className={selectClassName}
                          >
                            <option value="single">{t('adminEventsCreate.groupModeSingle')}</option>
                            <option value="multi">{t('adminEventsCreate.groupModeMulti')}</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-gray-500">{t('adminEventsCreate.groupHolesLabel')}</div>
                          <input
                            value={groupHolesRaw}
                            onChange={(e) => setGroupHolesRaw(e.target.value)}
                            disabled={saving}
                            className={inputClassName}
                            placeholder={t('adminEventsCreate.groupHolesPlaceholder')}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <div className="text-xs text-gray-500">{t('adminEventsCreate.groupMatchesPerDayLabel')}</div>
                          <input
                            value={groupMatchesPerDayRaw}
                            onChange={(e) => setGroupMatchesPerDayRaw(e.target.value)}
                            disabled={saving}
                            className={inputClassName}
                            placeholder={t('adminEventsCreate.groupMatchesPerDayPlaceholder')}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-gray-500">{t('adminEventsCreate.groupDatesLabel')}</div>
                          <input
                            value={groupDatesRaw}
                            onChange={(e) => setGroupDatesRaw(e.target.value)}
                            disabled={saving}
                            className={inputClassName}
                            placeholder={t('adminEventsCreate.groupDatesPlaceholder')}
                          />
                        </div>
                      </div>

                      {groupMode === 'multi' && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <div className="text-xs text-gray-500">{t('adminEventsCreate.groupCountLabel')}</div>
                            <input
                              value={groupCountRaw}
                              onChange={(e) => setGroupCountRaw(e.target.value)}
                              disabled={saving}
                              className={inputClassName}
                              placeholder={t('adminEventsCreate.groupCountPlaceholder')}
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-gray-500">{t('adminEventsCreate.groupAdvanceLabel')}</div>
                            <input
                              value={groupAdvanceRaw}
                              onChange={(e) => setGroupAdvanceRaw(e.target.value)}
                              disabled={saving}
                              className={inputClassName}
                              placeholder={t('adminEventsCreate.groupAdvancePlaceholder')}
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-gray-500">{t('adminEventsCreate.groupConsolationLabel')}</div>
                            <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                              <input
                                type="checkbox"
                                checked={groupHasConsolation}
                                onChange={(e) => setGroupHasConsolation(e.target.checked)}
                                disabled={saving}
                              />
                              {t('adminEventsCreate.groupConsolationHint')}
                            </label>
                          </div>
                        </div>
                      )}

                      <div className="text-[11px] text-gray-600">
                        {t('adminEventsCreate.groupMaxPlayersNote')}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={!canSave || saving}
                  className="px-4 py-2 rounded-xl text-sm bg-blue-600 text-white disabled:opacity-50"
                >
                  {saving ? t('adminEventsCreate.saving') : t('adminEventsCreate.createButton')}
                </button>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="space-y-1">
                    <div className="text-[11px] text-gray-500">{t('adminEventsCreate.templateNameLabel')}</div>
                    <input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      disabled={saving}
                      className={inputClassName}
                      placeholder={t('adminEventsCreate.templateNamePlaceholder')}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={saveTemplate}
                    disabled={saving}
                    className="px-4 py-2 rounded-xl text-sm bg-white border border-gray-200 text-gray-700"
                  >
                    {t('adminEventsCreate.templateSave')}
                  </button>
                </div>
                <Link
                  href="/admin/eventos"
                  className="px-4 py-2 rounded-xl text-sm bg-white border border-gray-200 text-gray-700"
                >
                  {t('common.back')}
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>

      {showSuccessToast && okMsg && (
        <div className="fixed bottom-4 right-4 z-[70] w-[min(92vw,380px)] rounded-2xl border border-emerald-200 bg-white/95 backdrop-blur-md shadow-[0_16px_40px_-20px_rgba(16,185,129,0.65)]">
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-emerald-800">{okMsg}</div>
                  <div className="text-xs text-emerald-700/90">El torneo se ha guardado correctamente.</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSuccessToast(false)}
                className="rounded-lg p-1 text-emerald-700/70 hover:text-emerald-900 hover:bg-emerald-50"
                aria-label="Cerrar aviso"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {createdId ? (
                <Link
                  href={`/events/${createdId}`}
                  className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Ver torneo
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => setShowSuccessToast(false)}
                className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold border border-emerald-200 text-emerald-800 bg-white hover:bg-emerald-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
