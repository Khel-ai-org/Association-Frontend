// Shared types for the Tournament -> Teams -> Fixtures -> Matches flow.
// Kept intentionally narrow: only concepts genuinely shared across multiple
// new files live here. Existing per-file Tournament/Match interfaces
// (ActiveTournament.tsx, Tournament.tsx, UpcomingMatches.tsx) are left as-is.

export interface Ground {
  id: string;
  name: string;
  location: string;
  pitchType?: string;
  straightBoundary?: string;
  sideBoundary?: string;
}

export interface TournamentDetail {
  id: string;
  name: string;
  location: string;
  category?: string;
  teamCount: number;
  oversPerMatch?: number;
  startDate: string;
  endDate: string;
  grounds?: Ground[];
}

export interface Team {
  id: string;
  name: string;
  shortName?: string;
}

export type FixtureStatus = 'UNSCHEDULED' | 'SCHEDULED' | 'LIVE' | 'COMPLETED';

export interface Fixture {
  id: string; // scoring_match_id
  matchNumber?: number;
  groupName?: string;
  team1: Team;
  team2: Team;
  scheduledDate: string | null;
  groundId: string | null;
  groundName?: string | null;
  status: FixtureStatus;
  resultText?: string;
}

// Shape of an existing core-API "admin match record", as already consumed by
// UpcomingMatches.tsx via GET {Backend}/matches/tournament/:tournamentId
export interface CoreMatchRecord {
  id: string;
  match_id: number;
  name: string;
  date: string | null;
  ground_id?: string;
  tournament_id?: string;
  scoring_match_id?: string;
}
