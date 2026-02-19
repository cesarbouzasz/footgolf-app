import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

const buildContext = async (associationId: string | null) => {
  const today = new Date();
  const startIso = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString().slice(0, 10);

  let events: Array<Record<string, any>> = [];
  let announcements: Array<Record<string, any>> = [];
  try {
    let query = supabaseAdmin
      .from('events')
      .select('id, name, event_date, association_id')
      .gte('event_date', startIso)
      .order('event_date', { ascending: true })
      .limit(8);

    if (associationId && associationId.toUpperCase() !== 'GLOBAL') {
      query = query.or(`association_id.is.null,association_id.eq.${associationId}`);
    }

    const { data } = await query;
    events = (data || []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name || ''),
      event_date: row.event_date ? String(row.event_date) : null,
      location: null,
    }));
  } catch {
    events = [];
  }

  try {
    let query = supabaseAdmin
      .from('calendar_announcements')
      .select('id, title, date, category, association_id')
      .gte('date', startIso)
      .order('date', { ascending: true })
      .limit(8);

    if (associationId && associationId.toUpperCase() !== 'GLOBAL') {
      query = query.or(`association_id.is.null,association_id.eq.${associationId}`);
    }

    const { data } = await query;
    announcements = (data || []).map((row: any) => ({
      id: String(row.id),
      name: String(row.title || ''),
      event_date: row.date ? String(row.date) : null,
      location: null,
      category: row.category ? String(row.category) : null,
    }));
  } catch {
    announcements = [];
  }

  let rankings: Array<Record<string, any>> = [];
  try {
    let query = supabaseAdmin
      .from('rankings')
      .select('position, total_strokes, vs_par_score, holes_played, player_id, profiles(first_name,last_name)')
      .order('position', { ascending: true })
      .limit(10);

    if (associationId) {
      query = query.eq('association_id', associationId);
    }

    const { data } = await query;
    rankings = (data || []).map((row: any) => ({
      position: row.position,
      player: `${row?.profiles?.first_name || ''} ${row?.profiles?.last_name || ''}`.trim() || String(row.player_id || ''),
      total_strokes: row.total_strokes,
      vs_par_score: row.vs_par_score,
      holes_played: row.holes_played,
    }));
  } catch {
    rankings = [];
  }

  const appHints = [
    'Noticias: /info/noticias',
    'Calendario de eventos: /events/calendar',
    'Listado de eventos: /events',
    'Campos: /courses',
    'Perfil: /profile',
  ];

  return { events, announcements, rankings, appHints };
};

export async function POST(req: NextRequest) {
  try {
    if (!GROQ_API_KEY) {
      return NextResponse.json({ ok: false, error: 'Missing GROQ_API_KEY' }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const message = String(body?.message || '').trim();
    const associationId = String(body?.association_id || '').trim() || null;

    if (!message) {
      return NextResponse.json({ ok: false, error: 'Missing message' }, { status: 400 });
    }

    const ctx = await buildContext(associationId);

    const system = [
      'Eres Birdy, asistente de la app FootGolf Total.',
      'Responde en espanol claro y conciso.',
      'Solo usa la informacion del contexto. Si no esta, di que no tienes el dato y guia al usuario a la pantalla correcta.',
      'No inventes fechas, rankings ni resultados.',
      'Si preguntan por noticias, indica /info/noticias.',
    ].join(' ');

    const combinedEvents = [...ctx.events, ...ctx.announcements].slice(0, 12);

    const contextText = [
      `Eventos proximos: ${combinedEvents.length ? combinedEvents.map((e) => `${e.name} (${e.event_date || 'sin fecha'}${e.location ? `, ${e.location}` : ''})`).join(' | ') : 'sin datos'}`,
      `Rankings: ${ctx.rankings.length ? ctx.rankings.map((r) => `#${r.position} ${r.player} (${r.vs_par_score || 's/p'})`).join(' | ') : 'sin datos'}`,
      `Rutas utiles: ${ctx.appHints.join(' | ')}`,
    ].join('\n');

    const payload = {
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `${contextText}\n\nPregunta: ${message}` },
      ],
      temperature: 0.2,
      max_tokens: 350,
    };

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Groq error ${res.status}` }, { status: 200 });
    }

    const data = await res.json().catch(() => null);
    const text = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!text) {
      return NextResponse.json({ ok: false, error: 'Empty response' }, { status: 200 });
    }

    return NextResponse.json({ ok: true, text }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 200 });
  }
}