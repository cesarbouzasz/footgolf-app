'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { ArrowLeft, DoorOpen, MapPin, PlusCircle, Pencil } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';

export default function AdminCamposMenuPage() {
  const { user, profile, loading, isAdmin } = useAuth();
  const { t } = useLanguage();

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
              <MapPin className="h-5 w-5" /> {t('adminCoursesMenu.title')}
            </div>
            <div className="text-xs text-gray-700">{t('adminCoursesMenu.subtitle')}</div>
          </div>
          <Link href="/admin" className="premium-back-btn" aria-label={t('common.back')}>
            <ArrowLeft className="h-4 w-4" />
            <DoorOpen className="h-4 w-4" />
          </Link>
        </header>

        <main className="max-w-3xl mx-auto min-h-[calc(100vh-200px)]">
          <section className="flex min-h-[360px] flex-col justify-evenly">
            <Link
              href="/admin/campos/crear"
              className="premium-admin-tile premium-admin-neon-pulse premium-card group flex flex-col items-center justify-center gap-3 text-center border-2 border-gold-600/80 shadow-[0_0_24px_rgba(34,211,238,0.45),0_0_42px_rgba(37,99,235,0.35)] hover:shadow-[0_0_34px_rgba(103,232,249,0.55),0_0_62px_rgba(59,130,246,0.45)] hover:-translate-y-[3px] transition-all duration-200 bg-gradient-to-br from-cyan-300 via-sky-500 to-blue-700"
            >
              <span className="h-11 w-11 rounded-2xl bg-black/30 border border-white/45 backdrop-blur-[1px] flex items-center justify-center z-[1]">
                <PlusCircle className="h-5 w-5 -translate-y-px text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
              </span>
                <span className="z-[1] inline-flex w-full items-center justify-center text-center text-base font-extrabold leading-none text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]">{t('adminCoursesMenu.create')}</span>
            </Link>

            <Link
              href="/admin/campos/editar"
              className="premium-admin-tile premium-admin-neon-pulse premium-card group flex flex-col items-center justify-center gap-3 text-center border-2 border-gold-600/80 shadow-[0_0_24px_rgba(167,139,250,0.45),0_0_42px_rgba(126,34,206,0.35)] hover:shadow-[0_0_34px_rgba(196,181,253,0.55),0_0_62px_rgba(147,51,234,0.45)] hover:-translate-y-[3px] transition-all duration-200 bg-gradient-to-br from-indigo-300 via-violet-500 to-purple-700"
            >
              <span className="h-11 w-11 rounded-2xl bg-black/30 border border-white/45 backdrop-blur-[1px] flex items-center justify-center z-[1]">
                <Pencil className="h-5 w-5 -translate-y-px text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
              </span>
                <span className="z-[1] inline-flex w-full items-center justify-center text-center text-base font-extrabold leading-none text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]">{t('adminCoursesMenu.edit')}</span>
            </Link>
          </section>
        </main>
      </div>
    </>
  );
}
