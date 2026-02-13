'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, DoorOpen, Link2 } from 'lucide-react';
import AssociationSelector from '@/components/AssociationSelector';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';

type LinkItem = {
  id: string;
  association_id: string;
  association_name: string | null;
  title: string;
  url: string;
  note: string | null;
  created_at: string;
};

export default function InfoEnlacesPage() {
  const { currentAssociationId } = useAuth();
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<LinkItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setBusy(true);
      setErrorMsg(null);

      const params = new URLSearchParams();
      if (currentAssociationId) params.set('association_id', currentAssociationId);

      const res = await fetch(`/api/info/links?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!active) return;

      setItems((json?.links as LinkItem[]) || []);
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
              <Link2 className="h-5 w-5 text-gray-800" />
              <h1 className="text-xl font-semibold text-gray-800">{t('info.links')}</h1>
            </div>

            {busy ? (
              <div className="mt-4 text-sm text-gray-700">{t('common.loading')}</div>
            ) : errorMsg ? (
              <div className="mt-4 text-sm font-semibold text-red-700">{errorMsg}</div>
            ) : items.length === 0 ? (
              <div className="mt-4 text-sm text-gray-700">{t('info.linksEmpty')}</div>
            ) : (
              <div className="mt-4 space-y-3">
                {items.map((it) => (
                  <div key={it.id} className="rounded-2xl border border-gray-200 bg-white/90 px-4 py-3">
                    <div className="text-sm font-semibold text-gray-900">{it.title}</div>
                    {it.association_name ? (
                      <div className="text-[11px] text-gray-600">{it.association_name}</div>
                    ) : null}
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 block text-xs text-blue-700 hover:underline break-all"
                    >
                      {it.url}
                    </a>
                    {it.note ? <div className="mt-2 text-xs text-gray-800">{it.note}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
