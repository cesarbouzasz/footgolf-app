import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getAuthedUser(req: NextRequest) {
  // 1) Try cookie-based session (SSR style)
  try {
    const supabaseAuth = await createServerClient();
    const { data, error } = await supabaseAuth.auth.getUser();
    if (!error && data?.user) return data.user;
  } catch {
    // ignore
  }

  // 2) Try Authorization bearer token (client localStorage session)
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
      return NextResponse.json({ profile: null }, { status: 200 });
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      return NextResponse.json({ profile: null, error: error.message }, { status: 200 });
    }

    // Extras opcionales: si la tabla no existe, no bloquear.
    let extras: any = null;
    try {
      const { data: exData, error: exErr } = await supabaseAdmin
        .from('profile_extras')
        .select('phone, region, province, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!exErr) extras = exData;
    } catch {
      // ignore
    }

    const merged = { ...(profile as any) };
    if (extras && typeof extras === 'object') {
      for (const k of ['phone', 'region', 'province', 'avatar_url']) {
        if (k in extras) (merged as any)[k] = (extras as any)[k];
      }
    }

    return NextResponse.json({ profile: merged }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ profile: null, error: e?.message || 'Server error' }, { status: 200 });
  }
}
