import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const COURSE_IMAGE_BUCKET = process.env.NEXT_PUBLIC_COURSE_IMAGE_BUCKET || 'course-images';

const extractStoragePath = (rawUrl: string) => {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    const marker = `/${COURSE_IMAGE_BUCKET}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return null;
    return parsed.pathname.slice(idx + marker.length);
  } catch {
    const marker = `/${COURSE_IMAGE_BUCKET}/`;
    const idx = rawUrl.indexOf(marker);
    if (idx === -1) return null;
    return rawUrl.slice(idx + marker.length).split('?')[0];
  }
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids) ? (body.ids as string[]) : [];
    const safeIds = ids.map((id) => String(id || '').trim()).filter(Boolean);

    if (safeIds.length === 0) {
      return NextResponse.json({ ok: true, images: {} }, { status: 200 });
    }

    const { data, error } = await supabaseAdmin
      .from('courses')
      .select('id, image_url, association_id')
      .in('id', safeIds);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    }

    const images: Record<string, string | null> = {};

    for (const row of data || []) {
      const courseId = String((row as any)?.id || '').trim();
      const imageUrl = String((row as any)?.image_url || '').trim();
      if (!courseId) {
        continue;
      }

      let path = imageUrl ? extractStoragePath(imageUrl) : null;

      if (!path) {
        const associationId = (row as any)?.association_id ? String((row as any).association_id) : null;
        const associationPath = associationId || 'global';
        const prefix = `courses/${associationPath}`;
        const { data: objects } = await supabaseAdmin
          .storage
          .from(COURSE_IMAGE_BUCKET)
          .list(prefix, { limit: 100 });

        const match = (objects || []).find((obj) => obj.name?.startsWith(`${courseId}.`));
        if (match?.name) {
          path = `${prefix}/${match.name}`;
        }
      }

      if (!path) {
        images[courseId] = null;
        continue;
      }

      const signed = await supabaseAdmin
        .storage
        .from(COURSE_IMAGE_BUCKET)
        .createSignedUrl(path, 60 * 60);

      images[courseId] = signed?.data?.signedUrl || null;
    }

    return NextResponse.json({ ok: true, images }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}
