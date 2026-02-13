'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, DoorOpen } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import AssociationSelector from '@/components/AssociationSelector';
import { CATEGORY_COLORS, EventCategory } from '@/types/events';
import { useLanguage } from '@/context/language-context';

type AssociationRow = { id: string; name: string };

type CalendarItemKind = 'tournament' | 'announcement';

interface CalendarItem {
  kind: CalendarItemKind;
  id: string;
  name: string;
  date: string;
  category: EventCategory;
  description?: string | null;
}

const toLocalIsoDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMonthCells = (year: number, month: number) => {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startOffset = (first.getDay() + 6) % 7;
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

const getLocaleForLanguage = (language: string) => {
  switch (language) {
    case 'EN':
      return 'en-GB';
    case 'PT':
      return 'pt-PT';
    case 'FR':
      return 'fr-FR';
    case 'ES':
    default:
      return 'es-ES';
  }
};

const getCellBackground = (cellItems: CalendarItem[]) => {
  if (cellItems.length === 0) return undefined;

  const uniqueColors = Array.from(new Set(cellItems.map((item) => CATEGORY_COLORS[item.category])));
  if (uniqueColors.length === 1) return uniqueColors[0];
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

function isAnnouncement(item: CalendarItem) {
  return item.kind === 'announcement';
}

export default function AdminCalendarPage() {
  const { user, profile, loading, isAdmin, currentAssociationId } = useAuth();
  const { t, language } = useLanguage();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EventCategory>('especial');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [associationNames, setAssociationNames] = useState<Record<string, string>>({});

  const locale = useMemo(() => getLocaleForLanguage(language), [language]);
  const dayLabels = useMemo(
    () => [
      t('adminCalendar.dayMon'),
      t('adminCalendar.dayTue'),
      t('adminCalendar.dayWed'),
      t('adminCalendar.dayThu'),
      t('adminCalendar.dayFri'),
      t('adminCalendar.daySat'),
      t('adminCalendar.daySun'),
    ],
    [t, language]
  );

  const today = new Date();
  const [baseMonth, setBaseMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const todayIso = toLocalIsoDate(today);

  const currentMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
  const nextMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, 1);

  const rangeStart = useMemo(() => toLocalIsoDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)), [currentMonth]);
  const rangeEnd = useMemo(() => toLocalIsoDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 2, 0)), [currentMonth]);

  const effectiveAssociationId = useMemo(() => {
    return currentAssociationId || null;
  }, [currentAssociationId, profile]);

  const isCreator = useMemo(() => {
    const roleRaw = (profile as any)?.role;
    const role = typeof roleRaw === 'string' ? roleRaw.trim().toLowerCase() : '';
    const configuredBootstrap = (process.env.NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAIL || 'mbs2026@gmail.com').trim().toLowerCase();
    const email = (user?.email || '').trim().toLowerCase();
    return role === 'creador' || (!!configuredBootstrap && email === configuredBootstrap);
  }, [profile, user?.email]);

  const canEditAnnouncements = useMemo(() => {
    // Manual announcements are per-association.
    // GLOBAL mode can only be edited by role 'creador' and will apply to ALL associations.
    return !!currentAssociationId || isCreator;
  }, [currentAssociationId, isCreator]);

  const associationLabel = useMemo(() => {
    if (!currentAssociationId) return t('adminCalendar.globalLabel');
    return associationNames[currentAssociationId] || currentAssociationId;
  }, [currentAssociationId, associationNames, t]);

  useEffect(() => {
    document.body.classList.add('premium-admin-bg');
    return () => document.body.classList.remove('premium-admin-bg');
  }, []);

  useEffect(() => {
    let active = true;
    const loadAssociations = async () => {
      try {
        const res = await fetch('/api/associations');
        const json = await res.json().catch(() => null);
        const rows = (json?.data || []) as AssociationRow[];
        if (!active) return;
        const map: Record<string, string> = {};
        rows.forEach((row) => {
          if (row?.id) map[String(row.id)] = String(row.name || row.id);
        });
        setAssociationNames(map);
      } catch {
        if (active) setAssociationNames({});
      }
    };
    void loadAssociations();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingCalendar(true);

      try {
        const sessionRes = await supabase.auth.getSession();
        const token = sessionRes?.data?.session?.access_token;
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

        const associationId = effectiveAssociationId || 'GLOBAL';
        const url = `/api/calendar?start=${encodeURIComponent(rangeStart)}&end=${encodeURIComponent(rangeEnd)}&association_id=${encodeURIComponent(associationId)}`;

        const res = await fetch(url, { method: 'GET', headers });
        const json = await res.json().catch(() => null);
        const next = (json?.items || []) as CalendarItem[];
        if (!active) return;
        setItems(next);
      } catch (e: any) {
        if (active) setMessage(e?.message || t('adminCalendar.loadError'));
      } finally {
        if (active) setLoadingCalendar(false);
      }
    };

    if (user && isAdmin) {
      void load();
    } else {
      setLoadingCalendar(false);
      setItems([]);
    }

    return () => {
      active = false;
    };
  }, [user, isAdmin, effectiveAssociationId, rangeStart, rangeEnd]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    items.forEach((item) => {
      const key = item.date.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    });
    return map;
  }, [items]);

  const announcementByDate = useMemo(() => {
    const map = new Map<string, CalendarItem>();
    items.filter(isAnnouncement).forEach((item) => {
      map.set(item.date.slice(0, 10), item);
    });
    return map;
  }, [items]);

  const itemsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [] as CalendarItem[];
    return itemsByDate.get(selectedDate) ?? [];
  }, [itemsByDate, selectedDate]);

  useEffect(() => {
    if (!selectedDate) return;
    const existing = announcementByDate.get(selectedDate);
    setTitle(existing?.name || '');
    setDescription(existing?.description || '');
    setCategory((existing?.category as EventCategory) || 'especial');
  }, [selectedDate, announcementByDate]);

  const saveAnnouncement = async () => {
    if (!selectedDate) return;
    if (!canEditAnnouncements) {
      setMessage(t('adminCalendar.globalSelectToSave'));
      return;
    }
    const nextTitle = title.trim();
    if (!nextTitle) {
      setMessage(t('adminCalendar.nameRequired'));
      return;
    }

    setSaving(true);
    setMessage(t('adminCalendar.saving'));
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const applyToAll = !currentAssociationId && isCreator;
      const associationIdToSend = applyToAll
        ? null
        : (currentAssociationId ||
            effectiveAssociationId ||
            (profile as any)?.default_association_id ||
            (profile as any)?.association_id ||
            null);

      if (!applyToAll && !associationIdToSend) {
        setMessage(t('adminCalendar.selectAssociationBeforeSave'));
        return;
      }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);

      const res = await fetch('/api/admin/calendar', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          date: selectedDate,
          title: nextTitle,
          description: description.trim() || null,
          category,
          association_id: associationIdToSend,
          apply_to_all: applyToAll,
        }),
      });

      window.clearTimeout(timeout);

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const debug = json?.debug ? ` Detalles: ${JSON.stringify(json.debug)}` : '';
        setMessage((json?.error || t('adminCalendar.saveHttpError').replace('{status}', String(res.status))) + debug);
        return;
      }
      if (!json?.ok) {
        const debug = json?.debug ? ` Detalles: ${JSON.stringify(json.debug)}` : '';
        setMessage((json?.error || t('adminCalendar.saveError')) + debug);
        return;
      }

      // Reload range for visual refresh
      const url = `/api/calendar?start=${encodeURIComponent(rangeStart)}&end=${encodeURIComponent(rangeEnd)}&association_id=${encodeURIComponent(associationIdToSend || 'GLOBAL')}`;
      const res2 = await fetch(url, { method: 'GET', headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      const json2 = await res2.json().catch(() => null);
      setItems((json2?.items || []) as CalendarItem[]);
      setMessage(applyToAll ? t('adminCalendar.savedAll') : t('adminCalendar.saved'));
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setMessage(t('adminCalendar.requestTimeout'));
      } else {
        setMessage(e?.message || t('adminCalendar.saveError'));
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteTournamentEvent = async (id: string) => {
    if (!id) return;
    const ok = window.confirm(t('adminCalendar.deleteEventConfirm'));
    if (!ok) return;

    setSaving(true);
    setMessage(null);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/admin/events', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setMessage(json?.error || t('adminCalendar.deleteEventHttpError').replace('{status}', String(res.status)));
        return;
      }

      const associationId = currentAssociationId || effectiveAssociationId;
      const url = `/api/calendar?start=${encodeURIComponent(rangeStart)}&end=${encodeURIComponent(rangeEnd)}&association_id=${encodeURIComponent(associationId || 'GLOBAL')}`;
      const res2 = await fetch(url, { method: 'GET', headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      const json2 = await res2.json().catch(() => null);
      setItems((json2?.items || []) as CalendarItem[]);
      setMessage(t('adminCalendar.eventDeleted'));
    } catch (e: any) {
      setMessage(e?.message || t('adminCalendar.deleteEventError'));
    } finally {
      setSaving(false);
    }
  };

  const deleteAnnouncement = async () => {
    if (!selectedDate) return;
    if (!canEditAnnouncements) {
      setMessage(t('adminCalendar.globalSelectToDelete'));
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const applyToAll = !currentAssociationId && isCreator;
      const associationId = applyToAll ? null : (currentAssociationId || effectiveAssociationId);
      if (!applyToAll && !associationId) {
        setMessage(t('adminCalendar.selectAssociationBeforeDelete'));
        return;
      }

      const res = await fetch('/api/admin/calendar', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ date: selectedDate, association_id: associationId, apply_to_all: applyToAll }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setMessage(json?.error || t('adminCalendar.deleteNoticeError'));
        return;
      }

      const url = associationId
        ? `/api/calendar?start=${encodeURIComponent(rangeStart)}&end=${encodeURIComponent(rangeEnd)}&association_id=${encodeURIComponent(associationId)}`
        : `/api/calendar?start=${encodeURIComponent(rangeStart)}&end=${encodeURIComponent(rangeEnd)}&association_id=GLOBAL`;
      const res2 = await fetch(url, { method: 'GET', headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      const json2 = await res2.json().catch(() => null);
      setItems((json2?.items || []) as CalendarItem[]);

      setTitle('');
      setDescription('');
      setCategory('especial');
      setMessage(applyToAll ? t('adminCalendar.deletedAll') : t('adminCalendar.deleted'));
    } finally {
      setSaving(false);
    }
  };

  const renderMonth = (monthDate: Date) => {
    const cells = getMonthCells(monthDate.getFullYear(), monthDate.getMonth());
    return (
      <section className="bg-white/90 rounded-3xl border border-white/70 shadow-[0_18px_45px_rgba(15,23,42,0.08)] p-4">
        <div className="flex items-center justify-between text-sm font-semibold mb-4">
          <span className="text-gray-700">{formatMonthTitle(monthDate, locale)}</span>
        </div>
        <div className="grid grid-cols-7 gap-2 text-xs text-gray-500 mb-3">
          {dayLabels.map((label) => (
            <div key={label} className="text-center uppercase tracking-wide">{label}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {cells.map((cell, idx) => {
            if (!cell) return <div key={`empty-${idx}`} className="h-8" />;

            const iso = toLocalIsoDate(cell);
            const cellItems = itemsByDate.get(iso) ?? [];
            const background = getCellBackground(cellItems);
            const isToday = iso === todayIso;
            const isSelected = iso === selectedDate;
            const ringClass = isSelected
              ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white'
              : isToday
                ? 'ring-2 ring-violet-400 ring-offset-2 ring-offset-white'
                : '';

            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedDate(iso)}
                className={`h-8 rounded-full text-sm flex items-center justify-center ${ringClass}`}
                style={{ background: background ?? 'transparent' }}
              >
                <span className={cellItems.length > 0 ? 'font-semibold text-gray-800' : 'text-gray-700'}>
                  {cell.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
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
          {t('common.noSession')} <Link href="/login" className="text-blue-600">{t('common.login')}</Link>
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

  const selectedAnnouncement = selectedDate ? announcementByDate.get(selectedDate) : null;

  return (
    <>
      <div className="premium-particles" />
      <div className="min-h-screen px-4 py-6 sm:px-6">
        <header className="max-w-3xl mx-auto mb-4 flex items-center justify-between">
          <div>
            <div className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">{t('adminCalendar.title')}</div>
            <div className="text-xs text-gray-700">{t('adminCalendar.subtitle')}</div>
          </div>
          <div className="flex items-center gap-2">
            <AssociationSelector />
            <Link href="/admin" className="premium-back-btn" aria-label={t('common.back')}>
              <ArrowLeft className="h-4 w-4" />
              <DoorOpen className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <main className="max-w-3xl mx-auto space-y-4">
          <section className="premium-card w-full">
            <div className="flex flex-wrap gap-3 text-xs text-gray-600 mb-5">
              {(['local', 'regional', 'nacional', 'major', 'especial'] as EventCategory[]).map((category) => (
                <div key={category} className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLORS[category] }} />
                  <span className="capitalize">
                    {category === 'local'
                      ? t('adminCalendar.categoryLocal')
                      : category === 'regional'
                        ? t('adminCalendar.categoryRegional')
                        : category === 'nacional'
                          ? t('adminCalendar.categoryNational')
                          : category === 'major'
                            ? t('adminCalendar.categoryMajor')
                            : t('adminCalendar.categorySpecial')}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="text-sm font-semibold text-gray-700">{formatMonthTitle(currentMonth, locale)}</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBaseMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                  className="px-2 py-1 text-xs border border-gray-200 rounded-xl bg-white/80"
                >
                  {t('adminCalendar.prevMonth')}
                </button>
                <button
                  type="button"
                  onClick={() => setBaseMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                  className="px-2 py-1 text-xs border border-gray-200 rounded-xl bg-white/80"
                >
                  {t('adminCalendar.nextMonth')}
                </button>
              </div>
            </div>

            {loadingCalendar ? (
              <div className="text-sm text-gray-500">{t('adminCalendar.loadingCalendar')}</div>
            ) : (
              <div className="space-y-6">
                {renderMonth(currentMonth)}
                {renderMonth(nextMonth)}
              </div>
            )}
          </section>

          <section className="premium-card w-full">
            <div className="text-sm font-extrabold text-gray-900 mb-1">{t('adminCalendar.noticeTitle')}</div>
            <div className="text-xs text-gray-600 mb-4">
              {selectedDate ? formatLongDate(selectedDate, locale) : t('adminCalendar.selectDateHint')}
            </div>

            <div className="mb-3 text-[11px] text-gray-500">
              {t('adminCalendar.selectedDateLabel')}{' '}
              <span className="font-semibold text-gray-700">{selectedDate || '-'}</span>
              {' · '}
              {t('adminCalendar.associationLabel')}{' '}
              <span className="font-semibold text-gray-700">{associationLabel}</span>
            </div>

            {!currentAssociationId && !isCreator && (
              <div className="mb-3 text-[11px] text-gray-600">
                {t('adminCalendar.globalViewOnly')}
              </div>
            )}

            {!currentAssociationId && isCreator && (
              <div className="mb-3 text-[11px] text-gray-600">
                {t('adminCalendar.globalCreatorNote')}
              </div>
            )}

            {message && (
              <div className="mb-3 text-xs text-gray-700">{message}</div>
            )}

            <div className="grid gap-3">
              <div className="space-y-1">
                <div className="text-xs text-gray-500">{t('adminCalendar.typeLabel')}</div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as EventCategory)}
                  disabled={!selectedDate || saving}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
                >
                  <option value="local">{t('adminCalendar.categoryLocal')}</option>
                  <option value="regional">{t('adminCalendar.categoryRegional')}</option>
                  <option value="nacional">{t('adminCalendar.categoryNational')}</option>
                  <option value="major">{t('adminCalendar.categoryMajor')}</option>
                  <option value="especial">{t('adminCalendar.categorySpecial')}</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-gray-500">{t('adminCalendar.eventNameLabel')}</div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!selectedDate || saving}
                  placeholder={t('adminCalendar.eventNamePlaceholder')}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
                />
              </div>

              <div className="space-y-1">
                <div className="text-xs text-gray-500">{t('adminCalendar.eventDescLabel')}</div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!selectedDate || saving}
                  rows={3}
                  placeholder={t('adminCalendar.eventDescPlaceholder')}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveAnnouncement}
                  disabled={!selectedDate || saving || !canEditAnnouncements}
                  className="px-4 py-2 rounded-xl text-sm bg-blue-600 text-white disabled:opacity-50"
                >
                  {saving ? t('adminCalendar.saving') : t('adminCalendar.save')}
                </button>
                <button
                  type="button"
                  onClick={deleteAnnouncement}
                  disabled={!selectedDate || saving || !selectedAnnouncement || !canEditAnnouncements}
                  className="px-4 py-2 rounded-xl text-sm bg-white border border-gray-200 text-gray-700 disabled:opacity-50"
                >
                  {t('adminCalendar.deleteNotice')}
                </button>
              </div>
            </div>
          </section>

          <section className="premium-card w-full">
            <div className="text-sm font-extrabold text-gray-900 mb-1">{t('adminCalendar.eventsTitle')}</div>
            <div className="text-xs text-gray-600 mb-4">
              {selectedDate ? formatLongDate(selectedDate, locale) : t('adminCalendar.selectDateShort')}
            </div>

            {!selectedDate ? (
              <div className="text-sm text-gray-500">{t('adminCalendar.selectDayToView')}</div>
            ) : itemsForSelectedDate.length === 0 ? (
              <div className="text-sm text-gray-500">{t('adminCalendar.noEvents')}</div>
            ) : (
              <div className="space-y-3">
                {itemsForSelectedDate.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-gray-200/80 bg-white/90 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                        {item.description && (
                          <div className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">{item.description}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLORS[item.category] }} />
                        {item.kind === 'tournament' && (
                          <button
                            type="button"
                            onClick={() => deleteTournamentEvent(item.id)}
                            disabled={saving}
                            className="px-3 py-1.5 rounded-xl text-xs bg-white border border-gray-200 text-gray-700 disabled:opacity-50"
                          >
                            {t('adminCalendar.deleteEvent')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </>
  );
}

