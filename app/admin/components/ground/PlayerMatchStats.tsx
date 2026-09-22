"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import {
  Batsman,
  Bowler,
  Innings,
  MatchLikeScorecard,
  getOutDetailsString,
} from './ScorecardView';

// Real per-ball fields, same shape already fetched/used in MatchDetails.tsx
// (`/api/v1/matches/:matchId/innings/:n/balls`). Everything computed on this
// page from `balls` (shot-type breakdown, vs-bowler/vs-batter tables, line &
// length distribution, key moments) is a real aggregation of these — nothing
// invented. Only the bio row, wagon-wheel chart, "Recent Performances" and
// bowling speed stats below are mock placeholders, since no player-profile
// or cross-match stats endpoint exists anywhere in this codebase or its
// reference backends (confirmed by investigation) — they're marked MOCK
// inline and should be replaced once such an API exists.
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
  matchId: string;
  playerName: string;
}

const SCORING_API_BASE = process.env.NEXT_PUBLIC_SCORING_API_URL || "http://localhost:5500/api/v1";

const namesMatch = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

const overNumericValue = (over: string) => parseFloat(over) || 0;

// The ball-by-ball `fielding_type` field only ever carries these 8 exact
// values (same vocabulary as the "Fielding Area" filter in MatchDetails.tsx)
// — mapped onto the 6 canonical wagon-wheel zones the design uses, with the
// two "straight" positions folded into their nearest off/leg-side neighbor.
const WAGON_ZONE_MAP: Record<string, string> = {
  'Deep Fine Leg': 'Fine Leg',
  'Deep Cover': 'Cover',
  'Long Off': 'Cover',
  'Deep Point': 'Point',
  'Third Man': 'Third Man',
  'Deep Mid Wicket': 'Mid Wicket',
  'Long On': 'Mid Wicket',
  'Deep Square Leg': 'Square Leg',
};
// Fixed hexagon layout (angle in degrees, 0°=right, clockwise) matching the
// design: Fine Leg upper-left, Cover upper-right, Point right, Third Man
// lower-right, Mid Wicket lower-left, Square Leg left.
const WAGON_ZONE_LAYOUT: { zone: string; angle: number }[] = [
  { zone: 'Fine Leg', angle: 240 },
  { zone: 'Cover', angle: 300 },
  { zone: 'Point', angle: 0 },
  { zone: 'Third Man', angle: 60 },
  { zone: 'Mid Wicket', angle: 120 },
  { zone: 'Square Leg', angle: 180 },
];

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

// MOCK — no player-profile API exists anywhere in this codebase or its
// reference backends (confirmed by investigation). Role is the one field
// here that's genuinely derived from real match data, not invented.
const MOCK_RECENT_PERFORMANCES = [
  { score: "76 (45)", competition: "T20 World Cup · Super 8", opponent: "vs Australia" },
  { score: "63 (44)", competition: "T20 World Cup · Super 8", opponent: "vs England" },
  { score: "92 (101)", competition: "T20 World Cup · League Stage", opponent: "vs South Africa" },
];

export const PlayerMatchStats: React.FC<PlayerMatchStatsProps> = ({ matchId, playerName }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [scorecard, setScorecard] = useState<MatchLikeScorecard | null>(null);
  const [superOvers, setSuperOvers] = useState<MatchLikeScorecard[]>([]);
  const [balls1, setBalls1] = useState<Ball[]>([]);
  const [balls2, setBalls2] = useState<Ball[]>([]);
  const [view, setView] = useState<'batting' | 'bowling'>('batting');
  const [statsTab, setStatsTab] = useState<'match' | 'tournament' | 'career'>('match');

  useEffect(() => {
    const fetchAll = async () => {
      if (!matchId) return;
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
  const bowlingInnings: Innings | undefined = bowlingMatch?.inningsNum === 1 ? scorecard?.innings_1 : bowlingMatch?.inningsNum === 2 ? scorecard?.innings_2 : undefined;

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

  useEffect(() => {
    if (!loading) {
      if (didBat) setView('batting');
      else if (didBowl) setView('bowling');
    }
  }, [loading, didBat, didBowl]);

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
      const zone = b.fielding_type && WAGON_ZONE_MAP[b.fielding_type];
      if (!zone) return;
      runsByZone[zone] = (runsByZone[zone] || 0) + (b.batsman_runs ?? b.total_runs);
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
    const map: Record<string, { balls: number; runs: number; dots: number; fours: number; sixes: number }> = {};
    bowlingBalls.forEach((b) => {
      const key = b.batsman_name || 'Unknown';
      if (!map[key]) map[key] = { balls: 0, runs: 0, dots: 0, fours: 0, sixes: 0 };
      if (!b.is_wide) map[key].balls += 1;
      map[key].runs += b.total_runs;
      if (b.total_runs === 0 && !b.is_wide && !b.is_no_ball) map[key].dots += 1;
      if (b.total_runs === 4) map[key].fours += 1;
      if (b.total_runs === 6) map[key].sixes += 1;
    });
    return Object.entries(map).map(([batter, v]) => ({
      batter,
      ...v,
      econ: v.balls > 0 ? Math.round((v.runs / v.balls) * 6 * 100) / 100 : 0,
    }));
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

  if (!didBat && !didBowl) {
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
                <p className="font-semibold text-slate-900">— yrs</p>
              </div>
              <div>
                <p className="text-slate-600 uppercase font-bold text-[10px]">Batting Style</p>
                <p className="font-semibold text-slate-900">—</p>
              </div>
              <div>
                <p className="text-slate-600 uppercase font-bold text-[10px]">Bowling Style</p>
                <p className="font-semibold text-slate-900">{didBowl ? '—' : 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-bold">{roleLabel}</span>
              <span className="text-[11px] text-slate-500 font-medium">{battingInnings?.team_name || bowlingInnings?.team_name || ''}</span>
            </div>
          </div>
        </div>

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
      </div>

      {/* --- TABS --- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-6 bg-white rounded-2xl border border-slate-100 shadow-xs px-5 py-4 w-full sm:w-auto">
          {(['match', 'tournament', 'career'] as const).map((t) => (
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
            disabled={!didBat}
            className={`px-6 py-2.5 text-xs font-bold rounded-xl transition-all ${view === 'batting' ? 'bg-[#0F1117] text-white shadow-md' : 'text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed'}`}
          >
            Batting
          </button>
          <button
            onClick={() => setView('bowling')}
            disabled={!didBowl}
            className={`px-6 py-2.5 text-xs font-bold rounded-xl transition-all ${view === 'bowling' ? 'bg-[#0F1117] text-white shadow-md' : 'text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed'}`}
          >
            Bowling
          </button>
        </div>
      </div>

      {statsTab !== 'match' ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center shadow-xs">
          <p className="text-slate-600 italic">{statsTab === 'tournament' ? 'Tournament' : 'Career'} stats aren&apos;t available yet.</p>
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

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                    <h3 className="text-sm font-bold text-slate-900 mb-4">Scoring Areas (Wagon Wheel)</h3>
                    <div className="relative w-full aspect-square max-w-[280px] mx-auto">
                      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
                        <circle cx="100" cy="100" r="95" className="fill-emerald-50 stroke-emerald-100" strokeWidth="2" />
                        <circle cx="100" cy="100" r="60" fill="none" className="stroke-emerald-300" strokeWidth="1" strokeDasharray="4 4" />
                        {WAGON_ZONE_LAYOUT.map(({ zone, angle }) => {
                          const rad = (angle * Math.PI) / 180;
                          const x = 100 + 92 * Math.cos(rad);
                          const y = 100 + 92 * Math.sin(rad);
                          return <line key={zone} x1="100" y1="100" x2={x} y2={y} className="stroke-emerald-200" strokeWidth="1.5" />;
                        })}
                        <rect x="97" y="90" width="6" height="20" rx="2" className="fill-amber-400" />
                      </svg>
                      {wagonWheelZones.map(({ zone, angle, runs }) => {
                        const rad = (angle * Math.PI) / 180;
                        const radius = 42;
                        const left = 50 + radius * Math.cos(rad);
                        const top = 50 + radius * Math.sin(rad);
                        return (
                          <div
                            key={zone}
                            className="absolute text-center -translate-x-1/2 -translate-y-1/2"
                            style={{ left: `${left}%`, top: `${top}%` }}
                          >
                            <p className="text-[9px] font-bold text-slate-700 uppercase leading-tight whitespace-nowrap">{zone}</p>
                            <p className="text-xs font-bold text-indigo-600 whitespace-nowrap">{runs} Runs</p>
                          </div>
                        );
                      })}
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
              </>
            )}

            {view === 'bowling' && activeBowler && (
              <>
                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                    {[
                      { label: 'Overs', value: activeBowler.overs },
                      { label: 'Wickets', value: activeBowler.wickets_taken },
                      { label: 'Runs', value: activeBowler.runs_given },
                      { label: 'Dots', value: bowlingExtra.dots },
                      { label: 'Eco', value: activeBowler.economy },
                      { label: 'Maidens', value: activeBowler.maiden },
                      { label: 'Wides', value: bowlingExtra.wides },
                      { label: 'No balls', value: bowlingExtra.noBalls },
                    ].map((s) => (
                      <div key={s.label} className="text-center">
                        <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">{s.label}</p>
                        <p className="text-xl font-bold text-slate-900">{s.value}</p>
                      </div>
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
                          <th className="py-2 pl-4 text-right">Eco</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-sm">
                        {vsBatterRows.map((r) => (
                          <tr key={r.batter}>
                            <td className="py-3 pr-4 font-semibold text-slate-900">{r.batter}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.balls}</td>
                            <td className="py-3 px-4 text-right font-bold text-slate-900">{r.runs}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.dots}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.fours}</td>
                            <td className="py-3 px-4 text-right text-slate-800">{r.sixes}</td>
                            <td className="py-3 pl-4 text-right text-slate-800">{r.econ}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-900 mb-4">Line &amp; Length Distribution</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-6 items-center">
                    <div className="w-24 h-40 mx-auto rounded-lg overflow-hidden border border-slate-200 flex flex-col">
                      <div className="flex-1 bg-amber-200" />
                      <div className="flex-1 bg-emerald-200" />
                      <div className="flex-1 bg-red-200" />
                      <div className="flex-1 bg-indigo-200" />
                    </div>
                    <div className="flex flex-col gap-2">
                      {lineLengthRows.length === 0 ? (
                        <p className="text-slate-600 italic text-sm">No length data available.</p>
                      ) : lineLengthRows.map((l) => (
                        <div key={l.length} className="flex justify-between items-center text-sm border-b border-slate-50 pb-2">
                          <span className="font-semibold text-slate-900">{l.length}</span>
                          <span className="text-slate-700 font-medium">{l.pct}%</span>
                        </div>
                      ))}
                      {/* MOCK — no speed field exists anywhere in the ball-by-ball schema. */}
                      <div className="flex justify-between mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                        <span>AVERAGE SPEED <span className="block font-bold text-slate-900 text-sm">— km/h</span></span>
                        <span>FASTEST DELIVERY <span className="block font-bold text-slate-900 text-sm">— km/h</span></span>
                      </div>
                    </div>
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
                <div className="flex flex-col gap-4">
                  {(view === 'batting' ? battingKeyMoments : bowlingKeyMoments).map((m, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                      <div className="flex-1 flex justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-slate-900">{m.label}</p>
                          <p className="text-xs text-slate-700">{m.sub}</p>
                        </div>
                        <span className="text-[10px] text-slate-600 whitespace-nowrap">{m.over}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Recent Performances</h3>
              {/* MOCK — no cross-match player-history endpoint exists anywhere. */}
              <div className="flex flex-col gap-3">
                {MOCK_RECENT_PERFORMANCES.map((p, i) => (
                  <div key={i} className="flex justify-between items-center border-b border-slate-50 pb-3 last:border-b-0 last:pb-0">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{p.score}</p>
                      <p className="text-[11px] text-slate-600">{p.competition}</p>
                    </div>
                    <span className="text-xs font-semibold text-slate-700">{p.opponent}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayerMatchStats;
