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

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 });

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, association_id, default_association_id')
      .eq('id', user.id)
      .maybeSingle();

    const associationId = (profile as any)?.default_association_id || (profile as any)?.association_id || null;

    const { error } = await supabaseAdmin.from('admin_messages').insert({
      association_id: associationId,
      created_by: user.id,
      created_by_email: user.email || null,
      message,
      is_read: false,
      created_at: new Date().toISOString(),
    });

    if (error) {
      const msg = (error as any)?.message || 'Error creando incidencia';
      // Si falta la tabla, devolvemos un error claro.
      if (/relation\s+"admin_messages"\s+does\s+not\s+exist/i.test(msg)) {
        return NextResponse.json(
          { error: 'Falta la tabla admin_messages en Supabase. Ejecuta scripts/admin-messages-setup.sql.' },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
