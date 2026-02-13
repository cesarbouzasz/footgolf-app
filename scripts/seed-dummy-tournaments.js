/*
  Seed dummy tournaments + dummy users into Supabase.

  Creates:
  - Stableford (finalizado) on 2026-01-07 with 32 dummy users
  - Match Play on 2026-01-08 with 17 dummy users, no seeds, consolation enabled
  - Match Play (finalizado) on 2026-01-28 with 16 dummy users, 3 holes per round, consolation enabled

  Requires env:
  - NEXT_PUBLIC_SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY

  Optional env:
  - DUMMY_ASSOCIATION_NAME (default: AGFG)
  - DUMMY_TAG (default: 202601)
*/

const path = require('path');
const fs = require('fs');

// Load env (for running via `npm run ...`)
try {
  const dotenv = require('dotenv');
  const localPath = path.join(process.cwd(), '.env.local');
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(localPath)) dotenv.config({ path: localPath });
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: false });
} catch {
  // ignore
}

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const DUMMY_ASSOCIATION_NAME = String(process.env.DUMMY_ASSOCIATION_NAME || 'AGFG').trim();
const DUMMY_TAG = String(process.env.DUMMY_TAG || '202601').trim();

const CATEGORY_OPTIONS = ['Masculino', 'Femenino', 'Senior', 'Senior+', 'Junior'];

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function previousPowerOfTwo(n) {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

function selectPlaceholderPositions(targetPlayers, extra) {
  if (extra <= 0) return [];
  if (extra === 1) return [0];
  if (extra === 2) return [0, targetPlayers - 1];

  const desired = Array.from({ length: extra }, (_, i) => {
    const t = (targetPlayers - 1) * (i / (extra - 1));
    return Math.round(t);
  });

  const used = new Set();
  const positions = [];

  const findFree = (pos) => {
    if (pos < 0) return 0;
    if (pos >= targetPlayers) return targetPlayers - 1;
    if (!used.has(pos)) return pos;

    for (let offset = 1; offset < targetPlayers; offset += 1) {
      const right = pos + offset;
      if (right < targetPlayers && !used.has(right)) return right;
      const left = pos - offset;
      if (left >= 0 && !used.has(left)) return left;
    }
    return pos;
  };

  desired.forEach((pos) => {
    const free = findFree(pos);
    used.add(free);
    positions.push(free);
  });

  return positions;
}

function buildMatchesFromSlots(slots) {
  const out = [];
  for (let i = 0; i < slots.length; i += 2) {
    const a = slots[i] || null;
    const b = slots[i + 1] || null;
    out.push({
      p1: a ? a.name : 'N/A',
      p2: b ? b.name : 'N/A',
      p1_id: a ? a.id : null,
      p2_id: b ? b.id : null,
      result: null,
      winner: null,
      matchCode: null,
    });
  }
  return out;
}

function buildPercentPoints(first, decayPercent, count) {
  const points = [];
  const factor = 1 - decayPercent / 100;
  let current = first;
  for (let i = 0; i < count; i += 1) {
    points.push(Math.max(0, Math.round(current)));
    current = current * factor;
  }
  return points;
}

function buildManualPoints(table, count) {
  const points = [];
  for (let i = 0; i < count; i += 1) {
    points.push(Number.isFinite(table[i]) ? Math.max(0, Math.round(table[i])) : 0);
  }
  return points;
}

function calculatePointsByCategory(finalClassification, profiles, pointsConfig) {
  const profileMap = new Map();
  profiles.forEach((p) => {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id;
    profileMap.set(String(p.id), { name, category: p.category || null });
  });

  const rows = finalClassification
    .filter((r) => r.user_id && Number.isFinite(r.position))
    .map((r) => ({ user_id: r.user_id, position: Number(r.position) }))
    .sort((a, b) => a.position - b.position);

  const totalPositions = rows.length;
  const pointsTable = pointsConfig.mode === 'manual'
    ? buildManualPoints(pointsConfig.table, totalPositions)
    : buildPercentPoints(pointsConfig.first, pointsConfig.decay, totalPositions);

  const grouped = new Map();
  rows.forEach((r) => {
    const list = grouped.get(r.position) || [];
    list.push(r);
    grouped.set(r.position, list);
  });

  const pointsByUser = new Map();
  const positions = Array.from(grouped.keys()).sort((a, b) => a - b);

  positions.forEach((pos) => {
    const list = grouped.get(pos) || [];
    if (list.length === 0) return;

    if (pos <= pointsConfig.podium || list.length === 1) {
      const points = pointsTable[pos - 1] || 0;
      list.forEach((r) => pointsByUser.set(r.user_id, { position: pos, points }));
      return;
    }

    const startIdx = pos - 1;
    const endIdx = startIdx + list.length - 1;
    let sum = 0;
    for (let i = startIdx; i <= endIdx; i += 1) {
      sum += pointsTable[i] || 0;
    }
    const avg = list.length ? Math.round(sum / list.length) : 0;
    list.forEach((r) => pointsByUser.set(r.user_id, { position: pos, points: avg }));
  });

  const byCategory = {};
  rows.forEach((row) => {
    const profile = profileMap.get(row.user_id);
    const category = (profile && profile.category) || 'Sin categoria';
    const pointsRow = pointsByUser.get(row.user_id);
    if (!pointsRow) return;
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push({
      user_id: row.user_id,
      name: profile ? profile.name : row.user_id,
      position: pointsRow.position,
      points: pointsRow.points,
    });
  });

  Object.values(byCategory).forEach((list) => list.sort((a, b) => b.points - a.points));
  return byCategory;
}

async function listAllUsersByEmailSet(targetEmails) {
  const found = new Map();
  let page = 1;
  const perPage = 200;

  while (true) {
    const res = await supabase.auth.admin.listUsers({ page, perPage });
    if (res.error) throw res.error;

    const users = res.data?.users || [];
    for (const u of users) {
      const email = String(u.email || '').toLowerCase();
      if (targetEmails.has(email)) found.set(email, u);
    }

    if (users.length < perPage) break;
    if (found.size === targetEmails.size) break;
    page += 1;
    if (page > 20) break; // safety
  }

  return found;
}

async function ensureUser({ email, password, firstName, lastName, associationId, category }) {
  const normalizedEmail = email.toLowerCase();

  const createRes = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
  });

  let user = createRes.data?.user || null;

  if (!user) {
    const msg = String(createRes.error?.message || '');
    const already = /already\s+registered|user\s+already\s+exists|duplicate|email/i.test(msg);
    if (!already) {
      throw createRes.error || new Error(msg || 'Failed to create user');
    }

    const found = await listAllUsersByEmailSet(new Set([normalizedEmail]));
    user = found.get(normalizedEmail) || null;
    if (!user) throw new Error(`User exists but could not be found by email: ${email}`);
  }

  const profile = {
    id: user.id,
    first_name: firstName,
    last_name: lastName,
    role: 'usuario',
    association_id: associationId,
    default_association_id: associationId,
    category: category || 'General',
    updated_at: new Date().toISOString(),
  };

  const profRes = await supabase.from('profiles').upsert(profile, { onConflict: 'id' });
  if (profRes.error) throw profRes.error;

  return { id: user.id, email };
}

async function insertEventRegistrations(eventId, userIds) {
  let rows = userIds.map((uid) => ({ event_id: eventId, user_id: uid, category: null }));
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await supabase.from('event_registrations').upsert(rows, { onConflict: 'event_id,user_id' });
    if (!res.error) return;

    const msg = String(res.error?.message || '');
    const m = msg.match(/Could not find the '([^']+)' column of 'event_registrations'/i);
    if (m && m[1]) {
      const col = m[1];
      rows = rows.map((r) => {
        const next = { ...r };
        delete next[col];
        return next;
      });
      continue;
    }
    throw res.error;
  }
}

async function insertEventWithFallback(payload) {
  let attemptPayload = { ...payload };
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await supabase.from('events').insert(attemptPayload).select('id').single();
    if (!res.error && res.data?.id) return String(res.data.id);

    const msg = String(res.error?.message || '');
    const m = msg.match(/Could not find the '([^']+)' column of 'events'/i);
    if (m && m[1] && Object.prototype.hasOwnProperty.call(attemptPayload, m[1])) {
      const col = m[1];
      delete attemptPayload[col];
      continue;
    }
    throw res.error || new Error(msg || 'Insert failed');
  }
  throw new Error('Insert failed after retries');
}

async function deleteExistingEventByName(associationId, name) {
  const { data, error } = await supabase
    .from('events')
    .select('id')
    .eq('association_id', associationId)
    .eq('name', name)
    .limit(10);

  if (error) return;
  const ids = (data || []).map((r) => String(r.id)).filter(Boolean);
  if (ids.length === 0) return;
  await supabase.from('events').delete().in('id', ids);
}

async function main() {
  console.log('Seeding dummy tournaments…');

  const assocRes = await supabase
    .from('associations')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(200);

  if (assocRes.error) throw assocRes.error;
  const assocs = assocRes.data || [];
  if (assocs.length === 0) throw new Error('No associations found. Create one first.');

  const association =
    assocs.find((a) => String(a.name || '').trim().toLowerCase() === DUMMY_ASSOCIATION_NAME.toLowerCase()) || assocs[0];

  const associationId = String(association.id);
  console.log(`Using association: ${association.name} (${associationId})`);

  const dummyPassword = `Dummy_${DUMMY_TAG}_Pass!`;

  const dummyUsers = [];
  for (let i = 1; i <= 32; i++) {
    const idx = String(i).padStart(2, '0');
    const email = `dummy${idx}+${DUMMY_TAG}@footgolftotal.test`;
    const firstName = `Dummy ${idx}`;
    const lastName = 'Jugador';
    const category = CATEGORY_OPTIONS[(i - 1) % CATEGORY_OPTIONS.length];
    const u = await ensureUser({ email, password: dummyPassword, firstName, lastName, associationId, category });
    dummyUsers.push({ id: u.id, name: `${firstName} ${lastName}` });
    if (i % 8 === 0) console.log(`- users: ${i}/32`);
  }

  const stablefordUserIds = dummyUsers.map((u) => u.id);
  const matchPlayUserIds = dummyUsers.slice(0, 17).map((u) => u.id);

  // Stableford event
  const stablefordName = `Torneo Stableford Prueba (Finalizado) - 2026-01-07`;
  await deleteExistingEventByName(associationId, stablefordName);
  const stablefordEventId = await insertEventWithFallback({
    association_id: associationId,
    name: stablefordName,
    status: 'finalizado',
    competition_mode: 'stableford',
    event_date: '2026-01-07',
    registration_start: '2025-12-15',
    registration_end: '2026-01-06',
    location: null,
    description: 'Torneo de prueba (datos dummy).',
    config: { maxPlayers: 32 },
    registered_player_ids: stablefordUserIds,
    has_handicap_ranking: false,
    created_by: null,
  });
  console.log(`Created Stableford event: ${stablefordEventId}`);
  await insertEventRegistrations(stablefordEventId, stablefordUserIds);

  // Stableford event (2 rounds, closed)
  const stablefordClosedName = `Torneo Stableford 2 rondas (Cerrado) - 2026-02-12`;
  await deleteExistingEventByName(associationId, stablefordClosedName);

  const stablefordClosedConfig = {
    maxPlayers: 32,
    stableford: {
      mode: 'classic',
      classicRounds: 2,
      classicPoints: {
        mode: 'percent',
        first: 100,
        decayPercent: 10,
        podiumCount: 3,
      },
    },
    championship: {
      enabled: true,
      totalEvents: 8,
      simpleEvents: 6,
      doubleEvents: 2,
      bestSimpleCount: 4,
      bestDoubleCount: 1,
      categories: ['General'],
    },
    championshipStage: 1,
    championshipEventType: 'simple',
    coursePar: 72,
  };

  const shuffled = shuffleInPlace([...stablefordUserIds]);
  const finalClassification = shuffled.map((userId, index) => {
    const round1 = 72 + (index % 4) - 2;
    const round2 = 72 + (index % 5) - 3;
    const total = round1 + round2;
    return {
      user_id: userId,
      position: index + 1,
      rounds: [round1, round2],
      strokes: total,
      note: null,
    };
  });

  const { data: profilesForPoints } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, category')
    .in('id', stablefordUserIds);

  const pointsConfig = {
    mode: 'percent',
    first: 100,
    decay: 10,
    podium: 3,
    table: [],
  };

  const pointsByCategory = calculatePointsByCategory(
    finalClassification,
    profilesForPoints || [],
    pointsConfig
  );

  stablefordClosedConfig.finalClassification = finalClassification;
  stablefordClosedConfig.finalClassificationLocked = true;
  stablefordClosedConfig.eventPointsByCategory = pointsByCategory;
  stablefordClosedConfig.eventPointsUpdatedAt = new Date().toISOString();

  const stablefordClosedEventId = await insertEventWithFallback({
    association_id: associationId,
    name: stablefordClosedName,
    status: 'cerrado',
    competition_mode: 'stableford',
    event_date: '2026-02-12',
    registration_start: '2026-01-20',
    registration_end: '2026-02-10',
    location: null,
    description: 'Torneo de prueba (2 rondas, cerrado) con puntos por categoria.',
    config: stablefordClosedConfig,
    registered_player_ids: stablefordUserIds,
    has_handicap_ranking: false,
    created_by: null,
  });
  console.log(`Created Stableford closed event: ${stablefordClosedEventId}`);
  await insertEventRegistrations(stablefordClosedEventId, stablefordUserIds);

  // Match Play event with draw
  const mpName = `Torneo Match Play Prueba - 2026-01-08`;
  await deleteExistingEventByName(associationId, mpName);

  const players = dummyUsers.slice(0, 17).map((u) => ({ id: u.id, name: u.name }));
  shuffleInPlace(players);

  const baseSize = previousPowerOfTwo(players.length);
  const extraPlayers = players.length - baseSize;
  const rounds = [];

  if (extraPlayers > 0) {
    const prelimPlayers = players.slice(-extraPlayers * 2);
    const mainPlayers = players.slice(0, players.length - extraPlayers * 2);
    const prelimMatches = buildMatchesFromSlots(prelimPlayers);
    const placeholderPositions = selectPlaceholderPositions(baseSize, extraPlayers);
    const placeholderOrderByPos = new Map();
    placeholderPositions.forEach((pos, idx) => {
      placeholderOrderByPos.set(pos, idx + 1);
    });

    const slots = [];
    let mainIdx = 0;
    for (let i = 0; i < baseSize; i += 1) {
      const order = placeholderOrderByPos.get(i);
      if (order) {
        slots.push({ id: null, name: `Ganador previa ${order}` });
      } else {
        const p = mainPlayers[mainIdx];
        mainIdx += 1;
        slots.push({ id: p ? p.id : null, name: p ? p.name : 'N/A' });
      }
    }

    const mainMatches = buildMatchesFromSlots(slots);
    const anchorTargets = placeholderPositions.map((pos) => Math.floor(pos / 2));
    rounds.push({ name: 'Previa', matches: prelimMatches, anchorTargets });
    rounds.push({ name: 'Primera ronda', matches: mainMatches });
  } else {
    const mainMatches = buildMatchesFromSlots(players);
    rounds.push({ name: 'Primera ronda', matches: mainMatches });
  }

  const config = {
    competitionMode: 'match-play',
    scoringSystem: 'match-play',
    holesPerRound: [6, 3, 3, 3, 3],
    hasConsolation: true,
    consolationHolesPerRound: [3, 3, 3, 3],
    hasSeeds: false,
    seedCount: null,
    maxPlayers: 64,
    mainBracket: {
      rounds,
    },
    consolationBracket: {
      rounds: [
        {
          name: 'Consolación (pendiente)',
          matches: [],
        },
      ],
    },
  };

  const matchPlayEventId = await insertEventWithFallback({
    association_id: associationId,
    name: mpName,
    status: 'en_juego',
    competition_mode: 'match-play',
    event_date: '2026-01-08',
    registration_start: '2025-12-16',
    registration_end: '2026-01-07',
    location: null,
    description:
      'Torneo de prueba (datos dummy). Match Play con consolación activa para perdedores de 1ª ronda.',
    config,
    registered_player_ids: matchPlayUserIds,
    has_handicap_ranking: false,
    created_by: null,
  });
  console.log(`Created Match Play event: ${matchPlayEventId}`);
  await insertEventRegistrations(matchPlayEventId, matchPlayUserIds);

  // Match Play finished event (16 players, 3 holes per round)
  const mpFinishedName = `Torneo Match Play Finalizado - 2026-01-28`;
  await deleteExistingEventByName(associationId, mpFinishedName);

  const finishedPlayers = dummyUsers.slice(0, 16).map((u) => ({ id: u.id, name: u.name }));
  const roundOf16Matches = buildMatchesFromSlots(finishedPlayers);
  roundOf16Matches.forEach((m) => {
    m.result = '2-1';
    m.winner = m.p1_id;
  });
  const quarterPlayers = roundOf16Matches.map((m) => ({ id: m.p1_id, name: m.p1 }));
  const quarterMatches = buildMatchesFromSlots(quarterPlayers);
  quarterMatches.forEach((m) => {
    m.result = '2-1';
    m.winner = m.p1_id;
  });
  const semiPlayers = quarterMatches.map((m) => ({ id: m.p1_id, name: m.p1 }));
  const semiMatches = buildMatchesFromSlots(semiPlayers);
  semiMatches.forEach((m) => {
    m.result = '2-1';
    m.winner = m.p1_id;
  });
  const finalPlayers = semiMatches.map((m) => ({ id: m.p1_id, name: m.p1 }));
  const finalMatches = buildMatchesFromSlots(finalPlayers);
  finalMatches.forEach((m) => {
    m.result = '2-1';
    m.winner = m.p1_id;
  });

  const consolationPlayers = roundOf16Matches.map((m) => ({ id: m.p2_id, name: m.p2 }));
  const consolationQuarterMatches = buildMatchesFromSlots(consolationPlayers);
  consolationQuarterMatches.forEach((m) => {
    m.result = '2-1';
    m.winner = m.p1_id;
  });
  const consolationSemiPlayers = consolationQuarterMatches.map((m) => ({ id: m.p1_id, name: m.p1 }));
  const consolationSemiMatches = buildMatchesFromSlots(consolationSemiPlayers);
  consolationSemiMatches.forEach((m) => {
    m.result = '2-1';
    m.winner = m.p1_id;
  });
  const consolationFinalPlayers = consolationSemiMatches.map((m) => ({ id: m.p1_id, name: m.p1 }));
  const consolationFinalMatches = buildMatchesFromSlots(consolationFinalPlayers);
  consolationFinalMatches.forEach((m) => {
    m.result = '2-1';
    m.winner = m.p1_id;
  });

  const mpFinishedClassification = [];
  const pushRow = (pos, player, rounds, note) => {
    if (!player || !player.id) return;
    mpFinishedClassification.push({
      user_id: player.id,
      position: pos,
      rounds,
      strokes: null,
      note,
    });
  };

  const champion = finalMatches[0] ? { id: finalMatches[0].p1_id, name: finalMatches[0].p1 } : null;
  const runnerUp = finalMatches[0] ? { id: finalMatches[0].p2_id, name: finalMatches[0].p2 } : null;
  const semiLosers = semiMatches.map((m) => ({ id: m.p2_id, name: m.p2 }));
  const quarterLosers = quarterMatches.map((m) => ({ id: m.p2_id, name: m.p2 }));
  const round1Losers = roundOf16Matches.map((m) => ({ id: m.p2_id, name: m.p2 }));

  pushRow(1, champion, [3, 3, 3, 3], 'Campeon');
  pushRow(2, runnerUp, [3, 3, 3, 3], 'Finalista');
  semiLosers.forEach((p, idx) => pushRow(3 + idx, p, [3, 3, 3, null], 'Semifinal'));
  quarterLosers.forEach((p, idx) => pushRow(5 + idx, p, [3, 3, null, null], 'Cuartos'));
  round1Losers.forEach((p, idx) => pushRow(9 + idx, p, [3, null, null, null], 'Octavos'));

  const mpFinishedConfig = {
    competitionMode: 'match-play',
    scoringSystem: 'match-play',
    holesPerRound: [3, 3, 3, 3],
    hasConsolation: true,
    consolationHolesPerRound: [3, 3, 3],
    hasSeeds: false,
    seedCount: null,
    maxPlayers: 16,
    mainBracket: {
      rounds: [
        { name: 'Octavos', matches: roundOf16Matches },
        { name: 'Cuartos', matches: quarterMatches },
        { name: 'Semifinal', matches: semiMatches },
        { name: 'Final', matches: finalMatches },
      ],
    },
    consolationBracket: {
      rounds: [
        { name: 'Consolacion - Cuartos', matches: consolationQuarterMatches },
        { name: 'Consolacion - Semifinal', matches: consolationSemiMatches },
        { name: 'Consolacion - Final', matches: consolationFinalMatches },
      ],
    },
    finalClassification: mpFinishedClassification,
    finalClassificationLocked: true,
  };

  const matchPlayFinishedEventId = await insertEventWithFallback({
    association_id: associationId,
    name: mpFinishedName,
    status: 'finalizado',
    competition_mode: 'match-play',
    event_date: '2026-01-28',
    registration_start: '2026-01-10',
    registration_end: '2026-01-26',
    location: null,
    description:
      'Match Play finalizado (16 jugadores). Rondas de 3 hoyos y consolacion activa para perdedores de 1ª ronda.',
    config: mpFinishedConfig,
    registered_player_ids: finishedPlayers.map((p) => p.id),
    has_handicap_ranking: false,
    created_by: null,
  });
  console.log(`Created Match Play finished event: ${matchPlayFinishedEventId}`);
  await insertEventRegistrations(matchPlayFinishedEventId, finishedPlayers.map((p) => p.id));

  console.log('Done.');
  console.log(`- Dummy password for all: ${dummyPassword}`);
}

main().catch((err) => {
  const msg = err?.message ? String(err.message) : '';
  if (msg) {
    console.error(msg);
  } else {
    try {
      console.error(JSON.stringify(err, null, 2));
    } catch {
      console.error(err);
    }
  }
  process.exit(1);
});
