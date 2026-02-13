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
  const { data: profile, error: profileError } = await supabaseAdmin
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

  return {
    profile: profile as any,
    profileError: profileError?.message || null,
    isAdmin,
    role,
    associationAdminId,
  };
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
    if (!user) return NextResponse.json({ teams: [] }, { status: 401 });

    const { profile, isAdmin, role, associationAdminId } = await getAdminProfile(user.id);
    if (!isAdmin) return NextResponse.json({ teams: [], error: 'Forbidden' }, { status: 403 });

    const associationId = String(req.nextUrl.searchParams.get('association_id') || '').trim();
    if (!associationId) return NextResponse.json({ teams: [], error: 'Missing association_id' }, { status: 400 });

    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ teams: [], error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('teams')
      .select('id, association_id, name, max_players, created_at')
      .eq('association_id', associationId)
      .order('name', { ascending: true });

    if (error) return NextResponse.json({ teams: [], error: error.message }, { status: 200 });

    const teams = (data || []) as Array<{
      id: string;
      association_id: string;
      name: string;
      max_players: number;
      created_at: string;
    }>;

    // Member counts derived from profiles.team (backward compatible and fast enough).
    const withCounts = await Promise.all(
      teams.map(async (t) => {
        const { count } = await supabaseAdmin
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('association_id', associationId)
          .eq('role', 'usuario')
          .eq('team', t.name);
        return { ...t, member_count: typeof count === 'number' ? count : 0 };
      })
    );

    return NextResponse.json({ teams: withCounts }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ teams: [], error: e?.message || 'Server error' }, { status: 200 });
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
    const name = String(body?.name || '').trim();
    const maxPlayersRaw = Number(body?.max_players);
    const maxPlayers = Number.isFinite(maxPlayersRaw) ? Math.floor(maxPlayersRaw) : NaN;

    if (!associationId) return NextResponse.json({ ok: false, error: 'Missing association_id' }, { status: 400 });
    if (!name) return NextResponse.json({ ok: false, error: 'Missing name' }, { status: 400 });
    if (!Number.isFinite(maxPlayers) || maxPlayers < 1 || maxPlayers > 50) {
      return NextResponse.json({ ok: false, error: 'max_players must be between 1 and 50' }, { status: 400 });
    }

    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('teams')
      .insert([{ association_id: associationId, name, max_players: maxPlayers }])
      .select('id, association_id, name, max_players, created_at')
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });

    return NextResponse.json({ ok: true, team: data }, { status: 200 });
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
    const teamId = String(body?.team_id || '').trim();

    if (!associationId) return NextResponse.json({ ok: false, error: 'Missing association_id' }, { status: 400 });
    if (!teamId) return NextResponse.json({ ok: false, error: 'Missing team_id' }, { status: 400 });

    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { data: teamRow, error: teamError } = await supabaseAdmin
      .from('teams')
      .select('id, association_id, name')
      .eq('id', teamId)
      .single();

    if (teamError || !teamRow) return NextResponse.json({ ok: false, error: 'Team not found' }, { status: 404 });
    if (String((teamRow as any).association_id || '') !== associationId) {
      return NextResponse.json({ ok: false, error: 'Team belongs to a different association' }, { status: 400 });
    }

    const teamName = String((teamRow as any).name || '');

    const { error: clearError } = await supabaseAdmin
      .from('profiles')
      .update({ team: null })
      .eq('association_id', associationId)
      .eq('team', teamName);

    if (clearError) return NextResponse.json({ ok: false, error: clearError.message }, { status: 200 });

    const { error: deleteError } = await supabaseAdmin
      .from('teams')
      .delete()
      .eq('id', teamId)
      .eq('association_id', associationId);

    if (deleteError) return NextResponse.json({ ok: false, error: deleteError.message }, { status: 200 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}
