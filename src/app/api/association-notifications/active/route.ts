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

async function getAssociationId(userId: string) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('default_association_id, association_id')
    .eq('id', userId)
    .maybeSingle();

  const assoc = (data as any)?.default_association_id || (data as any)?.association_id || null;
  return assoc ? String(assoc) : null;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ notifications: [] }, { status: 200 });

    const associationId = await getAssociationId(user.id);
    if (!associationId) {
      // Only show global notifications when association is missing.
      const { data: dismissedRows } = await supabaseAdmin
        .from('association_notification_dismissals')
        .select('notification_id')
        .eq('player_id', user.id)
        .limit(500);

      const dismissed = new Set(((dismissedRows as any[]) || []).map((r) => String(r.notification_id || '')).filter(Boolean));

      const { data: notifRows } = await supabaseAdmin
        .from('association_notifications')
        .select('id, association_id, message, created_at')
        .is('association_id', null)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(10);

      const rows = ((notifRows as any[]) || [])
        .map((r) => ({
          id: String(r.id),
          association_id: r.association_id ? String(r.association_id) : null,
          message: String(r.message || ''),
          created_at: String(r.created_at),
        }))
        .filter((r) => !!r.id && !dismissed.has(r.id));

      return NextResponse.json({ notifications: rows.slice(0, 5) }, { status: 200 });
    }

    const { data: dismissedRows } = await supabaseAdmin
      .from('association_notification_dismissals')
      .select('notification_id')
      .eq('player_id', user.id)
      .limit(500);

    const dismissed = new Set(((dismissedRows as any[]) || []).map((r) => String(r.notification_id || '')).filter(Boolean));

    const { data: notifRows } = await supabaseAdmin
      .from('association_notifications')
      .select('id, association_id, message, created_at')
      .eq('is_active', true)
      .in('association_id', [associationId, null])
      .order('created_at', { ascending: false })
      .limit(10);

    const rows = ((notifRows as any[]) || [])
      .map((r) => ({
        id: String(r.id),
        association_id: r.association_id ? String(r.association_id) : null,
        message: String(r.message || ''),
        created_at: String(r.created_at),
      }))
      .filter((r) => !!r.id && !dismissed.has(r.id));

    return NextResponse.json({ notifications: rows.slice(0, 5) }, { status: 200 });
  } catch {
    return NextResponse.json({ notifications: [] }, { status: 200 });
  }
}
