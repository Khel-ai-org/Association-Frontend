"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useGoBackSteps } from "../../hooks/useGoBack";
import { BallTrajectoryPlayer, BallTrajectory } from "@/app/admin/components/trajectory/BallTrajectoryPlayer";

const SCORING_API_BASE = process.env.NEXT_PUBLIC_SCORING_API_URL || "http://localhost:5500";

// The front camera clip the ops team marked, with its trajectory drawn over it.
const BallTrajectoryPage = () => {
  const router = useRouter();
  const goBackSteps = useGoBackSteps();
  const searchParams = useSearchParams();

  const ball = searchParams.get("ball") || "";
  const ballId = searchParams.get("ballId");
  const inning = searchParams.get("inning") || "1st";
  const batsman = searchParams.get("batsman") || "N/A";
  const bowler = searchParams.get("bowler") || "N/A";
  const outcome = searchParams.get("outcome") || "0";
  const isSuperOver = searchParams.get("isSuperOver") === "true";
  const soNumber = searchParams.get("soNumber") || "1";

  const [trajectory, setTrajectory] = useState<BallTrajectory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ballId) {
      setError("No ball selected.");
      return;
    }
    const load = async () => {
      try {
        const res = await fetch(`${SCORING_API_BASE}/api/v1/balls/${ballId}/trajectory`, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        if (res.status === 404) throw new Error("This ball hasn't been marked by the ops team yet.");
        if (!res.ok) throw new Error("Could not load the ball trajectory.");
        const data = await res.json();
        setTrajectory(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    load();
  }, [ballId]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-6">
      {/* Breadcrumbs */}
      <div className="flex items-center flex-wrap gap-2 text-[14px] font-medium text-slate-800 mb-4 md:mb-6">
        <button onClick={() => router.back()}><ArrowLeft className="w-4 h-4 md:w-5 md:h-5 mr-1" /></button>
        <button onClick={() => router.push("/admin/ground")} className="cursor-pointer hover:underline">Grounds</button> <span>&gt;</span>
        <button onClick={() => goBackSteps(3, "/admin/tournament")} className="cursor-pointer hover:underline">Tournament</button> <span>&gt;</span>
        <button onClick={() => goBackSteps(2, "/admin/tournament")} className="cursor-pointer hover:underline">Matches</button> <span>&gt;</span>
        <button onClick={() => goBackSteps(1, "/admin/tournament")} className="cursor-pointer hover:underline">Match Details</button> <span>&gt;</span>
        <span className="text-slate-900">Ball Trajectory</span>
      </div>

      {/* Ball info */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 shadow-sm text-black">
        <div className="flex flex-wrap gap-y-4 gap-x-6 items-center">
          <Info label="Innings" value={isSuperOver ? `SO${soNumber}` : inning} />
          <Info label={isSuperOver ? "Super Over Ball" : "Ball No."} value={isSuperOver ? `SO${soNumber} - ${ball}` : ball} bordered />
          <Info label="Outcome" value={outcome} bordered />
          <div className="flex items-center gap-3 border-l border-slate-100 pl-4">
            <div className="text-center">
              <span className="block text-[9px] text-slate-500 uppercase font-bold">Batsman</span>
              <span className="text-sm font-bold text-slate-900">{batsman}</span>
            </div>
            <div className="text-[10px] font-black text-slate-400 italic">VS</div>
            <div className="text-center">
              <span className="block text-[9px] text-slate-500 uppercase font-bold">Bowler</span>
              <span className="text-sm font-bold text-slate-900">{bowler}</span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm font-semibold text-slate-500">{error}</div>
      )}
      {!error && !trajectory && (
        <div className="p-10 text-center font-bold text-slate-400 italic">Loading Ball Trajectory...</div>
      )}
      {trajectory && <BallTrajectoryPlayer trajectory={trajectory} />}
    </div>
  );
};

const Info = ({ label, value, bordered }: { label: string; value: string; bordered?: boolean }) => (
  <div className={`flex flex-col ${bordered ? "border-l border-slate-100 pl-4" : ""}`}>
    <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">{label}</span>
    <span className="text-sm font-bold text-slate-900">{value}</span>
  </div>
);

export default BallTrajectoryPage;
