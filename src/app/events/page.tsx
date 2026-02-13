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

const formatLabel = (format: string | null | undefined, t: (key: string) => string) => {
  if (!format) return t('events.general');
  const value = format.toLowerCase();
  if (value.includes('match') || value.includes('mp')) return t('events.formatMatchPlay');
  if (value.includes('stable')) return t('events.formatStableford');
  if (value.includes('stroke')) return t('events.formatStrokePlay');
  return format;
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

const toDate = (value?: string | null) => (value ? new Date(value) : null);

const isBetween = (value: Date, start?: Date | null, end?: Date | null) => {
  if (!start || !end) return false;
  return value >= start && value <= end;
};

const isSameDay = (value: Date, target: Date) =>
  value.toDateString() === target.toDateString();

const withEventMeta = (event: EventRow, now: Date): EventMeta => {
  const eventDate = toDate(event.event_date);
  const regStart = toDate(event.registration_start);
  const regEnd = toDate(event.registration_end);
  const registrationOpen = regStart && regEnd ? isBetween(now, regStart, regEnd) : false;
  const status = event.status?.toLowerCase() ?? '';
  const inPlay = status === 'en_juego' || status === 'in_progress' || (eventDate ? isSameDay(now, eventDate) : false);
  const finished = status === 'finalizado' || status === 'finished' || (eventDate ? now > eventDate : false);
  const isMatchPlay = (event.competition_mode || '').toLowerCase().includes('match') || (event.competition_mode || '').toLowerCase().includes('mp');
  const isUpcoming = eventDate ? eventDate > now : false;

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
  const locale = LOCALE_BY_LANGUAGE[language] || 'es-ES';

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      let query = supabase
        .from('events')
        .select('id, name, status, competition_mode, registration_start, registration_end, event_date, course_id, config, registered_player_ids')
        .order('event_date', { ascending: true });

      const { data } = await query;
      if (active) {
        setEvents((data as EventRow[]) || []);
        setLoading(false);
      }
    };

    load();
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

  return (
    <div className="relative min-h-screen px-4 py-6 sm:px-6" style={{ backgroundImage: 'linear-gradient(rgba(10,16,28,0.6), rgba(10,16,28,0.6)), url(/aereo.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_55%),radial-gradient(circle_at_80%_60%,rgba(250,204,21,0.14),transparent_60%)]" />
      <header className="relative z-10 max-w-3xl mx-auto mb-4 flex items-center justify-between text-white">
        <Link href="/dashboard" className="premium-back-btn" aria-label="Atras">
          <ArrowLeft className="h-4 w-4" />
          <DoorOpen className="h-4 w-4" />
        </Link>
        <div className="text-sm text-white/70" aria-hidden="true" />
        <div className="w-12" />
      </header>

      <main className="relative z-10 mx-auto max-w-3xl space-y-5" style={{ fontFamily: "'Outfit', 'Sora', sans-serif" }}>
        <div className="text-white" aria-hidden="true" />

        <section className="bg-white/92 rounded-3xl border border-white/70 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
          <div className="text-xs font-semibold text-white mb-3">{t('events.upcomingTitle')}</div>
          {loading ? (
            <div className="text-sm text-gray-500">{t('common.loading')}</div>
          ) : topUpcoming.length === 0 ? (
            <div className="text-sm text-white">{t('events.upcomingEmpty')}</div>
          ) : (
            <div className="space-y-3">
              {topUpcoming.map((event) => {
                const { day, month } = formatDayMonth(event.event_date);
                return (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                    className="flex items-center gap-4 rounded-2xl border border-gray-200/80 bg-white/95 p-3 shadow-sm"
                  >
                    <div className="w-12 shrink-0 text-center">
                      <div className="text-sm font-semibold text-black">{day}</div>
                      <div className="mt-1 rounded-md bg-sky-200 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-black">
                        {month}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900 truncate">
                        {event.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatLabel(event.competition_mode, t)}
                      </div>
                    </div>
                    <div className="text-right text-[11px] text-gray-500">
                      {event.registrationOpen ? (
                        <div className="font-semibold text-emerald-700">{t('events.registerCta')}</div>
                      ) : null}
                      {user?.id && Array.isArray((event.config as any)?.waitlist_player_ids) &&
                      (event.config as any).waitlist_player_ids.includes(user.id) ? (
                        <div className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                          {t('events.waitlist')}
                        </div>
                      ) : null}
                    </div>
                  </Link>
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
                    className="flex items-center gap-4 rounded-2xl border border-gray-200/80 bg-white/95 p-3 shadow-sm"
                  >
                    <div className="w-12 shrink-0 text-center">
                      <div className="text-sm font-semibold text-black">{day}</div>
                      <div className="mt-1 rounded-md bg-sky-200 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-black">
                        {month}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900 truncate">
                        {event.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatLabel(event.competition_mode, t)}
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
