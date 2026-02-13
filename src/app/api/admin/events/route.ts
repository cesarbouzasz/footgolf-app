import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isIsoDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeMode(value: unknown) {
  const s = typeof value === 'string' ? value.trim() : '';
  return s ? s.toLowerCase() : null;
}

function isUuid(value: unknown) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
  );
}

function validateMatchPlayConfig(config: any) {
  if (!isPlainObject(config)) return 'Config inválida (debe ser objeto).';

  const format = String(config.matchPlayFormat || 'classic').trim().toLowerCase();
  if (format === 'groups') {
    const holes = config.groupHoles;
    if (!Number.isInteger(holes) || !Number.isFinite(holes) || holes < 1 || holes > 36) {
      return 'Config MP inválida: groupHoles debe ser entero (1..36).';
    }

    const matchesPerDay = config.groupMatchesPerDay;
    if (matchesPerDay != null) {
      if (!Number.isInteger(matchesPerDay) || !Number.isFinite(matchesPerDay) || matchesPerDay < 1) {
        return 'Config MP inválida: groupMatchesPerDay debe ser entero (>0).';
      }
    }

    const groupDates = config.groupDates;
    if (Array.isArray(groupDates)) {
      const datesOk = groupDates.every((d: any) => typeof d === 'string' && isIsoDate(d));
      if (!datesOk) return 'Config MP inválida: groupDates debe ser array YYYY-MM-DD.';
    }

    const groupMode = String(config.groupMode || 'single').trim().toLowerCase();
    if (groupMode === 'multi') {
      const groupCount = config.groupCount;
      const advanceCount = config.groupAdvanceCount;
      if (!Number.isInteger(groupCount) || !Number.isFinite(groupCount) || groupCount < 2) {
        return 'Config MP inválida: groupCount debe ser entero (>=2).';
      }
      if (!Number.isInteger(advanceCount) || !Number.isFinite(advanceCount) || advanceCount < 1 || advanceCount > groupCount) {
        return 'Config MP inválida: groupAdvanceCount debe ser entero (1..groupCount).';
      }
    }
  } else {
    const holesPerRound = config.holesPerRound;
    if (!Array.isArray(holesPerRound) || holesPerRound.length === 0) {
      return 'Config MP inválida: holesPerRound es obligatoria.';
    }
    const holesOk = holesPerRound.every(
      (n: any) => Number.isInteger(n) && Number.isFinite(n) && n > 0 && n <= 36
    );
    if (!holesOk) return 'Config MP inválida: holesPerRound debe ser array de enteros (1..36).';

    const hasConsolation = !!config.hasConsolation;
    if (hasConsolation) {
      const consolation = config.consolationHolesPerRound;
      if (!Array.isArray(consolation) || consolation.length === 0) {
        return 'Config MP inválida: consolationHolesPerRound es obligatoria si hay consolación.';
      }
      const consolationOk = consolation.every(
        (n: any) => Number.isInteger(n) && Number.isFinite(n) && n > 0 && n <= 36
      );
      if (!consolationOk) {
        return 'Config MP inválida: consolationHolesPerRound debe ser array de enteros (1..36).';
      }
    }
  }

  const maxPlayers = config.maxPlayers;
  if (maxPlayers != null) {
    if (!Number.isInteger(maxPlayers) || !Number.isFinite(maxPlayers) || maxPlayers < 2 || maxPlayers > 256) {
      return 'Config inválida: maxPlayers debe ser entero (2..256).';
    }
  }

  const hasSeeds = !!config.hasSeeds;
  if (hasSeeds) {
    const seedCount = config.seedCount;
    const allowed = [2, 4, 8, 16, 32, 64];
    if (!Number.isInteger(seedCount) || !allowed.includes(seedCount)) {
      return 'Config MP inválida: seedCount debe ser 2/4/8/16/32/64.';
    }
    if (typeof maxPlayers === 'number' && seedCount > maxPlayers) {
      return 'Config MP inválida: seedCount no puede exceder maxPlayers.';
    }
  }

  return null;
}

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

  return { profile: profile as any, profileError: profileError?.message || null, isAdmin, role, associationAdminId };
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Not authed' }, { status: 401 });

    const { profile, isAdmin, role, associationAdminId } = await getAdminProfile(user.id);
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || '').trim();
    if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });

    // Safety: if not 'creador', try to ensure it belongs to the admin association via course.
    if (role !== 'creador') {
      const { data: eventRow } = await supabaseAdmin
        .from('events')
        .select('id, course_id, created_by')
        .eq('id', id)
        .single();

      if (!eventRow) {
        return NextResponse.json({ ok: false, error: 'Event not found' }, { status: 404 });
      }

      const allowedAssociationIds = [
        profile?.default_association_id || null,
        profile?.association_id || null,
        associationAdminId || null,
      ].filter(Boolean) as string[];

      const createdBy = (eventRow as any)?.created_by || null;
      const courseId = (eventRow as any)?.course_id || null;

      let allowed = createdBy === user.id;
      if (!allowed && courseId && allowedAssociationIds.length > 0) {
        const { data: courseRow } = await supabaseAdmin
          .from('courses')
          .select('id, association_id')
          .eq('id', courseId)
          .single();

        const courseAssociationId = (courseRow as any)?.association_id || null;
        if (courseAssociationId && allowedAssociationIds.includes(courseAssociationId)) {
          allowed = true;
        }
      }

      if (!allowed) {
        return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const { error } = await supabaseAdmin.from('events').delete().eq('id', id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Not authed' }, { status: 401 });

    const { profile, isAdmin, role, associationAdminId } = await getAdminProfile(user.id);
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const associationIdRaw = typeof body?.association_id === 'string' ? body.association_id.trim() : '';
    if (!isUuid(associationIdRaw)) {
      return NextResponse.json({ ok: false, error: 'Missing/invalid association_id' }, { status: 200 });
    }

    const allowedAssociationIds = [
      profile?.default_association_id || null,
      profile?.association_id || null,
      associationAdminId || null,
    ].filter(Boolean) as string[];

    if (role !== 'creador' && allowedAssociationIds.length > 0 && !allowedAssociationIds.includes(associationIdRaw)) {
      return NextResponse.json({ ok: false, error: 'Not allowed for this association' }, { status: 403 });
    }

    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ ok: false, error: 'Missing name' }, { status: 200 });

    const eventDate = body?.event_date;
    if (eventDate != null && !isIsoDate(eventDate)) {
      return NextResponse.json({ ok: false, error: 'Invalid event_date (YYYY-MM-DD)' }, { status: 200 });
    }

    const registrationStart = body?.registration_start;
    if (registrationStart != null && registrationStart !== '' && !isIsoDate(registrationStart)) {
      return NextResponse.json({ ok: false, error: 'Invalid registration_start (YYYY-MM-DD)' }, { status: 200 });
    }
    const registrationEnd = body?.registration_end;
    if (registrationEnd != null && registrationEnd !== '' && !isIsoDate(registrationEnd)) {
      return NextResponse.json({ ok: false, error: 'Invalid registration_end (YYYY-MM-DD)' }, { status: 200 });
    }

    const competitionMode = normalizeMode(body?.competition_mode);
    const config = isPlainObject(body?.config) ? body.config : {};

    const maxPlayers = (config as any)?.maxPlayers;
    if (maxPlayers != null) {
      if (!Number.isInteger(maxPlayers) || !Number.isFinite(maxPlayers) || maxPlayers < 2 || maxPlayers > 256) {
        return NextResponse.json({ ok: false, error: 'Config inválida: maxPlayers debe ser entero (2..256).' }, { status: 200 });
      }
    }
    const isMatchPlay = !!competitionMode && (competitionMode.includes('match') || competitionMode.includes('mp'));
    if (isMatchPlay) {
      const validationError = validateMatchPlayConfig(config);
      if (validationError) return NextResponse.json({ ok: false, error: validationError }, { status: 200 });

      // Normalize canonical fields per spec
      config.competitionMode = 'match-play';
      config.scoringSystem = 'match-play';
      config.hasConsolation = !!config.hasConsolation;
    }

    const courseIdRaw = typeof body?.course_id === 'string' ? body.course_id.trim() : '';
    if (courseIdRaw && !isUuid(courseIdRaw)) {
      return NextResponse.json({ ok: false, error: 'Invalid course_id' }, { status: 200 });
    }

    if (courseIdRaw) {
      const { data: courseRow, error: courseError } = await supabaseAdmin
        .from('courses')
        .select('id, association_id')
        .eq('id', courseIdRaw)
        .single();

      if (courseError || !courseRow) {
        return NextResponse.json({ ok: false, error: 'Course not found' }, { status: 200 });
      }
      const courseAssociationId = (courseRow as any)?.association_id || null;
      if (courseAssociationId && String(courseAssociationId) !== associationIdRaw) {
        return NextResponse.json({ ok: false, error: 'Course does not belong to association' }, { status: 200 });
      }
    }

    const insertRow: any = {
      association_id: associationIdRaw,
      course_id: courseIdRaw || null,
      name,
      status: typeof body?.status === 'string' && body.status.trim() ? body.status.trim() : null,
      competition_mode: competitionMode,
      registration_start: registrationStart ? String(registrationStart) : null,
      registration_end: registrationEnd ? String(registrationEnd) : null,
      event_date: eventDate ? String(eventDate) : null,
      location: typeof body?.location === 'string' && body.location.trim() ? body.location.trim() : null,
      description: typeof body?.description === 'string' && body.description.trim() ? body.description.trim() : null,
      config,
      has_handicap_ranking: !!body?.has_handicap_ranking,
      created_by: user.id,
    };

    const { data, error } = await supabaseAdmin
      .from('events')
      .insert(insertRow)
      .select('id')
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    return NextResponse.json({ ok: true, id: (data as any)?.id || null }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}
