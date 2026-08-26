"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, ChevronLeft, ChevronRight, Users, MapPin } from 'lucide-react';

interface TournamentDetails {
  name: string;
  teamCount: number;
  location: string;
  startDate: string;
  endDate: string;
}

interface Match {
  id: string;
  match_id: number;
  name: string;
  date: string | null;
  ground_id?: string;
  team1: string;
  team2: string;
  score1: string;
  score2: string;
  statusText: string;
  type: string;
  statusLabel?: string;
  badgeColor?: string;
  time: string;
  sortOrder: number;
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
  onSelectMatch
}) => {
  const [tournament, setTournament] = useState<TournamentDetails | null>(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  const itemsPerPage = 12;
  const filters = ['All', 'Live', 'Upcoming', 'Finished'];

  // 1. Fetch Tournament Details for the Header
  useEffect(() => {
    const fetchTournamentDetails = async () => {
      if (!tournamentId) return;
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/tournaments/${tournamentId}`, { 
          method: 'GET', 
          credentials: 'include' 
        });
        const data = await response.json();
        setTournament(data);
      } catch (error) {
        console.error("Error fetching tournament details:", error);
      }
    };
    fetchTournamentDetails();
  }, [tournamentId]);

  // 2. Fetch Matches (Existing Logic)
  useEffect(() => {
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
              type: statusLabel // Map status to type for filtering
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

    fetchMatches();
  }, [tournamentId, selectedGroundId]);

  // Helper: Calculate Tournament Progress
  const calculateProgress = () => {
    if (!tournament) return 0;
    const now = new Date().getTime();
    const start = new Date(tournament.startDate).getTime();
    const end = new Date(tournament.endDate).getTime();
    if (now < start) return 0;
    if (now > end) return 100;
    return Math.round(((now - start) / (end - start)) * 100);
  };

  const filtered = matches.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         m.match_id.toString().includes(searchQuery);
    const matchesFilter = activeFilter === 'All' || m.type === activeFilter;
    return matchesSearch && matchesFilter;
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const currentItems = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6">
      {/* Tournament Info Bar Section */}
      {tournament && (
        <div className="w-full bg-white rounded-xl border border-slate-200 p-4 shadow-xs grid grid-cols-1 md:flex md:flex-row items-center gap-4">
  {/* Tournament Name - Full width on mobile, flexible on desktop */}
  <div className="w-full md:flex-1 min-w-0">
    <h1 className="text-lg font-bold text-slate-900 truncate">{tournament.name}</h1>
  </div>
  
  {/* Divider - Hidden on mobile */}
  <div className="hidden md:block h-8 w-[1px] bg-slate-200" />

  {/* Info Stats - Always centered, uses wrap if screen is very small */}
  <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 flex-1 w-full">
    <div className="flex items-center gap-2 text-slate-700 whitespace-nowrap">
      <Users className="w-5 h-5 text-slate-400" />
      <span className="text-sm font-medium">{tournament.teamCount} Teams</span>
    </div>
    {/* Dot separator */}
    <div className="text-slate-300 hidden sm:block">•</div>
    <div className="flex items-center gap-2 text-slate-700 whitespace-nowrap">
      <MapPin className="w-5 h-5 text-slate-400" />
      <span className="text-sm font-medium">{tournament.location}</span>
    </div>
  </div>

  {/* Divider - Hidden on mobile */}
  <div className="hidden md:block h-8 w-[1px] bg-slate-200" />

  {/* Progress - Full width on mobile to maintain alignment */}
  <div className="w-full md:flex-1 flex justify-between md:justify-end items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
    <span className="text-sm font-medium text-slate-700 whitespace-nowrap">Tournament Progress -</span>
    <span className="text-md font-bold text-green-600">{calculateProgress()}% Complete</span>
  </div>
</div>
      )}

      {/* Existing Matches Container */}
      <div className="w-full bg-white rounded-[24px] border border-slate-100 p-6 shadow-xs">
        {/* Header: Title, Search and Filters */}
       <div className="flex flex-col lg:flex-row justify-between items-center mb-6 gap-4">
  <h2 className="text-xl font-bold text-slate-900 tracking-tight">
    Matches
  </h2>

  <div className="flex flex-col md:flex-row items-center gap-3 w-full lg:w-auto">

    {/* Appeal Analysis Button */}
    <Link
      href={`/admin/appealAnalysis/${tournamentId}?name=${encodeURIComponent(
        tournament?.name || ""
      )}`}
      className="w-full md:w-auto inline-flex justify-center items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-all shadow-sm"
    >
      Appeal Analysis
    </Link>

    {/* Search */}
    <div className="relative w-full md:w-64">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
      <input
        type="text"
        placeholder="Search match ID or teams..."
        className="w-full pl-10 pr-4 py-2 text-slate-600 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value);
          setCurrentPage(1);
        }}
      />
    </div>

    {/* Filters */}
    <div className="flex bg-slate-50 rounded-xl border border-slate-100 p-1 w-full md:w-auto">
      {filters.map((filter) => (
        <button
          key={filter}
          onClick={() => {
            setActiveFilter(filter);
            setCurrentPage(1);
          }}
          className={`flex-1 md:flex-none px-4 py-1.5 text-sm font-medium transition-all rounded-lg ${
            activeFilter === filter
              ? "bg-white shadow-sm text-slate-700 border border-slate-100"
              : "text-slate-400 hover:text-slate-600"
          }`}
        >
          {filter}
        </button>
      ))}
    </div>
  </div>
</div>

        {/* Matches Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
          {loading ? (
            <div className="col-span-full py-20 text-center text-slate-400 animate-pulse">Loading matches...</div>
          ) : currentItems.length > 0 ? (
            currentItems.map((m) => (
              <Link 
                href={`/admin/ground/matchdetail/${m.id}`} 
                key={m.id} 
                className="block transition-transform hover:scale-[1.02] active:scale-95"
              >
                <div className={`p-4 rounded-[20px] border relative bg-gray-50/30 cursor-pointer hover:shadow-md transition-all h-full ${
                  selectedMatchId === m.id ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-100'
                }`}>
                  <span className={`absolute top-4 left-1/2 -translate-x-1/2 text-white text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${m.badgeColor}`}>
                    {m.statusLabel}
                  </span>
                  <p className="text-center text-[13px] text-black mt-6 mb-4 font-medium">Match ID - {m.match_id}</p>
                  <div className="flex justify-between items-center px-1">
                    <div className="text-center flex flex-col items-center gap-2">
                      <div className="w-10 h-10 bg-yellow-300 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-white shadow-sm">
                        {m.team1.substring(0, 2).toUpperCase()}
                      </div>
                      <p className="font-bold text-black text-xs truncate w-20">{m.team1}</p>
                    </div>
                    <span className="text-[#D23624] font-semibold text-[10px] bg-white p-2 rounded-full shadow-sm">Vs</span>
                    <div className="text-center flex flex-col items-center gap-2">
                      <div className="w-10 h-10 bg-indigo-300 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-white shadow-sm">
                        {m.team2.substring(0, 2).toUpperCase()}
                      </div>
                      <p className="font-bold text-black text-xs truncate w-20">{m.team2}</p>
                    </div>
                  </div>
                  <div className="pt-4 mt-2 text-center">
                    <p className="text-[13px] font-bold text-slate-900">Date - {m.time}</p>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="col-span-full py-20 text-center text-slate-400 border-2 border-dashed border-slate-50 rounded-3xl">
              No {activeFilter.toLowerCase()} matches found.
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-6">
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
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
                    currentPage === i + 1 ? 'bg-[#0F1117] text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-500 bg-white border border-gray-100 rounded-md disabled:opacity-50"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UpcomingMatches;