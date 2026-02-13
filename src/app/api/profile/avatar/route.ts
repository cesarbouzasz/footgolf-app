import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { Buffer } from 'node:buffer';

export const runtime = 'nodejs';

const AVATAR_BUCKET = process.env.NEXT_PUBLIC_AVATAR_BUCKET || 'assets';

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
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof (file as any).arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const contentType = (file as any).type || 'image/jpeg';
    if (typeof contentType === 'string' && !contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    const arrayBuffer = await (file as any).arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length <= 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 });
    }

    // Ruta estable para policies típicas y para buckets públicos
    const objectPath = `public/${user.id}/${Date.now()}.jpg`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(AVATAR_BUCKET)
      .upload(objectPath, buffer, {
        upsert: true,
        contentType: typeof contentType === 'string' ? contentType : 'image/jpeg',
        cacheControl: '3600',
      });

    if (uploadError) {
      const statusCode = (uploadError as any)?.statusCode;
      return NextResponse.json(
        { error: uploadError.message, statusCode },
        { status: 400 }
      );
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({ id: user.id, avatar_url: objectPath }, { onConflict: 'id' });

    if (profileError) {
      return NextResponse.json(
        { error: `Uploaded, but failed to persist profile: ${profileError.message}` },
        { status: 500 }
      );
    }

    const { data: publicData } = supabaseAdmin.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);

    return NextResponse.json({ path: objectPath, publicUrl: publicData.publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
