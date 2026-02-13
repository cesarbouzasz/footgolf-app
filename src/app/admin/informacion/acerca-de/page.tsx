'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, DoorOpen } from 'lucide-react';
import { useLanguage } from '@/context/language-context';

type AboutPayload = {
  ok: boolean;
  version?: string;
  copyright?: string;
  changelog?: string;
  error?: string;
};

export default function AdminAcercaDePage() {
  const [busy, setBusy] = useState(false);
  const [payload, setPayload] = useState<AboutPayload | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    document.body.classList.add('premium-admin-bg');
    return () => document.body.classList.remove('premium-admin-bg');
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setBusy(true);
      const res = await fetch('/api/app/about');
      const json = (await res.json().catch(() => null)) as AboutPayload | null;
      if (!active) return;
      setPayload(json);
      setBusy(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <div className="premium-particles" />
      <div className="min-h-screen px-4 py-6 sm:px-6">
        <header className="max-w-3xl mx-auto mb-4 flex items-center justify-between">
          <div>
            <div className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> {t('adminAbout.title')}
            </div>
            <div className="text-xs text-gray-700">{t('adminAbout.subtitle')}</div>
          </div>
          <Link href="/admin/informacion" className="premium-back-btn" aria-label={t('common.back')}>
            <ArrowLeft className="h-4 w-4" />
            <DoorOpen className="h-4 w-4" />
          </Link>
        </header>

        <main className="max-w-3xl mx-auto">
          <section className="premium-card w-full">
            {busy ? (
              <div className="text-sm text-gray-700">{t('common.loading')}</div>
            ) : payload?.ok ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-gray-200 bg-white/80 px-4 py-3">
                    <div className="text-xs text-gray-600">{t('adminAbout.version')}</div>
                    <div className="text-sm font-extrabold text-gray-900">{payload.version || '—'}</div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white/80 px-4 py-3">
                    <div className="text-xs text-gray-600">{t('adminAbout.copyright')}</div>
                    <div className="text-sm font-extrabold text-gray-900">{payload.copyright || '—'}</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white/80 px-4 py-3">
                  <div className="text-xs text-gray-600 mb-2">{t('adminAbout.changelog')}</div>
                  <pre className="text-xs text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
                    {payload.changelog || t('adminAbout.changelogEmpty')}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="text-sm text-red-700 font-semibold">{payload?.error || t('adminAbout.loadError')}</div>
            )}
          </section>
        </main>
      </div>
    </>
  );
}
