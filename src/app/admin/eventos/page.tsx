'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { ArrowLeft, DoorOpen, CalendarDays, PlusCircle, Pencil } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';

export default function AdminEventosMenuPage() {
  const { user, profile, loading, isAdmin } = useAuth();
  const { t } = useLanguage();

  const isCreator = useMemo(() => {
    const roleRaw = (profile as any)?.role;
    const role = typeof roleRaw === 'string' ? roleRaw.trim().toLowerCase() : '';
    const configuredBootstrap = (process.env.NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAIL || 'mbs2026@gmail.com').trim().toLowerCase();
    const email = (user?.email || '').trim().toLowerCase();
    return role === 'creador' || (!!configuredBootstrap && email === configuredBootstrap);
  }, [profile, user?.email]);

  useEffect(() => {
    document.body.classList.add('premium-admin-bg');
    return () => document.body.classList.remove('premium-admin-bg');
  }, []);

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
              <CalendarDays className="h-5 w-5" /> {t('adminEventsMenu.title')}
            </div>
            <div className="text-xs text-gray-700">{t('adminEventsMenu.subtitle')}</div>
          </div>
          <Link href="/admin" className="premium-back-btn" aria-label={t('common.back')}>
            <ArrowLeft className="h-4 w-4" />
            <DoorOpen className="h-4 w-4" />
          </Link>
        </header>

        <main className="max-w-3xl mx-auto">
          <section className="w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link
                href="/admin/eventos/crear"
                className="premium-admin-tile flex flex-col items-center justify-center gap-3 text-center text-white border-2 border-gold-600/90 shadow-premium-sm hover:shadow-gold-lg hover:-translate-y-[2px] transition-transform bg-gradient-to-br from-emerald-500 to-emerald-700 hover:from-emerald-600 hover:to-emerald-800"
              >
                <span className="h-11 w-11 rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center">
                  <PlusCircle className="h-5 w-5 text-white" />
                </span>
                <span className="text-base font-extrabold">{t('adminEventsMenu.create')}</span>
              </Link>

              <Link
                href="/admin/eventos/editar"
                className="premium-admin-tile flex flex-col items-center justify-center gap-3 text-center text-white border-2 border-gold-600/90 shadow-premium-sm hover:shadow-gold-lg hover:-translate-y-[2px] transition-transform bg-gradient-to-br from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800"
              >
                <span className="h-11 w-11 rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center">
                  <Pencil className="h-5 w-5 text-white" />
                </span>
                <span className="text-base font-extrabold">{t('adminEventsMenu.edit')}</span>
              </Link>

              {isCreator && (
                <Link
                  href="/admin/calendario"
                  className="premium-admin-tile flex flex-col items-center justify-center gap-3 text-center text-white border-2 border-gold-600/90 shadow-premium-sm hover:shadow-gold-lg hover:-translate-y-[2px] transition-transform bg-gradient-to-br from-sky-500 to-sky-700 hover:from-sky-600 hover:to-sky-800"
                >
                  <span className="h-11 w-11 rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center">
                    <CalendarDays className="h-5 w-5 text-white" />
                  </span>
                    <span className="text-base font-extrabold">{t('adminEventsMenu.calendar')}</span>
                </Link>
              )}
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
