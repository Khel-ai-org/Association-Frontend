"use client";

import { useParams, useRouter } from "next/navigation";
import UpcomingMatches from "../../../components/tournament/UpcomingMatches";
import { ArrowLeft } from 'lucide-react';

export default function TournamentMatchesPage() {
  const params = useParams();
  const router = useRouter();

  const tournamentId = params.tournamentId as string;

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="flex flex-row gap-5 mb-2">
        <button
          onClick={() => router.push(`/admin/tournament/${tournamentId}/teams`)}
          className="text-3xl text-gray-400 font-medium flex items-center gap-1 cursor-pointer"
        >
          <ArrowLeft className='w-5 h-5 mr-1' />
        </button>
        <div className="flex items-center text-[13px] font-medium text-slate-500">
          Tournament <span className="mx-2 text-slate-400 font-medium">{">"}</span>
          Teams <span className="mx-2 text-slate-400 font-medium">{">"}</span>
          <span className="text-slate-900 font-medium">Matches</span>
        </div>
      </div>

      <UpcomingMatches tournamentId={tournamentId} />
    </div>
  );
}
