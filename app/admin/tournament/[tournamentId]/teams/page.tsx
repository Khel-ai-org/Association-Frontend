"use client";

import { useParams } from "next/navigation";
import TeamsPage from "../../../components/tournament/TeamsPage";

export default function TournamentTeamsPage() {
  const params = useParams();
  const tournamentId = params.tournamentId as string;

  return <TeamsPage tournamentId={tournamentId} />;
}
