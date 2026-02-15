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

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    // Intento 1: upsert en `profiles` con todos los campos esperados.
    // Si hay columnas que no existan, se strippean y luego caen al fallback `profile_extras`.
    const profilePayload: Record<string, any> = { id: user.id };
    const allowed = [
      'first_name',
      'last_name',
      'team',
      'chatbot_enabled',
      'phone',
      'birth_year',
      'category',
      'country',
      'region',
      'province',
      'default_association_id',
      'avatar_url',
    ];
    for (const key of allowed) {
      if (key in body) profilePayload[key] = (body as any)[key];
    }

    const isAnonymous = (user as any)?.user_metadata?.['is_anonymous'] === true;
    if (!isAnonymous) {
      const { data: existing } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      const existingRole = (existing as any)?.role;
      if (!existingRole) {
        profilePayload.role = 'usuario';
      }
    }

    const result = await upsertProfileWithRetry(profilePayload);
    if (!result.ok) {
      const msg = (result.error as any)?.message || 'Error guardando perfil';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Fallback: si se strippearon campos que el usuario envió, los guardamos en `profile_extras`.
    const extrasKeys = ['phone', 'region', 'province', 'avatar_url'] as const;
    const stripped = result.stripped || [];
    const needsExtras = extrasKeys.some((k) => k in body && stripped.includes(k));
    if (needsExtras) {
      const extras: Record<string, any> = { user_id: user.id };
      extrasKeys.forEach((k) => {
        if (k in body) extras[k] = (body as any)[k];
      });

      const exRes = await upsertProfileExtras(extras);
      if (!exRes.ok) {
        if ((exRes as any).missingTable) {
          return NextResponse.json(
            { error: 'Falta la tabla profile_extras en Supabase. Ejecuta scripts/profile-extras-setup.sql.' },
            { status: 503 }
          );
        }
        // Si falla por otra cosa, devolvemos error para no "hacer creer" que se guardó.
        return NextResponse.json({ error: (exRes as any).message || 'Error guardando perfil' }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true, stripped: result.stripped }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
