"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, PlusCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { TournamentDetail, Team } from '../../types/tournament';
import AddTeamsModal from './AddTeamsModal';
import GenerateFixtureModal from './GenerateFixtureModal';

interface TeamsPageProps {
  tournamentId: string;
}

const AVATAR_COLORS = ['bg-red-100 text-red-700', 'bg-yellow-100 text-yellow-700', 'bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-purple-100 text-purple-700'];

export default function TeamsPage({ tournamentId }: TeamsPageProps) {
  const router = useRouter();
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isGroupMode, setIsGroupMode] = useState(true);
  const [isAddTeamsOpen, setIsAddTeamsOpen] = useState(false);
  const [isGenerateFixtureOpen, setIsGenerateFixtureOpen] = useState(false);
  const itemsPerPage = 14; // 7 columns * 2 rows

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
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin/tournament')} className="text-gray-500 cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center text-[13px] font-medium text-slate-500">
            Tournament <span className="mx-2 text-slate-400">{'>'}</span>
            <span className="text-slate-900 font-medium">Teams</span>
          </div>
        </div>

        <div className="flex bg-white rounded-xl border border-slate-200 p-1">
          <button
            onClick={() => setIsGroupMode(true)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              isGroupMode ? 'bg-[#0F1117] text-white' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Group Tournament
          </button>
          <button
            onClick={() => setIsGroupMode(false)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
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
              className="flex items-center gap-2 bg-[#0F1117] text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-800 transition-colors whitespace-nowrap"
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
              <div key={team.id} className="flex flex-col items-center text-center border border-slate-100 rounded-2xl p-4 bg-gray-50/30">
                <p className="text-[11px] text-slate-400 mb-2 self-start">
                  Team ID - <span className="font-semibold text-slate-600">{team.id?.slice(-6) ?? '—'}</span>
                </p>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm mb-2 ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                  {(team.shortName || team.name || '?').substring(0, 2).toUpperCase()}
                </div>
                <p className="text-sm font-semibold text-slate-800 leading-tight">{team.name}</p>
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

        <div className="flex justify-center">
          <button
            disabled={teams.length === 0}
            onClick={() => setIsGenerateFixtureOpen(true)}
            className="bg-[#0F1117] text-white px-8 py-3.5 rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Generate Fixture
          </button>
        </div>
      </div>

      <AddTeamsModal
        isOpen={isAddTeamsOpen}
        onClose={() => setIsAddTeamsOpen(false)}
        tournamentExternalId={tournament?.externalTournamentId || ''}
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
        onGenerated={() => router.push(`/admin/tournament/${tournamentId}/matches`)}
      />
    </div>
  );
}
