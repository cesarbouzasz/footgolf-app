'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, DoorOpen, MapPin, Pencil } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { supabase } from '@/lib/supabase';

type CourseRow = {
  id: string;
  name: string;
  location?: string | null;
  association_id?: string | null;
};

export default function AdminEditarCampoPage() {
  const { user, profile, loading, isAdmin, currentAssociationId } = useAuth();
  const { t } = useLanguage();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const isCreator =
    (profile?.role || '').toString().trim().toLowerCase() === 'creador' ||
    (user?.email || '').trim().toLowerCase() === 'mbs2026@gmail.com';

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!isAdmin) return;
      setLoadingCourses(true);
      setErrorMsg(null);

      const params = new URLSearchParams();
      const scopedAssociationId = currentAssociationId || profile?.default_association_id || profile?.association_id || '';
      if (scopedAssociationId) {
        params.set('association_id', scopedAssociationId);
      }

      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;

      const res = await fetch(`/api/admin/courses${params.toString() ? `?${params.toString()}` : ''}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );
      const payload = await res.json().catch(() => ({}));

      if (!active) return;

      if (!payload?.ok) {
        setErrorMsg(String(payload?.error || t('adminCoursesList.errors.loadError')));
        setCourses([]);
        setLoadingCourses(false);
        return;
      }

      const rows = Array.isArray(payload?.data) ? (payload.data as CourseRow[]) : [];
      setCourses(rows);
      setLoadingCourses(false);
    };

    if (!isAdmin) {
      setCourses([]);
      setLoadingCourses(false);
    } else if (isCreator || currentAssociationId || profile?.default_association_id || profile?.association_id) {
      void load();
    } else {
      setCourses([]);
      setLoadingCourses(false);
    }

    return () => {
      active = false;
    };
  }, [currentAssociationId, isCreator, profile?.default_association_id, profile?.association_id, isAdmin]);

  const handleDelete = async (courseId: string) => {
    if (busyId) return;
    const ok = window.confirm(t('adminCoursesList.errors.confirmDelete'));
    if (!ok) return;

    setBusyId(courseId);
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const res = await fetch(`/api/admin/courses?id=${encodeURIComponent(courseId)}`,
      {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }
    );
    const payload = await res.json().catch(() => ({}));

    if (!payload?.ok) {
      setErrorMsg(String(payload?.error || t('adminCoursesList.errors.deleteError')));
      setBusyId(null);
      return;
    }

    setCourses((prev) => prev.filter((course) => course.id !== courseId));
    setBusyId(null);
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-700">{t('adminCoursesList.noAccess')}</div>
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
              <Pencil className="h-5 w-5" /> {t('adminCoursesList.title')}
            </div>
            <div className="text-xs text-gray-700">{t('adminCoursesList.subtitle')}</div>
          </div>
          <Link href="/admin/campos" className="premium-back-btn" aria-label={t('common.back')}>
            <ArrowLeft className="h-4 w-4" />
            <DoorOpen className="h-4 w-4" />
          </Link>
        </header>

        <main className="max-w-3xl mx-auto">
          <section className="premium-card w-full">
            <div className="flex items-center gap-2 mb-3 text-sm font-extrabold text-gray-900">
              <MapPin className="h-4 w-4" /> {t('adminCoursesList.sectionTitle')}
            </div>

            {loadingCourses ? (
              <div className="text-sm text-gray-700">{t('adminCoursesList.loadingCourses')}</div>
            ) : errorMsg ? (
              <div className="text-sm text-red-600">{errorMsg}</div>
            ) : courses.length === 0 ? (
              <div className="text-sm text-gray-700">{t('adminCoursesList.empty')}</div>
            ) : (
              <div className="space-y-2">
                {courses.map((course) => (
                  <div key={course.id} className="flex items-center justify-between rounded-2xl border border-amber-200/60 bg-white/90 px-4 py-3">
                    <div>
                      <div className="text-sm font-extrabold text-gray-900">{course.name}</div>
                      <div className="text-xs text-gray-700">{course.location || t('adminCoursesList.locationFallback')}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/admin/campos/crear?edit=${encodeURIComponent(course.id)}`}
                        className="rounded-full border border-amber-300/80 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-900"
                      >
                        {t('adminCoursesList.edit')}
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleDelete(course.id)}
                        disabled={busyId === course.id}
                        className="rounded-full border border-rose-300/80 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-60"
                      >
                        {busyId === course.id ? t('adminCoursesList.deleting') : t('adminCoursesList.delete')}
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
