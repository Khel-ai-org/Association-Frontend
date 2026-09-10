 "use client";

import { useEffect, useState } from "react";

interface Tournament {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export default function TournamentDetails() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
  const fetchTournaments = async () => {
    try {
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_Backend_URL}/tournaments/my-association`,
        {
          method: 'GET',
          credentials: "include",
        }
      );

      if (response.ok) {
        const json = await response.json();
        setTournaments(json.data);
      } else if (response.status === 403) {
        console.error("Access Denied: your account is not yet approved.");
      }
    } catch (error) {
      console.error("Failed to fetch operator tournament details:", error);
    } finally {
      setLoading(false);
    }
  };

  fetchTournaments();
}, []);

  const calculateProgress = (start: string, end: string) => {
    const startDate = new Date(start).getTime();
    const endDate = new Date(end).getTime();
    const today = new Date().getTime();

    if (today < startDate) return 0;
    if (today > endDate) return 100;

    const totalDuration = endDate - startDate;
    const elapsed = today - startDate;
    return Math.round((elapsed / totalDuration) * 100);
  };

  const styleConfig = [
    { color: "bg-[#AAB5FF]", bg: "bg-indigo-100" },
    { color: "bg-[#FFD15C]", bg: "bg-amber-100" },
    { color: "bg-[#96DFFF]", bg: "bg-cyan-100" },
  ];

  if (loading)
    return (
      <div className="w-full lg:w-[350px] p-6 bg-white rounded-[24px] animate-pulse h-[350px]" />
    );

  return (
    <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm w-full lg:w-[350px]">
      <h2 className="text-lg font-bold text-[#0D0D12] mb-6 shrink-0">
        Tournament Details
      </h2>

      
      <div className="space-y-4 overflow-y-auto h-[250px] pr-2 no-scrollbar snap-y snap-mandatory scroll-smooth">
        {tournaments.length > 0 ? (
          tournaments.map((t, index) => {
            const progress = calculateProgress(t.startDate, t.endDate);
            const styles = styleConfig[index % styleConfig.length];

            return (
              <div key={t.id} className="snap-start pb-2">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-md font-medium text-slate-800 truncate pr-2">
                    {t.name}
                  </p>
                  <p className="text-md font-bold text-black">{progress}%</p>
                  
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-6 w-full rounded-sm transition-colors duration-500 ${
                        i < progress / 5 ? styles.color : styles.bg
                      }`}
                    />
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-slate-400 text-center py-4">No tournaments found</p>
        )}
      </div>

      {/* Helper indicator if there are more than 3 */}
      {tournaments.length > 3 && (
        <div className="mt-4 flex justify-center">
          <div className="text-[10px] font-bold text-slate-300 animate-bounce">
            Scroll to see more ↓
          </div>
        </div>
      )}

      <style jsx>{`
        /* Hide scrollbar for Chrome, Safari and Opera */
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        /* Hide scrollbar for IE, Edge and Firefox */
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}


// components/dashboard/TournamentDetails.tsx
// import React from 'react';

// const tournaments = [
//   { name: "NCR Premier League", progress: 70, color: "bg-[#AAB5FF]" ,bg:"bg-indigo-100" },
//   { name: "Champions T20 League", progress: 43, color: "bg-[#FFD15C]" ,bg:"bg-amber-100" },
//   { name: "Karnataka Super League", progress: 26, color: "bg-[#96DFFF]" ,bg:"bg-cyan-100" },
// ];

// export default function TournamentDetails() {
//   return (
//     <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm w-full lg:w-[350px]">
//       <h2 className="text-lg font-bold text-[#0D0D12] mb-6">Tournament Details</h2>
//       <div className="space-y-8">
//         {tournaments.map((t) => (
//           <div key={t.name}>
//             <div className="flex justify-between items-center mb-2">
//               <p className="text-md  text-slate-800">{t.name}</p>
//               <p className="text-md  text-black">{t.progress}%</p>
              
//             </div>
//             <div className="flex gap-1">
//               {Array.from({ length: 20 }).map((_, i) => (
//                 <div 
//                   key={i} 
//                   className={`h-6 w-full rounded-sm ${i < (t.progress / 5) ? t.color : t.bg}`} 
//                 />
//               ))}
//             </div>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

//login for server acess
// chmod 400 jyoti-association-backend.pem
// (base) apple@apples-MacBook-Air Downloads % ssh -i jyoti-association-backend.pem admin@3.110.193.0

