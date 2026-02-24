'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, DoorOpen, UsersRound } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import AssociationSelector from '@/components/AssociationSelector';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/language-context';

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  team?: string | null;
  category?: string | null;
  province?: string | null;
  association_id?: string | null;
};

type TeamRow = {
  id: string;
  association_id: string;
  name: string;
  max_players: number;
  member_count?: number;
};

type EventRow = {
  id: string;
  name: string;
  event_date: string | null;
};

type PlayerOrder = 'last_name' | 'first_name' | 'category' | 'province';

function shortId(id: string) {
  const clean = (id || '').replace(/-/g, '');
  return clean ? clean.slice(0, 8).toUpperCase() : '—';
}

function displayName(p: PlayerRow) {
  const label = `${p.last_name || ''} ${p.first_name || ''}`.trim();
  return label || shortId(p.id);
}

export default function AdminEquiposPage() {
  const { user, profile, loading, isAdmin, currentAssociationId } = useAuth();
  const { t } = useLanguage();
  const [items, setItems] = useState<PlayerRow[]>([]);
  const [busy, setBusy] = useState(false);

  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsBusy, setEventsBusy] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamsBusy, setTeamsBusy] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');

  const [createName, setCreateName] = useState('');
  const [createMaxRaw, setCreateMaxRaw] = useState('2');
  const [createBusy, setCreateBusy] = useState(false);

  const [playerOrder, setPlayerOrder] = useState<PlayerOrder>('last_name');
  const [playerQuery, setPlayerQuery] = useState('');
  const [playerCategory, setPlayerCategory] = useState('');
  const [playerProvince, setPlayerProvince] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);
  const [eventPlayerIds, setEventPlayerIds] = useState<string[] | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [teamsModalOpen, setTeamsModalOpen] = useState(false);
  const [deleteTeamId, setDeleteTeamId] = useState<string | null>(null);
  const [deleteTeamName, setDeleteTeamName] = useState<string | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [teamQuery, setTeamQuery] = useState('');
  const [teamMinRaw, setTeamMinRaw] = useState('');
  const [teamMaxRaw, setTeamMaxRaw] = useState('');
  const [teamProvince, setTeamProvince] = useState('');

  const clampCreateMax = (value: string | number) => {
    const parsed = Number.parseInt(String(value || ''), 10);
    if (!Number.isFinite(parsed)) return 2;
    return Math.max(2, Math.min(50, parsed));
  };

  useEffect(() => {
    document.body.classList.add('premium-admin-bg');
    return () => document.body.classList.remove('premium-admin-bg');
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!isAdmin) return;
      setBusy(true);

      const params = new URLSearchParams();
      if (currentAssociationId) params.set('association_id', currentAssociationId);
      // Keep API ordering simple; sorting is handled client-side for the table.
      params.set('order', 'alpha');

      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;

      const res = await fetch(`/api/players?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json().catch(() => ({}));
      const rows = (json?.players as PlayerRow[]) || [];

      if (active) {
        setItems(rows);
        setBusy(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [currentAssociationId, isAdmin]);

  useEffect(() => {
    let active = true;

    const loadEventPlayers = async () => {
      if (!selectedEventId) {
        if (active) setEventPlayerIds(null);
        return;
      }

      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/admin/events/${encodeURIComponent(selectedEventId)}`, { headers });
      const json = await res.json().catch(() => ({}));
      if (!active) return;

      if (!res.ok || !json?.ok) {
        setEventPlayerIds(null);
        return;
      }

      const regs = Array.isArray(json?.registeredPlayers) ? json.registeredPlayers : [];
      setEventPlayerIds(regs.map((p: any) => String(p.id || '')).filter(Boolean));
    };

    void loadEventPlayers();
    return () => {
      active = false;
    };
  }, [selectedEventId]);

  useEffect(() => {
    let active = true;

    const loadEvents = async () => {
      if (!isAdmin) return;
      if (!currentAssociationId) {
        if (active) {
          setEvents([]);
          setSelectedEventId('');
        }
        return;
      }

      setEventsBusy(true);
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;

      const params = new URLSearchParams();
      params.set('association_id', currentAssociationId);

      const res = await fetch(`/api/admin/events/list?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json().catch(() => ({}));
      const rows = (json?.events as EventRow[]) || [];

      if (!active) return;
      setEvents(rows);
      setEventsBusy(false);

      if (rows.length > 0) {
        setSelectedEventId((prev) => (prev && rows.some((e) => e.id === prev) ? prev : ''));
      } else {
        setSelectedEventId('');
      }
    };

    void loadEvents();
    return () => {
      active = false;
    };
  }, [currentAssociationId, isAdmin]);

  useEffect(() => {
    let active = true;

    const loadTeams = async () => {
      if (!isAdmin) return;
      if (!currentAssociationId) {
        if (active) {
          setTeams([]);
          setSelectedTeamId('');
        }
        return;
      }

      setTeamsBusy(true);
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;

      const params = new URLSearchParams();
      params.set('association_id', currentAssociationId);

      const res = await fetch(`/api/teams?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json().catch(() => ({}));
      const rows = (json?.teams as TeamRow[]) || [];

      if (!active) return;
      if (!res.ok || json?.error) {
        setErrorMsg(String(json?.error || t('adminTeams.loadTeamsError')));
        setTeamsBusy(false);
        return;
      }
      setTeams(rows);
      setTeamsBusy(false);

      if (rows.length > 0) {
        setSelectedTeamId((prev) => (prev && rows.some((t) => t.id === prev) ? prev : rows[0].id));
      } else {
        setSelectedTeamId('');
      }
    };

    void loadTeams();
    return () => {
      active = false;
    };
  }, [currentAssociationId, isAdmin]);

  const selectedTeam = useMemo(() => teams.find((t) => t.id === selectedTeamId) || null, [teams, selectedTeamId]);
  const selectedTeamName = selectedTeam?.name || '';
  const memberCount = useMemo(() => {
    if (!selectedTeamName) return 0;
    return items.filter((p) => String(p.team || '') === selectedTeamName).length;
  }, [items, selectedTeamName]);
  const maxPlayers = selectedTeam?.max_players || 0;
  const isFull = Boolean(selectedTeam) && maxPlayers > 0 && memberCount >= maxPlayers;

  const playerTeamNameByPlayerId = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((p) => {
      const teamName = String(p.team || '').trim();
      if (teamName) map.set(String(p.id), teamName);
    });
    return map;
  }, [items]);

  const teamStatsByName = useMemo(() => {
    const map = new Map<string, { count: number; provinces: Set<string>; keywords: string }>();
    items.forEach((p) => {
      const teamName = String(p.team || '').trim();
      if (!teamName) return;
      const entry = map.get(teamName) || { count: 0, provinces: new Set<string>(), keywords: '' };
      entry.count += 1;
      if (p.province) entry.provinces.add(String(p.province));
      const keyword = `${teamName} ${displayName(p)} ${p.category || ''} ${p.province || ''}`.toLowerCase();
      entry.keywords += ` ${keyword}`;
      map.set(teamName, entry);
    });
    return map;
  }, [items]);

  const teamProvinces = useMemo(() => {
    const all = new Set<string>();
    for (const entry of teamStatsByName.values()) {
      entry.provinces.forEach((p) => all.add(p));
    }
    return Array.from(all).sort((a, b) => a.localeCompare(b, 'es'));
  }, [teamStatsByName]);

  const members = useMemo(() => {
    if (!selectedTeamName) return [];
    return items
      .filter((p) => String(p.team || '') === selectedTeamName)
      .map((p) => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        category: p.category || null,
        province: p.province || null,
      }))
      .sort((a, b) => displayName(a as any).localeCompare(displayName(b as any), 'es'));
  }, [items, selectedTeamName]);

  const playerCategoryOptions = useMemo(() => {
    const base = ['Masculino', 'Femenino', 'Senior', 'Senior+', 'Junior'];
    const fromData = Array.from(new Set(items.map((p) => String(p.category || '').trim()).filter(Boolean)));
    const extras = fromData
      .filter((value) => !base.some((fixed) => fixed.toLowerCase() === value.toLowerCase()))
      .sort((a, b) => a.localeCompare(b, 'es'));
    return [...base, ...extras];
  }, [items]);

  const playerProvinceOptions = useMemo(() => {
    return Array.from(new Set(items.map((p) => String(p.province || '').trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'es')
    );
  }, [items]);

  const filteredPlayers = useMemo(() => {
    const q = playerQuery.trim().toLowerCase();
    const base = items.filter((p) => {
      if (Array.isArray(eventPlayerIds)) {
        if (!eventPlayerIds.includes(p.id)) return false;
      }
      const name = displayName(p).toLowerCase();
      const fn = String(p.first_name || '').toLowerCase();
      const ln = String(p.last_name || '').toLowerCase();
      const cat = String(p.category || '').toLowerCase();
      const prov = String(p.province || '').toLowerCase();
      const idShort = shortId(p.id).toLowerCase();
      const matchesQuery = !q || (
        name.includes(q) ||
        fn.includes(q) ||
        ln.includes(q) ||
        cat.includes(q) ||
        prov.includes(q) ||
        idShort.includes(q)
      );
      const matchesCategory = !playerCategory || cat === playerCategory.toLowerCase();
      const matchesProvince = !playerProvince || prov === playerProvince.toLowerCase();
      return matchesQuery && matchesCategory && matchesProvince;
    });

    const sorted = [...base];
    if (playerOrder === 'category') {
      sorted.sort((a, b) => {
        const ac = String(a.category || '').localeCompare(String(b.category || ''), 'es');
        if (ac !== 0) return ac;
        return displayName(a).localeCompare(displayName(b), 'es');
      });
    } else if (playerOrder === 'province') {
      sorted.sort((a, b) => {
        const ap = String(a.province || '').localeCompare(String(b.province || ''), 'es');
        if (ap !== 0) return ap;
        return displayName(a).localeCompare(displayName(b), 'es');
      });
    } else if (playerOrder === 'first_name') {
      sorted.sort((a, b) => {
        const af = String(a.first_name || '').localeCompare(String(b.first_name || ''), 'es');
        if (af !== 0) return af;
        return String(a.last_name || '').localeCompare(String(b.last_name || ''), 'es');
      });
    } else {
      // last_name
      sorted.sort((a, b) => {
        const al = String(a.last_name || '').localeCompare(String(b.last_name || ''), 'es');
        if (al !== 0) return al;
        return String(a.first_name || '').localeCompare(String(b.first_name || ''), 'es');
      });
    }

    return sorted;
  }, [items, playerQuery, playerOrder, eventPlayerIds, playerCategory, playerProvince]);

  const filteredTeams = useMemo(() => {
    const q = teamQuery.trim().toLowerCase();
    const min = Number.parseInt(teamMinRaw || '', 10);
    const max = Number.parseInt(teamMaxRaw || '', 10);

    return teams.filter((t) => {
      const stats = teamStatsByName.get(t.name);
      const count = stats?.count ?? t.member_count ?? 0;
      if (Number.isFinite(min) && count < min) return false;
      if (Number.isFinite(max) && count > max) return false;
      if (teamProvince) {
        if (!stats?.provinces.has(teamProvince)) return false;
      }
      if (!q) return true;
      const keywords = `${t.name} ${stats?.keywords || ''}`.toLowerCase();
      return keywords.includes(q);
    });
  }, [teams, teamQuery, teamMinRaw, teamMaxRaw, teamProvince, teamStatsByName]);

  const refreshAll = async () => {
    if (!isAdmin) return;
    if (!currentAssociationId) return;

    setBusy(true);
    setEventsBusy(true);
    setTeamsBusy(true);

    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

    const playersParams = new URLSearchParams();
    playersParams.set('association_id', currentAssociationId);
    playersParams.set('order', 'alpha');

    const eventsParams = new URLSearchParams();
    eventsParams.set('association_id', currentAssociationId);

    const teamParams = new URLSearchParams();
    teamParams.set('association_id', currentAssociationId);

    const [playersRes, eventsRes, teamsRes] = await Promise.all([
      fetch(`/api/players?${playersParams.toString()}`, { headers }),
      fetch(`/api/admin/events/list?${eventsParams.toString()}`, { headers }),
      fetch(`/api/teams?${teamParams.toString()}`, { headers }),
    ]);

    const playersJson = await playersRes.json().catch(() => ({}));
    const eventsJson = await eventsRes.json().catch(() => ({}));
    const teamsJson = await teamsRes.json().catch(() => ({}));

    setItems((playersJson?.players as PlayerRow[]) || []);
    const nextEvents = (eventsJson?.events as EventRow[]) || [];
    setEvents(nextEvents);
    setEventsBusy(false);

    if (teamsRes.ok && !teamsJson?.error) {
      const nextTeams = (teamsJson?.teams as TeamRow[]) || [];
      setTeams(nextTeams);

      if (nextTeams.length > 0) {
        setSelectedTeamId((prev) => (prev && nextTeams.some((t) => t.id === prev) ? prev : nextTeams[0].id));
      } else {
        setSelectedTeamId('');
      }
    } else if (teamsJson?.error) {
      setErrorMsg(String(teamsJson.error));
    }

    setTeamsBusy(false);
    setBusy(false);
  };

  const createTeam = async () => {
    if (!currentAssociationId) {
      setErrorMsg(t('adminTeams.selectAssociation')); 
      return;
    }

    const name = createName.trim();
    if (!name) {
      setErrorMsg(t('adminTeams.teamNameRequired'));
      return;
    }

    const maxParsed = Number.parseInt(String(createMaxRaw || ''), 10);
    if (!Number.isFinite(maxParsed) || maxParsed < 2 || maxParsed > 50) {
      setErrorMsg(t('adminTeams.teamSizeInvalid'));
      return;
    }

    setCreateBusy(true);
    setErrorMsg(null);
    setOkMsg(null);

    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const res = await fetch('/api/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ association_id: currentAssociationId, name, max_players: maxParsed }),
    });

    const json = await res.json().catch(() => ({}));
    if (!json?.ok) {
      setErrorMsg(String(json?.error || t('adminTeams.createTeamError')));
      setCreateBusy(false);
      return;
    }

    const created = json?.team as TeamRow | undefined;
    if (created?.id) {
      setTeams((prev) => {
        const next = [...prev.filter((t) => t.id !== created.id), { ...created, member_count: 0 }];
        next.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
        return next;
      });
      setSelectedTeamId(created.id);
    }

    setCreateName('');
    setOkMsg(t('adminTeams.teamCreated'));
    setCreateBusy(false);
    await refreshAll();
  };

  const assignPlayer = async (playerId: string) => {
    if (!selectedTeamId) {
      setErrorMsg(t('adminTeams.selectTeam'));
      return;
    }
    if (!playerId) return;
    if (isFull) {
      setErrorMsg(t('adminTeams.teamFull'));
      return;
    }

    if (playerTeamNameByPlayerId.get(playerId)) {
      setErrorMsg(t('adminTeams.playerAlreadyAssigned'));
      return;
    }

    setAssignBusy(true);
    setErrorMsg(null);
    setOkMsg(null);

    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const res = await fetch('/api/teams/assign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ team_id: selectedTeamId, player_id: playerId }),
    });

    const json = await res.json().catch(() => ({}));
    if (!json?.ok) {
      setErrorMsg(String(json?.error || t('adminTeams.assignError')));
      setAssignBusy(false);
      return;
    }

    setOkMsg(t('adminTeams.playerAssigned'));
    setAssignBusy(false);
    await refreshAll();
  };

  const removePlayer = async (playerId: string) => {
    if (!selectedTeamId) return;

    setAssignBusy(true);
    setErrorMsg(null);
    setOkMsg(null);

    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const res = await fetch('/api/teams/remove', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ team_id: selectedTeamId, player_id: playerId }),
    });

    const json = await res.json().catch(() => ({}));
    if (!json?.ok) {
      setErrorMsg(String(json?.error || t('adminTeams.removePlayerError')));
      setAssignBusy(false);
      return;
    }

    setOkMsg(t('adminTeams.playerRemoved'));
    setAssignBusy(false);
    await refreshAll();
  };

  const requestDeleteTeam = (team: TeamRow) => {
    setDeleteTeamId(team.id);
    setDeleteTeamName(team.name);
    setDeleteConfirmInput('');
  };

  const cancelDeleteTeam = () => {
    setDeleteTeamId(null);
    setDeleteTeamName(null);
    setDeleteConfirmInput('');
  };

  const confirmDeleteTeam = async () => {
    if (!currentAssociationId || !deleteTeamId) return;
    if (deleteConfirmInput.trim().toUpperCase() !== t('adminTeams.confirmWord')) {
      setErrorMsg(t('adminTeams.confirmWordPrompt'));
      return;
    }

    setDeleteBusy(true);
    setErrorMsg(null);
    setOkMsg(null);

    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;

    const res = await fetch('/api/teams', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        association_id: currentAssociationId,
        team_id: deleteTeamId,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!json?.ok) {
      setErrorMsg(String(json?.error || t('adminTeams.deleteTeamError')));
      setDeleteBusy(false);
      return;
    }

    setTeams((prev) => prev.filter((t) => t.id !== deleteTeamId));
    setSelectedTeamId((prev) => (prev === deleteTeamId ? '' : prev));
    setOkMsg(t('adminTeams.teamDeleted'));
    setDeleteBusy(false);
    cancelDeleteTeam();
    await refreshAll();
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
                <UsersRound className="h-5 w-5" /> {t('adminTeams.title')}
              </div>
              <div className="text-xs text-gray-700">{t('adminTeams.subtitle')}</div>
            </div>
          </div>
          <AssociationSelector />
        </header>

        <main className="max-w-5xl mx-auto">
          <section className="premium-card w-full">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-extrabold text-gray-900">{t('adminTeams.eventFilterTitle')}</div>
              <div className="text-xs text-gray-600">{eventsBusy ? t('common.loading') : t('adminTeams.eventsCount').replace('{count}', String(events.length))}</div>
            </div>

            {!currentAssociationId ? (
              <div className="text-sm text-gray-700">{t('adminTeams.selectAssociationManage')}</div>
            ) : (
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                aria-label={t('adminTeams.eventLabel')}
                disabled={eventsBusy}
              >
                <option value="">{t('adminTeams.allEvents')}</option>
                {events.length === 0 ? (
                  <option value="" disabled>{t('adminTeams.noEvents')}</option>
                ) : (
                  events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {(ev.event_date ? `${ev.event_date} · ` : '') + ev.name}
                    </option>
                  ))
                )}
              </select>
            )}
          </section>

          <div className="h-4" />

          <section className="premium-card w-full">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-extrabold text-gray-900">{t('adminTeams.createTeamTitle')}</div>
              <div className="text-xs text-gray-600">{teamsBusy ? t('adminTeams.refreshing') : t('adminTeams.teamsCount').replace('{count}', String(teams.length))}</div>
            </div>

            {!currentAssociationId ? (
              <div className="text-sm text-gray-700">{t('adminTeams.selectAssociationManage')}</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder={t('adminTeams.teamNamePlaceholder')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                />
                <div className="flex items-stretch">
                  <input
                    value={createMaxRaw}
                    onChange={(e) => setCreateMaxRaw(e.target.value)}
                    onBlur={() => {
                      setCreateMaxRaw(String(clampCreateMax(createMaxRaw)));
                    }}
                    type="number"
                    min={2}
                    max={50}
                    step={1}
                    placeholder={t('adminTeams.teamSizePlaceholder')}
                    className="w-20 border border-gray-200 rounded-l-xl px-3 py-2 text-sm bg-white/80"
                  />
                  <div className="flex flex-col overflow-hidden rounded-r-xl border border-l-0 border-gray-200 bg-white/80">
                    <button
                      type="button"
                      onClick={() => setCreateMaxRaw(String(clampCreateMax((Number(createMaxRaw || 0) || 2) + 1)))}
                      className="px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                      aria-label={t('adminTeams.increase')}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateMaxRaw(String(clampCreateMax((Number(createMaxRaw || 0) || 2) - 1)))}
                      className="px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                      aria-label={t('adminTeams.decrease')}
                    >
                      ▼
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => void createTeam()}
                  disabled={createBusy}
                  className="rounded-xl border-2 border-gold-600/80 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm px-3 py-2 disabled:opacity-60"
                >
                  {createBusy ? t('adminTeams.creating') : t('adminTeams.create')}
                </button>
              </div>
            )}

            {(errorMsg || okMsg) && (
              <div className="mt-3">
                {errorMsg && <div className="text-sm font-semibold text-red-700">{errorMsg}</div>}
                {okMsg && <div className="text-sm font-semibold text-emerald-700">{okMsg}</div>}
              </div>
            )}
          </section>

          <div className="h-4" />

          <section className="premium-card w-full">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div>
                <div className="text-sm font-extrabold text-gray-900">{t('adminTeams.assignmentTitle')}</div>
                <div className="text-xs text-gray-700">{busy ? t('adminTeams.loadingPlayers') : t('adminTeams.playersCount').replace('{count}', String(filteredPlayers.length))}</div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <button
                  type="button"
                  onClick={() => setTeamsModalOpen(true)}
                  className="rounded-xl px-3 py-2 text-sm bg-white border border-gray-200 text-gray-700"
                  disabled={false}
                >
                  {t('adminTeams.viewTeams')}
                </button>
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                  disabled={!currentAssociationId || teams.length === 0}
                  aria-label={t('adminTeams.teamLabel')}
                >
                  {teams.length === 0 ? (
                    <option value="">{t('adminTeams.noTeams')}</option>
                  ) : (
                    teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({teamStatsByName.get(t.name)?.count ?? t.member_count ?? 0}/{t.max_players})
                      </option>
                    ))
                  )}
                </select>

                <select
                  value={playerOrder}
                  onChange={(e) => setPlayerOrder((e.target.value as PlayerOrder) || 'last_name')}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                  aria-label={t('adminTeams.orderLabel')}
                >
                  <option value="last_name">{t('adminTeams.orderLastName')}</option>
                  <option value="first_name">{t('adminTeams.orderFirstName')}</option>
                  <option value="category">{t('adminTeams.orderCategory')}</option>
                  <option value="province">{t('adminTeams.orderProvince')}</option>
                </select>
              </div>
            </div>

            {!selectedTeam ? (
              <div className="text-sm text-gray-700">{t('adminTeams.selectTeamToAssign')}</div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <input
                    value={playerQuery}
                    onChange={(e) => setPlayerQuery(e.target.value)}
                    placeholder={t('adminTeams.searchPlayersPlaceholder')}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                  />
                  <select
                    value={playerCategory}
                    onChange={(e) => setPlayerCategory(e.target.value)}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                  >
                    <option value="">{t('adminTeams.allCategories')}</option>
                    {playerCategoryOptions.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <select
                    value={playerProvince}
                    onChange={(e) => setPlayerProvince(e.target.value)}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white/80"
                  >
                    <option value="">{t('adminTeams.allProvinces')}</option>
                    {playerProvinceOptions.map((prov) => (
                      <option key={prov} value={prov}>{prov}</option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 text-xs text-gray-700">
                  {t('adminTeams.capacity')} <span className="font-extrabold text-gray-900">{memberCount}/{maxPlayers}</span>
                </div>

                <div className="mt-4">
                  <div className="text-sm font-extrabold text-gray-900 mb-2">{t('adminTeams.playersTable')}</div>

                  <div className="rounded-2xl border border-gray-200 bg-white/70 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-700">
                          <th className="px-3 py-2">{t('adminTeams.player')}</th>
                          <th className="px-3 py-2">{t('adminTeams.category')}</th>
                          <th className="px-3 py-2">{t('adminTeams.province')}</th>
                          <th className="px-3 py-2">{t('adminTeams.team')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPlayers.length === 0 ? (
                          <tr>
                            <td className="px-3 py-3 text-gray-700" colSpan={4}>{t('adminTeams.noPlayers')}</td>
                          </tr>
                        ) : (
                          filteredPlayers.map((p) => {
                            const teamName = playerTeamNameByPlayerId.get(p.id) || '';
                            const alreadyInTeam = Boolean(teamName);
                            const disabled = assignBusy || isFull || alreadyInTeam;

                            return (
                              <tr key={p.id} className="border-t border-gray-200">
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => void assignPlayer(p.id)}
                                      disabled={disabled}
                                      className="w-6 h-6 rounded-full border border-blue-200 text-blue-600 disabled:border-gray-200 disabled:text-gray-400"
                                      aria-label={t('adminTeams.add')}
                                      title={isFull ? t('adminTeams.full') : alreadyInTeam ? t('adminTeams.alreadyInTeam') : t('adminTeams.add')}
                                    >
                                      +
                                    </button>
                                    <div>
                                      <div className="font-extrabold text-gray-900">{displayName(p)}</div>
                                      <div className="text-xs text-gray-700">{shortId(p.id)}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-gray-800">{p.category || '—'}</td>
                                <td className="px-3 py-2 text-gray-800">{p.province || '—'}</td>
                                <td className="px-3 py-2 text-gray-800">{teamName || '—'}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-2 text-xs text-gray-700">
                    {t('adminTeams.teamGlobalNote')}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-sm font-extrabold text-gray-900 mb-2">{t('adminTeams.teamMembers')}</div>

                  {members.length === 0 ? (
                    <div className="text-sm text-gray-700">{t('adminTeams.noTeamMembers')}</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {members.map((p) => (
                        <div key={p.id} className="rounded-2xl border border-gray-200 bg-white/80 p-3 flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-extrabold text-gray-900">{displayName(p)}</div>
                            <div className="text-xs text-gray-700">{p.category || '—'} · {p.province || '—'} · {shortId(p.id)}</div>
                          </div>
                          <button
                            onClick={() => void removePlayer(p.id)}
                            disabled={assignBusy}
                            className="rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 text-xs font-extrabold px-3 py-2 disabled:opacity-60"
                          >
                            {t('adminTeams.remove')}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </main>

        {teamsModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-4 shadow-xl w-full max-w-lg space-y-3 max-h-[85vh] overflow-hidden">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{t('adminTeams.teamsTitle')}</div>
                  <div className="text-xs text-gray-500 truncate">{t('adminTeams.teamsCount').replace('{count}', String(teams.length))}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setTeamsModalOpen(false)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                  aria-label={t('common.close')}
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={teamQuery}
                  onChange={(e) => setTeamQuery(e.target.value)}
                  placeholder={t('adminTeams.searchTeamsPlaceholder')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
                <select
                  value={teamProvince}
                  onChange={(e) => setTeamProvince(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="">{t('adminTeams.allProvinces')}</option>
                  {teamProvinces.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <input
                  value={teamMinRaw}
                  onChange={(e) => setTeamMinRaw(e.target.value)}
                  placeholder={t('adminTeams.minPlayers')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
                <input
                  value={teamMaxRaw}
                  onChange={(e) => setTeamMaxRaw(e.target.value)}
                  placeholder={t('adminTeams.maxPlayers')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <div className="overflow-auto pr-1" style={{ maxHeight: '70vh' }}>
                {filteredTeams.length === 0 ? (
                  <div className="text-sm text-gray-500">{t('adminTeams.noTeams')}</div>
                ) : (
                  <div className="space-y-2">
                    {filteredTeams.map((team) => (
                      <div key={team.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{team.name}</div>
                          <div className="text-xs text-gray-500 truncate">
                            {teamStatsByName.get(team.name)?.count ?? team.member_count ?? 0}/{team.max_players}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => requestDeleteTeam(team)}
                          className="text-xs rounded-lg border border-red-200 text-red-700 bg-red-50 px-2 py-1 hover:bg-red-100"
                        >
                          {t('adminTeams.delete')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {deleteTeamId && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-4 shadow-xl w-full max-w-sm space-y-3">
              <div className="text-sm font-semibold">{t('adminTeams.deleteTeamTitle')}</div>
              <div className="text-xs text-gray-500">
                {t('adminTeams.deleteTeamDesc').replace('{team}', deleteTeamName || '')}{' '}
                {t('adminTeams.deleteTeamConfirm').replace('{word}', t('adminTeams.confirmWord'))}
              </div>
              <input
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                placeholder={t('adminTeams.confirmWord')}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelDeleteTeam}
                  className="w-full bg-gray-100 text-gray-700 rounded-xl py-2 text-sm"
                  disabled={deleteBusy}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteTeam}
                  className="w-full bg-red-600 text-white rounded-xl py-2 text-sm"
                  disabled={deleteBusy}
                >
                  {deleteBusy ? t('adminTeams.deleting') : t('adminTeams.delete')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
