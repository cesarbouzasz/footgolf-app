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
      .or('role.eq.usuario,role.eq.jugador,role.eq.admin,role.eq.creador,role.is.null');

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

    let displayIdByUser: Record<string, number> = {};
    try {
      const { data: allProfiles, error: allProfilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, role, created_at')
        .order('created_at', { ascending: true });

      if (!allProfilesError && Array.isArray(allProfiles)) {
        const creator = allProfiles.find((row: any) => row.role === 'creador');
        const admins = allProfiles.filter((row: any) => row.role === 'admin');
        const others = allProfiles.filter((row: any) => row.role !== 'creador' && row.role !== 'admin');

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

        displayIdByUser = Object.fromEntries(map.entries());
      }
    } catch {
      // ignore
    }

    let pairNamesByUser: Record<string, string[]> = {};
    try {
      const userIds = players.map((p) => p.id).filter(Boolean);
      if (userIds.length > 0) {
        let membersQuery = supabaseAdmin
          .from('pair_members')
          .select('pair_id, player_id, association_id')
          .in('player_id', userIds);

        if (associationId) {
          membersQuery = membersQuery.eq('association_id', associationId);
        }

        const { data: pairMembers, error: pairMembersError } = await membersQuery;

        if (!pairMembersError && Array.isArray(pairMembers) && pairMembers.length > 0) {
          const pairIds = Array.from(new Set(pairMembers.map((row: any) => String(row.pair_id || '')).filter(Boolean)));
          const { data: pairRows, error: pairRowsError } = await supabaseAdmin
            .from('pairs')
            .select('id, name')
            .in('id', pairIds);

          if (!pairRowsError && Array.isArray(pairRows)) {
            const pairNameById: Record<string, string> = {};
            for (const row of pairRows as any[]) {
              const id = String(row.id || '');
              const name = String(row.name || '').trim();
              if (id && name) pairNameById[id] = name;
            }

            for (const member of pairMembers as any[]) {
              const userId = String(member.player_id || '');
              const pairName = pairNameById[String(member.pair_id || '')] || '';
              if (!userId || !pairName) continue;
              const list = pairNamesByUser[userId] || [];
              if (!list.includes(pairName)) {
                list.push(pairName);
                pairNamesByUser[userId] = list;
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }

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
      player_display_id: displayIdByUser[p.id] ?? null,
      pair_names: pairNamesByUser[p.id] || [],
      events_played_last_year: eventsPlayedByUser[p.id] || 0,
    }));

    return NextResponse.json({ players: playersWithCounts }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ players: [], error: e?.message || 'Server error' }, { status: 200 });
  }
}
