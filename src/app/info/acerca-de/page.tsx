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

export default function InfoAcercaDePage() {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [payload, setPayload] = useState<AboutPayload | null>(null);

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
    <div className="min-h-screen bg-[url('/aereo.jpg')] bg-cover bg-center">
      <div className="min-h-screen bg-black/35">
        <header className="px-4 py-3 flex items-center justify-between text-white">
          <Link href="/info" className="premium-back-btn" aria-label="Atras">
            <ArrowLeft className="h-4 w-4" />
            <DoorOpen className="h-4 w-4" />
          </Link>
          <div className="text-sm font-semibold">{t('info.about')}</div>
          <div className="w-16" />
        </header>

        <main className="mx-auto w-full max-w-2xl px-4 pb-10">
          <div className="w-full rounded-2xl bg-gray-100/95 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-gray-800" />
              <h1 className="text-xl font-semibold text-gray-800">{t('info.about')}</h1>
            </div>

            {busy ? (
              <div className="mt-4 text-sm text-gray-700">{t('common.loading')}</div>
            ) : payload?.ok ? (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-gray-200 bg-white/90 px-4 py-3">
                    <div className="text-xs text-gray-600">{t('info.version')}</div>
                    <div className="text-sm font-semibold text-gray-900">{payload.version || '—'}</div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white/90 px-4 py-3">
                    <div className="text-xs text-gray-600">{t('info.copyright')}</div>
                    <div className="text-sm font-semibold text-gray-900">{payload.copyright || '—'}</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white/90 px-4 py-3">
                  <div className="text-xs text-gray-600 mb-2">{t('info.changelog')}</div>
                  <pre className="text-xs text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
                    {payload.changelog || t('info.changelogEmpty')}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm font-semibold text-red-700">{payload?.error || t('info.loadError')}</div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
