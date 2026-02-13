import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const COURSE_IMAGE_BUCKET = process.env.NEXT_PUBLIC_COURSE_IMAGE_BUCKET || 'course-images';

const CREATOR_EMAIL = 'mbs2026@gmail.com';

const normalizeAssociationKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const extractAdminSuffix = (handle: string) => {
  const cleaned = handle.trim().toLowerCase();
  if (!cleaned.startsWith('admin')) return '';
  return cleaned.slice(5).trim();
};

const getUserHandle = (user: { email?: string | null; user_metadata?: any } | null | undefined) => {
  const meta = (user?.user_metadata || {}) as Record<string, unknown>;
  const fromMeta = String(meta.username || meta.user_name || meta.userName || '').trim();
  if (fromMeta) return fromMeta;
  const email = String(user?.email || '').trim();
  return email.includes('@') ? email.split('@')[0] : email;
};

async function resolveAssociationIdFromHandle(handle: string) {
  const suffix = extractAdminSuffix(handle);
  if (!suffix) return null;

  const { data: rows, error } = await supabaseAdmin
    .from('associations')
    .select('id, name')
    .order('name', { ascending: true });

  if (error || !rows) return null;
  const targetKey = normalizeAssociationKey(suffix);
  const match = rows.find((row: any) => normalizeAssociationKey(String(row?.name || '')) === targetKey);
  return match?.id ? String(match.id) : null;
}

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

async function getAdminProfile(userId: string, user: { email?: string | null; user_metadata?: any } | null) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, role, association_id, default_association_id')
    .eq('id', userId)
    .single();

  const roleRaw = (profile as any)?.role;
  const role = typeof roleRaw === 'string' ? roleRaw.trim().toLowerCase() : '';
  const email = (user?.email || '').trim().toLowerCase();
  const isCreator = role === 'creador' || email === CREATOR_EMAIL;
  let isAdmin = role === 'admin' || isCreator;

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

  const handle = getUserHandle(user);
  const derivedAssociationId = await resolveAssociationIdFromHandle(handle);
  if (!associationAdminId && derivedAssociationId) {
    isAdmin = true;
  }

  return { profile: profile as any, isAdmin, role, associationAdminId, derivedAssociationId, isCreator };
}

function allowedAssociationIdsFor(profile: any, associationAdminId: string | null, derivedAssociationId: string | null) {
  return [
    profile?.default_association_id || null,
    profile?.association_id || null,
    associationAdminId || null,
    derivedAssociationId || null,
  ].filter(Boolean) as string[];
}

type HoleInput = {
  par: number;
  distance: number;
  early_tee?: boolean;
};

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Not authed' }, { status: 401 });

    const { profile, isAdmin, associationAdminId, derivedAssociationId, isCreator } = await getAdminProfile(user.id, user);
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const url = new URL(req.url);
    const courseId = String(url.searchParams.get('id') || '').trim();
    const associationIdRaw = String(url.searchParams.get('association_id') || '').trim();
    const wantsGlobal = associationIdRaw.toUpperCase() === 'GLOBAL';
    const associationId = wantsGlobal ? null : associationIdRaw || null;

    if (wantsGlobal && !isCreator) {
      return NextResponse.json({ ok: false, error: 'Not allowed for global' }, { status: 403 });
    }

    const allowed = allowedAssociationIdsFor(profile, associationAdminId, derivedAssociationId || null);
    if (!isCreator && associationId && allowed.length > 0 && !allowed.includes(associationId)) {
      return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
    }

    let query = supabaseAdmin
      .from('courses')
      .select('id, name, location, association_id, pars, distances, hole_info, local_rules, image_url')
      .order('name', { ascending: true });

    if (courseId) {
      query = query.eq('id', courseId).limit(1);
    }

    if (associationIdRaw) {
      if (wantsGlobal) {
        query = query.is('association_id', null);
      } else if (associationId) {
        query = query.eq('association_id', associationId);
      }
    } else if (!isCreator && allowed.length > 0) {
      query = query.in('association_id', allowed);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });

    const rows = Array.isArray(data) ? data : data ? [data] : [];

    if (!isCreator && rows.length > 0) {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId, derivedAssociationId || null);
      const filtered = rows.filter((row: any) => {
        const assocId = row?.association_id ? String(row.association_id) : null;
        if (!assocId) return false;
        return allowed.includes(assocId);
      });
      return NextResponse.json({ ok: true, data: filtered }, { status: 200 });
    }

    return NextResponse.json({ ok: true, data: rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Not authed' }, { status: 401 });

    const { profile, isAdmin, associationAdminId, derivedAssociationId, isCreator } = await getAdminProfile(user.id, user);
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const url = new URL(req.url);
    const courseId = String(url.searchParams.get('id') || '').trim();
    if (!courseId) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('courses')
      .select('id, association_id')
      .eq('id', courseId)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ ok: false, error: 'Course not found' }, { status: 404 });
    }

    const form = await req.formData();

    const associationIdRaw = String(form.get('association_id') || '').trim();
    const associationId = associationIdRaw.toUpperCase() === 'GLOBAL' ? '' : associationIdRaw;
    const name = String(form.get('name') || '').trim();
    const location = String(form.get('location') || '').trim();
    const localRules = String(form.get('local_rules') || '').trim();
    const holesRaw = String(form.get('holes') || '').trim();

    if (!associationId && !isCreator) {
      return NextResponse.json({ ok: false, error: 'Missing association_id' }, { status: 400 });
    }
    if (!name) return NextResponse.json({ ok: false, error: 'Missing name' }, { status: 400 });

    if (!isCreator && associationId) {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId, derivedAssociationId || null);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    let holes: HoleInput[] = [];
    try {
      const parsed = JSON.parse(holesRaw || '[]');
      if (Array.isArray(parsed)) holes = parsed as HoleInput[];
    } catch {
      holes = [];
    }

    if (!Array.isArray(holes) || holes.length < 1) {
      return NextResponse.json({ ok: false, error: 'Missing holes' }, { status: 400 });
    }

    const pars: number[] = [];
    const distances: number[] = [];

    for (const h of holes) {
      const par = Number((h as any)?.par);
      const distance = Number((h as any)?.distance);
      if (!Number.isFinite(par) || par < 1 || par > 10) {
        return NextResponse.json({ ok: false, error: 'Invalid par' }, { status: 400 });
      }
      if (!Number.isFinite(distance) || distance < 1 || distance > 2500) {
        return NextResponse.json({ ok: false, error: 'Invalid distance' }, { status: 400 });
      }
      pars.push(Math.floor(par));
      distances.push(Math.floor(distance));
    }

    const updatePayload: Record<string, any> = {
      association_id: associationId || null,
      name,
      location: location || null,
      pars,
      distances,
      hole_info: { holes },
      local_rules: localRules || null,
    };

    const { error: updateError } = await supabaseAdmin
      .from('courses')
      .update(updatePayload)
      .eq('id', courseId);

    if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 200 });

    const image = form.get('image');
    let imageUrl: string | null = null;

    if (image && typeof image === 'object' && 'arrayBuffer' in (image as any)) {
      const file = image as File;
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ ok: false, error: 'Invalid image type' }, { status: 400 });
      }
      if (file.size > 2_000_000) {
        return NextResponse.json({ ok: false, error: 'Image too large (max 2MB)' }, { status: 400 });
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const associationPath = associationId || (existing as any)?.association_id || 'global';
      const path = `courses/${associationPath}/${courseId}.${ext}`;

      const uploadRes = await supabaseAdmin.storage
        .from(COURSE_IMAGE_BUCKET)
        .upload(path, bytes, { contentType: file.type, upsert: true });

      if (uploadRes.error) {
        return NextResponse.json(
          {
            ok: false,
            error: `Storage upload failed: ${uploadRes.error.message}. Bucket esperado: ${COURSE_IMAGE_BUCKET}`,
          },
          { status: 200 }
        );
      }

      const publicUrlRes = supabaseAdmin.storage.from(COURSE_IMAGE_BUCKET).getPublicUrl(path);
      imageUrl = publicUrlRes?.data?.publicUrl || null;

      if (imageUrl) {
        await supabaseAdmin.from('courses').update({ image_url: imageUrl }).eq('id', courseId);
      }
    }

    return NextResponse.json({ ok: true, image_url: imageUrl }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Not authed' }, { status: 401 });

    const { profile, isAdmin, associationAdminId, derivedAssociationId, isCreator } = await getAdminProfile(user.id, user);
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const url = new URL(req.url);
    const courseId = String(url.searchParams.get('id') || '').trim();
    if (!courseId) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('courses')
      .select('id, association_id')
      .eq('id', courseId)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ ok: false, error: 'Course not found' }, { status: 404 });
    }

    if (!isCreator) {
      const assocId = (existing as any)?.association_id ? String((existing as any).association_id) : null;
      const allowed = allowedAssociationIdsFor(profile, associationAdminId, derivedAssociationId || null);
      if (!assocId || (allowed.length > 0 && !allowed.includes(assocId))) {
        return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from('courses')
      .delete()
      .eq('id', courseId);

    if (deleteError) return NextResponse.json({ ok: false, error: deleteError.message }, { status: 200 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Not authed' }, { status: 401 });

    const { profile, isAdmin, associationAdminId, derivedAssociationId, isCreator } = await getAdminProfile(user.id, user);
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const form = await req.formData();

    const associationIdRaw = String(form.get('association_id') || '').trim();
    const associationId = associationIdRaw.toUpperCase() === 'GLOBAL' ? '' : associationIdRaw;
    const name = String(form.get('name') || '').trim();
    const location = String(form.get('location') || '').trim();
    const localRules = String(form.get('local_rules') || '').trim();
    const holesRaw = String(form.get('holes') || '').trim();

    if (!associationId && !isCreator) {
      return NextResponse.json({ ok: false, error: 'Missing association_id' }, { status: 400 });
    }
    if (!name) return NextResponse.json({ ok: false, error: 'Missing name' }, { status: 400 });

    if (!isCreator && associationId) {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId, derivedAssociationId || null);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    let holes: HoleInput[] = [];
    try {
      const parsed = JSON.parse(holesRaw || '[]');
      if (Array.isArray(parsed)) holes = parsed as HoleInput[];
    } catch {
      holes = [];
    }

    if (!Array.isArray(holes) || holes.length < 1) {
      return NextResponse.json({ ok: false, error: 'Missing holes' }, { status: 400 });
    }

    const pars: number[] = [];
    const distances: number[] = [];

    for (const h of holes) {
      const par = Number((h as any)?.par);
      const distance = Number((h as any)?.distance);
      if (!Number.isFinite(par) || par < 1 || par > 10) {
        return NextResponse.json({ ok: false, error: 'Invalid par' }, { status: 400 });
      }
      if (!Number.isFinite(distance) || distance < 1 || distance > 2500) {
        return NextResponse.json({ ok: false, error: 'Invalid distance' }, { status: 400 });
      }
      pars.push(Math.floor(par));
      distances.push(Math.floor(distance));
    }

    const { data: courseRow, error: insertError } = await supabaseAdmin
      .from('courses')
      .insert([
        {
          association_id: associationId || null,
          name,
          location: location || null,
          pars,
          distances,
          hole_info: { holes },
          local_rules: localRules || null,
        },
      ])
      .select('id')
      .single();

    if (insertError) return NextResponse.json({ ok: false, error: insertError.message }, { status: 200 });

    const courseId = String((courseRow as any)?.id || '').trim();
    if (!courseId) return NextResponse.json({ ok: false, error: 'Insert failed' }, { status: 200 });

    const image = form.get('image');
    let imageUrl: string | null = null;

    if (image && typeof image === 'object' && 'arrayBuffer' in (image as any)) {
      const file = image as File;
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ ok: false, error: 'Invalid image type' }, { status: 400 });
      }
      // Soft limit just to avoid accidental huge uploads.
      if (file.size > 2_000_000) {
        return NextResponse.json({ ok: false, error: 'Image too large (max 2MB)' }, { status: 400 });
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const associationPath = associationId || 'global';
      const path = `courses/${associationPath}/${courseId}.${ext}`;

      const uploadRes = await supabaseAdmin.storage
        .from(COURSE_IMAGE_BUCKET)
        .upload(path, bytes, { contentType: file.type, upsert: true });

      if (uploadRes.error) {
        return NextResponse.json(
          {
            ok: false,
            error: `Storage upload failed: ${uploadRes.error.message}. Bucket esperado: ${COURSE_IMAGE_BUCKET}`,
          },
          { status: 200 }
        );
      }

      const publicUrlRes = supabaseAdmin.storage.from(COURSE_IMAGE_BUCKET).getPublicUrl(path);
      imageUrl = publicUrlRes?.data?.publicUrl || null;

      if (imageUrl) {
        await supabaseAdmin.from('courses').update({ image_url: imageUrl }).eq('id', courseId);
      }
    }

    return NextResponse.json({ ok: true, course_id: courseId, image_url: imageUrl }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}
