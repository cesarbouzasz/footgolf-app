'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, DoorOpen, Search, Users } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import AssociationSelector from '@/components/AssociationSelector';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/language-context';

interface PlayerRow {
  id: string;
  player_display_id?: number | null;
  first_name: string | null;
  last_name: string | null;
  category?: string | null;
  province?: string | null;
  team?: string | null;
  pair_names?: string[];
  association_id?: string | null;
  events_played_last_year?: number | null;
}

type PairMember = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  category?: string | null;
};

type PairRow = {
  id: string;
  association_id: string;
  name: string;
  members: PairMember[];
};

type TeamRow = {
  id: string;
  association_id: string;
  name: string;
  max_players: number;
};

type GroupEventStat = {
  event_id: string;
  event_name: string;
  event_date: string | null;
  points: number;
  position: number | null;
};

type GroupStats = {
  id: string;
  name: string;
  members: PairMember[];
  events: GroupEventStat[];
  total_points: number;
};

export default function AdminPlayersPage() {
  const { user, profile, loading, isAdmin, currentAssociationId } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'individual' | 'parejas' | 'equipos'>('individual');
  const [search, setSearch] = useState('');
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);

  const [pairs, setPairs] = useState<PairRow[]>([]);
  const [pairsLoading, setPairsLoading] = useState(false);
  const [pairSearch, setPairSearch] = useState('');
  const [pairName, setPairName] = useState('');
  const [pairMemberAId, setPairMemberAId] = useState('');
  const [pairMemberBId, setPairMemberBId] = useState('');
  const [pairEditId, setPairEditId] = useState<string | null>(null);
  const [pairEditName, setPairEditName] = useState('');
  const [pairEditMemberAId, setPairEditMemberAId] = useState('');
  const [pairEditMemberBId, setPairEditMemberBId] = useState('');
  const [pairBusy, setPairBusy] = useState(false);
  const [expandedPairId, setExpandedPairId] = useState<string | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamMaxRaw, setTeamMaxRaw] = useState('2');
  const [teamEditName, setTeamEditName] = useState('');
  const [teamEditMaxRaw, setTeamEditMaxRaw] = useState('');
  const [teamPlayerSearch, setTeamPlayerSearch] = useState('');
  const [teamPlayerCategory, setTeamPlayerCategory] = useState('');
  const [teamPlayerProvince, setTeamPlayerProvince] = useState('');
  const [teamBusy, setTeamBusy] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);

  const [pairStats, setPairStats] = useState<Record<string, GroupStats>>({});
  const [teamStats, setTeamStats] = useState<Record<string, GroupStats>>({});
  const [statsLoading, setStatsLoading] = useState(false);

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

  const loadPairs = async (activeFlag?: { current: boolean }) => {
    if (!isAdmin) return;
    if (!currentAssociationId) {
      if (activeFlag?.current !== false) setPairs([]);
      return;
    }
    setPairsLoading(true);

    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;
    const params = new URLSearchParams();
    params.set('association_id', currentAssociationId);

    const res = await fetch(`/api/pairs?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const json = await res.json().catch(() => ({}));
    const rows = (json?.pairs as PairRow[]) || [];

    if (activeFlag?.current === false) return;
    setPairs(rows);
    setPairsLoading(false);
  };

  const loadTeams = async (activeFlag?: { current: boolean }) => {
    if (!isAdmin) return;
    if (!currentAssociationId) {
      if (activeFlag?.current !== false) {
        setTeams([]);
        setSelectedTeamId('');
      }
      return;
    }

    setTeamsLoading(true);
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;
    const params = new URLSearchParams();
    params.set('association_id', currentAssociationId);

    const res = await fetch(`/api/teams?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const json = await res.json().catch(() => ({}));
    const rows = (json?.teams as TeamRow[]) || [];

    if (activeFlag?.current === false) return;
    setTeams(rows);
    setTeamsLoading(false);

    if (rows.length > 0) {
      setSelectedTeamId((prev) => (prev && rows.some((t) => t.id === prev) ? prev : rows[0].id));
    } else {
      setSelectedTeamId('');
    }
  };

  const loadGroupStats = async (groupType: 'parejas' | 'equipos', activeFlag?: { current: boolean }) => {
    if (!isAdmin || !currentAssociationId) return;
    setStatsLoading(true);

    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;
    const params = new URLSearchParams();
    params.set('association_id', currentAssociationId);
    params.set('group_type', groupType);

    const res = await fetch(`/api/admin/group-stats?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const json = await res.json().catch(() => ({}));
    const groups = (json?.groups as GroupStats[]) || [];
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]));

    if (activeFlag?.current === false) return;
    if (groupType === 'parejas') {
      setPairStats(byId);
    } else {
      setTeamStats(byId);
    }
    setStatsLoading(false);
  };

  useEffect(() => {
    if (activeTab !== 'parejas') return;
    const active = { current: true };
    void loadPairs(active);
    void loadGroupStats('parejas', active);
    return () => {
      active.current = false;
    };
  }, [activeTab, currentAssociationId, isAdmin]);

  useEffect(() => {
    if (activeTab !== 'equipos') return;
    const active = { current: true };
    void loadTeams(active);
    void loadGroupStats('equipos', active);
    return () => {
      active.current = false;
    };
  }, [activeTab, currentAssociationId, isAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim().toLowerCase();
      const last = (p.last_name || '').toLowerCase();
      const category = (p.category || '').toLowerCase();
      const province = (p.province || '').toLowerCase();
      const displayId = typeof p.player_display_id === 'number' ? String(p.player_display_id) : '';
      return (
        name.includes(q) ||
        last.includes(q) ||
        category.includes(q) ||
        province.includes(q) ||
        displayId.includes(q)
      );
    });
  }, [players, search]);

  const playerOptions = useMemo(() => {
    const list = [...players];
    list.sort((a, b) => {
      const al = String(a.last_name || '').localeCompare(String(b.last_name || ''), 'es');
      if (al !== 0) return al;
      return String(a.first_name || '').localeCompare(String(b.first_name || ''), 'es');
    });
    return list;
  }, [players]);

  const filteredPairs = useMemo(() => {
    const q = pairSearch.trim().toLowerCase();
    if (!q) return pairs;
    return pairs.filter((pair) => {
      const name = String(pair.name || '').toLowerCase();
      const members = (pair.members || [])
        .map((m) => `${m.first_name || ''} ${m.last_name || ''}`.trim().toLowerCase())
        .join(' ');
      return name.includes(q) || members.includes(q);
    });
  }, [pairSearch, pairs]);

  const filteredTeams = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((team) => {
      if (String(team.name || '').toLowerCase().includes(q)) return true;
      const members = players
        .filter((p) => String(p.team || '') === String(team.name || ''))
        .map((p) => `${p.first_name || ''} ${p.last_name || ''}`.trim().toLowerCase())
        .join(' ');
      return members.includes(q);
    });
  }, [teamSearch, teams, players]);

  const selectedTeam = useMemo(() => teams.find((t) => t.id === selectedTeamId) || null, [teams, selectedTeamId]);
  const selectedTeamName = selectedTeam?.name || '';
  const teamMembers = useMemo(() => {
    if (!selectedTeamName) return [] as PlayerRow[];
    return players.filter((p) => String(p.team || '') === selectedTeamName);
  }, [players, selectedTeamName]);

  const teamPlayerCategoryOptions = useMemo(() => {
    const base = ['Masculino', 'Femenino', 'Senior', 'Senior+', 'Junior'];
    const fromData = Array.from(new Set(players.map((p) => String(p.category || '').trim()).filter(Boolean)));
    const extras = fromData
      .filter((value) => !base.some((fixed) => fixed.toLowerCase() === value.toLowerCase()))
      .sort((a, b) => a.localeCompare(b, 'es'));
    return [...base, ...extras];
  }, [players]);

  const teamPlayerProvinceOptions = useMemo(() => {
    return Array.from(new Set(players.map((p) => String(p.province || '').trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'es')
    );
  }, [players]);

  const filteredTeamPlayers = useMemo(() => {
    const q = teamPlayerSearch.trim().toLowerCase();
    return players.filter((p) => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim().toLowerCase();
      const category = String(p.category || '').toLowerCase();
      const province = String(p.province || '').toLowerCase();
      const matchesSearch = !q || name.includes(q) || category.includes(q) || province.includes(q) || p.id.toLowerCase().includes(q);
      const matchesCategory = !teamPlayerCategory || category === teamPlayerCategory.toLowerCase();
      const matchesProvince = !teamPlayerProvince || province === teamPlayerProvince.toLowerCase();
      return matchesSearch && matchesCategory && matchesProvince;
    });
  }, [players, teamPlayerSearch, teamPlayerCategory, teamPlayerProvince]);


  const createPair = async () => {
    setPairError(null);
    if (!currentAssociationId) {
      setPairError(t('adminPlayers.selectAssociation'));
      return;
    }
    if (!pairName.trim()) return;
    if (!pairMemberAId || !pairMemberBId || pairMemberAId === pairMemberBId) return;

    setPairBusy(true);
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const res = await fetch('/api/pairs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        association_id: currentAssociationId,
        name: pairName.trim(),
        player_ids: [pairMemberAId, pairMemberBId],
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      setPairError(String(json?.error || t('adminPlayers.pairCreateError')));
      setPairBusy(false);
      return;
    }

    setPairName('');
    setPairMemberAId('');
    setPairMemberBId('');
    setPairError(null);
    await loadPairs();
    await loadGroupStats('parejas');
    setPairBusy(false);
  };

  const startEditPair = (pair: PairRow) => {
    setPairEditId(pair.id);
    setPairEditName(pair.name || '');
    const memberIds = (pair.members || []).map((m) => m.id).filter(Boolean);
    setPairEditMemberAId(memberIds[0] || '');
    setPairEditMemberBId(memberIds[1] || '');
  };

  const cancelEditPair = () => {
    setPairEditId(null);
    setPairEditName('');
    setPairEditMemberAId('');
    setPairEditMemberBId('');
  };

  const savePairEdit = async () => {
    if (!pairEditId || !currentAssociationId) return;
    if (!pairEditName.trim()) return;
    if (!pairEditMemberAId || !pairEditMemberBId || pairEditMemberAId === pairEditMemberBId) return;

    setPairBusy(true);
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const res = await fetch('/api/pairs', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        pair_id: pairEditId,
        name: pairEditName.trim(),
        player_ids: [pairEditMemberAId, pairEditMemberBId],
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      setPairBusy(false);
      return;
    }

    cancelEditPair();
    await loadPairs();
    await loadGroupStats('parejas');
    setPairBusy(false);
  };

  const deletePair = async (pairId: string) => {
    if (!pairId || !currentAssociationId) return;
    setPairBusy(true);

    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;
    const res = await fetch('/api/pairs', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ pair_id: pairId }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      setPairBusy(false);
      return;
    }

    await loadPairs();
    await loadGroupStats('parejas');
    setPairBusy(false);
  };

  const createTeam = async () => {
    setTeamError(null);
    if (!currentAssociationId) {
      setTeamError(t('adminPlayers.selectAssociation'));
      return;
    }
    if (!teamName.trim()) return;
    const maxPlayers = Number.parseInt(teamMaxRaw, 10);
    if (!Number.isFinite(maxPlayers) || maxPlayers < 1 || maxPlayers > 50) return;

    setTeamBusy(true);
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const res = await fetch('/api/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        association_id: currentAssociationId,
        name: teamName.trim(),
        max_players: maxPlayers,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      setTeamError(String(json?.error || t('adminTeams.createError')));
      setTeamBusy(false);
      return;
    }

    setTeamName('');
    setTeamMaxRaw('2');
    setTeamError(null);
    await loadTeams();
    await loadGroupStats('equipos');
    setTeamBusy(false);
  };

  const startEditTeam = () => {
    if (!selectedTeam) return;
    setTeamEditName(selectedTeam.name || '');
    setTeamEditMaxRaw(String(selectedTeam.max_players || ''));
  };

  const saveTeamEdit = async () => {
    if (!selectedTeam || !currentAssociationId) return;
    if (!teamEditName.trim()) return;
    const maxPlayers = Number.parseInt(teamEditMaxRaw, 10);
    if (!Number.isFinite(maxPlayers) || maxPlayers < 1 || maxPlayers > 50) return;

    setTeamBusy(true);
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const res = await fetch('/api/teams', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        team_id: selectedTeam.id,
        name: teamEditName.trim(),
        max_players: maxPlayers,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      setTeamBusy(false);
      return;
    }

    await loadTeams();
    await loadPlayers();
    await loadGroupStats('equipos');
    setTeamBusy(false);
  };

  const deleteTeam = async () => {
    if (!selectedTeam || !currentAssociationId) return;
    setTeamBusy(true);
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const res = await fetch('/api/teams', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ association_id: currentAssociationId, team_id: selectedTeam.id }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      setTeamBusy(false);
      return;
    }

    setSelectedTeamId('');
    await loadTeams();
    await loadPlayers();
    await loadGroupStats('equipos');
    setTeamBusy(false);
  };

  const assignPlayerToTeam = async (playerId: string) => {
    if (!selectedTeam || !playerId) return;
    setTeamBusy(true);
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const res = await fetch('/api/teams/assign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ team_id: selectedTeam.id, player_id: playerId }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      setTeamBusy(false);
      return;
    }

    await loadPlayers();
    await loadGroupStats('equipos');
    setTeamBusy(false);
  };

  const removePlayerFromTeam = async (playerId: string) => {
    if (!playerId) return;
    setTeamBusy(true);
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const res = await fetch('/api/teams/remove', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ player_id: playerId }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      setTeamBusy(false);
      return;
    }

    await loadPlayers();
    await loadGroupStats('equipos');
    setTeamBusy(false);
  };

  useEffect(() => {
    if (!selectedTeam) {
      setTeamEditName('');
      setTeamEditMaxRaw('');
      return;
    }
    setTeamEditName(selectedTeam.name || '');
    setTeamEditMaxRaw(String(selectedTeam.max_players || ''));
  }, [selectedTeam]);

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
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={() => setActiveTab('individual')}
                className={activeTab === 'individual'
                  ? 'px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-600 text-white'
                  : 'px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-gray-200 text-gray-700'}
              >
                {t('adminPlayers.tabIndividual')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('parejas')}
                className={activeTab === 'parejas'
                  ? 'px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-600 text-white'
                  : 'px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-gray-200 text-gray-700'}
              >
                {t('adminPlayers.tabPairs')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('equipos')}
                className={activeTab === 'equipos'
                  ? 'px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-600 text-white'
                  : 'px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-gray-200 text-gray-700'}
              >
                {t('adminPlayers.tabTeams')}
              </button>
            </div>

            {activeTab === 'individual' && (
              <div className="space-y-4">
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
                <table className="min-w-[860px] w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200 bg-white/80">
                      <th className="text-left font-semibold px-4 py-3">ID</th>
                      <th className="text-left font-semibold px-4 py-3">{t('profilePage.fields.firstName')}</th>
                      <th className="text-left font-semibold px-4 py-3">{t('profilePage.fields.lastName')}</th>
                      <th className="text-left font-semibold px-4 py-3">{t('profilePage.fields.category')}</th>
                      <th className="text-left font-semibold px-4 py-3">{t('profilePage.fields.province')}</th>
                      <th className="text-left font-semibold px-4 py-3">Grupo</th>
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
                              {typeof p.player_display_id === 'number' ? p.player_display_id : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{p.first_name || '—'}</td>
                          <td className="px-4 py-3">{p.last_name || '—'}</td>
                          <td className="px-4 py-3">{p.category || '—'}</td>
                          <td className="px-4 py-3">{p.province || '—'}</td>
                          <td className="px-4 py-3">
                            <details className="group w-full max-w-[220px]">
                              <summary className="cursor-pointer list-none inline-flex items-center rounded-xl border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-gray-800">
                                {((p.pair_names?.length || 0) > 0) && (p.team || '').trim()
                                  ? 'Pareja + Equipo'
                                  : ((p.pair_names?.length || 0) > 0)
                                    ? 'Pareja'
                                    : (p.team || '').trim()
                                      ? 'Equipo'
                                      : 'Sin grupo'}
                              </summary>
                              <div className="mt-2 rounded-xl border border-gray-200 bg-white p-2 text-xs text-gray-700 space-y-1">
                                <div><span className="font-semibold">Pareja:</span> {(p.pair_names?.length || 0) > 0 ? p.pair_names!.join(', ') : '—'}</div>
                                <div><span className="font-semibold">Equipo:</span> {(p.team || '').trim() ? p.team : '—'}</div>
                              </div>
                            </details>
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

              </div>
            )}

            {activeTab === 'parejas' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="text-sm font-extrabold text-gray-900">{t('adminPlayers.pairsTitle')}</div>
                  <div className="relative w-full sm:w-[420px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                      value={pairSearch}
                      onChange={(e) => setPairSearch(e.target.value)}
                      placeholder={t('adminPlayers.pairsSearchPlaceholder')}
                      className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm bg-white/80"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white/90 p-4 space-y-3">
                  <div className="text-sm font-extrabold text-gray-900">{t('adminPlayers.pairsCreateTitle')}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <input
                      value={pairName}
                      onChange={(e) => setPairName(e.target.value)}
                      placeholder={t('adminPlayers.pairNamePlaceholder')}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                    />
                    <select
                      value={pairMemberAId}
                      onChange={(e) => setPairMemberAId(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                    >
                      <option value="">{t('adminPlayers.pairMemberA')}</option>
                      {playerOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {`${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id}
                        </option>
                      ))}
                    </select>
                    <select
                      value={pairMemberBId}
                      onChange={(e) => setPairMemberBId(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                    >
                      <option value="">{t('adminPlayers.pairMemberB')}</option>
                      {playerOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {`${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void createPair()}
                      disabled={!currentAssociationId || pairBusy || !pairName.trim() || !pairMemberAId || !pairMemberBId || pairMemberAId === pairMemberBId}
                      className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white disabled:opacity-50"
                    >
                      {pairBusy ? t('adminPlayers.pairSaving') : t('adminPlayers.pairCreate')}
                    </button>
                  </div>
                  {pairError && (
                    <div className="text-xs text-red-600">{pairError}</div>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white/90 p-4 space-y-3">
                  {pairsLoading ? (
                    <div className="text-sm text-gray-600">{t('common.loading')}</div>
                  ) : filteredPairs.length === 0 ? (
                    <div className="text-sm text-gray-600">{t('adminPlayers.pairEmpty')}</div>
                  ) : (
                    <div className="space-y-3">
                      {filteredPairs.map((pair) => {
                        const stats = pairStats[pair.id];
                        const isEditing = pairEditId === pair.id;
                        return (
                          <div key={pair.id} className="rounded-2xl border border-gray-200 bg-white p-3 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold text-gray-900">{pair.name}</div>
                                <div className="text-xs text-gray-600">
                                  {(pair.members || []).map((m) => `${m.first_name || ''} ${m.last_name || ''}`.trim()).join(' · ') || '—'}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setExpandedPairId((prev) => (prev === pair.id ? null : pair.id))}
                                  className="px-3 py-1.5 rounded-xl text-xs bg-white border border-gray-200 text-gray-700"
                                >
                                  {t('adminPlayers.pairEvents')}
                                </button>
                                {!isEditing && (
                                  <button
                                    type="button"
                                    onClick={() => startEditPair(pair)}
                                    className="px-3 py-1.5 rounded-xl text-xs bg-white border border-gray-200 text-gray-700"
                                  >
                                    {t('adminPlayers.pairEdit')}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void deletePair(pair.id)}
                                  disabled={pairBusy}
                                  className="px-3 py-1.5 rounded-xl text-xs bg-white border border-red-200 text-red-700"
                                >
                                  {t('adminPlayers.pairDelete')}
                                </button>
                              </div>
                            </div>

                            {isEditing && (
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                <input
                                  value={pairEditName}
                                  onChange={(e) => setPairEditName(e.target.value)}
                                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                                />
                                <select
                                  value={pairEditMemberAId}
                                  onChange={(e) => setPairEditMemberAId(e.target.value)}
                                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                                >
                                  <option value="">{t('adminPlayers.pairMemberA')}</option>
                                  {playerOptions.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {`${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={pairEditMemberBId}
                                  onChange={(e) => setPairEditMemberBId(e.target.value)}
                                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                                >
                                  <option value="">{t('adminPlayers.pairMemberB')}</option>
                                  {playerOptions.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {`${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id}
                                    </option>
                                  ))}
                                </select>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void savePairEdit()}
                                    disabled={pairBusy || !pairEditName.trim() || !pairEditMemberAId || !pairEditMemberBId || pairEditMemberAId === pairEditMemberBId}
                                    className="px-3 py-2 rounded-xl text-xs bg-blue-600 text-white disabled:opacity-50"
                                  >
                                    {t('adminPlayers.pairSave')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditPair}
                                    className="px-3 py-2 rounded-xl text-xs bg-white border border-gray-200 text-gray-700"
                                  >
                                    {t('adminPlayers.pairCancel')}
                                  </button>
                                </div>
                              </div>
                            )}

                            {expandedPairId === pair.id && (
                              <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                                <div className="text-xs font-semibold text-gray-700 mb-2">{t('adminPlayers.eventsTitle')}</div>
                                {statsLoading ? (
                                  <div className="text-xs text-gray-600">{t('common.loading')}</div>
                                ) : stats?.events?.length ? (
                                  <div className="overflow-x-auto">
                                    <table className="min-w-[520px] w-full text-xs">
                                      <thead>
                                        <tr className="text-[11px] uppercase tracking-wide text-gray-500">
                                          <th className="text-left px-2 py-1">{t('adminPlayers.eventName')}</th>
                                          <th className="text-left px-2 py-1">{t('adminPlayers.eventDate')}</th>
                                          <th className="text-left px-2 py-1">{t('adminPlayers.eventPosition')}</th>
                                          <th className="text-left px-2 py-1">{t('adminPlayers.eventPoints')}</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {stats.events.map((ev) => (
                                          <tr key={ev.event_id} className="border-t border-gray-100">
                                            <td className="px-2 py-1">{ev.event_name}</td>
                                            <td className="px-2 py-1">{ev.event_date || '—'}</td>
                                            <td className="px-2 py-1">{ev.position ?? '—'}</td>
                                            <td className="px-2 py-1">{ev.points}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-600">{t('adminPlayers.eventEmpty')}</div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'equipos' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="text-sm font-extrabold text-gray-900">{t('adminPlayers.teamsTitle')}</div>
                  <div className="relative w-full sm:w-[420px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                      value={teamSearch}
                      onChange={(e) => setTeamSearch(e.target.value)}
                      placeholder={t('adminPlayers.teamsSearchPlaceholder')}
                      className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm bg-white/80"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white/90 p-4 space-y-3">
                  <div className="text-sm font-extrabold text-gray-900">{t('adminPlayers.teamsCreateTitle')}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <input
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder={t('adminTeams.teamNamePlaceholder')}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                    />
                    <input
                      value={teamMaxRaw}
                      onChange={(e) => setTeamMaxRaw(e.target.value)}
                      placeholder={t('adminTeams.teamSizePlaceholder')}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => void createTeam()}
                      disabled={!currentAssociationId || teamBusy || !teamName.trim()}
                      className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white disabled:opacity-50"
                    >
                      {teamBusy ? t('adminTeams.creating') : t('adminTeams.create')}
                    </button>
                  </div>
                  {teamError && (
                    <div className="text-xs text-red-600">{teamError}</div>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white/90 p-4 space-y-3">
                  {teamsLoading ? (
                    <div className="text-sm text-gray-600">{t('common.loading')}</div>
                  ) : filteredTeams.length === 0 ? (
                    <div className="text-sm text-gray-600">{t('adminTeams.noTeams')}</div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_2fr] gap-4">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-600">{t('adminTeams.teamLabel')}</div>
                        <select
                          value={selectedTeamId}
                          onChange={(e) => setSelectedTeamId(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                        >
                          {filteredTeams.map((team) => (
                            <option key={team.id} value={team.id}>{team.name}</option>
                          ))}
                        </select>

                        {selectedTeam && (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-gray-600">{t('adminPlayers.teamEditTitle')}</div>
                            <input
                              value={teamEditName}
                              onChange={(e) => setTeamEditName(e.target.value)}
                              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white w-full"
                              placeholder={t('adminTeams.teamNamePlaceholder')}
                            />
                            <input
                              value={teamEditMaxRaw}
                              onChange={(e) => setTeamEditMaxRaw(e.target.value)}
                              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white w-full"
                              placeholder={t('adminTeams.teamSizePlaceholder')}
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void saveTeamEdit()}
                                disabled={teamBusy || !teamEditName.trim()}
                                className="px-3 py-2 rounded-xl text-xs bg-blue-600 text-white disabled:opacity-50"
                              >
                                {t('adminPlayers.teamSave')}
                              </button>
                              <button
                                type="button"
                                onClick={startEditTeam}
                                className="px-3 py-2 rounded-xl text-xs bg-white border border-gray-200 text-gray-700"
                              >
                                {t('adminPlayers.teamReset')}
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteTeam()}
                                disabled={teamBusy}
                                className="px-3 py-2 rounded-xl text-xs bg-white border border-red-200 text-red-700"
                              >
                                {t('adminPlayers.teamDelete')}
                              </button>
                            </div>
                          </div>
                        )}

                        {selectedTeam && (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => setExpandedTeamId((prev) => (prev === selectedTeam.id ? null : selectedTeam.id))}
                              className="px-3 py-1.5 rounded-xl text-xs bg-white border border-gray-200 text-gray-700"
                            >
                              {t('adminPlayers.teamEvents')}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div>
                          <div className="text-xs font-semibold text-gray-600">{t('adminPlayers.teamMembers')}</div>
                          {teamMembers.length === 0 ? (
                            <div className="text-xs text-gray-600">{t('adminTeams.noTeamMembers')}</div>
                          ) : (
                            <div className="space-y-1">
                              {teamMembers.map((member) => (
                                <div key={member.id} className="flex items-center justify-between text-xs border border-gray-100 rounded-xl px-3 py-2">
                                  <div>{`${member.first_name || ''} ${member.last_name || ''}`.trim()}</div>
                                  <button
                                    type="button"
                                    onClick={() => void removePlayerFromTeam(member.id)}
                                    disabled={teamBusy}
                                    className="text-red-600"
                                  >
                                    {t('adminTeams.remove')}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="text-xs font-semibold text-gray-600">{t('adminPlayers.teamAssignTitle')}</div>
                          <input
                            value={teamPlayerSearch}
                            onChange={(e) => setTeamPlayerSearch(e.target.value)}
                            placeholder={t('adminTeams.searchPlayersPlaceholder')}
                            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white w-full"
                          />
                          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                            <select
                              value={teamPlayerCategory}
                              onChange={(e) => setTeamPlayerCategory(e.target.value)}
                              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                            >
                              <option value="">{t('adminTeams.allCategories')}</option>
                              {teamPlayerCategoryOptions.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                            <select
                              value={teamPlayerProvince}
                              onChange={(e) => setTeamPlayerProvince(e.target.value)}
                              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                            >
                              <option value="">{t('adminTeams.allProvinces')}</option>
                              {teamPlayerProvinceOptions.map((province) => (
                                <option key={province} value={province}>
                                  {province}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
                            {filteredTeamPlayers.map((player) => {
                              const alreadyAssigned = player.team && player.team === selectedTeamName;
                              const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
                              return (
                                <div key={player.id} className="flex items-center justify-between text-xs border border-gray-100 rounded-xl px-3 py-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => void assignPlayerToTeam(player.id)}
                                      disabled={teamBusy || alreadyAssigned || !selectedTeam}
                                      className="w-6 h-6 rounded-full border border-blue-200 text-blue-600 disabled:border-gray-200 disabled:text-gray-400"
                                      aria-label={t('adminTeams.add')}
                                    >
                                      +
                                    </button>
                                    <div className="truncate">
                                      <div className="truncate">{displayName}</div>
                                      <div className="text-[11px] text-gray-500 truncate">
                                        {[player.category, player.province, player.team].filter(Boolean).join(' · ')}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-gray-500">{alreadyAssigned ? t('adminTeams.alreadyInTeam') : ''}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {expandedTeamId === selectedTeamId && (
                          <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                            <div className="text-xs font-semibold text-gray-700 mb-2">{t('adminPlayers.eventsTitle')}</div>
                            {statsLoading ? (
                              <div className="text-xs text-gray-600">{t('common.loading')}</div>
                            ) : teamStats[selectedTeamId]?.events?.length ? (
                              <div className="overflow-x-auto">
                                <table className="min-w-[520px] w-full text-xs">
                                  <thead>
                                    <tr className="text-[11px] uppercase tracking-wide text-gray-500">
                                      <th className="text-left px-2 py-1">{t('adminPlayers.eventName')}</th>
                                      <th className="text-left px-2 py-1">{t('adminPlayers.eventDate')}</th>
                                      <th className="text-left px-2 py-1">{t('adminPlayers.eventPosition')}</th>
                                      <th className="text-left px-2 py-1">{t('adminPlayers.eventPoints')}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {teamStats[selectedTeamId].events.map((ev) => (
                                      <tr key={ev.event_id} className="border-t border-gray-100">
                                        <td className="px-2 py-1">{ev.event_name}</td>
                                        <td className="px-2 py-1">{ev.event_date || '—'}</td>
                                        <td className="px-2 py-1">{ev.position ?? '—'}</td>
                                        <td className="px-2 py-1">{ev.points}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="text-xs text-gray-600">{t('adminPlayers.eventEmpty')}</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </>
  );
}
