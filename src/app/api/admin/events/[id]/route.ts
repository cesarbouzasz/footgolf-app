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

function normalizeIdArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x || '')).map((x) => x.trim()).filter(Boolean);
}

function normalizeFinalClassification(value: any) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((row: any) => {
      const user_id = String(row?.user_id || '').trim();
      const positionRaw = row?.position;
      const position = Number.isFinite(positionRaw) ? Number(positionRaw) : Number.parseInt(String(positionRaw || ''), 10);
      const strokesRaw = row?.strokes;
      const roundsRaw = Array.isArray(row?.rounds) ? row.rounds : [];
      const rounds = roundsRaw
        .map((v: any) => (v == null || v === '' ? null : Number(v)))
        .map((v: any) => (Number.isFinite(v) ? Number(v) : null));
      const strokes = strokesRaw == null || strokesRaw === ''
        ? (rounds.some((v: number | null) => v != null)
            ? rounds.reduce((sum: number, v: number | null) => sum + (v || 0), 0)
            : null)
        : Number(strokesRaw);
      const note = typeof row?.note === 'string' ? row.note : null;
      return {
        user_id,
        position: Number.isFinite(position) && position > 0 ? position : null,
        strokes: Number.isFinite(strokes as any) ? (strokes as number) : null,
        rounds,
        note,
      };
    })
    .filter((row: any) => row.user_id)
    .sort((a: any, b: any) => (a.position ?? 9999) - (b.position ?? 9999));
}

async function safeInsertClassificationAudit(params: {
  eventId: string;
  actorUserId: string;
  action: 'update' | 'lock' | 'unlock';
  locked: boolean;
  snapshot: any[];
}) {
  try {
    const { error } = await supabaseAdmin
      .from('event_classification_audit')
      .insert({
        event_id: params.eventId,
        actor_user_id: params.actorUserId,
        action: params.action,
        locked: params.locked,
        final_classification_snapshot: params.snapshot,
      });
    if (error) {
      // best-effort auditing; don't break saves if the audit table isn't available yet
      return;
    }
  } catch {
    // ignore
  }
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

function buildPercentPoints(first: number, decayPercent: number, count: number) {
  const points: number[] = [];
  const factor = 1 - decayPercent / 100;
  let current = first;
  for (let i = 0; i < count; i += 1) {
    points.push(Math.max(0, Math.round(current)));
    current = current * factor;
  }
  return points;
}

function buildManualPoints(table: number[], count: number) {
  const points: number[] = [];
  for (let i = 0; i < count; i += 1) {
    points.push(Number.isFinite(table[i]) ? Math.max(0, Math.round(table[i])) : 0);
  }
  return points;
}

function normalizePointsConfig(config: any): {
  mode: 'manual' | 'percent';
  first: number;
  decay: number;
  podium: number;
  table: number[];
} {
  const mode = String(config?.stableford?.classicPoints?.mode || 'percent').toLowerCase();
  const first = Number.parseInt(String(config?.stableford?.classicPoints?.first || '0'), 10);
  const decay = Number.parseFloat(String(config?.stableford?.classicPoints?.decayPercent || '0'));
  const podium = Number.parseInt(String(config?.stableford?.classicPoints?.podiumCount || '3'), 10);
  const table = Array.isArray(config?.stableford?.classicPoints?.table)
    ? (config.stableford.classicPoints.table as any[])
        .map((v) => Number.parseInt(String(v), 10))
        .filter((v) => Number.isFinite(v))
    : [];
  return {
    mode: mode === 'manual' ? 'manual' : 'percent',
    first: Number.isFinite(first) ? first : 0,
    decay: Number.isFinite(decay) ? decay : 0,
    podium: Number.isFinite(podium) ? podium : 3,
    table,
  };
}

function calculatePointsByCategory(params: {
  finalClassification: Array<{ user_id: string; position: number | null }>;
  profiles: Array<{ id: string; first_name?: string | null; last_name?: string | null; category?: string | null }>;
  pointsConfig: { mode: 'manual' | 'percent'; first: number; decay: number; podium: number; table: number[] };
}) {
  const profileMap = new Map<string, { name: string; category: string | null }>();
  params.profiles.forEach((p) => {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id;
    profileMap.set(String(p.id), { name, category: p.category || null });
  });

  const rows = params.finalClassification
    .filter((r) => !!r.user_id && Number.isFinite(r.position as number))
    .map((r) => ({ user_id: r.user_id, position: Number(r.position) }))
    .sort((a, b) => a.position - b.position);
  const buildPointsTableForCount = (count: number) => (
    params.pointsConfig.mode === 'manual'
      ? buildManualPoints(params.pointsConfig.table, count)
      : buildPercentPoints(params.pointsConfig.first, params.pointsConfig.decay, count)
  );

  const calculatePointsForRows = (list: Array<{ user_id: string; position: number }>) => {
    const pointsTable = buildPointsTableForCount(list.length);
    const grouped = new Map<number, Array<{ user_id: string; position: number }>>();
    list.forEach((r) => {
      const group = grouped.get(r.position) || [];
      group.push(r);
      grouped.set(r.position, group);
    });

    const pointsByUser = new Map<string, { position: number; points: number }>();
    const positions = Array.from(grouped.keys()).sort((a, b) => a - b);

    positions.forEach((pos) => {
      const group = grouped.get(pos) || [];
      if (group.length === 0) return;

      if (pos <= params.pointsConfig.podium || group.length === 1) {
        const points = pointsTable[pos - 1] ?? 0;
        group.forEach((r) => pointsByUser.set(r.user_id, { position: pos, points }));
        return;
      }

      const startIdx = pos - 1;
      const endIdx = startIdx + group.length - 1;
      let sum = 0;
      for (let i = startIdx; i <= endIdx; i += 1) {
        sum += pointsTable[i] ?? 0;
      }
      const avg = group.length ? Math.round(sum / group.length) : 0;
      group.forEach((r) => pointsByUser.set(r.user_id, { position: pos, points: avg }));
    });

    return pointsByUser;
  };

  const byCategory: Record<string, Array<{ user_id: string; name: string; position: number; points: number }>> = {};

  const generalPointsByUser = calculatePointsForRows(rows);
  const generalList: Array<{ user_id: string; name: string; position: number; points: number }> = [];
  rows.forEach((row) => {
    const profile = profileMap.get(row.user_id);
    const pointsRow = generalPointsByUser.get(row.user_id);
    if (!pointsRow) return;
    generalList.push({
      user_id: row.user_id,
      name: profile?.name || row.user_id,
      position: pointsRow.position,
      points: pointsRow.points,
    });
  });
  byCategory.General = generalList.sort((a, b) => b.points - a.points);

  const rowsByCategory = new Map<string, Array<{ user_id: string; position: number }>>();
  rows.forEach((row) => {
    const profile = profileMap.get(row.user_id);
    const category = profile?.category || 'Sin categoria';
    const list = rowsByCategory.get(category) || [];
    list.push(row);
    rowsByCategory.set(category, list);
  });

  rowsByCategory.forEach((list, category) => {
    const sorted = list.slice().sort((a, b) => a.position - b.position);
    const withCategoryPosition: Array<{ user_id: string; position: number }> = [];
    let nextPosition = 1;
    let idx = 0;
    while (idx < sorted.length) {
      const currentPos = sorted[idx].position;
      const group = [] as Array<{ user_id: string; position: number }>;
      while (idx < sorted.length && sorted[idx].position === currentPos) {
        group.push({ user_id: sorted[idx].user_id, position: nextPosition });
        idx += 1;
      }
      withCategoryPosition.push(...group);
      nextPosition += group.length;
    }

    const pointsByUser = calculatePointsForRows(withCategoryPosition);
    const categoryList: Array<{ user_id: string; name: string; position: number; points: number }> = [];
    withCategoryPosition.forEach((row) => {
      const profile = profileMap.get(row.user_id);
      const pointsRow = pointsByUser.get(row.user_id);
      if (!pointsRow) return;
      categoryList.push({
        user_id: row.user_id,
        name: profile?.name || row.user_id,
        position: pointsRow.position,
        points: pointsRow.points,
      });
    });

    byCategory[category] = categoryList.sort((a, b) => b.points - a.points);
  });

  return byCategory;
}

type ChampHubEventConfig = {
  eventId: string;
  kind: 'simple' | 'doble';
  pointsMode: 'manual' | 'percent';
  first: number;
  decayPercent: number;
  podiumCount: number;
  table: number[];
};

function normalizeChampionshipHub(raw: any) {
  const enabled = !!raw?.enabled;
  const categories = Array.isArray(raw?.categories)
    ? raw.categories.map((c: any) => String(c || '').trim()).filter(Boolean)
    : [];
  const events = Array.isArray(raw?.events)
    ? raw.events
        .map((row: any) => ({
          eventId: String(row?.eventId || '').trim(),
          kind: row?.kind === 'doble' ? 'doble' : 'simple',
          pointsMode: row?.pointsMode === 'manual' ? 'manual' : 'percent',
          first: Number.parseInt(String(row?.first || '0'), 10) || 0,
          decayPercent: Number.parseFloat(String(row?.decayPercent || '0')) || 0,
          podiumCount: Number.parseInt(String(row?.podiumCount || '0'), 10) || 0,
          table: Array.isArray(row?.table)
            ? row.table.map((v: any) => Number.parseInt(String(v), 10)).filter((n: number) => Number.isFinite(n))
            : [],
        }))
        .filter((row: any) => row.eventId)
    : [];
  return { enabled, categories, events } as {
    enabled: boolean;
    categories: string[];
    events: ChampHubEventConfig[];
  };
}

function buildPointsTableForConfig(config: ChampHubEventConfig, count: number) {
  return config.pointsMode === 'manual'
    ? buildManualPoints(config.table, count)
    : buildPercentPoints(config.first, config.decayPercent, count);
}

function calculatePointsForRows(
  list: Array<{ user_id: string; position: number }>,
  config: ChampHubEventConfig
) {
  const pointsTable = buildPointsTableForConfig(config, list.length);
  const grouped = new Map<number, Array<{ user_id: string; position: number }>>();
  list.forEach((r) => {
    const group = grouped.get(r.position) || [];
    group.push(r);
    grouped.set(r.position, group);
  });

  const pointsByUser = new Map<string, { position: number; points: number }>();
  const positions = Array.from(grouped.keys()).sort((a, b) => a - b);

  positions.forEach((pos) => {
    const group = grouped.get(pos) || [];
    if (!group.length) return;

    if (pos <= config.podiumCount || group.length === 1) {
      const points = pointsTable[pos - 1] ?? 0;
      group.forEach((r) => pointsByUser.set(r.user_id, { position: pos, points }));
      return;
    }

    const startIdx = pos - 1;
    const endIdx = startIdx + group.length - 1;
    let sum = 0;
    for (let i = startIdx; i <= endIdx; i += 1) {
      sum += pointsTable[i] ?? 0;
    }
    const avg = group.length ? Math.round(sum / group.length) : 0;
    group.forEach((r) => pointsByUser.set(r.user_id, { position: pos, points: avg }));
  });

  return pointsByUser;
}

function calculateEventPointsByCategory(params: {
  finalClassification: Array<{ user_id: string; position: number | null }>;
  profileMap: Map<string, { name: string; category: string | null }>;
  pointsConfig: ChampHubEventConfig;
}) {
  const rows = params.finalClassification
    .filter((r) => !!r.user_id && Number.isFinite(r.position as number))
    .map((r) => ({ user_id: r.user_id, position: Number(r.position) }))
    .sort((a, b) => a.position - b.position);

  const byCategoryRows = new Map<string, Array<{ user_id: string; position: number }>>();
  rows.forEach((row) => {
    const profile = params.profileMap.get(row.user_id);
    const category = profile?.category || 'Sin categoria';
    const list = byCategoryRows.get(category) || [];
    list.push(row);
    byCategoryRows.set(category, list);
  });

  const result: Record<string, Map<string, { points: number; position: number }>> = {};

  byCategoryRows.forEach((list, category) => {
    const sorted = list.slice().sort((a, b) => a.position - b.position);
    const withCategoryPosition: Array<{ user_id: string; position: number }> = [];
    let nextPosition = 1;
    let idx = 0;
    while (idx < sorted.length) {
      const currentPos = sorted[idx].position;
      const group: Array<{ user_id: string; position: number }> = [];
      while (idx < sorted.length && sorted[idx].position === currentPos) {
        group.push({ user_id: sorted[idx].user_id, position: nextPosition });
        idx += 1;
      }
      withCategoryPosition.push(...group);
      nextPosition += group.length;
    }

    const pointsByUser = calculatePointsForRows(withCategoryPosition, params.pointsConfig);
    const map = new Map<string, { points: number; position: number }>();
    withCategoryPosition.forEach((row) => {
      const pointsRow = pointsByUser.get(row.user_id);
      if (!pointsRow) return;
      map.set(row.user_id, { points: pointsRow.points, position: pointsRow.position });
    });
    result[category] = map;
  });

  return result;
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

async function assertEventEditAllowed(params: {
  userId: string;
  role: string;
  profile: any;
  associationAdminId: string | null;
  eventId: string;
  isAdmin: boolean;
}) {
  // Fase de pruebas: cualquier admin/creador puede editar cualquier evento.
  if (params.isAdmin) {
    return { ok: true as const, status: 200 as const, error: null, eventRow: { id: params.eventId } as any };
  }

  const { data: eventRow } = await supabaseAdmin
    .from('events')
    .select('id, association_id, course_id, created_by')
    .eq('id', params.eventId)
    .single();

  if (!eventRow) return { ok: false as const, status: 404 as const, error: 'Event not found', eventRow: null };

  if (params.role === 'creador') {
    return { ok: true as const, status: 200 as const, error: null, eventRow };
  }

  const allowedAssociationIds = allowedAssociationIdsFor(params.profile, params.associationAdminId);
  const createdBy = (eventRow as any)?.created_by || null;
  const courseId = (eventRow as any)?.course_id || null;
  const associationId = (eventRow as any)?.association_id || null;

  let allowed = createdBy === params.userId;

  if (!allowed && associationId && allowedAssociationIds.length > 0 && allowedAssociationIds.includes(String(associationId))) {
    allowed = true;
  }

  if (!allowed && courseId && allowedAssociationIds.length > 0) {
    const { data: courseRow } = await supabaseAdmin
      .from('courses')
      .select('id, association_id')
      .eq('id', courseId)
      .single();

    const courseAssociationId = (courseRow as any)?.association_id || null;
    if (courseAssociationId && allowedAssociationIds.includes(String(courseAssociationId))) {
      allowed = true;
    }
  }

  if (!allowed) {
    return { ok: false as const, status: 403 as const, error: 'Not allowed for this event', eventRow };
  }

  return { ok: true as const, status: 200 as const, error: null, eventRow };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Not authed' }, { status: 401 });

    const { id } = await ctx.params;
    const eventId = String(id || '').trim();
    if (!eventId) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });

    const { profile, isAdmin, role, associationAdminId } = await getAdminProfile(user.id);
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const allowed = await assertEventEditAllowed({
      userId: user.id,
      role,
      profile,
      associationAdminId,
      eventId,
      isAdmin,
    });

    if (!allowed.ok) {
      return NextResponse.json({ ok: false, error: allowed.error }, { status: allowed.status });
    }

    const { data: event, error } = await supabaseAdmin
      .from('events')
      .select(
        'id, association_id, name, status, competition_mode, registration_start, registration_end, event_date, course_id, location, description, config, has_handicap_ranking, registered_player_ids, created_by'
      )
      .eq('id', eventId)
      .single();

    if (error || !event) {
      return NextResponse.json({ ok: false, error: error?.message || 'Event not found' }, { status: 404 });
    }

    const registeredIds = normalizeIdArray((event as any)?.registered_player_ids);

    let registeredPlayers: { id: string; name: string }[] = [];
    if (registeredIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, category')
        .in('id', registeredIds);

      const map = new Map<string, any>();
      ((profiles as any[]) || []).forEach((p) => map.set(String(p.id), p));

      registeredPlayers = registeredIds.map((pid) => {
        const p = map.get(pid);
        const fn = typeof p?.first_name === 'string' ? p.first_name.trim() : '';
        const ln = typeof p?.last_name === 'string' ? p.last_name.trim() : '';
        const name = `${fn} ${ln}`.trim() || pid;
        return { id: pid, name, category: p?.category || null };
      });
    }

    return NextResponse.json({ ok: true, event, registeredPlayers }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Not authed' }, { status: 401 });

    const { id } = await ctx.params;
    const eventId = String(id || '').trim();
    if (!eventId) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });

    const { profile, isAdmin, role, associationAdminId } = await getAdminProfile(user.id);
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const allowed = await assertEventEditAllowed({
      userId: user.id,
      role,
      profile,
      associationAdminId,
      eventId,
      isAdmin,
    });

    if (!allowed.ok) {
      return NextResponse.json({ ok: false, error: allowed.error }, { status: allowed.status });
    }

    const { data: existingEvent, error: existingError } = await supabaseAdmin
      .from('events')
      .select('id, config')
      .eq('id', eventId)
      .single();

    if (existingError || !existingEvent) {
      return NextResponse.json({ ok: false, error: existingError?.message || 'Event not found' }, { status: 404 });
    }

    const existingConfig = isPlainObject((existingEvent as any)?.config) ? (existingEvent as any).config : {};
    const existingFinalLocked = !!(existingConfig as any)?.finalClassificationLocked;
    const existingFinalClassification = normalizeFinalClassification((existingConfig as any)?.finalClassification);

    const body = await req.json().catch(() => ({}));

    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ ok: false, error: 'Missing name' }, { status: 200 });

    const eventDate = body?.event_date;
    if (eventDate != null && eventDate !== '' && !isIsoDate(eventDate)) {
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

    const courseIdRaw = typeof body?.course_id === 'string' ? body.course_id.trim() : '';
    if (courseIdRaw && !isUuid(courseIdRaw)) {
      return NextResponse.json({ ok: false, error: 'Invalid course_id' }, { status: 200 });
    }

    const competitionMode = normalizeMode(body?.competition_mode);
    const incomingConfig = isPlainObject(body?.config) ? body.config : {};

    const hasIncomingLocked = Object.prototype.hasOwnProperty.call(incomingConfig, 'finalClassificationLocked');
    const incomingLocked = hasIncomingLocked ? (incomingConfig as any).finalClassificationLocked : undefined;
    const nextLocked = typeof incomingLocked === 'boolean' ? incomingLocked : existingFinalLocked;

    const hasFinalClassification = Object.prototype.hasOwnProperty.call(incomingConfig, 'finalClassification');
    // Admin/creador puede ajustar la clasificación aunque esté bloqueada.

    const incomingFinalClassification = hasFinalClassification
      ? normalizeFinalClassification((incomingConfig as any)?.finalClassification)
      : null;

    const finalChanged = hasFinalClassification
      ? JSON.stringify(incomingFinalClassification) !== JSON.stringify(existingFinalClassification)
      : false;
    const lockedChanged = typeof incomingLocked === 'boolean' ? incomingLocked !== existingFinalLocked : false;

    const config = { ...existingConfig, ...incomingConfig };

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

      config.competitionMode = 'match-play';
      config.scoringSystem = 'match-play';
      config.hasConsolation = !!config.hasConsolation;
    }

    const nextStatus = typeof body?.status === 'string' ? body.status.trim().toLowerCase() : '';
    const shouldClose = ['closed', 'finished', 'finalizado', 'cerrado'].includes(nextStatus);
    const isStableford = !!competitionMode && competitionMode.includes('stable');
    const stablefordMode = String(config?.stableford?.mode || 'classic').toLowerCase();

    if (shouldClose && isStableford && stablefordMode === 'classic') {
      const pointsConfig = normalizePointsConfig(config);
      const finalList = normalizeFinalClassification((config as any)?.finalClassification);

      if (finalList.length > 0) {
        const ids = finalList.map((r) => r.user_id).filter(Boolean);
        const { data: profiles } = await supabaseAdmin
          .from('profiles')
          .select('id, first_name, last_name, category')
          .in('id', ids);

        const pointsByCategory = calculatePointsByCategory({
          finalClassification: finalList,
          profiles: (profiles as any[]) || [],
          pointsConfig,
        });

        config.eventPointsByCategory = pointsByCategory;
        config.eventPointsUpdatedAt = new Date().toISOString();
      }
    }

    const normalizedChampHub = normalizeChampionshipHub((config as any)?.championshipHub);
    if (normalizedChampHub.enabled) {
      const eventIds = normalizedChampHub.events.map((e) => e.eventId).filter(Boolean);
      const { data: champEvents } = await supabaseAdmin
        .from('events')
        .select('id, name, config')
        .in('id', eventIds);

      const eventMap = new Map<string, any>();
      ((champEvents as any[]) || []).forEach((row) => eventMap.set(String(row.id), row));

      const allUserIds = new Set<string>();
      normalizedChampHub.events.forEach((entry) => {
        const eventRow = eventMap.get(entry.eventId);
        const finalList = normalizeFinalClassification(eventRow?.config?.finalClassification || []);
        finalList.forEach((row) => {
          if (row?.user_id) allUserIds.add(String(row.user_id));
        });
      });

      const ids = Array.from(allUserIds);
      const { data: profiles } = ids.length
        ? await supabaseAdmin
            .from('profiles')
            .select('id, first_name, last_name, category')
            .in('id', ids)
        : { data: [] as any[] };

      const profileMap = new Map<string, { name: string; category: string | null }>();
      ((profiles as any[]) || []).forEach((p) => {
        const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id;
        profileMap.set(String(p.id), { name, category: p.category || null });
      });

      const eventMeta = normalizedChampHub.events.map((entry) => {
        const ev = eventMap.get(entry.eventId);
        return {
          eventId: entry.eventId,
          name: String(ev?.name || entry.eventId),
          kind: entry.kind,
        };
      });

      const perEventCategoryPoints = new Map<
        string,
        Record<string, Map<string, { points: number; position: number }>>
      >();

      normalizedChampHub.events.forEach((entry) => {
        const eventRow = eventMap.get(entry.eventId);
        const finalList = normalizeFinalClassification(eventRow?.config?.finalClassification || []);
        const eventPointsByCategory = calculateEventPointsByCategory({
          finalClassification: finalList,
          profileMap,
          pointsConfig: entry,
        });
        perEventCategoryPoints.set(entry.eventId, eventPointsByCategory);
      });

      const categorySet = new Set<string>(normalizedChampHub.categories);
      if (categorySet.size === 0) {
        perEventCategoryPoints.forEach((catMap) => {
          Object.keys(catMap).forEach((cat) => categorySet.add(cat));
        });
      }

      const categories = ['General', ...Array.from(categorySet).filter((c) => c !== 'General')];
      const standings: Record<string, Array<{ user_id: string; name: string; total: number; events: Record<string, number> }>> = {};

      const usersWithPoints = new Set<string>();
      perEventCategoryPoints.forEach((catMap) => {
        Object.values(catMap).forEach((userMap) => {
          userMap.forEach((_val, userId) => usersWithPoints.add(userId));
        });
      });

      categories.forEach((category) => {
        const rowsByUser = new Map<string, { user_id: string; name: string; total: number; events: Record<string, number> }>();
        usersWithPoints.forEach((userId) => {
          const profile = profileMap.get(userId);
          const name = profile?.name || userId;
          rowsByUser.set(userId, { user_id: userId, name, total: 0, events: {} });
        });

        normalizedChampHub.events.forEach((entry) => {
          const eventPoints = perEventCategoryPoints.get(entry.eventId) || {};
          if (category === 'General') {
            rowsByUser.forEach((row) => {
              const userCategory = profileMap.get(row.user_id)?.category || 'Sin categoria';
              const pointsRow = eventPoints[userCategory]?.get(row.user_id);
              const points = pointsRow?.points || 0;
              row.events[entry.eventId] = points;
              row.total += points;
            });
          } else {
            rowsByUser.forEach((row) => {
              const pointsRow = eventPoints[category]?.get(row.user_id);
              const points = pointsRow?.points || 0;
              row.events[entry.eventId] = points;
              row.total += points;
            });
          }
        });

        const rows = Array.from(rowsByUser.values())
          .filter((row) => row.total > 0)
          .sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name));
        standings[category] = rows;
      });

      const now = new Date().toISOString();
      const prevHub = isPlainObject(existingConfig?.championshipHub) ? (existingConfig as any).championshipHub : null;
      const history = Array.isArray(prevHub?.history) ? [...prevHub.history] : [];
      history.push({
        ts: now,
        actor_user_id: user.id,
        events: eventMeta,
        categories,
        totals: {
          categories: Object.keys(standings).length,
          players: Array.from(usersWithPoints).length,
        },
      });

      const prevEvents = new Set(
        Array.isArray(prevHub?.events) ? prevHub.events.map((e: any) => String(e?.eventId || '')).filter(Boolean) : []
      );
      const nextEvents = new Set(normalizedChampHub.events.map((e) => e.eventId));
      const eventHistory = Array.isArray(prevHub?.eventHistory) ? [...prevHub.eventHistory] : [];
      normalizedChampHub.events.forEach((entry) => {
        if (!prevEvents.has(entry.eventId)) {
          const ev = eventMap.get(entry.eventId);
          eventHistory.push({
            ts: now,
            actor_user_id: user.id,
            action: 'add',
            eventId: entry.eventId,
            eventName: String(ev?.name || entry.eventId),
            kind: entry.kind,
          });
        }
      });
      prevEvents.forEach((eventId) => {
        if (!nextEvents.has(eventId)) {
          eventHistory.push({
            ts: now,
            actor_user_id: user.id,
            action: 'remove',
            eventId,
          });
        }
      });

      (config as any).championshipHub = {
        ...normalizedChampHub,
        standings: {
          updatedAt: now,
          events: eventMeta,
          categories,
          byCategory: standings,
        },
        history,
        eventHistory,
      };
    } else {
      (config as any).championshipHub = normalizedChampHub;
    }

    const updateRow: any = {
      name,
      status: typeof body?.status === 'string' && body.status.trim() ? body.status.trim() : null,
      competition_mode: competitionMode,
      registration_start: registrationStart ? String(registrationStart) : null,
      registration_end: registrationEnd ? String(registrationEnd) : null,
      event_date: eventDate ? String(eventDate) : null,
      location: typeof body?.location === 'string' && body.location.trim() ? body.location.trim() : null,
      description: typeof body?.description === 'string' && body.description.trim() ? body.description.trim() : null,
      course_id: courseIdRaw || null,
      config,
      has_handicap_ranking: !!body?.has_handicap_ranking,
    };

    const { error } = await supabaseAdmin.from('events').update(updateRow).eq('id', eventId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 });

    if (finalChanged || lockedChanged) {
      const action: 'update' | 'lock' | 'unlock' =
        lockedChanged && !finalChanged ? (nextLocked ? 'lock' : 'unlock') : 'update';
      const snapshot = hasFinalClassification
        ? (incomingFinalClassification as any[])
        : existingFinalClassification;
      await safeInsertClassificationAudit({
        eventId,
        actorUserId: user.id,
        action,
        locked: nextLocked,
        snapshot,
      });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}
