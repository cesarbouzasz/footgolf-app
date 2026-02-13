/*
  Create test associations and admin users.

  Requires env:
  - NEXT_PUBLIC_SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
*/

const path = require('path');
const fs = require('fs');

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

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TARGET_USERS = [
  { email: 'adminand@adminand.com', password: '1q2w3e4r', associationName: 'And' },
  { email: 'adminvas@adminvas.com', password: '1q2w3e4r', associationName: 'Vas' },
  { email: 'admincyl@admincyl.com', password: '1q2w3e4r', associationName: 'CYL' },
  { email: 'admincyl2@admincyl2.com', password: '1q2w3e4r', associationName: 'CYL' },
  { email: 'adminagfg@adminagfg.com', password: '1q2w3e4r', associationName: 'AGFG' },
];

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
    if (page > 20) break;
  }

  return found;
}

async function ensureAssociation(name) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('Missing association name');

  const { data: existing, error: findErr } = await supabase
    .from('associations')
    .select('id, name')
    .eq('name', clean)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing?.id) return String(existing.id);

  const insertRes = await supabase
    .from('associations')
    .insert({ name: clean })
    .select('id')
    .single();

  if (insertRes.error || !insertRes.data?.id) {
    const { data: retry } = await supabase
      .from('associations')
      .select('id, name')
      .eq('name', clean)
      .maybeSingle();
    if (retry?.id) return String(retry.id);
    throw insertRes.error || new Error('Failed to create association');
  }

  return String(insertRes.data.id);
}

async function ensureAdminUser({ email, password, associationId }) {
  const normalizedEmail = email.toLowerCase();

  const createRes = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: 'Admin', last_name: associationId ? associationId.slice(0, 6) : '' },
  });

  let user = createRes.data?.user || null;

  if (!user) {
    const msg = String(createRes.error?.message || '');
    const already = /already\s+registered|user\s+already\s+exists|duplicate|email/i.test(msg);
    if (!already) throw createRes.error || new Error(msg || 'Failed to create user');

    const found = await listAllUsersByEmailSet(new Set([normalizedEmail]));
    user = found.get(normalizedEmail) || null;
    if (!user) throw new Error(`User exists but could not be found by email: ${email}`);
  }

  const profile = {
    id: user.id,
    first_name: 'Admin',
    last_name: '',
    role: 'admin',
    is_admin: true,
    association_id: associationId,
    default_association_id: associationId,
    updated_at: new Date().toISOString(),
  };

  const profRes = await supabase.from('profiles').upsert(profile, { onConflict: 'id' });
  if (profRes.error) throw profRes.error;

  return { id: user.id, email };
}

async function run() {
  const assocNames = Array.from(new Set(TARGET_USERS.map((u) => u.associationName)));
  const assocMap = new Map();

  for (const name of assocNames) {
    const assocId = await ensureAssociation(name);
    assocMap.set(name, assocId);
  }

  for (const entry of TARGET_USERS) {
    const assocId = assocMap.get(entry.associationName);
    const user = await ensureAdminUser({
      email: entry.email,
      password: entry.password,
      associationId: assocId,
    });

    await supabase
      .from('associations')
      .update({ admin_id: user.id })
      .eq('id', assocId);

    console.log(`OK: ${entry.email} -> ${entry.associationName}`);
  }
}

run()
  .then(() => {
    console.log('Done.');
  })
  .catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
