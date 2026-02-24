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

type GroupMember = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  category?: string | null;
};

type EventPoints = {
  event_id: string;
  event_name: string;
  event_date: string | null;
  pointsByUser: Map<string, number>;
};

function buildPointsByUser(eventRow: any): EventPoints {
  const eventId = String(eventRow?.id || '');
  const eventName = String(eventRow?.name || '');
  const eventDate = eventRow?.event_date ? String(eventRow.event_date) : null;
  const config = eventRow?.config || {};
  const byCategory = config?.eventPointsByCategory || {};
  const general = Array.isArray(byCategory?.General) ? byCategory.General : [];
  const pointsByUser = new Map<string, number>();
  general.forEach((row: any) => {
    const userId = String(row?.user_id || '').trim();
    const points = Number(row?.points || 0);
    if (userId) pointsByUser.set(userId, Number.isFinite(points) ? points : 0);
  });
  return { event_id: eventId, event_name: eventName, event_date: eventDate, pointsByUser };
}

function rankByPoints(entries: Array<{ groupId: string; points: number }>) {
  const sorted = [...entries].sort((a, b) => b.points - a.points);
  const ranks = new Map<string, number>();
  let position = 0;
  let lastPoints: number | null = null;
  for (let idx = 0; idx < sorted.length; idx += 1) {
    const entry = sorted[idx];
    if (lastPoints === null || entry.points !== lastPoints) {
      position = idx + 1;
      lastPoints = entry.points;
    }
    ranks.set(entry.groupId, position);
  }
  return ranks;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ groups: [] }, { status: 401 });

    const { profile, isAdmin, role, associationAdminId } = await getAdminProfile(user.id);
    if (!isAdmin) return NextResponse.json({ groups: [], error: 'Forbidden' }, { status: 403 });

    const associationId = String(req.nextUrl.searchParams.get('association_id') || '').trim();
    const groupType = String(req.nextUrl.searchParams.get('group_type') || '').trim().toLowerCase();
    if (!associationId) return NextResponse.json({ groups: [], error: 'Missing association_id' }, { status: 400 });
    if (groupType !== 'parejas' && groupType !== 'equipos') {
      return NextResponse.json({ groups: [], error: 'Invalid group_type' }, { status: 400 });
    }

    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ groups: [], error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { data: eventsData, error: eventsError } = await supabaseAdmin
      .from('events')
      .select('id, name, event_date, config')
      .eq('association_id', associationId)
      .order('event_date', { ascending: false });

    if (eventsError) return NextResponse.json({ groups: [], error: eventsError.message }, { status: 200 });

    const events = (eventsData || []).map((row: any) => buildPointsByUser(row));

    let groups: Array<{ id: string; name: string; members: GroupMember[] }> = [];

    if (groupType === 'equipos') {
      const { data: teamsData, error: teamsError } = await supabaseAdmin
        .from('teams')
        .select('id, association_id, name')
        .eq('association_id', associationId)
        .order('name', { ascending: true });

      if (teamsError) return NextResponse.json({ groups: [], error: teamsError.message }, { status: 200 });

      const teams = (teamsData || []) as Array<any>;
      const teamNames = teams.map((t) => String(t.name));
      const membersByTeam = new Map<string, GroupMember[]>();

      if (teamNames.length > 0) {
        const { data: playersData, error: playersError } = await supabaseAdmin
          .from('profiles')
          .select('id, first_name, last_name, category, team')
          .eq('association_id', associationId)
          .eq('role', 'usuario')
          .in('team', teamNames);

        if (playersError) return NextResponse.json({ groups: [], error: playersError.message }, { status: 200 });

        (playersData || []).forEach((row: any) => {
          const teamName = String(row?.team || '');
          if (!teamName) return;
          const list = membersByTeam.get(teamName) || [];
          list.push({
            id: String(row.id),
            first_name: row.first_name || null,
            last_name: row.last_name || null,
            category: row.category || null,
          });
          membersByTeam.set(teamName, list);
        });
      }

      groups = teams.map((team: any) => ({
        id: String(team.id),
        name: String(team.name || ''),
        members: membersByTeam.get(String(team.name || '')) || [],
      }));
    } else {
      const { data: pairsData, error: pairsError } = await supabaseAdmin
        .from('pairs')
        .select('id, association_id, name')
        .eq('association_id', associationId)
        .order('name', { ascending: true });

      if (pairsError) return NextResponse.json({ groups: [], error: pairsError.message }, { status: 200 });

      const pairs = (pairsData || []) as Array<any>;
      const pairIds = pairs.map((p) => String(p.id));
      const membersByPair = new Map<string, GroupMember[]>();

      if (pairIds.length > 0) {
        const { data: membersData, error: membersError } = await supabaseAdmin
          .from('pair_members')
          .select('pair_id, player_id, profiles:profiles!pair_members_player_id_fkey(first_name,last_name,category)')
          .eq('association_id', associationId)
          .in('pair_id', pairIds);

        if (membersError) return NextResponse.json({ groups: [], error: membersError.message }, { status: 200 });

        (membersData || []).forEach((row: any) => {
          const pairId = String(row?.pair_id || '');
          if (!pairId) return;
          const list = membersByPair.get(pairId) || [];
          list.push({
            id: String(row?.player_id || ''),
            first_name: row?.profiles?.first_name || null,
            last_name: row?.profiles?.last_name || null,
            category: row?.profiles?.category || null,
          });
          membersByPair.set(pairId, list);
        });
      }

      groups = pairs.map((pair: any) => ({
        id: String(pair.id),
        name: String(pair.name || ''),
        members: membersByPair.get(String(pair.id)) || [],
      }));
    }

    const eventEntriesById = new Map<string, Array<{ groupId: string; points: number }>>();
    const groupStats = groups.map((group) => {
      const eventsList = [] as Array<{ event_id: string; event_name: string; event_date: string | null; points: number; position: number | null }>;
      let totalPoints = 0;

      events.forEach((event) => {
        const memberIds = group.members.map((m) => m.id);
        const participated = memberIds.some((id) => event.pointsByUser.has(id));
        if (!participated) return;

        const points = memberIds.reduce((sum, id) => sum + (event.pointsByUser.get(id) || 0), 0);
        totalPoints += points;
        eventsList.push({
          event_id: event.event_id,
          event_name: event.event_name,
          event_date: event.event_date,
          points,
          position: null,
        });

        const list = eventEntriesById.get(event.event_id) || [];
        list.push({ groupId: group.id, points });
        eventEntriesById.set(event.event_id, list);
      });

      return {
        id: group.id,
        name: group.name,
        members: group.members,
        events: eventsList,
        total_points: totalPoints,
      };
    });

    eventEntriesById.forEach((entries, eventId) => {
      const ranks = rankByPoints(entries);
      groupStats.forEach((group) => {
        const entry = group.events.find((ev) => ev.event_id === eventId);
        if (entry) entry.position = ranks.get(group.id) || null;
      });
    });

    return NextResponse.json({ groups: groupStats }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ groups: [], error: e?.message || 'Server error' }, { status: 200 });
  }
}
