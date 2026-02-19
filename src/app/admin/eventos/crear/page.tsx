'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, DoorOpen, PlusCircle } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import AssociationSelector from '@/components/AssociationSelector';
import { useLanguage } from '@/context/language-context';

type CourseLite = { id: string; name: string };

type EventFormat = 'stableford' | 'match';
type MatchPlayFormat = 'classic' | 'groups';
type GroupMode = 'single' | 'multi';
type StablefordMode = 'classic' | 'best_card' | 'best_hole' | 'weekly';
type PointsMode = 'manual' | 'percent';
type StartMode = 'tiro' | 'hoyo_intervalo' | 'libre';
type PriceRow = { category: string; price: string; currency: string };
type ChampHubEventDraft = {
  eventId: string;
  kind: 'simple' | 'doble';
  pointsMode: PointsMode;
  firstRaw: string;
  decayRaw: string;
  podiumRaw: string;
  tableRaw: string;
};
type EventLite = { id: string; name: string };

const CATEGORY_OPTIONS = ['Masculino', 'Femenino', 'Senior', 'Senior+', 'Junior'];

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
  const [priceRows, setPriceRows] = useState<PriceRow[]>(() => ([
    { category: CATEGORY_OPTIONS[0], price: '', currency: 'EUR' },
  ]));

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

  const [stablefordMode, setStablefordMode] = useState<StablefordMode>('classic');
  const [classicRoundsRaw, setClassicRoundsRaw] = useState('1');
  const [bestCardRoundsRaw, setBestCardRoundsRaw] = useState('2');
  const [bestCardMaxAttemptsRaw, setBestCardMaxAttemptsRaw] = useState('');
  const [bestHoleRoundsRaw, setBestHoleRoundsRaw] = useState('2');
  const [weeklyAllowExtraAttempts, setWeeklyAllowExtraAttempts] = useState(false);
  const [weeklyMaxAttemptsRaw, setWeeklyMaxAttemptsRaw] = useState('');

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
  const [associationEvents, setAssociationEvents] = useState<EventLite[]>([]);

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
        return;
      }
      const { data, error } = await supabase
        .from('events')
        .select('id, name')
        .eq('association_id', currentAssociationId)
        .order('event_date', { ascending: false });
      if (!active) return;
      if (error) {
        setAssociationEvents([]);
        return;
      }
      setAssociationEvents(
        ((data as any[]) || []).map((r) => ({ id: String(r.id), name: String(r.name || '') }))
      );
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

  const canSave = useMemo(() => {
    if (!currentAssociationId) return false;
    if (!name.trim()) return false;
    if (!isIsoDate(eventDate)) return false;
    if (!courseId.trim()) return false;
    if (eventEndDate && !isIsoDate(eventEndDate)) return false;
    if (eventEndDate && isIsoDate(eventDate) && eventEndDate < eventDate) return false;
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

    if (startMode === 'hoyo_intervalo') {
      const hole = Number.parseInt(startHoleRaw, 10);
      const interval = Number.parseInt(startIntervalRaw, 10);
      if (!startTimeRaw.trim()) return false;
      if (!Number.isFinite(hole) || hole < 1 || hole > 36) return false;
      if (!Number.isFinite(interval) || interval < 1) return false;
    }

    if (format === 'stableford') {
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
        if (!Number.isFinite(rounds) || rounds < 1) return false;
        if (bestCardMaxAttemptsRaw.trim()) {
          const maxAttempts = Number.parseInt(bestCardMaxAttemptsRaw, 10);
          if (!Number.isFinite(maxAttempts) || maxAttempts < 1) return false;
        }
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
  }, [currentAssociationId, name, eventDate, eventEndDate, registrationStart, registrationEnd, courseId, maxPlayersRaw, teamCompetitionEnabled, teamBestPlayersRaw, startMode, startHoleRaw, startTimeRaw, startIntervalRaw, format, matchPlayFormat, holesPerRoundRaw, hasConsolation, consolationHolesPerRoundRaw, hasSeeds, seedCountRaw, groupMode, groupHolesRaw, groupMatchesPerDayRaw, groupDatesRaw, groupCountRaw, groupAdvanceRaw, stablefordMode, classicRoundsRaw, bestCardRoundsRaw, bestCardMaxAttemptsRaw, bestHoleRoundsRaw, weeklyAllowExtraAttempts, weeklyMaxAttemptsRaw, pointsMode, pointsFirstRaw, pointsDecayRaw, pointsPodiumRaw, pointsTableRaw, champEnabled, champTotalRaw, champSimpleRaw, champDoubleRaw, champBestSimpleRaw, champBestDoubleRaw, champCategories, champHubEnabled, champHubCategories, champHubEvents]);

  const validation = useMemo(() => {
    const endDateInvalid = !!eventEndDate && (!isIsoDate(eventEndDate) || (isIsoDate(eventDate) && eventEndDate < eventDate));
    const registrationStartInvalid = !!registrationStart && !isIsoDate(registrationStart);
    const registrationEndInvalid = !!registrationEnd && !isIsoDate(registrationEnd);

    let maxPlayersInvalid = false;
    if (maxPlayersRaw.trim()) {
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
    };
  }, [courseId, eventDate, eventEndDate, maxPlayersRaw, name, registrationEnd, registrationStart, startHoleRaw, startIntervalRaw, startMode, startTimeRaw, teamBestPlayersRaw, teamCompetitionEnabled]);

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
      stablefordMode,
      classicRoundsRaw,
      bestCardRoundsRaw,
      bestCardMaxAttemptsRaw,
      bestHoleRoundsRaw,
      weeklyAllowExtraAttempts,
      weeklyMaxAttemptsRaw,
      pointsMode,
      pointsFirstRaw,
      pointsDecayRaw,
      pointsPodiumRaw,
      pointsTableRaw,
      champEnabled,
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

      const data = template.payload || {};
      setFormat(data.format || 'stableford');
      setStatus(data.status || 'inscripcion');
      setDescription(data.description || '');
      setCourseId(data.courseId || '');
      setMaxPlayersRaw(data.maxPlayersRaw || '');
      setPriceRows(Array.isArray(data.priceRows) && data.priceRows.length ? data.priceRows : [{ category: CATEGORY_OPTIONS[0], price: '', currency: 'EUR' }]);
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
      setStablefordMode(data.stablefordMode || 'classic');
      setClassicRoundsRaw(data.classicRoundsRaw || '1');
      setBestCardRoundsRaw(data.bestCardRoundsRaw || '2');
      setBestCardMaxAttemptsRaw(data.bestCardMaxAttemptsRaw || '');
      setBestHoleRoundsRaw(data.bestHoleRoundsRaw || '2');
      setWeeklyAllowExtraAttempts(!!data.weeklyAllowExtraAttempts);
      setWeeklyMaxAttemptsRaw(data.weeklyMaxAttemptsRaw || '');
      setPointsMode(data.pointsMode || 'percent');
      setPointsFirstRaw(data.pointsFirstRaw || '100');
      setPointsDecayRaw(data.pointsDecayRaw || '8');
      setPointsPodiumRaw(data.pointsPodiumRaw || '3');
      setPointsTableRaw(data.pointsTableRaw || '');
      setChampEnabled(!!data.champEnabled);
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
      setRegistrationStart('');
      setRegistrationEnd('');
      setOkMsg(t('adminEventsCreate.templateLoaded'));
      setErrorMsg(null);
    } catch {
      setErrorMsg(t('adminEventsCreate.templateMissing'));
      setOkMsg(null);
    }
  };

  const save = async () => {
    setErrorMsg(null);
    setOkMsg(null);
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

    if (startMode === 'hoyo_intervalo') {
      const hole = Number.parseInt(startHoleRaw, 10);
      const interval = Number.parseInt(startIntervalRaw, 10);
      if (!startTimeRaw.trim() || !Number.isFinite(hole) || hole < 1 || hole > 36 || !Number.isFinite(interval) || interval < 1) {
        setErrorMsg(t('adminEventsCreate.errors.startModeInvalid'));
        return;
      }
    }

    let maxPlayers: number | null = null;
    if (maxPlayersRaw.trim()) {
      const n = Number.parseInt(maxPlayersRaw, 10);
      if (!Number.isFinite(n) || n < 2 || n > 256) {
        setErrorMsg(t('adminEventsCreate.errors.maxPlayersInvalid'));
        return;
      }
      maxPlayers = n;
    }

    const config: any = {};
    if (maxPlayers) config.maxPlayers = maxPlayers;
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
    if (normalizedPrices.length) config.prices = normalizedPrices;

    let competitionMode: string | null = null;
    if (format === 'stableford') {
      competitionMode = 'stableford';
      const classicRounds = Number.parseInt(classicRoundsRaw, 10);
      const bestCardRounds = Number.parseInt(bestCardRoundsRaw, 10);
      const bestHoleRounds = Number.parseInt(bestHoleRoundsRaw, 10);
      const weeklyMaxAttempts = weeklyMaxAttemptsRaw.trim()
        ? Number.parseInt(weeklyMaxAttemptsRaw, 10)
        : NaN;
      if (stablefordMode === 'weekly' && weeklyAllowExtraAttempts && weeklyMaxAttemptsRaw.trim()) {
        if (!Number.isFinite(weeklyMaxAttempts) || weeklyMaxAttempts < 1) {
          setErrorMsg(t('adminEventsCreate.errors.weeklyMaxAttemptsInvalid'));
          return;
        }
      }

      config.stableford = {
        mode: stablefordMode,
        classicRounds: Number.isFinite(classicRounds) ? classicRounds : null,
        bestCardRounds: Number.isFinite(bestCardRounds) ? bestCardRounds : null,
        bestCardMaxAttempts: bestCardMaxAttemptsRaw.trim()
          ? Number.parseInt(bestCardMaxAttemptsRaw, 10)
          : null,
        bestHoleRounds: Number.isFinite(bestHoleRounds) ? bestHoleRounds : null,
        weekly: stablefordMode === 'weekly'
          ? {
              minAttempts: 1,
              maxAttempts: Number.isFinite(weeklyMaxAttempts) && weeklyAllowExtraAttempts
                ? weeklyMaxAttempts
                : 1,
              requireAdminApproval: weeklyAllowExtraAttempts && !Number.isFinite(weeklyMaxAttempts),
              extraAttemptsByUser: {},
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
          registration_start: registrationStart || null,
          registration_end: registrationEnd || null,
          competition_mode: competitionMode,
          status: status.trim() || null,
          description: description.trim() || null,
          course_id: courseId.trim() || null,
          has_handicap_ranking: false,
          config,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErrorMsg(String(json?.error || t('adminEventsCreate.errors.createHttpError').replace('{status}', String(res.status))));
        return;
      }

      setOkMsg(t('adminEventsCreate.created'));
      setShowValidation(false);
      setName('');
      setStatus('inscripcion');
      setDescription('');
      setCourseId('');
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
      setStablefordMode('classic');
      setClassicRoundsRaw('1');
      setBestCardRoundsRaw('2');
      setBestCardMaxAttemptsRaw('');
      setBestHoleRoundsRaw('2');
      setWeeklyAllowExtraAttempts(false);
      setWeeklyMaxAttemptsRaw('');
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
                <button
                  type="button"
                  onClick={loadTemplate}
                  disabled={saving}
                  className="px-3 py-2 rounded-xl text-xs bg-white border border-gray-200 text-gray-700"
                >
                  {t('adminEventsCreate.templateLoad')}
                </button>
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
                    className={selectClassName}
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
              </div>

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
                <div className="text-[11px] text-gray-500">{t('adminEventsCreate.maxPlayersHint')}</div>
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
                <div className="w-full rounded-2xl border border-gray-200 bg-white/70 p-4 space-y-3">
                  <div className="text-sm font-extrabold text-gray-900">{t('adminEventsCreate.stablefordTitle')}</div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="text-xs text-gray-500">{t('adminEventsCreate.stablefordModeLabel')}</div>
                      <select
                        value={stablefordMode}
                        onChange={(e) => setStablefordMode(e.target.value as StablefordMode)}
                        disabled={saving}
                        className={selectClassName}
                      >
                        <option value="classic">{t('adminEventsCreate.stablefordClassicLabel')}</option>
                        <option value="best_card">{t('adminEventsCreate.stablefordBestCardLabel')}</option>
                        <option value="best_hole">{t('adminEventsCreate.stablefordBestHoleLabel')}</option>
                        <option value="weekly">{t('adminEventsCreate.stablefordWeeklyLabel')}</option>
                      </select>
                    </div>

                    {stablefordMode === 'classic' && (
                      <div className="space-y-1">
                        <div className="text-xs text-gray-500">{t('adminEventsCreate.stablefordRoundsLabel')}</div>
                        <input
                          value={classicRoundsRaw}
                          onChange={(e) => setClassicRoundsRaw(e.target.value)}
                          disabled={saving}
                          className={inputClassName}
                          placeholder={t('adminEventsCreate.stablefordRoundsPlaceholder')}
                        />
                      </div>
                    )}

                    {stablefordMode === 'best_card' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <div className="text-xs text-gray-500">{t('adminEventsCreate.roundsCountLabel')}</div>
                          <input
                            value={bestCardRoundsRaw}
                            onChange={(e) => setBestCardRoundsRaw(e.target.value)}
                            disabled={saving}
                            className={inputClassName}
                            placeholder={t('adminEventsCreate.roundsMinPlaceholder')}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-gray-500">{t('adminEventsCreate.bestCardMaxAttemptsLabel')}</div>
                          <input
                            value={bestCardMaxAttemptsRaw}
                            onChange={(e) => setBestCardMaxAttemptsRaw(e.target.value)}
                            disabled={saving}
                            className={inputClassName}
                            placeholder={t('adminEventsCreate.bestCardMaxAttemptsPlaceholder')}
                          />
                        </div>
                      </div>
                    )}

                    {stablefordMode === 'best_hole' && (
                      <div className="space-y-1">
                        <div className="text-xs text-gray-500">{t('adminEventsCreate.roundsCountLabel')}</div>
                        <input
                          value={bestHoleRoundsRaw}
                          onChange={(e) => setBestHoleRoundsRaw(e.target.value)}
                          disabled={saving}
                          className={inputClassName}
                          placeholder={t('adminEventsCreate.roundsMinPlaceholder')}
                        />
                      </div>
                    )}

                    {stablefordMode === 'weekly' && (
                      <div className="space-y-2 sm:col-span-2">
                        <div className="text-xs text-gray-500">{t('adminEventsCreate.weeklyAttemptsTitle')}</div>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={weeklyAllowExtraAttempts}
                            onChange={(e) => setWeeklyAllowExtraAttempts(e.target.checked)}
                            disabled={saving}
                          />
                          {t('adminEventsCreate.weeklyAllowExtraLabel')}
                        </label>
                        {weeklyAllowExtraAttempts && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <div className="text-xs text-gray-500">{t('adminEventsCreate.weeklyMaxAttemptsLabel')}</div>
                              <input
                                value={weeklyMaxAttemptsRaw}
                                onChange={(e) => setWeeklyMaxAttemptsRaw(e.target.value)}
                                disabled={saving}
                                className={inputClassName}
                                placeholder={t('adminEventsCreate.weeklyMaxAttemptsPlaceholder')}
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
                          <div className="text-xs text-gray-500">{t('adminEventsCreate.pointsModeLabel')}</div>
                          <select
                            value={pointsMode}
                            onChange={(e) => setPointsMode(e.target.value as PointsMode)}
                            disabled={saving}
                            className={selectClassName}
                          >
                            <option value="percent">{t('adminEventsCreate.pointsModePercent')}</option>
                            <option value="manual">{t('adminEventsCreate.pointsModeManual')}</option>
                          </select>
                        </div>

                        {pointsMode === 'percent' ? (
                          <>
                            <div className="space-y-1">
                              <div className="text-xs text-gray-500">{t('adminEventsCreate.pointsFirstLabel')}</div>
                              <input
                                value={pointsFirstRaw}
                                onChange={(e) => setPointsFirstRaw(e.target.value)}
                                disabled={saving}
                                className={inputClassName}
                                placeholder="100"
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs text-gray-500">{t('adminEventsCreate.pointsDecayLabel')}</div>
                              <input
                                value={pointsDecayRaw}
                                onChange={(e) => setPointsDecayRaw(e.target.value)}
                                disabled={saving}
                                className={inputClassName}
                                placeholder="8"
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs text-gray-500">{t('adminEventsCreate.pointsPodiumLabel')}</div>
                              <input
                                value={pointsPodiumRaw}
                                onChange={(e) => setPointsPodiumRaw(e.target.value)}
                                disabled={saving}
                                className={inputClassName}
                                placeholder="3"
                              />
                            </div>
                          </>
                        ) : (
                          <div className="space-y-1 sm:col-span-2">
                            <div className="text-xs text-gray-500">{t('adminEventsCreate.pointsTableLabel')}</div>
                            <input
                              value={pointsTableRaw}
                              onChange={(e) => setPointsTableRaw(e.target.value)}
                              disabled={saving}
                              className={inputClassName}
                              placeholder={t('adminEventsCreate.pointsTablePlaceholder')}
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
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipTotal')}</div>
                            <input
                              value={champTotalRaw}
                              onChange={(e) => setChampTotalRaw(e.target.value)}
                              disabled={saving}
                              className={inputClassName}
                              placeholder="12"
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipSimple')}</div>
                            <input
                              value={champSimpleRaw}
                              onChange={(e) => setChampSimpleRaw(e.target.value)}
                              disabled={saving}
                              className={inputClassName}
                              placeholder="8"
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipDouble')}</div>
                            <input
                              value={champDoubleRaw}
                              onChange={(e) => setChampDoubleRaw(e.target.value)}
                              disabled={saving}
                              className={inputClassName}
                              placeholder="4"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipBestSimple')}</div>
                            <input
                              value={champBestSimpleRaw}
                              onChange={(e) => setChampBestSimpleRaw(e.target.value)}
                              disabled={saving}
                              className={inputClassName}
                              placeholder="6"
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipBestDouble')}</div>
                            <input
                              value={champBestDoubleRaw}
                              onChange={(e) => setChampBestDoubleRaw(e.target.value)}
                              disabled={saving}
                              className={inputClassName}
                              placeholder="3"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipCategories')}</div>
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
                                  disabled={saving}
                                />
                                {getCategoryLabel(cat, t)}

                            <div className="rounded-xl border border-gray-200 bg-white/80 p-3 space-y-2">
                              <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                                <input
                                  type="checkbox"
                                  checked={champHubEnabled}
                                  onChange={(e) => setChampHubEnabled(e.target.checked)}
                                  disabled={saving}
                                />
                                {t('adminEventsCreate.championshipHubLabel')}
                              </label>

                              {champHubEnabled && (
                                <div className="space-y-3">
                                  <div className="space-y-2">
                                    <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipCategories')}</div>
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
                                            disabled={saving}
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
                                                <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipHubEvent')}</div>
                                                <select
                                                  value={row.eventId}
                                                  onChange={(e) => {
                                                    const next = e.target.value;
                                                    setChampHubEvents((prev) => prev.map((r, i) => i === idx ? ({ ...r, eventId: next }) : r));
                                                  }}
                                                  disabled={saving}
                                                  className={selectClassName}
                                                >
                                                  <option value="">{t('adminEventsCreate.championshipHubSelect')}</option>
                                                  {associationEvents.map((ev) => (
                                                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                                                  ))}
                                                </select>
                                              </div>
                                              <div className="space-y-1">
                                                <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipHubType')}</div>
                                                <select
                                                  value={row.kind}
                                                  onChange={(e) => {
                                                    const next = e.target.value === 'doble' ? 'doble' : 'simple';
                                                    setChampHubEvents((prev) => prev.map((r, i) => i === idx ? ({ ...r, kind: next }) : r));
                                                  }}
                                                  disabled={saving}
                                                  className={selectClassName}
                                                >
                                                  <option value="simple">{t('adminEventsCreate.championshipHubTypeSimple')}</option>
                                                  <option value="doble">{t('adminEventsCreate.championshipHubTypeDouble')}</option>
                                                </select>
                                              </div>
                                              <div className="space-y-1">
                                                <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipHubPointsMode')}</div>
                                                <select
                                                  value={row.pointsMode}
                                                  onChange={(e) => {
                                                    const next = e.target.value === 'manual' ? 'manual' : 'percent';
                                                    setChampHubEvents((prev) => prev.map((r, i) => i === idx ? ({ ...r, pointsMode: next }) : r));
                                                  }}
                                                  disabled={saving}
                                                  className={selectClassName}
                                                >
                                                  <option value="percent">{t('adminEventsCreate.pointsModePercent')}</option>
                                                  <option value="manual">{t('adminEventsCreate.pointsModeManual')}</option>
                                                </select>
                                              </div>
                                            </div>

                                            {row.pointsMode === 'manual' ? (
                                              <div className="space-y-1">
                                                <div className="text-xs text-gray-500">{t('adminEventsCreate.pointsTableLabel')}</div>
                                                <input
                                                  value={row.tableRaw}
                                                  onChange={(e) => {
                                                    const next = e.target.value;
                                                    setChampHubEvents((prev) => prev.map((r, i) => i === idx ? ({ ...r, tableRaw: next }) : r));
                                                  }}
                                                  disabled={saving}
                                                  className={inputClassName}
                                                  placeholder={t('adminEventsCreate.pointsTablePlaceholder')}
                                                />
                                              </div>
                                            ) : (
                                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                <div className="space-y-1">
                                                  <div className="text-xs text-gray-500">{t('adminEventsCreate.pointsFirstLabel')}</div>
                                                  <input
                                                    value={row.firstRaw}
                                                    onChange={(e) => {
                                                      const next = e.target.value;
                                                      setChampHubEvents((prev) => prev.map((r, i) => i === idx ? ({ ...r, firstRaw: next }) : r));
                                                    }}
                                                    disabled={saving}
                                                    className={inputClassName}
                                                    placeholder="100"
                                                  />
                                                </div>
                                                <div className="space-y-1">
                                                  <div className="text-xs text-gray-500">{t('adminEventsCreate.pointsDecayLabel')}</div>
                                                  <input
                                                    value={row.decayRaw}
                                                    onChange={(e) => {
                                                      const next = e.target.value;
                                                      setChampHubEvents((prev) => prev.map((r, i) => i === idx ? ({ ...r, decayRaw: next }) : r));
                                                    }}
                                                    disabled={saving}
                                                    className={inputClassName}
                                                    placeholder="8"
                                                  />
                                                </div>
                                                <div className="space-y-1">
                                                  <div className="text-xs text-gray-500">{t('adminEventsCreate.pointsPodiumLabel')}</div>
                                                  <input
                                                    value={row.podiumRaw}
                                                    onChange={(e) => {
                                                      const next = e.target.value;
                                                      setChampHubEvents((prev) => prev.map((r, i) => i === idx ? ({ ...r, podiumRaw: next }) : r));
                                                    }}
                                                    disabled={saving}
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
                                                disabled={saving}
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
                                      disabled={saving}
                                    >
                                      <PlusCircle className="h-4 w-4" />
                                      {t('adminEventsCreate.championshipHubAdd')}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                              </label>
                            ))}
                          </div>
                        </div>
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

                      <div className="text-[11px] text-gray-600 break-all">
                        {t('adminEventsCreate.matchConfigHint')}
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
    </>
  );
}
