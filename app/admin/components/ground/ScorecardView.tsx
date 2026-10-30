"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';

// The scorecard endpoint (`/api/v1/matches/:matchId/scorecard`, already fetched
// by MatchDetails.tsx and passed down here) returns an ARRAY: index 0 is the
// main match, and any further elements are sequential super-overs — same
// split scoring-frontend's own scoreboard page uses (`data.slice(1)`). Each
// element shares the exact same shape (innings_1/innings_2 with batting/
// bowling/fow/partnerships), so the same rendering logic is reused for both.
export interface OutDetails {
  wickettype: string;
  bowler: string | null;
  fielder: string | null;
}

export interface PaceSpinSplit {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dots: number;
  dismissals: number;
  SR: number;
}

export interface PaceVsSpin {
  pace: PaceSpinSplit;
  spin: PaceSpinSplit;
  unknown?: PaceSpinSplit;
}

export interface HandSplit {
  balls: number;
  overs: string;
  runs_given: number;
  wickets: number;
  dots: number;
  fours: number;
  sixes: number;
  economy: number;
}

export interface VsBattingHand {
  right_handed: HandSplit;
  left_handed: HandSplit;
  unknown?: HandSplit;
}

export interface BattingRecentPerformance {
  match_id: string;
  match_name: string;
  match_date: string;
  innings: number;
  runs: number;
  balls: number;
  "4s": number;
  "6s": number;
  SR: number;
}

export interface BowlingRecentPerformance {
  match_id: string;
  match_name: string;
  match_date: string;
  innings: number;
  overs: string;
  maiden: number;
  runs_given: number;
  wickets_taken: number;
  economy: number;
}

export interface Batsman {
  id?: string;
  name: string;
  runs: number;
  balls: number;
  "4s": number;
  "6s": number;
  SR: number;
  outdetails: OutDetails | null;
  pace_vs_spin?: PaceVsSpin;
  recent_performances?: BattingRecentPerformance[];
  role?: string;
  jersey_number?: number | null;
  batting_hand?: string;
  bowling_type?: string;
  is_captain?: boolean;
  is_vice_captain?: boolean;
  is_wicket_keeper?: boolean;
  is_secondary_wicket_keeper?: boolean;
  status?: string;
  is_substituted?: boolean;
}

export interface Bowler {
  id?: string;
  name: string;
  overs: string;
  maiden: number;
  runs_given: number;
  wickets_taken: number;
  economy: number;
  vs_batting_hand?: VsBattingHand;
  recent_performances?: BowlingRecentPerformance[];
  role?: string;
  jersey_number?: number | null;
  batting_hand?: string;
  bowling_type?: string;
  is_captain?: boolean;
  is_vice_captain?: boolean;
  is_wicket_keeper?: boolean;
  is_secondary_wicket_keeper?: boolean;
  status?: string;
  is_substituted?: boolean;
}

export interface FowRecord {
  batsman: string;
  wicket: number;
  score: number;
  over: number;
}

export interface PartnershipPlayer {
  name: string;
  runs: number;
  balls: number;
}

export interface PartnershipData {
  players: PartnershipPlayer[];
  total_runs: number;
  total_balls: number;
  extras: number;
  overs: string;
  // Real field, confirmed from a live payload — the partnership's combined
  // strike rate (runs per 100 balls), not runs-per-over.
  strike_rate?: number;
}

export interface Extras {
  total: number;
  byes: number;
  leg_byes: number;
  wides: number;
  no_balls: number;
  penalty_runs: number;
}

export interface Innings {
  team_name?: string;
  batsmen?: Batsman[];
  bowlers?: Bowler[];
  fow?: FowRecord[];
  partnerships?: PartnershipData[];
  runs?: number;
  wickets?: number;
  overs?: number;
  run_rate?: string;
  extras?: Extras;
}

export interface MatchLikeScorecard {
  homeTeam?: string;
  awayTeam?: string;
  innings_1?: Innings;
  innings_2?: Innings;
  // Test matches: the second innings of each side (either key spelling).
  innings_3?: Innings;
  innings_4?: Innings;
  third_inning?: Innings;
  fourth_inning?: Innings;
  result?: string;
}

interface ScorecardViewProps {
  scorecard: MatchLikeScorecard | null;
  // Sequential super-over payloads, same shape as `scorecard` — element 0 of
  // the raw API array is the main match, everything after it is a super over.
  superOvers?: MatchLikeScorecard[];
  // Needed to link player names to their per-match stats page.
  matchId: string;
  // Test match: four innings tabs instead of the two team tabs.
  isTest?: boolean;
  // Innings being played (from the match record) — a later innings with no data yet stays hidden.
  currentInning?: number;
  // Match finished — shows the green "Completed" badge on the innings card.
  completed?: boolean;
  // Core match record (toss, result, team names) for the progress timeline.
  match?: any;
}

const ORDINALS = ["1ST", "2ND", "3RD", "4TH", "5TH", "6TH", "7TH", "8TH", "9TH", "10TH"];

export const getOutDetailsString = (outdetails: OutDetails | null | undefined): string => {
  if (!outdetails) return "not out";
  const { wickettype: type, bowler, fielder } = outdetails;
  switch (type) {
    case "Bowled": return `b ${bowler}`;
    case "Caught": return fielder ? `c ${fielder} b ${bowler}` : `c & b ${bowler}`;
    case "LBW": return `lbw b ${bowler}`;
    case "Run Out": return fielder ? `run out (${fielder})` : "run out";
    case "Stumped": return fielder ? `st ${fielder} b ${bowler}` : `st b ${bowler}`;
    default: return bowler ? `${type} b ${bowler}` : type;
  }
};

const formatExtras = (extras?: Extras) => {
  const e = extras || { total: 0, byes: 0, leg_byes: 0, wides: 0, no_balls: 0, penalty_runs: 0 };
  return `${e.total ?? 0} (b ${e.byes ?? 0}, lb ${e.leg_byes ?? 0}, w ${e.wides ?? 0}, nb ${e.no_balls ?? 0}, p ${e.penalty_runs ?? 0})`;
};

// (runs / balls) * 100 — the standard strike-rate formula, used both for a
// whole partnership and for each individual player within it.
const calcStrikeRate = (runs: number, balls: number) => (balls > 0 ? ((runs / balls) * 100).toFixed(2) : "0.00");

const buildPartnershipRows = (innings?: Innings) => (innings?.partnerships || []).map((p, idx) => {
  const player1 = p.players?.[0] || { name: "—", runs: 0, balls: 0 };
  const player2 = p.players?.[1] || { name: "—", runs: 0, balls: 0 };
  // Share of the partnership total; extras take the remainder so the three
  // segments always add up to 100%.
  const total = p.total_runs > 0 ? p.total_runs : player1.runs + player2.runs + (p.extras || 0);
  const player1Pct = total > 0 ? Math.round((player1.runs / total) * 100) : 0;
  const player2Pct = total > 0 ? Math.round((player2.runs / total) * 100) : 0;
  const extrasPct = total > 0 ? Math.max(0, 100 - player1Pct - player2Pct) : 0;
  // Prefer the API's own strike_rate; fall back to computing it if absent.
  const strikeRate = p.strike_rate != null ? p.strike_rate.toFixed(2) : calcStrikeRate(p.total_runs, p.total_balls);
  return {
    key: idx,
    label: `${ORDINALS[idx] || `${idx + 1}TH`} WICKET`,
    overs: p.overs,
    player1,
    player2,
    player1SR: calcStrikeRate(player1.runs, player1.balls),
    player2SR: calcStrikeRate(player2.runs, player2.balls),
    player1Pct,
    player2Pct,
    extrasPct,
    totalRuns: p.total_runs,
    totalBalls: p.total_balls,
    extras: p.extras,
    strikeRate,
  };
});

// Matches a super-over's innings to a side (home/away) by team_name first
// (mirrors scoring-frontend's own matching logic), falling back to
// positional innings_1/innings_2 if team_name isn't present on either side.
const getSoInnings = (main: MatchLikeScorecard | null, so: MatchLikeScorecard, side: '1st' | '2nd'): Innings | undefined => {
  const targetName = side === '1st'
    ? (main?.innings_1?.team_name || main?.homeTeam)
    : (main?.innings_2?.team_name || main?.awayTeam);
  if (targetName && so.innings_1?.team_name === targetName) return so.innings_1;
  if (targetName && so.innings_2?.team_name === targetName) return so.innings_2;
  return side === '1st' ? so.innings_1 : so.innings_2;
};

type PlayerFlags = Pick<Batsman, 'status' | 'is_substituted' | 'is_captain' | 'is_wicket_keeper' | 'is_secondary_wicket_keeper'>;

// Badges: C for captain, WK for wicket-keeper (from `is_wicket_keeper`, not
// the `role` string), IP for impact player, SUB for substitutes. VC removed.
const getPlayerBadges = (p: PlayerFlags): string[] => {
  const status = (p.status || '').toLowerCase();
  const badges: string[] = [];
  if (p.is_captain) badges.push('C');
  // The secondary wicket-keeper shows the same plain WK badge
  if (p.is_wicket_keeper || p.is_secondary_wicket_keeper) badges.push('WK');
  if (status === 'impact_player') badges.push('IP');
  if (status === 'substitute') badges.push('SUB');
  return badges;
};

const PlayerLink: React.FC<{ matchId: string; name: string; player?: PlayerFlags }> = ({ matchId, name, player }) => (
  <span className="inline-flex items-center gap-1.5 flex-wrap">
    <Link
      href={`/admin/ground/matchdetail/${matchId}/player?name=${encodeURIComponent(name)}`}
      className="font-semibold text-blue-600 hover:underline"
    >
      {name}
    </Link>
    {player && getPlayerBadges(player).map((b) => (
      <span key={b} className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-bold text-slate-700">{b}</span>
    ))}
  </span>
);

const BattingTable: React.FC<{ batsmen: Batsman[]; matchId: string }> = ({ batsmen, matchId }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-100">
          <th className="py-2 pr-4 font-bold">Batter</th>
          <th className="py-2 px-4 font-bold">Dismissal</th>
          <th className="py-2 px-4 font-bold text-right">R</th>
          <th className="py-2 px-4 font-bold text-right">B</th>
          <th className="py-2 px-4 font-bold text-right">4s</th>
          <th className="py-2 px-4 font-bold text-right">6s</th>
          <th className="py-2 pl-4 font-bold text-right">SR</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50 text-sm">
        {batsmen.length === 0 ? (
          <tr>
            <td colSpan={7} className="py-8 text-center text-slate-600 italic font-medium">No batting data available.</td>
          </tr>
        ) : batsmen.map((b, i) => (
          <tr key={i}>
            <td className="py-3 pr-4"><PlayerLink matchId={matchId} name={b.name} player={b} /></td>
            <td className="py-3 px-4 text-slate-700">{getOutDetailsString(b.outdetails)}</td>
            <td className="py-3 px-4 text-right font-bold text-slate-900">{b.runs}</td>
            <td className="py-3 px-4 text-right text-slate-800">{b.balls}</td>
            <td className="py-3 px-4 text-right text-slate-800">{b["4s"]}</td>
            <td className="py-3 px-4 text-right text-slate-800">{b["6s"]}</td>
            <td className="py-3 pl-4 text-right text-slate-800">{b.SR}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const BowlingTable: React.FC<{ bowlers: Bowler[]; matchId: string }> = ({ bowlers, matchId }) => (
  <div className="overflow-x-auto mt-8">
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-100">
          <th className="py-2 pr-4 font-bold">Bowler</th>
          <th className="py-2 px-4 font-bold text-right">O</th>
          <th className="py-2 px-4 font-bold text-right">M</th>
          <th className="py-2 px-4 font-bold text-right">R</th>
          <th className="py-2 px-4 font-bold text-right">W</th>
          <th className="py-2 pl-4 font-bold text-right">Econ</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50 text-sm">
        {bowlers.length === 0 ? (
          <tr>
            <td colSpan={6} className="py-8 text-center text-slate-600 italic font-medium">No bowling data available.</td>
          </tr>
        ) : bowlers.map((bw, i) => (
          <tr key={i}>
            <td className="py-3 pr-4"><PlayerLink matchId={matchId} name={bw.name} player={bw} /></td>
            <td className="py-3 px-4 text-right text-slate-800">{bw.overs}</td>
            <td className="py-3 px-4 text-right text-slate-800">{bw.maiden}</td>
            <td className="py-3 px-4 text-right text-slate-800">{bw.runs_given}</td>
            <td className="py-3 px-4 text-right font-bold text-slate-900">{bw.wickets_taken}</td>
            <td className="py-3 pl-4 text-right text-slate-800">{bw.economy}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const ExtrasAndTotal: React.FC<{ innings?: Innings; resultSuffix?: string }> = ({ innings, resultSuffix }) => (
  <div className="flex flex-col text-sm mt-3 border-t border-slate-100 pt-3">
    <div className="flex justify-between py-2">
      <span className="font-bold text-slate-900">Extras</span>
      <span className="text-slate-700">{formatExtras(innings?.extras)}</span>
    </div>
    <div className="border-t border-slate-100" />
    <div className="flex justify-between py-2">
      <span className="font-bold text-slate-900">TOTAL</span>
      <span className="font-semibold text-slate-900">
        {innings?.runs ?? 0}/{innings?.wickets ?? 0} ({innings?.overs ?? 0} Overs{resultSuffix ?? ''})
      </span>
    </div>
  </div>
);

const FallOfWicketsCard: React.FC<{ fow: FowRecord[]; heading: string }> = ({ fow, heading }) => (
  <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6 shadow-xs">
    <h3 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-4">{heading}</h3>
    {fow.length === 0 ? (
      <p className="text-slate-600 italic text-sm font-medium">No wickets have fallen yet.</p>
    ) : (
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3">
        {fow.map((f, i) => (
          <div key={i} className="min-w-0 sm:min-w-[100px] px-3 sm:px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
            <p className="font-bold text-slate-900">{f.score}/{f.wicket}</p>
            <p className="text-xs text-slate-700 mt-0.5 break-words">{f.batsman}, {f.over}</p>
          </div>
        ))}
      </div>
    )}
  </div>
);

const PartnershipsCard: React.FC<{ innings?: Innings; heading: string }> = ({ innings, heading }) => {
  const partnershipRows = buildPartnershipRows(innings);
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6 shadow-xs">
      <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-4 sm:mb-6">{heading}</h3>
      {partnershipRows.length === 0 ? (
        <p className="text-slate-600 italic text-sm font-medium">No partnership data available.</p>
      ) : (
        <div className="flex flex-col gap-4 sm:gap-6">
          {partnershipRows.map((p) => (
            <div key={p.key} className="pb-4 sm:pb-6 border-b border-slate-50 last:border-b-0 last:pb-0">
              <div className="grid grid-cols-2 md:grid-cols-[1fr_1.5fr_1fr_1.5fr_auto] items-center gap-x-3 gap-y-2 md:gap-3 mb-3">
                <div className="order-1 md:order-none">
                  <span className="text-xs font-bold text-indigo-600 uppercase">{p.label}</span>
                  <p className="text-[11px] text-slate-700 font-semibold">Over {p.overs}</p>
                </div>
                <p className="order-4 md:order-none text-sm font-bold text-blue-600 md:text-right break-words">
                  {p.player1.name} {p.player1.runs}({p.player1.balls}) <span className="text-[11px] font-semibold text-blue-400">SR {p.player1SR}</span>
                </p>
                <div className="order-3 md:order-none col-span-2 md:col-span-1 text-center py-1 md:py-0">
                  <p className="font-bold text-slate-900 text-lg leading-tight">{p.totalRuns} runs</p>
                  <p className="text-[11px] text-slate-600 font-medium">{p.totalBalls} BALLS &middot; {p.strikeRate} SR</p>
                </div>
                <p className="order-5 md:order-none text-sm font-bold text-amber-500 text-right md:text-left break-words">
                  <span className="text-[11px] font-semibold text-amber-400">SR {p.player2SR}</span> {p.player2.runs}({p.player2.balls}) {p.player2.name}
                </p>
                <span className="order-2 md:order-none text-[11px] font-bold text-slate-600 uppercase text-right whitespace-nowrap">
                  Extras <span className="ml-2 text-slate-700 text-sm">{p.extras}</span>
                </span>
              </div>

              <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
                <div className="bg-blue-500" style={{ width: `${p.player1Pct}%` }} />
                <div className="bg-amber-400" style={{ width: `${p.player2Pct}%` }} />
                <div className="bg-pink-400" style={{ width: `${p.extrasPct}%` }} />
              </div>
              <div className="flex mt-1">
                <span className="text-[11px] font-bold text-blue-500" style={{ width: `${p.player1Pct}%` }}>{p.player1Pct}%</span>
                <span className="text-[11px] font-bold text-amber-500 text-center" style={{ width: `${p.player2Pct}%` }}>{p.player2Pct}%</span>
                <span className="text-[11px] font-bold text-pink-500 text-right" style={{ width: `${p.extrasPct}%` }}>{p.extrasPct}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

type TestTab = 'innings1' | 'innings2' | 'innings3' | 'innings4';

// Same short-name rule as scoring-frontend's Test scoreboard: 1 word -> first 3 letters, 2+ words -> initials.
const shortName = (name?: string): string => {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((w) => w[0].toUpperCase()).join('');
};

// Test-match scorecard — laid out like scoring-frontend's Test scoreboard (innings tab track, one main card with
// batting / fall of wickets / bowling, then partnership analysis), without its dark match header.
const TestBadges: React.FC<{ p: any }> = ({ p }) => (
  <>
    {(p.isCaptain ?? p.is_captain) && (
      <span className="text-[9px] px-1.5 py-0.5 font-bold tracking-wider text-blue-700 bg-blue-100 rounded uppercase ml-2 shrink-0">C</span>
    )}
    {!!((p.is_wicket_keeper ?? p.isWicketKeeper) || (p.is_secondary_wicket_keeper ?? p.isSecondaryWicketKeeper)) && (
      <span className="text-[9px] px-1.5 py-0.5 font-bold tracking-wider text-emerald-700 bg-emerald-100 rounded uppercase ml-2 shrink-0">WK</span>
    )}
    {p.status === 'impact_player' && (
      <span className="text-[9px] px-1.5 py-0.5 font-bold tracking-wider text-amber-700 bg-amber-100 rounded uppercase ml-2 shrink-0">IP</span>
    )}
    {p.status === 'substitute' && (
      <span className="text-[9px] px-1.5 py-0.5 font-bold tracking-wider text-amber-700 bg-amber-100 rounded uppercase ml-2 shrink-0">Sub</span>
    )}
  </>
);

const TestPlayerName: React.FC<{ matchId: string; p: any }> = ({ matchId, p }) => (
  <>
    <Link
      href={`/admin/ground/matchdetail/${matchId}/player?name=${encodeURIComponent(p.name)}`}
      className="text-blue-600 hover:underline"
    >
      {p.name}
    </Link>
    <TestBadges p={p} />
  </>
);

// Match progression timeline: Toss -> 1st..4th innings -> Match Ended (same steps as scoring-frontend's Test scoreboard).
const TestTimeline: React.FC<{ scorecard: MatchLikeScorecard; match?: any; currentInning: number; completed: boolean }> = ({ scorecard, match, currentInning, completed }) => {
  const inn1 = scorecard.innings_1;
  const inn2 = scorecard.innings_2;
  const inn3 = scorecard.innings_3 || scorecard.third_inning;
  const inn4 = scorecard.innings_4 || scorecard.fourth_inning;
  const team1 = inn1?.team_name || match?.home_team || 'Team 1';
  const team2 = inn2?.team_name || match?.away_team || 'Team 2';

  const tossRaw = String(match?.toss_winner || match?.toss_winner_team || '');
  let tossTeam = tossRaw;
  if (tossRaw.toLowerCase().includes('away')) tossTeam = match?.away_team || team2;
  else if (tossRaw.toLowerCase().includes('home')) tossTeam = match?.home_team || team1;
  const decision = String(match?.toss_decision || 'bat').toLowerCase();
  const tossText = tossRaw ? `${shortName(tossTeam || team1)} chose to ${decision === 'field' || decision === 'bowl' ? 'bowl' : 'bat'}` : '—';

  const score = (inn?: Innings) => {
    if (!inn) return null;
    const runs = inn.runs ?? 0, wkts = inn.wickets ?? 0, overs = Number(inn.overs ?? 0);
    if (runs === 0 && wkts === 0 && overs === 0) return null;
    const anyInn = inn as any;
    const declared = Boolean(anyInn.is_declared || anyInn.declared || anyInn.status === 'declared');
    return `${runs}/${wkts}${declared ? ' d' : ''}`;
  };
  const s1 = score(inn1) || 'In Progress', s2 = score(inn2), s3 = score(inn3), s4 = score(inn4);
  const cur = match?.current_inning || currentInning || (inn4 ? 4 : inn3 ? 3 : inn2 ? 2 : 1);
  const result = match?.result
    ? String(match.result).replace(match?.home_team || '', shortName(match?.home_team)).replace(match?.away_team || '', shortName(match?.away_team))
    : 'Completed';

  const steps = [
    { id: 'toss', title: 'Toss', subtitle: tossText, status: 'completed' },
    { id: 'inn1', title: '1st Innings', subtitle: s1, status: s2 || cur > 1 || completed ? 'completed' : 'active' },
    { id: 'inn2', title: '2nd Innings', subtitle: s2 || (cur === 2 ? 'In Progress' : 'Pending'), status: s3 || cur > 2 || completed ? 'completed' : cur === 2 ? 'active' : 'upcoming' },
    { id: 'inn3', title: '3rd Innings', subtitle: s3 || (cur === 3 ? 'In Progress' : 'Pending'), status: s4 || cur > 3 || completed ? 'completed' : cur === 3 ? 'active' : 'upcoming' },
    { id: 'inn4', title: '4th Innings', subtitle: s4 || (cur === 4 ? 'In Progress' : 'Pending'), status: completed ? 'completed' : cur === 4 ? 'active' : 'upcoming' },
    { id: 'ended', title: 'Match Ended', subtitle: completed ? result : 'Pending', status: completed ? 'completed' : 'upcoming' },
  ];

  return (
    <div className="w-full min-h-[159px] bg-white rounded-[16px] border border-[#E5E7EB] p-3 sm:p-5 shadow-2xs flex flex-col justify-between overflow-x-auto">
      <h3 className="text-sm sm:text-[15px] font-bold text-[#6B7280] uppercase tracking-wider leading-none mb-4">MATCH PROGRESSION TIMELINE</h3>
      <div className="relative flex items-start justify-between w-full min-w-[560px] px-2 sm:px-6 my-auto">
        <div className="absolute top-[10px] left-[50px] right-[50px] flex items-center justify-between z-0 pointer-events-none">
          {steps.slice(0, -1).map((st, i) => {
            const next = steps[i + 1];
            const done = st.status === 'completed' && (next.status === 'completed' || next.status === 'active');
            return <div key={st.id} className={`h-[2px] flex-1 transition-colors duration-300 ${done ? 'bg-[#0F1117]' : 'bg-gray-200'}`} />;
          })}
        </div>
        {steps.map((st) => (
          <div key={st.id} className="relative z-10 flex flex-col items-center text-center flex-1 px-1">
            {st.status === 'completed' ? (
              <div className="w-[20px] h-[20px] rounded-full bg-[#0F1117] flex items-center justify-center text-white shadow-xs shrink-0">
                <Check size={12} strokeWidth={3} />
              </div>
            ) : st.status === 'active' ? (
              <div className="w-[20px] h-[20px] rounded-full bg-[#0F1117] ring-4 ring-slate-200 flex items-center justify-center text-white shrink-0">
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              </div>
            ) : (
              <div className="w-[20px] h-[20px] rounded-full bg-gray-200 border-2 border-gray-300 shrink-0" />
            )}
            <span className="text-[15px] font-semibold text-[#1A1D2B] mt-2 leading-tight block whitespace-nowrap">{st.title}</span>
            <span className="text-[12px] font-medium text-[#6B7280] mt-0.5 block truncate max-w-[130px]" title={st.subtitle}>{st.subtitle}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const TestScorecard: React.FC<{ scorecard: MatchLikeScorecard; matchId: string; currentInning: number; completed: boolean; match?: any }> = ({ scorecard, matchId, currentInning, completed, match }) => {
  const [activeTab, setActiveTab] = useState<TestTab>('innings1');

  const inn1 = scorecard.innings_1;
  const inn2 = scorecard.innings_2;
  const inn3 = scorecard.innings_3 || scorecard.third_inning;
  const inn4 = scorecard.innings_4 || scorecard.fourth_inning;

  // An innings tab shows once it has started (match record says so, or it already has data).
  const hasStarted = (inn: Innings | undefined, n: number) => {
    if (!inn) return false;
    if (currentInning >= n) return true;
    return (inn.runs ?? 0) > 0 || Number(inn.overs ?? 0) > 0 || (inn.wickets ?? 0) > 0 || (inn.batsmen?.length ?? 0) > 0;
  };

  const tabs: { id: TestTab; label: string; innings?: Innings; ordinal: string }[] = [
    { id: 'innings1', label: `${shortName(inn1?.team_name) || 'Team 1'} 1st Innings`, innings: inn1, ordinal: '1st' },
    ...(hasStarted(inn2, 2) ? [{ id: 'innings2' as TestTab, label: `${shortName(inn2?.team_name) || 'Team 2'} 1st Innings`, innings: inn2, ordinal: '1st' }] : []),
    ...(hasStarted(inn3, 3) ? [{ id: 'innings3' as TestTab, label: `${shortName(inn3?.team_name) || shortName(inn1?.team_name) || 'Team 1'} 2nd Innings`, innings: inn3, ordinal: '2nd' }] : []),
    ...(hasStarted(inn4, 4) ? [{ id: 'innings4' as TestTab, label: `${shortName(inn4?.team_name) || shortName(inn2?.team_name) || 'Team 2'} 2nd Innings`, innings: inn4, ordinal: '2nd' }] : []),
  ];
  const current = tabs.find((t) => t.id === activeTab) || tabs[0];
  const innings = current.innings;
  // Innings 1 & 3 are bowled to by the side that bats in 2 & 4, and vice versa.
  const bowlingTeam = (current.id === 'innings1' || current.id === 'innings3' ? inn2?.team_name : inn1?.team_name) || 'Bowling';
  const batsmen = innings?.batsmen || [];
  const bowlers = (innings?.bowlers || []) as any[];
  const fow = (innings?.fow || []) as any[];
  const partnerships = (innings?.partnerships || []) as any[];
  const ex: any = innings?.extras || {};
  const sectionTitle = "text-[13px] font-bold text-[#2D3142] uppercase tracking-[0.05em] leading-none";

  const tabBtn = (active: boolean) =>
    `h-[44px] rounded-[8px] px-4 py-3 text-[15px] transition-all whitespace-nowrap flex items-center justify-center shrink-0 cursor-pointer ${
      active ? 'bg-[#0F1117] text-white font-bold shadow-xs' : 'text-[#6B7280] font-semibold hover:text-gray-900 hover:bg-gray-50'
    }`;

  return (
    <div className="flex flex-col gap-2">
      <TestTimeline scorecard={scorecard} match={match} currentInning={currentInning} completed={completed} />

      {/* INNINGS TABS */}
      <div className="flex items-center w-fit max-w-full h-[52px] bg-white border border-[#E5E7EB] rounded-[12px] p-1 gap-1 my-2 overflow-x-auto shadow-2xs">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={tabBtn(current.id === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* MAIN SCORECARD CARD */}
      <div className="w-full bg-white rounded-[18px] border border-[#E5E7EB] p-3 sm:p-6 shadow-2xs flex flex-col gap-6 my-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-[#E5E7EB] w-full">
          <div className="flex items-baseline flex-wrap gap-2">
            <h2 className="text-base sm:text-[20px] font-bold text-[#1A1D2B] tracking-tight">
              {innings?.team_name || 'Team'} — {current.ordinal} Innings
            </h2>
            <span className="text-[15px] font-medium text-[#6B7280]">
              {innings?.runs ?? 0}/{innings?.wickets ?? 0} {(innings?.wickets ?? 0) >= 10 ? 'All Out' : ''} ({innings?.overs ?? 0} Overs) • RR {innings?.run_rate || '0.00'}
            </span>
          </div>
          {completed && (
            <div className="bg-[#ECFDF5] text-[#10B981] rounded-[6px] px-[10px] py-[4px] text-[12px] font-semibold w-fit">Completed</div>
          )}
        </div>

        {/* BATTING */}
        <div className="w-full rounded-[8px] border border-[#E5E7EB] overflow-x-auto [&>*]:min-w-[640px]">
          <div className="bg-[#F1F3F5] text-[15px] font-semibold text-[#2D3142] py-[12px] px-[16px] flex items-center w-full border-b border-[#E5E7EB]">
            <div className="w-[25%] text-left">Batter</div>
            <div className="w-[45%] text-left">Dismissal</div>
            <div className="w-[6%] text-center font-bold text-[#1A1D2B]">R</div>
            <div className="w-[6%] text-center">B</div>
            <div className="w-[6%] text-center">4s</div>
            <div className="w-[6%] text-center">6s</div>
            <div className="w-[6%] text-right">SR</div>
          </div>
          <div className="divide-y divide-gray-100">
            {batsmen.length > 0 ? (
              batsmen.map((b, i) => (
                <div key={i} className="py-[10px] px-[16px] flex items-center w-full hover:bg-gray-50/60 transition-colors relative">
                  {!b.outdetails && <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-[#0F1117] rounded-r" />}
                  <div className="w-[25%] text-left text-[13px] font-bold text-[#1A1D2B] pr-2 flex items-center flex-wrap">
                    <TestPlayerName matchId={matchId} p={b} />
                  </div>
                  <div className="w-[45%] text-left text-[13px] font-normal text-[#6B7280] pr-2">{getOutDetailsString(b.outdetails)}</div>
                  <div className="w-[6%] text-center text-[13px] font-bold text-[#1A1D2B]">{b.runs}</div>
                  <div className="w-[6%] text-center text-[13px] font-medium text-[#6B7280]">{b.balls}</div>
                  <div className="w-[6%] text-center text-[13px] font-medium text-[#6B7280]">{b["4s"]}</div>
                  <div className="w-[6%] text-center text-[13px] font-medium text-[#6B7280]">{b["6s"]}</div>
                  <div className="w-[6%] text-right text-[13px] font-semibold text-[#2D3142]">{b.SR}</div>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-gray-400 text-sm font-medium">No batting data available for this innings.</div>
            )}
          </div>
          <div className="bg-[#F1F3F5] border-t border-[#E5E7EB] py-[12px] px-[16px] flex items-center justify-between text-[13px]">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#1A1D2B]">Extras</span>
              <span className="font-normal text-[#6B7280]">
                {ex.total ?? 0} (b {ex.byes ?? 0}, lb {ex.leg_byes ?? 0}, wd {ex.wides ?? 0}, nb {ex.no_balls ?? 0}{ex.penalty_runs ? `, p ${ex.penalty_runs}` : ''})
              </span>
            </div>
            <span className="font-bold text-[#1A1D2B]">{ex.total ?? 0}</span>
          </div>
          <div className="bg-[#F1F3F5] border-t-[2px] border-[#0F1117] py-[12px] px-[16px] flex items-center justify-between text-[14px]">
            <span className="font-bold text-[#0F1117] tracking-wide">TOTAL</span>
            <span className="font-semibold text-[#1A1D2B]">
              {innings?.runs ?? 0}/{innings?.wickets ?? 0} ({innings?.overs ?? 0} Overs • RR {innings?.run_rate || '0.00'})
            </span>
          </div>
        </div>

        {/* FALL OF WICKETS */}
        <div className="w-full flex flex-col gap-[12px] mt-2">
          <h3 className={sectionTitle}>FALL OF WICKETS</h3>
          <div className="w-full py-1 flex items-center gap-[16px] overflow-x-auto">
            {fow.length > 0 ? (
              fow.map((f, index) => {
                const rawOver = parseFloat(f.over);
                let displayOver = f.over;
                if (!isNaN(rawOver)) {
                  const completedOvers = Math.floor(rawOver);
                  const balls = Math.round((rawOver - completedOvers) * 10);
                  if (balls === 0 && completedOvers > 0) displayOver = `${completedOvers - 1}.6`;
                }
                return (
                  <div key={index} className="min-w-[105px] h-[60px] bg-[#FAFBFB] border border-[#E5E7EB] rounded-[8px] px-3 py-2 flex flex-col justify-center items-center text-center shadow-2xs hover:border-[#0F1117] transition-colors shrink-0">
                    <span className="text-[17px] font-semibold text-[#0F1117] leading-none block whitespace-nowrap">{f.score}/{f.wicket}</span>
                    <span className="text-[15px] font-medium text-[#6B7280] leading-none mt-1 block whitespace-nowrap">{f.batsman || `Wkt ${index + 1}`}, {displayOver}</span>
                  </div>
                );
              })
            ) : (
              <div className="text-[13px] text-[#6B7280] font-medium py-2">No wickets have fallen in this innings yet.</div>
            )}
          </div>
        </div>

        {/* BOWLING */}
        <div className="w-full flex flex-col gap-[12px] mt-2">
          <h3 className={sectionTitle}>{bowlingTeam.toUpperCase()} BOWLING</h3>
          <div className="w-full rounded-[8px] border border-[#E5E7EB] overflow-x-auto [&>*]:min-w-[560px]">
            <div className="bg-[#F1F3F5] h-[33px] text-[11px] font-bold text-[#2D3142] px-[16px] py-[10px] flex items-center w-full border-b border-[#E5E7EB]">
              <div className="w-[30%] text-left">Bowler</div>
              <div className="w-[10%] text-center">O</div>
              <div className="w-[10%] text-center">M</div>
              <div className="w-[10%] text-center">R</div>
              <div className="w-[10%] text-center font-bold text-[#2D3142]">W</div>
              <div className="w-[10%] text-center">NB</div>
              <div className="w-[10%] text-center">WD</div>
              <div className="w-[10%] text-right">ECO</div>
            </div>
            <div>
              {bowlers.length > 0 ? (
                bowlers.map((bw, idx) => (
                  <div
                    key={idx}
                    className={`h-[36px] px-[16px] py-[10px] flex items-center w-full transition-colors relative ${
                      bw.is_current || idx === 0 ? 'border-l-[4px] border-l-[#0F1117] pl-[12px]' : ''
                    } ${idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFB]'}`}
                  >
                    <div className="w-[30%] text-left text-[13px] font-bold text-[#1A1D2B] pr-2 flex items-center">
                      <TestPlayerName matchId={matchId} p={bw} />
                    </div>
                    <div className="w-[10%] text-center text-[13px] font-normal text-[#1A1D2B]">{bw.overs}</div>
                    <div className="w-[10%] text-center text-[13px] font-normal text-[#6B7280]">{bw.maiden}</div>
                    <div className="w-[10%] text-center text-[13px] font-normal text-[#6B7280]">{bw.runs_given}</div>
                    <div className="w-[10%] text-center text-[13px] font-bold text-[#121212]">{bw.wickets_taken}</div>
                    <div className="w-[10%] text-center text-[13px] font-normal text-[#6B7280]">{bw.no_balls ?? 0}</div>
                    <div className="w-[10%] text-center text-[13px] font-normal text-[#6B7280]">{bw.wides ?? 0}</div>
                    <div className="w-[10%] text-right text-[13px] font-semibold text-[#2D3142]">{bw.economy}</div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-gray-400 text-sm font-medium">No bowling data available for this innings.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PARTNERSHIP ANALYSIS */}
      <div className="w-full flex flex-col gap-4 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-[16px] rounded-[2px] bg-[#0F1117]" />
          <h3 className="text-[16px] font-extrabold text-[#1A1A2E] tracking-[0.5px] uppercase leading-none">PARTNERSHIP ANALYSIS</h3>
        </div>
        <div className="flex flex-col gap-3">
          {partnerships.length > 0 ? (
            partnerships.map((pt, idx) => {
              const player1 = pt.players?.[0] || { name: '—', runs: 0, balls: 0 };
              const player2 = pt.players?.[1] || { name: '—', runs: 0, balls: 0 };
              const splitTotal = pt.total_runs > 0 ? pt.total_runs : player1.runs + player2.runs + (pt.extras || 0);
              const player1Pct = splitTotal > 0 ? Math.round((player1.runs / splitTotal) * 100) : 0;
              const player2Pct = splitTotal > 0 ? Math.round((player2.runs / splitTotal) * 100) : 0;
              const extrasPct = splitTotal > 0 ? Math.max(0, 100 - player1Pct - player2Pct) : 0;
              const sr = (runs: number, balls: number) => (balls > 0 ? ((runs / balls) * 100).toFixed(2) : '0.00');
              const player1SR = player1.strike_rate !== undefined ? Number(player1.strike_rate).toFixed(2) : sr(player1.runs, player1.balls);
              const player2SR = player2.strike_rate !== undefined ? Number(player2.strike_rate).toFixed(2) : sr(player2.runs, player2.balls);
              const combinedSR = pt.strike_rate !== undefined ? Number(pt.strike_rate).toFixed(2) : sr(pt.total_runs, pt.total_balls);
              const wicketLabel = `${ORDINALS[idx] || idx + 1} WICKET`;
              const overRange = pt.overs ? `Over ${pt.overs}` : `Over ${idx}.1 – ${idx + 1}.0`;
              return (
                <div key={idx} className="w-full min-h-[128px] bg-white border border-[#E5E5EA] rounded-[12px] p-4 sm:p-5 flex flex-col justify-between shadow-2xs hover:border-gray-300 transition-colors gap-3">
                  <div className="w-full grid grid-cols-2 gap-x-3 gap-y-4 md:flex md:flex-row md:items-center md:justify-between md:gap-4 md:min-h-[44px]">
                    <div className="order-1 md:order-1 md:w-[180px] md:shrink-0 flex flex-col justify-center gap-[2px] min-w-0">
                      <span className="text-sm sm:text-[15px] font-bold text-[#0F1117] tracking-[0.5px] uppercase leading-tight">{wicketLabel}</span>
                      <span className="text-xs sm:text-[13px] font-semibold text-[#4A4A5A] leading-tight">{overRange}</span>
                    </div>
                    <div className="order-2 md:order-5 md:w-[100px] md:shrink-0 flex flex-col items-end justify-center text-right gap-[2px]">
                      <span className="text-xs sm:text-[13px] font-semibold text-[#4A4A5A] leading-tight">Extras</span>
                      <span className="text-sm sm:text-[15px] font-bold text-[#1A1A2E] leading-tight">{pt.extras ?? 0}</span>
                    </div>
                    <div className="order-3 md:order-2 md:flex-1 flex flex-col items-start md:items-end min-w-0">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-end md:gap-1.5 items-start">
                        <span className="text-sm sm:text-[17px] font-medium text-[#4A4A5A] break-words">{player1.name}</span>
                        <span className="text-base sm:text-[17px] font-bold text-[#1A1A2E] shrink-0">{player1.runs}({player1.balls})</span>
                      </div>
                      <span className="text-[11px] sm:text-[12px] font-semibold text-[#7A7A8C] uppercase">SR {player1SR}</span>
                    </div>
                    <div className="order-4 md:order-4 md:flex-1 flex flex-col items-end md:items-start text-right md:text-left min-w-0">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-start md:gap-1.5 items-end">
                        <span className="text-sm sm:text-[17px] font-medium text-[#4A4A5A] break-words md:order-2">{player2.name}</span>
                        <span className="text-base sm:text-[17px] font-bold text-[#1A1A2E] shrink-0 md:order-1">{player2.runs}({player2.balls})</span>
                      </div>
                      <span className="text-[11px] sm:text-[12px] font-semibold text-[#7A7A8C] uppercase">SR {player2SR}</span>
                    </div>
                    <div className="order-5 md:order-3 col-span-2 md:col-span-1 flex flex-col items-center justify-center text-center md:px-4 md:shrink-0 rounded-lg bg-[#F1F3F5] md:bg-transparent py-2 md:py-0">
                      <span className="text-lg sm:text-[20px] font-bold text-[#1A1A2E] leading-none">{pt.total_runs} runs</span>
                      <span className="text-xs sm:text-[13px] font-medium text-[#4A4A5A] tracking-[0.5px] uppercase mt-1 leading-none">{pt.total_balls} BALLS · SR {combinedSR}</span>
                    </div>
                  </div>
                  <div className="w-full">
                    <div className="flex w-full h-[8px] rounded-[4px] bg-[#D6D9E3] overflow-hidden">
                      <div className="bg-blue-500 h-full" style={{ width: `${player1Pct}%` }} />
                      <div className="bg-amber-400 h-full" style={{ width: `${player2Pct}%` }} />
                      <div className="bg-pink-400 h-full" style={{ width: `${extrasPct}%` }} />
                    </div>
                    <div className="flex w-full mt-1 text-xs sm:text-[13px] font-bold">
                      <span className="text-blue-500" style={{ width: `${player1Pct}%` }}>{player1Pct}%</span>
                      <span className="text-amber-500 text-center" style={{ width: `${player2Pct}%` }}>{player2Pct}%</span>
                      <span className="text-pink-500 text-right" style={{ width: `${extrasPct}%` }}>{extrasPct}%</span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="w-full bg-white p-6 rounded-[12px] border border-[#E5E5EA] text-center text-[#6B7280] font-medium text-sm">
              No partnership analysis recorded for this innings yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ScorecardView: React.FC<ScorecardViewProps> = ({ scorecard, superOvers = [], matchId, isTest = false, currentInning = 1, completed = false, match }) => {
  const team1 = scorecard?.innings_1?.team_name || scorecard?.homeTeam || "Team 1";
  const team2 = scorecard?.innings_2?.team_name || scorecard?.awayTeam || "Team 2";

  const [activeInnings, setActiveInnings] = useState<'1st' | '2nd'>('1st');

  const innings = activeInnings === '1st' ? scorecard?.innings_1 : scorecard?.innings_2;
  const teamName = activeInnings === '1st' ? team1 : team2;

  const batsmen = innings?.batsmen || [];
  const bowlers = innings?.bowlers || [];
  const fow = innings?.fow || [];

  if (!scorecard) {
    return <div className="p-10 text-center text-slate-600 italic font-medium">No scorecard data available.</div>;
  }

  if (isTest) {
    return <TestScorecard scorecard={scorecard} matchId={matchId} currentInning={currentInning} completed={completed} match={match} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* --- TEAM TABS (also drive which side's innings is shown for every super over below) --- */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs">
        <div className="flex border-b border-slate-100">
          {(['1st', '2nd'] as const).map((inn) => {
            const label = inn === '1st' ? team1 : team2;
            return (
              <button
                key={inn}
                onClick={() => setActiveInnings(inn)}
                className={`flex-1 basis-1/2 px-8 py-4 text-sm font-bold text-center transition-colors border-b-2 -mb-px cursor-pointer
                  ${activeInnings === inn ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-600 hover:text-slate-800'}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
            <h3 className="font-bold text-slate-900">
              {teamName} &mdash; {activeInnings === '1st' ? '1st' : '2nd'} Innings
            </h3>
            <p className="text-sm text-slate-700 font-medium">
              {innings?.runs ?? 0}/{innings?.wickets ?? 0}, {innings?.overs ?? 0} Overs, Run Rate {innings?.run_rate ?? '0.0'}
            </p>
          </div>

          <BattingTable batsmen={batsmen} matchId={matchId} />

          {batsmen.length > 0 && (
            <ExtrasAndTotal innings={innings} resultSuffix={` · RR ${innings?.run_rate ?? '0.0'}`} />
          )}

          <BowlingTable bowlers={bowlers} matchId={matchId} />
        </div>
      </div>

      <FallOfWicketsCard fow={fow} heading="Fall of Wickets" />
      <PartnershipsCard innings={innings} heading="Partnerships Analysis" />

      {/* --- SUPER OVER RECORDS --- */}
      {superOvers.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-slate-900 -mb-2">Super Over Records</h2>
          {superOvers.map((so, idx) => {
            const soInnings = getSoInnings(scorecard, so, activeInnings);
            const soBatsmen = soInnings?.batsmen || [];
            const soBowlers = soInnings?.bowlers || [];
            const soFow = soInnings?.fow || [];
            const soLabel = `Super Over ${idx + 1}`;
            return (
              <div key={idx} className="flex flex-col gap-6">
                <div className="bg-white rounded-2xl border border-amber-100 shadow-xs">
                  <div className="p-6">
                    <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
                      <h3 className="font-bold text-slate-900">
                        {teamName} &mdash; {soLabel}
                      </h3>
                      <p className="text-sm text-slate-700 font-medium">
                        {soInnings?.runs ?? 0}/{soInnings?.wickets ?? 0}, {soInnings?.overs ?? 0} Overs
                        {so.result && <span className="ml-2 text-amber-600 font-semibold">&middot; {so.result}</span>}
                      </p>
                    </div>

                    <BattingTable batsmen={soBatsmen} matchId={matchId} />

                    {soBatsmen.length > 0 && (
                      <ExtrasAndTotal innings={soInnings} />
                    )}

                    <BowlingTable bowlers={soBowlers} matchId={matchId} />
                  </div>
                </div>

                <FallOfWicketsCard fow={soFow} heading={`Fall of Wickets (${soLabel})`} />
                <PartnershipsCard innings={soInnings} heading={`Partnerships (${soLabel})`} />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};

export default ScorecardView;
