'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';

type ActiveNotification = {
  id: string;
  message: string;
  created_at: string;
  kind: 'tournament' | 'association';
  event_id?: string;
  event_name?: string;
  event_date?: string | null;
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

function formatDate(dateStr: string | null, locale: string) {
  if (!dateStr) return '';
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: '2-digit' });
  } catch {
    return String(dateStr);
  }
}

export default function TournamentNotificationPopup() {
  const pathname = usePathname();
  const { user, isGuest } = useAuth();
  const { t, language } = useLanguage();
  const locale = LOCALE_BY_LANGUAGE[language] || 'es-ES';

  const hideOnAdmin = pathname?.startsWith('/admin');
  const enabled = !!user && !isGuest && !hideOnAdmin;

  const [current, setCurrent] = useState<ActiveNotification | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmRead, setConfirmRead] = useState(false);
  const [readChecked, setReadChecked] = useState(false);

  const shownIdsRef = useRef<Set<string>>(new Set());
  const pollIdRef = useRef<number | null>(null);

  const getAuthHeaders = async () => {
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchActive = async () => {
    if (!enabled) return;
    if (loading) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [tRes, aRes] = await Promise.all([
        fetch('/api/tournament-notifications/active', { method: 'GET', headers }),
        fetch('/api/association-notifications/active', { method: 'GET', headers }),
      ]);

      const tJson = await tRes.json().catch(() => ({}));
      const aJson = await aRes.json().catch(() => ({}));

      const tournamentList = Array.isArray(tJson?.notifications)
        ? (tJson.notifications as any[]).map((n) => ({
            id: String(n.id),
            message: String(n.message || ''),
            created_at: String(n.created_at || ''),
            kind: 'tournament' as const,
            event_id: String(n.event_id || ''),
            event_name: String(n.event_name || ''),
            event_date: n.event_date ? String(n.event_date) : null,
          }))
        : [];

      const associationList = Array.isArray(aJson?.notifications)
        ? (aJson.notifications as any[]).map((n) => ({
            id: String(n.id),
            message: String(n.message || ''),
            created_at: String(n.created_at || ''),
            kind: 'association' as const,
          }))
        : [];

      const list = [...associationList, ...tournamentList]
        .filter((n) => n.id)
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

      const next = list.find((n) => n?.id && !shownIdsRef.current.has(`${n.kind}:${n.id}`)) || null;
      if (next) {
        shownIdsRef.current.add(`${next.kind}:${next.id}`);
        setCurrent(next);
        setConfirmRead(false);
        setReadChecked(false);
        setOpen(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const dismiss = async (id: string, kind: ActiveNotification['kind']) => {
    if (!id) return;
    try {
      const url = kind === 'association'
        ? '/api/association-notifications/dismiss'
        : '/api/tournament-notifications/dismiss';
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ notification_id: id }),
      });
    } catch {
      // ignore
    }
  };

  const requestClose = () => {
    setConfirmRead(true);
  };

  const confirmAndClose = async () => {
    if (!current?.id) return;
    await dismiss(current.id, current.kind);
    setOpen(false);
    setCurrent(null);
    setConfirmRead(false);
    setReadChecked(false);
  };

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      setCurrent(null);
      setConfirmRead(false);
      setReadChecked(false);
      return;
    }

    void fetchActive();

    if (pollIdRef.current) window.clearInterval(pollIdRef.current);
    pollIdRef.current = window.setInterval(() => void fetchActive(), 15000);

    return () => {
      if (pollIdRef.current) window.clearInterval(pollIdRef.current);
      pollIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const title = useMemo(() => {
    if (!current) return '';
    if (current.kind === 'association') return t('notifications.associationTitle');
    const d = formatDate(current.event_date || null, locale);
    if (d) return `${current.event_name} · ${d}`;
    return current.event_name || t('notifications.tournamentTitle');
  }, [current, locale, t]);

  if (!enabled) return null;
  if (!open || !current) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/30" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[520px]">
        <div className="premium-card border border-white/70 shadow-gold-lg">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-gray-900">{t('notifications.important')}</div>
              <div className="text-xs text-gray-700 truncate">{title}</div>
            </div>
            <button
              type="button"
              onClick={() => (confirmRead ? setConfirmRead(false) : requestClose())}
              className="rounded-xl border border-gray-200 bg-white hover:bg-gray-50 p-2"
              aria-label={confirmRead ? t('notifications.backToNotice') : t('notifications.closeNotice')}
            >
              <X className="h-4 w-4 text-gray-800" />
            </button>
          </div>

          <div className="mt-3 text-sm text-gray-900 whitespace-pre-wrap break-words">
            {current.message}
          </div>

          <div className="mt-4 flex justify-end">
            {!confirmRead ? (
              <button
                type="button"
                onClick={requestClose}
                className="px-4 py-2 rounded-xl text-sm font-extrabold bg-gray-900 text-white"
              >
                {t('common.close')}
              </button>
            ) : (
              <div className="w-full flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-gray-700 select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={readChecked}
                    onChange={(e) => setReadChecked(e.target.checked)}
                  />
                  {t('notifications.readLabel')}
                </label>
                <button
                  type="button"
                  onClick={() => void confirmAndClose()}
                  disabled={!readChecked}
                  className="px-4 py-2 rounded-xl text-sm font-extrabold bg-gray-900 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('common.close')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
