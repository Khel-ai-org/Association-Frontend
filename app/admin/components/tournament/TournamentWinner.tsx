"use client";

import React, { useEffect, useState } from 'react';

// The scoring service records `winner_team` on a tournament once its final is decided.
// `externalTournamentId` is the scoring service's own tournament id (not the core id).
function useTournamentWinner(externalTournamentId?: string | null, coreTournamentId?: string | null): string {
  const [winner, setWinner] = useState('');

  useEffect(() => {
    setWinner('');
    if (!externalTournamentId && !coreTournamentId) return;
    let cancelled = false;
    (async () => {
      try {
        let externalId = externalTournamentId;
        // The tournament list doesn't always carry the scoring service's id: look it up on the core tournament.
        if (!externalId && coreTournamentId) {
          const coreRes = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/tournaments/${coreTournamentId}`, {
            credentials: 'include',
          });
          if (!coreRes.ok) return;
          const core = await coreRes.json();
          externalId = core?.externalTournamentId;
        }
        if (!externalId) return;
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SCORING_API_URL}/api/v1/tournaments/${externalId}`,
          { headers: { 'ngrok-skip-browser-warning': 'true', 'Content-Type': 'application/json' } }
        );
        if (!res.ok) return;
        const data = await res.json();
        const t = data?.tournament ?? data;
        if (!cancelled && t?.winner_team?.name) setWinner(String(t.winner_team.name));
      } catch {
        /* no winner to show */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [externalTournamentId, coreTournamentId]);

  return winner;
}

// variant "header": full-width champion line for the tournament page; "card": compact line for a tournament card.
export default function TournamentWinner({
  externalTournamentId,
  coreTournamentId,
  variant = 'card',
}: {
  externalTournamentId?: string | null;
  coreTournamentId?: string | null;
  variant?: 'header' | 'card';
}) {
  const winner = useTournamentWinner(externalTournamentId, coreTournamentId);
  if (!winner) return null;

  if (variant === 'header') {
    return (
      <div className="w-full mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <span className="text-lg" aria-hidden="true">🏆</span>
        <p className="text-sm text-amber-900">
          <span className="font-bold">{winner}</span> is the winning team of this tournament
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900">
      <span aria-hidden="true">🏆</span>
      <span className="truncate">{winner} won this tournament</span>
    </div>
  );
}
