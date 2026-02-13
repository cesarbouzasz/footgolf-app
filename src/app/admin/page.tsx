'use client';

import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft,
  DoorOpen,
  Bell,
  Users,
  UsersRound,
  MapPin,
  CalendarDays,
  Info,
} from 'lucide-react';

type AdminOption = {
  key: 'notificaciones' | 'jugadores' | 'equipos' | 'eventos' | 'campos' | 'informacion';
  label: string;
  href: string;
  Icon: any;
};

const TILE_COLOR_CLASSES = [
  'bg-gradient-to-br from-sky-500 to-sky-700 hover:from-sky-600 hover:to-sky-800',
  'bg-gradient-to-br from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800',
  'bg-gradient-to-br from-emerald-500 to-emerald-700 hover:from-emerald-600 hover:to-emerald-800',
  'bg-gradient-to-br from-rose-500 to-rose-700 hover:from-rose-600 hover:to-rose-800',
  'bg-gradient-to-br from-violet-500 to-violet-700 hover:from-violet-600 hover:to-violet-800',
  'bg-gradient-to-br from-cyan-500 to-cyan-700 hover:from-cyan-600 hover:to-cyan-800',
];

export default function AdminPage() {
  const { user, profile, loading, isAdmin } = useAuth();
  const { t } = useLanguage();
  const [unread, setUnread] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const prevUnreadRef = useRef<number>(0);
  const toastTimerRef = useRef<number | null>(null);

  const adminOptions: AdminOption[] = [
    { key: 'notificaciones', label: t('admin.menu.notifications'), href: '/admin/notificaciones', Icon: Bell },
    { key: 'eventos', label: t('admin.menu.events'), href: '/admin/eventos', Icon: CalendarDays },
    { key: 'campos', label: t('admin.menu.courses'), href: '/admin/campos', Icon: MapPin },
    { key: 'jugadores', label: t('admin.menu.players'), href: '/admin/jugadores', Icon: Users },
    { key: 'equipos', label: t('admin.menu.teams'), href: '/admin/equipos', Icon: UsersRound },
    { key: 'informacion', label: t('admin.menu.info'), href: '/admin/informacion', Icon: Info },
  ];

  useEffect(() => {
    document.body.classList.add('premium-admin-bg');
    return () => document.body.classList.remove('premium-admin-bg');
  }, []);

  useEffect(() => {
    if (!user || !profile || !isAdmin) return;

    let cancelled = false;

    const getAuthHeaders = async () => {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    };

    const tick = async () => {
      try {
        const res = await fetch('/api/admin/messages/count', { method: 'GET', headers: await getAuthHeaders() });
        const json = await res.json().catch(() => ({}));
        const next = typeof json?.unread === 'number' ? json.unread : 0;
        if (cancelled) return;

        setUnread(next);
        if (next > prevUnreadRef.current) {
          setShowToast(true);
          if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
          toastTimerRef.current = window.setTimeout(() => setShowToast(false), 3200);
        }
        prevUnreadRef.current = next;
      } catch {
        // ignore
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, [user, profile, isAdmin]);

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
      {showToast && unread > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
          <div className="premium-card px-4 py-2 shadow-gold-lg border border-gold-600/60">
            <div className="text-sm font-extrabold text-gray-900">{t('admin.newNotification')}</div>
            <div className="text-xs text-gray-700">{t('admin.pendingMessages').replace('{count}', String(unread))}</div>
          </div>
        </div>
      )}
      <div className="min-h-screen px-4 py-6 sm:px-6">
        <header className="max-w-3xl mx-auto mb-4 flex items-center justify-between">
          <div>
            <div className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">{t('admin.title')}</div>
            <div className="text-xs text-gray-700">{t('admin.accessLabel').replace('{role}', String((profile as any)?.role || ''))}</div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="premium-back-btn" aria-label={t('common.back')}>
              <ArrowLeft className="h-4 w-4" />
              <DoorOpen className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <main className="max-w-3xl mx-auto">
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {adminOptions.map((option, idx) => {
              const Icon = option.Icon;
              const colors = TILE_COLOR_CLASSES[idx % TILE_COLOR_CLASSES.length];
              return (
                <Link
                  key={option.href}
                  href={option.href}
                  className={
                    'premium-admin-tile flex flex-col items-center justify-center gap-3 text-center text-white border-4 border-gold-600/90 ' +
                    'shadow-premium-sm hover:shadow-gold-lg hover:-translate-y-[2px] transition-transform ' +
                    colors
                  }
                >
                  <span className="h-11 w-11 rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-white" />
                  </span>
                  <span className="relative text-[15px] sm:text-base font-extrabold text-white leading-tight pr-8">
                    {option.label}
                    {option.key === 'notificaciones' && unread > 0 && (
                      <span className="absolute right-0 top-1/2 -translate-y-1/2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-600 text-white text-[12px] font-extrabold inline-flex items-center justify-center">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </section>
        </main>
      </div>
    </>
  );
}
