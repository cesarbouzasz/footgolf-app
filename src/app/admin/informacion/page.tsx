'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { ArrowLeft, DoorOpen, BookOpen, Info, Link2, Newspaper } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';

export default function AdminInformacionMenuPage() {
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

  return (
    <>
      <div className="premium-particles" />
      <div className="min-h-screen px-4 py-6 sm:px-6">
        <header className="max-w-3xl mx-auto mb-4 flex items-center justify-between">
          <div>
            <div className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
              <Info className="h-5 w-5" /> {t('adminInfoMenu.title')}
            </div>
            <div className="text-xs text-gray-700">{t('adminInfoMenu.subtitle')}</div>
          </div>
          <Link href="/admin" className="premium-back-btn" aria-label={t('common.back')}>
            <ArrowLeft className="h-4 w-4" />
            <DoorOpen className="h-4 w-4" />
          </Link>
        </header>

        <main className="max-w-3xl mx-auto">
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              href="/admin/informacion/noticias"
              className="premium-admin-tile info-float-tile flex flex-col items-center justify-center gap-3 text-center text-white border-4 border-gold-600/90 shadow-premium-sm hover:shadow-gold-lg hover:-translate-y-[2px] transition-transform bg-gradient-to-br from-rose-500 to-rose-700 hover:from-rose-600 hover:to-rose-800"
            >
              <span className="h-11 w-11 rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center">
                <Newspaper className="h-5 w-5 text-white" />
              </span>
              <span className="text-base font-extrabold">{t('adminInfoMenu.news')}</span>
            </Link>

            <Link
              href="/admin/informacion/enlaces"
              className="premium-admin-tile info-float-tile flex flex-col items-center justify-center gap-3 text-center text-white border-4 border-gold-600/90 shadow-premium-sm hover:shadow-gold-lg hover:-translate-y-[2px] transition-transform bg-gradient-to-br from-sky-500 to-sky-700 hover:from-sky-600 hover:to-sky-800"
            >
              <span className="h-11 w-11 rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center">
                <Link2 className="h-5 w-5 text-white" />
              </span>
              <span className="text-base font-extrabold">{t('adminInfoMenu.links')}</span>
            </Link>

            <Link
              href="/admin/informacion/acerca-de"
              className="premium-admin-tile info-float-tile flex flex-col items-center justify-center gap-3 text-center text-white border-4 border-gold-600/90 shadow-premium-sm hover:shadow-gold-lg hover:-translate-y-[2px] transition-transform bg-gradient-to-br from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800"
            >
              <span className="h-11 w-11 rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-white" />
              </span>
              <span className="text-base font-extrabold">{t('adminInfoMenu.about')}</span>
            </Link>
          </section>
        </main>
      </div>
    </>
  );
}
