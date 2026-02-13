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
    if (!user) return NextResponse.json({ events: [] }, { status: 401 });

    const { profile, isAdmin, role, associationAdminId } = await getAdminProfile(user.id);
    if (!isAdmin) return NextResponse.json({ events: [], error: 'Forbidden' }, { status: 403 });

    const associationId = String(req.nextUrl.searchParams.get('association_id') || '').trim();
    if (!associationId) {
      return NextResponse.json({ events: [], error: 'Missing association_id' }, { status: 400 });
    }

    const mineParam = String(req.nextUrl.searchParams.get('mine') || '').trim().toLowerCase();
    const scope = String(req.nextUrl.searchParams.get('scope') || '').trim().toLowerCase();
    const createdBy = String(req.nextUrl.searchParams.get('created_by') || '').trim().toLowerCase();
    const mine = mineParam === '1' || mineParam === 'true' || scope === 'mine' || createdBy === 'me';

    // Fase de pruebas: cualquier admin/creador puede listar eventos de cualquier asociación.
    // (Se mantiene el requisito de estar autenticado y ser admin.)

    let query = supabaseAdmin
      .from('events')
      .select('id, name, event_date')
      .eq('association_id', associationId);

    if (mine) {
      query = query.eq('created_by', user.id);
    }

    const { data, error } = await query
      .order('event_date', { ascending: false })
      .order('name', { ascending: true });

    if (error) return NextResponse.json({ events: [], error: error.message }, { status: 200 });

    const events = ((data as any[]) || []).map((row) => ({
      id: String(row.id),
      name: String(row.name || ''),
      event_date: row.event_date ? String(row.event_date) : null,
    }));

    return NextResponse.json({ events }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ events: [], error: e?.message || 'Server error' }, { status: 200 });
  }
}
