'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, DoorOpen } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import AssociationSelector from '@/components/AssociationSelector';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/language-context';

interface PlayerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  category?: string | null;
  birth_year?: number | null;
  team?: string | null;
  association_id?: string | null;
}

export default function PlayersPage() {
  const { currentAssociationId } = useAuth();
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (currentAssociationId) params.set('association_id', currentAssociationId);

      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;

      const res = await fetch(`/api/players?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json().catch(() => ({}));
      const data = (json?.players as PlayerRow[]) || [];

      if (active) {
        setPlayers(data);
        setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [currentAssociationId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim().toLowerCase();
      const team = (p.team || '').toLowerCase();
      const category = (p.category || '').toLowerCase();
      return name.includes(q) || team.includes(q) || category.includes(q);
    });
  }, [players, search]);

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6">
      <header className="max-w-3xl mx-auto mb-4 flex items-center justify-between">
        <Link href="/dashboard" className="premium-back-btn" aria-label="Atras">
          <ArrowLeft className="h-4 w-4" />
          <DoorOpen className="h-4 w-4" />
        </Link>
        <AssociationSelector />
        <div className="w-12"></div>
      </header>

      <main className="max-w-3xl mx-auto bg-white/90 rounded-3xl border border-white/70 p-4 sm:p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
        <h1 className="text-lg font-semibold mb-3">{t('players.title')}</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('players.searchPlaceholder')}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-4 bg-white/80"
        />

        <div className="border border-white/70 rounded-2xl bg-white/90 overflow-hidden shadow-sm">
          <div className="grid grid-cols-4 gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
            <div>{t('players.name')}</div>
            <div>{t('players.category')}</div>
            <div>{t('players.birthYear')}</div>
            <div>{t('players.team')}</div>
          </div>

          {loading ? (
            <div className="px-3 py-4 text-sm text-gray-500">{t('common.loading')}</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-gray-500">{t('players.empty')}</div>
          ) : (
            filtered.map((p) => (
              <div key={p.id} className="grid grid-cols-4 gap-2 px-3 py-2 text-sm border-b border-gray-100/80">
                <div>{[p.first_name, p.last_name].filter(Boolean).join(' ') || t('common.notAvailable')}</div>
                <div>{p.category || t('common.notAvailable')}</div>
                <div>{p.birth_year || t('common.notAvailable')}</div>
                <div>{p.team || t('players.noTeam')}</div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
