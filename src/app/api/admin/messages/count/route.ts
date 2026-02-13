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

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ unread: 0 }, { status: 200 });

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, role, is_admin, association_id, default_association_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || !isStaffRole((profile as any).role, (profile as any).is_admin)) {
      return NextResponse.json({ unread: 0 }, { status: 200 });
    }

    const role = String((profile as any).role || '').trim().toLowerCase();
    const associationId = (profile as any).default_association_id || (profile as any).association_id || null;

    let query = supabaseAdmin
      .from('admin_messages')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false);

    // Admin de asociación: filtra por su asociación. Creador: ve global.
    if (role !== 'creador' && associationId) {
      query = query.eq('association_id', associationId);
    }

    const { count, error } = await query;

    if (error) {
      const msg = (error as any)?.message || '';
      if (/relation\s+"admin_messages"\s+does\s+not\s+exist/i.test(msg)) {
        return NextResponse.json({ unread: 0, missingTable: true }, { status: 200 });
      }
      return NextResponse.json({ unread: 0 }, { status: 200 });
    }

    return NextResponse.json({ unread: count || 0 }, { status: 200 });
  } catch {
    return NextResponse.json({ unread: 0 }, { status: 200 });
  }
}
