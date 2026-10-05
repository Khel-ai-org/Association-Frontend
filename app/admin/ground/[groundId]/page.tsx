"use client";

import { useParams, useRouter } from "next/navigation";
import TournamentList from "../../components/ground/Tournament";
import useGoBack from "../../hooks/useGoBack";
import { ArrowLeft} from 'lucide-react';

export default function GroundTournamentsPage() {
  const params = useParams();
  const router = useRouter();
  const goBack = useGoBack('/admin/ground');
  
  // These must match your folder names: [groundId] and [tournamentId]
  const groundId = params.groundId as string;
  const tournamentId = params.tournamentId as string;

  return (
    <div className=" max-w-[1600px] mx-auto ">
        <div className="flex flex-row gap-5 mb-2">
      <button 
        onClick={goBack} 
        className=" text-3xl text-gray-700 font-medium  flex items-center gap-1 cursor-pointer"
      >
         <ArrowLeft className="w-5 h-5 mr-1" />
      </button>
      <div className="flex items-center text-[14px] font-medium text-slate-700">
          <button onClick={() => router.push('/admin/ground')} className="cursor-pointer hover:underline hover:text-slate-900">Ground</button> <span className="mx-2 text-slate-400 font-light">{">"}</span>
          <span className="text-slate-900">Tournament</span>
        </div>
        </div>
      
      

      <TournamentList 
        groundId={groundId}
     // Controlled by the URL
      />
    </div>
  );
}