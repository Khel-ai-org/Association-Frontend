"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search, ChevronLeft, ChevronRight, Users, MapPin } from 'lucide-react';
import stadiumImage from '../../../../public/stadium.png'; // Ensure this path is correct

interface Tournament {
  id: string;
  name: string;
  teamCount: number;
  location: string;
  startDate: string;
  endDate: string;
  category?: string;
}

interface TournamentListProps {
  groundId: string | null;
}

const TournamentList: React.FC<TournamentListProps> = ({ groundId }) => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const itemsPerPage = 12; // 3 rows * 4 columns

  useEffect(() => {
    const fetchTournaments = async () => {
      if (!groundId) return;
      setLoading(true);
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/tournaments/ground/${groundId}`, {
          credentials: 'include',
          method: 'GET'
        });

        if (response.ok) {
          const data = await response.json();
          const now = new Date();

          // Sort Logic: Live -> Upcoming -> Completed
          const sorted = (data as Tournament[]).sort((a, b) => {
            const aStart = new Date(a.startDate);
            const aEnd = new Date(a.endDate);
            const bStart = new Date(b.startDate);
            const bEnd = new Date(b.endDate);

            const getWeight = (start: Date, end: Date) => {
              if (now >= start && now <= end) return 0; // Live
              if (now < start) return 1;               // Upcoming
              return 2;                                // Past
            };

            return getWeight(aStart, aEnd) - getWeight(bStart, bEnd) || 
                   aStart.getTime() - bStart.getTime();
          });

          setTournaments(sorted);
        }
      } catch (error) {
        console.error("Error fetching tournaments:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTournaments();
  }, [groundId]);

  // Search filter
  const filtered = useMemo(() => {
    return tournaments.filter(t =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.location.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [tournaments, searchQuery]);

  // Pagination calculation
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const currentItems = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getProgress = (startStr: string, endStr: string) => {
    const now = new Date().getTime();
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();
    if (now < start) return 0;
    if (now > end) return 100;
    const total = end - start;
    const elapsed = now - start;
    return Math.round((elapsed / total) * 100);
  };

  return (
    <div className="w-full space-y-6">
      <div className="bg-white border border-gray-200 shadow-xs rounded-[24px] p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <h2 className="text-xl font-bold text-slate-900">Tournaments</h2>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search tournament..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 rounded-lg border border-gray-100 text-sm outline-none focus:ring-1 focus:ring-blue-500 text-gray-500"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>

        {/* Updated Grid (4 Columns) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            <div className="col-span-full py-20 text-center text-slate-400 animate-pulse">Loading tournaments...</div>
          ) : currentItems.length > 0 ? (
            currentItems.map((t) => {
              const now = new Date();
              const start = new Date(t.startDate);
              const end = new Date(t.endDate);
              const isLive = now >= start && now <= end;
              const isPast = now > end;
              const progress = getProgress(t.startDate, t.endDate);

              return (
                <Link
                  key={t.id}
                  href={`/admin/tournament/${t.id}/teams`}
                  className="flex flex-col border border-slate-100 transition-all rounded-xl bg-white overflow-hidden group hover:border-blue-400 hover:shadow-md active:scale-[0.98]"
                >
                  <div className="relative aspect-[12/5] overflow-hidden">
                    <Image
                      src={stadiumImage}
                      alt="Stadium"
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent p-4 flex flex-col justify-between">
                      <div className="flex justify-end">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-[6px] flex items-center gap-1 ${
                          isLive ? 'bg-red-500 text-white' : 'bg-emerald-600 text-white'
                        }`}>
                          {isLive && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>}
                          {isLive ? 'LIVE' : (isPast ? 'COMPLETED' : 'UPCOMING')}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-white/90 uppercase tracking-wider">{t.category || 'T20'}</p>
                    </div>
                  </div>

                  <div className="p-4 flex flex-col flex-grow">
                    <h3 className="text-md font-semibold text-slate-800 leading-tight mb-3 group-hover:text-blue-600 transition-colors line-clamp-1">
                      {t.name}
                    </h3>

                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <UsersIcon />
                          <span>{t.teamCount || 0} Teams</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <LocationIcon  />
                          <span className="truncate max-w-[80px]">{t.location || "N/A"}</span>
                        </div>
                      </div>

                      <div className="pt-2">
                        <div className="flex items-center justify-between text-[10px] text-slate-700 mb-1">
                          <span>TOURNAMENT PROGRESS</span>
                          <span className="text-emerald-600 font-bold">{progress}% Complete</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-gray-100 rounded-[24px] text-slate-400">
              No tournaments found.
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      
        <div className="flex items-center justify-center gap-2">
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
                  currentPage === i + 1
                    ? 'bg-[#0F1117] text-white'
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
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-500 bg-white border border-gray-100 rounded-md disabled:opacity-50"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      
    </div>
  );
};
const UsersIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <ellipse cx="12" cy="16.5" rx="6" ry="2.5" stroke="#808898" strokeWidth="1.5" strokeLinejoin="round"/>
   <circle cx="12" cy="8" r="3" stroke="#808898" strokeWidth="1.5" strokeLinejoin="round"/>
   <path d="M6.44824 13.2617C5.53706 13.756 4.83407 14.3699 4.41992 15.0596C4.17325 15.1255 3.9467 15.2008 3.74316 15.2822C3.34305 15.4423 3.06937 15.6142 2.9082 15.7666C2.74873 15.9175 2.75 15.9965 2.75 16C2.75 16.0035 2.74873 16.0825 2.9082 16.2334C3.06937 16.3858 3.34305 16.5577 3.74316 16.7178C3.8315 16.7531 3.92468 16.7858 4.02148 16.8184C4.10001 17.4499 4.40998 18.0442 4.9043 18.5771C4.26833 18.468 3.68596 18.3105 3.18555 18.1104C2.68105 17.9085 2.22269 17.6492 1.87793 17.3232C1.53149 16.9956 1.25 16.5488 1.25 16C1.25 15.4512 1.53149 15.0044 1.87793 14.6768C2.22269 14.3508 2.68105 14.0915 3.18555 13.8896C4.06942 13.5361 5.20852 13.3131 6.44824 13.2617Z" fill="#808898"/>
   <path d="M17.5518 13.2617C18.7915 13.3131 19.9306 13.5361 20.8145 13.8896C21.319 14.0915 21.7773 14.3508 22.1221 14.6768C22.4685 15.0044 22.75 15.4512 22.75 16C22.75 16.5488 22.4685 16.9956 22.1221 17.3232C21.7773 17.6492 21.319 17.9085 20.8145 18.1104C20.3138 18.3106 19.7311 18.468 19.0947 18.5771C19.5893 18.0441 19.899 17.45 19.9775 16.8184C20.0747 16.7857 20.1682 16.7532 20.2568 16.7178C20.657 16.5577 20.9306 16.3858 21.0918 16.2334C21.2513 16.0825 21.25 16.0035 21.25 16C21.25 15.9965 21.2513 15.9175 21.0918 15.7666C20.9306 15.6142 20.657 15.4423 20.2568 15.2822C20.053 15.2007 19.8261 15.1255 19.5791 15.0596C19.1649 14.3701 18.4628 13.7559 17.5518 13.2617Z" fill="#808898"/>
  <path d="M17 6.25C18.5188 6.25 19.75 7.48122 19.75 9C19.75 10.5188 18.5188 11.75 17 11.75C16.5144 11.7499 16.0591 11.6223 15.6631 11.4014C16.0061 11.0321 16.294 10.6114 16.5137 10.1514C16.6632 10.2146 16.8274 10.25 17 10.25C17.6904 10.25 18.25 9.69036 18.25 9C18.25 8.30964 17.6904 7.75 17 7.75C16.998 7.75 16.9961 7.74999 16.9941 7.75C16.9686 7.23137 16.8632 6.73384 16.6914 6.26855C16.7928 6.25722 16.8956 6.25001 17 6.25Z" fill="#808898"/>
   <path d="M7 6.25C7.10405 6.25 7.20657 6.2573 7.30762 6.26855C7.13591 6.73372 7.03139 7.23152 7.00586 7.75C7.00391 7.74999 7.00195 7.75 7 7.75C6.30964 7.75 5.75 8.30964 5.75 9C5.75 9.69036 6.30964 10.25 7 10.25C7.17225 10.25 7.33604 10.2144 7.48535 10.1514C7.70493 10.6113 7.99302 11.0321 8.33594 11.4014C7.94011 11.622 7.48536 11.75 7 11.75C5.48122 11.75 4.25 10.5188 4.25 9C4.25 7.48122 5.48122 6.25 7 6.25Z" fill="#808898"/>
 </svg>
);

const LocationIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
   <path d="M11.667 7.50023C11.667 8.42071 10.9208 9.1669 10.0003 9.1669C9.07985 9.1669 8.33366 8.42071 8.33366 7.50023C8.33366 6.57976 9.07985 5.83357 10.0003 5.83357C10.9208 5.83357 11.667 6.57976 11.667 7.50023Z" stroke="#808898" strokeWidth="1.3"/>
   <path d="M15.8337 7.38119C15.8337 9.28483 14.4187 11.6641 12.869 13.2526C11.8496 14.2975 10.7719 15.0002 10.0003 15.0002C9.22877 15.0002 8.15105 14.2975 7.13163 13.2526C5.58196 11.6641 4.16699 9.28483 4.16699 7.38119C4.16699 4.22527 6.77866 1.6669 10.0003 1.6669C13.222 1.6669 15.8337 4.22527 15.8337 7.38119Z" stroke="#808898" strokeWidth="1.3"/>
   <path d="M12.6285 13.4914C15.4742 13.8464 17.5 14.7611 17.5 15.8336C17.5 17.2143 14.1421 18.3336 10 18.3336C5.85786 18.3336 2.5 17.2143 2.5 15.8336C2.5 14.7611 4.52584 13.8464 7.37151 13.4914" stroke="#808898" strokeWidth="1.3" strokeLinecap="round"/>
 </svg>
);

export default TournamentList;