'use client';

import Link from 'next/link';
import { ArrowLeft, DoorOpen, BookOpen, Link2, Newspaper } from 'lucide-react';
import AssociationSelector from '@/components/AssociationSelector';
import { useLanguage } from '@/context/language-context';

export default function InfoPage() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-[url('/aereo.jpg')] bg-cover bg-center">
      <div className="min-h-screen bg-black/35">
        <header className="px-4 py-3 flex items-center justify-between text-white">
          <Link href="/dashboard" className="premium-back-btn" aria-label="Atras">
            <ArrowLeft className="h-4 w-4" />
            <DoorOpen className="h-4 w-4" />
          </Link>
          <AssociationSelector />
          <div className="w-16" />
        </header>

        <main className="mx-auto flex min-h-[calc(100vh-56px)] w-full max-w-xl items-center justify-center px-4 pb-10">
          <div className="w-full rounded-2xl p-2">
            <h1 className="text-xl font-semibold text-white drop-shadow">{t('info.title')}</h1>

            <div className="mt-4 space-y-4">
              <Link href="/info/noticias" className="block w-full rounded-xl border-2 border-amber-400 bg-sky-500 px-4 py-4 text-white shadow-sm">
                <div className="flex flex-col items-center gap-2">
                  <Newspaper className="h-5 w-5" />
                  <span className="text-sm font-semibold">{t('info.news')}</span>
                </div>
              </Link>

              <Link href="/info/acerca-de" className="block w-full rounded-xl border-2 border-amber-400 bg-sky-500 px-4 py-4 text-white shadow-sm">
                <div className="flex flex-col items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  <span className="text-sm font-semibold">{t('info.about')}</span>
                </div>
              </Link>

              <Link href="/info/enlaces" className="block w-full rounded-xl border-2 border-amber-400 bg-sky-500 px-4 py-4 text-white shadow-sm">
                <div className="flex flex-col items-center gap-2">
                  <Link2 className="h-5 w-5" />
                  <span className="text-sm font-semibold">{t('info.links')}</span>
                </div>
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
