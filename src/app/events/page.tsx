'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, DoorOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';

interface EventRow {
  id: string;
  name: string;
  status: string | null;
  competition_mode: string | null;
  registration_start: string | null;
  registration_end: string | null;
  event_date: string | null;
  course_id: string | null;
  config: any;
  registered_player_ids: string[] | null;
}

type EventMeta = EventRow & {
  eventDate: Date | null;
  registrationOpen: boolean;
  inPlay: boolean;
  finished: boolean;
  isMatchPlay: boolean;
  isUpcoming: boolean;
};

type PendingAction = 'subscribe' | 'unsubscribe';
type Feedback = { type: 'success' | 'error'; text: string };

const formatLabel = (format: string | null | undefined, t: (key: string) => string) => {
  if (!format) return t('events.general');
  const value = format.toLowerCase();
  if (value.includes('match') || value.includes('mp')) return t('events.formatMatchPlay');
  if (value.includes('stable')) return t('events.formatStableford');
  if (value.includes('stroke')) return t('events.formatStrokePlay');
  return format;
};

const formatEventStatus = (status: string | null | undefined, t: (key: string) => string) => {
  const value = String(status || '').trim().toLowerCase();
  if (!value) return t('events.pendingStatus');
  if (value === 'inscripcion') return t('events.statusOpen');
  if (value === 'en_juego') return t('events.statusInGame');
  if (value === 'cerrado') return t('events.statusClosed');
  return String(status || '').trim() || t('events.pendingStatus');
};

const statusBadgeClass = (status: string | null | undefined) => {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'inscripcion') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (value === 'en_juego') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (value === 'cerrado') return 'border-slate-300 bg-slate-100 text-slate-700';
  return 'border-gray-200 bg-gray-100 text-gray-700';
};

const upcomingCardClass = (isMatchPlay: boolean) => {
  if (isMatchPlay) {
    return 'rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-200/90 via-amber-100/85 to-yellow-100/85 p-3 shadow-[0_12px_36px_rgba(251,191,36,0.3)]';
  }
  return 'rounded-2xl border border-gray-200/80 bg-white/90 p-3 shadow-sm';
};

const finishedCardClass = () => {
  return 'flex items-center gap-4 rounded-2xl border border-pink-300/90 bg-pink-100/95 p-3 shadow-sm';
};

const LOCALE_BY_LANGUAGE: Record<string, string> = {
  ES: 'es-ES',
  EN: 'en-US',
  PT: 'pt-PT',
  FR: 'fr-FR',
  IT: 'it-IT',
  SV: 'sv-SE',
  SK: 'sk-SK',
  TR: 'tr-TR',
};

const toDate = (value?: string | null) => {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return new Date(`${normalized}T00:00:00`);
};

const normalizeIdArray = (value: any): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x || '').trim()).filter(Boolean);
};

const isBetween = (value: Date, start?: Date | null, end?: Date | null) => {
  if (!start || !end) return false;
  return value >= start && value <= end;
};

const isRegistrationOpenAt = (value: Date, start?: Date | null, end?: Date | null) => {
  if (!start && !end) return true;
  if (start && !end) return value >= start;
  if (!start && end) return value <= end;
  return isBetween(value, start, end);
};

const isSameDay = (value: Date, target: Date) =>
  value.toDateString() === target.toDateString();

const withEventMeta = (event: EventRow, now: Date): EventMeta => {
  const eventDate = toDate(event.event_date);
  const regStart = toDate(event.registration_start);
  const regEnd = toDate(event.registration_end);
  const registrationOpen = isRegistrationOpenAt(now, regStart, regEnd);
  const status = (event.status || '').trim().toLowerCase();
  const inPlay = ['en_juego', 'in_progress', 'started', 'playing', 'live'].includes(status);
  const finished = ['finalizado', 'finished', 'cerrado', 'closed'].includes(status);
  const isMatchPlay = (event.competition_mode || '').toLowerCase().includes('match') || (event.competition_mode || '').toLowerCase().includes('mp');
  const isUpcoming = !finished && !inPlay;

  return {
    ...event,
    eventDate,
    registrationOpen,
    inPlay,
    finished,
    isMatchPlay,
    isUpcoming,
  };
};

export default function EventsPage() {
  const { currentAssociationId, user } = useAuth();
  const { t, language } = useLanguage();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyByEventId, setBusyByEventId] = useState<Record<string, boolean>>({});
  const [pendingByEventId, setPendingByEventId] = useState<Record<string, PendingAction | null>>({});
  const [feedbackByEventId, setFeedbackByEventId] = useState<Record<string, Feedback | null>>({});
  const locale = LOCALE_BY_LANGUAGE[language] || 'es-ES';

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('events')
        .select('id, name, status, competition_mode, registration_start, registration_end, event_date, course_id, config, registered_player_ids')
        .order('event_date', { ascending: true });

      if (active) {
        setEvents((data as EventRow[]) || []);
        setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [currentAssociationId]);

  const eventMeta = useMemo(() => {
    const now = new Date();
    return events.map((event) => withEventMeta(event, now));
  }, [events]);

  const upcomingEvents = useMemo(() => {
    return eventMeta
      .filter((event) => event.isUpcoming && !event.finished)
      .slice()
      .sort((a, b) => (a.eventDate?.getTime() || 0) - (b.eventDate?.getTime() || 0));
  }, [eventMeta]);

  const topUpcoming = useMemo(() => upcomingEvents.slice(0, 4), [upcomingEvents]);

  const finishedEvents = useMemo(() => {
    return eventMeta
      .filter((event) => event.finished)
      .slice()
      .sort((a, b) => (b.eventDate?.getTime() || 0) - (a.eventDate?.getTime() || 0));
  }, [eventMeta]);

  const filteredFinished = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return finishedEvents.slice(0, 4);
    return finishedEvents.filter((event) => event.name.toLowerCase().includes(q)).slice(0, 4);
  }, [finishedEvents, search]);

  const formatDayMonth = (dateStr: string | null) => {
    if (!dateStr) return { day: '--', month: '---' };
    try {
      const d = new Date(`${dateStr}T00:00:00`);
      const day = d.toLocaleDateString(locale, { day: '2-digit' });
      const month = d.toLocaleDateString(locale, { month: 'short' }).replace('.', '').toUpperCase();
      return { day, month };
    } catch {
      return { day: '--', month: '---' };
    }
  };

  const patchRegistrationState = (eventId: string, nextRegistered: string[], nextWaitlist: string[]) => {
    setEvents((prev) => prev.map((event) => {
      if (event.id !== eventId) return event;
      return {
        ...event,
        registered_player_ids: nextRegistered,
        config: {
          ...(event.config || {}),
          waitlist_player_ids: nextWaitlist,
        },
      };
    }));
  };

  const setBusy = (eventId: string, value: boolean) => {
    setBusyByEventId((prev) => ({ ...prev, [eventId]: value }));
  };

  const setPending = (eventId: string, value: PendingAction | null) => {
    setPendingByEventId((prev) => ({ ...prev, [eventId]: value }));
  };

  const setFeedback = (eventId: string, feedback: Feedback | null) => {
    setFeedbackByEventId((prev) => ({ ...prev, [eventId]: feedback }));
  };

  const confirmAction = async (event: EventMeta, action: PendingAction) => {
    if (!user?.id) return;

    setBusy(event.id, true);
    setFeedback(event.id, null);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      const method = action === 'subscribe' ? 'POST' : 'DELETE';

      const res = await fetch(`/api/events/${encodeURIComponent(event.id)}/registration`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setFeedback(event.id, {
          type: 'error',
          text: String(json?.error || (action === 'subscribe' ? t('events.errorRegistering') : t('events.errorCanceling'))),
        });
        return;
      }

      const nextRegistered = normalizeIdArray(json?.registered_player_ids);
      const nextWaitlist = normalizeIdArray(json?.waitlist_player_ids);
      patchRegistrationState(event.id, nextRegistered, nextWaitlist);
      setFeedback(event.id, {
        type: 'success',
        text: String(json?.message || t('events.registrationUpdated')),
      });
      setPending(event.id, null);
    } finally {
      setBusy(event.id, false);
    }
  };

  return (
    <div className="relative min-h-screen px-4 py-6 sm:px-6">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: 'linear-gradient(rgba(10,16,28,0.6), rgba(10,16,28,0.6)), url(/aereo.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_55%),radial-gradient(circle_at_80%_60%,rgba(250,204,21,0.14),transparent_60%)]" />
      <header className="relative z-10 max-w-3xl mx-auto mb-4 flex items-center justify-between text-white">
        <Link href="/dashboard" className="premium-back-btn" aria-label={t('common.back')}>
          <ArrowLeft className="h-4 w-4" />
          <DoorOpen className="h-4 w-4" />
        </Link>
        <div className="text-sm text-white/70" aria-hidden="true" />
        <div className="w-12" />
      </header>

      <main className="relative z-10 mx-auto max-w-3xl space-y-5" style={{ fontFamily: "'Outfit', 'Sora', sans-serif" }}>
        <div className="text-white" aria-hidden="true" />

        <section className="bg-transparent rounded-3xl border border-white/70 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.16)]">
          <div className="text-xs font-semibold text-white mb-3">{t('events.upcomingTitle')}</div>
          {loading ? (
            <div className="text-sm text-gray-500">{t('common.loading')}</div>
          ) : topUpcoming.length === 0 ? (
            <div className="text-sm text-white">{t('events.upcomingEmpty')}</div>
          ) : (
            <div className="space-y-3">
              {topUpcoming.map((event) => {
                const { day, month } = formatDayMonth(event.event_date);
                const waitlistIds = normalizeIdArray((event.config as any)?.waitlist_player_ids);
                const registeredIds = normalizeIdArray(event.registered_player_ids);
                const isRegistered = !!user?.id && registeredIds.includes(user.id);
                const isWaitlist = !!user?.id && waitlistIds.includes(user.id);
                const isBusy = !!busyByEventId[event.id];
                const canSelfCancel = event.registrationOpen && (isRegistered || isWaitlist);
                const pending = pendingByEventId[event.id];
                const feedback = feedbackByEventId[event.id];

                return (
                  <div key={event.id} className={upcomingCardClass(event.isMatchPlay)}>
                    <div className="flex items-start gap-3">
                      <Link href={`/events/${event.id}`} className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                        <div className="w-12 shrink-0 text-center">
                          <div className="text-sm font-semibold text-black">{day}</div>
                          <div className="mt-1 rounded-md bg-sky-200 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-black">
                            {month}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-gray-900 truncate">{event.name}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                            <span>{formatLabel(event.competition_mode, t)}</span>
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(event.status)}`}>
                              {formatEventStatus(event.status, t)}
                            </span>
                          </div>
                        </div>
                      </Link>

                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {isWaitlist ? (
                          <div className="inline-flex rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            {t('events.waitlist')}
                          </div>
                        ) : null}
                        {isRegistered ? (
                          <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                            {t('events.registered')}
                          </div>
                        ) : null}

                        {canSelfCancel ? (
                          <button
                            type="button"
                            onClick={() => setPending(event.id, pending === 'unsubscribe' ? null : 'unsubscribe')}
                            disabled={isBusy}
                            className="rounded-full border border-rose-200 bg-rose-50 px-2.5 sm:px-3 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-60"
                          >
                            {isBusy ? t('common.loading') : t('events.unregisterCta')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPending(event.id, pending === 'subscribe' ? null : 'subscribe')}
                            disabled={isBusy || !user?.id || !event.registrationOpen || isRegistered || isWaitlist}
                            className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 sm:px-3 py-1 text-[11px] font-semibold text-emerald-700 disabled:opacity-60"
                          >
                            {isBusy
                              ? t('common.loading')
                              : event.registrationOpen
                                ? t('events.registerCta')
                                : t('events.registrationClosed')}
                          </button>
                        )}
                      </div>
                    </div>

                    {pending ? (
                      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-[11px] text-slate-700">
                          {pending === 'subscribe' ? t('events.registerConfirm') : t('events.unregisterConfirm')}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void confirmAction(event, pending)}
                            disabled={isBusy}
                            className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-700 disabled:opacity-60"
                          >
                            {t('common.confirm')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPending(event.id, null)}
                            disabled={isBusy}
                            className="rounded-full border border-gray-300 bg-white px-3 py-1 text-[11px] font-semibold text-gray-700 disabled:opacity-60"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {feedback ? (
                      <div
                        className={
                          feedback.type === 'success'
                            ? 'mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700'
                            : 'mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700'
                        }
                      >
                        {feedback.text}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-white/92 rounded-3xl border border-white/70 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
          <div className="text-xs font-semibold text-white mb-2">{t('events.searchTitle')}</div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('events.searchPlaceholder')}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </section>

        <section className="bg-white/92 rounded-3xl border border-white/70 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
          <div className="text-xs font-semibold text-white mb-3">{t('events.finishedTitle')}</div>
          {loading ? (
            <div className="text-sm text-gray-500">{t('common.loading')}</div>
          ) : filteredFinished.length === 0 ? (
            <div className="text-sm text-gray-500">{t('events.finishedEmpty')}</div>
          ) : (
            <div className="space-y-3">
              {filteredFinished.map((event) => {
                const { day, month } = formatDayMonth(event.event_date);
                return (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                    className={finishedCardClass()}
                  >
                    <div className="w-12 shrink-0 text-center">
                      <div className="text-sm font-semibold text-black">{day}</div>
                      <div className="mt-1 rounded-md bg-sky-200 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-black">
                        {month}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900 truncate">{event.name}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                        <span>{formatLabel(event.competition_mode, t)}</span>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(event.status)}`}>
                          {formatEventStatus(event.status, t)}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
