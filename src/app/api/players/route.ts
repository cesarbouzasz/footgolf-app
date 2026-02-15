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
      return NextResponse.json({ players: [] }, { status: 401 });
    }

    const associationId = req.nextUrl.searchParams.get('association_id');
    const order = (req.nextUrl.searchParams.get('order') || '').trim().toLowerCase();

    let query = supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, category, birth_year, team, association_id, province')
      .or('role.eq.usuario,role.is.null');

    if (associationId) {
      query = query.eq('association_id', associationId);
    }

    if (order === 'category') {
      query = query.order('category', { ascending: true, nullsFirst: false }).order('last_name', { ascending: true }).order('first_name', { ascending: true });
    } else if (order === 'province') {
      query = query.order('province', { ascending: true, nullsFirst: false }).order('last_name', { ascending: true }).order('first_name', { ascending: true });
    } else {
      query = query.order('last_name', { ascending: true }).order('first_name', { ascending: true });
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ players: [], error: error.message }, { status: 200 });
    }

    const players = (data || []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      category?: string | null;
      birth_year?: number | null;
      team?: string | null;
      association_id?: string | null;
      province?: string | null;
    }>;

    // Enriquecer con cantidad de eventos jugados en el último año.
    // Si la tabla no existe o hay error, devolvemos players sin bloquear el endpoint.
    let eventsPlayedByUser: Record<string, number> = {};
    try {
      const userIds = players.map((p) => p.id).filter(Boolean);
      if (userIds.length > 0) {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const { data: regRows, error: regError } = await supabaseAdmin
          .from('event_registrations')
          .select('user_id, event_id, created_at')
          .in('user_id', userIds)
          .gte('created_at', oneYearAgo.toISOString());

        if (!regError && Array.isArray(regRows)) {
          for (const row of regRows as any[]) {
            const userId = String(row.user_id || '');
            if (!userId) continue;
            eventsPlayedByUser[userId] = (eventsPlayedByUser[userId] || 0) + 1;
          }
        }
      }
    } catch {
      // ignore
    }

    const playersWithCounts = players.map((p) => ({
      ...p,
      events_played_last_year: eventsPlayedByUser[p.id] || 0,
    }));

    return NextResponse.json({ players: playersWithCounts }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ players: [], error: e?.message || 'Server error' }, { status: 200 });
  }
}
