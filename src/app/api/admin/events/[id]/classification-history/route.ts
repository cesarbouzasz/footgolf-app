import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
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
    .select('id, role')
    .eq('id', userId)
    .single();

  const roleRaw = (profile as any)?.role;
  const role = typeof roleRaw === 'string' ? roleRaw.trim().toLowerCase() : '';
  let isAdmin = role === 'admin' || role === 'creador';

  if (!isAdmin) {
    const { data: assocRow, error: assocError } = await supabaseAdmin
      .from('associations')
      .select('id')
      .eq('admin_id', userId)
      .limit(1)
      .maybeSingle();

    if (!assocError && assocRow?.id) {
      isAdmin = true;
    }
  }

  return { profile: profile as any, isAdmin, role };
}

function uniq(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

function formatActorName(row: any) {
  const fn = typeof row?.first_name === 'string' ? row.first_name.trim() : '';
  const ln = typeof row?.last_name === 'string' ? row.last_name.trim() : '';
  const name = `${fn} ${ln}`.trim();
  return name || null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Not authed' }, { status: 401 });

    const { id } = await ctx.params;
    const eventId = String(id || '').trim();
    if (!eventId) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });

    const { isAdmin } = await getAdminProfile(user.id);
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const { data: rows, error } = await supabaseAdmin
      .from('event_classification_audit')
      .select('id, event_id, actor_user_id, created_at, action, locked, final_classification_snapshot')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    }

    const actorIds = uniq(((rows as any[]) || []).map((r) => String(r?.actor_user_id || '')).filter(Boolean));
    let actorMap = new Map<string, { name: string | null }>();
    if (actorIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', actorIds);

      ((profiles as any[]) || []).forEach((p) => {
        actorMap.set(String(p.id), { name: formatActorName(p) });
      });
    }

    const data = ((rows as any[]) || []).map((r) => {
      const actorId = r?.actor_user_id ? String(r.actor_user_id) : null;
      return {
        ...r,
        actor: actorId ? { id: actorId, name: actorMap.get(actorId)?.name || null } : null,
      };
    });

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}
