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

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      return NextResponse.json({ playerId: null }, { status: 200 });
    }

    const email = (user.email || '').toLowerCase();
    if (email === 'mbs2026@gmail.com') {
      return NextResponse.json({ playerId: 0 }, { status: 200 });
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, role, created_at')
      .order('created_at', { ascending: true });

    if (error || !data) {
      return NextResponse.json({ playerId: null, error: error?.message }, { status: 200 });
    }

    const creator = data.find((row: any) => row.role === 'creador');
    const admins = data.filter((row: any) => row.role === 'admin');
    const others = data.filter((row: any) => row.role !== 'creador' && row.role !== 'admin');

    const map = new Map<string, number>();
    let index = 0;

    if (creator) {
      map.set(creator.id, 0);
      index = 1;
    }

    admins.forEach((row: any) => {
      if (!map.has(row.id)) {
        map.set(row.id, index);
        index += 1;
      }
    });

    others.forEach((row: any) => {
      if (!map.has(row.id)) {
        map.set(row.id, index);
        index += 1;
      }
    });

    return NextResponse.json({ playerId: map.get(user.id) ?? null }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ playerId: null, error: e?.message || 'Server error' }, { status: 200 });
  }
}
