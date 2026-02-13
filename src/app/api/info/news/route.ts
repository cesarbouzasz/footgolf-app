import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const associationId = String(req.nextUrl.searchParams.get('association_id') || '').trim();

    let query = supabaseAdmin
      .from('info_news')
      .select('id, association_id, title, body, image_url, created_at, associations(name)')
      .order('created_at', { ascending: false });

    if (associationId) query = query.eq('association_id', associationId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ news: [], error: error.message }, { status: 200 });

    const news = (data || []).map((row: any) => ({
      id: row.id,
      association_id: row.association_id,
      association_name: row?.associations?.name || null,
      title: row.title,
      body: row.body,
      image_url: row.image_url || null,
      created_at: row.created_at,
    }));

    return NextResponse.json({ news }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ news: [], error: e?.message || 'Server error' }, { status: 200 });
  }
}
