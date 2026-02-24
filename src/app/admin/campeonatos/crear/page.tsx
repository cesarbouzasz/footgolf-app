'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, DoorOpen, PlusCircle, X } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { supabase } from '@/lib/supabase';
import AssociationSelector from '@/components/AssociationSelector';

type EventLite = { id: string; name: string; config?: any | null };

type IncludedEventDraft = {
  eventId: string;
  kind: 'simple' | 'doble';
};

const CATEGORY_OPTIONS = ['General', 'Masculino', 'Femenino', 'Senior', 'Senior+', 'Junior'];

function isChampionshipEventRow(eventLike: any) {
  const config = eventLike?.config || {};
  return !!config?.isChampionship || !!config?.championshipHub?.enabled;
}

export default function AdminCrearCampeonatoPage() {
  const { user, profile, loading, isAdmin, currentAssociationId } = useAuth();
  const { t } = useLanguage();

  const nameRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('inscripcion');

  const [champTotalRaw, setChampTotalRaw] = useState('');
  const [champSimpleRaw, setChampSimpleRaw] = useState('');
  const [champDoubleRaw, setChampDoubleRaw] = useState('');
  const [champBestSimpleRaw, setChampBestSimpleRaw] = useState('');
  const [champBestDoubleRaw, setChampBestDoubleRaw] = useState('');
  const [champCategories, setChampCategories] = useState<string[]>(CATEGORY_OPTIONS);

  const [availableEvents, setAvailableEvents] = useState<EventLite[]>([]);
  const [includedEvents, setIncludedEvents] = useState<IncludedEventDraft[]>([]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  useEffect(() => {
    document.body.classList.add('premium-admin-bg');
    return () => document.body.classList.remove('premium-admin-bg');
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => nameRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const loadEvents = async () => {
      if (!currentAssociationId) {
        if (active) setAvailableEvents([]);
        return;
      }

      const { data, error } = await supabase
        .from('events')
        .select('id, name, config')
        .eq('association_id', currentAssociationId)
        .order('event_date', { ascending: false });

      if (!active) return;
      if (error) {
        setAvailableEvents([]);
        return;
      }

      const rows = ((data as any[]) || []).map((row) => ({
        id: String(row.id),
        name: String(row.name || ''),
        config: row.config || null,
      }));

      setAvailableEvents(rows.filter((row) => !isChampionshipEventRow(row)));
    };

    void loadEvents();
    return () => {
      active = false;
    };
  }, [currentAssociationId]);

  const canSave = useMemo(() => {
    if (!currentAssociationId) return false;
    if (!name.trim()) return false;
    if (!eventDate) return false;
    if (!champCategories.length) return false;

    const total = Number.parseInt(champTotalRaw, 10);
    const simple = champSimpleRaw.trim() ? Number.parseInt(champSimpleRaw, 10) : 0;
    const doble = champDoubleRaw.trim() ? Number.parseInt(champDoubleRaw, 10) : 0;
    const bestSimple = champBestSimpleRaw.trim() ? Number.parseInt(champBestSimpleRaw, 10) : 0;
    const bestDouble = champBestDoubleRaw.trim() ? Number.parseInt(champBestDoubleRaw, 10) : 0;

    if (!Number.isFinite(total) || total < 1) return false;
    if (!Number.isFinite(simple) || simple < 0) return false;
    if (!Number.isFinite(doble) || doble < 0) return false;
    if (simple + doble > total) return false;
    if (!Number.isFinite(bestSimple) || bestSimple < 0) return false;
    if (!Number.isFinite(bestDouble) || bestDouble < 0) return false;
    if (bestSimple > simple || bestDouble > doble) return false;

    return true;
  }, [champBestDoubleRaw, champBestSimpleRaw, champCategories, champDoubleRaw, champSimpleRaw, champTotalRaw, currentAssociationId, eventDate, name]);

  const handleCreate = async () => {
    if (!canSave) {
      setErrorMsg('Revisa los campos obligatorios del campeonato.');
      setOkMsg(null);
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setOkMsg(null);
    setShowSuccessToast(false);

    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const total = Number.parseInt(champTotalRaw, 10);
      const simple = champSimpleRaw.trim() ? Number.parseInt(champSimpleRaw, 10) : 0;
      const doble = champDoubleRaw.trim() ? Number.parseInt(champDoubleRaw, 10) : 0;
      const bestSimple = champBestSimpleRaw.trim() ? Number.parseInt(champBestSimpleRaw, 10) : 0;
      const bestDouble = champBestDoubleRaw.trim() ? Number.parseInt(champBestDoubleRaw, 10) : 0;

      const championshipEvents = includedEvents
        .filter((row) => row.eventId)
        .map((row) => ({
          eventId: row.eventId,
          kind: row.kind,
          pointsMode: 'percent',
          first: 100,
          decayPercent: 8,
          podiumCount: 3,
          table: [],
        }));

      const payload = {
        association_id: currentAssociationId,
        name: name.trim(),
        event_date: eventDate,
        registration_start: null,
        registration_end: null,
        competition_mode: 'stableford',
        status,
        description: description.trim() || null,
        course_id: null,
        has_handicap_ranking: false,
        competitions: [
          {
            type: 'individual',
            name: `${name.trim()} - Individual`,
            registration_start: null,
            registration_end: null,
            course_id: null,
            status,
            status_mode: 'auto',
            max_players: null,
            config: {
              prices: [],
              stableford: {
                mode: 'classic',
                pairsMode: 'copa_canada',
                classicRounds: 1,
                bestCardRounds: null,
                bestCardMaxAttempts: null,
                bestHoleRounds: null,
                attemptsByUser: {},
                classicPoints: {
                  mode: 'percent',
                  first: 100,
                  decayPercent: 8,
                  podiumCount: 3,
                  table: [],
                },
              },
            },
          },
        ],
        config: {
          primaryCompetitionType: 'individual',
          isChampionship: true,
          championship: {
            enabled: true,
            totalEvents: total,
            simpleEvents: simple,
            doubleEvents: doble,
            bestSimpleCount: bestSimple,
            bestDoubleCount: bestDouble,
            categories: champCategories,
          },
          championshipHub: {
            enabled: true,
            categories: champCategories,
            events: championshipEvents,
          },
        },
      };

      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErrorMsg(String(json?.error || `HTTP ${res.status}`));
        return;
      }

      setCreatedId(String(json.id || ''));
      setOkMsg('Campeonato creado correctamente.');
      setShowSuccessToast(true);
      setName('');
      setEventDate('');
      setDescription('');
      setStatus('inscripcion');
      setChampTotalRaw('');
      setChampSimpleRaw('');
      setChampDoubleRaw('');
      setChampBestSimpleRaw('');
      setChampBestDoubleRaw('');
      setChampCategories(CATEGORY_OPTIONS);
      setIncludedEvents([]);
    } catch (e: any) {
      setErrorMsg(e?.message || 'No se pudo crear el campeonato.');
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
          {t('common.noSession')}{' '}
          <Link href="/login" className="text-blue-600">{t('common.login')}</Link>
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
            <div className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">{t('adminChampionshipsCreate.title')}</div>
            <div className="text-xs text-gray-700">{t('adminChampionshipsCreate.subtitle')}</div>
          </div>
          <Link href="/admin/eventos" className="premium-back-btn" aria-label={t('common.back')}>
            <ArrowLeft className="h-4 w-4" />
            <DoorOpen className="h-4 w-4" />
          </Link>
        </header>

        <main className="max-w-3xl mx-auto space-y-4">
          {!currentAssociationId ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {t('adminEventsCreate.selectAssociationWarn')}
            </div>
          ) : null}

          <div className="rounded-2xl border border-gray-200 bg-white/80 p-4 space-y-4">
            <AssociationSelector />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <div className="text-xs text-gray-500">{t('adminEventsCreate.nameLabel')}</div>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
                  placeholder="Ej: Campeonato España 2027"
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-gray-500">{t('adminEventsCreate.startDateLabel')}</div>
                <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} disabled={saving} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white" />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-gray-500">{t('adminEventsCreate.statusLabel')}</div>
                <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={saving} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white">
                  <option value="inscripcion">Abierto</option>
                  <option value="en_juego">En juego</option>
                  <option value="cerrado">Cerrado</option>
                </select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <div className="text-xs text-gray-500">{t('adminEventsCreate.descriptionLabel')}</div>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white min-h-[88px]" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white/80 p-4 space-y-3">
            <div className="text-sm font-extrabold text-gray-900">{t('adminChampionshipsCreate.rulesTitle')}</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipTotal')}</div>
                <input value={champTotalRaw} onChange={(e) => setChampTotalRaw(e.target.value)} disabled={saving} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white" placeholder="12" />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipSimple')}</div>
                <input value={champSimpleRaw} onChange={(e) => setChampSimpleRaw(e.target.value)} disabled={saving} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white" placeholder="8" />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipDouble')}</div>
                <input value={champDoubleRaw} onChange={(e) => setChampDoubleRaw(e.target.value)} disabled={saving} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white" placeholder="4" />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipBestSimple')}</div>
                <input value={champBestSimpleRaw} onChange={(e) => setChampBestSimpleRaw(e.target.value)} disabled={saving} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white" placeholder="6" />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipBestDouble')}</div>
                <input value={champBestDoubleRaw} onChange={(e) => setChampBestDoubleRaw(e.target.value)} disabled={saving} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white" placeholder="3" />
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
                          return prev.filter((item) => item !== cat);
                        });
                      }}
                      disabled={saving}
                    />
                    {cat}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white/80 p-4 space-y-3">
            <div className="text-sm font-extrabold text-gray-900">{t('adminChampionshipsCreate.testsTitle')}</div>
            {includedEvents.length === 0 ? (
              <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipHubEmpty')}</div>
            ) : (
              <div className="space-y-2">
                {includedEvents.map((row, idx) => {
                  const event = availableEvents.find((item) => item.id === row.eventId);
                  return (
                    <div key={`inc-${idx}`} className="rounded-xl border border-gray-200 bg-white p-3 grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2">
                      <select
                        value={row.eventId}
                        onChange={(e) => {
                          const next = e.target.value;
                          setIncludedEvents((prev) => prev.map((item, i) => (i === idx ? { ...item, eventId: next } : item)));
                        }}
                        disabled={saving}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
                      >
                        <option value="">{t('adminEventsCreate.championshipHubSelect')}</option>
                        {availableEvents.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>

                      <select
                        value={row.kind}
                        onChange={(e) => {
                          const next = e.target.value === 'doble' ? 'doble' : 'simple';
                          setIncludedEvents((prev) => prev.map((item, i) => (i === idx ? { ...item, kind: next } : item)));
                        }}
                        disabled={saving}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
                      >
                        <option value="simple">{t('adminEventsCreate.championshipHubTypeSimple')}</option>
                        <option value="doble">{t('adminEventsCreate.championshipHubTypeDouble')}</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => setIncludedEvents((prev) => prev.filter((_, i) => i !== idx))}
                        className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                        disabled={saving}
                      >
                        {t('adminEventsCreate.remove')}
                      </button>

                      {event ? (
                        <div className="sm:col-span-3 text-[11px] text-gray-500">
                          {event.name}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => setIncludedEvents((prev) => [...prev, { eventId: '', kind: 'simple' }])}
              className="inline-flex items-center gap-2 text-xs text-blue-700"
              disabled={saving}
            >
              <PlusCircle className="h-4 w-4" />
              {t('adminEventsCreate.championshipHubAdd')}
            </button>
          </div>

          {errorMsg ? <div className="text-xs text-red-700">{errorMsg}</div> : null}
          {okMsg ? <div className="text-xs text-emerald-700">{okMsg}</div> : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving || !canSave}
              className="rounded-xl px-4 py-2 text-sm font-semibold bg-blue-600 text-white disabled:opacity-60"
            >
              {saving ? t('adminEventsCreate.saving') : t('adminChampionshipsCreate.createButton')}
            </button>
            {createdId ? (
              <Link href={`/events/${createdId}`} className="text-xs text-blue-700 underline">
                {t('adminChampionshipsCreate.viewStandings')}
              </Link>
            ) : null}
            <Link href="/admin/campeonatos/gestionar" className="text-xs text-gray-600 underline">
              {t('adminChampionshipsCreate.manageLink')}
            </Link>
          </div>
        </main>
      </div>

      {showSuccessToast && okMsg ? (
        <div className="fixed bottom-4 right-4 z-[70] w-[min(92vw,380px)] rounded-2xl border border-emerald-200 bg-white/95 backdrop-blur-md shadow-[0_16px_40px_-20px_rgba(16,185,129,0.65)]">
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-emerald-800">{okMsg}</div>
                  <div className="text-xs text-emerald-700/90">El campeonato se ha guardado correctamente.</div>
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
                  Ver campeonato
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
      ) : null}
    </>
  );
}
