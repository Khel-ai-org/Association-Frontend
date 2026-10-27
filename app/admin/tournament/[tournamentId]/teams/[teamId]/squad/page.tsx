"use client";

import { useParams } from "next/navigation";
import TeamSquadPage from "../../../../../components/tournament/TeamSquadPage";

export default function TournamentTeamSquadPage() {
  const params = useParams();
  return <TeamSquadPage tournamentId={params.tournamentId as string} teamId={params.teamId as string} />;
}
