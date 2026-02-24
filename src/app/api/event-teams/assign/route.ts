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

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Not authed' }, { status: 401 });

    const { profile, isAdmin, role, associationAdminId } = await getAdminProfile(user.id);
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const teamId = String(body?.team_id || '').trim();
    const playerId = String(body?.player_id || '').trim();
    if (!teamId) return NextResponse.json({ ok: false, error: 'Missing team_id' }, { status: 400 });
    if (!playerId) return NextResponse.json({ ok: false, error: 'Missing player_id' }, { status: 400 });

    const { data: team, error: teamError } = await supabaseAdmin
      .from('event_teams')
      .select('id, association_id, event_id, name, max_players')
      .eq('id', teamId)
      .single();

    if (teamError || !team) return NextResponse.json({ ok: false, error: 'Team not found' }, { status: 404 });

    const associationId = String((team as any).association_id || '');
    const eventId = String((team as any).event_id || '');
    const maxPlayers = Number((team as any).max_players || 0);

    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { data: player, error: playerError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, association_id')
      .eq('id', playerId)
      .single();

    if (playerError || !player) return NextResponse.json({ ok: false, error: 'Player not found' }, { status: 404 });

    const playerRole = String((player as any).role || '').trim().toLowerCase();
    if (!new Set(['usuario', 'jugador', 'admin']).has(playerRole)) {
      return NextResponse.json({ ok: false, error: 'Only roles usuario, jugador or admin can be assigned' }, { status: 400 });
    }

    if (String((player as any).association_id || '') !== associationId) {
      return NextResponse.json({ ok: false, error: 'Player belongs to a different association' }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from('event_team_members')
      .select('id, team_id')
      .eq('association_id', associationId)
      .eq('event_id', eventId)
      .eq('player_id', playerId)
      .maybeSingle();

    if (existing?.id) {
      if (String((existing as any).team_id) === teamId) {
        return NextResponse.json({ ok: true }, { status: 200 });
      }
      return NextResponse.json({ ok: false, error: 'Player is already assigned to another team in this event' }, { status: 200 });
    }

    const { count } = await supabaseAdmin
      .from('event_team_members')
      .select('id', { count: 'exact', head: true })
      .eq('association_id', associationId)
      .eq('event_id', eventId)
      .eq('team_id', teamId);

    const currentCount = typeof count === 'number' ? count : 0;
    if (Number.isFinite(maxPlayers) && maxPlayers > 0 && currentCount >= maxPlayers) {
      return NextResponse.json({ ok: false, error: 'Team is full' }, { status: 200 });
    }

    const { error: insertError } = await supabaseAdmin
      .from('event_team_members')
      .insert([
        {
          association_id: associationId,
          event_id: eventId,
          team_id: teamId,
          player_id: playerId,
          created_by: user.id,
        },
      ]);

    if (insertError) return NextResponse.json({ ok: false, error: insertError.message }, { status: 200 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}
