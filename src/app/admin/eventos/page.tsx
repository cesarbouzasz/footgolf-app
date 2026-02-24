'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { ArrowLeft, DoorOpen, CalendarDays, PlusCircle, Pencil, Trophy, Settings } from 'lucide-react';
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
                className="premium-admin-tile premium-admin-neon-pulse premium-card group flex flex-col items-center justify-center gap-3 text-center border-2 border-gold-600/80 shadow-[0_0_24px_rgba(132,204,22,0.45),0_0_42px_rgba(20,184,166,0.35)] hover:shadow-[0_0_34px_rgba(163,230,53,0.55),0_0_62px_rgba(16,185,129,0.45)] hover:-translate-y-[3px] transition-all duration-200 bg-gradient-to-br from-lime-300 via-emerald-500 to-teal-700"
              >
                <span className="h-11 w-11 rounded-2xl bg-black/30 border border-white/45 backdrop-blur-[1px] flex items-center justify-center z-[1]">
                  <PlusCircle className="h-5 w-5 -translate-y-px text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
                </span>
                <span className="z-[1] inline-flex w-full items-center justify-center text-center text-base font-extrabold leading-none text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]">{t('adminEventsMenu.create')}</span>
              </Link>

              <Link
                href="/admin/campeonatos/crear"
                className="premium-admin-tile premium-admin-neon-pulse premium-card group flex flex-col items-center justify-center gap-3 text-center border-2 border-gold-600/80 shadow-[0_0_24px_rgba(251,191,36,0.45),0_0_42px_rgba(249,115,22,0.35)] hover:shadow-[0_0_34px_rgba(253,224,71,0.55),0_0_62px_rgba(234,88,12,0.45)] hover:-translate-y-[3px] transition-all duration-200 bg-gradient-to-br from-yellow-300 via-amber-500 to-orange-700"
              >
                <span className="h-11 w-11 rounded-2xl bg-black/30 border border-white/45 backdrop-blur-[1px] flex items-center justify-center z-[1]">
                  <Trophy className="h-5 w-5 -translate-y-px text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
                </span>
                <span className="z-[1] inline-flex w-full items-center justify-center text-center text-base font-extrabold leading-none text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]">{t('adminEventsMenu.createChampionship')}</span>
              </Link>

              <Link
                href="/admin/eventos/editar"
                className="premium-admin-tile premium-admin-neon-pulse premium-card group flex flex-col items-center justify-center gap-3 text-center border-2 border-gold-600/80 shadow-[0_0_24px_rgba(34,211,238,0.45),0_0_42px_rgba(37,99,235,0.35)] hover:shadow-[0_0_34px_rgba(103,232,249,0.55),0_0_62px_rgba(59,130,246,0.45)] hover:-translate-y-[3px] transition-all duration-200 bg-gradient-to-br from-cyan-300 via-sky-500 to-blue-700"
              >
                <span className="h-11 w-11 rounded-2xl bg-black/30 border border-white/45 backdrop-blur-[1px] flex items-center justify-center z-[1]">
                  <Pencil className="h-5 w-5 -translate-y-px text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
                </span>
                <span className="z-[1] inline-flex w-full items-center justify-center text-center text-base font-extrabold leading-none text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]">{t('adminEventsMenu.edit')}</span>
              </Link>

              <Link
                href="/admin/campeonatos/gestionar"
                className="premium-admin-tile premium-admin-neon-pulse premium-card group flex flex-col items-center justify-center gap-3 text-center border-2 border-gold-600/80 shadow-[0_0_24px_rgba(217,70,239,0.45),0_0_42px_rgba(126,34,206,0.35)] hover:shadow-[0_0_34px_rgba(244,114,182,0.55),0_0_62px_rgba(139,92,246,0.45)] hover:-translate-y-[3px] transition-all duration-200 bg-gradient-to-br from-fuchsia-400 via-pink-500 to-violet-700"
              >
                <span className="h-11 w-11 rounded-2xl bg-black/30 border border-white/45 backdrop-blur-[1px] flex items-center justify-center z-[1]">
                  <Settings className="h-5 w-5 -translate-y-px text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
                </span>
                <span className="z-[1] inline-flex w-full items-center justify-center text-center text-base font-extrabold leading-none text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]">{t('adminEventsMenu.manageChampionship')}</span>
              </Link>

              {isCreator && (
                <Link
                  href="/admin/calendario"
                  className="premium-admin-tile premium-admin-neon-pulse premium-card group flex flex-col items-center justify-center gap-3 text-center border-2 border-gold-600/80 shadow-[0_0_24px_rgba(251,113,133,0.45),0_0_42px_rgba(220,38,38,0.35)] hover:shadow-[0_0_34px_rgba(253,164,175,0.55),0_0_62px_rgba(239,68,68,0.45)] hover:-translate-y-[3px] transition-all duration-200 bg-gradient-to-br from-rose-400 via-red-500 to-red-800"
                >
                  <span className="h-11 w-11 rounded-2xl bg-black/30 border border-white/45 backdrop-blur-[1px] flex items-center justify-center z-[1]">
                    <CalendarDays className="h-5 w-5 -translate-y-px text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
                  </span>
                    <span className="z-[1] inline-flex w-full items-center justify-center text-center text-base font-extrabold leading-none text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]">{t('adminEventsMenu.calendar')}</span>
                </Link>
              )}
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
