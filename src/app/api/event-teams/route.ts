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
    if (!user) return NextResponse.json({ teams: [], members: [] }, { status: 401 });

    const { profile, isAdmin, role, associationAdminId } = await getAdminProfile(user.id);
    if (!isAdmin) return NextResponse.json({ teams: [], members: [], error: 'Forbidden' }, { status: 403 });

    const associationId = String(req.nextUrl.searchParams.get('association_id') || '').trim();
    const eventId = String(req.nextUrl.searchParams.get('event_id') || '').trim();
    if (!associationId) return NextResponse.json({ teams: [], members: [], error: 'Missing association_id' }, { status: 400 });
    if (!eventId) return NextResponse.json({ teams: [], members: [], error: 'Missing event_id' }, { status: 400 });

    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ teams: [], members: [], error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { data: eventRow } = await supabaseAdmin
      .from('events')
      .select('id, association_id')
      .eq('id', eventId)
      .single();

    if (!eventRow) return NextResponse.json({ teams: [], members: [], error: 'Event not found' }, { status: 404 });
    if (String((eventRow as any).association_id || '') !== associationId) {
      return NextResponse.json({ teams: [], members: [], error: 'Event belongs to a different association' }, { status: 400 });
    }

    const { data: teamsData, error: teamsError } = await supabaseAdmin
      .from('event_teams')
      .select('id, association_id, event_id, name, max_players, created_at')
      .eq('association_id', associationId)
      .eq('event_id', eventId)
      .order('name', { ascending: true });

    if (teamsError) return NextResponse.json({ teams: [], members: [], error: teamsError.message }, { status: 200 });

    const teams = (teamsData || []) as Array<any>;
    const teamIds = teams.map((t) => String(t.id));

    let members: any[] = [];
    if (teamIds.length > 0) {
      const { data: membersData, error: membersError } = await supabaseAdmin
        .from('event_team_members')
        .select('id, team_id, player_id, created_at, profiles:profiles!event_team_members_player_id_fkey(first_name,last_name,category,province)')
        .eq('association_id', associationId)
        .eq('event_id', eventId)
        .in('team_id', teamIds);

      if (membersError) {
        return NextResponse.json({ teams: [], members: [], error: membersError.message }, { status: 200 });
      }

      members = (membersData || []).map((row: any) => ({
        id: row.id,
        team_id: row.team_id,
        player_id: row.player_id,
        created_at: row.created_at,
        first_name: row?.profiles?.first_name || null,
        last_name: row?.profiles?.last_name || null,
        category: row?.profiles?.category || null,
        province: row?.profiles?.province || null,
      }));
    }

    const counts = new Map<string, number>();
    for (const m of members) {
      counts.set(String(m.team_id), (counts.get(String(m.team_id)) || 0) + 1);
    }

    const withCounts = teams.map((t) => ({
      id: t.id,
      association_id: t.association_id,
      event_id: t.event_id,
      name: t.name,
      max_players: t.max_players,
      created_at: t.created_at,
      member_count: counts.get(String(t.id)) || 0,
    }));

    return NextResponse.json({ teams: withCounts, members }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ teams: [], members: [], error: e?.message || 'Server error' }, { status: 200 });
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
    const eventId = String(body?.event_id || '').trim();
    const name = String(body?.name || '').trim();
    const maxPlayersRaw = Number(body?.max_players);
    const maxPlayers = Number.isFinite(maxPlayersRaw) ? Math.floor(maxPlayersRaw) : NaN;

    if (!associationId) return NextResponse.json({ ok: false, error: 'Missing association_id' }, { status: 400 });
    if (!eventId) return NextResponse.json({ ok: false, error: 'Missing event_id' }, { status: 400 });
    if (!name) return NextResponse.json({ ok: false, error: 'Missing name' }, { status: 400 });
    if (!Number.isFinite(maxPlayers) || maxPlayers < 2 || maxPlayers > 50) {
      return NextResponse.json({ ok: false, error: 'max_players must be between 2 and 50' }, { status: 400 });
    }

    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { data: eventRow } = await supabaseAdmin
      .from('events')
      .select('id, association_id')
      .eq('id', eventId)
      .single();

    if (!eventRow) return NextResponse.json({ ok: false, error: 'Event not found' }, { status: 404 });
    if (String((eventRow as any).association_id || '') !== associationId) {
      return NextResponse.json({ ok: false, error: 'Event belongs to a different association' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('event_teams')
      .insert([
        {
          association_id: associationId,
          event_id: eventId,
          name,
          max_players: maxPlayers,
          created_by: user.id,
        },
      ])
      .select('id, association_id, event_id, name, max_players, created_at')
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });

    return NextResponse.json({ ok: true, team: { ...data, member_count: 0 } }, { status: 200 });
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
    const associationId = String(body?.association_id || '').trim();
    const eventId = String(body?.event_id || '').trim();
    const teamId = String(body?.team_id || '').trim();

    if (!associationId) return NextResponse.json({ ok: false, error: 'Missing association_id' }, { status: 400 });
    if (!eventId) return NextResponse.json({ ok: false, error: 'Missing event_id' }, { status: 400 });
    if (!teamId) return NextResponse.json({ ok: false, error: 'Missing team_id' }, { status: 400 });

    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { data: teamRow } = await supabaseAdmin
      .from('event_teams')
      .select('id, association_id, event_id')
      .eq('id', teamId)
      .single();

    if (!teamRow) return NextResponse.json({ ok: false, error: 'Team not found' }, { status: 404 });
    if (String((teamRow as any).association_id || '') !== associationId) {
      return NextResponse.json({ ok: false, error: 'Team belongs to a different association' }, { status: 400 });
    }
    if (String((teamRow as any).event_id || '') !== eventId) {
      return NextResponse.json({ ok: false, error: 'Team belongs to a different event' }, { status: 400 });
    }

    const { error: membersError } = await supabaseAdmin
      .from('event_team_members')
      .delete()
      .eq('association_id', associationId)
      .eq('event_id', eventId)
      .eq('team_id', teamId);

    if (membersError) {
      return NextResponse.json({ ok: false, error: membersError.message }, { status: 200 });
    }

    const { error: teamError } = await supabaseAdmin
      .from('event_teams')
      .delete()
      .eq('id', teamId)
      .eq('association_id', associationId)
      .eq('event_id', eventId);

    if (teamError) return NextResponse.json({ ok: false, error: teamError.message }, { status: 200 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}
