'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, DoorOpen, Newspaper } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import AssociationSelector from '@/components/AssociationSelector';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/language-context';

type NewsRow = {
  id: string;
  association_id: string;
  title: string;
  body: string;
  image_url?: string | null;
  created_at: string;
};

async function resizeImageToMax500(file: File, t: (path: string) => string) {
  if (!file.type.startsWith('image/')) {
    return { ok: false as const, error: t('adminInfoNews.imageMustBeImage') };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    const loaded = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      img.onload = () => resolve({ w: img.width, h: img.height });
      img.onerror = () => reject(new Error(t('adminInfoNews.imageReadError')));
      img.src = objectUrl;
    });

    if (loaded.w <= 500 && loaded.h <= 500) {
      return { ok: true as const, file };
    }

    const scale = Math.min(500 / loaded.w, 500 / loaded.h);
    const targetW = Math.max(1, Math.round(loaded.w * scale));
    const targetH = Math.max(1, Math.round(loaded.h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false as const, error: t('adminInfoNews.imageResizeError') };

    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.9));
    if (!blob) return { ok: false as const, error: t('adminInfoNews.imageResizeError') };

    const resized = new File([blob], file.name, { type: file.type });
    return { ok: true as const, file: resized };
  } catch {
    return { ok: false as const, error: t('adminInfoNews.imageValidateError') };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function AdminNoticiasPage() {
  const { user, profile, loading, isAdmin, currentAssociationId } = useAuth();
  const { t } = useLanguage();

  const [items, setItems] = useState<NewsRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('premium-admin-bg');
    return () => document.body.classList.remove('premium-admin-bg');
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
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

      const res = await fetch(`/api/admin/info/news?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json().catch(() => ({}));

      if (!active) return;
      setItems((json?.news as NewsRow[]) || []);
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
    if (!body.trim()) return false;
    if (imageError) return false;
    return true;
  }, [body, currentAssociationId, imageError, title]);

  const onPickImage = async (file: File | null) => {
    setOkMsg(null);
    setErrorMsg(null);
    setImageError(null);
    setImageFile(null);
    if (!file) {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setImagePreviewUrl(null);
      return;
    }

    const check = await resizeImageToMax500(file, t);
    if (!check.ok) {
      setImageError(check.error);
      return;
    }
    setImageFile(check.file);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    const nextUrl = URL.createObjectURL(check.file);
    previewUrlRef.current = nextUrl;
    setImagePreviewUrl(nextUrl);
  };

  const createItem = async () => {
    if (!currentAssociationId) {
      setErrorMsg(t('adminInfoNews.selectAssociation'));
      return;
    }

    const t = title.trim();
    const b = body.trim();

    if (!t) {
      setErrorMsg(t('adminInfoNews.titleRequired'));
      return;
    }
    if (!b) {
      setErrorMsg(t('adminInfoNews.bodyRequired'));
      return;
    }

    setCreateBusy(true);
    setErrorMsg(null);
    setOkMsg(null);

    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const fd = new FormData();
    fd.set('association_id', currentAssociationId);
    fd.set('title', t);
    fd.set('body', b);
    if (imageFile) fd.set('image', imageFile);

    const res = await fetch('/api/admin/info/news', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });

    const json = await res.json().catch(() => ({}));
    if (!json?.ok) {
      setErrorMsg(String(json?.error || t('adminInfoNews.publishError')));
      setCreateBusy(false);
      return;
    }

    setTitle('');
    setBody('');
    setImageFile(null);
    setImageError(null);
    setImagePreviewUrl(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setOkMsg(t('adminInfoNews.published'));
    setCreateBusy(false);

    const created = json?.item as NewsRow | undefined;
    if (created?.id) setItems((prev) => [created, ...prev]);
  };

  const removeItem = async (id: string) => {
    setErrorMsg(null);
    setOkMsg(null);

    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const res = await fetch('/api/admin/info/news', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ id }),
    });

    const json = await res.json().catch(() => ({}));
    if (!json?.ok) {
      setErrorMsg(String(json?.error || t('adminInfoNews.deleteError')));
      return;
    }

    setItems((prev) => prev.filter((x) => x.id !== id));
    setOkMsg(t('adminInfoNews.deleted'));
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
              <Newspaper className="h-5 w-5" /> {t('adminInfoNews.title')}
            </div>
            <div className="text-xs text-gray-700">{t('adminInfoNews.subtitle')}</div>
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
              <div className="text-sm font-extrabold text-gray-900">{t('adminInfoNews.newNews')}</div>
              <div className="text-xs text-gray-600">{busy ? t('common.loading') : t('adminInfoNews.newsCount').replace('{count}', String(items.length))}</div>
            </div>

            {!currentAssociationId ? (
              <div className="text-sm text-gray-700">{t('adminInfoNews.selectAssociationPublish')}</div>
            ) : (
              <div className="space-y-3">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('adminInfoNews.titlePlaceholder')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                />
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t('adminInfoNews.bodyPlaceholder')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80 min-h-[120px]"
                />
                <div>
                  <div className="text-xs font-extrabold text-gray-700 mb-1">{t('adminInfoNews.imageLabel')}</div>
                  {imagePreviewUrl && (
                    <div className="mb-2">
                      <img
                        src={imagePreviewUrl}
                        alt={t('adminInfoNews.imagePreviewAlt')}
                        className="h-24 w-24 rounded-xl border border-amber-200/60 object-cover"
                      />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => void onPickImage(e.target.files?.[0] || null)}
                    className="w-full text-sm"
                  />
                  {imageFile && (
                    <div className="mt-1 text-xs text-gray-700">
                      {t('adminInfoNews.imageSelected').replace('{name}', imageFile.name)}
                    </div>
                  )}
                  {imageError && <div className="mt-1 text-xs font-semibold text-red-700">{imageError}</div>}
                </div>
                <button
                  onClick={() => void createItem()}
                  disabled={createBusy || !canCreate}
                  className="w-full rounded-xl border-2 border-gold-600/80 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm px-3 py-2 disabled:opacity-60"
                >
                  {createBusy ? t('adminInfoNews.publishing') : t('adminInfoNews.publish')}
                </button>
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
            <div className="text-sm font-extrabold text-gray-900 mb-2">{t('adminInfoNews.publishedNews')}</div>
            {busy ? (
              <div className="text-sm text-gray-700">{t('common.loading')}</div>
            ) : items.length === 0 ? (
              <div className="text-sm text-gray-700">{t('adminInfoNews.empty')}</div>
            ) : (
              <div className="space-y-3">
                {items.map((it) => (
                  <div key={it.id} className="rounded-2xl border border-gray-200 bg-white/80 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-gray-900">{it.title}</div>
                        {it.image_url ? (
                          <img
                            src={it.image_url}
                            alt={it.title}
                            className="mt-2 h-24 w-24 rounded-xl border border-gray-200 object-cover"
                            loading="lazy"
                          />
                        ) : null}
                        <div className="mt-1 text-xs text-gray-800 whitespace-pre-wrap">{it.body}</div>
                      </div>
                      <button
                        onClick={() => void removeItem(it.id)}
                        className="shrink-0 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-extrabold px-3 py-2"
                      >
                        {t('adminInfoNews.delete')}
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
