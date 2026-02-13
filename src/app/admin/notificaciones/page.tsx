'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, DoorOpen, Bell, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import AssociationSelector from '@/components/AssociationSelector';
import { useLanguage } from '@/context/language-context';

type AdminMessage = {
  id: string;
  association_id: string | null;
  created_by: string | null;
  created_by_email: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
};

type EventOption = {
  id: string;
  name: string;
  event_date: string | null;
};

type PlayerOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type TournamentNotificationRow = {
  id: string;
  event_id: string;
  event_name: string;
  event_date: string | null;
  message: string;
  audience: string;
  is_active: boolean;
  created_at: string;
};

type AssociationNotificationRow = {
  id: string;
  association_id: string | null;
  message: string;
  is_active: boolean;
  created_at: string;
};

function resolveLocale(language: string) {
  switch (language) {
    case 'EN':
      return 'en-US';
    case 'PT':
      return 'pt-PT';
    case 'FR':
      return 'fr-FR';
    case 'IT':
      return 'it-IT';
    case 'SV':
      return 'sv-SE';
    case 'SK':
      return 'sk-SK';
    case 'TR':
      return 'tr-TR';
    default:
      return 'es-ES';
  }
}

function formatDate(dateStr: string | null, locale: string) {
  if (!dateStr) return '';
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: '2-digit' });
  } catch {
    return String(dateStr);
  }
}

export default function AdminNotificacionesPage() {
  const { user, profile, loading, isAdmin, currentAssociationId } = useAuth();
  const { t, language } = useLanguage();
  const locale = resolveLocale(language);
  const [items, setItems] = useState<AdminMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [missingTable, setMissingTable] = useState(false);

  const [events, setEvents] = useState<EventOption[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [notifEventId, setNotifEventId] = useState('');
  const [notifAudience, setNotifAudience] = useState<'all' | 'selected'>('all');
  const [notifPlayerSearch, setNotifPlayerSearch] = useState('');
  const [notifPlayerIds, setNotifPlayerIds] = useState<string[]>([]);
  const [notifMessage, setNotifMessage] = useState('');
  const [notifStatus, setNotifStatus] = useState<{ type: 'idle' | 'saving' | 'success' | 'error'; message?: string }>(
    { type: 'idle' }
  );
  const [recentNotifs, setRecentNotifs] = useState<TournamentNotificationRow[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  const [assocMessage, setAssocMessage] = useState('');
  const [assocStatus, setAssocStatus] = useState<{ type: 'idle' | 'saving' | 'success' | 'error'; message?: string }>(
    { type: 'idle' }
  );
  const [recentAssocNotifs, setRecentAssocNotifs] = useState<AssociationNotificationRow[]>([]);
  const [recentAssocLoading, setRecentAssocLoading] = useState(false);

  const unreadIds = useMemo(() => items.filter((m) => !m.is_read).map((m) => m.id), [items]);

  const getAuthHeaders = async () => {
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const load = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/messages?limit=80', { method: 'GET', headers: await getAuthHeaders() });
      const json = await res.json().catch(() => ({}));
      const rows = Array.isArray(json?.messages) ? (json.messages as AdminMessage[]) : [];
      setItems(rows);
      setMissingTable(json?.missingTable === true);
    } finally {
      setBusy(false);
    }
  };

  const loadEventsAndPlayers = async () => {
    const assoc = String(currentAssociationId || '').trim();
    if (!assoc) {
      setEvents([]);
      setPlayers([]);
      return;
    }

    const [eventsRes, playersRes] = await Promise.all([
      fetch(`/api/admin/events/list?association_id=${encodeURIComponent(assoc)}`, {
        method: 'GET',
        headers: await getAuthHeaders(),
      }),
      fetch(`/api/players?association_id=${encodeURIComponent(assoc)}`, {
        method: 'GET',
        headers: await getAuthHeaders(),
      }),
    ]);

    const eventsJson = await eventsRes.json().catch(() => ({}));
    const playersJson = await playersRes.json().catch(() => ({}));

    const nextEvents = Array.isArray(eventsJson?.events) ? (eventsJson.events as EventOption[]) : [];
    const nextPlayersRaw = Array.isArray(playersJson?.players) ? (playersJson.players as any[]) : [];

    setEvents(
      nextEvents.map((e) => ({
        id: String((e as any).id),
        name: String((e as any).name || ''),
        event_date: (e as any).event_date ? String((e as any).event_date) : null,
      }))
    );

    setPlayers(
      nextPlayersRaw.map((p) => ({
        id: String(p.id),
        first_name: p.first_name ?? null,
        last_name: p.last_name ?? null,
      }))
    );
  };

  const loadRecentNotifications = async () => {
    setRecentLoading(true);
    try {
      const res = await fetch('/api/admin/tournament-notifications?limit=30', {
        method: 'GET',
        headers: await getAuthHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      const rows = Array.isArray(json?.notifications) ? (json.notifications as TournamentNotificationRow[]) : [];
      setRecentNotifs(rows);
    } finally {
      setRecentLoading(false);
    }
  };

  const loadRecentAssociationNotifications = async () => {
    setRecentAssocLoading(true);
    try {
      const res = await fetch('/api/admin/association-notifications?limit=30', {
        method: 'GET',
        headers: await getAuthHeaders(),
      });
      const json = await res.json().catch(() => ({}));
      const rows = Array.isArray(json?.notifications) ? (json.notifications as AssociationNotificationRow[]) : [];
      setRecentAssocNotifs(rows);
    } finally {
      setRecentAssocLoading(false);
    }
  };

  const sendAssociationNotification = async () => {
    if (!currentAssociationId) {
      setAssocStatus({ type: 'error', message: t('adminNotifications.selectAssociation') });
      return;
    }
    const msg = assocMessage.trim();
    if (!msg) {
      setAssocStatus({ type: 'error', message: t('adminNotifications.writeMessage') });
      return;
    }

    setAssocStatus({ type: 'saving', message: t('adminNotifications.sending') });

    const res = await fetch('/api/admin/association-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
      body: JSON.stringify({
        association_id: currentAssociationId,
        message: msg,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAssocStatus({ type: 'error', message: json?.error || t('adminNotifications.sendError') });
      return;
    }

    setAssocStatus({ type: 'success', message: t('adminNotifications.noticeSent') });
    setAssocMessage('');
    await loadRecentAssociationNotifications();
  };

  const sendTournamentNotification = async () => {
    if (!notifEventId) {
      setNotifStatus({ type: 'error', message: t('adminNotifications.selectEvent') });
      return;
    }
    const msg = notifMessage.trim();
    if (!msg) {
      setNotifStatus({ type: 'error', message: t('adminNotifications.writeMessage') });
      return;
    }
    if (notifAudience === 'selected' && notifPlayerIds.length === 0) {
      setNotifStatus({ type: 'error', message: t('adminNotifications.selectPlayers') });
      return;
    }

    setNotifStatus({ type: 'saving', message: t('adminNotifications.sending') });

    const res = await fetch('/api/admin/tournament-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
      body: JSON.stringify({
        event_id: notifEventId,
        message: msg,
        audience: notifAudience,
        player_ids: notifAudience === 'selected' ? notifPlayerIds : [],
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNotifStatus({ type: 'error', message: json?.error || t('adminNotifications.sendError') });
      return;
    }

    setNotifStatus({ type: 'success', message: t('adminNotifications.notificationSent') });
    setNotifMessage('');
    setNotifPlayerIds([]);
    await loadRecentNotifications();
  };

  const markAllRead = async () => {
    if (!unreadIds.length) return;
    setBusy(true);
    try {
      await fetch('/api/admin/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ ids: unreadIds }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    document.body.classList.add('premium-admin-bg');
    return () => document.body.classList.remove('premium-admin-bg');
  }, []);

  useEffect(() => {
    if (!user || !profile || !isAdmin) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin]);

  useEffect(() => {
    if (!user || !profile || !isAdmin) return;
    void loadEventsAndPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin, currentAssociationId]);

  useEffect(() => {
    if (!user || !profile || !isAdmin) return;
    void loadRecentNotifications();
    void loadRecentAssociationNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin, currentAssociationId]);

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
            <div className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
              <Bell className="h-5 w-5" /> {t('adminNotifications.title')}
            </div>
            <div className="text-xs text-gray-700">{t('adminNotifications.subtitle')}</div>
          </div>
          <div className="flex items-center gap-2">
            <AssociationSelector />
            <Link href="/admin" className="premium-back-btn" aria-label={t('common.back')}>
              <ArrowLeft className="h-4 w-4" />
              <DoorOpen className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <main className="max-w-3xl mx-auto">
          <section className="premium-card w-full mb-4">
            <div className="text-sm font-extrabold text-gray-900 mb-2">{t('adminNotifications.assocNoticeTitle')}</div>
            <div className="text-xs text-gray-700 mb-3">
              {t('adminNotifications.assocNoticeDesc')}
            </div>

            {!currentAssociationId && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 mb-3">
                {t('adminNotifications.selectAssociationWarn')}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-1">{t('adminNotifications.messageLabel')}</div>
                <textarea
                  value={assocMessage}
                  onChange={(e) => setAssocMessage(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                  placeholder={t('adminNotifications.messagePlaceholder')}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => void sendAssociationNotification()}
                  disabled={assocStatus.type === 'saving' || !currentAssociationId}
                  className="px-3 py-2 rounded-lg text-sm font-bold bg-emerald-600 text-white disabled:opacity-50"
                >
                  {assocStatus.type === 'saving' ? t('adminNotifications.sending') : t('adminNotifications.sendNotice')}
                </button>
                {assocStatus.type !== 'idle' && (
                  <div
                    className={
                      'text-xs ' +
                      (assocStatus.type === 'error'
                        ? 'text-red-700'
                        : assocStatus.type === 'success'
                          ? 'text-emerald-700'
                          : 'text-gray-700')
                    }
                  >
                    {assocStatus.message || ''}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-700">{t('adminNotifications.recentNotices')}</div>
                  <button
                    type="button"
                    onClick={() => void loadRecentAssociationNotifications()}
                    disabled={recentAssocLoading}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gray-900 text-white disabled:opacity-50"
                  >
                    {recentAssocLoading ? t('common.loading') : t('adminNotifications.refresh')}
                  </button>
                </div>
                {recentAssocNotifs.length === 0 ? (
                  <div className="text-xs text-gray-600">{t('adminNotifications.noNotices')}</div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {recentAssocNotifs.slice(0, 6).map((n) => (
                      <div key={n.id} className="py-2">
                        <div className="text-xs font-extrabold text-gray-900">
                          {n.association_id ? t('adminNotifications.associationLabel') : 'GLOBAL'}
                          <span className="text-[11px] font-normal text-gray-600"> · {new Date(n.created_at).toLocaleString(locale)}</span>
                        </div>
                        <div className="text-xs text-gray-700 break-words">{n.message}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="premium-card w-full mb-4">
            <div className="text-sm font-extrabold text-gray-900 mb-2">{t('adminNotifications.tournamentNoticeTitle')}</div>
            <div className="text-xs text-gray-700 mb-3">
              {t('adminNotifications.tournamentNoticeDesc')}
            </div>

            {!currentAssociationId && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 mb-3">
                {t('adminNotifications.selectAssociationLoad')}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-1">{t('adminNotifications.eventLabel')}</div>
                <select
                  value={notifEventId}
                  onChange={(e) => setNotifEventId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                >
                  <option value="">{t('adminNotifications.selectPrompt')}</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}{ev.event_date ? ` · ${formatDate(ev.event_date, locale)}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-700 mb-1">{t('adminNotifications.audienceLabel')}</div>
                <select
                  value={notifAudience}
                  onChange={(e) => {
                    const v = (e.target.value || 'all') as any;
                    setNotifAudience(v);
                    if (v !== 'selected') setNotifPlayerIds([]);
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                >
                  <option value="all">{t('adminNotifications.audienceAll')}</option>
                  <option value="selected">{t('adminNotifications.audienceSelected')}</option>
                </select>
              </div>

              {notifAudience === 'selected' && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-xs font-semibold text-gray-700">{t('adminNotifications.playersLabel')}</div>
                    <div className="text-[11px] text-gray-600">{t('adminNotifications.selectedCount').replace('{count}', String(notifPlayerIds.length))}</div>
                  </div>
                  <input
                    value={notifPlayerSearch}
                    onChange={(e) => setNotifPlayerSearch(e.target.value)}
                    placeholder={t('adminNotifications.searchPlayer')}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80 mb-2"
                  />
                  <select
                    multiple
                    value={notifPlayerIds}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                      setNotifPlayerIds(selected);
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                    size={8}
                  >
                    {players
                      .filter((p) => {
                        const q = notifPlayerSearch.trim().toLowerCase();
                        if (!q) return true;
                        const name = `${p.first_name || ''} ${p.last_name || ''}`.trim().toLowerCase();
                        return name.includes(q) || (p.last_name || '').toLowerCase().includes(q);
                      })
                      .slice(0, 200)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {(p.last_name || '').toUpperCase()} {p.first_name || ''}
                        </option>
                      ))}
                  </select>
                  <div className="text-[11px] text-gray-600 mt-1">{t('adminNotifications.multiSelectTip')}</div>
                </div>
              )}

              <div>
                <div className="text-xs font-semibold text-gray-700 mb-1">{t('adminNotifications.messageLabel')}</div>
                <textarea
                  value={notifMessage}
                  onChange={(e) => setNotifMessage(e.target.value)}
                  rows={4}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                  placeholder={t('adminNotifications.messagePlaceholder')}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => void sendTournamentNotification()}
                  disabled={notifStatus.type === 'saving' || !currentAssociationId}
                  className="px-3 py-2 rounded-lg text-sm font-bold bg-emerald-600 text-white disabled:opacity-50"
                >
                  {notifStatus.type === 'saving' ? t('adminNotifications.sending') : t('adminNotifications.send')}
                </button>
                {notifStatus.type !== 'idle' && (
                  <div
                    className={
                      'text-xs ' +
                      (notifStatus.type === 'error'
                        ? 'text-red-700'
                        : notifStatus.type === 'success'
                          ? 'text-emerald-700'
                          : 'text-gray-700')
                    }
                  >
                    {notifStatus.message || ''}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-700">{t('adminNotifications.recentNotices')}</div>
                  <button
                    type="button"
                    onClick={() => void loadRecentNotifications()}
                    disabled={recentLoading}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-gray-900 text-white disabled:opacity-50"
                  >
                    {recentLoading ? t('common.loading') : t('adminNotifications.refresh')}
                  </button>
                </div>
                {recentNotifs.length === 0 ? (
                  <div className="text-xs text-gray-600">{t('adminNotifications.noNotices')}</div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {recentNotifs.slice(0, 8).map((n) => (
                      <div key={n.id} className="py-2">
                        <div className="text-xs font-extrabold text-gray-900">
                          {n.event_name || t('adminNotifications.eventFallback')}{n.event_date ? ` · ${formatDate(n.event_date, locale)}` : ''}
                          <span className="text-[11px] font-normal text-gray-600"> · {new Date(n.created_at).toLocaleString(locale)}</span>
                        </div>
                        <div className="text-[11px] text-gray-700">
                          {t('adminNotifications.audiencePrefix')}{' '}
                          {n.audience === 'selected' ? t('adminNotifications.audienceSome') : t('adminNotifications.audienceAllShort')}
                        </div>
                        <div className="text-xs text-gray-700 break-words">{n.message}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="premium-card w-full">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-extrabold text-gray-900">{t('adminNotifications.inbox')}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={busy}
                  className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-900 text-white disabled:opacity-50"
                >
                  {busy ? t('adminNotifications.refreshing') : t('adminNotifications.refresh')}
                </button>
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={busy || unreadIds.length === 0}
                  className="px-3 py-2 rounded-lg text-sm font-bold bg-emerald-600 text-white disabled:opacity-50 flex items-center gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" /> {t('adminNotifications.markRead')}
                </button>
              </div>
            </div>

            {missingTable && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 mb-3">
                {t('adminNotifications.missingTable')}
              </div>
            )}

            {items.length === 0 ? (
              <div className="text-sm text-gray-700">{t('adminNotifications.emptyInbox')}</div>
            ) : (
              <div className="divide-y divide-gray-200">
                {items.map((m) => (
                  <div key={m.id} className="py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-gray-900">
                          {m.is_read ? t('adminNotifications.read') : t('adminNotifications.new')}
                          <span className="text-xs font-normal text-gray-600"> · {new Date(m.created_at).toLocaleString(locale)}</span>
                        </div>
                        <div className="text-xs text-gray-700 break-words">{m.message}</div>
                        {m.created_by_email && (
                          <div className="text-[11px] text-gray-500 mt-1">{t('adminNotifications.from')} {m.created_by_email}</div>
                        )}
                      </div>
                      {!m.is_read && (
                        <span className="shrink-0 inline-flex items-center px-2 py-1 rounded-full text-[11px] font-extrabold bg-red-600 text-white">
                          1
                        </span>
                      )}
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
