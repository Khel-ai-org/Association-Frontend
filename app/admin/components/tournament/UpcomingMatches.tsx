"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ChevronLeft, ChevronRight, Users, MapPin, FileSpreadsheet, CalendarClock } from 'lucide-react';
import { Fixture, Ground } from '../../types/tournament';
import ScheduleMatchModal from './ScheduleMatchModal';

interface TournamentDetails {
  name: string;
  teamCount: number;
  location: string;
  startDate: string;
  endDate: string;
  // Scoring service's own tournament id — fixtures/schedule calls must key
  // off this, not the core tournamentId prop.
  externalTournamentId?: string;
  grounds?: Ground[];
}

interface Match {
  id: string;
  match_id: number;
  name: string;
  date: string | null;
  match_no?: string;
  ground_id?: string;
  scoring_match_id?: string;
  team1: string;
  team2: string;
  score1: string;
  score2: string;
  statusText: string;
  type: string;
  isLive: boolean;
  time: string;
  sortOrder: number;
  statusLabel?: string;
  badgeColor?: string;
}

// Unified row shown in the table: either a fixture linked to a real live
// match, a fixture still awaiting scheduling, or a legacy core match record
// with no fixture behind it at all.
interface MatchRow {
  key: string;
  linkId: string | null; // navigate to match details using this id directly
  matchLabel: string;
  team1: string;
  team2: string;
  date: string | null;
  time: string;
  statusLabel: string;
  badgeColor: string;
  type: string;
  searchText: string;
  isLinked: boolean; // true = "Already Scheduled" (match + match_id present); false = needs "Schedule Match"
  groundId?: string;
  fixture?: Fixture;
}

interface UpcomingMatchesProps {
  tournamentId: string | null;
  selectedGroundId?: string | null;
  selectedMatchId?: string | null;
  onSelectMatch?: (id: string) => void;
}

const UpcomingMatches: React.FC<UpcomingMatchesProps> = ({
  tournamentId,
  selectedGroundId,
  selectedMatchId,
}) => {
  const router = useRouter();
  const [tournament, setTournament] = useState<TournamentDetails | null>(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [scheduleFixture, setScheduleFixture] = useState<Fixture | null>(null);

  const itemsPerPage = 12;
  const filters = ['All', 'Live', 'Upcoming', 'Finished'];

  // --- Fetch Tournament Details ---
  useEffect(() => {
    const fetchTournamentDetails = async () => {
      if (!tournamentId) return;
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/tournaments/${tournamentId}`, {
          method: 'GET',
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setTournament(data);
        }
      } catch (error) {
        console.error("Error fetching tournament details:", error);
      }
    };

    fetchTournamentDetails();
  }, [tournamentId]);

  // --- Progress Calculation ---
  const calculateProgress = () => {
    if (!tournament || !tournament.startDate || !tournament.endDate) return 0;
    const now = new Date().getTime();
    const start = new Date(tournament.startDate).getTime();
    const end = new Date(tournament.endDate).getTime();

    if (now < start) return 0;
    if (now > end) return 100;

    const total = end - start;
    const elapsed = now - start;
    return Math.round((elapsed / total) * 100);
  };

  // --- Fetch core-API admin match records (existing, unchanged) ---
  const fetchMatches = async () => {
    if (!tournamentId) {
      setMatches([]);
      return;
    }

    setLoading(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_Backend_URL}/matches/tournament/${tournamentId}`;
      if (selectedGroundId) url += `?groundId=${selectedGroundId}`;

      const response = await fetch(url, { method: 'GET', credentials: 'include' });
      const data = await response.json();

      const processedData = (Array.isArray(data) ? data : [])
        .map((match: any) => {
          const now = new Date();
          const matchDate = match.date ? new Date(match.date) : null;

          let statusLabel = "Upcoming";
          let badgeColor = "bg-green-500";
          let sortOrder = 2;

          if (matchDate) {
            const isToday = matchDate.toDateString() === now.toDateString();
            const isPast = matchDate < now && !isToday;

            if (isToday) {
              statusLabel = "Live";
              badgeColor = "bg-[#D11B1B]";
              sortOrder = 1;
            } else if (isPast) {
              statusLabel = "Finished";
              badgeColor = "bg-slate-500";
              sortOrder = 3;
            }
          }

          const teams = match.name?.split(' vs ') || ["T1", "T2"];
          return {
            ...match,
            team1: teams[0] || "T1",
            team2: teams[1] || "T2",
            time: matchDate ? matchDate.toLocaleDateString('en-GB') : "TBD",
            statusLabel,
            badgeColor,
            sortOrder,
            type: statusLabel
          };
        });

      processedData.sort((a: Match, b: Match) => a.sortOrder - b.sortOrder);
      setMatches(processedData);
    } catch (error) {
      console.error("Error fetching matches:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, selectedGroundId]);

  // --- Fetch scoring-API fixtures (new) ---
  // Fixtures live in the scoring service, keyed by the tournament's
  // externalTournamentId — not the core tournamentId — so this can only run
  // once the tournament header has loaded.
  const fetchFixtures = async (externalId: string) => {
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
        console.log("Fetched fixtures:", data);
        setFixtures(Array.isArray(data) ? data : data?.matches || []);
      }
    } catch (error) {
      console.error("Error fetching fixtures:", error);
    }
  };

  useEffect(() => {
    if (tournament?.externalTournamentId) {
      fetchFixtures(tournament.externalTournamentId);
    } else {
      setFixtures([]);
    }
  }, [tournament?.externalTournamentId]);

  const handleExport = () => {
    window.location.href = `${process.env.NEXT_PUBLIC_Backend_URL}/export/auth?tournamentId=${tournamentId}`;
  };

  // 'semifinal_1' -> 'Semifinal 1', 'eliminator' -> 'Eliminator'
  const formatMatchType = (type: string) =>
    type
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  // --- Build rows directly from scoring-API fixtures ---
  // A fixture is only "Already Scheduled" once BOTH `match` and `match_id`
  // are populated (i.e. it's been linked to a real live/scoreable match) —
  // navigate to match details using `match_id` directly, no lookup needed.
  // Until then, `venue`/`scheduled_date` may already be set (round-robin at
  // generation time), which is shown in its own Venue column, not the Action
  // column — the Action column only reflects link status.
  const rows: MatchRow[] = useMemo(() => {
    const linkedMatchIds = new Set<string>();

    const fixtureRows: MatchRow[] = fixtures.map((fixture) => {
      const isLinked = !!(fixture.match && fixture.match_id);
      if (isLinked && fixture.match_id) linkedMatchIds.add(fixture.match_id);

      const label = fixture.group
        ? `Match ${fixture.match_number} (${fixture.group.name})`
        : fixture.match_type !== 'group'
        ? `Match ${fixture.match_number} (${formatMatchType(fixture.match_type)})`
        : `Match ${fixture.match_number}`;

      const team1 = fixture.home_team?.name || 'TBD';
      const team2 = fixture.away_team?.name || 'TBD';

      let statusLabel = 'Upcoming';
      let badgeColor = 'bg-green-500';
      let type = 'Upcoming';
      if (isLinked) {
        // Once linked, the nested live match's own `status` field is the
        // real source of truth — not this fixture/schedule row's own status.
        const liveStatus = fixture.match?.status;
        const normalized = typeof liveStatus === 'string' ? liveStatus.toLowerCase() : '';
        if (normalized === 'in_progress' || normalized === 'live') {
          statusLabel = 'Live';
          badgeColor = 'bg-[#D11B1B]';
          type = 'Live';
        } else if (normalized === 'completed' || normalized === 'finished') {
          statusLabel = 'Completed';
          badgeColor = 'bg-emerald-600';
          type = 'Finished';
        } else if (typeof liveStatus === 'string' && liveStatus) {
          statusLabel = formatMatchType(liveStatus);
        }
      }

      return {
        key: `fixture-${fixture.id}`,
        linkId: isLinked ? fixture.match_id : null,
        matchLabel: label,
        team1,
        team2,
        date: fixture.scheduled_date,
        time: fixture.scheduled_date ? new Date(fixture.scheduled_date).toLocaleDateString('en-GB') : 'TBD',
        statusLabel,
        badgeColor,
        type,
        searchText: `${fixture.match_number} ${team1} ${team2}`,
        isLinked,
        groundId: fixture.venue || undefined,
        fixture,
      };
    });

    // Legacy core match records not linked to any fixture — render as before.
    const legacyRows: MatchRow[] = matches
      .filter((m) => !(m.scoring_match_id && linkedMatchIds.has(m.scoring_match_id)))
      .map((m) => ({
        key: `match-${m.id}`,
        linkId: m.id,
        matchLabel: `Match ${m.match_id}`,
        team1: m.team1,
        team2: m.team2,
        date: m.date,
        time: m.time,
        statusLabel: m.statusLabel || 'Upcoming',
        badgeColor: m.badgeColor || 'bg-green-500',
        type: m.statusLabel || 'Upcoming',
        searchText: `${m.match_id} ${m.team1} ${m.team2}`,
        isLinked: true,
        groundId: m.ground_id,
      }));

    return [...fixtureRows, ...legacyRows];
  }, [matches, fixtures]);

  // Search & Filter Logic
  const filtered = rows.filter((r) => {
    const matchesSearch = r.searchText.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === 'All' || r.type === activeFilter;
    return matchesSearch && matchesFilter;
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const currentItems = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6">
      {/* Tournament Header */}
      {tournament && (
       <div className="w-full bg-white rounded-xl border border-slate-200 p-4 shadow-xs grid grid-cols-1 md:flex md:flex-row items-center gap-4">
  <div className="w-full md:flex-1 min-w-0">
    <h1 className="text-lg font-bold text-slate-900 truncate">{tournament.name}</h1>
  </div>
  <div className="hidden md:block h-8 w-[1px] bg-slate-200" />
  <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 flex-1 w-full">
    <div className="flex items-center gap-2 text-slate-700 whitespace-nowrap">
      <Users className="w-5 h-5 text-slate-400" />
      <span className="text-sm font-medium">{tournament.teamCount} Teams</span>
    </div>
    <div className="text-slate-300 hidden sm:block">•</div>
    <div className="flex items-center gap-2 text-slate-700 whitespace-nowrap">
      <MapPin className="w-5 h-5 text-slate-400" />
      <span className="text-sm font-medium">{tournament.location}</span>
    </div>
  </div>
  <div className="hidden md:block h-8 w-[1px] bg-slate-200" />
  <div className="w-full md:flex-1 flex justify-between md:justify-end items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
    <span className="text-sm font-medium text-slate-700 whitespace-nowrap">Tournament Progress -</span>
    <span className="text-md font-bold text-green-600">{calculateProgress()}% Complete</span>
  </div>
</div>
      )}

      {/* Matches Content */}
      <div className="w-full bg-white rounded-[24px] border border-slate-100 p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row justify-between items-center mb-2 gap-4">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Matches
          </h2>

          <div className="flex flex-col md:flex-row items-center gap-4 w-full lg:w-auto">
            <div className="flex gap-2">
              {/* <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {exporting ? 'Exporting...' : 'Export'}
              </button> */}
              <Link
                href={`/admin/appealAnalysis/${tournamentId}?name=${encodeURIComponent(tournament?.name || '')}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-all cursor-pointer shadow-xs"
              >
                Appeal Analysis
              </Link>
            </div>

            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700 w-4 h-4" />
              <input
                type="text"
                placeholder="Search match ID or teams..."
                className="w-full pl-10 pr-4 py-2 text-gray-700 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              />
            </div>

            <div className="flex bg-slate-50 rounded-xl border border-slate-100 p-1 w-full md:w-auto">
              {filters.map((filter) => (
                <button
                  key={filter}
                  onClick={() => { setActiveFilter(filter); setCurrentPage(1); }}
                  className={`flex-1 md:flex-none px-4 py-1.5 text-sm font-medium transition-all rounded-lg ${
                    activeFilter === filter
                      ? 'bg-white shadow-sm text-slate-700 border border-slate-100'
                      : 'text-slate-700 hover:text-slate-600'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Fixture / Match Table */}
        <div className="overflow-x-auto mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="py-3 px-3 font-semibold">Match Details</th>
                <th className="py-3 px-3 font-semibold">Matchup</th>
                {/* <th className="py-3 px-3 font-semibold">Venue</th> */}
                <th className="py-3 px-3 font-semibold">Date/Time</th>
                <th className="py-3 px-3 font-semibold">Status</th>
                <th className="py-3 px-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400 animate-pulse">Loading matches...</td>
                </tr>
              ) : currentItems.length > 0 ? (
                currentItems.map((row) => {
                  const rowContent = (
                    <>
                      <td className="py-4 px-3 font-medium text-slate-800">{row.matchLabel}</td>
                      <td className="py-4 px-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-yellow-300 flex items-center justify-center text-[9px] font-bold text-slate-900">
                            {row.team1.substring(0, 2).toUpperCase()}
                          </span>
                          <span className="font-medium text-slate-700 text-xs">{row.team1}</span>
                          <span className="text-slate-400 text-xs">vs</span>
                          <span className="w-6 h-6 rounded-full bg-indigo-300 flex items-center justify-center text-[9px] font-bold text-slate-900">
                            {row.team2.substring(0, 2).toUpperCase()}
                          </span>
                          <span className="font-medium text-slate-700 text-xs">{row.team2}</span>
                        </div>
                      </td>
                      {/* <td className="py-4 px-3">
                        <span className="text-slate-500 text-xs">
                          {row.groundId ? tournament?.grounds?.find((g) => g.id === row.groundId)?.name || row.groundId : '—'}
                        </span>
                      </td> */}
                      <td className="py-4 px-3 text-slate-600">{row.time}</td>
                      <td className="py-4 px-3">
                        <span className={`text-white text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wider ${row.badgeColor}`}>
                          {row.statusLabel}
                        </span>
                      </td>
                      <td className="py-4 px-3">
                        {row.isLinked ? (
                          <span className="text-emerald-600 text-xs font-semibold">Already Scheduled</span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setScheduleFixture(row.fixture || null);
                            }}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-semibold"
                          >
                            <CalendarClock className="w-3.5 h-3.5" /> Schedule Match →
                          </button>
                        )}
                      </td>
                    </>
                  );

                  return (
                    <tr
                      key={row.key}
                      onClick={() => row.linkId && router.push(`/admin/ground/matchdetail/${row.linkId}?status=${encodeURIComponent(row.statusLabel)}`)}
                      className={`border-b border-slate-50 transition-colors ${
                        row.linkId ? 'hover:bg-slate-50/70 cursor-pointer' : ''
                      } ${selectedMatchId === row.linkId ? 'bg-blue-50/50' : ''}`}
                    >
                      {rowContent}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-50 rounded-3xl">
                    No {activeFilter.toLowerCase()} matches found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Section */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-6">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-900 bg-white border border-gray-100 rounded-md disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          <div className="flex gap-1">
            {[...Array(totalPages)].map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i + 1)}
                className={`w-9 h-9 rounded-md text-sm font-semibold transition-all ${
                  currentPage === i + 1
                    ? 'bg-[#0F1117] text-white shadow-md'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-900 bg-white border border-gray-100 rounded-md disabled:opacity-50"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <ScheduleMatchModal
        isOpen={!!scheduleFixture}
        onClose={() => setScheduleFixture(null)}
        fixture={scheduleFixture}
        tournamentId={tournamentId || ''}
        tournamentExternalId={tournament?.externalTournamentId || ''}
        grounds={tournament?.grounds || []}
        onScheduled={() => {
          fetchMatches();
          if (tournament?.externalTournamentId) fetchFixtures(tournament.externalTournamentId);
        }}
      />
    </div>
  );
};

export default UpcomingMatches;
