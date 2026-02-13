import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const INFO_NEWS_IMAGE_BUCKET = process.env.NEXT_PUBLIC_INFO_NEWS_IMAGE_BUCKET || 'info-news-images';

async function getAuthedUser(req: NextRequest) {
  try {
    const supabaseAuth = await createServerClient();
    const { data, error } = await supabaseAuth.auth.getUser();
    if (!error && data?.user) return data.user;
  } catch {
    // ignore
  }

  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1];
  const supabaseTokenClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await supabaseTokenClient.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function getAdminProfile(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, role, association_id, default_association_id')
    .eq('id', userId)
    .single();

  const roleRaw = (profile as any)?.role;
  const role = typeof roleRaw === 'string' ? roleRaw.trim().toLowerCase() : '';
  let isAdmin = role === 'admin' || role === 'creador';

  let associationAdminId: string | null = null;
  if (!isAdmin) {
    const { data: assocRow, error: assocError } = await supabaseAdmin
      .from('associations')
      .select('id')
      .eq('admin_id', userId)
      .limit(1)
      .maybeSingle();

    if (!assocError && assocRow?.id) {
      isAdmin = true;
      associationAdminId = String(assocRow.id);
    }
  }

  return { profile: profile as any, isAdmin, role, associationAdminId };
}

function allowedAssociationIdsFor(profile: any, associationAdminId: string | null) {
  return [
    profile?.default_association_id || null,
    profile?.association_id || null,
    associationAdminId || null,
  ].filter(Boolean) as string[];
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ news: [] }, { status: 401 });

    const { profile, isAdmin, role, associationAdminId } = await getAdminProfile(user.id);
    if (!isAdmin) return NextResponse.json({ news: [], error: 'Forbidden' }, { status: 403 });

    const associationId = String(req.nextUrl.searchParams.get('association_id') || '').trim();
    if (!associationId) return NextResponse.json({ news: [], error: 'Missing association_id' }, { status: 400 });

    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ news: [], error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('info_news')
      .select('id, association_id, title, body, image_url, created_at')
      .eq('association_id', associationId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ news: [], error: error.message }, { status: 200 });
    return NextResponse.json({ news: data || [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ news: [], error: e?.message || 'Server error' }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Not authed' }, { status: 401 });

    const { profile, isAdmin, role, associationAdminId } = await getAdminProfile(user.id);
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const contentType = req.headers.get('content-type') || '';
    const isMultipart = contentType.includes('multipart/form-data');
    let associationId = '';
    let title = '';
    let text = '';
    let image: File | null = null;

    if (isMultipart) {
      const form = await req.formData();
      associationId = String(form.get('association_id') || '').trim();
      title = String(form.get('title') || '').trim();
      text = String(form.get('body') || '').trim();
      const imageCandidate = form.get('image');
      if (imageCandidate && typeof imageCandidate === 'object' && 'arrayBuffer' in (imageCandidate as any)) {
        image = imageCandidate as File;
      }
    } else {
      const body = await req.json().catch(() => ({}));
      associationId = String(body?.association_id || '').trim();
      title = String(body?.title || '').trim();
      text = String(body?.body || '').trim();
    }

    if (!associationId) return NextResponse.json({ ok: false, error: 'Missing association_id' }, { status: 400 });
    if (!title) return NextResponse.json({ ok: false, error: 'Missing title' }, { status: 400 });
    if (!text) return NextResponse.json({ ok: false, error: 'Missing body' }, { status: 400 });

    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('info_news')
      .insert([{ association_id: associationId, title, body: text, created_by: user.id }])
      .select('id, association_id, title, body, image_url, created_at')
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });

    let imageUrl: string | null = null;
    if (image) {
      if (!image.type.startsWith('image/')) {
        return NextResponse.json({ ok: false, error: 'Invalid image type' }, { status: 400 });
      }
      if (image.size > 2_000_000) {
        return NextResponse.json({ ok: false, error: 'Image too large (max 2MB)' }, { status: 400 });
      }

      const newsId = String((data as any)?.id || '').trim();
      const bytes = Buffer.from(await image.arrayBuffer());
      const ext = image.type === 'image/png' ? 'png' : image.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `info-news/${associationId}/${newsId}.${ext}`;

      const uploadRes = await supabaseAdmin.storage
        .from(INFO_NEWS_IMAGE_BUCKET)
        .upload(path, bytes, { contentType: image.type, upsert: true });

      if (uploadRes.error) {
        return NextResponse.json(
          {
            ok: false,
            error: `Storage upload failed: ${uploadRes.error.message}. Bucket esperado: ${INFO_NEWS_IMAGE_BUCKET}`,
          },
          { status: 200 }
        );
      }

      const publicUrlRes = supabaseAdmin.storage.from(INFO_NEWS_IMAGE_BUCKET).getPublicUrl(path);
      imageUrl = publicUrlRes?.data?.publicUrl || null;

      if (imageUrl) {
        await supabaseAdmin.from('info_news').update({ image_url: imageUrl }).eq('id', newsId);
      }
    }

    return NextResponse.json({ ok: true, item: { ...(data as any), image_url: imageUrl || (data as any)?.image_url || null } }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Not authed' }, { status: 401 });

    const { profile, isAdmin, role, associationAdminId } = await getAdminProfile(user.id);
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || '').trim();
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });

    const { data: row } = await supabaseAdmin.from('info_news').select('id, association_id').eq('id', id).single();
    if (!row) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      const associationId = String((row as any)?.association_id || '');
      if (allowed.length > 0 && associationId && !allowed.includes(associationId)) {
        return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { error } = await supabaseAdmin.from('info_news').delete().eq('id', id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}
