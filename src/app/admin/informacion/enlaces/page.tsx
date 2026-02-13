'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, DoorOpen, Link2 } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import AssociationSelector from '@/components/AssociationSelector';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/language-context';

type LinkRow = {
  id: string;
  association_id: string;
  title: string;
  url: string;
  note: string | null;
  created_at: string;
};

function looksLikeUrl(value: string) {
  const v = value.trim();
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function AdminEnlacesPage() {
  const { user, profile, loading, isAdmin, currentAssociationId } = useAuth();
  const { t } = useLanguage();

  const [items, setItems] = useState<LinkRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('premium-admin-bg');
    return () => document.body.classList.remove('premium-admin-bg');
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!isAdmin) return;
      if (!currentAssociationId) {
        setItems([]);
        return;
      }

      setBusy(true);
      setErrorMsg(null);

      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;

      const params = new URLSearchParams();
      params.set('association_id', currentAssociationId);

      const res = await fetch(`/api/admin/info/links?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json().catch(() => ({}));

      if (!active) return;
      setItems((json?.links as LinkRow[]) || []);
      setBusy(false);

      if (json?.error) setErrorMsg(String(json.error));
    };

    void load();
    return () => {
      active = false;
    };
  }, [currentAssociationId, isAdmin]);

  const canCreate = useMemo(() => {
    if (!currentAssociationId) return false;
    if (!title.trim()) return false;
    if (!looksLikeUrl(url)) return false;
    return true;
  }, [currentAssociationId, title, url]);

  const createLink = async () => {
    if (!currentAssociationId) {
      setErrorMsg(t('adminInfoLinks.selectAssociation'));
      return;
    }
    const titleValue = title.trim();
    const urlValue = url.trim();
    const noteValue = note.trim();

    if (!titleValue) {
      setErrorMsg(t('adminInfoLinks.titleRequired'));
      return;
    }
    if (!looksLikeUrl(urlValue)) {
      setErrorMsg(t('adminInfoLinks.urlInvalid'));
      return;
    }

    setCreateBusy(true);
    setErrorMsg(null);
    setOkMsg(null);

    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const res = await fetch('/api/admin/info/links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ association_id: currentAssociationId, title: titleValue, url: urlValue, note: noteValue || null }),
    });

    const json = await res.json().catch(() => ({}));
    if (!json?.ok) {
      setErrorMsg(String(json?.error || t('adminInfoLinks.saveError')));
      setCreateBusy(false);
      return;
    }

    setTitle('');
    setUrl('');
    setNote('');
    setOkMsg(t('adminInfoLinks.published'));
    setCreateBusy(false);

    const created = json?.link as LinkRow | undefined;
    if (created?.id) setItems((prev) => [created, ...prev]);
  };

  const removeLink = async (id: string) => {
    setErrorMsg(null);
    setOkMsg(null);

    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const res = await fetch('/api/admin/info/links', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ id }),
    });

    const json = await res.json().catch(() => ({}));
    if (!json?.ok) {
      setErrorMsg(String(json?.error || t('adminInfoLinks.deleteError')));
      return;
    }

    setItems((prev) => prev.filter((x) => x.id !== id));
    setOkMsg(t('adminInfoLinks.deleted'));
  };

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
              <Link2 className="h-5 w-5" /> {t('adminInfoLinks.title')}
            </div>
            <div className="text-xs text-gray-700">{t('adminInfoLinks.subtitle')}</div>
          </div>
          <div className="flex items-center gap-2">
            <AssociationSelector />
            <Link href="/admin/informacion" className="premium-back-btn" aria-label={t('common.back')}>
              <ArrowLeft className="h-4 w-4" />
              <DoorOpen className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <main className="max-w-3xl mx-auto">
          <section className="premium-card w-full">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-extrabold text-gray-900">{t('adminInfoLinks.newLink')}</div>
              <div className="text-xs text-gray-600">{busy ? t('common.loading') : t('adminInfoLinks.linksCount').replace('{count}', String(items.length))}</div>
            </div>

            {!currentAssociationId ? (
              <div className="text-sm text-gray-700">{t('adminInfoLinks.selectAssociationPublish')}</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('adminInfoLinks.titlePlaceholder')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                />
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t('adminInfoLinks.urlPlaceholder')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                />
                <button
                  onClick={() => void createLink()}
                  disabled={createBusy || !canCreate}
                  className="rounded-xl border-2 border-gold-600/80 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm px-3 py-2 disabled:opacity-60"
                >
                  {createBusy ? t('adminInfoLinks.publishing') : t('adminInfoLinks.publish')}
                </button>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('adminInfoLinks.notePlaceholder')}
                  className="sm:col-span-3 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80 min-h-[84px]"
                />
              </div>
            )}

            {(errorMsg || okMsg) && (
              <div className="mt-3">
                {errorMsg && <div className="text-sm font-semibold text-red-700">{errorMsg}</div>}
                {okMsg && <div className="text-sm font-semibold text-emerald-700">{okMsg}</div>}
              </div>
            )}
          </section>

          <div className="h-4" />

          <section className="premium-card w-full">
            <div className="text-sm font-extrabold text-gray-900 mb-2">{t('adminInfoLinks.publishedLinks')}</div>
            {busy ? (
              <div className="text-sm text-gray-700">{t('common.loading')}</div>
            ) : items.length === 0 ? (
              <div className="text-sm text-gray-700">{t('adminInfoLinks.empty')}</div>
            ) : (
              <div className="space-y-3">
                {items.map((it) => (
                  <div key={it.id} className="rounded-2xl border border-gray-200 bg-white/80 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-gray-900 truncate">{it.title}</div>
                        <a
                          href={it.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-700 hover:underline break-all"
                        >
                          {it.url}
                        </a>
                        {it.note ? <div className="mt-1 text-xs text-gray-700">{it.note}</div> : null}
                      </div>

                      <button
                        onClick={() => void removeLink(it.id)}
                        className="shrink-0 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-extrabold px-3 py-2"
                      >
                        {t('adminInfoLinks.delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </>
  );
}
