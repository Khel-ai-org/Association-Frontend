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
  // The scoring-service's own id for this tournament — every scoring-API
  // call (teams, fixtures, matches/schedule) must be keyed by this, not `id`.
  externalTournamentId?: string;
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

// A fixture/schedule row as actually returned by
// GET {ScoringAPI}/api/v1/tournaments/:externalTournamentId/matches
// (verbatim field names/casing — do not camelCase these, they must match
// the real payload).
export interface FixtureTeam {
  id: string;
  name: string;
  short_name?: string;
}

export interface FixtureGroup {
  id: string;
  name: string;
  display_order?: number;
}

export interface Fixture {
  id: string; // this fixture/schedule row's own id — used for the schedule PATCH
  tournament_id: string;
  match_type: string; // 'group' | 'semifinal_1' | 'eliminator' | 'semifinal_2' | 'final' | ...
  status: string; // this schedule row's own status — NOT meaningful until `match`/`match_id` are set
  // Both populate together once the fixture is actually scheduled/linked to
  // a live match: `match_id` is the id, `match` is the nested match object
  // (its own `status` field is the real source of truth once present).
  // Navigate to match details using `match_id` directly — no extra lookup.
  match_id: string | null;
  match: { status?: string; [key: string]: unknown } | null;
  round_number?: number;
  match_number: number;
  scheduled_date: string | null;
  venue: string | null; // ground id — set at generation (round-robin) or via the schedule action
  home_team: FixtureTeam | null;
  away_team: FixtureTeam | null;
  group: FixtureGroup | null;
  notes?: string | null;
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
