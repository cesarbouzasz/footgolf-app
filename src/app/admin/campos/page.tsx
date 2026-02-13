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
              className="premium-admin-tile flex flex-col items-center justify-center gap-3 text-center text-white border-4 border-gold-600/90 shadow-premium-sm hover:shadow-gold-lg hover:-translate-y-[2px] transition-transform bg-gradient-to-br from-cyan-500 to-cyan-700 hover:from-cyan-600 hover:to-cyan-800"
            >
              <span className="h-11 w-11 rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center">
                <PlusCircle className="h-5 w-5 text-white" />
              </span>
                <span className="text-base font-extrabold">{t('adminCoursesMenu.create')}</span>
            </Link>

            <Link
              href="/admin/campos/editar"
              className="premium-admin-tile flex flex-col items-center justify-center gap-3 text-center text-white border-4 border-gold-600/90 shadow-premium-sm hover:shadow-gold-lg hover:-translate-y-[2px] transition-transform bg-gradient-to-br from-violet-500 to-violet-700 hover:from-violet-600 hover:to-violet-800"
            >
              <span className="h-11 w-11 rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center">
                <Pencil className="h-5 w-5 text-white" />
              </span>
                <span className="text-base font-extrabold">{t('adminCoursesMenu.edit')}</span>
            </Link>
          </section>
        </main>
      </div>
    </>
  );
}
