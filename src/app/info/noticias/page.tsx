'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, DoorOpen, Newspaper } from 'lucide-react';
import AssociationSelector from '@/components/AssociationSelector';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';

type NewsItem = {
  id: string;
  association_id: string;
  association_name: string | null;
  title: string;
  body: string;
  image_url?: string | null;
  created_at: string;
};

export default function InfoNoticiasPage() {
  const { currentAssociationId } = useAuth();
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setBusy(true);
      setErrorMsg(null);

      const params = new URLSearchParams();
      if (currentAssociationId) params.set('association_id', currentAssociationId);

      const res = await fetch(`/api/info/news?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!active) return;

      setItems((json?.news as NewsItem[]) || []);
      setBusy(false);
      if (json?.error) setErrorMsg(String(json.error));
    };

    void load();
    return () => {
      active = false;
    };
  }, [currentAssociationId]);

  return (
    <div className="min-h-screen bg-[url('/aereo.jpg')] bg-cover bg-center">
      <div className="min-h-screen bg-black/35">
        <header className="px-4 py-3 flex items-center justify-between text-white">
          <Link href="/info" className="premium-back-btn" aria-label="Atras">
            <ArrowLeft className="h-4 w-4" />
            <DoorOpen className="h-4 w-4" />
          </Link>
          <AssociationSelector />
          <div className="w-16" />
        </header>

        <main className="mx-auto w-full max-w-2xl px-4 pb-10">
          <div className="w-full rounded-2xl bg-gray-100/95 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
            <div className="flex items-center gap-2">
              <Newspaper className="h-5 w-5 text-gray-800" />
              <h1 className="text-xl font-semibold text-gray-800">{t('info.news')}</h1>
            </div>

            {busy ? (
              <div className="mt-4 text-sm text-gray-700">{t('common.loading')}</div>
            ) : errorMsg ? (
              <div className="mt-4 text-sm font-semibold text-red-700">{errorMsg}</div>
            ) : items.length === 0 ? (
              <div className="mt-4 text-sm text-gray-700">{t('info.newsEmpty')}</div>
            ) : (
              <div className="mt-4 space-y-3">
                {items.map((it) => (
                  <div key={it.id} className="rounded-2xl border border-gray-200 bg-white/90 px-4 py-3">
                    <div className="text-sm font-semibold text-gray-900">{it.title}</div>
                    {it.association_name ? (
                      <div className="text-[11px] text-gray-600">{it.association_name}</div>
                    ) : null}
                    {it.image_url ? (
                      <button
                        type="button"
                        onClick={() => setActiveImage({ url: it.image_url as string, title: it.title })}
                        className="mt-2 inline-flex"
                      >
                        <img
                          src={it.image_url}
                          alt={it.title}
                          className="h-32 w-32 rounded-xl border border-gray-200 object-cover"
                          loading="lazy"
                        />
                      </button>
                    ) : null}
                    <div className="mt-2 text-xs text-gray-800 whitespace-pre-wrap">{it.body}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
      {activeImage ? (
        <button
          type="button"
          onClick={() => setActiveImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          aria-label={t('common.close')}
        >
          <img
            src={activeImage.url}
            alt={activeImage.title}
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </button>
      ) : null}
    </div>
  );
}
