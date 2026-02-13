'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, DoorOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AssociationSelector from '@/components/AssociationSelector';
import { useLanguage } from '@/context/language-context';

interface CourseDetail {
  id: string;
  name: string;
  location?: string | null;
  local_rules?: string | null;
  hole_info?: any;
  pars?: number[] | null;
  distances?: number[] | null;
  association_id?: string | null;
  association_name?: string | null;
}

export default function CourseDetailPage() {
  const params = useParams();
  const { t } = useLanguage();
  const courseIdRaw = (params as { id?: string | string[] } | null)?.id;
  const courseId = Array.isArray(courseIdRaw) ? courseIdRaw[0] : courseIdRaw;
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [associationName, setAssociationName] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('premium-profile-bg');
    return () => document.body.classList.remove('premium-profile-bg');
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!courseId) return;
      setLoading(true);
      setAssociationName(null);
      const { data, error } = await supabase
        .from('courses')
        .select('id, name, location, hole_info, pars, distances, local_rules, association_id')
        .eq('id', courseId)
        .maybeSingle();
      if (active) {
        if (error) {
          console.error('Error loading course:', error);
          setCourse(null);
          setLoading(false);
          return;
        }
        setCourse((data as CourseDetail) || null);
        setLoading(false);
      }

      if (!active) return;
      const associationId = (data as CourseDetail | null)?.association_id || null;
      if (!associationId) return;
      try {
        const res = await fetch('/api/associations');
        if (!res.ok) return;
        const payload = await res.json().catch(() => null);
        if (!active) return;
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        const match = rows.find((row: any) => String(row?.id) === String(associationId));
        setAssociationName(match?.name ? String(match.name) : null);
      } catch (err) {
        console.error('Error loading association name:', err);
      }
    };
    load();
    return () => { active = false; };
  }, [courseId]);

  useEffect(() => {
    let active = true;
    const loadImage = async () => {
      if (!courseId) return;
      setImageUrl(null);
      const res = await fetch('/api/courses/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [courseId] }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!active) return;
      if (!payload?.ok || typeof payload?.images !== 'object') {
        setImageUrl(null);
        return;
      }
      const nextUrl = payload.images?.[courseId] || null;
      setImageUrl(nextUrl);
    };
    void loadImage();
    return () => { active = false; };
  }, [courseId]);

  const holesFromInfo = Array.isArray(course?.hole_info?.holes) ? course?.hole_info?.holes : [];

  const holeRows = Array.isArray(course?.pars)
    ? course?.pars?.map((par, idx) => ({
        hole: idx + 1,
        par,
        distance: course?.distances?.[idx] ?? holesFromInfo?.[idx]?.distance ?? null,
      }))
    : holesFromInfo.map((hole: any, idx: number) => ({
        hole: idx + 1,
        par: hole?.par,
        distance: hole?.distance,
      }));

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6">
      <div className="premium-particles" />
      <header className="max-w-6xl mx-auto mb-4 flex items-center justify-between">
        <Link href="/courses" className="premium-back-btn" aria-label="Atras">
          <ArrowLeft className="h-4 w-4" />
          <DoorOpen className="h-4 w-4" />
        </Link>
        <AssociationSelector />
        <div className="w-12"></div>
      </header>

      <main className="max-w-6xl mx-auto">
        {loading ? (
          <div className="text-sm text-gray-500">{t('common.loading')}</div>
        ) : !course ? (
          <div className="text-sm text-gray-500">{t('courses.notFound')}</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="border border-white/70 rounded-3xl p-4 sm:p-5 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
              <div className="relative aspect-[16/10] w-full rounded-2xl overflow-hidden border border-gray-200/80">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={course.name}
                    className="h-full w-full object-cover"
                    loading="eager"
                    decoding="async"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/0 to-black/0" />
              </div>

              <div className="mt-4">
                <div className="text-2xl font-extrabold text-gray-900 tracking-tight">{course.name}</div>
                <div className="text-sm text-gray-700 mt-1">{course.location || t('courses.locationUnavailable')}</div>
                <div className="text-xs text-gray-600 mt-2">
                  {course.association_id
                    ? t('courses.associationLabel').replace('{name}', associationName || course.association_id)
                    : t('courses.globalScope')}
                </div>

                <div className="mt-4 text-sm font-extrabold text-gray-900">{t('courses.localRules')}</div>
                <div className="mt-2 text-sm text-gray-700 whitespace-pre-line">
                  {course.local_rules || t('courses.noLocalRules')}
                </div>
              </div>
            </section>

            <section className="border border-white/70 rounded-3xl p-4 sm:p-5 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
              <div className="text-lg font-extrabold text-gray-900 mb-2">{t('courses.holesDetails')}</div>
              <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 border-b border-gray-200 pb-2">
                <div>{t('courses.hole')}</div>
                <div>{t('courses.par')}</div>
                <div>{t('courses.distance')}</div>
              </div>
              {holeRows.length === 0 ? (
                <div className="text-sm text-gray-500 py-3">{t('courses.noHoles')}</div>
              ) : (
                holeRows.map((row) => (
                  <div key={row.hole} className="grid grid-cols-3 gap-2 text-sm border-b border-gray-100 py-2">
                    <div>{t('courses.holeLabel').replace('{hole}', String(row.hole))}</div>
                    <div>{row.par}</div>
                    <div>{row.distance ? `${row.distance}m` : t('common.notAvailable')}</div>
                  </div>
                ))
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
