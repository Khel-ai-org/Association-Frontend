"use client";

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PlayerMatchStats } from '../../../../components/ground/PlayerMatchStats';

interface PageProps {
  params: Promise<{ matchId: string }>;
}

export default function PlayerStatsPage({ params }: PageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resolvedParams = React.use(params);
  const matchId = resolvedParams.matchId;
  const playerName = searchParams.get('name') || '';

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-4 md:p-6">
      <div className="flex items-center gap-2 mb-6 text-sm font-medium text-slate-600">
        <button
          onClick={() => router.back()}
          className="flex items-center text-slate-800 transition-colors cursor-pointer border-none bg-transparent p-0"
        >
          <ArrowLeft className="w-5 h-5 mr-1" /> Grounds
        </button>
        <span>{'>'}</span>
        <span className="text-slate-800">Tournament</span>
        <span>{'>'}</span>
        <span className="text-slate-800">Matches</span>
        <span>{'>'}</span>
        <span className="text-slate-800">Match Details</span>
        <span>{'>'}</span>
        <span className="text-slate-900 font-bold">Stats</span>
      </div>

      {playerName ? (
        <PlayerMatchStats matchId={matchId} playerName={playerName} />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center shadow-xs">
          <p className="text-slate-600 italic">No player specified.</p>
        </div>
      )}
    </div>
  );
}
