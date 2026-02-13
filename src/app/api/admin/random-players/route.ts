import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FIRST_NAMES = [
  'Lucas', 'Mateo', 'Leo', 'Hugo', 'Martin', 'Daniel', 'Pablo', 'Nico', 'Ivan', 'Mario',
  'Alba', 'Carla', 'Nerea', 'Lucia', 'Paula', 'Ines', 'Laura', 'Sara', 'Eva', 'Noa',
];

const LAST_NAMES = [
  'Garcia', 'Perez', 'Lopez', 'Sanchez', 'Gomez', 'Martin', 'Ruiz', 'Diaz', 'Hernandez', 'Alonso',
  'Romero', 'Navarro', 'Torres', 'Dominguez', 'Vazquez', 'Ramos', 'Gil', 'Moreno', 'Serrano', 'Molina',
];

const CATEGORIES = ['Masculino', 'Femenino', 'Senior', 'Senior+', 'Junior'];

const DEFAULT_PASSWORD = 'Test1234!';

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

function isStaffRole(role: unknown, isAdminFlag: unknown) {
  const r = typeof role === 'string' ? role.trim().toLowerCase() : '';
  const isAdmin = isAdminFlag === true;
  return isAdmin || r === 'admin' || r === 'creador';
}

async function getStaffScope(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, role, is_admin, association_id, default_association_id')
    .eq('id', userId)
    .maybeSingle();

  if (!profile || !isStaffRole((profile as any).role, (profile as any).is_admin)) return null;

  const role = String((profile as any).role || '').trim().toLowerCase();
  const associationId = (profile as any).default_association_id || (profile as any).association_id || null;
  return { role, associationId };
}

function pickRandom(list: string[]) {
  return list[Math.floor(Math.random() * list.length)];
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scope = await getStaffScope(user.id);
    if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => null);
    const count = Number.parseInt(String(body?.count || ''), 10);
    const associationId = String(body?.association_id || '').trim();

    if (!Number.isFinite(count) || count < 1 || count > 50) {
      return NextResponse.json({ error: 'Invalid count' }, { status: 400 });
    }

    if (!associationId) {
      return NextResponse.json({ error: 'Missing association_id' }, { status: 400 });
    }

    if (scope.role !== 'creador' && scope.associationId && associationId !== String(scope.associationId)) {
      return NextResponse.json({ error: 'Not allowed for this association' }, { status: 403 });
    }

    const assocTag = associationId.replace(/[^a-z0-9]+/gi, '').slice(0, 6).toLowerCase();
    const created = [] as { id: string; email: string }[];

    for (let i = 0; i < count; i += 1) {
      const first = pickRandom(FIRST_NAMES);
      const last = pickRandom(LAST_NAMES);
      const category = pickRandom(CATEGORIES);
      const stamp = Date.now().toString(36);
      const email = `test+${assocTag}-${stamp}-${i}@footgolf.app`;

      const createRes = await supabaseAdmin.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { first_name: first, last_name: last },
      });

      const newUser = createRes.data?.user;
      if (!newUser) {
        const msg = createRes.error?.message || 'Failed to create user';
        return NextResponse.json({ error: msg }, { status: 400 });
      }

      const profile = {
        id: newUser.id,
        first_name: first,
        last_name: last,
        role: 'usuario',
        is_admin: false,
        association_id: associationId,
        default_association_id: associationId,
        category,
        updated_at: new Date().toISOString(),
      };

      const profRes = await supabaseAdmin.from('profiles').upsert(profile, { onConflict: 'id' });
      if (profRes.error) {
        return NextResponse.json({ error: profRes.error.message }, { status: 400 });
      }

      created.push({ id: newUser.id, email });
    }

    try {
      await supabaseAdmin.from('player_generation_log').insert({
        association_id: associationId,
        created_by: user.id,
        count: created.length,
      });
    } catch {
      // ignore if table is not present
    }

    return NextResponse.json({ ok: true, created: created.length, users: created }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
