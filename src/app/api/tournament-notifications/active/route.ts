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
    if (!user) return NextResponse.json({ notifications: [] }, { status: 200 });

    // Only show to players registered in some event
    const { data: regs, error: regErr } = await supabaseAdmin
      .from('event_registrations')
      .select('event_id')
      .eq('user_id', user.id)
      .limit(200);

    if (regErr) return NextResponse.json({ notifications: [] }, { status: 200 });

    const eventIds = Array.from(new Set(((regs as any[]) || []).map((r) => String(r.event_id || '')).filter(Boolean)));
    if (eventIds.length === 0) return NextResponse.json({ notifications: [] }, { status: 200 });

    const { data: dismissedRows } = await supabaseAdmin
      .from('tournament_notification_dismissals')
      .select('notification_id')
      .eq('player_id', user.id)
      .limit(500);

    const dismissed = new Set(((dismissedRows as any[]) || []).map((r) => String(r.notification_id || '')).filter(Boolean));

    const { data: notifRows, error: notifErr } = await supabaseAdmin
      .from('tournament_notifications')
      .select('id, event_id, message, audience, created_at, events(name, event_date)')
      .eq('is_active', true)
      .in('event_id', eventIds)
      .order('created_at', { ascending: false })
      .limit(25);

    if (notifErr) return NextResponse.json({ notifications: [] }, { status: 200 });

    const rows = ((notifRows as any[]) || [])
      .map((r) => ({
        id: String(r.id),
        event_id: String(r.event_id),
        event_name: String(r?.events?.name || ''),
        event_date: r?.events?.event_date ? String(r.events.event_date) : null,
        message: String(r.message || ''),
        audience: String(r.audience || 'all'),
        created_at: String(r.created_at),
      }))
      .filter((r) => !!r.id && !dismissed.has(r.id));

    const selectedNotifs = rows.filter((r) => r.audience === 'selected');
    const selectedIds = selectedNotifs.map((r) => r.id);

    let allowedSelected = new Set<string>();
    if (selectedIds.length > 0) {
      const { data: recs } = await supabaseAdmin
        .from('tournament_notification_recipients')
        .select('notification_id')
        .eq('player_id', user.id)
        .in('notification_id', selectedIds);

      allowedSelected = new Set(((recs as any[]) || []).map((x) => String(x.notification_id || '')).filter(Boolean));
    }

    const notifications = rows
      .filter((r) => r.audience === 'all' || allowedSelected.has(r.id))
      .slice(0, 5);

    return NextResponse.json({ notifications }, { status: 200 });
  } catch {
    return NextResponse.json({ notifications: [] }, { status: 200 });
  }
}
