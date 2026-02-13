'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth-context';
import { FIFG_RULES_2025_TOPICS } from '@/lib/birdy/fifg-rules-2025-topics';
import { useLanguage } from '@/context/language-context';

type ChatMsg = {
  id: string;
  role: 'user' | 'bot';
  text: string;
};

type CourseRulesRow = {
  id: string;
  name: string;
  association_id: string | null;
  local_rules: string | null;
};

type EventRow = {
  id: string;
  name: string;
  event_date: string | null;
  location?: string | null;
  association_id?: string | null;
};

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value: string) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function clampText(value: string, maxLen: number) {
  const v = String(value || '');
  if (v.length <= maxLen) return v;
  return `${v.slice(0, Math.max(0, maxLen - 1))}…`;
}

function tokenize(norm: string) {
  return (norm || '')
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

function acronymFromTokens(tokens: string[]) {
  const letters = tokens
    .filter((t) => t.length >= 3)
    .map((t) => t[0])
    .join('');
  return letters;
}

function levenshtein(a: string, b: string) {
  const s = a || '';
  const t = b || '';
  if (s === t) return 0;
  if (!s) return t.length;
  if (!t) return s.length;
  const m = s.length;
  const n = t.length;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

function scoreFuzzy(queryNorm: string, targetNorm: string) {
  if (!queryNorm || !targetNorm) return 0;
  if (queryNorm === targetNorm) return 100;
  if (queryNorm.includes(targetNorm)) return 95;
  if (targetNorm.includes(queryNorm)) return 90;

  const qTokens = tokenize(queryNorm);
  const tTokens = tokenize(targetNorm);
  if (qTokens.length === 0 || tTokens.length === 0) return 0;

  let prefixHits = 0;
  let tokenHits = 0;
  for (const qt of qTokens) {
    const hit = tTokens.some((tt) => tt === qt);
    if (hit) tokenHits++;
    const prefix = tTokens.some((tt) => tt.startsWith(qt) && qt.length >= 2);
    if (prefix) prefixHits++;
  }

  const tokenScore = Math.round((tokenHits / qTokens.length) * 60);
  const prefixScore = Math.round((prefixHits / qTokens.length) * 25);

  const qAcr = acronymFromTokens(qTokens);
  const tAcr = acronymFromTokens(tTokens);
  const acrScore = qAcr && tAcr && (tAcr.startsWith(qAcr) || qAcr.startsWith(tAcr)) ? 15 : 0;

  let editScore = 0;
  if (queryNorm.length <= 24 && targetNorm.length <= 48) {
    const dist = levenshtein(queryNorm, targetNorm);
    const maxLen = Math.max(queryNorm.length, targetNorm.length);
    const sim = 1 - dist / Math.max(1, maxLen);
    editScore = Math.max(0, Math.round(sim * 20));
  }

  return Math.min(100, tokenScore + prefixScore + acrScore + editScore);
}

function parseDateOnly(dateStr: string) {
  // event_date typically comes as YYYY-MM-DD
  return new Date(`${dateStr}T00:00:00`);
}

function resolveLocale(language: string) {
  switch (language) {
    case 'EN':
      return 'en-US';
    case 'PT':
      return 'pt-PT';
    case 'FR':
      return 'fr-FR';
    case 'IT':
      return 'it-IT';
    case 'SV':
      return 'sv-SE';
    case 'SK':
      return 'sk-SK';
    case 'TR':
      return 'tr-TR';
    default:
      return 'es-ES';
  }
}

function formatDate(dateStr: string, locale: string) {
  try {
    const d = parseDateOnly(dateStr);
    return d.toLocaleDateString(locale, { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit' });
  } catch {
    return dateStr;
  }
}

function displayNameFromProfile(profile: any, user: any) {
  const first = String(profile?.first_name || '').trim();
  const last = String(profile?.last_name || '').trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;

  const email = String(profile?.email || user?.email || '').trim();
  if (email) {
    const at = email.indexOf('@');
    const local = at >= 0 ? email.slice(0, at) : email;
    const cleaned = local.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned) return cleaned;
  }

  return 'jugador';
}

export default function BirdyChat() {
  const { user, profile, isGuest, currentAssociationId } = useAuth();
  const { t, language } = useLanguage();
  const locale = resolveLocale(language);

  const chatbotAllowed = !!user && !isGuest && (profile?.chatbot_enabled ?? true) === true;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);

  const [courses, setCourses] = useState<CourseRulesRow[]>([]);
  const [coursesLoaded, setCoursesLoaded] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(false);

  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatbotAllowed) return;
    if (!open) return;
    setOpen(false);
  }, [chatbotAllowed, open]);

  useEffect(() => {
    if (!chatbotAllowed) return;
    if (!open) return;
    if (!user?.id) return;
    if (messages.length > 0) return;

    const sessionKey = `birdy_welcome_shown:v1:${user.id}`;
    const alreadyShown = typeof window !== 'undefined' && window.sessionStorage?.getItem(sessionKey) === '1';
    const name = displayNameFromProfile(profile, user);

    const text = alreadyShown
      ? t('birdy.welcome')
      : t('birdy.welcomeNamed').replace('{name}', name);

    setMessages([{ id: uid(), role: 'bot', text }]);
    if (!alreadyShown) {
      try {
        window.sessionStorage?.setItem(sessionKey, '1');
      } catch {
        // ignore
      }
    }
  }, [open, user?.id, profile, messages.length]);

  useEffect(() => {
    if (!chatbotAllowed) return;
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, messages.length]);

  const loadCoursesOnce = async () => {
    if (coursesLoaded || coursesLoading) return;
    setCoursesLoading(true);
    try {
      const q = supabase
        .from('courses')
        .select('id, name, association_id, local_rules')
        .order('name', { ascending: true });

      // If association is selected and not GLOBAL, scope rules to it.
      const assoc = String(currentAssociationId || '').trim();
      const isGlobal = assoc.toUpperCase() === 'GLOBAL' || !assoc;

      const res = isGlobal ? await q : await q.eq('association_id', assoc);
      const rows = ((res.data as any[]) || []).map((r) => ({
        id: String(r.id),
        name: String(r.name || ''),
        association_id: r.association_id ? String(r.association_id) : null,
        local_rules: r.local_rules ? String(r.local_rules) : null,
      }));

      setCourses(rows);
      setCoursesLoaded(true);
    } finally {
      setCoursesLoading(false);
    }
  };

  const loadUpcomingEventsOnce = async () => {
    if (eventsLoaded || eventsLoading) return;
    setEventsLoading(true);
    try {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const startIso = start.toISOString().slice(0, 10);

      const assoc = String(currentAssociationId || '').trim();
      const isGlobal = assoc.toUpperCase() === 'GLOBAL' || !assoc;

      const base = (includeAssociationId: boolean) =>
        supabase
          .from('events')
          .select(includeAssociationId ? 'id, name, event_date, location, association_id' : 'id, name, event_date, location')
          .gte('event_date', startIso)
          .order('event_date', { ascending: true })
          .limit(30);

      let res = isGlobal ? await base(true) : await base(true).eq('association_id', assoc);
      if (res.error) {
        // Fallback for DBs without events.association_id
        res = await base(false);
      }

      const rows = ((res.data as any[]) || []).map((r) => ({
        id: String(r.id),
        name: String(r.name || ''),
        event_date: r.event_date ? String(r.event_date) : null,
        location: r.location ? String(r.location) : null,
        association_id: r.association_id ? String(r.association_id) : null,
      }));

      setEvents(rows);
      setEventsLoaded(true);
    } finally {
      setEventsLoading(false);
    }
  };

  const coursesByNormName = useMemo(() => {
    const map = new Map<string, CourseRulesRow>();
    for (const c of courses) {
      const key = normalizeText(c.name);
      if (key) map.set(key, c);
    }
    return map;
  }, [courses]);

  const coursesWithNorm = useMemo(() => {
    return courses.map((c) => ({
      c,
      normName: normalizeText(c.name),
    }));
  }, [courses]);

  const findBestCourseMatch = (queryNorm: string) => {
    let best: { course: CourseRulesRow; score: number } | null = null;
    for (const item of coursesWithNorm) {
      const s = scoreFuzzy(queryNorm, item.normName);
      if (!best || s > best.score) best = { course: item.c, score: s };
    }
    if (!best) return null;
    if (best.score < 60) return null;
    return best;
  };

  const answer = async (rawText: string) => {
    const text = String(rawText || '').trim();
    const norm = normalizeText(text);
    if (!norm) return;

    const pushBot = (t: string) => {
      setMessages((prev) => [...prev, { id: uid(), role: 'bot', text: t }]);
    };

    const tryAi = async () => {
      try {
        const res = await fetch('/api/birdy/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, association_id: currentAssociationId || '' }),
        });
        const json = await res.json().catch(() => ({}));
        if (!json?.ok || !json?.text) return false;
        pushBot(String(json.text));
        return true;
      } catch {
        return false;
      }
    };

    const aiOk = await tryAi();
    if (aiOk) return;

    // Lightweight greetings
    if (/\b(hola|buenas|hey|ola)\b/.test(norm)) {
      pushBot(t('birdy.greeting'));
      return;
    }

    if (
      norm.includes('como funciona') ||
      norm.includes('como usar') ||
      norm.includes('guia') ||
      norm.includes('manual') ||
      norm.includes('tutorial') ||
      norm.includes('que puedo hacer') ||
      norm.includes('para que sirve') ||
      norm.includes('programa') ||
      norm.includes('app')
    ) {
      pushBot(t('birdy.appSummary'));
      return;
    }

    // General rules guidance (FIFG topics) even if user doesn't mention FIFG explicitly
    const topicHits = FIFG_RULES_2025_TOPICS
      .map((t) => {
        const count = t.keywords.reduce((acc, kw) => (norm.includes(normalizeText(kw)) ? acc + 1 : acc), 0);
        return { topic: t, count };
      })
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 2);

    const looksLikeRulesQuestion =
      topicHits.length > 0 ||
      norm.includes('fuera de limites') ||
      norm.includes('fuera de límites') ||
      /\bob\b/.test(norm) ||
      norm.includes('penal') ||
      norm.includes('interferencia') ||
      norm.includes('alivio') ||
      norm.includes('equipamiento') ||
      norm.includes('calzado') ||
      norm.includes('green') ||
      norm.includes('putt') ||
      norm.includes('balon') ||
      norm.includes('balón');

    if (looksLikeRulesQuestion && topicHits.length > 0) {
      const tLines = topicHits
        .map((h) => {
          const hint = h.topic.sectionHint ? `\nReferencia: ${h.topic.sectionHint}` : '';
          return `• ${h.topic.title}\n${h.topic.summaryEs}${hint}`;
        })
        .join('\n\n');

      pushBot(`${tLines}\n\nPDF: /footgolf-app_FIFG-Rules-of-the-Game-2025.pdf`);
      return;
    }

    // Event dates / calendar (only when user intent is clearly about dates)
    if (
      norm.includes('fecha') ||
      norm.includes('cuando') ||
      norm.includes('cuándo') ||
      norm.includes('dia') ||
      norm.includes('día') ||
      norm.includes('proxim') ||
      norm.includes('calend')
    ) {
      await loadUpcomingEventsOnce();
      const candidates = events.filter((e) => !!e.event_date);
      if (candidates.length === 0) {
        pushBot(t('birdy.noUpcomingEvents'));
        return;
      }

      // Try filter by event name mention
      const q = norm
        .replace(/\b(fecha|cuando|cuándo|dia|día|proxima|pr[oó]ximas?|calendario|evento|eventos|torneo|torneos|prueba|pruebas|de|del|la|el|las|los)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      let filtered = candidates;
      if (q.length >= 3) {
        filtered = candidates.filter((e) => normalizeText(e.name).includes(q));
      }

      const top = filtered.slice(0, 5);
      if (top.length === 0) {
        pushBot(t('birdy.noEventMatch'));
        return;
      }

      const lines = top
        .map((e) => {
          const d = e.event_date ? formatDate(e.event_date, locale) : t('birdy.noDate');
          const loc = (e.location || '').trim();
          return `- ${e.name}: ${d}${loc ? ` (${loc})` : ''}`;
        })
        .join('\n');

      pushBot(t('birdy.upcomingEvents').replace('{lines}', lines));
      return;
    }

    // Explicit FIFG requests (fallback prompt)
    if (norm.includes('fifg') || norm.includes('reglamento') || norm.includes('rules of the game') || norm.includes('reglas 2025')) {
      pushBot(t('birdy.fifgHelp'));
      return;
    }

    // Rules / course help
    if (norm.includes('regla') || norm.includes('local') || norm.includes('campo') || norm.includes('course')) {
      await loadCoursesOnce();

      // Try match by course name mention (exact substring first)
      let matched: CourseRulesRow | null = null;
      for (const [n, c] of coursesByNormName.entries()) {
        if (!n) continue;
        if (norm.includes(n)) {
          matched = c;
          break;
        }
      }

      // Fuzzy fallback: abbreviations / partial matches
      if (!matched) {
        const courseQuery = norm
          .replace(/\b(regla|reglas|local|locales|campo|course|del|de|la|el|las|los|para|en)\b/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const best = findBestCourseMatch(courseQuery || norm);
        if (best) matched = best.course;
      }

      if (matched) {
        const rules = (matched.local_rules || '').trim();
        if (!rules) {
          pushBot(t('birdy.noLocalRulesCourse').replace('{course}', matched.name));
          return;
        }
        pushBot(
          t('birdy.courseRules')
            .replace('{course}', matched.name)
            .replace('{rules}', clampText(rules, 1200))
            .replace('{link}', `/courses/${matched.id}`)
        );
        return;
      }

      const withRules = courses.filter((c) => (c.local_rules || '').trim().length > 0);
      if (withRules.length === 0) {
        pushBot(t('birdy.noLocalRulesAny'));
        return;
      }

      const top = withRules.slice(0, 8).map((c) => `- ${c.name}`).join('\n');
      pushBot(
        t('birdy.askCourseRules')
          .replace('{list}', top)
      );
      return;
    }

    // Teams
    if (norm.includes('equipo') || norm.includes('pareja') || norm.includes('equipos')) {
      pushBot(t('birdy.teamsHelp'));
      return;
    }

    // Registration
    if (norm.includes('inscri') || norm.includes('registr') || norm.includes('apuntar')) {
      pushBot(t('birdy.registrationHelp'));
      return;
    }

    // News
    if (norm.includes('noticia') || norm.includes('noticias') || norm.includes('news')) {
      pushBot(t('birdy.newsHelp'));
      return;
    }

    // Support
    if (norm.includes('incid') || norm.includes('soporte') || norm.includes('ayuda') || norm.includes('error')) {
      pushBot(t('birdy.supportHelp'));
      return;
    }

    pushBot(t('birdy.fallbackHelp'));
  };

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setMessages((prev) => [...prev, { id: uid(), role: 'user', text }]);
    await answer(text);
  };

  if (!chatbotAllowed) return null;

  return (
    <div style={{ position: 'fixed', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 60 }}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-14 w-14 rounded-full border border-sky-200 bg-white/90 hover:bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)] flex items-center justify-center"
          aria-label={t('birdy.openChat')}
        >
          <MessageCircle className="h-7 w-7 text-sky-500" />
        </button>
      ) : (
        <div className="w-[340px] max-w-[calc(100vw-32px)] rounded-3xl border border-white/70 bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.12)] overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <div>
              <div className="text-sm font-extrabold text-gray-900">Birdy</div>
              <div className="text-[11px] text-gray-600">{t('birdy.subtitle')}</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-gray-200 bg-white hover:bg-gray-50 p-2"
              aria-label={t('birdy.closeChat')}
            >
              <X className="h-4 w-4 text-gray-800" />
            </button>
          </div>

          <div ref={scrollRef} className="px-4 py-3 h-[360px] overflow-y-auto space-y-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === 'user'
                    ? 'ml-auto max-w-[85%] rounded-2xl bg-sky-600 text-white px-3 py-2 text-sm'
                    : 'mr-auto max-w-[85%] rounded-2xl bg-white border border-gray-200 text-gray-900 px-3 py-2 text-sm'
                }
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {m.text.startsWith('Reglas locales') && m.text.includes('/courses/') ? (
                  <>{m.text}</>
                ) : (
                  m.text
                )}
              </div>
            ))}

            {coursesLoading && (
              <div className="text-xs text-gray-600">{t('birdy.loadingRules')}</div>
            )}

            {eventsLoading && (
              <div className="text-xs text-gray-600">{t('birdy.loadingEvents')}</div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-gray-200 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={t('birdy.inputPlaceholder')}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
            />
            <button
              type="button"
              onClick={() => void send()}
              className="rounded-xl border-2 border-gold-600/80 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm px-3 py-2"
            >
              {t('birdy.send')}
            </button>
          </div>

          <div className="px-4 pb-3 text-[11px] text-gray-600">
            {t('birdy.tips')}
          </div>
        </div>
      )}

      {/* Quick link for rules page (kept minimal, only when open) */}
      {open && (
        <div className="mt-2 text-right">
          <Link href="/courses" className="text-xs font-semibold text-gray-700 underline">
            {t('birdy.viewCourses')}
          </Link>
        </div>
      )}
    </div>
  );
}
