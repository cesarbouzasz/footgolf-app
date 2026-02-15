'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, DoorOpen, Search, Trophy, Users } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import AssociationSelector from '@/components/AssociationSelector';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/language-context';

interface PlayerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  category?: string | null;
  team?: string | null;
  association_id?: string | null;
  events_played_last_year?: number | null;
}

function shortId(id: string) {
  const clean = (id || '').replace(/-/g, '');
  return clean ? clean.slice(0, 8).toUpperCase() : '—';
}

export default function AdminPlayersPage() {
  const { user, profile, loading, isAdmin, currentAssociationId } = useAuth();
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [genCount, setGenCount] = useState('12');
  const [genBusy, setGenBusy] = useState(false);
  const [genStatus, setGenStatus] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('premium-admin-bg');
    return () => document.body.classList.remove('premium-admin-bg');
  }, []);

  const loadPlayers = async (activeFlag?: { current: boolean }) => {
    if (!isAdmin) return;
    setPlayersLoading(true);

    const params = new URLSearchParams();
    if (currentAssociationId) params.set('association_id', currentAssociationId);

    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const res = await fetch(`/api/players?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const json = await res.json().catch(() => ({}));
    const data = (json?.players as PlayerRow[]) || [];

    if (activeFlag?.current === false) return;
    setPlayers(data);
    setPlayersLoading(false);
  };

  useEffect(() => {
    const active = { current: true };
    void loadPlayers(active);
    return () => {
      active.current = false;
    };
  }, [currentAssociationId, isAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim().toLowerCase();
      const last = (p.last_name || '').toLowerCase();
      const team = (p.team || '').toLowerCase();
      const category = (p.category || '').toLowerCase();
      const idShort = shortId(p.id).toLowerCase();
      return (
        name.includes(q) ||
        last.includes(q) ||
        team.includes(q) ||
        category.includes(q) ||
        idShort.includes(q)
      );
    });
  }, [players, search]);

  const onGenerateRandomPlayers = async () => {
    setGenStatus(null);
    const count = Number.parseInt(genCount, 10);
    if (!currentAssociationId) {
      setGenStatus(t('adminPlayers.selectAssociation'));
      return;
    }
    if (!Number.isFinite(count) || count < 1 || count > 50) {
      setGenStatus(t('adminPlayers.invalidCount'));
      return;
    }

    setGenBusy(true);
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;

      const res = await fetch('/api/admin/random-players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ count, association_id: currentAssociationId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenStatus(String(json?.error || t('adminPlayers.generateError')));
        return;
      }

      const created = Number(json?.created || 0);
      setGenStatus(t('adminPlayers.generated').replace('{count}', String(created)));
      await loadPlayers();
    } catch (e: any) {
      setGenStatus(e?.message || t('adminPlayers.generateError'));
    } finally {
      setGenBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-700">{t('common.loading')}</div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-800">
          {t('common.noSession')}{' '}
          <Link href="/login" className="text-blue-600">{t('common.login')}</Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-700">{t('admin.noAccess')}</div>
      </div>
    );
  }

  return (
    <>
      <div className="premium-particles" />
      <div className="min-h-screen px-4 py-6 sm:px-6">
        <header className="max-w-5xl mx-auto mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="premium-back-btn" aria-label={t('common.back')}>
              <ArrowLeft className="h-4 w-4" />
              <DoorOpen className="h-4 w-4" />
            </Link>
            <div>
              <div className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                <Users className="h-5 w-5 text-gray-900" />
                {t('adminPlayers.title')}
              </div>
              <div className="text-xs text-gray-700">{t('adminPlayers.subtitle')}</div>
            </div>
          </div>
          <AssociationSelector />
        </header>

        <main className="max-w-5xl mx-auto">
          <section className="premium-card w-full">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="text-sm font-extrabold text-gray-900">Directorio</div>
              <div className="relative w-full sm:w-[420px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('adminPlayers.searchPlaceholder')}
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm bg-white/80"
                />
              </div>
            </div>

            <div className="border border-white/70 rounded-2xl bg-white/90 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-[920px] w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-white/80">
                      <th className="text-left font-semibold px-4 py-3">ID</th>
                      <th className="text-left font-semibold px-4 py-3">{t('profilePage.fields.firstName')}</th>
                      <th className="text-left font-semibold px-4 py-3">{t('profilePage.fields.lastName')}</th>
                      <th className="text-left font-semibold px-4 py-3">{t('profilePage.fields.category')}</th>
                      <th className="text-left font-semibold px-4 py-3">{t('profilePage.fields.team')}</th>
                      <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <Trophy className="h-4 w-4 text-gray-500" />
                          {t('adminPlayers.eventsPlayed')}
                        </span>
                      </th>
                      <th className="text-left font-semibold px-4 py-3">{t('common.edit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playersLoading ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-gray-500">{t('common.loading')}</td>
                      </tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-gray-500">{t('adminPlayers.empty')}</td>
                      </tr>
                    ) : (
                      filtered.map((p) => (
                        <tr key={p.id} className="border-b border-gray-100/80 hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-gray-800">
                              {shortId(p.id)}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{p.first_name || '—'}</td>
                          <td className="px-4 py-3">{p.last_name || '—'}</td>
                          <td className="px-4 py-3">{p.category || '—'}</td>
                          <td className="px-4 py-3">{p.team || t('players.noTeam')}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-gray-800">
                              {Number(p.events_played_last_year || 0)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Link href={`/admin/jugadores/${p.id}`} className="text-xs font-semibold text-blue-700 hover:text-blue-900">
                              {t('common.edit')}
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-gray-200 bg-white/90 p-4">
              <div className="text-sm font-extrabold text-gray-900">{t('adminPlayers.generateTitle')}</div>
              <div className="text-xs text-gray-600 mt-1">{t('adminPlayers.generateSubtitle')}</div>
              <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <input
                  value={genCount}
                  onChange={(e) => setGenCount(e.target.value)}
                  className="w-full sm:w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                  placeholder={t('adminPlayers.countPlaceholder')}
                />
                <button
                  type="button"
                  onClick={() => void onGenerateRandomPlayers()}
                  disabled={genBusy || !currentAssociationId}
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white disabled:opacity-50"
                >
                  {genBusy ? t('adminPlayers.generating') : t('adminPlayers.generate')}
                </button>
                {genStatus && <div className="text-xs text-gray-700">{genStatus}</div>}
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
