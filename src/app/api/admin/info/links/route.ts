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
    if (!user) return NextResponse.json({ links: [] }, { status: 401 });

    const { profile, isAdmin, role, associationAdminId } = await getAdminProfile(user.id);
    if (!isAdmin) return NextResponse.json({ links: [], error: 'Forbidden' }, { status: 403 });

    const associationId = String(req.nextUrl.searchParams.get('association_id') || '').trim();
    if (!associationId) return NextResponse.json({ links: [], error: 'Missing association_id' }, { status: 400 });

    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ links: [], error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('info_links')
      .select('id, association_id, title, url, note, created_at')
      .eq('association_id', associationId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ links: [], error: error.message }, { status: 200 });
    return NextResponse.json({ links: data || [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ links: [], error: e?.message || 'Server error' }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Not authed' }, { status: 401 });

    const { profile, isAdmin, role, associationAdminId } = await getAdminProfile(user.id);
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const associationId = String(body?.association_id || '').trim();
    const title = String(body?.title || '').trim();
    const url = String(body?.url || '').trim();
    const note = String(body?.note || '').trim();

    if (!associationId) return NextResponse.json({ ok: false, error: 'Missing association_id' }, { status: 400 });
    if (!title) return NextResponse.json({ ok: false, error: 'Missing title' }, { status: 400 });
    if (!url) return NextResponse.json({ ok: false, error: 'Missing url' }, { status: 400 });

    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('info_links')
      .insert([{ association_id: associationId, title, url, note: note || null, created_by: user.id }])
      .select('id, association_id, title, url, note, created_at')
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    return NextResponse.json({ ok: true, link: data }, { status: 200 });
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

    const { data: row } = await supabaseAdmin.from('info_links').select('id, association_id').eq('id', id).single();
    if (!row) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      const associationId = String((row as any)?.association_id || '');
      if (allowed.length > 0 && associationId && !allowed.includes(associationId)) {
        return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { error } = await supabaseAdmin.from('info_links').delete().eq('id', id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}
