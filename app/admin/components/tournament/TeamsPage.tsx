"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, PlusCircle, ChevronLeft, ChevronRight, Pencil, Trash2, X } from 'lucide-react';
import { TournamentDetail, Team } from '../../types/tournament';
import useGoBack from '../../hooks/useGoBack';
import AddTeamsModal from './AddTeamsModal';
import GenerateFixtureModal from './GenerateFixtureModal';
import StatusModal from '@/app/components/auth/StatusModal';
import { friendlyError } from '../../utils/friendlyError';

interface TeamsPageProps {
  tournamentId: string;
}

interface StandingRow {
  teamId: string;
  code: string;
  name: string;
  matches: number;
  won: number;
  lost: number;
  nrr: string;
  points: number;
}

// Confirmed shape from a real `/standings/overall` response: the row itself
// carries matches_played/wins/losses/points/net_run_rate, while the team's
// own name/short_name sit nested under `row.team`.
interface RawStandingRow {
  team_id?: string;
  matches_played?: number;
  wins?: number;
  losses?: number;
  points?: number;
  net_run_rate?: string;
  team?: { id?: string; name?: string; short_name?: string };
}

const normalizeStanding = (row: RawStandingRow, index: number): StandingRow => {
  const team = row.team || {};
  return {
    teamId: row.team_id || team.id || String(index),
    code: team.short_name || (team.name || '').slice(0, 3).toUpperCase() || 'N/A',
    name: team.name || 'Unknown',
    matches: row.matches_played ?? 0,
    won: row.wins ?? 0,
    lost: row.losses ?? 0,
    nrr: row.net_run_rate ?? '0.000',
    points: row.points ?? 0,
  };
};

const AVATAR_COLORS = ['bg-red-100 text-red-700', 'bg-yellow-100 text-yellow-700', 'bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-purple-100 text-purple-700'];

export default function TeamsPage({ tournamentId }: TeamsPageProps) {
  const router = useRouter();
  const goBack = useGoBack('/admin/tournament');
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isGroupMode, setIsGroupMode] = useState(true);
  const [isAddTeamsOpen, setIsAddTeamsOpen] = useState(false);
  const [isGenerateFixtureOpen, setIsGenerateFixtureOpen] = useState(false);
  const [fixturesExist, setFixturesExist] = useState(false);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [loadingStandings, setLoadingStandings] = useState(true);
  const itemsPerPage = 14; // 7 columns * 2 rows

  // Rename / delete a team — PATCH / DELETE /tournaments/:externalId/teams/:teamId
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null);
  const [teamActionBusy, setTeamActionBusy] = useState(false);
  const [teamActionError, setTeamActionError] = useState('');
  const [teamStatus, setTeamStatus] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null);

  const fetchTournament = useCallback(async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/tournaments/${tournamentId}`, {
        method: 'GET',
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setTournament(data);
      }
    } catch (error) {
      console.error('Error fetching tournament:', error);
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchTournament();
  }, [fetchTournament]);

  // Teams live in the scoring service, keyed by the tournament's
  // externalTournamentId — not the core tournamentId — so this can only run
  // once the tournament header has loaded.
  const fetchTeams = useCallback(async (externalId: string) => {
    setLoadingTeams(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/tournaments/${externalId}/teams`,
        {
          method: 'GET',
          headers: { 'ngrok-skip-browser-warning': 'true', 'Content-Type': 'application/json' },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setTeams(Array.isArray(data) ? data : data?.teams || []);
      }
    } catch (error) {
      console.error('Error fetching teams:', error);
    } finally {
      setLoadingTeams(false);
    }
  }, []);

  useEffect(() => {
    if (tournament?.externalTournamentId) {
      fetchTeams(tournament.externalTournamentId);
    } else if (tournament) {
      // Tournament loaded but has no externalTournamentId — nothing to fetch.
      setLoadingTeams(false);
    }
  }, [tournament, fetchTeams]);

  // Check whether fixtures have already been generated for this tournament,
  // so "Generate Fixture" can be disabled instead of letting it run twice.
  const checkFixturesExist = useCallback(async (externalId: string) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/tournaments/${externalId}/matches`,
        {
          method: 'GET',
          headers: { 'ngrok-skip-browser-warning': 'true', 'Content-Type': 'application/json' },
        }
      );
      if (response.ok) {
        const data = await response.json();
        const list = Array.isArray(data) ? data : data?.matches || [];
        setFixturesExist(list.length > 0);
      }
    } catch (error) {
      console.error('Error checking existing fixtures:', error);
    }
  }, []);

  useEffect(() => {
    if (tournament?.externalTournamentId) {
      checkFixturesExist(tournament.externalTournamentId);
    }
  }, [tournament, checkFixturesExist]);

  const fetchStandings = useCallback(async (externalId: string) => {
    setLoadingStandings(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/tournaments/${externalId}/standings/overall`,
        {
          method: 'GET',
          headers: { 'ngrok-skip-browser-warning': 'true', 'Content-Type': 'application/json' },
        }
      );
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched standings:', data);
        const list = Array.isArray(data) ? data : data?.standings || data?.data || [];
        setStandings(list.map(normalizeStanding));
      }
    } catch (error) {
      console.error('Error fetching standings:', error);
    } finally {
      setLoadingStandings(false);
    }
  }, []);

  useEffect(() => {
    if (tournament?.externalTournamentId) {
      fetchStandings(tournament.externalTournamentId);
    } else if (tournament) {
      setLoadingStandings(false);
    }
  }, [tournament, fetchStandings]);

  const teamUrl = (team: Team) =>
    `${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/tournaments/${tournament?.externalTournamentId}/teams/${team.id}`;

  const errorFrom = async (res: Response, fallback: string) => {
    const data = await res.json().catch(() => null);
    return friendlyError(data?.error || data?.message, fallback, res.status);
  };

  const handleRenameTeam = async () => {
    if (!editingTeam || !tournament?.externalTournamentId) return;
    const name = editName.trim();
    if (!name) {
      setTeamActionError('Team name cannot be empty.');
      return;
    }
    if (name === editingTeam.name) {
      setEditingTeam(null);
      return;
    }
    setTeamActionBusy(true);
    setTeamActionError('');
    try {
      const res = await fetch(teamUrl(editingTeam), {
        method: 'PATCH',
        headers: { 'ngrok-skip-browser-warning': 'true', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        setTeamActionError(await errorFrom(res, "We couldn't update the team name. Please try again."));
        return;
      }
      setEditingTeam(null);
      await fetchTeams(tournament.externalTournamentId);
      fetchStandings(tournament.externalTournamentId);
      setTeamStatus({ type: 'success', title: 'Team Updated', message: `The team is now named "${name}".` });
    } catch (error) {
      console.error('Error updating team:', error);
      setTeamActionError(friendlyError('failed to fetch'));
    } finally {
      setTeamActionBusy(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!deletingTeam || !tournament?.externalTournamentId) return;
    setTeamActionBusy(true);
    setTeamActionError('');
    try {
      const res = await fetch(teamUrl(deletingTeam), {
        method: 'DELETE',
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
      if (!res.ok) {
        setTeamActionError(await errorFrom(res, "We couldn't delete the team. Please try again."));
        return;
      }
      const deletedName = deletingTeam.name;
      setDeletingTeam(null);
      await fetchTeams(tournament.externalTournamentId);
      fetchStandings(tournament.externalTournamentId);
      setTeamStatus({ type: 'success', title: 'Team Deleted', message: `"${deletedName}" has been removed from the tournament.` });
    } catch (error) {
      console.error('Error deleting team:', error);
      setTeamActionError(friendlyError('failed to fetch'));
    } finally {
      setTeamActionBusy(false);
    }
  };

  const calculateProgress = () => {
    if (!tournament || !tournament.startDate || !tournament.endDate) return 0;
    const now = new Date().getTime();
    const start = new Date(tournament.startDate).getTime();
    const end = new Date(tournament.endDate).getTime();
    if (now < start) return 0;
    if (now > end) return 100;
    return Math.round(((now - start) / (end - start)) * 100);
  };

  const filteredTeams = teams.filter((t) => t.name?.toLowerCase().includes(searchQuery.toLowerCase()));
  const totalPages = Math.ceil(filteredTeams.length / itemsPerPage) || 1;
  const currentItems = filteredTeams.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={goBack} className="text-gray-500 cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center text-[13px] font-medium text-slate-500">
            <button onClick={() => router.push('/admin/tournament')} className="cursor-pointer hover:underline hover:text-slate-900">Tournament</button> <span className="mx-2 text-slate-400">{'>'}</span>
            <span className="text-slate-900 font-medium">Teams</span>
          </div>
        </div>

        <div className="flex w-full sm:w-auto bg-white rounded-xl border border-slate-200 p-1">
          <button
            onClick={() => setIsGroupMode(true)}
            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg whitespace-nowrap transition-all ${
              isGroupMode ? 'bg-[#0F1117] text-white' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Group Tournament
          </button>
          <button
            onClick={() => setIsGroupMode(false)}
            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg whitespace-nowrap transition-all ${
              !isGroupMode ? 'bg-[#0F1117] text-white' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            League Tournament
          </button>
        </div>
      </div>

      {tournament && (
        <div className="w-full bg-white rounded-xl border border-slate-200 p-4 shadow-xs grid grid-cols-1 md:flex md:flex-row items-center gap-4">
          <div className="w-full md:flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900 truncate">{tournament.name}</h1>
          </div>
          <div className="hidden md:block h-8 w-[1px] bg-slate-200" />
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 flex-1 w-full">
            <span className="text-sm font-medium text-slate-700">{tournament.teamCount} Teams</span>
            <div className="text-slate-300 hidden sm:block">•</div>
            <span className="text-sm font-medium text-slate-700">{tournament.location}</span>
          </div>
          <div className="hidden md:block h-8 w-[1px] bg-slate-200" />
          <div className="w-full md:flex-1 flex justify-between md:justify-end items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
            <span className="text-sm font-medium text-slate-700">Tournament Progress -</span>
            <span className="text-md font-bold text-green-600">{calculateProgress()}% Complete</span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row justify-between items-center mb-6 gap-4">
          <h2 className="text-xl font-bold text-slate-900">Teams</h2>
          <div className="flex flex-col md:flex-row items-center gap-3 w-full lg:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search here"
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none text-gray-700"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <button
              onClick={() => setIsAddTeamsOpen(true)}
              disabled={teams.length >= (tournament?.teamCount ?? 0) || fixturesExist}
              title={
                fixturesExist
                  ? 'The fixture has already been generated — teams can no longer be added'
                  : teams.length >= (tournament?.teamCount ?? 0)
                  ? 'All teams have already been added'
                  : undefined
              }
              className="flex items-center gap-2 bg-[#0F1117] text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-800 transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#0F1117]"
            >
              <PlusCircle className="w-4 h-4" />
              Add Teams
            </button>
            <button
              onClick={() => router.push(`/admin/tournament/${tournamentId}/matches`)}
              className="bg-white border border-slate-200 text-slate-800 px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              View Matches
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-7 gap-4 mb-8">
          {loadingTeams ? (
            <div className="col-span-full py-16 text-center text-slate-400 animate-pulse">Loading teams...</div>
          ) : currentItems.length > 0 ? (
            currentItems.map((team, i) => (
              <div key={team.id} className="group relative flex flex-col items-center text-center border border-slate-100 rounded-2xl p-4 pt-12 sm:pt-11 bg-gray-50/30 hover:border-slate-200 hover:shadow-sm transition-all">
                <div className="absolute top-2 right-2 flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setEditingTeam(team);
                      setEditName(team.name);
                      setTeamActionError('');
                    }}
                    title="Edit team name"
                    aria-label="Edit team name"
                    className="w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 shadow-sm hover:bg-[#0F1117] hover:border-[#0F1117] hover:text-white active:scale-90 transition-all cursor-pointer"
                  >
                    <Pencil className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setDeletingTeam(team);
                      setTeamActionError('');
                    }}
                    title="Delete team"
                    aria-label="Delete team"
                    className="w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 shadow-sm hover:bg-red-500 hover:border-red-500 hover:text-white active:scale-90 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  </button>
                </div>
                {/* <p className="text-[11px] text-slate-400 mb-2 self-start">
                  Team ID - <span className="font-semibold text-slate-600">{team.id?.slice(-6) ?? '—'}</span>
                </p> */}
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm mb-2 ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                  {(team.shortName || team.name || '?').substring(0, 2).toUpperCase()}
                </div>
                <p className="text-sm font-semibold text-slate-800 leading-tight">{team.name}</p>
                {fixturesExist && (team.team_id || team.team?.id) && (
                  <button
                    onClick={() => router.push(`/admin/tournament/${tournamentId}/teams/${team.team_id || team.team?.id}/squad`)}
                    className="mt-3 flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#0F1117] hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> Add Players
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-100 rounded-2xl text-slate-400">
              No teams added yet. Click &quot;Add Teams&quot; to get started.
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mb-8">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-500 bg-white border border-gray-100 rounded-md disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex gap-1">
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-9 h-9 rounded-md text-sm font-semibold transition-all ${
                    currentPage === i + 1 ? 'bg-[#0F1117] text-white' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-500 bg-white border border-gray-100 rounded-md disabled:opacity-50"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex flex-col items-center gap-2">
          {fixturesExist ? (
            <>
              <p className="text-xs text-slate-600 font-medium">Fixture already generated — you can view matches.</p>
              <button
                onClick={() => router.push(`/admin/tournament/${tournamentId}/matches`)}
                className="bg-[#0F1117] text-white px-8 py-3.5 rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all cursor-pointer"
              >
                View Matches
              </button>
            </>
          ) : (
            <>
              {teams.length > 0 && teams.length < (tournament?.teamCount ?? 0) && (
                <p className="text-xs text-amber-600 font-medium">
                  Add all {tournament?.teamCount ?? 0} teams before generating the fixture — {teams.length} added so far.
                </p>
              )}
              <button
                disabled={teams.length === 0 || teams.length < (tournament?.teamCount ?? 0)}
                onClick={() => setIsGenerateFixtureOpen(true)}
                title={
                  teams.length < (tournament?.teamCount ?? 0)
                    ? `Add all ${tournament?.teamCount ?? 0} teams before generating the fixture (${teams.length} added so far)`
                    : undefined
                }
                className="bg-[#0F1117] text-white px-8 py-3.5 rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Generate Fixture
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-xs">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Points Table</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4 w-10">#</th>
                <th className="py-3 px-4">Team</th>
                <th className="py-3 px-4 text-right">Matches</th>
                <th className="py-3 px-4 text-right">Won</th>
                <th className="py-3 px-4 text-right">Lost</th>
                <th className="py-3 px-4 text-right">NRR</th>
                <th className="py-3 px-4 text-right">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm">
              {loadingStandings ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 animate-pulse">Loading standings...</td>
                </tr>
              ) : standings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">No standings available yet.</td>
                </tr>
              ) : (
                standings.map((row, i) => (
                  <tr key={row.teamId}>
                    <td className="py-3 px-4 text-slate-500">{i + 1}</td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 mr-2">{row.code}</span>
                      <span className="text-slate-600">{row.name}</span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700">{row.matches}</td>
                    <td className="py-3 px-4 text-right font-semibold text-green-600">{row.won}</td>
                    <td className="py-3 px-4 text-right font-semibold text-red-600">{row.lost}</td>
                    <td className="py-3 px-4 text-right text-slate-700">{row.nrr}</td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">{row.points}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit team name */}
      {editingTeam && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-[420px] max-h-[90vh] overflow-y-auto rounded-[28px] shadow-2xl relative p-6 sm:p-8">
            <button
              onClick={() => setEditingTeam(null)}
              className="absolute top-5 right-5 p-2 rounded-full hover:bg-slate-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
            <h2 className="text-xl font-bold text-slate-900 mb-5">Edit Team Name</h2>
            <label className="block text-sm font-semibold text-slate-500 mb-1.5">Team Name</label>
            <input
              autoFocus
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRenameTeam()}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-sm text-gray-700"
            />
            {teamActionError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 text-left">{teamActionError}</div>
            )}
            <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
              <button
                onClick={() => setEditingTeam(null)}
                disabled={teamActionBusy}
                className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameTeam}
                disabled={teamActionBusy}
                className="flex-1 py-3 rounded-2xl bg-[#0F1117] text-white font-bold text-sm hover:bg-slate-800 transition-all disabled:opacity-50"
              >
                {teamActionBusy ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletingTeam && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-[420px] max-h-[90vh] overflow-y-auto rounded-[28px] shadow-2xl p-6 sm:p-8 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-7 h-7 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Delete Team</h2>
            <p className="text-sm text-slate-600">
              Are you sure you want to delete <span className="font-bold text-slate-900">{deletingTeam.name}</span>? This can&apos;t be undone.
            </p>
            {teamActionError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 text-left">{teamActionError}</div>
            )}
            <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
              <button
                onClick={() => setDeletingTeam(null)}
                disabled={teamActionBusy}
                className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteTeam}
                disabled={teamActionBusy}
                className="flex-1 py-3 rounded-2xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-all disabled:opacity-50"
              >
                {teamActionBusy ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <StatusModal
        isOpen={!!teamStatus}
        onClose={() => setTeamStatus(null)}
        type={teamStatus?.type || 'success'}
        title={teamStatus?.title || ''}
        message={teamStatus?.message || ''}
      />

      <AddTeamsModal
        isOpen={isAddTeamsOpen}
        onClose={() => setIsAddTeamsOpen(false)}
        tournamentExternalId={tournament?.externalTournamentId || ''}
        teamCount={tournament?.teamCount ?? 0}
        addedTeams={teams}
        onTeamsAdded={() => tournament?.externalTournamentId && fetchTeams(tournament.externalTournamentId)}
      />

      <GenerateFixtureModal
        isOpen={isGenerateFixtureOpen}
        onClose={() => setIsGenerateFixtureOpen(false)}
        tournamentExternalId={tournament?.externalTournamentId || ''}
        teams={teams}
        grounds={tournament?.grounds || []}
        isGroupMode={isGroupMode}
        startDate={tournament?.startDate}
        onGenerated={() => {
          setFixturesExist(true);
          router.push(`/admin/tournament/${tournamentId}/matches`);
        }}
      />
    </div>
  );
}
