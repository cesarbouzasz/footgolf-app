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

function normalizePlayerIds(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v || '').trim()).filter(Boolean);
}

async function validatePlayers(associationId: string, playerIds: string[]) {
  if (playerIds.length !== 2) return 'Pair must have exactly 2 players';
  if (new Set(playerIds).size !== 2) return 'Pair players must be unique';

  const { data: players, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, association_id')
    .in('id', playerIds);

  if (error) return error.message;
  if (!players || players.length !== 2) return 'Player not found';

  const allowedRoles = new Set(['usuario', 'jugador', 'admin']);

  for (const p of players as any[]) {
    const role = String(p.role || '').trim().toLowerCase();
    if (!allowedRoles.has(role)) return 'Only roles usuario, jugador or admin can be assigned';
    if (String(p.association_id || '') !== associationId) return 'Player belongs to a different association';
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ pairs: [] }, { status: 401 });

    const { profile, isAdmin, role, associationAdminId } = await getAdminProfile(user.id);
    if (!isAdmin) return NextResponse.json({ pairs: [], error: 'Forbidden' }, { status: 403 });

    const associationId = String(req.nextUrl.searchParams.get('association_id') || '').trim();
    if (!associationId) return NextResponse.json({ pairs: [], error: 'Missing association_id' }, { status: 400 });

    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ pairs: [], error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { data: pairsData, error: pairsError } = await supabaseAdmin
      .from('pairs')
      .select('id, association_id, name, created_at')
      .eq('association_id', associationId)
      .order('name', { ascending: true });

    if (pairsError) return NextResponse.json({ pairs: [], error: pairsError.message }, { status: 200 });

    const pairs = (pairsData || []) as Array<{ id: string; association_id: string; name: string }>;
    const pairIds = pairs.map((p) => p.id);

    let members: any[] = [];
    if (pairIds.length > 0) {
      const { data: membersData, error: membersError } = await supabaseAdmin
        .from('pair_members')
        .select('pair_id, player_id, profiles:profiles!pair_members_player_id_fkey(first_name,last_name,category)')
        .eq('association_id', associationId)
        .in('pair_id', pairIds);

      if (membersError) return NextResponse.json({ pairs: [], error: membersError.message }, { status: 200 });

      members = (membersData || []).map((row: any) => ({
        pair_id: row.pair_id,
        player_id: row.player_id,
        first_name: row?.profiles?.first_name || null,
        last_name: row?.profiles?.last_name || null,
        category: row?.profiles?.category || null,
      }));
    }

    const byPair = new Map<string, any[]>();
    members.forEach((m) => {
      const list = byPair.get(String(m.pair_id)) || [];
      list.push({
        id: String(m.player_id),
        first_name: m.first_name,
        last_name: m.last_name,
        category: m.category,
      });
      byPair.set(String(m.pair_id), list);
    });

    const response = pairs.map((pair) => ({
      id: pair.id,
      association_id: pair.association_id,
      name: pair.name,
      members: byPair.get(String(pair.id)) || [],
    }));

    return NextResponse.json({ pairs: response }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ pairs: [], error: e?.message || 'Server error' }, { status: 200 });
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
    const playerIds = normalizePlayerIds(body?.player_ids);

    if (!associationId) return NextResponse.json({ ok: false, error: 'Missing association_id' }, { status: 400 });
    if (!name) return NextResponse.json({ ok: false, error: 'Missing name' }, { status: 400 });

    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const playersError = await validatePlayers(associationId, playerIds);
    if (playersError) return NextResponse.json({ ok: false, error: playersError }, { status: 400 });

    const { data: pairRow, error: pairError } = await supabaseAdmin
      .from('pairs')
      .insert([{ association_id: associationId, name }])
      .select('id, association_id, name')
      .single();

    if (pairError) return NextResponse.json({ ok: false, error: pairError.message }, { status: 200 });

    const pairId = String((pairRow as any)?.id || '');
    if (pairId) {
      const { error: membersError } = await supabaseAdmin
        .from('pair_members')
        .insert(playerIds.map((playerId) => ({
          association_id: associationId,
          pair_id: pairId,
          player_id: playerId,
        })));

      if (membersError) return NextResponse.json({ ok: false, error: membersError.message }, { status: 200 });
    }

    return NextResponse.json({ ok: true, pair: pairRow }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Not authed' }, { status: 401 });

    const { profile, isAdmin, role, associationAdminId } = await getAdminProfile(user.id);
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const pairId = String(body?.pair_id || '').trim();
    const name = String(body?.name || '').trim();
    const playerIds = normalizePlayerIds(body?.player_ids);

    if (!pairId) return NextResponse.json({ ok: false, error: 'Missing pair_id' }, { status: 400 });
    if (!name) return NextResponse.json({ ok: false, error: 'Missing name' }, { status: 400 });

    const { data: pairRow, error: pairError } = await supabaseAdmin
      .from('pairs')
      .select('id, association_id')
      .eq('id', pairId)
      .single();

    if (pairError || !pairRow) return NextResponse.json({ ok: false, error: 'Pair not found' }, { status: 404 });

    const associationId = String((pairRow as any).association_id || '');
    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const playersError = await validatePlayers(associationId, playerIds);
    if (playersError) return NextResponse.json({ ok: false, error: playersError }, { status: 400 });

    const { error: updateError } = await supabaseAdmin
      .from('pairs')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', pairId);

    if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 200 });

    const { error: deleteError } = await supabaseAdmin
      .from('pair_members')
      .delete()
      .eq('pair_id', pairId);

    if (deleteError) return NextResponse.json({ ok: false, error: deleteError.message }, { status: 200 });

    const { error: insertError } = await supabaseAdmin
      .from('pair_members')
      .insert(playerIds.map((playerId) => ({
        association_id: associationId,
        pair_id: pairId,
        player_id: playerId,
      })));

    if (insertError) return NextResponse.json({ ok: false, error: insertError.message }, { status: 200 });

    return NextResponse.json({ ok: true }, { status: 200 });
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
    const pairId = String(body?.pair_id || '').trim();
    if (!pairId) return NextResponse.json({ ok: false, error: 'Missing pair_id' }, { status: 400 });

    const { data: pairRow, error: pairError } = await supabaseAdmin
      .from('pairs')
      .select('id, association_id')
      .eq('id', pairId)
      .single();

    if (pairError || !pairRow) return NextResponse.json({ ok: false, error: 'Pair not found' }, { status: 404 });

    const associationId = String((pairRow as any).association_id || '');
    if (role !== 'creador') {
      const allowed = allowedAssociationIdsFor(profile, associationAdminId);
      if (allowed.length > 0 && !allowed.includes(associationId)) {
        return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from('pairs')
      .delete()
      .eq('id', pairId);

    if (deleteError) return NextResponse.json({ ok: false, error: deleteError.message }, { status: 200 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}
