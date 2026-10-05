"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Batsman,
  Bowler,
  Innings,
  MatchLikeScorecard,
  getOutDetailsString,
} from './ScorecardView';


interface Ball {
  batsman_name?: string;
  bowler_name?: string;
  total_runs: number;
  batsman_runs?: number;
  is_wide?: boolean;
  is_no_ball?: boolean;
  is_bye?: boolean;
  is_leg_bye?: boolean;
  is_wicket?: boolean;
  wicket_type?: string;
  balling_length?: string;
  balling_variation?: string;
  shot_type?: string;
  fielding_type?: string;
  over_number: string;
}

interface PlayerMatchStatsProps {
  // Optional — when opened outside a specific match (e.g. from the player
  // roster), there's no scorecard to load, so Match/Tournament stats can't
  // be shown, but Career stats still work off `playerId` alone.
  matchId?: string;
  playerName: string;
  // Optional — when the caller already knows the real player id (e.g. the
  // roster's own KCA player record), skip deriving it from the scorecard.
  playerId?: string;
  defaultTab?: 'match' | 'tournament' | 'career';
}

// Real shape confirmed from `GET {SCORING_API_BASE}/api/v1/players/:id/history`.
interface HistoryPlayer {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  role: string | null;
  jersey_number: number | null;
  batting_hand: string;
  bowling_type: string;
  status: string;
  dateOfBirth: string;
  age: number;
  email: string;
  phone: string;
  country: string;
  homeDistrict: { id: string; name: string } | null;
  homeClub: { id: string; name: string } | null;
}

interface DismissalBreakdown {
  bowled: number;
  caught: number;
  lbw: number;
  run_out: number;
  stumped: number;
  hit_wicket: number;
  retired_out: number;
  timed_out: number;
  retired_hurt: number;
}

interface WicketsByType {
  bowled: number;
  caught: number;
  lbw: number;
  stumped: number;
  hit_wicket: number;
}

interface FormatBattingStats {
  innings: number;
  runs: number;
  balls_played: number;
  fours: number;
  sixes: number;
  highest_score: number;
  average: number;
  batting_average: number;
  strike_rate: number;
  thirties: number;
  fifties: number;
  hundreds: number;
  ducks: number;
  not_outs: number;
  dismissals?: DismissalBreakdown;
}

interface FormatBowlingStats {
  innings: number;
  balls_bowled: number;
  overs: string;
  runs_given: number;
  wickets: number;
  maidens: number;
  wides: number;
  no_balls: number;
  best_bowling: string;
  economy: number;
  average: number;
  strike_rate: number;
  three_wicket_hauls: number;
  five_wicket_hauls: number;
  dots: number;
  fours_conceded: number;
  sixes_conceded: number;
  wickets_by_type?: WicketsByType;
}

interface FormatFieldingStats {
  catches: number;
  stumpings: number;
  run_outs: number;
}

interface FormatSummary {
  total_matches: number;
  batting: FormatBattingStats;
  bowling: FormatBowlingStats;
  fielding: FormatFieldingStats;
}

interface CareerSummary extends FormatSummary {
  total: FormatSummary;
  overall: FormatSummary;
  by_format: Record<string, FormatSummary | undefined>;
}

interface PlayerHistoryData {
  requested_match_type: string;
  player: HistoryPlayer;
  career_summary: CareerSummary;
  history: unknown[];
}

const SCORING_API_BASE = process.env.NEXT_PUBLIC_SCORING_API_URL || "http://localhost:5500/api/v1";

const namesMatch = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

// The tournament-player-stats API returns `{}` instead of `[]` for several
// list fields when there's no data (confirmed from a crash: `wagon_wheel`
// came back as `{}` for one player) — every list read off that response
// goes through this instead of a plain `x || []`.
const asArray = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

const overNumericValue = (over: string) => parseFloat(over) || 0;

// The ball-by-ball `fielding_type` field carries exactly these 8 values
// (same vocabulary as the "Fielding Area" filter in MatchDetails.tsx) — an
// 8-wedge fielding-chart layout, angle measured clockwise from top (12
// o'clock), one wedge per 45°, matching the reference design exactly.
// `innerLabel` is the standard cricket position name shown inside the
// infield circle for that wedge — decorative, not tied to any data field.
const WAGON_ZONE_LAYOUT: { zone: string; innerLabel: string; angle: number }[] = [
  { zone: 'Deep Fine Leg', innerLabel: 'Fine Leg', angle: 22.5 },
  { zone: 'Deep Square Leg', innerLabel: 'Square Leg', angle: 67.5 },
  { zone: 'Deep Mid Wicket', innerLabel: 'Mid Wicket', angle: 112.5 },
  { zone: 'Long On', innerLabel: 'Mid On', angle: 157.5 },
  { zone: 'Long Off', innerLabel: 'Mid Off', angle: 202.5 },
  { zone: 'Deep Cover', innerLabel: 'Cover', angle: 247.5 },
  { zone: 'Deep Point', innerLabel: 'Point', angle: 292.5 },
  { zone: 'Third Man', innerLabel: 'Slip', angle: 337.5 },
];
// The 8 wedge-boundary lines, halfway between each pair of zone centers.
const WAGON_DIVIDERS = [0, 45, 90, 135, 180, 225, 270, 315];
// angle measured clockwise from top (12 o'clock) — matches WAGON_ZONE_LAYOUT.
const polarPct = (angleDeg: number, radiusPct: number) => {
  const rad = (angleDeg * Math.PI) / 180;
  return { left: 50 + radiusPct * Math.sin(rad), top: 50 - radiusPct * Math.cos(rad) };
};
const polarSvg = (angleDeg: number, radius: number) => {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: 100 + radius * Math.sin(rad), y: 100 - radius * Math.cos(rad) };
};
// One 45°-wide pie-slice path (center → edge → arc → edge → center) used as
// each zone's invisible hover target.
const wedgePath = (centerAngle: number, radius: number) => {
  const start = polarSvg(centerAngle - 22.5, radius);
  const end = polarSvg(centerAngle + 22.5, radius);
  return `M 100 100 L ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y} Z`;
};

// Matches a super-over's innings to a side (home/away) by team_name first,
// falling back to positional innings_1/innings_2 — same pattern already used
// in MatchDetails.tsx / ScorecardView.tsx for the main scoreboard.
const getSoInnings = (main: MatchLikeScorecard | null, so: MatchLikeScorecard, side: '1st' | '2nd'): Innings | undefined => {
  const targetName = side === '1st'
    ? (main?.innings_1?.team_name || main?.homeTeam)
    : (main?.innings_2?.team_name || main?.awayTeam);
  if (targetName && so.innings_1?.team_name === targetName) return so.innings_1;
  if (targetName && so.innings_2?.team_name === targetName) return so.innings_2;
  return side === '1st' ? so.innings_1 : so.innings_2;
};

const findPlayerInnings = <T extends { name: string }>(
  innings1: T[] | undefined,
  innings2: T[] | undefined,
  name: string
): { entry: T; inningsNum: 1 | 2 } | null => {
  const inIn1 = innings1?.find((p) => namesMatch(p.name, name));
  if (inIn1) return { entry: inIn1, inningsNum: 1 };
  const inIn2 = innings2?.find((p) => namesMatch(p.name, name));
  if (inIn2) return { entry: inIn2, inningsNum: 2 };
  return null;
};

// SUPERSEDED — the "Tournament Stats" tab now renders real data from
// `GET {SCORING_API_BASE}/api/v1/tournaments/:tournamentId/players/:playerId/stats`
// (see `tournamentPlayerStats` state / `tBatting`/`tBowling` derived values
// below). These MOCK_* constants are kept, unused, rather than deleted.
const MOCK_TOURNAMENT_INFO = {
  name: "ICC Men's T20 World Cup 2026",
  status: 'Ongoing',
  matchesCompleted: 36,
  totalMatches: 48,
  currentStage: 'Super 8',
  progressPct: 75,
};

const MOCK_TOURNAMENT_PERFORMANCE = {
  matches: 5,
  innings: 5,
  runs: 284,
  average: 56.80,
  strikeRate: 148.69,
  highestScore: 82,
  fiftiesHundreds: '3/0',
  ballsFaced: 191,
  dotBalls: 25,
  foursSixes: '28/14',
  boundaryPct: '32%',
  boundaryRuns: 263,
  notOuts: '03',
  ducks: '02',
};

const MOCK_MATCH_BY_MATCH = [
  { match: 'M02', opponent: 'Pakistan', venue: 'M. Chinnaswamy Stadium', runs: 43, balls: 32, sr: 134.38, fours: 3, sixes: 4, result: 'Won' },
  { match: 'M05', opponent: 'Australia', venue: 'Narendra Modi Stadium', runs: 68, balls: 45, sr: 151.11, fours: 7, sixes: 3, result: 'Won' },
  { match: 'M08', opponent: 'England', venue: 'Eden Gardens', runs: 25, balls: 22, sr: 113.63, fours: 2, sixes: 1, result: 'Lost' },
  { match: 'M11', opponent: 'South Africa', venue: 'Wankhede Stadium', runs: 82, balls: 51, sr: 160.78, fours: 8, sixes: 4, result: 'Won' },
  { match: 'M14', opponent: 'New Zealand', venue: 'Arun Jaitley Stadium', runs: 66, balls: 41, sr: 160.97, fours: 6, sixes: 2, result: 'Won' },
];

const MOCK_VS_BOWLERS_TOURNAMENT = [
  { bowler: 'Adam Zampa', team: 'Australia', matches: 2, balls: 18, runs: 24, wkts: 1, fours: 3, sixes: 5, sr: 133.33, avg: 32.50 },
  { bowler: 'Josh Hazlewood', team: 'Australia', matches: 1, balls: 12, runs: 14, wkts: 0, fours: 2, sixes: 1, sr: 116.66, avg: 0 },
  { bowler: 'Shaheen Afridi', team: 'Pakistan', matches: 1, balls: 15, runs: 19, wkts: 1, fours: 2, sixes: 1, sr: 126.66, avg: 19.00 },
  { bowler: 'Jofra Archer', team: 'England', matches: 1, balls: 10, runs: 12, wkts: 1, fours: 1, sixes: 1, sr: 120.00, avg: 12.00 },
  { bowler: 'Kagiso Rabada', team: 'South Africa', matches: 1, balls: 14, runs: 21, wkts: 0, fours: 3, sixes: 1, sr: 150.00, avg: 0 },
];

const MOCK_TOURNAMENT_WAGON_ZONES = [
  { zone: 'Deep Mid Wicket', innerLabel: 'Mid Wicket', angle: 112.5, runs: 72 },
  { zone: 'Deep Cover', innerLabel: 'Cover', angle: 247.5, runs: 58 },
  { zone: 'Deep Fine Leg', innerLabel: 'Fine Leg', angle: 22.5, runs: 44 },
  { zone: 'Deep Square Leg', innerLabel: 'Square Leg', angle: 67.5, runs: 38 },
  { zone: 'Deep Point', innerLabel: 'Point', angle: 292.5, runs: 31 },
  { zone: 'Third Man', innerLabel: 'Slip', angle: 337.5, runs: 24 },
  { zone: 'Long On', innerLabel: 'Mid On', angle: 157.5, runs: 9 },
  { zone: 'Long Off', innerLabel: 'Mid Off', angle: 202.5, runs: 8 },
];

const MOCK_SHOT_TYPE_TOURNAMENT = [
  { shot: 'Drive', runs: 18, balls: 12, pct: 100 },
  { shot: 'Pull', runs: 14, balls: 8, pct: 78 },
  { shot: 'Cut', runs: 10, balls: 6, pct: 56 },
  { shot: 'Flick', runs: 8, balls: 6, pct: 44 },
  { shot: 'Glance', runs: 6, balls: 4, pct: 33 },
  { shot: 'Sweep', runs: 4, balls: 3, pct: 22 },
  { shot: 'Others', runs: 8, balls: 6, pct: 44 },
];

const MOCK_BATTING_LEADERBOARD = [
  { name: 'Travis Head', team: 'AUS', value: '341 Runs' },
  { name: 'Jos Buttler', team: 'ENG', value: '312 Runs' },
  { name: 'Rohit Sharma', team: 'IND', value: '284 Runs' },
  { name: 'Virat Kohli', team: 'IND', value: '271 Runs' },
  { name: 'Babar Azam', team: 'PAK', value: '263 Runs' },
];

const MOCK_MOST_SIXES = [
  { name: 'Rohit Sharma', team: 'IND', value: '28 Sixes' },
  { name: 'Travis Head', team: 'AUS', value: '24 Sixes' },
  { name: 'Jos Buttler', team: 'ENG', value: '22 Sixes' },
  { name: 'Virat Kohli', team: 'IND', value: '18 Sixes' },
  { name: 'Babar Azam', team: 'PAK', value: '14 Sixes' },
];

const MOCK_MOST_FOURS = [
  { name: 'Travis Head', team: 'AUS', value: '42 Fours' },
  { name: 'Virat Kohli', team: 'IND', value: '38 Fours' },
  { name: 'Babar Azam', team: 'PAK', value: '35 Fours' },
  { name: 'Jos Buttler', team: 'ENG', value: '32 Fours' },
  { name: 'Rohit Sharma', team: 'IND', value: '30 Fours' },
];

const MOCK_TOP_STRIKE_RATE = [
  { name: 'Travis Head', team: 'AUS', value: '178.45 SR' },
  { name: 'Jos Buttler', team: 'ENG', value: '162.30 SR' },
  { name: 'Rohit Sharma', team: 'IND', value: '156.80 SR' },
  { name: 'Virat Kohli', team: 'IND', value: '142.10 SR' },
  { name: 'Babar Azam', team: 'PAK', value: '138.50 SR' },
];

const MOCK_HIGHEST_AVERAGE = [
  { name: 'Virat Kohli', team: 'IND', value: '68.20 Avg' },
  { name: 'Babar Azam', team: 'PAK', value: '54.40 Avg' },
  { name: 'Jos Buttler', team: 'ENG', value: '48.60 Avg' },
  { name: 'Rohit Sharma', team: 'IND', value: '44.50 Avg' },
  { name: 'Travis Head', team: 'AUS', value: '41.20 Avg' },
];

// MOCK — Tournament Stats / Bowling. Same rationale as the batting mocks
// above: no cross-match aggregation endpoint exists anywhere.
const MOCK_TOURNAMENT_BOWLING_PERFORMANCE = {
  matches: 8,
  innings: 3,
  overs: 32,
  wickets: 12,
  runsConceded: 136,
  economy: 6.58,
  bowlingAverage: 6.58,
  strikeRate: 6.58,
  maidens: '06',
  bestBowling: '22/3',
  dotBalls: 53,
  fiveWicketHauls: 0,
  wides: '05',
  noBalls: '03',
};

const MOCK_BOWLING_MATCH_BY_MATCH = [
  { date: '18 Jun 2026', opponent: 'Australia', overs: 4.0, runs: 22, wkts: 3, economy: 5.50, best: '3/22', dots: 14, result: 'Won' },
  { date: '15 Jun 2026', opponent: 'Australia', overs: 4.0, runs: 22, wkts: 3, economy: 5.50, best: '3/22', dots: 14, result: 'Won' },
  { date: '13 Jun 2026', opponent: 'Australia', overs: 4.0, runs: 22, wkts: 3, economy: 5.50, best: '3/22', dots: 14, result: 'Won' },
  { date: '09 Jun 2026', opponent: 'New Zealand', overs: 4.0, runs: 34, wkts: 1, economy: 8.50, best: '1/34', dots: 9, result: 'Lost' },
  { date: '04 Jun 2026', opponent: 'Australia', overs: 4.0, runs: 22, wkts: 3, economy: 5.50, best: '3/22', dots: 14, result: 'Won' },
];

const MOCK_LINE_LENGTH_TOURNAMENT = [
  { length: 'Yorker', pct: 12 },
  { length: 'Full', pct: 28 },
  { length: 'Good', pct: 42 },
  { length: 'Short', pct: 18 },
];

const MOCK_WICKET_BREAKDOWN = [
  { method: 'Bowled', count: 142, color: 'bg-indigo-500' },
  { method: 'LBW', count: 118, color: 'bg-amber-500' },
  { method: 'Caught', count: 82, color: 'bg-emerald-500' },
  { method: 'Stumped', count: 24, color: 'bg-red-500' },
  { method: 'Other', count: 44, color: 'bg-slate-400' },
];

const MOCK_VS_BATTER_TOURNAMENT = [
  { batsman: 'Virat Kohli', team: 'India', balls: 18, runs: 24, wkts: 1, fours: 3, sixes: 1, avg: '-', eco: 8.00 },
  { batsman: 'Steve Smith', team: 'Australia', balls: 15, runs: 19, wkts: 1, fours: 2, sixes: 1, avg: '19.00', eco: 7.60 },
  { batsman: 'Kane Williamson', team: 'New Zealand', balls: 12, runs: 16, wkts: 0, fours: 2, sixes: 0, avg: '-', eco: 8.00 },
  { batsman: 'Joe Root', team: 'England', balls: 14, runs: 15, wkts: 1, fours: 1, sixes: 1, avg: '15.00', eco: 6.43 },
  { batsman: 'David Warner', team: 'Australia', balls: 10, runs: 18, wkts: 0, fours: 3, sixes: 0, avg: '-', eco: 10.80 },
];

const MOCK_TOURNAMENT_DETAILS = {
  tournament: 'T20 World Cup 2026',
  format: 'T20 International',
  currentStage: 'Super 8',
  squadTeam: 'India (IND)',
  matchesPlayed: 5,
  matchesRemaining: 2,
  progressPct: 75,
};

const MOCK_BOWLING_LEADERBOARD = [
  { name: 'Rashid Khan', team: 'AFG', value: '18 Wickets' },
  { name: 'Shaheen Afridi', team: 'PAK', value: '16 Wickets' },
  { name: 'Mitchell Starc', team: 'AUS', value: '15 Wickets' },
  { name: 'Anrich Nortje', team: 'SA', value: '14 Wickets' },
  { name: 'Sam Curran', team: 'ENG', value: '13 Wickets' },
];

const MOCK_ECONOMY_LEADERBOARD = [
  { name: 'Rashid Khan', team: 'AFG', value: '7.54' },
  { name: 'Shaheen Afridi', team: 'PAK', value: '7.54' },
  { name: 'Mitchell Starc', team: 'AUS', value: '7.54' },
  { name: 'Anrich Nortje', team: 'SA', value: '7.54' },
  { name: 'Sam Curran', team: 'ENG', value: '7.54' },
];

const MOCK_BOWLING_AVERAGE_LEADERBOARD = [
  { name: 'Rashid Khan', team: 'AFG', value: '16.8' },
  { name: 'Shaheen Afridi', team: 'PAK', value: '16.8' },
  { name: 'Mitchell Starc', team: 'AUS', value: '16.8' },
  { name: 'Anrich Nortje', team: 'SA', value: '16.8' },
  { name: 'Sam Curran', team: 'ENG', value: '16.8' },
];

const MOCK_BOWLING_STRIKE_RATE_LEADERBOARD = [
  { name: 'Rashid Khan', team: 'AFG', value: '17.2' },
  { name: 'Shaheen Afridi', team: 'PAK', value: '17.2' },
  { name: 'Mitchell Starc', team: 'AUS', value: '17.2' },
  { name: 'Anrich Nortje', team: 'SA', value: '17.2' },
  { name: 'Sam Curran', team: 'ENG', value: '17.2' },
];

// Fixed top-to-bottom pitch order (matching the reference design), not
// sorted by percentage — a length-distribution pitch reads top (Yorker) to
// bottom (Short) regardless of which length was bowled most.
const LENGTH_ORDER = ['Yorker', 'Full', 'Good', 'Short'];
const LENGTH_COLORS: Record<string, string> = {
  Yorker: 'bg-amber-300',
  Full: 'bg-emerald-300',
  Good: 'bg-rose-300',
  Short: 'bg-indigo-300',
};
const LENGTH_LEADER_COLORS: Record<string, string> = {
  Yorker: 'text-amber-600 border-amber-400',
  Full: 'text-emerald-600 border-emerald-400',
  Good: 'text-rose-600 border-rose-400',
  Short: 'text-indigo-600 border-indigo-400',
};

const LineLengthChart: React.FC<{ rows: { length: string; pct: number }[] }> = ({ rows }) => {
  if (rows.length === 0) {
    return <p className="text-slate-600 italic text-sm">No length data available.</p>;
  }
  const ordered = LENGTH_ORDER
    .map((name) => rows.find((r) => r.length === name))
    .filter((r): r is { length: string; pct: number } => !!r);
  const extra = rows.filter((r) => !LENGTH_ORDER.includes(r.length));
  const bands = [...ordered, ...extra];

  let cum = 0;
  const positioned = bands.map((b) => {
    const startPct = cum;
    cum += b.pct;
    return { ...b, midPct: startPct + b.pct / 2 };
  });

  return (
    <div className="relative h-64 flex items-center justify-center py-2">
      <div className="relative h-full w-28 overflow-hidden border-y-2 border-black flex flex-col shrink-0">
        {bands.map((b) => (
          <div
            key={b.length}
            className={`flex items-center justify-center ${LENGTH_COLORS[b.length] || 'bg-slate-200'}`}
            style={{ height: `${b.pct}%` }}
          >
            <span className="text-[9px] font-bold text-slate-800">{b.length}</span>
          </div>
        ))}
      </div>
      {positioned.map((b, i) => {
        const side = i % 2 === 0 ? 'left' : 'right';
        const colorClass = LENGTH_LEADER_COLORS[b.length] || 'text-slate-600 border-slate-400';
        return (
          <div
            key={b.length}
            className={`absolute flex items-center gap-1.5 text-xs font-bold whitespace-nowrap ${colorClass} ${
              side === 'left' ? 'right-1/2 mr-14 flex-row-reverse' : 'left-1/2 ml-14'
            }`}
            style={{ top: `${b.midPct}%`, transform: 'translateY(-50%)' }}
          >
            <span>{b.pct}%</span>
            <span className={`h-0 w-8 border-t-2 border-dotted ${colorClass.split(' ')[1]}`} />
          </div>
        );
      })}
    </div>
  );
};


const MOCK_CAREER_TREND = [
  { year: 2018, matches: 10, innings: 10, runs: 520, average: 46.2, sr: 128.4, centuries: 2 },
  { year: 2019, matches: 12, innings: 12, runs: 610, average: 50.8, sr: 131.6, centuries: 3 },
  { year: 2020, matches: 9, innings: 9, runs: 480, average: 40.0, sr: 122.9, centuries: 1 },
  { year: 2021, matches: 11, innings: 11, runs: 590, average: 49.2, sr: 134.8, centuries: 3 },
  { year: 2022, matches: 13, innings: 13, runs: 640, average: 53.3, sr: 138.2, centuries: 4 },
  { year: 2023, matches: 14, innings: 14, runs: 710, average: 54.61, sr: 142.5, centuries: 5 },
  { year: 2024, matches: 12, innings: 12, runs: 660, average: 55.0, sr: 139.7, centuries: 4 },
  { year: 2025, matches: 13, innings: 13, runs: 730, average: 60.8, sr: 145.3, centuries: 5 },
  { year: 2026, matches: 10, innings: 10, runs: 600, average: 54.5, sr: 136.1, centuries: 3 },
];

const MOCK_CAREER_MILESTONES = [
  { title: '10,000 Career Runs', date: '18 Mar 2026', sub: 'India vs Australia · 2nd Innings' },
  { title: '50th Career Century', date: '22 Oct 2023', sub: 'India vs New Zealand · 1st Innings' },
  { title: '5,000 ODI Runs', date: '12 Jan 2024', sub: 'India vs South Africa' },
  { title: 'International Debut', date: '06 Jul 2013', sub: 'India vs Zimbabwe' },
];

const TREND_TABS = [
  { key: 'runs', label: 'Runs' },
  { key: 'average', label: 'Average' },
  { key: 'sr', label: 'Strike Rate' },
  { key: 'centuries', label: 'Centuries' },
] as const;
type TrendMetric = typeof TREND_TABS[number]['key'];

const MOCK_CAREER_BOWLING_TREND = [
  { year: 2018, matches: 22, overs: 380.2, wickets: 28, economy: 6.10, average: 24.5, sr: 41.2 },
  { year: 2019, matches: 25, overs: 420.1, wickets: 34, economy: 5.85, average: 22.1, sr: 38.6 },
  { year: 2020, matches: 18, overs: 310.4, wickets: 22, economy: 6.45, average: 26.8, sr: 44.1 },
  { year: 2021, matches: 27, overs: 465.3, wickets: 40, economy: 5.60, average: 20.9, sr: 36.4 },
  { year: 2022, matches: 30, overs: 512.0, wickets: 45, economy: 5.30, average: 19.2, sr: 34.0 },
  { year: 2023, matches: 45, overs: 842.1, wickets: 71, economy: 4.88, average: 17.6, sr: 30.5 },
  { year: 2024, matches: 32, overs: 560.2, wickets: 48, economy: 5.05, average: 18.4, sr: 32.1 },
  { year: 2025, matches: 34, overs: 598.5, wickets: 52, economy: 4.95, average: 17.9, sr: 31.2 },
  { year: 2026, matches: 12, overs: 210.0, wickets: 18, economy: 5.20, average: 19.0, sr: 33.5 },
];

const MOCK_BOWLING_CAREER_MILESTONES = [
  { title: '500 Test Wickets', date: '15 Sep 2025', sub: 'India vs England · 1st Innings' },
  { title: '100th ODI Wicket', date: '08 Mar 2023', sub: 'India vs Australia' },
  { title: '10-Wicket Match Haul', date: '22 Nov 2021', sub: 'India vs New Zealand · 2nd Test' },
  { title: 'International Debut', date: '18 Aug 2018', sub: 'India vs England' },
];

// MOCK — no speed/dot-ball-percentage fields exist anywhere in the ball-by-ball schema.
const MOCK_BOWLING_STYLE_ANALYSIS = {
  averageSpeed: '142.8 km/h',
  fastestDelivery: '151.4 km/h',
  dotBallPct: 48.6,
};

const BOWLING_TREND_TABS = [
  { key: 'wickets', label: 'Wickets' },
  { key: 'economy', label: 'Economy' },
  { key: 'average', label: 'Average' },
  { key: 'sr', label: 'Strike Rate' },
] as const;
type BowlingTrendMetric = typeof BOWLING_TREND_TABS[number]['key'];

// Real `career_summary.by_format` keys, in display order, for the
// Format-wise Career Breakdown tables.
const FORMAT_ORDER = [
  { key: 'test', label: 'Test' },
  { key: 'odi', label: 'ODI' },
  { key: 't20', label: 'T20' },
  { key: 't10', label: 'T10' },
  { key: 'custom', label: 'Custom' },
];

const TREND_CHART_W = 800;
const TREND_CHART_H = 220;
const TREND_PAD = { left: 40, right: 10, top: 10, bottom: 24 };

interface TrendPoint { year: number; [key: string]: number }

function CareerTrendChart<T extends TrendPoint>({
  data,
  metric,
  renderTooltip,
}: {
  data: T[];
  metric: keyof T & string;
  renderTooltip: (d: T) => React.ReactNode;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const values = data.map((d) => Number(d[metric]));
  const maxVal = Math.max(...values, 1);
  const niceMax = Math.ceil(maxVal / 4) * 4 || 4;
  const plotW = TREND_CHART_W - TREND_PAD.left - TREND_PAD.right;
  const plotH = TREND_CHART_H - TREND_PAD.top - TREND_PAD.bottom;

  const xAt = (i: number) => TREND_PAD.left + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2);
  const yAt = (v: number) => TREND_PAD.top + (1 - v / niceMax) * plotH;

  const points = data.map((d, i) => ({ x: xAt(i), y: yAt(Number(d[metric])), d }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const ticks = [0, 1, 2, 3, 4].map((t) => Math.round((niceMax / 4) * t));

  return (
    <div className="relative w-full" style={{ paddingBottom: `${(TREND_CHART_H / TREND_CHART_W) * 100}%` }}>
      <svg viewBox={`0 0 ${TREND_CHART_W} ${TREND_CHART_H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        {ticks.map((t) => {
          const y = yAt(t);
          return (
            <g key={t}>
              <line x1={TREND_PAD.left} y1={y} x2={TREND_CHART_W - TREND_PAD.right} y2={y} stroke="#F1F5F9" strokeWidth="1" />
              <text x={TREND_PAD.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#64748B">{t}</text>
            </g>
          );
        })}
        {data.map((d, i) => (
          <text key={d.year} x={xAt(i)} y={TREND_CHART_H - 4} textAnchor="middle" fontSize="11" fill="#64748B">{d.year}</text>
        ))}
        <path d={pathD} fill="none" stroke="#6366F1" strokeWidth="2.5" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hoveredIdx === i ? 6 : 4}
            fill="white"
            stroke="#6366F1"
            strokeWidth="2.5"
            className="cursor-pointer"
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          />
        ))}
      </svg>
      {hoveredIdx !== null && (
        <div
          className="absolute bg-slate-900 text-white text-[11px] rounded-lg px-3 py-2 shadow-lg pointer-events-none -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap"
          style={{
            left: `${(points[hoveredIdx].x / TREND_CHART_W) * 100}%`,
            top: `${(points[hoveredIdx].y / TREND_CHART_H) * 100}%`,
          }}
        >
          {renderTooltip(data[hoveredIdx])}
        </div>
      )}
    </div>
  );
}

// Real shape confirmed from `GET {SCORING_API_BASE}/api/v1/players/:id/opponents`:
// `data.opponents[]` — each entry groups every team_id a given opponent has
// played under behind one display `team_name`.
interface OpponentEntry {
  team_name: string;
  team_ids: string[];
}

// Real shape confirmed from `POST {SCORING_API_BASE}/api/v1/players/:id/recent-form`:
// `data.batting.matches[]` / `data.bowling.matches[]`, each with `home_team`/
// `away_team` (no separate "which side is the player's team" field).
interface RecentFormMatch {
  match_id?: string;
  date?: string;
  home_team?: string;
  away_team?: string;
  format?: string;
  result?: string;
  result_description?: string;
  runs?: number;
  balls?: number;
  strike_rate?: number;
  overs?: string | number;
  runs_given?: number;
  wickets?: number;
  economy?: number;
  [key: string]: unknown;
}

// The API returns a full ISO timestamp; the UI only ever shows the date part.
const formatRecentDate = (iso?: string): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const RECENT_FORMAT_OPTIONS = ['All', 'T10', 'T20', 'ODI', 'TEST', 'CUSTOM'] as const;
type RecentFormatFilter = (typeof RECENT_FORMAT_OPTIONS)[number];

const RecentPerformanceFilters: React.FC<{
  opponents: OpponentEntry[];
  opponentFilter: string;
  onOpponentChange: (v: string) => void;
  formatFilter: RecentFormatFilter;
  onFormatChange: (v: RecentFormatFilter) => void;
}> = ({ opponents, opponentFilter, onOpponentChange, formatFilter, onFormatChange }) => {
  const [opponentOpen, setOpponentOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          onClick={() => { setOpponentOpen((o) => !o); setFormatOpen(false); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F1117] text-white text-xs font-semibold"
        >
          Opponent - <span className="font-bold">{opponentFilter}</span> <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {opponentOpen && (
          <div className="absolute right-0 mt-1 w-48 max-h-60 overflow-y-auto bg-white border border-slate-100 rounded-lg shadow-lg z-10 py-1">
            <button
              onClick={() => { onOpponentChange('All teams'); setOpponentOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              All teams
            </button>
            {opponents.map((o, i) => (
              <button
                key={i}
                onClick={() => { onOpponentChange(o.team_name); setOpponentOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {o.team_name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="relative">
        <button
          onClick={() => { setFormatOpen((o) => !o); setOpponentOpen(false); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F1117] text-white text-xs font-semibold"
        >
          Format - <span className="font-bold">{formatFilter}</span> <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {formatOpen && (
          <div className="absolute right-0 mt-1 w-32 bg-white border border-slate-100 rounded-lg shadow-lg z-10 py-1">
            {RECENT_FORMAT_OPTIONS.map((f) => (
              <button
                key={f}
                onClick={() => { onFormatChange(f); setFormatOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const PlayerMatchStats: React.FC<PlayerMatchStatsProps> = ({ matchId, playerName, playerId: providedPlayerId, defaultTab }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(!!matchId);
  const [scorecard, setScorecard] = useState<MatchLikeScorecard | null>(null);
  const [superOvers, setSuperOvers] = useState<MatchLikeScorecard[]>([]);
  const [balls1, setBalls1] = useState<Ball[]>([]);
  const [balls2, setBalls2] = useState<Ball[]>([]);
  const [view, setView] = useState<'batting' | 'bowling'>('batting');
  const [hoveredWagon, setHoveredWagon] = useState<{ zone: string; label: string } | null>(null);
  const [careerFormatFilter, setCareerFormatFilter] = useState<'Overall' | 'Tests' | 'ODI' | 'T20' | 'T10'>('Overall');
  const [playerHistory, setPlayerHistory] = useState<PlayerHistoryData | null>(null);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('runs');
  const [bowlingTrendMetric, setBowlingTrendMetric] = useState<BowlingTrendMetric>('wickets');
  const [hoveredManhattanOver, setHoveredManhattanOver] = useState<number | null>(null);
  const [statsTab, setStatsTab] = useState<'match' | 'tournament' | 'career'>(defaultTab || 'match');
  const [opponents, setOpponents] = useState<OpponentEntry[]>([]);
  const [recentOpponentFilter, setRecentOpponentFilter] = useState('All teams');
  const [recentFormatFilter, setRecentFormatFilter] = useState<RecentFormatFilter>('All');
  const [recentFormBatting, setRecentFormBatting] = useState<RecentFormMatch[]>([]);
  const [recentFormBowling, setRecentFormBowling] = useState<RecentFormMatch[]>([]);
  const [tournamentPlayerStats, setTournamentPlayerStats] = useState<any>(null);

  useEffect(() => {
    if (!matchId) return;
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [scRes, b1Res, b2Res] = await Promise.all([
          fetch(`${SCORING_API_BASE}/api/v1/matches/${matchId}/scorecard`, { headers: { "ngrok-skip-browser-warning": "true" } }),
          fetch(`${SCORING_API_BASE}/api/v1/matches/${matchId}/innings/1/balls`, { headers: { "ngrok-skip-browser-warning": "true" } }),
          fetch(`${SCORING_API_BASE}/api/v1/matches/${matchId}/innings/2/balls`, { headers: { "ngrok-skip-browser-warning": "true" } }),
        ]);
        if (scRes.ok) {
          const scDataArray = await scRes.json();
          if (Array.isArray(scDataArray) && scDataArray.length > 0) {
            setScorecard(scDataArray[0]);
            setSuperOvers(scDataArray.length > 1 ? scDataArray.slice(1) : []);
          }
        }
        if (b1Res.ok) {
          const data = await b1Res.json();
          setBalls1(data.balls || []);
        }
        if (b2Res.ok) {
          const data = await b2Res.json();
          setBalls2(data.balls || []);
        }
      } catch (err) {
        console.error("Player stats fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [matchId]);

  const battingMatch = useMemo(
    () => findPlayerInnings<Batsman>(scorecard?.innings_1?.batsmen, scorecard?.innings_2?.batsmen, playerName),
    [scorecard, playerName]
  );
  const bowlingMatch = useMemo(
    () => findPlayerInnings<Bowler>(scorecard?.innings_1?.bowlers, scorecard?.innings_2?.bowlers, playerName),
    [scorecard, playerName]
  );

  const battingInnings: Innings | undefined = battingMatch?.inningsNum === 1 ? scorecard?.innings_1 : battingMatch?.inningsNum === 2 ? scorecard?.innings_2 : undefined;

  const battingBalls = useMemo(() => {
    const source = battingMatch?.inningsNum === 1 ? balls1 : battingMatch?.inningsNum === 2 ? balls2 : [];
    return source.filter((b) => namesMatch(b.batsman_name, playerName)).sort((a, b) => overNumericValue(a.over_number) - overNumericValue(b.over_number));
  }, [balls1, balls2, battingMatch, playerName]);

  const bowlingBalls = useMemo(() => {
    const source = bowlingMatch?.inningsNum === 1 ? balls1 : bowlingMatch?.inningsNum === 2 ? balls2 : [];
    return source.filter((b) => namesMatch(b.bowler_name, playerName)).sort((a, b) => overNumericValue(a.over_number) - overNumericValue(b.over_number));
  }, [balls1, balls2, bowlingMatch, playerName]);

  const didBat = !!battingMatch;
  const didBowl = !!bowlingMatch;

  // Real inference: batsman-only / bowler-only / did both this match.
  const roleLabel = didBat && didBowl ? "All-Rounder" : didBat ? "Batsman" : didBowl ? "Bowler" : "Player";

  // Real — every batsman/bowler row on the scorecard carries the player's
  // own id, batting hand and bowling type (confirmed from a real payload).
  // Prefer an explicitly-provided id (e.g. from the player roster) over one
  // derived from a match scorecard, since the latter isn't always present.
  const playerId = providedPlayerId || battingMatch?.entry.id || bowlingMatch?.entry.id;
  const battingHand = battingMatch?.entry.batting_hand || bowlingMatch?.entry.batting_hand;
  const bowlingType = bowlingMatch?.entry.bowling_type || battingMatch?.entry.bowling_type;

  // Real — the match scorecard's raw payload carries the scoring backend's
  // own tournament id as `tournament_id` (confirmed from a real payload);
  // that's the only source for it, no prop/route/query param involved.
  const externalTournamentId = (scorecard as any)?.tournament_id;

  // Real tournament stats (batting + bowling) for this player — wiring this
  // up first with a console.log to confirm the response shape before the
  // Tournament Stats tab's mock data (above) gets replaced with it.
  console.log("Fetching player tournament stats for tournament", externalTournamentId, "player", playerId);
  useEffect(() => {
    if (!externalTournamentId || !playerId) return;
    const fetchTournamentPlayerStats = async () => {
      try {
        const res = await fetch(
          `${SCORING_API_BASE}/api/v1/tournaments/${externalTournamentId}/players/${playerId}/stats?match_type=all`,
          { headers: { "ngrok-skip-browser-warning": "true" } }
        );
        if (res.ok) {
          const json = await res.json();
          console.log("Player tournament stats (batting + bowling):", json);
          setTournamentPlayerStats(json);
        }
      } catch (err) {
        console.error("Player tournament stats fetch error:", err);
      }
    };
    fetchTournamentPlayerStats();
  }, [externalTournamentId, playerId]);

  // Real career data — powers the Career Stats tab (bio, overview, format
  // breakdown). `history` (match-by-match log) isn't wired up yet.
  useEffect(() => {
    if (!playerId) return;
    const fetchPlayerHistory = async () => {
      try {
        const res = await fetch(
          `${SCORING_API_BASE}/api/v1/players/${playerId}/history`,
          { headers: { "ngrok-skip-browser-warning": "true" } }
        );
        if (res.ok) {
          const json = await res.json();
          if (json?.status === 'success' && json?.data) setPlayerHistory(json.data);
        }
      } catch (err) {
        console.error("Player history fetch error:", err);
      }
    };
    fetchPlayerHistory();
  }, [playerId]);

  // Real recent-form data — powers "Detailed Recent Performances" /
  // "Recent Bowling Performances" in the Career Stats tab. Re-fetched
  // whenever the Opponent/Format filters change, since filtering happens
  // server-side via the POST body (match_type + opponent_team_ids).
  useEffect(() => {
    if (!playerId) return;
    const selectedOpponent = opponents.find((o) => o.team_name === recentOpponentFilter);
    const fetchRecentForm = async () => {
      try {
        const res = await fetch(
          `${SCORING_API_BASE}/api/v1/players/${playerId}/recent-form`,
          {
            method: 'POST',
            headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
            body: JSON.stringify({
              match_type: recentFormatFilter === 'All' ? 'all' : recentFormatFilter.toLowerCase(),
              opponent_team_ids: selectedOpponent ? selectedOpponent.team_ids : [],
              limit: 5,
            }),
          }
        );
        if (res.ok) {
          const json = await res.json();
          console.log("Player recent-form data:", json);
          setRecentFormBatting(Array.isArray(json?.data?.batting?.matches) ? json.data.batting.matches : []);
          setRecentFormBowling(Array.isArray(json?.data?.bowling?.matches) ? json.data.bowling.matches : []);
        }
      } catch (err) {
        console.error("Player recent-form fetch error:", err);
      }
    };
    fetchRecentForm();
  }, [playerId, recentFormatFilter, recentOpponentFilter, opponents]);

  // Real opponents list — powers the Opponent filter dropdown next to
  // Recent Performances tables in the Career Stats tab.
  useEffect(() => {
    if (!playerId) return;
    const fetchOpponents = async () => {
      try {
        const res = await fetch(
          `${SCORING_API_BASE}/api/v1/players/${playerId}/opponents`,
          { headers: { "ngrok-skip-browser-warning": "true" } }
        );
        if (res.ok) {
          const json = await res.json();
          console.log("Player opponents data:", json);
          const list = Array.isArray(json?.data?.opponents) ? json.data.opponents : [];
          setOpponents(list);
        }
      } catch (err) {
        console.error("Player opponents fetch error:", err);
      }
    };
    fetchOpponents();
  }, [playerId]);

  // Career-wide participation (from the history endpoint) — used to gate
  // the Batting/Bowling toggle while viewing Career Stats, since a player
  // might not have batted/bowled in a specific match but has career data
  // for it (or vice versa).
  const careerDidBat = (playerHistory?.career_summary.total.batting.innings ?? 0) > 0;
  const careerDidBowl = (playerHistory?.career_summary.total.bowling.innings ?? 0) > 0;
  const effectiveDidBat = statsTab === 'career' ? careerDidBat : didBat;
  const effectiveDidBowl = statsTab === 'career' ? careerDidBowl : didBowl;

  // Real — powers the Tournament Stats tab, replacing the MOCK_* constants
  // above (kept as-is, just unused now).
  const tTournament = tournamentPlayerStats?.tournament;
  const tDetails = tournamentPlayerStats?.tournament_details;
  const tBatting = tournamentPlayerStats?.batting;
  const tBowling = tournamentPlayerStats?.bowling;

  // Real — confirmed shape: `batting.wagon_wheel` is `{ outer_sectors: [...],
  // inner_sectors: [...] }`, each entry `{ sector, angle, runs, ... }`.
  // `outer_sectors`' `sector` names match this file's WAGON_ZONE_LAYOUT
  // `zone` names exactly (both say "Deep Mid Wicket", "Long On", etc.), so
  // this just looks up runs by that name — angle/innerLabel positioning
  // stays WAGON_ZONE_LAYOUT's own (decorative, not from the API).
  const tournamentWagonZones = useMemo(() => {
    const outerSectors = asArray<any>(tBatting?.wagon_wheel?.outer_sectors);
    return WAGON_ZONE_LAYOUT.map((layout) => {
      const match = outerSectors.find((s) => s.sector === layout.zone);
      return { ...layout, runs: match?.runs || 0 };
    });
  }, [tBatting]);

  // Maps the existing Overall/Tests/ODI/T20/T10 filter to the real
  // career_summary shape — "Overall" reads the pre-aggregated `total`
  // object, everything else looks up `by_format` by its lowercase key.
  const selectedFormatSummary: FormatSummary | undefined = useMemo(() => {
    if (!playerHistory) return undefined;
    if (careerFormatFilter === 'Overall') return playerHistory.career_summary.total;
    const key = careerFormatFilter === 'Tests' ? 'test' : careerFormatFilter.toLowerCase();
    return playerHistory.career_summary.by_format[key];
  }, [playerHistory, careerFormatFilter]);

  // Real per-player splits and recent form, straight from the scorecard row.
  const ballsToOvers = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;
  const paceSpinRows = useMemo(() => {
    const pvs = battingMatch?.entry.pace_vs_spin;
    if (!pvs) return [];
    return ([['Pace', pvs.pace], ['Spin', pvs.spin], ['Unknown', pvs.unknown]] as const)
      .filter(([label, d]) => d && (label !== 'Unknown' || d.balls > 0))
      .map(([type, d]) => ({
        type,
        oversPlayed: ballsToOvers(d!.balls),
        runs: d!.runs,
        avg: d!.dismissals > 0 ? (d!.runs / d!.dismissals).toFixed(2) : '-',
        sr: d!.SR,
        fours: d!.fours,
        sixes: d!.sixes,
        outs: d!.dismissals,
      }));
  }, [battingMatch]);

  const handSplitRows = useMemo(() => {
    const vbh = bowlingMatch?.entry.vs_batting_hand;
    if (!vbh) return [];
    return ([['Right-hand', vbh.right_handed], ['Left-hand', vbh.left_handed], ['Unknown', vbh.unknown]] as const)
      .filter(([label, d]) => d && (label !== 'Unknown' || d.balls > 0))
      .map(([hand, d]) => ({
        hand,
        overs: d!.overs,
        runs: d!.runs_given,
        avg: d!.wickets > 0 ? (d!.runs_given / d!.wickets).toFixed(2) : '-',
        econ: d!.economy,
        fours: d!.fours,
        sixes: d!.sixes,
        wkts: d!.wickets,
      }));
  }, [bowlingMatch]);

  const matchRecentPerformances = useMemo(() => {
    if (view === 'batting') {
      return (battingMatch?.entry.recent_performances || []).slice(0, 5).map((p) => ({
        score: `${p.runs} (${p.balls})`,
        detail: `${p["4s"]}x4 · ${p["6s"]}x6 · SR ${p.SR}`,
        matchName: p.match_name,
        date: p.match_date,
      }));
    }
    return (bowlingMatch?.entry.recent_performances || []).slice(0, 5).map((p) => ({
      score: `${p.wickets_taken}/${p.runs_given}`,
      detail: `${p.overs} ov · Econ ${p.economy}`,
      matchName: p.match_name,
      date: p.match_date,
    }));
  }, [view, battingMatch, bowlingMatch]);

  useEffect(() => {
    if (!loading) {
      if (didBat) setView('batting');
      else if (didBowl) setView('bowling');
    }
  }, [loading, didBat, didBowl]);

  // Standalone Career view (no matchId) — default to whichever discipline
  // the player actually has career data for, once it loads.
  useEffect(() => {
    if (!matchId && playerHistory) {
      if (careerDidBat) setView('batting');
      else if (careerDidBowl) setView('bowling');
    }
  }, [matchId, playerHistory, careerDidBat, careerDidBowl]);

  // --- Batting-side aggregates (all real, derived from `battingBalls`) ---
  const highestInMatch = useMemo(() => {
    if (!battingMatch) return false;
    const allRuns = [
      ...(scorecard?.innings_1?.batsmen || []),
      ...(scorecard?.innings_2?.batsmen || []),
    ].map((b) => b.runs);
    return allRuns.length > 0 && battingMatch.entry.runs === Math.max(...allRuns);
  }, [scorecard, battingMatch]);

  const dotBallPct = useMemo(() => {
    const faced = battingBalls.filter((b) => !b.is_wide);
    if (faced.length === 0) return 0;
    const dots = faced.filter((b) => b.total_runs === 0).length;
    return Math.round((dots / faced.length) * 1000) / 10;
  }, [battingBalls]);

  const dismissedAtOver = useMemo(() => {
    if (!battingMatch || !battingInnings?.fow) return null;
    const entry = battingInnings.fow.find((f) => namesMatch(f.batsman, playerName));
    return entry?.over ?? null;
  }, [battingInnings, battingMatch, playerName]);

  const shotTypeRows = useMemo(() => {
    const map: Record<string, { runs: number; balls: number }> = {};
    battingBalls.forEach((b) => {
      const key = b.shot_type;
      if (!key) return;
      if (!map[key]) map[key] = { runs: 0, balls: 0 };
      map[key].runs += b.batsman_runs ?? b.total_runs;
      map[key].balls += 1;
    });
    const rows = Object.entries(map).map(([shot, v]) => ({ shot, ...v }));
    rows.sort((a, b) => b.runs - a.runs);
    const maxRuns = rows.length > 0 ? rows[0].runs : 0;
    return rows.map((r) => ({ ...r, pct: maxRuns > 0 ? Math.round((r.runs / maxRuns) * 100) : 0 }));
  }, [battingBalls]);

  const wagonWheelZones = useMemo(() => {
    const runsByZone: Record<string, number> = {};
    battingBalls.forEach((b) => {
      if (!b.fielding_type) return;
      runsByZone[b.fielding_type] = (runsByZone[b.fielding_type] || 0) + (b.batsman_runs ?? b.total_runs);
    });
    return WAGON_ZONE_LAYOUT.map((z) => ({ ...z, runs: runsByZone[z.zone] || 0 }));
  }, [battingBalls]);

  const vsBowlerRows = useMemo(() => {
    const map: Record<string, { balls: number; runs: number; dots: number; fours: number; sixes: number }> = {};
    battingBalls.forEach((b) => {
      const key = b.bowler_name || 'Unknown';
      if (!map[key]) map[key] = { balls: 0, runs: 0, dots: 0, fours: 0, sixes: 0 };
      if (!b.is_wide) map[key].balls += 1;
      const runs = b.batsman_runs ?? b.total_runs;
      map[key].runs += runs;
      if (runs === 0 && !b.is_wide) map[key].dots += 1;
      if (runs === 4) map[key].fours += 1;
      if (runs === 6) map[key].sixes += 1;
    });
    return Object.entries(map).map(([bowler, v]) => ({
      bowler,
      ...v,
      sr: v.balls > 0 ? Math.round((v.runs / v.balls) * 1000) / 10 : 0,
    }));
  }, [battingBalls]);

  const battingKeyMoments = useMemo(() => {
    if (battingBalls.length === 0) return [];
    const moments: { label: string; sub: string; over: string }[] = [];
    const describe = (b: Ball) => {
      if (b.shot_type) return `${b.shot_type} shot.`;
      if ((b.batsman_runs ?? b.total_runs) === 0) return "Defended, no run.";
      return "Scored off the bat.";
    };
    const first = battingBalls[0];
    moments.push({ label: "First Ball", sub: describe(first), over: `Over ${first.over_number}` });
    const firstFour = battingBalls.find((b) => (b.batsman_runs ?? b.total_runs) === 4);
    if (firstFour) moments.push({ label: "First Boundary", sub: describe(firstFour), over: `Over ${firstFour.over_number}` });
    const firstSix = battingBalls.find((b) => (b.batsman_runs ?? b.total_runs) === 6);
    if (firstSix) moments.push({ label: "First Six", sub: describe(firstSix), over: `Over ${firstSix.over_number}` });
    const wicketBall = battingBalls.find((b) => b.is_wicket);
    if (wicketBall) {
      moments.push({
        label: "Wicket",
        sub: `${getOutDetailsString({ wickettype: wicketBall.wicket_type || 'Out', bowler: wicketBall.bowler_name || null, fielder: null })}.`,
        over: `Over ${wicketBall.over_number}`,
      });
    }
    return moments;
  }, [battingBalls]);

  // --- Bowling-side aggregates (all real, derived from `bowlingBalls`) ---
  const bowlingExtra = useMemo(() => {
    const dots = bowlingBalls.filter((b) => b.total_runs === 0 && !b.is_wide && !b.is_no_ball).length;
    const wides = bowlingBalls.filter((b) => b.is_wide).length;
    const noBalls = bowlingBalls.filter((b) => b.is_no_ball).length;
    return { dots, wides, noBalls };
  }, [bowlingBalls]);

  const vsBatterRows = useMemo(() => {
    const map: Record<string, { balls: number; runs: number; dots: number; fours: number; sixes: number; dismissed: boolean }> = {};
    bowlingBalls.forEach((b) => {
      const key = b.batsman_name || 'Unknown';
      if (!map[key]) map[key] = { balls: 0, runs: 0, dots: 0, fours: 0, sixes: 0, dismissed: false };
      if (!b.is_wide) map[key].balls += 1;
      map[key].runs += b.total_runs;
      if (b.total_runs === 0 && !b.is_wide && !b.is_no_ball) map[key].dots += 1;
      if (b.total_runs === 4) map[key].fours += 1;
      if (b.total_runs === 6) map[key].sixes += 1;
      if (b.is_wicket) map[key].dismissed = true;
    });
    return Object.entries(map).map(([batter, v]) => ({
      batter,
      ...v,
      econ: v.balls > 0 ? Math.round((v.runs / v.balls) * 6 * 100) / 100 : 0,
    }));
  }, [bowlingBalls]);

  // Groups deliveries into their over ("Over N" label matches the same
  // 0-indexed-over/ballNo===0 quirk already used for the ball-by-ball
  // timeline elsewhere), for the Bowling Manhattan chart.
  const manhattanOvers = useMemo(() => {
    const map: Record<number, { runs: number; wickets: number; fours: number; sixes: number; legalBalls: number }> = {};
    bowlingBalls.forEach((b) => {
      const [over, ballNo] = b.over_number.split('.').map(Number);
      const overLabel = ballNo === 0 ? over : over + 1;
      if (!map[overLabel]) map[overLabel] = { runs: 0, wickets: 0, fours: 0, sixes: 0, legalBalls: 0 };
      map[overLabel].runs += b.total_runs;
      if (b.is_wicket) map[overLabel].wickets += 1;
      if (b.total_runs === 4 && !b.is_wicket) map[overLabel].fours += 1;
      if (b.total_runs === 6 && !b.is_wicket) map[overLabel].sixes += 1;
      if (!b.is_wide && !b.is_no_ball) map[overLabel].legalBalls += 1;
    });
    return Object.entries(map)
      .map(([overLabel, v]) => ({ over: Number(overLabel), ...v, isMaiden: v.runs === 0 && v.legalBalls >= 6 }))
      .sort((a, b) => a.over - b.over);
  }, [bowlingBalls]);

  // Ball-type distribution across every legal delivery bowled this match.
  const typesOfRuns = useMemo(() => {
    const legal = bowlingBalls.filter((b) => !b.is_wide);
    const buckets: Record<string, number> = { Dots: 0, '1s': 0, '2s': 0, '3s': 0, '4s': 0, '6s': 0 };
    legal.forEach((b) => {
      if (b.total_runs === 0) buckets.Dots += 1;
      else if (b.total_runs === 1) buckets['1s'] += 1;
      else if (b.total_runs === 2) buckets['2s'] += 1;
      else if (b.total_runs === 3) buckets['3s'] += 1;
      else if (b.total_runs === 4) buckets['4s'] += 1;
      else if (b.total_runs === 6) buckets['6s'] += 1;
    });
    const total = legal.length || 1;
    return Object.entries(buckets).map(([label, count]) => ({ label, count, pct: Math.round((count / total) * 1000) / 10 }));
  }, [bowlingBalls]);

  const lineLengthRows = useMemo(() => {
    const map: Record<string, number> = {};
    let total = 0;
    bowlingBalls.forEach((b) => {
      if (!b.balling_length) return;
      map[b.balling_length] = (map[b.balling_length] || 0) + 1;
      total += 1;
    });
    return Object.entries(map)
      .map(([length, count]) => ({ length, pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.pct - a.pct);
  }, [bowlingBalls]);

  const bowlingKeyMoments = useMemo(() => {
    if (bowlingBalls.length === 0) return [];
    const moments: { label: string; sub: string; over: string }[] = [];
    const describe = (b: Ball) => {
      if (b.shot_type) return `Hit for ${b.total_runs} via ${b.shot_type.toLowerCase()}.`;
      return b.total_runs > 0 ? `Conceded ${b.total_runs} run(s).` : "Dot ball.";
    };
    const first = bowlingBalls[0];
    moments.push({ label: "First Delivery", sub: describe(first), over: `Over ${first.over_number}` });
    const firstFour = bowlingBalls.find((b) => b.total_runs === 4 && !b.is_wicket);
    if (firstFour) moments.push({ label: "First Boundary Conceded", sub: describe(firstFour), over: `Over ${firstFour.over_number}` });
    const firstSix = bowlingBalls.find((b) => b.total_runs === 6 && !b.is_wicket);
    if (firstSix) moments.push({ label: "First Six Conceded", sub: describe(firstSix), over: `Over ${firstSix.over_number}` });
    const wickets = bowlingBalls.filter((b) => b.is_wicket);
    wickets.slice(0, 2).forEach((w, idx) => {
      moments.push({
        label: idx === 0 ? "First Wicket" : "Second Wicket",
        sub: `${w.batsman_name || 'Batsman'} dismissed (${w.wicket_type || 'out'}).`,
        over: `Over ${w.over_number}`,
      });
    });
    return moments;
  }, [bowlingBalls]);

  // If the match went to a super over, the last one played is the actual
  // result of the match — same "last array element wins" logic as
  // MatchDetails.tsx's scoreboard.
  //result is either the last super-over's result,or the main scorecard's if no super-overs were played.
  //result is not that good so how weccan do it better so latter we would 
  const finalResult = superOvers.length > 0
    ? (superOvers[superOvers.length - 1]?.result || scorecard?.result)
    : scorecard?.result;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20 text-slate-600">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading player stats...
      </div>
    );
  }

  if (matchId && !didBat && !didBowl) {
    return (
      <div className="flex flex-col gap-6">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-slate-900 w-fit">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center shadow-xs">
          <h2 className="text-xl font-bold text-slate-900 mb-2">{playerName}</h2>
          <p className="text-slate-600 italic">This player did not bat or bowl in this match.</p>
        </div>
      </div>
    );
  }

  if (!matchId && !careerDidBat && !careerDidBowl && playerHistory) {
    return (
      <div className="flex flex-col gap-6">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-slate-900 w-fit">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center shadow-xs">
          <h2 className="text-xl font-bold text-slate-900 mb-2">{playerName}</h2>
          <p className="text-slate-600 italic">This player has no career batting or bowling record.</p>
        </div>
      </div>
    );
  }

  const activeBatsman = battingMatch?.entry;
  const activeBowler = bowlingMatch?.entry;

  return (
    <div className="flex flex-col gap-6">
      

      {/* --- HEADER: PLAYER BIO (mostly mock) + MATCH INFO (real) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs flex items-center gap-5">
          <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center text-2xl font-bold text-indigo-600 shrink-0">
            {playerName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{playerName}</h1>
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-xs">
              <div>
                <p className="text-slate-600 uppercase font-bold text-[10px]">Age</p>
                <p className="font-semibold text-slate-900">{playerHistory?.player.age ? `${playerHistory.player.age} yrs` : '— yrs'}</p>
              </div>
              <div>
                <p className="text-slate-600 uppercase font-bold text-[10px]">Batting Style</p>
                <p className="font-semibold text-slate-900">{playerHistory?.player.batting_hand || battingHand || '—'}</p>
              </div>
              <div>
                <p className="text-slate-600 uppercase font-bold text-[10px]">Bowling Style</p>
                <p className="font-semibold text-slate-900">{playerHistory?.player.bowling_type || bowlingType || (didBowl ? '—' : 'N/A')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-bold">{roleLabel}</span>
              <span className="text-[11px] text-slate-500 font-medium">
                {playerHistory?.player.country}
              </span>
            </div>
          </div>
        </div>

        {statsTab === 'career' ? null : statsTab === 'tournament' ? (
          // Real — from GET .../tournaments/:id/players/:id/stats.
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-slate-900">{tTournament?.name || '—'}</p>
              <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-bold uppercase">
                {tTournament?.status_label || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mb-3">
              <div>
                <p className="text-[10px] font-bold text-slate-600 uppercase">Matches Completed</p>
                <p className="font-bold text-slate-900">{tTournament?.matches_completed ?? 0} / {tTournament?.total_matches ?? 0}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-600 uppercase">Current Stage</p>
                <p className="font-bold text-indigo-600">{tTournament?.current_stage || '—'}</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 uppercase mb-1">
              <span>Progress</span>
              <span>{tTournament?.progress_percentage ?? 0}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${tTournament?.progress_percentage ?? 0}%` }} />
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-slate-900">Match Summary</p>
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase">
                {scorecard?.innings_1 && scorecard?.innings_2 ? 'Completed' : ''}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="font-bold text-slate-900 whitespace-nowrap">{(scorecard?.innings_1?.team_name || scorecard?.homeTeam || '').toUpperCase()}</p>
                <p className="text-slate-700 whitespace-nowrap">{scorecard?.innings_1?.runs ?? 0}/{scorecard?.innings_1?.wickets ?? 0} ({scorecard?.innings_1?.overs ?? 0})</p>
                {superOvers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {superOvers.map((so, idx) => {
                      const soInnings = getSoInnings(scorecard, so, '1st');
                      return (
                        <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-100 text-[9px] font-bold text-amber-700 whitespace-nowrap">
                          SO{idx + 1} {soInnings?.runs ?? 0}-{soInnings?.wickets ?? 0} ({soInnings?.overs ?? 0} ov)
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <span className="text-slate-500 text-xs font-bold">vs</span>
              <div className="text-right">
                <p className="font-bold text-slate-900 whitespace-nowrap">{(scorecard?.innings_2?.team_name || scorecard?.awayTeam || '').toUpperCase()}</p>
                <p className="text-slate-700 whitespace-nowrap">{scorecard?.innings_2?.runs ?? 0}/{scorecard?.innings_2?.wickets ?? 0} ({scorecard?.innings_2?.overs ?? 0})</p>
                {superOvers.length > 0 && (
                  <div className="flex flex-wrap justify-end gap-1 mt-1">
                    {superOvers.map((so, idx) => {
                      const soInnings = getSoInnings(scorecard, so, '2nd');
                      return (
                        <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-100 text-[9px] font-bold text-amber-700 whitespace-nowrap">
                          SO{idx + 1} {soInnings?.runs ?? 0}-{soInnings?.wickets ?? 0} ({soInnings?.overs ?? 0} ov)
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            {superOvers.length > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wider mt-3">Super Over</span>
            )}
            {finalResult && <p className="text-xs font-semibold text-emerald-600 mt-2">{finalResult}</p>}
          </div>
        )}
      </div>

      {/* --- TABS --- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-6 bg-white rounded-2xl border border-slate-100 shadow-xs px-5 py-4 w-full sm:w-auto">
          {(matchId ? (['match', 'tournament', 'career'] as const) : (['career'] as const)).map((t) => (
            <button
              key={t}
              onClick={() => setStatsTab(t)}
              className={`pb-1 text-sm font-bold capitalize border-b-2 transition-colors ${statsTab === t ? 'text-slate-900 border-slate-900' : 'text-slate-600 border-transparent'}`}
            >
              {t} Stats
            </button>
          ))}
        </div>
        <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-xs w-fit">
          <button
            onClick={() => setView('batting')}
            disabled={!effectiveDidBat}
            className={`px-6 py-2.5 text-xs font-bold rounded-xl transition-all ${view === 'batting' ? 'bg-[#0F1117] text-white shadow-md' : 'text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed'}`}
          >
            Batting
          </button>
          <button
            onClick={() => setView('bowling')}
            disabled={!effectiveDidBowl}
            className={`px-6 py-2.5 text-xs font-bold rounded-xl transition-all ${view === 'bowling' ? 'bg-[#0F1117] text-white shadow-md' : 'text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed'}`}
          >
            Bowling
          </button>
        </div>
      </div>

      {statsTab === 'career' && view === 'bowling' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h3 className="text-lg font-bold text-slate-900">Career Overview Summary</h3>
                <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-100">
                  {(['Overall', 'Tests', 'ODI', 'T20', 'T10'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setCareerFormatFilter(f)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${careerFormatFilter === f ? 'bg-[#0F1117] text-white shadow-md' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
                {[
                  { label: 'Matches', value: selectedFormatSummary?.total_matches ?? 0 },
                  { label: 'Innings', value: selectedFormatSummary?.bowling.innings ?? 0 },
                  { label: 'Overs', value: selectedFormatSummary?.bowling.overs ?? '0.0' },
                  { label: 'Balls', value: selectedFormatSummary?.bowling.balls_bowled ?? 0 },
                  { label: 'Maidens', value: selectedFormatSummary?.bowling.maidens ?? 0 },
                  { label: 'Wickets', value: selectedFormatSummary?.bowling.wickets ?? 0 },
                ].map((s) => (
                  <div key={s.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">{s.label}</p>
                    <p className="text-xl font-bold text-slate-900">{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
                {[
                  { label: 'Runs', value: selectedFormatSummary?.bowling.runs_given ?? 0 },
                  { label: '3W Hauls', value: selectedFormatSummary?.bowling.three_wicket_hauls ?? 0 },
                  { label: '5W Hauls', value: selectedFormatSummary?.bowling.five_wicket_hauls ?? 0 },
                  { label: 'Best Bowling', value: selectedFormatSummary?.bowling.best_bowling ?? 'N/A' },
                  { label: 'Economy', value: selectedFormatSummary?.bowling.economy ?? 0 },
                  { label: 'Strike Rate', value: selectedFormatSummary?.bowling.strike_rate ?? 0 },
                ].map((s) => (
                  <div key={s.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">{s.label}</p>
                    <p className="text-xl font-bold text-slate-900">{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Average', value: selectedFormatSummary?.bowling.average ?? 0 },
                  { label: 'Wide', value: selectedFormatSummary?.bowling.wides ?? 0 },
                  { label: 'No Ball', value: selectedFormatSummary?.bowling.no_balls ?? 0 },
                  { label: 'Dots', value: selectedFormatSummary?.bowling.dots ?? 0 },
                  { label: '4s', value: selectedFormatSummary?.bowling.fours_conceded ?? 0 },
                  { label: '6s', value: selectedFormatSummary?.bowling.sixes_conceded ?? 0 },
                ].map((s) => (
                  <div key={s.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">{s.label}</p>
                    <p className="text-xl font-bold text-slate-900">{s.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Format-wise Career Breakdown</h3>
              <p className="text-xs text-slate-600 mb-4">Performance metrics categorized by match format.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-2 pr-4">Format</th>
                      <th className="py-2 px-4 text-right">Matches</th>
                      <th className="py-2 px-4 text-right">Innings</th>
                      <th className="py-2 px-4 text-right">Overs</th>
                      <th className="py-2 px-4 text-right">Runs</th>
                      <th className="py-2 px-4 text-right">Wickets</th>
                      <th className="py-2 px-4 text-right">Best</th>
                      <th className="py-2 px-4 text-right">Average</th>
                      <th className="py-2 px-4 text-right">Economy</th>
                      <th className="py-2 px-4 text-right">Strike Rate</th>
                      <th className="py-2 pl-4 text-right">5W</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {FORMAT_ORDER.map(({ key, label }) => {
                      const f = playerHistory?.career_summary.by_format[key];
                      if (!f) return null;
                      return (
                        <tr key={key}>
                          <td className="py-3 pr-4 font-bold text-slate-900">{label}</td>
                          <td className="py-3 px-4 text-right text-slate-800">{f.total_matches}</td>
                          <td className="py-3 px-4 text-right text-slate-800">{f.bowling.innings}</td>
                          <td className="py-3 px-4 text-right text-slate-800">{f.bowling.overs}</td>
                          <td className="py-3 px-4 text-right text-slate-800">{f.bowling.runs_given}</td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900">{f.bowling.wickets}</td>
                          <td className="py-3 px-4 text-right text-slate-800">{f.bowling.best_bowling}</td>
                          <td className="py-3 px-4 text-right text-slate-800">{f.bowling.average}</td>
                          <td className="py-3 px-4 text-right text-slate-800">{f.bowling.economy}</td>
                          <td className="py-3 px-4 text-right text-slate-800">{f.bowling.strike_rate}</td>
                          <td className="py-3 pl-4 text-right text-slate-800">{f.bowling.five_wicket_hauls}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {false && (
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
                <h3 className="text-lg font-bold text-slate-900">Career Bowling Trend</h3>
                <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-100">
                  {BOWLING_TREND_TABS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setBowlingTrendMetric(t.key)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap ${bowlingTrendMetric === t.key ? 'bg-[#0F1117] text-white shadow-md' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-600 mb-4">Bowling performance across seasons and years.</p>
              <CareerTrendChart
                data={MOCK_CAREER_BOWLING_TREND}
                metric={bowlingTrendMetric}
                renderTooltip={(d) => (
                  <>
                    <p className="font-bold">Year: {d.year}</p>
                    <p>Matches: {d.matches}</p>
                    <p>Overs: {d.overs}</p>
                    <p>Wickets: <span className="font-bold text-indigo-300">{d.wickets}</span></p>
                    <p>Economy: {d.economy}</p>
                  </>
                )}
              />
            </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
                <h3 className="text-sm font-bold text-slate-900">Recent Bowling Performances</h3>
                <RecentPerformanceFilters
                  opponents={opponents}
                  opponentFilter={recentOpponentFilter}
                  onOpponentChange={setRecentOpponentFilter}
                  formatFilter={recentFormatFilter}
                  onFormatChange={setRecentFormatFilter}
                />
              </div>
              <p className="text-xs text-slate-600 mb-4">Latest matches and bowling figures.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 px-4">Team/opponent</th>
                      <th className="py-2 px-4">Format</th>
                      <th className="py-2 px-4 text-right">Overs</th>
                      <th className="py-2 px-4 text-right">Runs</th>
                      <th className="py-2 px-4 text-right">Wickets</th>
                      <th className="py-2 px-4 text-right">Economy</th>
                      <th className="py-2 pl-4 text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {recentFormBowling.length === 0 ? (
                      <tr><td colSpan={8} className="py-6 text-center text-slate-500 italic">No recent bowling performances found.</td></tr>
                    ) : recentFormBowling.map((r, i) => (
                      <tr key={i}>
                        <td className="py-3 pr-4 text-slate-700">{formatRecentDate(r.date)}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{String(r.home_team ?? '-')} vs {String(r.away_team ?? '-')}</td>
                        <td className="py-3 px-4 text-slate-700">{String(r.format ?? '-')}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{String(r.overs ?? '-')}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{String(r.runs_given ?? '-')}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">{String(r.wickets ?? '-')}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{String(r.economy ?? '-')}</td>
                        <td className="py-3 pl-4 text-right">
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold capitalize ${r.result === 'won' ? 'bg-emerald-50 text-emerald-600' : r.result === 'lost' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>{String(r.result ?? '-').replace('_', ' ')}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {false && (
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">Career Milestones</h3>
                <span className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer">View All <span aria-hidden>→</span></span>
              </div>
              <div className="relative flex flex-col gap-5 pl-4 border-l-2 border-slate-100">
                {MOCK_BOWLING_CAREER_MILESTONES.map((m, i) => (
                  <div key={i} className="relative">
                    <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-indigo-50" />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">{m.title}</p>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">{m.date}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{m.sub}</p>
                  </div>
                ))}
              </div>
            </div>
            )}

            {false && (
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Bowling Style Analysis</h3>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                  <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Average Speed</p>
                  <p className="text-lg font-bold text-slate-900">{MOCK_BOWLING_STYLE_ANALYSIS.averageSpeed}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                  <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Fastest Delivery</p>
                  <p className="text-lg font-bold text-slate-900">{MOCK_BOWLING_STYLE_ANALYSIS.fastestDelivery}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase mb-1">
                <span>Dot Ball Percentage</span>
                <span className="text-indigo-600">{MOCK_BOWLING_STYLE_ANALYSIS.dotBallPct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${MOCK_BOWLING_STYLE_ANALYSIS.dotBallPct}%` }} />
              </div>
            </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Career Wicket Breakdown</h3>
              <p className="text-xs text-slate-600 mb-4">Distribution by method of dismissal.</p>
              {(() => {
                const wbt = playerHistory?.career_summary.total.bowling.wickets_by_type;
                const rows = wbt
                  ? [
                      { method: 'Bowled', count: wbt.bowled, color: 'bg-indigo-500' },
                      { method: 'Caught', count: wbt.caught, color: 'bg-emerald-500' },
                      { method: 'LBW', count: wbt.lbw, color: 'bg-amber-500' },
                      { method: 'Stumped', count: wbt.stumped, color: 'bg-red-500' },
                      { method: 'Hit Wicket', count: wbt.hit_wicket, color: 'bg-slate-400' },
                    ]
                  : [];
                const total = rows.reduce((sum, x) => sum + x.count, 0);
                if (!wbt || total === 0) {
                  return <p className="text-slate-600 italic text-sm">No wicket data available.</p>;
                }
                return (
                  <>
                    <div className="h-2.5 rounded-full overflow-hidden flex mb-4">
                      {rows.filter((w) => w.count > 0).map((w) => (
                        <div key={w.method} className={w.color} style={{ width: `${(w.count / total) * 100}%` }} />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {rows.map((w) => (
                        <div key={w.method} className="flex items-center gap-2 text-xs">
                          <span className={`w-2 h-2 rounded-full ${w.color}`} />
                          <span className="text-slate-700">{w.method}: <span className="font-bold text-slate-900">{w.count}</span></span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      ) : statsTab === 'career' && view === 'batting' ? (
        <div className="flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h3 className="text-lg font-bold text-slate-900">Career Overview Summary</h3>
                <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-100">
                  {(['Overall', 'Tests', 'ODI', 'T20', 'T10'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setCareerFormatFilter(f)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${careerFormatFilter === f ? 'bg-[#0F1117] text-white shadow-md' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
                {[
                  { label: 'Matches', value: selectedFormatSummary?.total_matches ?? 0 },
                  { label: 'Innings', value: selectedFormatSummary?.batting.innings ?? 0 },
                  { label: 'Not Out', value: selectedFormatSummary?.batting.not_outs ?? 0 },
                  { label: 'Runs', value: selectedFormatSummary?.batting.runs ?? 0 },
                  { label: 'Highest Score', value: selectedFormatSummary?.batting.highest_score ?? 0 },
                  { label: 'Average', value: selectedFormatSummary?.batting.average ?? 0 },
                ].map((s) => (
                  <div key={s.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">{s.label}</p>
                    <p className="text-xl font-bold text-slate-900">{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
                {[
                  { label: 'Strike Rate', value: selectedFormatSummary?.batting.strike_rate ?? 0 },
                  { label: '30s', value: selectedFormatSummary?.batting.thirties ?? 0 },
                  { label: '50s', value: selectedFormatSummary?.batting.fifties ?? 0 },
                  { label: '100s', value: selectedFormatSummary?.batting.hundreds ?? 0 },
                  { label: '4s', value: selectedFormatSummary?.batting.fours ?? 0 },
                  { label: '6s', value: selectedFormatSummary?.batting.sixes ?? 0 },
                ].map((s) => (
                  <div key={s.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">{s.label}</p>
                    <p className="text-xl font-bold text-slate-900">{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                  <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Ducks</p>
                  <p className="text-xl font-bold text-slate-900">{selectedFormatSummary?.batting.ducks ?? 0}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Format-wise Career Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-2 pr-4">Format</th>
                      <th className="py-2 px-4 text-right">Matches</th>
                      <th className="py-2 px-4 text-right">Innings</th>
                      <th className="py-2 px-4 text-right">Runs</th>
                      <th className="py-2 px-4 text-right">Highest Score</th>
                      <th className="py-2 px-4 text-right">Average</th>
                      <th className="py-2 px-4 text-right">Strike Rate</th>
                      <th className="py-2 px-4 text-right">100s</th>
                      <th className="py-2 pl-4 text-right">50s</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {FORMAT_ORDER.map(({ key, label }) => {
                      const f = playerHistory?.career_summary.by_format[key];
                      if (!f) return null;
                      return (
                        <tr key={key}>
                          <td className="py-3 pr-4 font-bold text-slate-900">{label}</td>
                          <td className="py-3 px-4 text-right text-slate-800">{f.total_matches}</td>
                          <td className="py-3 px-4 text-right text-slate-800">{f.batting.innings}</td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900">{f.batting.runs}</td>
                          <td className="py-3 px-4 text-right text-slate-800">{f.batting.highest_score}</td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900">{f.batting.average}</td>
                          <td className="py-3 px-4 text-right text-slate-800">{f.batting.strike_rate}</td>
                          <td className="py-3 px-4 text-right text-slate-800">{f.batting.hundreds}</td>
                          <td className="py-3 pl-4 text-right text-slate-800">{f.batting.fifties}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {false && (
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
                <h3 className="text-lg font-bold text-slate-900">Career Batting Trend</h3>
                <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-100">
                  {TREND_TABS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTrendMetric(t.key)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap ${trendMetric === t.key ? 'bg-[#0F1117] text-white shadow-md' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-600 mb-4">Batting performance across seasons and years.</p>
              <CareerTrendChart
                data={MOCK_CAREER_TREND}
                metric={trendMetric}
                renderTooltip={(d) => (
                  <>
                    <p className="font-bold">Year: {d.year}</p>
                    <p>Matches: {d.matches}</p>
                    <p>Innings: {d.innings}</p>
                    <p>Runs: <span className="font-bold text-indigo-300">{d.runs}</span></p>
                    <p>Average: {d.average}</p>
                  </>
                )}
              />
            </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h3 className="text-sm font-bold text-slate-900">Detailed Recent Performances</h3>
                <RecentPerformanceFilters
                  opponents={opponents}
                  opponentFilter={recentOpponentFilter}
                  onOpponentChange={setRecentOpponentFilter}
                  formatFilter={recentFormatFilter}
                  onFormatChange={setRecentFormatFilter}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 px-4">Team</th>
                      <th className="py-2 px-4">Opponent</th>
                      <th className="py-2 px-4">Format</th>
                      <th className="py-2 px-4 text-right">Runs</th>
                      <th className="py-2 px-4 text-right">Balls</th>
                      <th className="py-2 px-4 text-right">Strike Rate</th>
                      <th className="py-2 pl-4 text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {recentFormBatting.length === 0 ? (
                      <tr><td colSpan={8} className="py-6 text-center text-slate-500 italic">No recent batting performances found.</td></tr>
                    ) : recentFormBatting.map((r, i) => (
                      <tr key={i}>
                        <td className="py-3 pr-4 text-slate-700">{formatRecentDate(r.date)}</td>
                        <td className="py-3 px-4 text-slate-800">{String(r.home_team ?? '-')}</td>
                        <td className="py-3 px-4 text-slate-800">{String(r.away_team ?? '-')}</td>
                        <td className="py-3 px-4 text-slate-700">{String(r.format ?? '-')}</td>
                        <td className="py-3 px-4 text-right font-bold text-blue-600">{String(r.runs ?? '-')}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{String(r.balls ?? '-')}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{String(r.strike_rate ?? '-')}</td>
                        <td className="py-3 pl-4 text-right">
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold capitalize ${r.result === 'won' ? 'bg-emerald-50 text-emerald-600' : r.result === 'lost' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>{String(r.result ?? '-').replace('_', ' ')}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          {false && (
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">Career Milestones</h3>
                <span className="text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer">View All</span>
              </div>
              <div className="relative flex flex-col gap-5 pl-4 border-l-2 border-slate-100">
                {MOCK_CAREER_MILESTONES.map((m, i) => (
                  <div key={i} className="relative">
                    <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-indigo-50" />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">{m.title}</p>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">{m.date}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{m.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : statsTab === 'tournament' && view === 'bowling' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Tournament Bowling Performance</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
                {[
                  { label: 'Matches', value: tBowling?.summary.matches ?? 0 },
                  { label: 'Innings', value: tBowling?.summary.innings ?? 0 },
                  { label: 'Overs', value: tBowling?.summary.overs ?? '0.0' },
                  { label: 'Wickets', value: tBowling?.summary.wickets ?? 0 },
                  { label: 'Runs Conceded', value: tBowling?.summary.runs_conceded ?? 0 },
                  { label: 'Economy', value: tBowling?.summary.economy ?? 0 },
                ].map((s) => (
                  <div key={s.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">{s.label}</p>
                    <p className="text-xl font-bold text-slate-900">{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
                {[
                  { label: 'Balling Average', value: tBowling?.summary.average ?? 0 },
                  { label: 'Strike Rate', value: tBowling?.summary.strike_rate ?? 0 },
                  { label: 'Maidens', value: tBowling?.summary.maidens ?? 0 },
                  { label: 'Best Bowling', value: tBowling?.summary.best_bowling || 'N/A' },
                  { label: 'Dot Balls', value: tBowling?.summary.dot_balls ?? 0 },
                  { label: '5W Hauls', value: tBowling?.summary.five_wicket_hauls ?? 0 },
                ].map((s) => (
                  <div key={s.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">{s.label}</p>
                    <p className="text-xl font-bold text-slate-900">{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Wides', value: tBowling?.summary.wides ?? 0 },
                  { label: 'No Balls', value: tBowling?.summary.no_balls ?? 0 },
                ].map((s) => (
                  <div key={s.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">{s.label}</p>
                    <p className="text-xl font-bold text-slate-900">{s.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Match-by-Match Performance</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 px-4">Opponent</th>
                      <th className="py-2 px-4 text-right">Overs</th>
                      <th className="py-2 px-4 text-right">Runs</th>
                      <th className="py-2 px-4 text-right">Wkts</th>
                      <th className="py-2 px-4 text-right">Economy</th>
                      <th className="py-2 px-4 text-right">Best</th>
                      <th className="py-2 px-4 text-right">Dots</th>
                      <th className="py-2 pl-4 text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {asArray<any>(tBowling?.match_by_match).length === 0 ? (
                      <tr><td colSpan={9} className="py-8 text-center text-slate-600 italic">No bowling matches in this tournament yet.</td></tr>
                    ) : asArray<any>(tBowling?.match_by_match).map((r: any, i: number) => (
                      <tr key={r.match_id || i}>
                        <td className="py-3 pr-4 text-slate-700">{formatRecentDate(r.date)}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{r.opponent}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{r.overs ?? 0}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{r.runs_given ?? r.runs ?? 0}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">{r.wickets ?? 0}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{r.economy ?? 0}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{r.best_bowling || r.best || '—'}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{r.dots ?? 0}</td>
                        <td className="py-3 pl-4 text-right">
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${/won/i.test(r.result_label || r.result || '') ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{r.result_label || r.result || '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-4">Line &amp; Length Distribution</h3>
                <LineLengthChart
                  rows={asArray<any>(tBowling?.line_and_length?.distribution)
                    .map((d: any) => ({ length: d.length.charAt(0).toUpperCase() + d.length.slice(1), pct: d.percentage }))
                    .filter((d: any) => d.pct > 0)}
                />
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-1">Tournament Wicket Breakdown</h3>
                <p className="text-xs text-slate-600 mb-4">Distribution by method of dismissal.</p>
                {(() => {
                  const wb = tBowling?.wicket_breakdown;
                  const rows = [
                    { method: 'Bowled', count: wb?.bowled ?? 0, color: 'bg-indigo-500' },
                    { method: 'LBW', count: wb?.lbw ?? 0, color: 'bg-amber-500' },
                    { method: 'Caught', count: wb?.caught ?? 0, color: 'bg-emerald-500' },
                    { method: 'Stumped', count: wb?.stumped ?? 0, color: 'bg-red-500' },
                    { method: 'Other', count: wb?.other ?? 0, color: 'bg-slate-400' },
                  ];
                  const total = wb?.total || rows.reduce((sum, x) => sum + x.count, 0);
                  if (!total) return <p className="text-slate-600 italic text-sm">No wickets taken in this tournament yet.</p>;
                  return (
                    <>
                      <div className="h-2.5 rounded-full overflow-hidden flex mb-4">
                        {rows.filter((w) => w.count > 0).map((w) => (
                          <div key={w.method} className={w.color} style={{ width: `${(w.count / total) * 100}%` }} />
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {rows.map((w) => (
                          <div key={w.method} className="flex items-center gap-2 text-xs">
                            <span className={`w-2 h-2 rounded-full ${w.color}`} />
                            <span className="text-slate-700">{w.method}: <span className="font-bold text-slate-900">{w.count}</span></span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Performance vs Batter</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-2 pr-4">Batsman</th>
                      <th className="py-2 px-4">Team</th>
                      <th className="py-2 px-4 text-right">Balls</th>
                      <th className="py-2 px-4 text-right">Runs</th>
                      <th className="py-2 px-4 text-right">Wkts</th>
                      <th className="py-2 px-4 text-right">4s</th>
                      <th className="py-2 px-4 text-right">6s</th>
                      <th className="py-2 px-4 text-right">Avg</th>
                      <th className="py-2 pl-4 text-right">Eco</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {asArray<any>(tBowling?.performance_vs_batters).length === 0 ? (
                      <tr><td colSpan={9} className="py-8 text-center text-slate-600 italic">No data yet.</td></tr>
                    ) : asArray<any>(tBowling?.performance_vs_batters).map((r: any, i: number) => (
                      <tr key={r.batter_id || i}>
                        <td className="py-3 pr-4 font-semibold text-slate-900">{r.batter_name || r.batsman_name}</td>
                        <td className="py-3 px-4 text-slate-700">{r.team_name || r.team}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{r.balls ?? 0}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">{r.runs ?? 0}</td>
                        <td className="py-3 px-4 text-right text-red-600 font-semibold">{r.wickets ?? 0}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{r.fours ?? 0}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{r.sixes ?? 0}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{r.average ?? '—'}</td>
                        <td className="py-3 pl-4 text-right text-slate-800">{r.economy ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Tournament Details</h3>
              <div className="flex flex-col gap-3 text-sm">
                {[
                  { label: 'Tournament', value: tDetails?.tournament || '—' },
                  { label: 'Format', value: tDetails?.format || '—' },
                  { label: 'Current Stage', value: tDetails?.current_stage || '—' },
                  { label: 'Squad Team', value: tDetails?.squad_team?.name || '—' },
                  { label: 'Matches Played', value: tDetails?.matches_played ?? 0 },
                  { label: 'Matches Remaining', value: tDetails?.matches_remaining ?? 0 },
                  { label: 'Progress', value: `${tDetails?.progress_percentage ?? 0}%` },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-slate-600">{row.label}</span>
                    <span className="font-bold text-slate-900">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {[
              { title: 'Bowling Leaderboard', rows: tBowling?.leaderboards?.wickets, suffix: ' Wickets' },
              { title: 'Bowling Economy Leaderboard', rows: tBowling?.leaderboards?.economy, suffix: '' },
              { title: 'Bowling Average Leaderboard', rows: tBowling?.leaderboards?.average, suffix: '' },
              { title: 'Bowling Strike Rate Leaderboard', rows: tBowling?.leaderboards?.strike_rate, suffix: '' },
            ].map((board) => (
              <div key={board.title} className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900">{board.title}</h3>
                </div>
                <div className="flex flex-col gap-3">
                  {asArray<any>(board.rows).length === 0 ? (
                    <p className="text-slate-600 italic text-sm">No data yet.</p>
                  ) : asArray<any>(board.rows).map((r: any) => (
                    <div key={r.player_id} className={`flex items-center justify-between ${r.is_current_player ? 'bg-indigo-50 -mx-2 px-2 py-1.5 rounded-lg' : ''}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-400 w-5">#{r.rank}</span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{r.player_name}</p>
                          <p className="text-[10px] text-slate-500">{r.team_short_name || r.team_name}</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-slate-900">{r.value}{board.suffix}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : statsTab === 'tournament' && view === 'batting' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Tournament Performance</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
                {[
                  { label: 'Matches', value: tBatting?.summary.matches ?? 0 },
                  { label: 'Innings', value: tBatting?.summary.innings ?? 0 },
                  { label: 'Runs', value: tBatting?.summary.runs ?? 0 },
                  { label: 'Average', value: tBatting?.summary.average ?? 0 },
                  { label: 'Strike Rate', value: tBatting?.summary.strike_rate ?? 0 },
                  { label: 'Highest Score', value: tBatting?.summary.highest_score ?? 0 },
                ].map((s) => (
                  <div key={s.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">{s.label}</p>
                    <p className="text-xl font-bold text-slate-900">{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
                {[
                  { label: '50s/100s', value: `${tBatting?.summary.fifties ?? 0}/${tBatting?.summary.hundreds ?? 0}` },
                  { label: 'Ball Faced', value: tBatting?.summary.balls_faced ?? 0 },
                  { label: 'Dot Balls', value: tBatting?.summary.dot_balls ?? 0 },
                  { label: '4s/6s', value: `${tBatting?.summary.fours ?? 0}/${tBatting?.summary.sixes ?? 0}` },
                  { label: 'Boundary %', value: `${tBatting?.summary.boundary_percentage ?? 0}%` },
                  { label: 'Boundary Runs', value: tBatting?.summary.boundary_runs ?? 0 },
                ].map((s) => (
                  <div key={s.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">{s.label}</p>
                    <p className="text-xl font-bold text-slate-900">{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Not Outs', value: tBatting?.summary.not_outs ?? 0 },
                  { label: 'Ducks', value: tBatting?.summary.ducks ?? 0 },
                ].map((s) => (
                  <div key={s.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">{s.label}</p>
                    <p className="text-xl font-bold text-slate-900">{s.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Match-by-Match Performance</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-2 pr-4">Match</th>
                      <th className="py-2 px-4">Opponent</th>
                      <th className="py-2 px-4">Venue</th>
                      <th className="py-2 px-4 text-right">Runs</th>
                      <th className="py-2 px-4 text-right">Balls</th>
                      <th className="py-2 px-4 text-right">Strike Rate</th>
                      <th className="py-2 px-4 text-right">4s</th>
                      <th className="py-2 px-4 text-right">6s</th>
                      <th className="py-2 pl-4 text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {asArray<any>(tBatting?.match_by_match).length === 0 ? (
                      <tr><td colSpan={9} className="py-8 text-center text-slate-600 italic">No batting matches in this tournament yet.</td></tr>
                    ) : asArray<any>(tBatting?.match_by_match).map((r: any) => (
                      <tr key={r.match_id}>
                        <td className="py-3 pr-4 font-semibold text-slate-900">{r.match_number ? `M${r.match_number}` : formatRecentDate(r.date)}</td>
                        <td className="py-3 px-4 text-slate-800">{r.opponent}</td>
                        <td className="py-3 px-4 text-slate-700">{r.venue}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">{r.runs}{r.not_out ? '*' : ''}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{r.balls}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{r.strike_rate}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{r.fours}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{r.sixes}</td>
                        <td className="py-3 pl-4 text-right">
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${/won/i.test(r.result_label || r.result || '') ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{r.result_label || r.result}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-4">Scoring Areas (Wagon Wheel)</h3>
                <div className="relative w-full aspect-square max-w-[420px] mx-auto">
                  <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
                    <circle cx="100" cy="100" r="92" className="fill-[#7BC96F]" />
                    <circle cx="100" cy="100" r="54" fill="none" className="stroke-white/60" strokeWidth="1" strokeDasharray="3 3" />
                    {WAGON_DIVIDERS.map((angle) => {
                      const { x, y } = polarSvg(angle, 92);
                      return <line key={angle} x1="100" y1="100" x2={x} y2={y} stroke="white" strokeWidth="1.5" />;
                    })}
                    <rect x="97" y="86" width="6" height="28" rx="2" className="fill-amber-300" />
                    {tournamentWagonZones.map(({ zone, angle }) => (
                      <path
                        key={`wedge-${zone}`}
                        d={wedgePath(angle, 92)}
                        fill={hoveredWagon?.zone === zone ? 'rgba(255,255,255,0.28)' : 'transparent'}
                        className="cursor-pointer transition-colors"
                        onMouseEnter={() => setHoveredWagon({ zone, label: zone })}
                        onMouseLeave={() => setHoveredWagon(null)}
                      />
                    ))}
                  </svg>
                  {/* Inner position labels — kept inside the dashed infield circle, directly hoverable. */}
                  {tournamentWagonZones.map(({ zone, innerLabel, angle, runs }) => {
                    const { left, top } = polarPct(angle, 17);
                    return (
                      <div
                        key={`inner-${zone}`}
                        className="absolute text-center -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                        style={{ left: `${left}%`, top: `${top}%` }}
                        onMouseEnter={() => setHoveredWagon({ zone, label: innerLabel })}
                        onMouseLeave={() => setHoveredWagon(null)}
                      >
                        <p className="text-[8px] font-semibold text-black uppercase leading-tight whitespace-nowrap">{innerLabel}</p>
                        {runs > 0 && <p className="text-[8px] font-bold text-blue-600 leading-tight">{runs}</p>}
                      </div>
                    );
                  })}
                  {/* Outer zone name + runs — kept inside the green circle, near the rim, directly hoverable. */}
                  {tournamentWagonZones.map(({ zone, angle, runs }) => {
                    const { left, top } = polarPct(angle, 34);
                    return (
                      <div
                        key={zone}
                        className="absolute w-14 text-center -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                        style={{ left: `${left}%`, top: `${top}%` }}
                        onMouseEnter={() => setHoveredWagon({ zone, label: zone })}
                        onMouseLeave={() => setHoveredWagon(null)}
                      >
                        <p className="text-[9px] font-semibold text-black leading-[1.15]">{zone}</p>
                        <p className="text-[10px] font-extrabold text-blue-600 leading-tight">{runs} Runs</p>
                      </div>
                    );
                  })}
                  {/* Hover popup — shows whichever label (inner or outer) was hovered, and its runs, large, centered over the wheel. */}
                  {hoveredWagon && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-white rounded-xl shadow-lg border border-slate-200 px-5 py-3 text-center">
                        <p className="text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">{hoveredWagon.label}</p>
                        <p className="text-2xl font-extrabold text-blue-600 whitespace-nowrap">
                          {tournamentWagonZones.find((z) => z.zone === hoveredWagon.zone)?.runs ?? 0} Runs
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-4">Runs by Shot Type</h3>
                <div className="flex flex-col gap-3">
                  {asArray<any>(tBatting?.runs_by_shot_type).length === 0 ? (
                    <p className="text-slate-600 italic text-sm">No shot-type data available.</p>
                  ) : asArray<any>(tBatting?.runs_by_shot_type).map((s: any, i: number) => (
                    // The API has returned this entry's shot name under
                    // `shot` and, elsewhere, `shot_type` — read either.
                    <div key={s.shot || s.shot_type || i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-900">{s.shot || s.shot_type}</span>
                        <span className="text-slate-700">{s.runs} Runs ({s.balls} Balls)</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${s.percentage}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Performance vs Bowlers</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-2 pr-4">Bowler</th>
                      <th className="py-2 px-4">Team</th>
                      <th className="py-2 px-4 text-right">Balls</th>
                      <th className="py-2 px-4 text-right">Runs</th>
                      <th className="py-2 px-4 text-right">Wkts</th>
                      <th className="py-2 px-4 text-right">4s</th>
                      <th className="py-2 px-4 text-right">6s</th>
                      <th className="py-2 px-4 text-right">S.R.</th>
                      <th className="py-2 pl-4 text-right">Avg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {asArray<any>(tBatting?.performance_vs_bowlers).length === 0 ? (
                      <tr><td colSpan={9} className="py-8 text-center text-slate-600 italic">No data yet.</td></tr>
                    ) : asArray<any>(tBatting?.performance_vs_bowlers).map((r: any) => (
                      <tr key={r.bowler_id}>
                        <td className="py-3 pr-4 font-semibold text-slate-900">
                          {r.bowler_name} {r.matches > 1 && <span className="text-amber-600 font-medium">({r.matches} Matches)</span>}
                        </td>
                        <td className="py-3 px-4 text-slate-700">{r.team}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{r.balls}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">{r.runs}</td>
                        <td className="py-3 px-4 text-right text-red-600 font-semibold">{r.wickets}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{r.fours}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{r.sixes}</td>
                        <td className="py-3 px-4 text-right text-slate-800">{r.strike_rate}</td>
                        <td className="py-3 pl-4 text-right text-slate-800">{r.average || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {[
              { title: 'Batting Leaderboard', rows: tBatting?.leaderboards?.most_runs, suffix: ' Runs' },
              { title: 'Most Sixes', rows: tBatting?.leaderboards?.most_sixes, suffix: ' Sixes' },
              { title: 'Most Fours', rows: tBatting?.leaderboards?.most_fours, suffix: ' Fours' },
              { title: 'Top Strike Rate', rows: tBatting?.leaderboards?.top_strike_rate, suffix: ' SR' },
              { title: 'Highest Average', rows: tBatting?.leaderboards?.highest_average, suffix: ' Avg' },
            ].map((board) => (
              <div key={board.title} className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900">{board.title}</h3>
                </div>
                <div className="flex flex-col gap-3">
                  {asArray<any>(board.rows).length === 0 ? (
                    <p className="text-slate-600 italic text-sm">No data yet.</p>
                  ) : asArray<any>(board.rows).map((r: any) => (
                    <div key={r.player_id} className={`flex items-center justify-between ${r.is_current_player ? 'bg-indigo-50 -mx-2 px-2 py-1.5 rounded-lg' : ''}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-400 w-5">#{r.rank}</span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{r.player_name}</p>
                          <p className="text-[10px] text-slate-500">{r.team_short_name || r.team_name}</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-slate-900">{r.value}{board.suffix}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : !matchId ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center shadow-xs">
          <p className="text-slate-600 italic">Open this page from a specific match to see Match/Tournament stats.</p>
        </div>
      ) : view === 'batting' && !didBat ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center shadow-xs">
          <p className="text-slate-600 italic">{playerName} did not bat in this match.</p>
        </div>
      ) : view === 'bowling' && !didBowl ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center shadow-xs">
          <p className="text-slate-600 italic">{playerName} did not bowl in this match.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <div className="flex flex-col gap-6">
            {view === 'batting' && activeBatsman && (
              <>
                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h3 className="text-lg font-bold text-slate-900">Batting Performance</h3>
                    <p className="text-xs text-slate-700">
                      Dismissal: <span className="font-bold text-slate-900">{getOutDetailsString(activeBatsman.outdetails)}</span>
                      {dismissedAtOver !== null && <> &nbsp; Dismissed At: <span className="font-bold text-slate-900">{dismissedAtOver} Overs</span></>}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {[
                      { label: 'Runs', value: activeBatsman.runs, sub: highestInMatch ? 'Highest in Match' : '' },
                      { label: 'Balls Faced', value: activeBatsman.balls, sub: `Dot Ball %: ${dotBallPct}%` },
                      { label: 'Fours', value: activeBatsman["4s"], sub: `${activeBatsman["4s"] * 4} Runs` },
                      { label: 'Sixes', value: activeBatsman["6s"], sub: `${activeBatsman["6s"] * 6} Runs` },
                      { label: 'Strike Rate', value: activeBatsman.SR, sub: '' },
                    ].map((s) => (
                      <div key={s.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                        <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">{s.label}</p>
                        <p className="text-xl font-bold text-slate-900">{s.value}</p>
                        {s.sub && <p className="text-[10px] text-slate-600 mt-1">{s.sub}</p>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-900 mb-4">{playerName} vs Bowlers</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-100">
                          <th className="py-2 pr-4">Bowler</th>
                          <th className="py-2 px-4 text-right">B</th>
                          <th className="py-2 px-4 text-right">R</th>
                          <th className="py-2 px-4 text-right">D</th>
                          <th className="py-2 px-4 text-right">4s</th>
                          <th className="py-2 px-4 text-right">6s</th>
                          <th className="py-2 pl-4 text-right">SR</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-sm">
                        {vsBowlerRows.map((r) => (
                          <tr key={r.bowler}>
                            <td className="py-3 pr-4 font-semibold text-slate-900">{r.bowler}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.balls}</td>
                            <td className="py-3 px-4 text-right font-bold text-slate-900">{r.runs}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.dots}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.fours}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.sixes}</td>
                            <td className="py-3 pl-4 text-right text-slate-800">{r.sr}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-900 mb-4">Pace vs Spin</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-100">
                          <th className="py-2 pr-4">Type</th>
                          <th className="py-2 px-4 text-right">Overs Played</th>
                          <th className="py-2 px-4 text-right">Runs</th>
                          <th className="py-2 px-4 text-right">Avg.</th>
                          <th className="py-2 px-4 text-right">SR</th>
                          <th className="py-2 px-4 text-right">4s</th>
                          <th className="py-2 px-4 text-right">6s</th>
                          <th className="py-2 pl-4 text-right">Outs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-sm">
                        {paceSpinRows.length === 0 && (
                          <tr><td colSpan={8} className="py-6 text-center text-slate-600 italic">No pace vs spin data available.</td></tr>
                        )}
                        {paceSpinRows.map((r) => (
                          <tr key={r.type}>
                            <td className="py-3 pr-4 font-semibold text-slate-900">{r.type}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.oversPlayed}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.runs}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.avg}</td>
                            <td className="py-3 px-4 text-right font-bold text-slate-900">{r.sr}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.fours}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.sixes}</td>
                            <td className="py-3 pl-4 text-right text-slate-800">{r.outs}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                    <h3 className="text-sm font-bold text-slate-900 mb-4">Scoring Areas (Wagon Wheel)</h3>
                    <div className="relative w-full aspect-square max-w-[420px] mx-auto">
                      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
                        <circle cx="100" cy="100" r="92" className="fill-[#7BC96F]" />
                        <circle cx="100" cy="100" r="54" fill="none" className="stroke-white/60" strokeWidth="1" strokeDasharray="3 3" />
                        {WAGON_DIVIDERS.map((angle) => {
                          const { x, y } = polarSvg(angle, 92);
                          return <line key={angle} x1="100" y1="100" x2={x} y2={y} stroke="white" strokeWidth="1.5" />;
                        })}
                        <rect x="97" y="86" width="6" height="28" rx="2" className="fill-amber-300" />
                        {wagonWheelZones.map(({ zone, angle }) => (
                          <path
                            key={`wedge-${zone}`}
                            d={wedgePath(angle, 92)}
                            fill={hoveredWagon?.zone === zone ? 'rgba(255,255,255,0.28)' : 'transparent'}
                            className="cursor-pointer transition-colors"
                            onMouseEnter={() => setHoveredWagon({ zone, label: zone })}
                            onMouseLeave={() => setHoveredWagon(null)}
                          />
                        ))}
                      </svg>
                      {/* Inner position labels — kept inside the dashed infield circle, directly hoverable. */}
                      {wagonWheelZones.map(({ zone, innerLabel, angle, runs }) => {
                        const { left, top } = polarPct(angle, 17);
                        return (
                          <div
                            key={`inner-${zone}`}
                            className="absolute text-center -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                            style={{ left: `${left}%`, top: `${top}%` }}
                            onMouseEnter={() => setHoveredWagon({ zone, label: innerLabel })}
                            onMouseLeave={() => setHoveredWagon(null)}
                          >
                            <p className="text-[8px] font-semibold text-black uppercase leading-tight whitespace-nowrap">{innerLabel}</p>
                            {runs > 0 && <p className="text-[8px] font-bold text-blue-600 leading-tight">{runs}</p>}
                          </div>
                        );
                      })}
                      {/* Outer zone name + runs — kept inside the green circle, near the rim, directly hoverable. */}
                      {wagonWheelZones.map(({ zone, angle, runs }) => {
                        const { left, top } = polarPct(angle, 34);
                        return (
                          <div
                            key={zone}
                            className="absolute w-14 text-center -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                            style={{ left: `${left}%`, top: `${top}%` }}
                            onMouseEnter={() => setHoveredWagon({ zone, label: zone })}
                            onMouseLeave={() => setHoveredWagon(null)}
                          >
                            <p className="text-[9px] font-semibold text-black leading-[1.15]">{zone}</p>
                            <p className="text-[10px] font-extrabold text-blue-600 leading-tight">{runs} Runs</p>
                          </div>
                        );
                      })}
                      {/* Hover popup — shows whichever label (inner or outer) was hovered, and its runs, large, centered over the wheel. */}
                      {hoveredWagon && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="bg-white rounded-xl shadow-lg border border-slate-200 px-5 py-3 text-center">
                            <p className="text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">{hoveredWagon.label}</p>
                            <p className="text-2xl font-extrabold text-blue-600 whitespace-nowrap">
                              {wagonWheelZones.find((z) => z.zone === hoveredWagon.zone)?.runs ?? 0} Runs
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                    <h3 className="text-sm font-bold text-slate-900 mb-4">Runs by Shot Type</h3>
                    {shotTypeRows.length === 0 ? (
                      <p className="text-slate-600 italic text-sm">No shot-type data available.</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {shotTypeRows.map((s) => (
                          <div key={s.shot}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="font-semibold text-slate-900">{s.shot}</span>
                              <span className="text-slate-700">{s.runs} Runs ({s.balls} Balls)</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${s.pct}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {view === 'bowling' && activeBowler && (
              <>
                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs overflow-x-auto">
                  <div className="flex items-center justify-between gap-2 min-w-max sm:min-w-0">
                    {[
                      { label: 'Overs', value: activeBowler.overs },
                      { label: 'Wickets', value: activeBowler.wickets_taken },
                      { label: 'Runs', value: activeBowler.runs_given },
                      { label: 'Dots', value: bowlingExtra.dots },
                      { label: 'Eco', value: activeBowler.economy },
                      { label: 'Maidens', value: activeBowler.maiden },
                      { label: 'Wides', value: bowlingExtra.wides },
                      { label: 'No balls', value: bowlingExtra.noBalls },
                    ].map((s, i) => (
                      <React.Fragment key={s.label}>
                        {i > 0 && <div className="w-px h-9 border-l border-dashed border-slate-200 shrink-0" />}
                        <div className="text-center px-2 shrink-0">
                          <p className="text-[10px] font-bold text-slate-600 uppercase mb-1 whitespace-nowrap">{s.label}</p>
                          <p className="text-xl font-bold text-slate-900">{s.value}</p>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-900 mb-4">{playerName} vs Batters</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-100">
                          <th className="py-2 pr-4">Batter</th>
                          <th className="py-2 px-4 text-right">B</th>
                          <th className="py-2 px-4 text-right">R</th>
                          <th className="py-2 px-4 text-right">Dots</th>
                          <th className="py-2 px-4 text-right">4s</th>
                          <th className="py-2 px-4 text-right">6s</th>
                          <th className="py-2 px-4 text-right">Eco</th>
                          <th className="py-2 pl-4 w-6" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-sm">
                        {vsBatterRows.map((r) => (
                          <tr key={r.batter}>
                            <td className="py-3 pr-4 font-semibold text-slate-900">
                              {r.batter}
                              {r.dismissed && (
                                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded bg-red-100 text-red-600 text-[9px] font-bold align-middle">W</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.balls}</td>
                            <td className="py-3 px-4 text-right font-bold text-slate-900">{r.runs}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.dots}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.fours}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.sixes}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.econ}</td>
                            <td className="py-3 pl-4 text-right text-slate-400"><ChevronRight className="w-4 h-4 inline" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-900 mb-4">Right-hand vs Left-hand Batsmen</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-100">
                          <th className="py-2 pr-4">Batsman</th>
                          <th className="py-2 px-4 text-right">Overs</th>
                          <th className="py-2 px-4 text-right">Runs</th>
                          <th className="py-2 px-4 text-right">Avg.</th>
                          <th className="py-2 px-4 text-right">Econ</th>
                          <th className="py-2 px-4 text-right">4s</th>
                          <th className="py-2 px-4 text-right">6s</th>
                          <th className="py-2 pl-4 text-right">Wkts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-sm">
                        {handSplitRows.length === 0 && (
                          <tr><td colSpan={8} className="py-6 text-center text-slate-600 italic">No batting-hand data available.</td></tr>
                        )}
                        {handSplitRows.map((r) => (
                          <tr key={r.hand}>
                            <td className="py-3 pr-4 font-semibold text-slate-900">{r.hand}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.overs}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.runs}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.avg}</td>
                            <td className="py-3 px-4 text-right font-bold text-slate-900">{r.econ}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.fours}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.sixes}</td>
                            <td className="py-3 pl-4 text-right text-slate-800">{r.wkts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Bowling Manhattan</h3>
                  <p className="text-xs text-slate-600 mb-4">Runs conceded per over</p>
                  {manhattanOvers.length === 0 ? (
                    <p className="text-slate-600 italic text-sm">No over-by-over data available.</p>
                  ) : (() => {
                    const maxRuns = Math.max(...manhattanOvers.map((o) => o.runs), 1);
                    const niceMax = Math.ceil((maxRuns + 1) / 2) * 2;
                    const chartW = 780;
                    const chartH = 200;
                    const pad = { left: 32, right: 10, top: 20, bottom: 24 };
                    const plotW = chartW - pad.left - pad.right;
                    const plotH = chartH - pad.top - pad.bottom;
                    const slotW = plotW / 20;
                    const yAt = (v: number) => pad.top + (1 - v / niceMax) * plotH;
                    const ticks = [0, 1, 2, 3].map((t) => Math.round((niceMax / 3) * t));
                    const hovered = manhattanOvers.find((o) => o.over === hoveredManhattanOver);
                    return (
                      <div className="relative w-full" style={{ paddingBottom: `${(chartH / chartW) * 100}%` }}>
                        <svg viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                          {ticks.map((t) => (
                            <g key={t}>
                              <line x1={pad.left} y1={yAt(t)} x2={chartW - pad.right} y2={yAt(t)} stroke="#F1F5F9" strokeWidth="1" />
                              <text x={pad.left - 6} y={yAt(t) + 4} textAnchor="end" fontSize="10" fill="#64748B">{t}</text>
                            </g>
                          ))}
                          {Array.from({ length: 20 }, (_, i) => i + 1).map((overNum) => {
                            const data = manhattanOvers.find((o) => o.over === overNum);
                            const cx = pad.left + (overNum - 0.5) * slotW;
                            return (
                              <g key={overNum}>
                                <text x={cx} y={chartH - 4} textAnchor="middle" fontSize="10" fill="#64748B">{overNum}</text>
                                {data && (
                                  <>
                                    <rect
                                      x={cx - slotW * 0.28}
                                      y={data.isMaiden ? yAt(0) - 14 : yAt(data.runs)}
                                      width={slotW * 0.56}
                                      height={data.isMaiden ? 14 : Math.max(yAt(0) - yAt(data.runs), 2)}
                                      className={`cursor-pointer ${data.isMaiden ? 'fill-emerald-400' : data.wickets > 0 ? 'fill-indigo-400' : 'fill-indigo-300'}`}
                                      onMouseEnter={() => setHoveredManhattanOver(overNum)}
                                      onMouseLeave={() => setHoveredManhattanOver(null)}
                                    />
                                    {data.isMaiden ? (
                                      <text x={cx} y={yAt(0) - 5} textAnchor="middle" fontSize="9" fontWeight="bold" fill="white">M</text>
                                    ) : (
                                      <text x={cx} y={yAt(data.runs) - 5} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#1E293B">{data.runs}</text>
                                    )}
                                    {data.wickets > 0 && !data.isMaiden && (
                                      <rect x={cx - 8} y={yAt(data.runs) - 29} width={16} height={14} rx={3} className="fill-red-500" />
                                    )}
                                    {data.wickets > 0 && !data.isMaiden && (
                                      <text x={cx} y={yAt(data.runs) - 19} textAnchor="middle" fontSize="9" fontWeight="bold" fill="white">W</text>
                                    )}
                                  </>
                                )}
                              </g>
                            );
                          })}
                        </svg>
                        {hovered && (
                          <div
                            className="absolute bg-slate-900 text-white text-[11px] rounded-lg px-3 py-2 shadow-lg pointer-events-none -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap"
                            style={{
                              left: `${((pad.left + (hovered.over - 0.5) * slotW) / chartW) * 100}%`,
                              top: `${(yAt(hovered.isMaiden ? 0 : hovered.runs) / chartH) * 100}%`,
                            }}
                          >
                            <p className="font-bold">Over {hovered.over}</p>
                            <p>Runs: <span className="font-bold text-indigo-300">{hovered.runs}</span></p>
                            <p>Wickets: {hovered.wickets}</p>
                            <p>Fours: {hovered.fours}</p>
                            <p>Sixes: {hovered.sixes}</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex items-center gap-4 mt-3 text-xs text-slate-600">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block" /> Maiden Over</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Wicket</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                    <h3 className="text-sm font-bold text-slate-900 mb-1">Types of runs</h3>
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-1.5 mb-4 inline-block">Total runs given: {activeBowler.runs_given}</p>
                    {(() => {
                      const legendColors: Record<string, string> = { Dots: 'bg-indigo-500', '1s': 'bg-amber-400', '2s': 'bg-yellow-400', '3s': 'bg-teal-400', '4s': 'bg-emerald-500', '6s': 'bg-red-500' };
                      const maxPct = Math.max(...typesOfRuns.map((t) => t.pct), 10);
                      const niceMax = Math.ceil(maxPct / 10) * 10;
                      const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((niceMax / 4) * i));
                      return (
                        <>
                          <div className="flex gap-2">
                            <p className="text-[10px] font-semibold text-slate-500 whitespace-nowrap [writing-mode:vertical-lr] rotate-180 self-stretch text-center py-1">Percentage (%)</p>
                            <div className="flex flex-col-reverse justify-between h-40 pb-1 text-[10px] text-slate-600 font-semibold text-right">
                              {ticks.map((t) => <span key={t}>{t}</span>)}
                            </div>
                            <div className="relative flex-1">
                              <div className="absolute inset-0 h-40 flex flex-col-reverse justify-between pb-1">
                                {ticks.map((t) => <div key={t} className="border-t border-slate-100 w-full" />)}
                              </div>
                              <div className="relative flex items-end justify-between gap-3 h-40 border-b border-slate-200 pb-1">
                                {typesOfRuns.map((t) => (
                                  <div key={t.label} className="flex-1 flex flex-col items-center justify-end h-full">
                                    <div
                                      className={`w-full rounded-t-md min-h-[2px] ${legendColors[t.label]}`}
                                      style={{ height: `${niceMax > 0 ? (t.pct / niceMax) * 100 : 0}%` }}
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="flex justify-between gap-3 mt-1">
                                {typesOfRuns.map((t) => (
                                  <span key={t.label} className="flex-1 text-center text-[10px] font-semibold text-slate-700">{t.label}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-3 mt-4 text-xs text-slate-600">
                            {typesOfRuns.map((t) => (
                              <span key={t.label} className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${legendColors[t.label]}`} /> {t.label}: <span className="font-bold text-slate-900">{t.count}</span></span>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                    <h3 className="text-sm font-bold text-slate-900 mb-4">Line &amp; Length Distribution</h3>
                    <LineLengthChart rows={lineLengthRows} />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* --- SIDEBAR: Key Moments (real, derived) + Recent Performances (mock) --- */}
          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Key Moments</h3>
              {(view === 'batting' ? battingKeyMoments : bowlingKeyMoments).length === 0 ? (
                <p className="text-slate-600 italic text-sm">No key moments recorded.</p>
              ) : (
                <div className="relative flex flex-col gap-5 pl-4 border-l-2 border-slate-100">
                  {(view === 'batting' ? battingKeyMoments : bowlingKeyMoments).map((m, i) => (
                    <div key={i} className="relative">
                      <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-indigo-50" />
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-900">{m.label}</p>
                        <span className="text-[10px] text-slate-600 whitespace-nowrap">{m.over}</span>
                      </div>
                      <p className="text-xs text-slate-700 mt-0.5">{m.sub}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Recent Performances</h3>
              {matchRecentPerformances.length === 0 ? (
                <p className="text-slate-600 italic text-sm">No recent performances.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {matchRecentPerformances.map((p, i) => (
                    <div key={i} className="flex justify-between items-center gap-3 border-b border-slate-50 pb-3 last:border-b-0 last:pb-0">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{p.score}</p>
                        <p className="text-[11px] text-slate-600">{p.detail}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-slate-700">{p.matchName}</p>
                        <p className="text-[11px] text-slate-600">{formatRecentDate(p.date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayerMatchStats;
