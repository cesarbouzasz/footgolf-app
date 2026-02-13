'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, DoorOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth-context';
import AssociationSelector from '@/components/AssociationSelector';
import { MapPin } from 'lucide-react';
import { useLanguage } from '@/context/language-context';

interface CourseRow {
  id: string;
  name: string;
  location?: string | null;
  association_id?: string | null;
}

export default function CoursesPage() {
  const { currentAssociationId } = useAuth();
  const { t } = useLanguage();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageMap, setImageMap] = useState<Record<string, string | null>>({});

  useEffect(() => {
    document.body.classList.add('premium-profile-bg');
    return () => document.body.classList.remove('premium-profile-bg');
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      let query = supabase
        .from('courses')
        .select('id, name, location, association_id')
        .order('name', { ascending: true });

      if (currentAssociationId) {
        query = query.eq('association_id', currentAssociationId);
      }

      const { data } = await query;
      if (active) {
        const rows = (data as CourseRow[]) || [];
        setCourses(rows);
        setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [currentAssociationId]);

  useEffect(() => {
    let active = true;
    const loadImages = async () => {
      if (courses.length === 0) {
        setImageMap({});
        return;
      }
      setImageMap(() => {
        const next: Record<string, string | null> = {};
        courses.forEach((c) => {
          next[c.id] = null;
        });
        return next;
      });
      const res = await fetch('/api/courses/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: courses.map((c) => c.id) }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!active) return;
      if (!payload?.ok || typeof payload?.images !== 'object') {
        setImageMap({});
        return;
      }
      setImageMap(payload.images as Record<string, string | null>);
    };
    void loadImages();
    return () => { active = false; };
  }, [courses]);

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6">
      <div className="premium-particles" />
      <header className="max-w-5xl mx-auto mb-4 flex items-center justify-between">
        <Link href="/dashboard" className="premium-back-btn" aria-label="Atras">
          <ArrowLeft className="h-4 w-4" />
          <DoorOpen className="h-4 w-4" />
        </Link>
        <AssociationSelector />
        <div className="w-12"></div>
      </header>

      <main className="max-w-5xl mx-auto bg-white/90 rounded-3xl border border-white/70 p-4 sm:p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
        <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight mb-4">{t('courses.title')}</h1>

        {loading ? (
          <div className="text-sm text-gray-500">{t('common.loading')}</div>
        ) : courses.length === 0 ? (
          <div className="text-sm text-gray-500">{t('courses.empty')}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {courses.map((course) => {
              const previewSrc = imageMap[course.id] || null;
              return (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className="group block rounded-3xl overflow-hidden border border-gray-200/80 bg-white/90 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="relative aspect-[16/10] w-full">
                    {previewSrc ? (
                      <img
                        src={previewSrc}
                        alt={course.name}
                        className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/0 to-black/0" />
                  </div>

                  <div className="p-4">
                    <div className="text-lg font-extrabold text-gray-900 leading-tight">{course.name}</div>
                    <div className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                      <MapPin className="h-4 w-4 text-gray-700" />
                      <span>{course.location || t('courses.locationUnavailable')}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
