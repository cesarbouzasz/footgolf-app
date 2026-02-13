import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function getAdminProfile(userId: string) {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, role, association_id, default_association_id')
    .eq('id', userId)
    .single();

  const roleRaw = (profile as any)?.role;
  const role = typeof roleRaw === 'string' ? roleRaw.trim().toLowerCase() : '';
  let isAdmin = role === 'admin' || role === 'creador';

  // Fallback: treat as admin if the user is the admin_id of any association.
  // This prevents 403 when profile role is mis-set or when profile query fails.
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

  return {
    profile: profile as any,
    profileError: profileError?.message || null,
    isAdmin,
    associationAdminId,
  };
}

function isCreatorRole(profile: any) {
  const roleRaw = profile?.role;
  const role = typeof roleRaw === 'string' ? roleRaw.trim().toLowerCase() : '';
  return role === 'creador';
}

async function isAssociationAdmin(userId: string, associationId: string) {
  const { data, error } = await supabaseAdmin
    .from('associations')
    .select('id')
    .eq('id', associationId)
    .eq('admin_id', userId)
    .maybeSingle();

  if (error) return false;
  return !!data?.id;
}

function isBootstrapAdminEmail(email?: string | null) {
  const configured = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'mbs2026@gmail.com').trim().toLowerCase();
  const current = (email || '').trim().toLowerCase();
  return !!configured && current === configured;
}

function pickAssociationId(
  profile: any,
  associationAdminId: string | null,
  requested?: string | null
) {
  const allowed1 = profile?.default_association_id || null;
  const allowed2 = profile?.association_id || null;
  const allowed3 = associationAdminId || null;
  const fallback = allowed1 || allowed2 || allowed3;

  if (!requested) return fallback;
  if (requested === allowed1 || requested === allowed2 || requested === allowed3) return requested;
  return null;
}

async function resolveAssociationId(params: {
  userId: string;
  profile: any;
  associationAdminId: string | null;
  requested: string | null;
  bootstrap: boolean;
}) {
  const { userId, profile, associationAdminId, requested, bootstrap } = params;

  if (requested) {
    if (bootstrap) return requested;
    const picked = pickAssociationId(profile, associationAdminId, requested);
    if (picked) return picked;
    const ok = await isAssociationAdmin(userId, requested);
    if (ok) return requested;
    return null;
  }

  return pickAssociationId(profile, associationAdminId, null);
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ announcements: [] }, { status: 401 });

    const associationRequested = req.nextUrl.searchParams.get('association_id');

    const adminCtx = await getAdminProfile(user.id);
    const bootstrap = isBootstrapAdminEmail((user as any)?.email);

    let isAdmin = adminCtx.isAdmin || bootstrap;
    let associationAdminId = adminCtx.associationAdminId;

    if (!isAdmin && associationRequested) {
      const ok = await isAssociationAdmin(user.id, associationRequested);
      if (ok) {
        isAdmin = true;
        associationAdminId = associationRequested;
      }
    }

    if (!isAdmin) {
      const debug = process.env.NODE_ENV !== 'production'
        ? {
            profileError: adminCtx.profileError,
            role: (adminCtx.profile as any)?.role ?? null,
            associationRequested: associationRequested ?? null,
          }
        : undefined;
      return NextResponse.json({ announcements: [], error: 'Forbidden', debug }, { status: 403 });
    }

    const start = req.nextUrl.searchParams.get('start') || '';
    const end = req.nextUrl.searchParams.get('end') || '';
    if (!isIsoDate(start) || !isIsoDate(end)) {
      return NextResponse.json({ announcements: [], error: 'Invalid start/end' }, { status: 400 });
    }

    const associationId = await resolveAssociationId({
      userId: user.id,
      profile: adminCtx.profile,
      associationAdminId,
      requested: associationRequested,
      bootstrap,
    });
    if (!associationId) return NextResponse.json({ announcements: [] }, { status: 200 });

    const { data, error } = await supabaseAdmin
      .from('calendar_announcements')
      .select('id, association_id, date, category, title, description, updated_at')
      .gte('date', start)
      .lte('date', end)
      .eq('association_id', associationId)
      .order('date', { ascending: true });

    if (error) {
      return NextResponse.json({ announcements: [], error: error.message }, { status: 200 });
    }

    return NextResponse.json({ announcements: data || [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ announcements: [], error: e?.message || 'Server error' }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const applyToAll = body?.apply_to_all === true;
    const associationRequested = (body?.association_id ? String(body.association_id) : '') || null;

    const adminCtx = await getAdminProfile(user.id);
    const bootstrap = isBootstrapAdminEmail((user as any)?.email);

    let isAdmin = adminCtx.isAdmin || bootstrap;
    let associationAdminId = adminCtx.associationAdminId;

    if (!isAdmin && associationRequested) {
      const ok = await isAssociationAdmin(user.id, associationRequested);
      if (ok) {
        isAdmin = true;
        associationAdminId = associationRequested;
      }
    }

    if (!isAdmin) {
      const debug = process.env.NODE_ENV !== 'production'
        ? {
            profileError: adminCtx.profileError,
            role: (adminCtx.profile as any)?.role ?? null,
            associationRequested,
          }
        : undefined;
      return NextResponse.json({ ok: false, error: 'Forbidden', debug }, { status: 403 });
    }

    const date = String(body?.date || '').slice(0, 10);
    const categoryRaw = String(body?.category || 'especial');
    const category = (['local', 'regional', 'nacional', 'major', 'especial'] as const).includes(
      categoryRaw as any
    )
      ? (categoryRaw as any)
      : 'especial';
    const title = String(body?.title || '').trim();
    const descriptionRaw = body?.description;
    const description = typeof descriptionRaw === 'string' ? descriptionRaw.trim() : null;

    if (!isIsoDate(date) || !title) {
      const debug = process.env.NODE_ENV !== 'production'
        ? {
            date,
            titleLength: title.length,
            associationRequested,
            categoryRaw,
          }
        : undefined;
      return NextResponse.json({ ok: false, error: 'Invalid payload', debug }, { status: 400 });
    }

    // GLOBAL (apply to all associations): only allowed for role 'creador'.
    if (applyToAll) {
      const isCreator = isCreatorRole(adminCtx.profile) || bootstrap;
      if (!isCreator) {
        return NextResponse.json({ ok: false, error: 'Only creador can apply GLOBAL announcements' }, { status: 403 });
      }

      const { data: associations, error: assocError } = await supabaseAdmin
        .from('associations')
        .select('id');

      if (assocError) {
        return NextResponse.json({ ok: false, error: assocError.message }, { status: 200 });
      }

      const ids = (associations || [])
        .map((row: any) => String(row?.id || ''))
        .filter(Boolean);

      if (ids.length === 0) {
        return NextResponse.json({ ok: false, error: 'No associations found' }, { status: 400 });
      }

      const now = new Date().toISOString();
      const payloads = ids.map((association_id) => ({
        association_id,
        date,
        category,
        title,
        description,
        created_by: user.id,
        updated_at: now,
      }));

      const { error: upsertError } = await supabaseAdmin
        .from('calendar_announcements')
        .upsert(payloads, { onConflict: 'association_id,date' });

      if (upsertError) {
        return NextResponse.json({ ok: false, error: upsertError.message }, { status: 200 });
      }

      return NextResponse.json({ ok: true, applied_to_all: true, count: ids.length }, { status: 200 });
    }

    const associationId = await resolveAssociationId({
      userId: user.id,
      profile: adminCtx.profile,
      associationAdminId,
      requested: associationRequested,
      bootstrap,
    });
    if (!associationId) {
      const associationAdminCheck = associationRequested
        ? await isAssociationAdmin(user.id, associationRequested).catch(() => false)
        : null;
      const debug = process.env.NODE_ENV !== 'production'
        ? {
            associationRequested,
            profileDefaultAssociationId: (adminCtx.profile as any)?.default_association_id ?? null,
            profileAssociationId: (adminCtx.profile as any)?.association_id ?? null,
            associationAdminId,
            bootstrap,
            associationAdminCheck,
          }
        : undefined;
      return NextResponse.json({ ok: false, error: 'No association', debug }, { status: 400 });
    }

    const payload = {
      association_id: associationId,
      date,
      category,
      title,
      description,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('calendar_announcements')
      .upsert(payload, { onConflict: 'association_id,date' })
      .select('id, association_id, date, category, title, description, updated_at')
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ ok: true, announcement: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const applyToAll = body?.apply_to_all === true;
    const associationRequested = (body?.association_id ? String(body.association_id) : '') || null;

    const adminCtx = await getAdminProfile(user.id);
    const bootstrap = isBootstrapAdminEmail((user as any)?.email);
    let isAdmin = adminCtx.isAdmin || bootstrap;
    let associationAdminId = adminCtx.associationAdminId;

    if (!isAdmin && associationRequested) {
      const ok = await isAssociationAdmin(user.id, associationRequested);
      if (ok) {
        isAdmin = true;
        associationAdminId = associationRequested;
      }
    }

    if (!isAdmin) {
      const debug = process.env.NODE_ENV !== 'production'
        ? {
            profileError: adminCtx.profileError,
            role: (adminCtx.profile as any)?.role ?? null,
            associationRequested,
          }
        : undefined;
      return NextResponse.json({ ok: false, error: 'Forbidden', debug }, { status: 403 });
    }

    const date = String(body?.date || '').slice(0, 10);
    if (!isIsoDate(date)) {
      return NextResponse.json({ ok: false, error: 'Invalid date' }, { status: 400 });
    }

    if (applyToAll) {
      const isCreator = isCreatorRole(adminCtx.profile) || bootstrap;
      if (!isCreator) {
        return NextResponse.json({ ok: false, error: 'Only creador can apply GLOBAL deletions' }, { status: 403 });
      }

      const { error } = await supabaseAdmin
        .from('calendar_announcements')
        .delete()
        .eq('date', date);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
      }

      return NextResponse.json({ ok: true, applied_to_all: true }, { status: 200 });
    }

    const associationId = await resolveAssociationId({
      userId: user.id,
      profile: adminCtx.profile,
      associationAdminId,
      requested: associationRequested,
      bootstrap,
    });
    if (!associationId) {
      return NextResponse.json({ ok: false, error: 'No association' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('calendar_announcements')
      .delete()
      .eq('association_id', associationId)
      .eq('date', date);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}
