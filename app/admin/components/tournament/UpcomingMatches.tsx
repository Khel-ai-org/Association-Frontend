"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ChevronLeft, ChevronRight, Users, MapPin, FileSpreadsheet, CalendarClock, CalendarDays, X } from 'lucide-react';
import { Fixture, Ground } from '../../types/tournament';
import ScheduleMatchModal from './ScheduleMatchModal';
import { getTournamentLifecycleStatus, TOURNAMENT_STATUS_BADGE, formatTournamentDateRange } from '../../utils/tournamentStatus';

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
  matchType: string; // format of the linked live match (T10 / T20 / ODI / Test); '' until the match is scheduled
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

// 't10' -> 'T10', 'test' -> 'Test'
const formatMatchFormat = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  return text.toLowerCase() === 'test' ? 'Test' : text.toUpperCase();
};

// "YYYY-MM-DD" of an ISO date-time in the user's local timezone.
const toLocalDayKey = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const UpcomingMatches: React.FC<UpcomingMatchesProps> = ({
  tournamentId,
  selectedGroundId,
  selectedMatchId,
}) => {
  const router = useRouter();
  const [tournament, setTournament] = useState<TournamentDetails | null>(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState("");
  // Day-wise filter: a plain "YYYY-MM-DD" (empty = all days).
  const [dayFilter, setDayFilter] = useState('');
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [scheduleFixture, setScheduleFixture] = useState<Fixture | null>(null);
  // Ticks so a scheduled match's "Starts at ..." flips to "Start Match" on its own.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const itemsPerPage = 12;
  const filters = ['All', 'Live', 'Upcoming', 'Expired', 'Finished', 'Abandoned'];

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

  // --- Fetch scoring-API fixtures (new) ---
  // Fixtures live in the scoring service, keyed by the tournament's
  // externalTournamentId — not the core tournamentId — so this can only run
  // once the tournament header has loaded.
  const fetchFixtures = async (externalId: string) => {
    setLoading(true);
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
    } finally {
      setLoading(false);
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
    const fixtureRows: MatchRow[] = fixtures.map((fixture) => {
      const isLinked = !!(fixture.match && fixture.match_id);

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
        } else if (normalized === 'abandoned') {
          statusLabel = 'Abandoned';
          badgeColor = 'bg-gray-700';
          type = 'Abandoned';
        } else if (typeof liveStatus === 'string' && liveStatus) {
          // Any other real, already-known status (Cancelled, No Result,
          // etc.) — not "never happened", so it must NOT fall into the
          // Expired check below. `type` has to move off 'Upcoming' here too,
          // not just `statusLabel`, or the date check below clobbers it.
          statusLabel = formatMatchType(liveStatus);
          badgeColor = 'bg-slate-500';
          type = statusLabel;
        }
      }
      // Still sitting as "Upcoming" (no real status was ever recorded) but
      // either its own scheduled date has passed, or the whole tournament
      // has already ended — surface that as its own state instead of
      // silently calling it "Upcoming" forever.
      const tournamentEnded = !!tournament?.endDate && new Date(tournament.endDate) < new Date();
      // Compare against the end of the scheduled (local) day — the match must
      // still be startable after its scheduled time today.
      const scheduledDay = fixture.scheduled_date ? new Date(fixture.scheduled_date) : null;
      if (scheduledDay) scheduledDay.setHours(23, 59, 59, 999);
      const matchDatePassed = !!scheduledDay && scheduledDay < new Date();
      if (type === 'Upcoming' && (matchDatePassed || tournamentEnded)) {
        statusLabel = 'Expired';
        badgeColor = 'bg-amber-600';
        type = 'Expired';
      }

      return {
        key: `fixture-${fixture.id}`,
        linkId: isLinked ? fixture.match_id : null,
        matchLabel: label,
        team1,
        team2,
        date: fixture.scheduled_date,
        time: fixture.scheduled_date
          ? `${new Date(fixture.scheduled_date).toLocaleDateString('en-GB')}, ${new Date(fixture.scheduled_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
          : 'TBD',
        statusLabel,
        badgeColor,
        type,
        matchType: formatMatchFormat(fixture.match?.match_type),
        searchText: `${fixture.match_number} ${team1} ${team2}`,
        isLinked,
        groundId: fixture.venue || undefined,
        fixture,
      };
    });

    return fixtureRows;
  }, [fixtures, tournament?.endDate]);

  // Search & Filter Logic
  const filtered = rows.filter((r) => {
    const matchesSearch = r.searchText.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === 'All' || r.type === activeFilter;
    // Compare on the user's local calendar day, same as the Date/Time column.
    const matchesDay = !dayFilter || (!!r.date && toLocalDayKey(r.date) === dayFilter);
    return matchesSearch && matchesFilter && matchesDay;
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const currentItems = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6">
      {/* Tournament Header */}
      {tournament && (
        <div className="w-full bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex items-center gap-2 shrink-0">
              <h1 className="text-lg font-bold text-slate-900 break-words">{tournament.name}</h1>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-md shrink-0 ${TOURNAMENT_STATUS_BADGE[getTournamentLifecycleStatus(tournament.startDate, tournament.endDate)]}`}>
                {getTournamentLifecycleStatus(tournament.startDate, tournament.endDate)}
              </span>
            </div>
            <div className="hidden lg:block h-8 w-[1px] bg-slate-200 shrink-0" />
            <div className="flex items-center gap-2 text-slate-700 whitespace-nowrap shrink-0">
              <Users className="w-5 h-5 text-slate-400" />
              <span className="text-sm font-medium">{tournament.teamCount} Teams</span>
            </div>
            <div className="text-slate-300 shrink-0 hidden sm:block">•</div>
            <div className="flex items-center gap-2 text-slate-700 whitespace-nowrap shrink-0">
              <MapPin className="w-5 h-5 text-slate-400" />
              <span className="text-sm font-medium">{tournament.location}</span>
            </div>
            <div className="text-slate-300 shrink-0 hidden sm:block">•</div>
            <div className="flex items-center gap-2 text-slate-700 whitespace-nowrap shrink-0">
              <CalendarDays className="w-5 h-5 text-slate-400" />
              <span className="text-sm font-medium">{formatTournamentDateRange(tournament.startDate, tournament.endDate)}</span>
            </div>
            <div className="hidden lg:block h-8 w-[1px] bg-slate-200 shrink-0" />
            <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto lg:ml-auto border-t sm:border-t-0 border-slate-100 pt-3 sm:pt-0">
              <span className="text-sm font-medium text-slate-700">Tournament Progress -</span>
              <span className="text-md font-bold text-green-600">{calculateProgress()}% Complete</span>
            </div>
          </div>
        </div>
      )}

      {/* Matches Content */}
      <div className="w-full bg-white rounded-[24px] border border-slate-100 p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row justify-between lg:items-center mb-2 gap-4">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Matches
          </h2>

          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 w-full lg:w-auto">
            <div className="flex gap-2 w-full md:w-auto">
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
                className="inline-flex items-center justify-center gap-2 w-full md:w-auto px-4 py-2 bg-[#0F1117] hover:bg-slate-800 text-white text-sm font-medium rounded-xl transition-all cursor-pointer shadow-xs whitespace-nowrap"
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

            <div className="relative w-full md:w-48">
              <input
                type="date"
                aria-label="Filter matches by day"
                min={tournament?.startDate?.slice(0, 10)}
                max={tournament?.endDate?.slice(0, 10)}
                value={dayFilter}
                onChange={(e) => { setDayFilter(e.target.value); setCurrentPage(1); }}
                onClick={(e) => e.currentTarget.showPicker?.()}
                className={`w-full pl-3 ${dayFilter ? 'pr-9' : 'pr-3'} py-2 text-gray-700 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer`}
              />
              {dayFilter && (
                <button
                  type="button"
                  aria-label="Clear day filter"
                  onClick={() => { setDayFilter(''); setCurrentPage(1); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex bg-slate-50 rounded-xl border border-slate-100 p-1 w-full md:w-auto max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {filters.map((filter) => (
                <button
                  key={filter}
                  onClick={() => { setActiveFilter(filter); setCurrentPage(1); }}
                  className={`flex-1 md:flex-none shrink-0 whitespace-nowrap px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium transition-all rounded-lg ${
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
          <table className="w-full min-w-[840px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="py-3 px-3 font-semibold">Match Details</th>
                <th className="py-3 px-3 font-semibold">Matchup</th>
                <th className="py-3 px-3 font-semibold">Match Type</th>
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
                      <td className="py-4 px-3 whitespace-nowrap">
                        {row.matchType ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-[11px] font-bold">{row.matchType}</span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
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
                      <td className="py-3 px-3 whitespace-nowrap">
                        {row.type === 'Live' ? (
                          // Match is actually in progress — go straight to scoring-frontend's
                          // scorer page, not its matches list.
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const isTest = String(row.fixture?.match?.match_type || '').toLowerCase() === 'test';
                              window.location.href = `${process.env.NEXT_PUBLIC_SCORING_FRONTEND_URL}/pages/dashboard/${isTest ? 'testScorer' : 'scorer'}/${row.fixture?.match_id}`;
                            }}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-semibold whitespace-nowrap cursor-pointer underline"
                          >
                            <CalendarClock className="w-3.5 h-3.5" /> Start Scoring →
                          </button>
                        ) : row.type === 'Finished' || row.type === 'Abandoned' ? (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const isTest = String(row.fixture?.match?.match_type || '').toLowerCase() === 'test';
                              window.location.href = `${process.env.NEXT_PUBLIC_SCORING_FRONTEND_URL}/pages/dashboard/${isTest ? 'testScoreboard' : 'scoreboard'}/${row.fixture?.match_id}`;
                            }}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-semibold whitespace-nowrap cursor-pointer underline"
                          >
                            <CalendarClock className="w-3.5 h-3.5" /> View Scoreboard →
                          </button>
                        ) : row.type === 'Expired' ? (
                          <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-xs font-semibold">Expired</span>
                        ) : row.isLinked && row.date && new Date(row.date).getTime() > now ? (
                          // Scheduled time hasn't arrived yet — can't start the match.
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-xs font-semibold">
                            Starts at {new Date(row.date).toLocaleDateString('en-GB')}, {new Date(row.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : row.isLinked ? (
                          // Scheduled (ground/date set, match record exists) but toss hasn't
                          // been recorded yet — send them to scoring-frontend's matches page
                          // with a signal to open that match's Toss modal directly.
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (tournament?.externalTournamentId) {
                                window.location.href = `${process.env.NEXT_PUBLIC_SCORING_FRONTEND_URL}/pages/dashboard/tournament/${tournament.externalTournamentId}?openToss=${row.fixture?.match_id}`;
                              }
                            }}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-semibold whitespace-nowrap cursor-pointer underline"
                          >
                            <CalendarClock className="w-3.5 h-3.5" /> Start Match →
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setScheduleFixture(row.fixture || null);
                            }}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-semibold whitespace-nowrap cursor-pointer"
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
                    No {activeFilter === 'All' ? '' : `${activeFilter.toLowerCase()} `}matches found{dayFilter ? ` on ${new Date(`${dayFilter}T00:00`).toLocaleDateString('en-GB')}` : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Section */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-6">
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
        allFixtures={fixtures}
        tournamentStartDate={tournament?.startDate}
        tournamentEndDate={tournament?.endDate}
        onScheduled={() => {
          if (tournament?.externalTournamentId) fetchFixtures(tournament.externalTournamentId);
        }}
      />
    </div>
  );
};

export default UpcomingMatches;
