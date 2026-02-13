require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const eventId = process.argv[2];
if (!eventId) {
  console.error('Usage: node scripts/recalc-event-points.js <event-id>');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(url, key);

const normalizePointsConfig = (cfg) => {
  const mode = String(cfg?.stableford?.classicPoints?.mode || 'percent').toLowerCase();
  const first = Number.parseInt(String(cfg?.stableford?.classicPoints?.first || '0'), 10);
  const decay = Number.parseFloat(String(cfg?.stableford?.classicPoints?.decayPercent || '0'));
  const podium = Number.parseInt(String(cfg?.stableford?.classicPoints?.podiumCount || '3'), 10);
  const table = Array.isArray(cfg?.stableford?.classicPoints?.table)
    ? cfg.stableford.classicPoints.table
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
};

const buildPercentPoints = (first, decayPercent, count) => {
  const points = [];
  const factor = 1 - decayPercent / 100;
  let current = first;
  for (let i = 0; i < count; i += 1) {
    points.push(Math.max(0, Math.round(current)));
    current = current * factor;
  }
  return points;
};

const buildManualPoints = (table, count) => {
  const points = [];
  for (let i = 0; i < count; i += 1) {
    points.push(Number.isFinite(table[i]) ? Math.max(0, Math.round(table[i])) : 0);
  }
  return points;
};

const calculatePointsByCategory = (params) => {
  const profileMap = new Map();
  params.profiles.forEach((p) => {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id;
    profileMap.set(String(p.id), { name, category: p.category || null });
  });

  const rows = params.finalClassification
    .filter((r) => !!r.user_id && Number.isFinite(r.position))
    .map((r) => ({ user_id: r.user_id, position: Number(r.position) }))
    .sort((a, b) => a.position - b.position);

  const buildPointsTableForCount = (count) => (
    params.pointsConfig.mode === 'manual'
      ? buildManualPoints(params.pointsConfig.table, count)
      : buildPercentPoints(params.pointsConfig.first, params.pointsConfig.decay, count)
  );

  const calculatePointsForRows = (list) => {
    const pointsTable = buildPointsTableForCount(list.length);
    const grouped = new Map();
    list.forEach((r) => {
      const group = grouped.get(r.position) || [];
      group.push(r);
      grouped.set(r.position, group);
    });

    const pointsByUser = new Map();
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

  const byCategory = {};

  const generalPointsByUser = calculatePointsForRows(rows);
  const generalList = [];
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

  const rowsByCategory = new Map();
  rows.forEach((row) => {
    const profile = profileMap.get(row.user_id);
    const category = profile?.category || 'Sin categoria';
    const list = rowsByCategory.get(category) || [];
    list.push(row);
    rowsByCategory.set(category, list);
  });

  rowsByCategory.forEach((list, category) => {
    const sorted = list.slice().sort((a, b) => a.position - b.position);
    const withCategoryPosition = [];
    let nextPosition = 1;
    let idx = 0;
    while (idx < sorted.length) {
      const currentPos = sorted[idx].position;
      const group = [];
      while (idx < sorted.length && sorted[idx].position === currentPos) {
        group.push({ user_id: sorted[idx].user_id, position: nextPosition });
        idx += 1;
      }
      withCategoryPosition.push(...group);
      nextPosition += group.length;
    }

    const pointsByUser = calculatePointsForRows(withCategoryPosition);
    const categoryList = [];
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
};

(async () => {
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, config')
    .eq('id', eventId)
    .maybeSingle();

  if (eventError || !event) {
    console.error('Event not found', eventError || 'missing');
    process.exit(1);
  }

  const config = event.config || {};
  const finalList = Array.isArray(config.finalClassification)
    ? config.finalClassification
        .filter((r) => r && r.user_id && Number.isFinite(r.position))
        .map((r) => ({ user_id: r.user_id, position: Number(r.position) }))
    : [];

  if (finalList.length === 0) {
    console.error('No final classification rows found');
    process.exit(1);
  }

  const ids = finalList.map((r) => r.user_id).filter(Boolean);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, category')
    .in('id', ids);

  if (profilesError) {
    console.error('Profiles error', profilesError);
    process.exit(1);
  }

  const pointsConfig = normalizePointsConfig(config);
  const pointsByCategory = calculatePointsByCategory({
    finalClassification: finalList,
    profiles: profiles || [],
    pointsConfig,
  });

  config.eventPointsByCategory = pointsByCategory;
  config.eventPointsUpdatedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('events')
    .update({ config })
    .eq('id', eventId);

  if (updateError) {
    console.error('Update error', updateError);
    process.exit(1);
  }

  console.log('Recalculo OK. Tablas:', Object.keys(pointsByCategory));
})();
