/**
 * Sample Wagon Wheel Data structure mirroring test.json from broadcaster app
 */

export interface WagonWheelShot {
  id: number;
  runs: number;
  shotType: string;
  area?: string;       // Named field zone selected in the scorer's wagon-wheel step (e.g. "Deep Cover")
  angle?: number;      // 0° to 360° field angle (0° = Straight Down, 90° = Mid-Wicket/Fine Leg, 180° = Behind Wickets, 270° = Cover/Off-side)
  distance?: number;   // Distance in meters
}

export interface WagonWheelData {
  animationType: 'WAGON_WHEEL';
  theme?: string;
  batsman: string;
  runsTotal: number;
  ballsTotal: number;
  fours: number;
  sixes: number;
  shots: WagonWheelShot[];
}

/**
 * Raw per-ball payload shape expected from the scorer app's
 * "Select Wagon Wheel Area" step. This is the piece that becomes
 * dynamic later (fed by the live scoring API) — everything downstream
 * (angle/distance/shotType) is derived from it.
 */
export interface ScorerBallInput {
  id: number;
  over: number;
  ballNumber: number;
  runs: number;
  area: string;               // one of DEEP_ZONE_NAMES | INNER_ZONE_NAMES
  battingHand: 'RHB' | 'LHB';
}

// Boundary/outfield zones — same 8 names already used for ball filtering
// in MatchDetails.tsx (line 637), kept identical for consistency.
export const DEEP_ZONE_NAMES = [
  'Deep Cover',
  'Long Off',
  'Long On',
  'Deep Mid Wicket',
  'Deep Square Leg',
  'Deep Fine Leg',
  'Third Man',
  'Deep Point',
] as const;

// Infield equivalents of the zones above (inner ring of the scorer's wheel).
export const INNER_ZONE_NAMES = [
  'Cover',
  'Mid Off',
  'Mid On',
  'Mid Wicket',
  'Square Leg',
  'Fine Leg',
  'Slip',
  'Point',
] as const;

// Each inner/deep pair shares the same field angle — only the distance differs.
const AREA_ANGLE_MAP: Record<string, number> = {
  Cover: 0, 'Deep Cover': 0,
  'Mid Off': 45, 'Long Off': 45,
  'Mid On': 90, 'Long On': 90,
  'Mid Wicket': 135, 'Deep Mid Wicket': 135,
  'Square Leg': 180, 'Deep Square Leg': 180,
  'Fine Leg': 225, 'Deep Fine Leg': 225,
  Slip: 270, 'Third Man': 270,
  Point: 315, 'Deep Point': 315,
};

const isDeepZone = (area: string) => (DEEP_ZONE_NAMES as readonly string[]).includes(area);

const getDistanceForArea = (area: string, runs: number): number => {
  if (!isDeepZone(area)) return 18 + runs * 6; // infield shot, ~24-36m
  return runs >= 6 ? 88 : 65; // aerial six vs. along-the-ground boundary
};

const describeShot = (area: string, runs: number): string => {
  if (runs >= 6) return `Six over ${area}`;
  if (runs === 4) return `Four through ${area}`;
  if (runs === 1) return `Single to ${area}`;
  return `${runs} run${runs > 1 ? 's' : ''} to ${area}`;
};

/**
 * Converts raw scorer ball inputs into the WagonWheelData shape the
 * 3D modal renders. Left-handed batters get their angle mirrored so
 * off-side/leg-side zones stay visually correct.
 */
export const buildWagonWheelDataFromScorerBalls = (
  balls: ScorerBallInput[],
  batsman: string,
  theme: string = 'dark'
): WagonWheelData => {
  const shots: WagonWheelShot[] = balls.map((b) => {
    const baseAngle = AREA_ANGLE_MAP[b.area] ?? 0;
    const angle = b.battingHand === 'LHB' ? (360 - baseAngle) % 360 : baseAngle;
    return {
      id: b.id,
      runs: b.runs,
      shotType: describeShot(b.area, b.runs),
      area: b.area,
      angle,
      distance: getDistanceForArea(b.area, b.runs),
    };
  });

  return {
    animationType: 'WAGON_WHEEL',
    theme,
    batsman,
    runsTotal: shots.reduce((sum, s) => sum + s.runs, 0),
    ballsTotal: balls.length,
    fours: shots.filter((s) => s.runs === 4).length,
    sixes: shots.filter((s) => s.runs === 6).length,
    shots,
  };
};

// Static stand-in for the live scorer feed — same shape the real API
// will send once ball-by-ball wagon-wheel data is wired in.
export const SAMPLE_SCORER_BALLS: ScorerBallInput[] = [
  { id: 1, over: 1, ballNumber: 1, runs: 1, area: 'Mid On', battingHand: 'RHB' },
  { id: 2, over: 1, ballNumber: 4, runs: 1, area: 'Fine Leg', battingHand: 'RHB' },
  { id: 3, over: 2, ballNumber: 2, runs: 2, area: 'Mid Wicket', battingHand: 'RHB' },
  { id: 4, over: 2, ballNumber: 5, runs: 1, area: 'Cover', battingHand: 'RHB' },
  { id: 5, over: 3, ballNumber: 1, runs: 2, area: 'Point', battingHand: 'RHB' },
  { id: 6, over: 4, ballNumber: 3, runs: 4, area: 'Deep Point', battingHand: 'RHB' },
  { id: 7, over: 5, ballNumber: 2, runs: 4, area: 'Deep Cover', battingHand: 'RHB' },
  { id: 8, over: 6, ballNumber: 6, runs: 4, area: 'Long On', battingHand: 'RHB' },
  { id: 9, over: 7, ballNumber: 4, runs: 4, area: 'Deep Mid Wicket', battingHand: 'RHB' },
  { id: 10, over: 8, ballNumber: 1, runs: 4, area: 'Deep Fine Leg', battingHand: 'RHB' },
  { id: 11, over: 9, ballNumber: 3, runs: 4, area: 'Long Off', battingHand: 'RHB' },
  { id: 12, over: 10, ballNumber: 5, runs: 6, area: 'Long On', battingHand: 'RHB' },
  { id: 13, over: 11, ballNumber: 2, runs: 6, area: 'Deep Mid Wicket', battingHand: 'RHB' },
  { id: 14, over: 12, ballNumber: 4, runs: 6, area: 'Third Man', battingHand: 'RHB' },
  { id: 15, over: 13, ballNumber: 6, runs: 6, area: 'Long Off', battingHand: 'RHB' },
];

export const SAMPLE_WAGON_WHEEL_DATA: WagonWheelData = buildWagonWheelDataFromScorerBalls(
  SAMPLE_SCORER_BALLS,
  'V. Kohli'
);
