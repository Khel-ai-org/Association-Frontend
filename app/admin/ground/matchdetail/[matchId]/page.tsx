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
import { useRouter } from 'next/navigation';
import MatchAnalysis from '../../../components/ground/MatchDetails';

interface PageProps {
  params: Promise<{ matchId: string }>;
}

export default function MatchDetailsPage({ params }: PageProps) {
  const router = useRouter();
  const resolvedParams = React.use(params);
  const matchId = resolvedParams.matchId;

  // Track active tab state at the parent page level ('details' or 'referee')
  const [activeTab, setActiveTab] = useState<'details' | 'referee'>('details');

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-4 md:p-6">
      {/* Top Header Navigation & Tab Switcher Bar matching layout screenshot */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        {/* Breadcrumbs / Back Navigation */}
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <button 
            onClick={() => router.back()} 
            className="flex items-center text-slate-800 transition-colors cursor-pointer border-none bg-transparent p-0"
          >
            <ArrowLeft className="w-5 h-5 mr-1" /> Grounds
          </button>
          <span>{'>'}</span>
          <span className='text-slate-800'>Tournament</span>
          <span>{'>'}</span>
          <span className='text-slate-800'>Matches</span>
          <span>{'>'}</span>
          <span className="text-slate-900 font-bold">Match Details & Match Referee</span>
        </div>

        {/* Top-Right Tab Switcher Component */}
        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
          <button 
            onClick={() => setActiveTab('details')}
            className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'details' 
                ? 'bg-[#121212] text-white shadow-md' 
                : 'text-slate-600 hover:text-black'
            }`}
          >
            Match Details
          </button>
          <button 
            onClick={() => setActiveTab('referee')}
            className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'referee' 
                ? 'bg-[#121212] text-white shadow-md' 
                : 'text-slate-600 hover:text-black'
            }`}
          >
            Match Referee
          </button>
        </div>
      </div>

      {/* Main Analysis Component passing down the active tab parameter */}
      <MatchAnalysis matchId={matchId} externalActiveTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}