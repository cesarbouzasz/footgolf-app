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

async function getStaffScope(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, role, is_admin, association_id, default_association_id')
    .eq('id', userId)
    .maybeSingle();

  if (!profile || !isStaffRole((profile as any).role, (profile as any).is_admin)) return null;

  const role = String((profile as any).role || '').trim().toLowerCase();
  const associationId = (profile as any).default_association_id || (profile as any).association_id || null;
  return { role, associationId };
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ notifications: [] }, { status: 200 });

    const scope = await getStaffScope(user.id);
    if (!scope) return NextResponse.json({ notifications: [] }, { status: 200 });

    const url = new URL(req.url);
    const limitRaw = url.searchParams.get('limit');
    const limit = Math.min(100, Math.max(10, Number(limitRaw || 50)));

    let query = supabaseAdmin
      .from('tournament_notifications')
      .select('id, event_id, message, audience, is_active, created_by, created_at, events(name, event_date, association_id)')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Non-creador: scope by their association through events.association_id (when available)
    if (scope.role !== 'creador' && scope.associationId) {
      query = query.eq('events.association_id', scope.associationId);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ notifications: [], error: error.message }, { status: 200 });

    const notifications = ((data as any[]) || []).map((row) => ({
      id: String(row.id),
      event_id: String(row.event_id),
      event_name: String(row?.events?.name || ''),
      event_date: row?.events?.event_date ? String(row.events.event_date) : null,
      message: String(row.message || ''),
      audience: String(row.audience || 'all'),
      is_active: row.is_active === true,
      created_at: String(row.created_at),
    }));

    return NextResponse.json({ notifications }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ notifications: [], error: e?.message || 'Server error' }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scope = await getStaffScope(user.id);
    if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => null);
    const eventId = String(body?.event_id || '').trim();
    const message = String(body?.message || '').trim();
    const audience = String(body?.audience || 'all').trim().toLowerCase();
    const playerIds = Array.isArray(body?.player_ids)
      ? (body.player_ids as any[]).map((x) => String(x || '').trim()).filter(Boolean)
      : [];

    if (!eventId) return NextResponse.json({ error: 'Missing event_id' }, { status: 400 });
    if (!message) return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    if (audience !== 'all' && audience !== 'selected') return NextResponse.json({ error: 'Invalid audience' }, { status: 400 });
    if (audience === 'selected' && playerIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one player' }, { status: 400 });
    }

    // Validate event exists and staff can act on it
    const { data: eventRow, error: eventErr } = await supabaseAdmin
      .from('events')
      .select('id, association_id')
      .eq('id', eventId)
      .maybeSingle();

    if (eventErr || !eventRow?.id) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

    const eventAssociationId = (eventRow as any)?.association_id ? String((eventRow as any).association_id) : null;
    if (scope.role !== 'creador' && scope.associationId && eventAssociationId && eventAssociationId !== scope.associationId) {
      return NextResponse.json({ error: 'Not allowed for this event' }, { status: 403 });
    }

    const insertRes = await supabaseAdmin
      .from('tournament_notifications')
      .insert({
        event_id: eventId,
        message,
        audience,
        is_active: true,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (insertRes.error || !insertRes.data?.id) {
      return NextResponse.json({ error: insertRes.error?.message || 'Insert failed' }, { status: 400 });
    }

    const notificationId = String(insertRes.data.id);

    if (audience === 'selected') {
      const rows = playerIds.map((pid) => ({ notification_id: notificationId, player_id: pid }));
      const recRes = await supabaseAdmin.from('tournament_notification_recipients').insert(rows);
      if (recRes.error) {
        return NextResponse.json({ error: recRes.error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true, id: notificationId }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
