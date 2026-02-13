'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, DoorOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth-context';
import AssociationSelector from '@/components/AssociationSelector';
import { CATEGORY_COLORS, EventCategory } from '@/types/events';
import { useLanguage } from '@/context/language-context';

type CalendarItemKind = 'tournament' | 'announcement';

interface CalendarEvent {
  kind?: CalendarItemKind;
  id: string;
  name: string;
  date: string;
  end_date?: string | null;
  category: EventCategory;
  format?: string | null;
  location?: string | null;
  description?: string | null;
  association_id?: string | null;
}

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

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);
const toLocalIsoDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMonthCells = (year: number, month: number) => {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startOffset = (first.getDay() + 6) % 7; // Monday start
  const totalCells = Math.ceil((startOffset + last.getDate()) / 7) * 7;

  return Array.from({ length: totalCells }, (_, idx) => {
    const day = idx - startOffset + 1;
    if (day < 1 || day > last.getDate()) return null;
    return new Date(year, month, day);
  });
};

const formatMonthTitle = (date: Date, locale: string) =>
  date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }).toUpperCase();

const formatLongDate = (value: string, locale: string) => {
  const date = new Date(value);
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const getDayLabels = (locale: string) => {
  const base = new Date(2026, 0, 5);
  return Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + idx);
    return d
      .toLocaleDateString(locale, { weekday: 'short' })
      .replace('.', '')
      .toLowerCase();
  });
};

const getCellBackground = (cellEvents: CalendarEvent[]) => {
  if (cellEvents.length === 0) return undefined;

  const uniqueColors = Array.from(
    new Set(cellEvents.map((event) => CATEGORY_COLORS[event.category]))
  );

  if (uniqueColors.length === 1) {
    return uniqueColors[0];
  }

  if (uniqueColors.length === 2) {
    return `linear-gradient(90deg, ${uniqueColors[0]} 0%, ${uniqueColors[0]} 50%, ${uniqueColors[1]} 50%, ${uniqueColors[1]} 100%)`;
  }

  const slices = uniqueColors.slice(0, 6);
  const step = 360 / slices.length;
  const parts = slices.map((color, index) => {
    const start = Math.round(index * step);
    const end = Math.round((index + 1) * step);
    return `${color} ${start}deg ${end}deg`;
  });

  return `conic-gradient(${parts.join(', ')})`;
};

export default function CalendarPage() {
  const { currentAssociationId } = useAuth();
  const { t, language } = useLanguage();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'month' | 'year'>('month');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const locale = LOCALE_BY_LANGUAGE[language] || 'es-ES';

  const today = new Date();
  const [baseMonth, setBaseMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const todayIso = toLocalIsoDate(today);

  const currentMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
  const nextMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, 1);
  const currentYear = baseMonth.getFullYear();

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const year = baseMonth.getFullYear();
      const month = baseMonth.getMonth();
      const start = view === 'year'
        ? new Date(year, 0, 1)
        : new Date(year, month, 1);
      const end = view === 'year'
        ? new Date(year, 11, 31)
        : new Date(year, month + 2, 0);

      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      const qs = new URLSearchParams({
        start: toIsoDate(start),
        end: toIsoDate(end),
      });
      qs.set('association_id', currentAssociationId ? currentAssociationId : 'GLOBAL');

      const res = await fetch(`/api/calendar?${qs.toString()}`, { method: 'GET', headers });
      const json = await res.json().catch(() => null);
      const data = (json?.items || []) as any[];
      if (active) {
        const mapped = ((data as any[]) || [])
          .map((row) => {
            const dateValue = row.date;
            if (!dateValue) return null;
            return {
              kind: (row.kind as CalendarItemKind) || undefined,
              id: String(row.id),
              name: String(row.name || ''),
              date: String(dateValue),
              end_date: row.end_date ? String(row.end_date) : null,
              category: (row.category as EventCategory) ?? 'especial',
              format: row.format ?? null,
              location: row.location ?? null,
              description: row.description ?? null,
              association_id: row.association_id ?? null,
            } as CalendarEvent;
          })
          .filter(Boolean) as CalendarEvent[];

        setEvents(mapped);
        setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [currentAssociationId, baseMonth, view]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      const key = event.date.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    });
    return map;
  }, [events]);

  const renderMonth = (monthDate: Date, compact?: boolean) => {
    const cells = getMonthCells(monthDate.getFullYear(), monthDate.getMonth());
    const dayLabels = getDayLabels(locale);

    return (
      <section className={compact ? 'bg-white/90 rounded-2xl border border-white/70 p-3 shadow-sm' : 'bg-white/90 rounded-3xl border border-white/70 shadow-[0_18px_45px_rgba(15,23,42,0.08)] p-4'}>
        <div className={compact ? 'flex items-center justify-between text-xs font-semibold mb-2' : 'flex items-center justify-between text-sm font-semibold mb-4'}>
          <span className="text-gray-700">{formatMonthTitle(monthDate, locale)}</span>
        </div>
        <div className={compact ? 'grid grid-cols-7 gap-1 text-[10px] text-gray-500 mb-2' : 'grid grid-cols-7 gap-2 text-xs text-gray-500 mb-3'}>
          {dayLabels.map((label) => (
            <div key={label} className="text-center uppercase tracking-wide">{label}</div>
          ))}
        </div>
        <div className={compact ? 'grid grid-cols-7 gap-1' : 'grid grid-cols-7 gap-2'}>
          {cells.map((cell, idx) => {
            if (!cell) {
              return <div key={`empty-${idx}`} className={compact ? 'h-6' : 'h-8'} />;
            }

            const iso = toLocalIsoDate(cell);
            const cellEvents = eventsByDate.get(iso) ?? [];
            const mainEvent = cellEvents[0];
            const background = getCellBackground(cellEvents);
            const isToday = iso === todayIso;
            const ringClass = isToday
              ? compact
                ? 'ring-2 ring-violet-400 ring-offset-1 ring-offset-white'
                : 'ring-2 ring-violet-400 ring-offset-2 ring-offset-white'
              : '';

            return (
              <button
                key={iso}
                type="button"
                onClick={() => cellEvents.length > 0 && setSelectedDate(iso)}
                className={
                  compact
                    ? `h-6 rounded-full text-[11px] flex items-center justify-center ${ringClass}`
                    : `h-8 rounded-full text-sm flex items-center justify-center ${ringClass}`
                }
                style={{ background: background ?? 'transparent' }}
              >
                <span className={mainEvent ? 'font-semibold text-gray-800' : 'text-gray-700'}>
                  {cell.getDate()}
                </span>
                {cellEvents.length > 1 && (
                  <span className="sr-only">{t('calendar.moreEvents').replace('{count}', String(cellEvents.length))}</span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="min-h-screen px-4 py-5 sm:px-6 sm:py-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="premium-back-btn"
            aria-label="Atras"
          >
            <ArrowLeft className="h-4 w-4" />
            <DoorOpen className="h-4 w-4" />
          </Link>
          <AssociationSelector />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setView('month')}
            className={
              view === 'month'
                ? 'px-3 py-1 rounded-xl text-xs sm:text-sm bg-blue-500 text-white shadow-sm shadow-blue-500/30'
                : 'px-3 py-1 rounded-xl text-xs sm:text-sm bg-white/80 border border-white/70 text-gray-600'
            }
          >
            {t('calendar.monthView')}
          </button>
          <button
            type="button"
            onClick={() => setView('year')}
            className={
              view === 'year'
                ? 'px-3 py-1 rounded-xl text-xs sm:text-sm bg-blue-500 text-white shadow-sm shadow-blue-500/30'
                : 'px-3 py-1 rounded-xl text-xs sm:text-sm bg-white/80 border border-white/70 text-gray-600'
            }
          >
            {t('calendar.yearView')}
          </button>
        </div>
      </header>

      <section className="max-w-3xl mx-auto bg-white/90 backdrop-blur rounded-3xl border border-white/70 p-4 sm:p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
        <div className="mb-3">
          <h1 className="text-lg font-semibold">{t('calendar.title')}</h1>
          <p className="text-xs text-gray-500">{t('calendar.subtitle')}</p>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-gray-600 mb-5">
          {(['local', 'regional', 'nacional', 'major', 'especial'] as EventCategory[]).map((category) => (
            <div key={category} className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: CATEGORY_COLORS[category] }}
              />
              <span className="capitalize">{category}</span>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-sm text-gray-500">{t('calendar.loading')}</div>
        ) : view === 'year' ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-semibold text-gray-700">{currentYear}</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBaseMonth(new Date(currentYear - 1, 0, 1))}
                  className="px-2 py-1 text-xs border border-gray-200 rounded-xl bg-white/80"
                >
                  {t('calendar.prevYear')}
                </button>
                <button
                  type="button"
                  onClick={() => setBaseMonth(new Date(currentYear + 1, 0, 1))}
                  className="px-2 py-1 text-xs border border-gray-200 rounded-xl bg-white/80"
                >
                  {t('calendar.nextYear')}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {Array.from({ length: 12 }, (_, idx) => (
                <div key={`month-${idx}`}>{renderMonth(new Date(currentYear, idx, 1), true)}</div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-semibold text-gray-700">{formatMonthTitle(currentMonth, locale)}</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBaseMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                  className="px-2 py-1 text-xs border border-gray-200 rounded-xl bg-white/80"
                >
                  {t('calendar.prevMonth')}
                </button>
                <button
                  type="button"
                  onClick={() => setBaseMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                  className="px-2 py-1 text-xs border border-gray-200 rounded-xl bg-white/80"
                >
                  {t('calendar.nextMonth')}
                </button>
              </div>
            </div>
            {renderMonth(currentMonth)}
            {renderMonth(nextMonth)}
          </div>
        )}

        {!loading && (
          <div className="mt-6">
            <div className="text-sm font-semibold text-gray-700 mb-2">{t('calendar.allEvents')}</div>
            <div className="max-h-56 sm:max-h-64 overflow-y-auto border border-white/70 rounded-2xl bg-white/90 shadow-sm">
              {events.length === 0 ? (
                <div className="text-sm text-gray-500 p-3">{t('calendar.noEventsRange')}</div>
              ) : (
                events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedDate(event.date.slice(0, 10))}
                    className="w-full text-left px-3 py-2 border-b border-gray-100/70 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-800">{event.name}</div>
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: CATEGORY_COLORS[event.category] }}
                      />
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatLongDate(event.date, locale)}
                      {event.end_date ? ` · ${formatLongDate(event.end_date, locale)}` : ''}
                    </div>
                    {event.location && <div className="text-xs text-gray-400">{event.location}</div>}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </section>

      {selectedDate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white/95 rounded-3xl shadow-[0_24px_80px_rgba(15,23,42,0.2)] max-w-sm w-full p-4 space-y-3 border border-white/70">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold">{t('calendar.dayEvents')}</div>
                <div className="text-xs text-gray-500">{formatLongDate(selectedDate, locale)}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="text-sm text-gray-400"
              >
                {t('common.close')}
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-3">
              {(eventsByDate.get(selectedDate) ?? []).map((event) => (
                <div key={event.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-800">{event.name}</div>
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: CATEGORY_COLORS[event.category] }}
                    />
                  </div>
                  {event.end_date && (
                    <div className="text-xs text-gray-500">
                      {t('calendar.rangeLabel')}: {formatLongDate(event.date, locale)} · {formatLongDate(event.end_date, locale)}
                    </div>
                  )}
                  <div className="text-xs text-gray-500">
                    {event.kind === 'announcement'
                      ? t('calendar.announcement')
                      : (
                        <>
                          {t('calendar.formatLabel')}: <span className="capitalize">{event.format || event.category}</span>
                        </>
                      )}
                  </div>
                  {event.description && (
                    <div className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">{event.description}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
