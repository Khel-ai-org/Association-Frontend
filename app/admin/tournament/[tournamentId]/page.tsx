"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// Old default landing for a tournament. Kept as a redirect so any existing
// bookmarks/links to /admin/tournament/:id keep working — the new default
// landing for a tournament is its Teams page.
export default function TournamentRootRedirect() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.tournamentId as string;

  useEffect(() => {
    if (tournamentId) {
      router.replace(`/admin/tournament/${tournamentId}/teams`);
    }
  }, [tournamentId, router]);

  return null;
}
