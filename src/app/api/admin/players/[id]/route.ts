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

function stripUnknownProfileColumnFromError(message: string): string | null {
  const m1 = message.match(/column\s+"([^"]+)"\s+of\s+relation\s+"profiles"\s+does\s+not\s+exist/i);
  if (m1?.[1]) return m1[1];

  const m2 = message.match(/Could\s+not\s+find\s+the\s+'([^']+)'\s+column\s+of\s+'profiles'/i);
  if (m2?.[1]) return m2[1];

  return null;
}

async function upsertProfileWithRetry(payload: Record<string, any>) {
  const working = { ...payload };
  const stripped: string[] = [];

  for (let i = 0; i < 10; i++) {
    const { error } = await supabaseAdmin.from('profiles').upsert(working, { onConflict: 'id' });
    if (!error) return { ok: true as const, stripped };

    const unknownCol = stripUnknownProfileColumnFromError(error.message || '');
    if (!unknownCol) return { ok: false as const, error };

    if (unknownCol in working) {
      delete working[unknownCol];
      stripped.push(unknownCol);
      continue;
    }

    return { ok: false as const, error };
  }

  return { ok: false as const, error: new Error('Failed to update profile') };
}

async function upsertProfileExtras(extras: Record<string, any>) {
  const { error } = await supabaseAdmin.from('profile_extras').upsert(extras, { onConflict: 'user_id' });
  if (!error) return { ok: true as const };

  const msg = (error as any)?.message || '';
  if (/relation\s+"profile_extras"\s+does\s+not\s+exist/i.test(msg)) {
    return { ok: false as const, missingTable: true as const, message: msg };
  }

  return { ok: false as const, missingTable: false as const, message: msg };
}

async function getMergedProfile(userId: string) {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !profile) return { profile: null, error };

  let extras: any = null;
  try {
    const { data: exData, error: exErr } = await supabaseAdmin
      .from('profile_extras')
      .select('phone, region, province, avatar_url')
      .eq('user_id', userId)
      .maybeSingle();
    if (!exErr) extras = exData;
  } catch {
    // ignore
  }

  const merged = { ...(profile as any) };
  if (extras && typeof extras === 'object') {
    for (const k of ['phone', 'region', 'province', 'avatar_url']) {
      if (k in extras) (merged as any)[k] = (extras as any)[k];
    }
  }

  let email: string | null = null;
  try {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    email = authUser?.user?.email ?? null;
  } catch {
    // ignore
  }

  return { profile: { ...merged, email } };
}

function normalizeAssociationId(value: unknown) {
  const trimmed = String(value || '').trim();
  return trimmed.length ? trimmed : null;
}

function normalizeRole(value: unknown) {
  const trimmed = String(value || '').trim();
  return trimmed.length ? trimmed : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scope = await getStaffScope(user.id);
    if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const resolvedParams = await params;
    const targetId = String(resolvedParams?.id || '').trim();
    if (!targetId) return NextResponse.json({ error: 'Missing player id' }, { status: 400 });

    const merged = await getMergedProfile(targetId);
    if (!merged.profile) {
      return NextResponse.json({ error: merged.error?.message || 'Not found' }, { status: 404 });
    }

    if (scope.role !== 'creador' && scope.associationId) {
      const targetAssociation = (merged.profile as any)?.association_id || (merged.profile as any)?.default_association_id || null;
      if (targetAssociation && String(targetAssociation) !== String(scope.associationId)) {
        return NextResponse.json({ error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    return NextResponse.json({ profile: merged.profile }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scope = await getStaffScope(user.id);
    if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const resolvedParams = await params;
    const targetId = String(resolvedParams?.id || '').trim();
    if (!targetId) return NextResponse.json({ error: 'Missing player id' }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const baseProfile = await getMergedProfile(targetId);
    if (!baseProfile.profile) {
      return NextResponse.json({ error: baseProfile.error?.message || 'Not found' }, { status: 404 });
    }

    if (scope.role !== 'creador' && scope.associationId) {
      const targetAssociation = (baseProfile.profile as any)?.association_id || (baseProfile.profile as any)?.default_association_id || null;
      if (targetAssociation && String(targetAssociation) !== String(scope.associationId)) {
        return NextResponse.json({ error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    const allowed = [
      'first_name',
      'last_name',
      'team',
      'phone',
      'birth_year',
      'category',
      'country',
      'region',
      'province',
      'role',
      'association_id',
      'default_association_id',
      'is_admin',
    ];

    const profilePayload: Record<string, any> = { id: targetId };
    for (const key of allowed) {
      if (key in body) profilePayload[key] = (body as any)[key];
    }

    if ('association_id' in profilePayload) {
      profilePayload.association_id = normalizeAssociationId(profilePayload.association_id);
    }
    if ('default_association_id' in profilePayload) {
      profilePayload.default_association_id = normalizeAssociationId(profilePayload.default_association_id);
    }
    if ('role' in profilePayload) {
      profilePayload.role = normalizeRole(profilePayload.role);
    }

    const result = await upsertProfileWithRetry(profilePayload);
    if (!result.ok) {
      const msg = (result.error as any)?.message || 'Error guardando perfil';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const extrasKeys = ['phone', 'region', 'province', 'avatar_url'] as const;
    const stripped = result.stripped || [];
    const needsExtras = extrasKeys.some((k) => k in body && stripped.includes(k));
    if (needsExtras) {
      const extras: Record<string, any> = { user_id: targetId };
      extrasKeys.forEach((k) => {
        if (k in body) extras[k] = (body as any)[k];
      });
      const exRes = await upsertProfileExtras(extras);
      if (!exRes.ok && !(exRes as any).missingTable) {
        return NextResponse.json({ error: (exRes as any).message || 'Error guardando perfil' }, { status: 400 });
      }
    }

    if ('email' in body) {
      const nextEmail = String(body.email || '').trim();
      if (nextEmail) {
        const emailRes = await supabaseAdmin.auth.admin.updateUserById(targetId, { email: nextEmail });
        if (emailRes.error) {
          return NextResponse.json({ error: emailRes.error.message || 'Error actualizando email' }, { status: 400 });
        }
      }
    }

    const merged = await getMergedProfile(targetId);
    return NextResponse.json({ ok: true, profile: merged.profile }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
