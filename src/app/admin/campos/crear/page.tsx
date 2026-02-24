'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, DoorOpen, MapPin, PlusCircle } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { supabase } from '@/lib/supabase';

type HoleRow = {
  par: number;
  distance: number;
  early_tee?: boolean;
};

type Association = {
  id: string;
  name: string;
};

function clampDistance(value: number) {
  if (!Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(999, Math.floor(value)));
}

function clampPar(value: number) {
  if (!Number.isFinite(value)) return 4;
  return Math.max(1, Math.min(99, Math.floor(value)));
}

async function validateImage500(file: File, t: (path: string) => string) {
  if (!file.type.startsWith('image/')) {
    return { ok: false as const, error: t('adminCoursesForm.errors.imageType') };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    const loaded = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      img.onload = () => resolve({ w: img.width, h: img.height });
      img.onerror = () => reject(new Error(t('adminCoursesForm.errors.imageRead')));
      img.src = objectUrl;
    });

    if (loaded.w > 500 || loaded.h > 500) {
      return { ok: false as const, error: t('adminCoursesForm.errors.imageSize') };
    }

    return { ok: true as const };
  } catch {
    return { ok: false as const, error: t('adminCoursesForm.errors.imageValidate') };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function AdminCrearCampoPageInner() {
  const { user, profile, loading, isAdmin } = useAuth();
  const { currentAssociationId } = useAuth();
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const editId = (searchParams.get('edit') || '').trim();
  const isEdit = Boolean(editId);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [localRules, setLocalRules] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [holes, setHoles] = useState<HoleRow[]>(() =>
    Array.from({ length: 18 }).map(() => ({ par: 4, distance: 100, early_tee: false }))
  );

  const [scopeAssociationId, setScopeAssociationId] = useState<string | null>(currentAssociationId ?? null);
  const [scopeTouched, setScopeTouched] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [loadingCourse, setLoadingCourse] = useState(false);

  const [associations, setAssociations] = useState<Association[]>([]);

  useEffect(() => {
    document.body.classList.add('premium-admin-bg');
    return () => document.body.classList.remove('premium-admin-bg');
  }, []);

  const isCreator =
    (profile?.role || '').toString().trim().toLowerCase() === 'creador' ||
    (user?.email || '').trim().toLowerCase() === 'mbs2026@gmail.com';

  useEffect(() => {
    if (scopeTouched) return;
    const fallbackAssociationId = profile?.default_association_id || profile?.association_id || currentAssociationId || null;
    setScopeAssociationId(isCreator ? null : fallbackAssociationId);
  }, [profile?.default_association_id, profile?.association_id, currentAssociationId, scopeTouched, isCreator]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!isCreator) return;
      const res = await fetch('/api/associations');
      if (!res.ok) return;
      const payload = await res.json().catch(() => null);
      if (!active) return;
      setAssociations(Array.isArray(payload?.data) ? (payload.data as Association[]) : []);
    };
    void load();
    return () => {
      active = false;
    };
  }, [isCreator]);

  useEffect(() => {
    // Nombre primero
    const t = window.setTimeout(() => nameRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
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

    const loadCourse = async () => {
      if (!editId) return;
      setLoadingCourse(true);
      setErrorMsg(null);
      setOkMsg(null);

      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;

      const res = await fetch(`/api/admin/courses?id=${encodeURIComponent(editId)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );
      const payload = await res.json().catch(() => ({}));

      if (!active) return;

      if (!payload?.ok || !Array.isArray(payload?.data) || payload.data.length === 0) {
        setErrorMsg(String(payload?.error || t('adminCoursesForm.errors.loadError')));
        setLoadingCourse(false);
        return;
      }

      const course = payload.data[0];
      const assoc = course?.association_id ? String(course.association_id) : null;
      const parsedHoles = Array.isArray(course?.hole_info?.holes) ? course.hole_info.holes : null;
      const pars = Array.isArray(course?.pars) ? course.pars : [];
      const distances = Array.isArray(course?.distances) ? course.distances : [];

      const holesPayload: HoleRow[] = parsedHoles
        ? parsedHoles.map((h: any) => ({
            par: clampPar(Number(h?.par || 4)),
            distance: clampDistance(Number(h?.distance || 100)),
            early_tee: Boolean(h?.early_tee),
          }))
        : pars.map((par: number, idx: number) => ({
            par: clampPar(Number(par || 4)),
            distance: clampDistance(Number(distances[idx] || 100)),
            early_tee: false,
          }));

      setName(String(course?.name || ''));
      setLocation(String(course?.location || ''));
      setLocalRules(String(course?.local_rules || ''));
      setHoles(holesPayload.length ? holesPayload : Array.from({ length: 18 }).map(() => ({ par: 4, distance: 100, early_tee: false })));
      setScopeAssociationId(assoc || null);
      setScopeTouched(true);
      setLoadingCourse(false);
    };

    void loadCourse();

    return () => {
      active = false;
    };
  }, [editId]);

  useEffect(() => {
    let active = true;
    const loadImage = async () => {
      if (!editId) {
        setImagePreviewUrl(null);
        return;
      }
      const res = await fetch('/api/courses/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [editId] }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!active) return;
      const nextUrl = payload?.ok ? payload?.images?.[editId] || null : null;
      setImagePreviewUrl(nextUrl);
    };
    void loadImage();
    return () => {
      active = false;
    };
  }, [editId]);

  const canSave = useMemo(() => {
    if (!isCreator && !scopeAssociationId) return false;
    if (!name.trim()) return false;
    if (imageError) return false;
    return true;
  }, [isCreator, scopeAssociationId, name, imageError]);

  const holesParTotal = useMemo(
    () => holes.reduce((sum, hole) => sum + clampPar(Number(hole.par || 0)), 0),
    [holes],
  );

  const holesDistanceTotal = useMemo(
    () => holes.reduce((sum, hole) => sum + clampDistance(Number(hole.distance || 0)), 0),
    [holes],
  );

  const onPickImage = async (file: File | null) => {
    setOkMsg(null);
    setErrorMsg(null);
    setImageError(null);
    setImageFile(null);
    if (!file) return;

    const check = await validateImage500(file, t);
    if (!check.ok) {
      setImageError(check.error);
      return;
    }
    setImageFile(file);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    const nextUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextUrl;
    setImagePreviewUrl(nextUrl);
  };

  const updateHole = (idx: number, patch: Partial<HoleRow>) => {
    setHoles((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const save = async () => {
    if (!isCreator && !scopeAssociationId) {
      setErrorMsg(t('adminCoursesForm.errors.selectAssociation'));
      return;
    }
    if (!name.trim()) {
      setErrorMsg(t('adminCoursesForm.errors.nameRequired'));
      return;
    }
    if (imageError) {
      setErrorMsg(imageError);
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setOkMsg(null);

    const holesPayload = holes.map((h) => ({
      par: clampPar(Number(h.par || 0)),
      distance: clampDistance(Number(h.distance || 0)),
      early_tee: Boolean(h.early_tee),
    }));

    const fd = new FormData();
    fd.set('association_id', scopeAssociationId ?? '');
    fd.set('name', name.trim());
    fd.set('location', location.trim());
    fd.set('local_rules', localRules);
    fd.set('holes', JSON.stringify(holesPayload));
    if (imageFile) fd.set('image', imageFile);

    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const url = isEdit
      ? `/api/admin/courses?id=${encodeURIComponent(editId)}`
      : '/api/admin/courses';
    const res = await fetch(url, {
      method: isEdit ? 'PATCH' : 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });
    const json = await res.json().catch(() => ({}));
    if (!json?.ok) {
      setErrorMsg(String(json?.error || (isEdit ? t('adminCoursesForm.errors.updateError') : t('adminCoursesForm.errors.createError'))));
      setSaving(false);
      return;
    }

    setOkMsg(isEdit ? t('adminCoursesForm.updated') : t('adminCoursesForm.created'));
    setSaving(false);
    if (!isEdit) {
      setName('');
      setLocation('');
      setLocalRules('');
      setImageFile(null);
      setImageError(null);
      setImagePreviewUrl(null);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setHoles(Array.from({ length: 18 }).map(() => ({ par: 4, distance: 100, early_tee: false })));
      nameRef.current?.focus();
    }
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
          {t('common.noSession')}{' '}
          <Link href="/login" className="text-blue-600">{t('common.login')}</Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-700">{t('adminCoursesForm.noAccess')}</div>
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
              <PlusCircle className="h-5 w-5" /> {isEdit ? t('adminCoursesForm.titleEdit') : t('adminCoursesForm.titleCreate')}
            </div>
            <div className="text-xs text-gray-700">
              {isEdit ? t('adminCoursesForm.subtitleEdit') : t('adminCoursesForm.subtitleCreate')}
            </div>
          </div>
          <Link href="/admin/campos" className="premium-back-btn" aria-label={t('common.back')}>
            <ArrowLeft className="h-4 w-4" />
            <DoorOpen className="h-4 w-4" />
          </Link>
        </header>

        <main className="max-w-3xl mx-auto">
          <section className="premium-card w-full">
            <div className="flex items-center gap-2 mb-4 text-sm font-extrabold text-gray-900">
              <MapPin className="h-4 w-4" /> {t('adminCoursesForm.sectionTitle')}
            </div>

            {loadingCourse && (
              <div className="mb-4 text-sm text-gray-700">{t('adminCoursesForm.loadingCourse')}</div>
            )}

            {!scopeAssociationId && !isCreator && (
              <div className="mb-4 text-sm font-semibold text-amber-800">
                {t('adminCoursesForm.scopePrompt')}
              </div>
            )}

            {scopeAssociationId ? (
              <div className="mb-4 text-xs text-gray-700">
                {isCreator
                  ? t('adminCoursesForm.associationLabel').replace('{name}', String(associations.find((a) => a.id === scopeAssociationId)?.name || scopeAssociationId))
                  : t('adminCoursesForm.scopeAdminAssociation')}
              </div>
            ) : isCreator ? (
              <div className="mb-4 text-xs text-gray-700">{t('adminCoursesForm.scopeGlobal')}</div>
            ) : null}

            <div className="grid grid-cols-1 gap-3">
              <div>
                <div className="text-xs font-extrabold text-gray-700 mb-1">{t('adminCoursesForm.scopeLabel')}</div>
                <select
                  value={isCreator ? (scopeAssociationId ?? 'GLOBAL') : (scopeAssociationId ?? '')}
                  onChange={(e) => {
                    setScopeTouched(true);
                    setScopeAssociationId(e.target.value === 'GLOBAL' ? null : e.target.value);
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                  disabled={!isCreator}
                >
                  {!isCreator && (
                    <option value={scopeAssociationId ?? ''}>
                      {t('adminCoursesForm.scopeAdminOption')}
                    </option>
                  )}
                  {isCreator && (
                    <>
                      <option value="GLOBAL">{t('adminCoursesForm.scopeGlobalOption')}</option>
                      {associations.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                {!isCreator && (
                  <div className="mt-1 text-[11px] text-gray-600">{t('adminCoursesForm.scopeGlobalHint')}</div>
                )}
              </div>

              <div>
                <div className="text-xs font-extrabold text-gray-700 mb-1">{t('adminCoursesForm.nameLabel')}</div>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                  placeholder={t('adminCoursesForm.namePlaceholder')}
                />
              </div>

              <div>
                <div className="text-xs font-extrabold text-gray-700 mb-1">{t('adminCoursesForm.locationLabel')}</div>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                  placeholder={t('adminCoursesForm.locationPlaceholder')}
                />
              </div>

              <div>
                <div className="text-xs font-extrabold text-gray-700 mb-1">{t('adminCoursesForm.photoLabel')}</div>
                {imagePreviewUrl && (
                  <div className="mb-2">
                    <img
                      src={imagePreviewUrl}
                      alt={t('adminCoursesForm.photoPreviewAlt')}
                      className="h-32 w-32 rounded-2xl border border-amber-200/60 object-cover"
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
                    {t('adminCoursesForm.photoSelected').replace('{name}', imageFile.name)}
                  </div>
                )}
                {isEdit && !imageFile && (
                  <div className="mt-1 text-[11px] text-gray-600">{t('adminCoursesForm.photoKeepHint')}</div>
                )}
                {imageError && <div className="mt-1 text-xs font-semibold text-red-700">{imageError}</div>}
              </div>

              <div>
                <div className="text-xs font-extrabold text-gray-700 mb-1">{t('adminCoursesForm.localRulesLabel')}</div>
                <textarea
                  value={localRules}
                  onChange={(e) => setLocalRules(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80 min-h-[120px]"
                  placeholder={t('adminCoursesForm.localRulesPlaceholder')}
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <div className="text-sm font-extrabold text-gray-900">{t('adminCoursesForm.holesTitle')}</div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-700">{t('adminCoursesForm.parTotalLabel')}</span>
                  <input
                    value={String(holesParTotal)}
                    readOnly
                    className="w-[90px] border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-700"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-700">{t('adminCoursesForm.distanceTotalLabel')}</span>
                  <input
                    value={String(holesDistanceTotal)}
                    readOnly
                    className="w-[110px] border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-700"
                  />
                </div>
              </div>
            </div>

            <div className="mt-2 text-[11px] text-gray-600">
              {t('adminCoursesForm.earlyTeeHint')}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
              {holes.map((h, idx) => (
                <div
                  key={`mobile-hole-${idx}`}
                  className={
                    h.early_tee
                      ? 'rounded-xl border border-rose-200 bg-rose-50 p-2'
                      : 'rounded-xl border border-gray-200 bg-white/70 p-2'
                  }
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-extrabold text-gray-900">{t('adminCoursesForm.holeHeader')} {idx + 1}</div>
                    <input
                      type="checkbox"
                      checked={Boolean(h.early_tee)}
                      onChange={(e) => updateHole(idx, { early_tee: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300"
                      aria-label={t('adminCoursesForm.earlyTeeLabel').replace('{hole}', String(idx + 1))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{t('adminCoursesForm.parHeader')}</div>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={String(h.par)}
                        onChange={(e) => updateHole(idx, { par: clampPar(Number(e.target.value || 0)) })}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white/90"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{t('adminCoursesForm.distanceHeader')}</div>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={String(h.distance)}
                        onChange={(e) => updateHole(idx, { distance: clampDistance(Number(e.target.value || 0)) })}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white/90"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 hidden overflow-x-auto sm:block">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-white/70">
                    <th className="text-left font-semibold px-2 py-1.5 w-[55px]">{t('adminCoursesForm.holeHeader')}</th>
                    <th className="text-left font-semibold px-2 py-1.5 w-[36px]"></th>
                    <th className="text-left font-semibold px-2 py-1.5 w-[70px]">{t('adminCoursesForm.parHeader')}</th>
                    <th className="text-left font-semibold px-3 py-2 w-[110px]">{t('adminCoursesForm.distanceHeader')}</th>
                  </tr>
                </thead>
                <tbody>
                  {holes.map((h, idx) => (
                    <tr
                      key={idx}
                      className={
                        h.early_tee
                          ? 'border-b border-rose-200 bg-rose-50'
                          : 'border-b border-gray-100 bg-white/60'
                      }
                    >
                      <td className="px-2 py-1.5 font-semibold text-gray-900">{idx + 1}</td>
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={Boolean(h.early_tee)}
                          onChange={(e) => updateHole(idx, { early_tee: e.target.checked })}
                          className="h-4 w-4 rounded border-gray-300"
                          aria-label={t('adminCoursesForm.earlyTeeLabel').replace('{hole}', String(idx + 1))}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={String(h.par)}
                          onChange={(e) => updateHole(idx, { par: clampPar(Number(e.target.value || 0)) })}
                          className="w-full min-w-0 border border-gray-200 rounded-xl px-2 py-1 text-sm bg-white/80"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={String(h.distance)}
                          onChange={(e) => updateHole(idx, { distance: clampDistance(Number(e.target.value || 0)) })}
                          className="w-[88px] border border-gray-200 rounded-xl px-2 py-1 text-sm bg-white/80"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(errorMsg || okMsg) && (
              <div className="mt-4">
                {errorMsg && <div className="text-sm font-semibold text-red-700">{errorMsg}</div>}
                {okMsg && <div className="text-sm font-semibold text-emerald-700">{okMsg}</div>}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end">
              <button
                onClick={() => void save()}
                disabled={saving || !canSave}
                className="rounded-xl border-2 border-gold-600/80 bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-sm px-4 py-2 disabled:opacity-60"
              >
                {saving ? t('adminCoursesForm.savingButton') : t('adminCoursesForm.saveButton')}
              </button>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}

export default function AdminCrearCampoPage() {
  const { t } = useLanguage();
  return (
    <Suspense
      fallback={(
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-sm text-gray-700">{t('common.loading')}</div>
        </div>
      )}
    >
      <AdminCrearCampoPageInner />
    </Suspense>
  );
}
