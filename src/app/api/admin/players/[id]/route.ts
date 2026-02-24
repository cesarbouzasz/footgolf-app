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

async function getManagementPlayerId(targetId: string, role: unknown) {
  const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';
  if (normalizedRole === 'creador') return 0;

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, created_at')
    .order('created_at', { ascending: true });

  if (error || !data) return null;

  const creator = data.find((row: any) => String(row?.role || '').trim().toLowerCase() === 'creador');
  const admins = data.filter((row: any) => String(row?.role || '').trim().toLowerCase() === 'admin');
  const others = data.filter((row: any) => {
    const rowRole = String(row?.role || '').trim().toLowerCase();
    return rowRole !== 'creador' && rowRole !== 'admin';
  });

  const map = new Map<string, number>();
  let index = 0;

  if (creator?.id) {
    map.set(String(creator.id), 0);
    index = 1;
  }

  admins.forEach((row: any) => {
    const id = String(row?.id || '').trim();
    if (id && !map.has(id)) {
      map.set(id, index);
      index += 1;
    }
  });

  others.forEach((row: any) => {
    const id = String(row?.id || '').trim();
    if (id && !map.has(id)) {
      map.set(id, index);
      index += 1;
    }
  });

  return map.get(targetId) ?? null;
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

  const managementId = await getManagementPlayerId(userId, (merged as any)?.role);

  return { profile: { ...merged, email, management_id: managementId } };
}

function normalizeAssociationId(value: unknown) {
  const trimmed = String(value || '').trim();
  return trimmed.length ? trimmed : null;
}

function normalizeRole(value: unknown) {
  const trimmed = String(value || '').trim();
  return trimmed.length ? trimmed : null;
}

function normalizeRoleLower(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function isMissingTableError(message: string) {
  return /relation\s+"[^"]+"\s+does\s+not\s+exist/i.test(message) || /Could\s+not\s+find\s+the\s+table/i.test(message);
}

async function deleteByColumnSafe(table: string, column: string, value: string) {
  const { error } = await supabaseAdmin.from(table).delete().eq(column, value);
  if (!error) return;
  if (isMissingTableError(error.message || '')) return;
  throw new Error(error.message || `Delete failed in ${table}`);
}

function resolveAssociationId(payload: Record<string, any>, baseProfile: any) {
  if ('default_association_id' in payload) return payload.default_association_id || null;
  if ('association_id' in payload) return payload.association_id || null;
  return baseProfile?.default_association_id || baseProfile?.association_id || null;
}

async function countAssociationAdmins(associationId: string, excludeUserId: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, is_admin, association_id, default_association_id')
    .or(`association_id.eq.${associationId},default_association_id.eq.${associationId}`);

  if (error) throw new Error(error.message || 'Error counting admins');

  return (data || []).filter((row: any) => {
    const rowId = String(row?.id || '');
    if (!rowId || rowId === excludeUserId) return false;
    const role = normalizeRoleLower(row?.role);
    if (role === 'creador') return false;
    return row?.is_admin === true || role === 'admin';
  }).length;
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

    const targetCurrentRole = normalizeRoleLower((baseProfile.profile as any)?.role);
    if (targetCurrentRole === 'creador') {
      return NextResponse.json({ error: 'Creator account cannot be modified' }, { status: 403 });
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

    const nextRole = ('role' in profilePayload)
      ? normalizeRoleLower(profilePayload.role)
      : normalizeRoleLower((baseProfile.profile as any)?.role);

    if (nextRole === 'creador') {
      return NextResponse.json({ error: 'Creator role cannot be assigned' }, { status: 400 });
    }

    const nextIsAdmin = (
      ('is_admin' in profilePayload) ? Boolean(profilePayload.is_admin) : Boolean((baseProfile.profile as any)?.is_admin)
    ) || nextRole === 'admin';

    if (nextIsAdmin) {
      const associationId = resolveAssociationId(profilePayload, baseProfile.profile as any);
      if (!associationId) {
        return NextResponse.json({ error: 'Admin users must belong to an association' }, { status: 400 });
      }

      const adminCount = await countAssociationAdmins(String(associationId), targetId);
      if (adminCount >= 3) {
        return NextResponse.json({ error: 'Association admin limit reached (max 3)' }, { status: 400 });
      }
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const targetRole = normalizeRoleLower((merged.profile as any)?.role);
    if (targetRole === 'creador') {
      return NextResponse.json({ error: 'Creator account cannot be deleted' }, { status: 403 });
    }

    if (scope.role !== 'creador' && scope.associationId) {
      const targetAssociation = (merged.profile as any)?.association_id || (merged.profile as any)?.default_association_id || null;
      if (targetAssociation && String(targetAssociation) !== String(scope.associationId)) {
        return NextResponse.json({ error: 'Not allowed for this association' }, { status: 403 });
      }
    }

    await deleteByColumnSafe('pair_members', 'player_id', targetId);
    await deleteByColumnSafe('event_team_members', 'player_id', targetId);
    await deleteByColumnSafe('association_notification_dismissals', 'player_id', targetId);
    await deleteByColumnSafe('tournament_notification_dismissals', 'player_id', targetId);
    await deleteByColumnSafe('profile_extras', 'user_id', targetId);

    const { error: profileError } = await supabaseAdmin.from('profiles').delete().eq('id', targetId);
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(targetId);
    if (authError) {
      return NextResponse.json({ error: authError.message || 'Error deleting auth user' }, { status: 400 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
