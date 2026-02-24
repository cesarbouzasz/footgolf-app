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

function normalizeIdArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x || '')).map((x) => x.trim()).filter(Boolean);
}

async function isAdminUser(userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    const role = typeof (data as any)?.role === 'string' ? String((data as any).role).trim().toLowerCase() : '';
    return role === 'admin' || role === 'creador';
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;
    const eventId = String(id || '').trim();
    if (!eventId) return NextResponse.json({ ok: false, error: 'Missing event id' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const targetUserIdRaw = typeof body?.target_user_id === 'string' ? body.target_user_id.trim() : '';

    const admin = await isAdminUser(user.id);
    const targetUserId = targetUserIdRaw && admin ? targetUserIdRaw : user.id;

    const { data: eventRow, error } = await supabaseAdmin
      .from('events')
      .select('id, name, config, registered_player_ids')
      .eq('id', eventId)
      .maybeSingle();

    if (error || !eventRow?.id) {
      return NextResponse.json({ ok: false, error: 'Event not found' }, { status: 404 });
    }

    const config = (eventRow as any)?.config || {};
    const stableford = (config as any)?.stableford || {};
    const mode = String(stableford?.mode || '').trim().toLowerCase();
    if (mode !== 'weekly' && mode !== 'best_card') {
      return NextResponse.json({ ok: false, error: 'Attempts only apply to weekly/best card' }, { status: 400 });
    }

    const registeredIds = normalizeIdArray((eventRow as any)?.registered_player_ids);
    if (!registeredIds.includes(targetUserId)) {
      return NextResponse.json({ ok: false, error: 'Player not registered' }, { status: 403 });
    }

    const flights = Array.isArray(config?.flights) ? config.flights : [];
    const hasActiveFlights = flights.some((f: any) => !!f?.active);
    if (hasActiveFlights && !admin) {
      const inActiveFlight = flights.some((f: any) => {
        if (!f?.active) return false;
        const players = Array.isArray(f?.playerIds) ? f.playerIds.map((x: any) => String(x || '').trim()) : [];
        return players.includes(targetUserId);
      });
      if (!inActiveFlight) {
        return NextResponse.json({ ok: false, error: 'Player not in an active flight' }, { status: 403 });
      }
    }

    const attemptsByUser = stableford?.attemptsByUser && typeof stableford.attemptsByUser === 'object'
      ? stableford.attemptsByUser
      : {};
    const used = Number(attemptsByUser[targetUserId] || 0);

    let maxAttempts: number | null = null;
    if (mode === 'weekly') {
      const weekly = stableford?.weekly || {};
      const base = Number(weekly?.maxAttempts);
      const extraRaw = weekly?.extraAttemptsByUser?.[targetUserId];
      const extra = Number(extraRaw || 0);
      const baseSafe = Number.isFinite(base) && base > 0 ? base : 1;
      maxAttempts = baseSafe + (Number.isFinite(extra) && extra > 0 ? extra : 0);
    } else if (mode === 'best_card') {
      const raw = Number(stableford?.bestCardMaxAttempts);
      if (Number.isFinite(raw) && raw > 0) maxAttempts = raw;
    }

    if (maxAttempts != null && used >= maxAttempts) {
      return NextResponse.json({ ok: false, error: 'No attempts remaining' }, { status: 403 });
    }

    const nextUsed = used + 1;
    const nextAttemptsByUser = { ...attemptsByUser, [targetUserId]: nextUsed };

    const nextStableford = {
      ...stableford,
      attemptsByUser: nextAttemptsByUser,
    };

    const nextConfig = {
      ...config,
      stableford: nextStableford,
    };

    const { error: updateError } = await supabaseAdmin
      .from('events')
      .update({ config: nextConfig })
      .eq('id', eventId);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 200 });
    }

    const remaining = maxAttempts != null ? Math.max(maxAttempts - nextUsed, 0) : null;
    return NextResponse.json({
      ok: true,
      used: nextUsed,
      remaining,
      maxAttempts,
    }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}
