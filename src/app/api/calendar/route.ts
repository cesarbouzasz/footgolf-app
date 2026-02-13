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

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      return NextResponse.json({ items: [] }, { status: 401 });
    }

    const start = req.nextUrl.searchParams.get('start') || '';
    const end = req.nextUrl.searchParams.get('end') || '';
    if (!isIsoDate(start) || !isIsoDate(end)) {
      return NextResponse.json({ items: [], error: 'Invalid start/end' }, { status: 400 });
    }

    const associationParamRaw = req.nextUrl.searchParams.get('association_id');
    const associationParam = associationParamRaw ? String(associationParamRaw) : null;
    const isGlobal = (associationParam || '').trim().toUpperCase() === 'GLOBAL';

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('association_id, default_association_id')
      .eq('id', user.id)
      .single();

    const fallbackAssociationId =
      (profile as any)?.default_association_id || (profile as any)?.association_id || null;

    const associationId = isGlobal ? null : (associationParam || fallbackAssociationId);
    if (!isGlobal && !associationId) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    // NOTE: Some DBs may not have events.association_id.
    // We try with association_id first; if it errors, we retry without.
    const baseEventsQuery = (includeAssociationId: boolean) =>
      supabaseAdmin
        .from('events')
        .select(
          includeAssociationId
            ? 'id, name, event_date, competition_mode, location, description, association_id, config'
            : 'id, name, event_date, competition_mode, location, description, config'
        )
        .gte('event_date', start)
        .lte('event_date', end)
        .order('event_date', { ascending: true });

    const eventsQueryWithAssociation = () => {
      if (!associationId) return baseEventsQuery(true);
      return baseEventsQuery(true).eq('association_id', associationId);
    };

    const announcementsQueryBase = supabaseAdmin
      .from('calendar_announcements')
      .select('id, association_id, date, category, title, description, updated_at')
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true });

    const announcementsQuery = associationId
      ? announcementsQueryBase.eq('association_id', associationId)
      : announcementsQueryBase;

    let eventsData: any[] = [];
    let annData: any[] = [];
    let errorMessage: string | null = null;

    const [eventsRes, annRes] = await Promise.all([eventsQueryWithAssociation(), announcementsQuery]);

    if (annRes.error) {
      errorMessage = annRes.error.message;
    } else {
      annData = (annRes.data as any[]) || [];
    }

    if (eventsRes.error) {
      const msg = eventsRes.error.message || '';
      const looksLikeMissingAssociationColumn =
        msg.toLowerCase().includes('association_id') && msg.toLowerCase().includes('does not exist');

      if (looksLikeMissingAssociationColumn) {
        // Retry without selecting/filtering by association_id
        const fallbackRes = await baseEventsQuery(false);
        if (fallbackRes.error) errorMessage = errorMessage || fallbackRes.error.message;
        else eventsData = (fallbackRes.data as any[]) || [];
      } else {
        errorMessage = errorMessage || msg;
      }
    } else {
      eventsData = (eventsRes.data as any[]) || [];
    }

    const items = [
      ...(((eventsData as any[]) || [])
        .map((row) => {
          const dateValue = row.event_date ?? row.date;
          if (!dateValue) return null;
          const derivedCategory = (row.config?.category as any) ?? 'especial';
          return {
            kind: 'tournament',
            id: String(row.id),
            name: String(row.name || ''),
            date: String(dateValue),
            end_date: row?.config?.event_end_date || null,
            category: derivedCategory,
            format: row.competition_mode ?? null,
            location: row.location ?? null,
            description: row.description ?? null,
            association_id: row.association_id ?? null,
          };
        })
        .filter(Boolean) as any[]),
      ...(() => {
        const mapped = (((annData as any[]) || [])
          .map((row) => {
            const dateValue = row.date;
            if (!dateValue) return null;
            const category = (row.category as any) || 'especial';
            return {
              kind: 'announcement',
              id: `ann_${row.id}`,
              name: String(row.title || ''),
              date: String(dateValue),
              category,
              format: null,
              location: null,
              description: row.description ?? null,
              association_id: row.association_id ?? null,
            };
          })
          .filter(Boolean) as any[]);

        // In GLOBAL view we aggregate all associations; announcements applied to all
        // would appear repeated N times (one per association). Deduplicate by content.
        if (!isGlobal) return mapped;

        const seen = new Set<string>();
        const deduped: any[] = [];
        for (const it of mapped) {
          const key = `${String(it.date).slice(0, 10)}|${it.category}|${it.name}|${it.description || ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push({ ...it, association_id: null, id: `ann_global_${key}` });
        }
        return deduped;
      })(),
    ];

    return NextResponse.json({ items, error: errorMessage }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ items: [], error: e?.message || 'Server error' }, { status: 200 });
  }
}

