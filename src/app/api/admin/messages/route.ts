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
    if (!user) return NextResponse.json({ messages: [] }, { status: 200 });

    const scope = await getStaffScope(user.id);
    if (!scope) return NextResponse.json({ messages: [] }, { status: 200 });

    const url = new URL(req.url);
    const limitRaw = url.searchParams.get('limit');
    const limit = Math.min(100, Math.max(10, Number(limitRaw || 50)));

    let query = supabaseAdmin
      .from('admin_messages')
      .select('id, association_id, created_by, created_by_email, message, is_read, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (scope.role !== 'creador' && scope.associationId) {
      query = query.eq('association_id', scope.associationId);
    }

    const { data, error } = await query;
    if (error) {
      const msg = (error as any)?.message || '';
      if (/relation\s+"admin_messages"\s+does\s+not\s+exist/i.test(msg)) {
        return NextResponse.json({ messages: [], missingTable: true }, { status: 200 });
      }
      return NextResponse.json({ messages: [], error: msg }, { status: 200 });
    }

    return NextResponse.json({ messages: data || [] }, { status: 200 });
  } catch {
    return NextResponse.json({ messages: [] }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scope = await getStaffScope(user.id);
    if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => null);
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === 'string') : [];
    if (!ids.length) return NextResponse.json({ ok: true }, { status: 200 });

    // Limita el update al scope
    let update = supabaseAdmin.from('admin_messages').update({ is_read: true }).in('id', ids);
    if (scope.role !== 'creador' && scope.associationId) {
      update = update.eq('association_id', scope.associationId);
    }

    const { error } = await update;
    if (error) {
      return NextResponse.json({ error: (error as any)?.message || 'Error' }, { status: 400 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
