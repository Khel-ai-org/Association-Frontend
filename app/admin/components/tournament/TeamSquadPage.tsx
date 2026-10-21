"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, UserPlus, Save, Search, Trash2, Users, Target, CircleDot } from 'lucide-react';
import useGoBack from '../../hooks/useGoBack';
import StatusModal from '@/app/components/auth/StatusModal';

interface TeamSquadPageProps {
  tournamentId: string;
  // The match-team id (`team_id` on a tournament team) — what PUT /teams/:id expects.
  teamId: string;
}

interface SquadPlayer {
  id?: string; // KCA player id
  name: string;
  role: string;
  battingHand: string;
  bowlingType: string;
  // Kept from the saved squad so re-saving doesn't wipe them.
  isCaptain?: boolean;
  isViceCaptain?: boolean;
}

interface KcaPlayer {
  id: string;
  name: string;
  role: string;
  battingHand: string;
  bowlingType: string;
}

const ROLES = ['Batter', 'Bowler', 'Batting All Rounder', 'Bowling All Rounder', 'All Rounder', 'WK-Batter'];
const BATTING_HANDS = ['Right Handed', 'Left Handed'];
const DOES_NOT_BOWL = 'Does Not Bowl';
const BOWLING_TYPES = [
  DOES_NOT_BOWL,
  'Right Arm Fast',
  'Right Arm Medium Fast',
  'Left Arm Fast',
  'Left Arm Medium Fast',
  'Right Arm Off Spin',
  'Right Arm Leg Spin',
  'Left Arm Orthodox Spin',
  'Left Arm Wrist Spin (Chinaman)',
];
const BOWLING_REQUIRED_ROLES = ['bowler', 'batting all rounder', 'bowling all rounder', 'all rounder'];
const SQUAD_SIZE = 11;

const SCORING_API = process.env.NEXT_PUBLIC_SCORING_API_URL;
const HEADERS = { 'ngrok-skip-browser-warning': 'true', 'Content-Type': 'application/json' };

const emptyPlayer = (): SquadPlayer => ({ name: '', role: '', battingHand: '', bowlingType: '' });

// Customised dropdown (no native <select>) — optionally searchable.
function SelectBox({
  value,
  options,
  onChange,
  placeholder,
  searchable,
  disabledOptions = [],
  preferUp,
  className = '',
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder: string;
  searchable?: boolean;
  disabledOptions?: string[];
  // Open the list above the field when there is room (used for table rows).
  preferUp?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    // Scrolling the list itself must not close it — only scrolling the page does.
    const closeOnPageScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('click', close);
    // The menu is position:fixed, so it must not drift away from its field.
    window.addEventListener('scroll', closeOnPageScroll, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', closeOnPageScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  // Fixed positioning lets the list escape the table's scroll container
  // (which would otherwise clip it); open upward when asked and there is room.
  const toggle = () => {
    if (!open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      const MENU_MAX = 256;
      const spaceAbove = r.top;
      const spaceBelow = window.innerHeight - r.bottom;
      const up = preferUp ? spaceAbove >= Math.min(MENU_MAX, spaceBelow) || spaceAbove > 180 : spaceBelow < 200 && spaceAbove > spaceBelow;
      setMenuStyle(
        up
          ? { position: 'fixed', left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(MENU_MAX, spaceAbove - 12) }
          : { position: 'fixed', left: r.left, width: r.width, top: r.bottom + 4, maxHeight: Math.min(MENU_MAX, spaceBelow - 12) }
      );
    }
    setOpen((o) => !o);
    setSearch('');
  };

  const selected = options.find((o) => o.value === value);
  const shown = searchable
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div className={`relative ${className}`} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        ref={buttonRef}
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-[#F7F9FC] border border-[#E9EEF5] rounded-xl text-xs font-bold text-[#0B1530] text-left transition-all focus:outline-none focus:bg-white focus:ring-2 focus:ring-black/5 focus:border-[#0F1117] cursor-pointer"
      >
        <span className={`truncate ${selected ? '' : 'text-[#7384A6]'}`}>{selected?.label || value || placeholder}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-[#7384A6] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div ref={menuRef} style={menuStyle} className="bg-white border border-[#E9EEF5] rounded-xl shadow-xl z-50 overflow-y-auto">
          {searchable && (
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player name..."
              className="w-full px-3 py-2 border-b border-gray-100 text-xs outline-none bg-gray-50 sticky top-0 text-[#0B1530]"
            />
          )}
          <div className="p-1">
            {shown.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-400 text-center">No options found</div>
            ) : (
              shown.map((o) => {
                const isDisabled = disabledOptions.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition-colors mb-0.5 last:mb-0 flex items-center justify-between disabled:opacity-40 disabled:cursor-not-allowed ${
                      o.value === value ? 'bg-[#F4F7FE] text-[#0F1117]' : 'text-[#0B1530] hover:bg-[#F7F9FC]'
                    }`}
                  >
                    <span>{o.label}</span>
                    {o.value === value && <span className="text-[#0F1117] text-xs font-black">✓</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const toOptions = (list: string[]) => list.map((v) => ({ value: v, label: v }));

export default function TeamSquadPage({ tournamentId, teamId }: TeamSquadPageProps) {
  const router = useRouter();
  const goBack = useGoBack(`/admin/tournament/${tournamentId}/teams`);

  const [teamName, setTeamName] = useState('');
  const [shortName, setShortName] = useState('');
  const [matchId, setMatchId] = useState('');
  const [innings, setInnings] = useState<number>(1);
  const [players, setPlayers] = useState<SquadPlayer[]>([]);
  const [kcaPlayers, setKcaPlayers] = useState<KcaPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [handFilter, setHandFilter] = useState('');
  const [bowlingFilter, setBowlingFilter] = useState('');

  // Master player list for the "Player Name" dropdown.
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${SCORING_API}/api/v1/kca/players?limit=1000`, { headers: HEADERS });
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data) ? data : data?.players || data?.data || [];
        setKcaPlayers(
          list.map((p: any) => ({
            id: p.id,
            name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
            role: p.role || '',
            battingHand: p.batting_hand || p.battingHand || '',
            bowlingType: p.bowling_type || p.bowlingType || '',
          }))
        );
      } catch (err) {
        console.error('Error fetching players:', err);
      }
    };
    load();
  }, []);

  // Squad already saved for this team (shown after a PUT too) — loaded only
  // from GET /teams/template/{team name}.
  const fetchSavedSquad = useCallback(async (name: string) => {
    if (!name.trim()) return;
    const res = await fetch(`${SCORING_API}/api/v1/teams/template/${encodeURIComponent(name.trim())}`, { headers: HEADERS });
    if (!res.ok) return;
    const data = await res.json();
    if (!data?.found || !Array.isArray(data.players) || data.players.length === 0) return;
    setPlayers(
      data.players.map((p: any) => ({
        id: p.id,
        name: p.name || '',
        role: p.role || '',
        battingHand: p.battingHand || p.batting_hand || '',
        bowlingType: p.bowlingType || p.bowling_type || '',
        isCaptain: !!(p.isCaptain || p.is_captain),
        isViceCaptain: !!(p.isViceCaptain || p.is_vice_captain),
      }))
    );
  }, []);

  // Resolve this team from the tournament's teams list, then load its saved squad.
  useEffect(() => {
    const load = async () => {
      try {
        const tRes = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/tournaments/${tournamentId}`, {
          credentials: 'include',
        });
        const tournament = tRes.ok ? await tRes.json() : null;
        const externalId = tournament?.externalTournamentId;
        if (!externalId) {
          setError('This tournament is missing its scoring-service id.');
          return;
        }
        const res = await fetch(`${SCORING_API}/api/v1/tournaments/${externalId}/teams`, { headers: HEADERS });
        const data = res.ok ? await res.json() : [];
        const list: any[] = Array.isArray(data) ? data : data?.teams || [];
        const team = list.find((t) => (t.team_id || t.team?.id) === teamId);
        if (!team) {
          setError('Team not found in this tournament.');
          return;
        }
        setTeamName(team.name || '');
        setShortName(team.short_name || team.team?.short_name || '');
        setInnings(team.team?.innings ?? 1);
        const mId = team.team?.match_id || '';
        setMatchId(mId);
        await fetchSavedSquad(team.name || '');
      } catch (err) {
        console.error('Error loading squad:', err);
        setError('Could not load the team. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tournamentId, teamId, fetchSavedSquad]);

  const takenIds = useMemo(() => players.map((p) => p.id).filter((id): id is string => !!id), [players]);

  const updatePlayer = (index: number, patch: Partial<SquadPlayer>) =>
    setPlayers((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  // Picking a player auto-fills role / batting hand / bowling type from their
  // master record; each can still be changed afterwards.
  const selectPlayer = (index: number, id: string) => {
    const kp = kcaPlayers.find((k) => k.id === id);
    if (!kp) return;
    updatePlayer(index, {
      id: kp.id,
      name: kp.name,
      role: kp.role,
      battingHand: kp.battingHand,
      bowlingType: kp.bowlingType || '',
    });
    setError('');
  };

  const batters = players.filter((p) => ['batter', 'wk-batter', 'batting all rounder'].includes(p.role.toLowerCase())).length;
  const bowlers = players.filter((p) => ['bowler', 'bowling all rounder'].includes(p.role.toLowerCase())).length;

  const visibleRows = players
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (roleFilter && p.role !== roleFilter) return false;
      if (handFilter && p.battingHand !== handFilter) return false;
      if (bowlingFilter) {
        if (bowlingFilter === DOES_NOT_BOWL ? p.bowlingType : p.bowlingType !== bowlingFilter) return false;
      }
      return true;
    });

  const handleSave = async () => {
    if (players.some((p) => !p.name.trim() || !p.id)) {
      setError('Please pick a player for every row, or remove the empty rows.');
      return;
    }
    if (players.length < SQUAD_SIZE) {
      setError(`A team must contain at least ${SQUAD_SIZE} squad players. Currently ${players.length}.`);
      return;
    }
    const noRole = players.find((p) => !p.role);
    if (noRole) {
      setError(`Please select a role for "${noRole.name}".`);
      return;
    }
    const noHand = players.find((p) => !p.battingHand);
    if (noHand) {
      setError(`Please select a batting hand for "${noHand.name}".`);
      return;
    }
    const noBowling = players.find((p) => BOWLING_REQUIRED_ROLES.includes(p.role.toLowerCase()) && !p.bowlingType);
    if (noBowling) {
      setError(`"${noBowling.name}" has a role requiring a bowling type. Please select one.`);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        name: teamName,
        shortName: shortName.trim().toUpperCase(),
        innings,
        // Teams not yet linked to a match have no match id — omit it rather than send an empty one.
        ...(matchId ? { matchId } : {}),
        // First 11 are the playing XI, anyone beyond that is on the bench.
        players: players.map((p, i) => ({
          id: p.id,
          name: p.name.trim(),
          role: p.role,
          battingHand: p.battingHand,
          bowlingType: p.bowlingType === DOES_NOT_BOWL ? '' : p.bowlingType,
          status: i < SQUAD_SIZE ? 'playing_xi' : 'bench_player',
          isCaptain: !!p.isCaptain,
          isViceCaptain: !!p.isViceCaptain,
          isWicketKeeper: p.role === 'WK-Batter',
        })),
      };
      const res = await fetch(`${SCORING_API}/api/v1/teams/${teamId}`, {
        method: 'PUT',
        headers: HEADERS,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        setError(errData?.error || errData?.message || `We couldn't save this squad (error ${res.status}).`);
        return;
      }
      // Reload what the server actually saved.
      await fetchSavedSquad(teamName);
      setShowSuccess(true);
    } catch (err) {
      console.error('Error saving squad:', err);
      setError("We couldn't reach the server. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-10 text-center font-bold text-slate-400 italic">Loading squad...</div>;
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={goBack} className="text-gray-500 cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center text-[13px] font-medium text-slate-500">
          <button onClick={() => router.push('/admin/tournament')} className="hover:underline hover:text-slate-900 cursor-pointer">Tournament</button>
          <span className="mx-2 text-slate-400">{'>'}</span>
          <button onClick={() => router.push(`/admin/tournament/${tournamentId}/teams`)} className="hover:underline hover:text-slate-900 cursor-pointer">Teams</button>
          <span className="mx-2 text-slate-400">{'>'}</span>
          <span className="text-slate-900">Squad Selection</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">{teamName} Squad</h1>
        <div className="flex items-center gap-4 min-w-0">
          {error && <p className="text-red-500 text-sm font-medium text-right">{error}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 shrink-0 bg-[#0F1117] hover:bg-slate-800 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Squad'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Squad', value: players.length, Icon: Users },
          { label: 'Batters', value: batters, Icon: Target },
          { label: 'Bowlers', value: bowlers, Icon: CircleDot },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="bg-white rounded-3xl border border-gray-100 p-5 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-sm text-slate-500">{label}</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">
                {value} <span className="text-sm font-medium text-slate-500">Players</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#F4F7FE] flex items-center justify-center">
              <Icon className="w-5 h-5 text-[#5D5FEF]" />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">Team squad</h2>
            <span className="text-xs font-semibold text-[#5D5FEF] bg-[#F4F7FE] px-3 py-1 rounded-md">
              {Math.min(players.length, SQUAD_SIZE)} / {SQUAD_SIZE} Selected
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by player name..."
                className="w-full pl-10 pr-4 py-2 bg-[#F7F9FC] border border-[#E9EEF5] rounded-xl text-xs font-bold text-[#0B1530] placeholder:text-[#7384A6] outline-none focus:bg-white focus:ring-2 focus:ring-black/5 focus:border-[#0F1117] transition-all"
              />
            </div>
            <SelectBox
              className="w-44"
              value={roleFilter}
              placeholder="All Roles"
              options={[{ value: '', label: 'All Roles' }, ...toOptions(ROLES)]}
              onChange={setRoleFilter}
            />
            <SelectBox
              className="w-48"
              value={handFilter}
              placeholder="All Batting Hands"
              options={[{ value: '', label: 'All Batting Hands' }, ...toOptions(BATTING_HANDS)]}
              onChange={setHandFilter}
            />
            <SelectBox
              className="w-52"
              value={bowlingFilter}
              placeholder="All Bowling Types"
              options={[{ value: '', label: 'All Bowling Types' }, ...toOptions(BOWLING_TYPES)]}
              onChange={setBowlingFilter}
            />
            <span className="ml-auto text-sm font-semibold text-[#5D5FEF]">{players.length} players in squad</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-sm uppercase text-gray-900 bg-gray-200">
                <th className="py-4 px-6 font-semibold w-16">No.</th>
                <th className="py-4 px-3 font-semibold">Player Name</th>
                <th className="py-4 px-3 font-semibold">Role</th>
                <th className="py-4 px-3 font-semibold">Batting Hand</th>
                <th className="py-4 px-3 font-semibold">Bowling Type</th>
                <th className="py-4 px-6 font-semibold text-center w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-slate-400 italic">
                    {players.length === 0 ? 'No players yet — click "Add Player" to build the squad.' : 'No players match the filters.'}
                  </td>
                </tr>
              ) : (
                visibleRows.map(({ p, index }) => (
                  <tr key={index} className="hover:bg-gray-50/80 transition-colors bg-white">
                    <td className="py-4 px-6 font-bold text-slate-900">{String(index + 1).padStart(2, '0')}</td>
                    <td className="py-4 px-3 min-w-[220px]">
                      <SelectBox
                        searchable
                        preferUp
                        value={p.id || ''}
                        placeholder="Select Player"
                        // Players already in this squad are left out of the list.
                        options={kcaPlayers
                          .filter((k) => k.id === p.id || !takenIds.includes(k.id))
                          .map((k) => ({ value: k.id, label: k.name }))}
                        onChange={(id) => selectPlayer(index, id)}
                      />
                    </td>
                    <td className="py-4 px-3 min-w-[170px]">
                      <SelectBox preferUp value={p.role} placeholder="Select Role" options={toOptions(ROLES)} onChange={(v) => updatePlayer(index, { role: v })} />
                    </td>
                    <td className="py-4 px-3 min-w-[160px]">
                      <SelectBox preferUp value={p.battingHand} placeholder="Select Batting Hand" options={toOptions(BATTING_HANDS)} onChange={(v) => updatePlayer(index, { battingHand: v })} />
                    </td>
                    <td className="py-4 px-3 min-w-[200px]">
                      <SelectBox
                        preferUp
                        value={p.bowlingType || (p.id ? DOES_NOT_BOWL : '')}
                        placeholder="Select Bowling Type"
                        options={toOptions(BOWLING_TYPES)}
                        onChange={(v) => updatePlayer(index, { bowlingType: v })}
                      />
                    </td>
                    <td className="py-4 px-6 text-center">
                      <button
                        onClick={() => setPlayers((prev) => prev.filter((_, i) => i !== index))}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                        aria-label="Remove player"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col items-center pb-8">
        <button
          onClick={() => setPlayers((prev) => [...prev, emptyPlayer()])}
          className="bg-[#0F1117] hover:bg-slate-800 text-white px-24 py-3.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
        >
          <UserPlus size={18} /> Add Player
        </button>
        {players.length < SQUAD_SIZE && (
          <p className="mt-2 text-sm text-slate-500 font-medium">
            Please add at least {SQUAD_SIZE} squad members. currently ({players.length}/{SQUAD_SIZE} added)
          </p>
        )}
      </div>

      <StatusModal
        isOpen={showSuccess}
        onClose={() => setShowSuccess(false)}
        type="success"
        title="Squad Saved"
        message={`${teamName}'s squad has been saved.`}
      />
    </div>
  );
}
