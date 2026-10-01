"use client";

import React, { useState } from 'react';
import Link from 'next/link';

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
  result?: string;
}

interface ScorecardViewProps {
  scorecard: MatchLikeScorecard | null;
  // Sequential super-over payloads, same shape as `scorecard` — element 0 of
  // the raw API array is the main match, everything after it is a super over.
  superOvers?: MatchLikeScorecard[];
  // Needed to link player names to their per-match stats page.
  matchId: string;
}

const ORDINALS = ["1ST", "2ND", "3RD", "4TH", "5TH", "6TH", "7TH", "8TH", "9TH", "10TH"];

export const getOutDetailsString = (outdetails: OutDetails | null | undefined): string => {
  if (!outdetails) return "not out";
  const { wickettype: type, bowler, fielder } = outdetails;
  switch (type) {
    case "Bowled": return `b ${bowler}`;
    case "Caught": return `c ${fielder} b ${bowler}`;
    case "LBW": return `lbw b ${bowler}`;
    case "Run Out": return `run out (${fielder})`;
    case "Stumped": return `st ${fielder} b ${bowler}`;
    default: return bowler ? `${type} b ${bowler}` : type;
  }
};

const formatExtras = (extras?: Extras) => {
  const e = extras || { total: 0, byes: 0, leg_byes: 0, wides: 0, no_balls: 0, penalty_runs: 0 };
  return `${e.total ?? 0} (b ${e.byes ?? 0}, lb ${e.leg_byes ?? 0}, w ${e.wides ?? 0}, nb ${e.no_balls ?? 0}, p ${e.penalty_runs ?? 0})`;
};

const buildPartnershipRows = (innings?: Innings) => (innings?.partnerships || []).map((p, idx) => {
  const player1 = p.players?.[0] || { name: "—", runs: 0, balls: 0 };
  const player2 = p.players?.[1] || { name: "—", runs: 0, balls: 0 };
  // Share of the partnership total; extras take the remainder so the three
  // segments always add up to 100%.
  const total = p.total_runs > 0 ? p.total_runs : player1.runs + player2.runs + (p.extras || 0);
  const player1Pct = total > 0 ? Math.round((player1.runs / total) * 100) : 0;
  const player2Pct = total > 0 ? Math.round((player2.runs / total) * 100) : 0;
  const extrasPct = total > 0 ? Math.max(0, 100 - player1Pct - player2Pct) : 0;
  const rpo = p.total_balls > 0 ? ((p.total_runs / p.total_balls) * 6).toFixed(2) : "0.00";
  return {
    key: idx,
    label: `${ORDINALS[idx] || `${idx + 1}TH`} WICKET`,
    overs: p.overs,
    player1,
    player2,
    player1Pct,
    player2Pct,
    extrasPct,
    totalRuns: p.total_runs,
    totalBalls: p.total_balls,
    extras: p.extras,
    rpo,
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

type PlayerFlags = Pick<Batsman, 'status' | 'is_substituted' | 'is_captain' | 'is_vice_captain'>;

// Badges: C / VC for leadership, IP for impact player, SUB for substitutes.
const getPlayerBadges = (p: PlayerFlags): string[] => {
  const status = (p.status || '').toLowerCase();
  const badges: string[] = [];
  if (p.is_captain) badges.push('C');
  if (p.is_vice_captain) badges.push('VC');
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
  <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
    <h3 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-4">{heading}</h3>
    {fow.length === 0 ? (
      <p className="text-slate-600 italic text-sm font-medium">No wickets have fallen yet.</p>
    ) : (
      <div className="flex flex-wrap gap-3">
        {fow.map((f, i) => (
          <div key={i} className="min-w-[100px] px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
            <p className="font-bold text-slate-900">{f.score}/{f.wicket}</p>
            <p className="text-xs text-slate-700 mt-0.5">{f.batsman}, {f.over}</p>
          </div>
        ))}
      </div>
    )}
  </div>
);

const PartnershipsCard: React.FC<{ innings?: Innings; heading: string }> = ({ innings, heading }) => {
  const partnershipRows = buildPartnershipRows(innings);
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
      <h3 className="text-lg font-bold text-slate-900 mb-6">{heading}</h3>
      {partnershipRows.length === 0 ? (
        <p className="text-slate-600 italic text-sm font-medium">No partnership data available.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {partnershipRows.map((p) => (
            <div key={p.key} className="pb-6 border-b border-slate-50 last:border-b-0 last:pb-0">
              <div className="grid grid-cols-2 md:grid-cols-[1fr_1.5fr_1fr_1.5fr_auto] items-center gap-3 mb-3">
                <div>
                  <span className="text-xs font-bold text-indigo-600 uppercase">{p.label}</span>
                  <p className="text-[11px] text-slate-700 font-semibold">Over {p.overs}</p>
                </div>
                <p className="text-sm font-bold text-blue-600 md:text-right">
                  {p.player1.name} {p.player1.runs}({p.player1.balls})
                </p>
                <div className="text-center">
                  <p className="font-bold text-slate-900 text-lg leading-tight">{p.totalRuns} runs</p>
                  <p className="text-[11px] text-slate-600 font-medium">{p.totalBalls} BALLS &middot; {p.rpo} RPO</p>
                </div>
                <p className="text-sm font-bold text-amber-500">
                  {p.player2.runs}({p.player2.balls}) {p.player2.name}
                </p>
                <span className="text-[11px] font-bold text-slate-600 uppercase md:text-right">
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

export const ScorecardView: React.FC<ScorecardViewProps> = ({ scorecard, superOvers = [], matchId }) => {
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
