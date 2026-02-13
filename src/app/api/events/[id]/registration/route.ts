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

function uniq(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

function parseMaxPlayers(config: any): number | null {
  const raw = config?.maxPlayers;
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isBetween(value: Date, start?: Date | null, end?: Date | null) {
  if (!start || !end) return false;
  return value >= start && value <= end;
}

function toDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

async function safeAdminMessage(params: {
  associationId: string | null;
  createdBy: string;
  createdByEmail: string | null;
  message: string;
}) {
  try {
    const { error } = await supabaseAdmin.from('admin_messages').insert({
      association_id: params.associationId,
      created_by: params.createdBy,
      created_by_email: params.createdByEmail,
      message: params.message,
      is_read: false,
      created_at: new Date().toISOString(),
    });

    if (error) {
      const msg = (error as any)?.message || '';
      if (/relation\s+"admin_messages"\s+does\s+not\s+exist/i.test(msg)) return;
    }
  } catch {
    // ignore
  }
}

async function safePlayerNotification(params: {
  eventId: string;
  playerId: string;
  message: string;
}) {
  try {
    const insertRes = await supabaseAdmin
      .from('tournament_notifications')
      .insert({
        event_id: params.eventId,
        message: params.message,
        audience: 'selected',
        is_active: true,
        created_by: null,
      })
      .select('id')
      .single();

    if (insertRes.error || !insertRes.data?.id) return;

    await supabaseAdmin.from('tournament_notification_recipients').insert({
      notification_id: String(insertRes.data.id),
      player_id: params.playerId,
    });
  } catch {
    // ignore
  }
}

async function upsertEventRegistration(eventId: string, userId: string, category: string | null) {
  try {
    await supabaseAdmin
      .from('event_registrations')
      .upsert(
        {
          event_id: eventId,
          user_id: userId,
          category: category || null,
        },
        { onConflict: 'event_id,user_id' }
      );
  } catch {
    // ignore
  }
}

async function deleteEventRegistration(eventId: string, userId: string) {
  try {
    await supabaseAdmin.from('event_registrations').delete().eq('event_id', eventId).eq('user_id', userId);
  } catch {
    // ignore
  }
}

async function getEventById(eventId: string) {
  const { data, error } = await supabaseAdmin
    .from('events')
    .select('id, name, association_id, registration_start, registration_end, config, registered_player_ids')
    .eq('id', eventId)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data as any;
}

async function getProfileName(userId: string): Promise<string> {
  try {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', userId)
      .maybeSingle();

    const first = String((data as any)?.first_name || '').trim();
    const last = String((data as any)?.last_name || '').trim();
    const full = [first, last].filter(Boolean).join(' ').trim();
    return full || 'Jugador';
  } catch {
    return 'Jugador';
  }
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

    const body = await req.json().catch(() => null);
    const category = typeof body?.category === 'string' ? body.category.trim() : '';
    const categoryValue = category ? category : null;

    const eventRow = await getEventById(eventId);
    if (!eventRow) return NextResponse.json({ ok: false, error: 'Event not found' }, { status: 404 });

    const now = new Date();
    const regStart = toDate(eventRow.registration_start);
    const regEnd = toDate(eventRow.registration_end);
    if (regStart && regEnd && !isBetween(now, regStart, regEnd)) {
      return NextResponse.json({ ok: false, error: 'Inscripción cerrada.' }, { status: 403 });
    }

    const currentConfig = eventRow.config || {};
    const currentRegistered = normalizeIdArray(eventRow.registered_player_ids);
    const currentWaitlist = normalizeIdArray(currentConfig?.waitlist_player_ids);

    const alreadyRegistered = currentRegistered.includes(user.id);
    const alreadyWaitlist = currentWaitlist.includes(user.id);

    if (alreadyRegistered || alreadyWaitlist) {
      return NextResponse.json(
        {
          ok: true,
          status: alreadyRegistered ? 'registered' : 'waitlist',
          message: alreadyRegistered ? 'Ya estás inscrito.' : 'Ya estás en lista de espera.',
          registered_player_ids: currentRegistered,
          waitlist_player_ids: currentWaitlist,
        },
        { status: 200 }
      );
    }

    const maxPlayers = parseMaxPlayers(currentConfig);
    const isFull = typeof maxPlayers === 'number' && maxPlayers > 0 && currentRegistered.length >= maxPlayers;

    const nextRegistered = isFull ? currentRegistered : uniq([...currentRegistered, user.id]);
    const nextWaitlist = isFull ? uniq([...currentWaitlist, user.id]) : currentWaitlist;
    const nextConfig = { ...currentConfig, waitlist_player_ids: nextWaitlist };

    const updateRes = await supabaseAdmin
      .from('events')
      .update({ registered_player_ids: nextRegistered, config: nextConfig })
      .eq('id', eventId)
      .select('registered_player_ids, config')
      .single();

    if (updateRes.error) return NextResponse.json({ ok: false, error: updateRes.error.message }, { status: 400 });

    await upsertEventRegistration(eventId, user.id, categoryValue);

    const associationId = eventRow.association_id ? String(eventRow.association_id) : null;
    const userName = await getProfileName(user.id);

    if (isFull) {
      void safeAdminMessage({
        associationId,
        createdBy: user.id,
        createdByEmail: user.email || null,
        message: `${userName} entró en lista de espera en "${String(eventRow.name || 'Evento')}".`,
      });
      void safePlayerNotification({
        eventId,
        playerId: user.id,
        message: `Cupo completo. Estás en lista de espera para "${String(eventRow.name || 'Evento')}".`,
      });
    } else {
      void safeAdminMessage({
        associationId,
        createdBy: user.id,
        createdByEmail: user.email || null,
        message: `${userName} se inscribió en "${String(eventRow.name || 'Evento')}".`,
      });
      void safePlayerNotification({
        eventId,
        playerId: user.id,
        message: `Inscripción confirmada en "${String(eventRow.name || 'Evento')}".`,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        status: isFull ? 'waitlist' : 'registered',
        message: isFull
          ? 'Cupo completo. Estás en lista de espera y te avisaremos si se libera plaza.'
          : 'Inscripción completada correctamente.',
        registered_player_ids: normalizeIdArray((updateRes.data as any)?.registered_player_ids),
        waitlist_player_ids: normalizeIdArray(((updateRes.data as any)?.config || {})?.waitlist_player_ids),
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const { id } = await ctx.params;
    const eventId = String(id || '').trim();
    if (!eventId) return NextResponse.json({ ok: false, error: 'Missing event id' }, { status: 400 });

    const body = await req.json().catch(() => null);
    const targetUserIdRaw = typeof body?.user_id === 'string' ? body.user_id : typeof body?.target_user_id === 'string' ? body.target_user_id : null;
    const targetUserId = String(targetUserIdRaw || '').trim();
    const actingAsAdmin = targetUserId && targetUserId !== user.id;

    if (actingAsAdmin) {
      const allowed = await isAdminUser(user.id);
      if (!allowed) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const effectiveUserId = actingAsAdmin ? targetUserId : user.id;

    const eventRow = await getEventById(eventId);
    if (!eventRow) return NextResponse.json({ ok: false, error: 'Event not found' }, { status: 404 });

    const currentConfig = eventRow.config || {};
    const currentRegistered = normalizeIdArray(eventRow.registered_player_ids);
    const currentWaitlist = normalizeIdArray(currentConfig?.waitlist_player_ids);

    const wasRegistered = currentRegistered.includes(effectiveUserId);
    const wasWaitlist = currentWaitlist.includes(effectiveUserId);

    if (!wasRegistered && !wasWaitlist) {
      return NextResponse.json(
        {
          ok: true,
          status: 'noop',
          message: 'No estabas inscrito.',
          registered_player_ids: currentRegistered,
          waitlist_player_ids: currentWaitlist,
        },
        { status: 200 }
      );
    }

    const maxPlayers = parseMaxPlayers(currentConfig);

    let nextRegistered = currentRegistered;
    let nextWaitlist = currentWaitlist;
    let promotedPlayerId: string | null = null;

    if (wasWaitlist) {
      nextWaitlist = currentWaitlist.filter((id) => id !== effectiveUserId);
    } else {
      nextRegistered = currentRegistered.filter((id) => id !== effectiveUserId);

      if (typeof maxPlayers === 'number' && maxPlayers > 0) {
        const hasCapacity = nextRegistered.length < maxPlayers;
        const promoteId = hasCapacity ? (nextWaitlist[0] || null) : null;
        if (promoteId) {
          promotedPlayerId = promoteId;
          nextRegistered = uniq([...nextRegistered, promoteId]);
          nextWaitlist = nextWaitlist.filter((id) => id !== promoteId);
        }
      }
    }

    const nextConfig = { ...currentConfig, waitlist_player_ids: nextWaitlist };

    const updateRes = await supabaseAdmin
      .from('events')
      .update({ registered_player_ids: nextRegistered, config: nextConfig })
      .eq('id', eventId)
      .select('registered_player_ids, config')
      .single();

    if (updateRes.error) return NextResponse.json({ ok: false, error: updateRes.error.message }, { status: 400 });

    await deleteEventRegistration(eventId, effectiveUserId);

    const associationId = eventRow.association_id ? String(eventRow.association_id) : null;
    const removedName = await getProfileName(effectiveUserId);
    const actorName = actingAsAdmin ? await getProfileName(user.id) : removedName;

    void safeAdminMessage({
      associationId,
      createdBy: user.id,
      createdByEmail: user.email || null,
      message: actingAsAdmin
        ? `${actorName} retiró a ${removedName} de ${wasWaitlist ? 'lista de espera' : 'inscripción'} en "${String(eventRow.name || 'Evento')}".`
        : `${removedName} canceló su ${wasWaitlist ? 'lista de espera' : 'inscripción'} en "${String(eventRow.name || 'Evento')}".`,
    });

    void safePlayerNotification({
      eventId,
      playerId: effectiveUserId,
      message: actingAsAdmin
        ? `Un administrador te retiró de ${wasWaitlist ? 'la lista de espera' : 'la inscripción'} en "${String(eventRow.name || 'Evento')}".`
        : `Has cancelado tu ${wasWaitlist ? 'lista de espera' : 'inscripción'} en "${String(eventRow.name || 'Evento')}".`,
    });

    if (promotedPlayerId) {
      const promotedName = await getProfileName(promotedPlayerId);
      void safeAdminMessage({
        associationId,
        createdBy: user.id,
        createdByEmail: user.email || null,
        message: `Se liberó una plaza y se promovió a ${promotedName} desde la lista de espera en "${String(eventRow.name || 'Evento')}".`,
      });

      await upsertEventRegistration(eventId, promotedPlayerId, null);
      void safePlayerNotification({
        eventId,
        playerId: promotedPlayerId,
        message: `¡Hay plaza! Pasas de lista de espera a inscrito en "${String(eventRow.name || 'Evento')}".`,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        status: wasWaitlist ? 'left_waitlist' : 'unregistered',
        message: actingAsAdmin
          ? removedName
            ? `Jugador retirado: ${removedName}.`
            : 'Jugador retirado.'
          : wasWaitlist
            ? 'Salida de lista de espera.'
            : 'Inscripción cancelada.',
        promoted_player_id: promotedPlayerId,
        registered_player_ids: normalizeIdArray((updateRes.data as any)?.registered_player_ids),
        waitlist_player_ids: normalizeIdArray(((updateRes.data as any)?.config || {})?.waitlist_player_ids),
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}
