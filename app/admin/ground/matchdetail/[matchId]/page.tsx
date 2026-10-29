// "use client";

// import React from 'react';
// import { ArrowLeft} from 'lucide-react';
// import { useRouter } from 'next/navigation';
// import MatchAnalysis from '../../../components/ground/MatchDetails';

// // Define the shape of the params as a Promise
// interface PageProps {
//   params: Promise<{ matchId: string }>;
// }

// export default function MatchDetailsPage({ params }: PageProps) {
//   const router = useRouter();
  
//   // Unwrap the params promise using React.use()
//   const resolvedParams = React.use(params);
//   const matchId = resolvedParams.matchId;

//   return (
//     <div className="min-h-screen bg-[#F8F9FB] p-4 md:p-6">
//       {/* Breadcrumbs / Back Navigation */}
//       <div className="flex items-center gap-2 mb-6 text-sm font-medium text-slate-500">
//         {/* Back Arrow - Triggers browser back */}
//         <button 
//           onClick={() => router.back()} 
//           className="flex items-center text-slate-800 transition-colors cursor-pointer border-none bg-transparent p-0"
//         >
//           <ArrowLeft className="w-5 h-5 mr-1" /> Grounds
//         </button>
        
//         <span>{'>'}</span>
//         <span className='text-slate-800'>Tournament</span>
//         <span>{'>'}</span>
//         <span className='text-slate-800'>Matches</span>
//         <span>{'>'}</span>
//         <span className="text-slate-900">Match Details</span>
//       </div>

//       {/* Main Analysis Component using the unwrapped ID */}
//       <MatchAnalysis matchId={matchId} />
//     </div>
//   );
// }


"use client";

import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import useGoBack from '../../../hooks/useGoBack';
import MatchAnalysis from '../../../components/ground/MatchDetails';

interface PageProps {
  params: Promise<{ matchId: string }>;
}

export default function MatchDetailsPage({ params }: PageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resolvedParams = React.use(params);
  const matchId = resolvedParams.matchId;
  // The scorecard itself carries no status field — the Matches list passes
  // along the status it already knew (the fixture's live-match status).
  const initialStatus = searchParams.get('status') || undefined;
  // Set by the tournament's Matches list so the breadcrumb can link back to it.
  const tournamentId = searchParams.get('tid') || '';
  const goBack = useGoBack(tournamentId ? `/admin/tournament/${tournamentId}/matches` : '/admin/dashboard');

  // Track active tab state at the parent page level
  const [activeTab, setActiveTab] = useState<'details' | 'referee' | 'scorecard'>('details');

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-4 md:p-6">
      {/* Top Header Navigation & Tab Switcher Bar matching layout screenshot */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        {/* Breadcrumbs / Back Navigation — the trail matches how the user got here:
            from a tournament's Matches list (tid is passed along) or from the dashboard. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-slate-500">
          <button
            onClick={goBack}
            className="flex items-center text-slate-800 transition-colors cursor-pointer border-none bg-transparent p-0"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
          </button>
          {tournamentId ? (
            <>
              <button onClick={() => router.push('/admin/tournament')} className="text-slate-800 cursor-pointer hover:underline">Tournament</button>
              <span>{'>'}</span>
              <button onClick={() => router.push(`/admin/tournament/${tournamentId}/matches`)} className="text-slate-800 cursor-pointer hover:underline">Matches</button>
            </>
          ) : (
            <button onClick={() => router.push('/admin/dashboard')} className="text-slate-800 cursor-pointer hover:underline">Dashboard</button>
          )}
          <span>{'>'}</span>
          <span className="text-slate-900 font-bold">Match Details & Match Referee</span>
        </div>

        {/* Top-Right Tab Switcher Component */}
        <div className="flex w-full sm:w-auto bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
          <button 
            onClick={() => setActiveTab('details')}
            className={`flex-1 sm:flex-none px-2 sm:px-5 py-2 text-[11px] sm:text-xs font-bold rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'details' 
                ? 'bg-[#121212] text-white shadow-md' 
                : 'text-slate-600 hover:text-black'
            }`}
          >
            Match Details
          </button>
          <button
            onClick={() => setActiveTab('referee')}
            className={`flex-1 sm:flex-none px-2 sm:px-5 py-2 text-[11px] sm:text-xs font-bold rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'referee'
                ? 'bg-[#121212] text-white shadow-md'
                : 'text-slate-600 hover:text-black'
            }`}
          >
            Match Referee
          </button>
          <button
            onClick={() => setActiveTab('scorecard')}
            className={`flex-1 sm:flex-none px-2 sm:px-5 py-2 text-[11px] sm:text-xs font-bold rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'scorecard'
                ? 'bg-[#121212] text-white shadow-md'
                : 'text-slate-600 hover:text-black'
            }`}
          >
            Scorecard
          </button>
        </div>
      </div>

      {/* Main Analysis Component passing down the active tab parameter */}
      <MatchAnalysis matchId={matchId} externalActiveTab={activeTab} onTabChange={setActiveTab} initialStatus={initialStatus} />
    </div>
  );
}