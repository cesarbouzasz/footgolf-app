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

function isStaffRole(role: unknown, isAdminFlag: unknown) {
  const r = typeof role === 'string' ? role.trim().toLowerCase() : '';
  const isAdmin = isAdminFlag === true;
  return isAdmin || r === 'admin' || r === 'creador';
}

async function getStaffScope(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, role, is_admin, association_id, default_association_id')
    .eq('id', userId)
    .maybeSingle();

  if (!profile || !isStaffRole((profile as any).role, (profile as any).is_admin)) return null;

  const role = String((profile as any).role || '').trim().toLowerCase();
  const associationId = (profile as any).default_association_id || (profile as any).association_id || null;
  return { role, associationId };
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ notifications: [] }, { status: 200 });

    const scope = await getStaffScope(user.id);
    if (!scope) return NextResponse.json({ notifications: [] }, { status: 200 });

    const url = new URL(req.url);
    const limitRaw = url.searchParams.get('limit');
    const limit = Math.min(100, Math.max(10, Number(limitRaw || 50)));

    let query = supabaseAdmin
      .from('association_notifications')
      .select('id, association_id, message, is_active, created_by, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (scope.role !== 'creador' && scope.associationId) {
      query = query.eq('association_id', scope.associationId);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ notifications: [], error: error.message }, { status: 200 });

    const notifications = ((data as any[]) || []).map((row) => ({
      id: String(row.id),
      association_id: row.association_id ? String(row.association_id) : null,
      message: String(row.message || ''),
      is_active: row.is_active === true,
      created_at: String(row.created_at),
    }));

    return NextResponse.json({ notifications }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ notifications: [], error: e?.message || 'Server error' }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scope = await getStaffScope(user.id);
    if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => null);
    const message = String(body?.message || '').trim();
    const associationIdRaw = String(body?.association_id || '').trim();

    if (!message) return NextResponse.json({ error: 'Missing message' }, { status: 400 });

    let associationId: string | null = associationIdRaw || null;
    if (associationIdRaw.toUpperCase() === 'GLOBAL') associationId = null;

    if (scope.role !== 'creador' && scope.associationId && associationId && associationId !== scope.associationId) {
      return NextResponse.json({ error: 'Not allowed for this association' }, { status: 403 });
    }

    if (scope.role !== 'creador' && !associationId) {
      return NextResponse.json({ error: 'Only creador can send GLOBAL notifications' }, { status: 403 });
    }

    const insertRes = await supabaseAdmin
      .from('association_notifications')
      .insert({
        association_id: associationId,
        message,
        is_active: true,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (insertRes.error || !insertRes.data?.id) {
      return NextResponse.json({ error: insertRes.error?.message || 'Insert failed' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: String(insertRes.data.id) }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
