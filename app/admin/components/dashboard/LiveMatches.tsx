// components/dashboard/LiveMatches.tsx
"use client"

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Fixture } from '../../types/tournament';

interface TournamentSummary {
  id: string;
  name: string;
  externalTournamentId?: string;
}

// One row per tournament fixture, flattened for display — built entirely
// from the scoring-API's own `/tournaments/:externalId/matches` fixtures,
// not from the core backend's `/matches/active-matches` aggregate endpoint.
interface DashboardMatch {
  key: string;
  linkId: string | null; // `fixture.match_id` once linked to a live match — null until then
  matchNumber: number;
  teamA: string;
  teamB: string;
  scheduledDate: string | null;
  status: 'Live' | 'Upcoming';
  tournamentId: string;
  tournamentName: string;
}

const SCORING_API_BASE = process.env.NEXT_PUBLIC_SCORING_API_URL || "http://localhost:5500/api/v1";

export default function LiveMatches() {
  const [dashboardMatches, setDashboardMatches] = useState<DashboardMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        // 1. List every tournament this association can see.
        const listRes = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/tournaments/my-association`, {
          method: 'GET',
          credentials: 'include',
        });
        if (!listRes.ok) return;
        const listJson = await listRes.json();
        const tournaments: TournamentSummary[] = listJson?.data || [];

        // 2. Backfill `externalTournamentId` for any tournament the list
        // response didn't already include it on (fixtures are keyed by this,
        // not the core `id`).
        const resolved = await Promise.all(
          tournaments.map(async (t) => {
            if (t.externalTournamentId) return t;
            try {
              const detailRes = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/tournaments/${t.id}`, {
                method: 'GET',
                credentials: 'include',
              });
              if (detailRes.ok) {
                const detail = await detailRes.json();
                return { ...t, externalTournamentId: detail.externalTournamentId };
              }
            } catch (error) {
              console.error(`Failed to resolve externalTournamentId for tournament ${t.id}:`, error);
            }
            return t;
          })
        );

        // 3. Fetch fixtures for every tournament that has a resolved external id.
        const fixtureResults = await Promise.all(
          resolved
            .filter((t) => t.externalTournamentId)
            .map(async (t) => {
              try {
                const res = await fetch(
                  `${SCORING_API_BASE}/api/v1/tournaments/${t.externalTournamentId}/matches`,
                  {
                    method: 'GET',
                    headers: { 'ngrok-skip-browser-warning': 'true', 'Content-Type': 'application/json' },
                  }
                );
                if (!res.ok) return [];
                const data = await res.json();
                const fixtures: Fixture[] = Array.isArray(data) ? data : data?.matches || [];
                return fixtures.map((fixture) => ({ fixture, tournament: t }));
              } catch (error) {
                console.error(`Failed to fetch fixtures for tournament ${t.id}:`, error);
                return [];
              }
            })
        );

        // 4. Flatten, derive Live/Upcoming status, drop anything Finished.
        const withStatus = fixtureResults.flat().map(({ fixture, tournament }) => {
          const isLinked = !!(fixture.match && fixture.match_id);
          const liveStatus = isLinked && typeof fixture.match?.status === 'string'
            ? fixture.match.status.toLowerCase()
            : '';
          return { fixture, tournament, isLinked, liveStatus };
        });

        const flattened: DashboardMatch[] = withStatus
          .filter(({ liveStatus }) => liveStatus !== 'completed' && liveStatus !== 'finished')
          .map(({ fixture, tournament, isLinked, liveStatus }) => ({
            key: fixture.id,
            linkId: isLinked ? fixture.match_id : null,
            matchNumber: fixture.match_number,
            teamA: fixture.home_team?.name || 'TBD',
            teamB: fixture.away_team?.name || 'TBD',
            scheduledDate: fixture.scheduled_date,
            status: (liveStatus === 'in_progress' || liveStatus === 'live' ? 'Live' : 'Upcoming') as DashboardMatch['status'],
            tournamentId: tournament.id,
            tournamentName: tournament.name,
          }))
          .sort((a, b) => {
            if (!a.scheduledDate) return 1;
            if (!b.scheduledDate) return -1;
            return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
          });

        setDashboardMatches(flattened);
      } catch (error) {
        console.error("Failed to fetch live/upcoming matches:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const filteredMatches = useMemo(() => {
    return dashboardMatches.filter((m) => {
      const searchTerm = searchQuery.toLowerCase();
      return (
        m.teamA.toLowerCase().includes(searchTerm) ||
        m.teamB.toLowerCase().includes(searchTerm) ||
        m.matchNumber?.toString().includes(searchTerm)
      );
    });
  }, [dashboardMatches, searchQuery]);

  const uniqueTournamentIds = Array.from(new Set(dashboardMatches.map((m) => m.tournamentId)));
  const viewAllHref = uniqueTournamentIds.length === 1
    ? `/admin/tournament/${uniqueTournamentIds[0]}`
    : `/admin/tournament`;

  if (loading) return <div className="p-10 text-center animate-pulse">Loading matches...</div>;

  return (
    <div className="bg-white p-4 md:p-5 rounded-[24px] border border-slate-100 shadow-xs">
      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
        <h2 className="text-lg font-bold text-[#0D0D12] whitespace-nowrap">Live & Upcoming Matches</h2>

        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
          <div className="relative flex-grow sm:flex-grow-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by ID or Team..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-lg w-full sm:w-64 transition-all text-slate-500"
            />
          </div>
          <Link href={viewAllHref}>
            <button className="text-sm font-semibold text-slate-700 hover:text-black hover:underline cursor-pointer whitespace-nowrap">
              View all
            </button>
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-hide pb-2">
        <div className="flex flex-nowrap gap-4 md:gap-6">
          {filteredMatches.map((m) => {
            const isLive = m.status === 'Live';
            const teamA = m.teamA;
            const teamB = m.teamB;

            const card = (
              <div className="p-3 rounded-[20px] border border-slate-100 relative bg-gray-50/30 cursor-pointer hover:border-blue-200 hover:shadow-md transition-all h-full">
                <span className={`absolute top-4 left-1/2 -translate-x-1/2 text-white text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                  isLive ? 'bg-[#D11B1B]' : 'bg-green-500'
                }`}>
                  {m.status}
                </span>

                <p className="text-center text-[13px] text-black mt-6 mb-4 font-medium">Match {m.matchNumber}</p>

                <div className="flex justify-between items-center px-1">
                  <div className="text-center">
                    <div className="flex flex-row gap-2 sm:gap-4 items-center justify-center mb-1">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-yellow-300 rounded-full mb-2 mx-auto overflow-hidden flex items-center justify-center text-[10px] font-bold text-slate-900">
                        {teamA.substring(0, 2).toUpperCase()}
                      </div>
                      <p className="font-bold text-black text-xs sm:text-sm">{teamA}</p>
                    </div>
                  </div>

                  <span className="text-[#D23624] font-semibold text-[10px] sm:text-xs bg-white p-1.5 sm:p-2 rounded-full shadow-sm">Vs</span>

                  <div className="text-center">
                    <div className="flex flex-row gap-2 sm:gap-4 items-center justify-center mb-2">
                      <p className="font-bold text-black text-xs sm:text-sm">{teamB}</p>
                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-300 rounded-full mb-2 mx-auto overflow-hidden flex items-center justify-center text-[10px] font-bold text-slate-900">
                        {teamB.substring(0, 2).toUpperCase()}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 text-center">
                  <p className="text-[13px] sm:text-[15px] text-slate-900">
                    Date - {m.scheduledDate ? new Date(m.scheduledDate).toLocaleDateString('en-GB') : 'Date TBD'}
                  </p>
                  {uniqueTournamentIds.length > 1 && (
                    <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1 uppercase font-semibold">
                      {m.tournamentName}
                    </p>
                  )}
                </div>
              </div>
            );

            return (
              <div
                key={m.key}
                className="block transition-transform hover:scale-[1.02] active:scale-95 flex-none w-[280px] sm:w-[300px] md:w-[calc(33.33%-16px)] lg:w-[calc(25%-18px)]"
              >
                {m.linkId ? <Link href={`/admin/ground/matchdetail/${m.linkId}`}>{card}</Link> : card}
              </div>
            );
          })}

          {filteredMatches.length === 0 && (
             <div className="w-full py-10 text-center text-slate-400 italic">
                {searchQuery ? `No matches found matching "${searchQuery}"` : "No active or upcoming matches found."}
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
