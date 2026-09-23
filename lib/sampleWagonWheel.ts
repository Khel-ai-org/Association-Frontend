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
  battingHand?: 'RHB' | 'LHB';
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

// Each named area is a 45° wedge, not a single line — inner/deep pairs
// (e.g. "Mid Off"/"Long Off") share the same wedge, just picked for shots
// of different reach. A shot's exact angle is randomized within its
// area's wedge so repeated shots to the same area fan out realistically
// instead of stacking on one line.
//
// The batsman stands at z=-8.8 (see batsmanPosition in WagonWheelModal.tsx)
// and faces the bowler in the +Z direction. Given convertShotTo3D's mapping
// (worldZ = -cos(angle) * distance), world angle 180° — not 0° — is what's
// actually "straight toward the bowler", so Long Off/Long On must straddle
// 180° and Third Man/Fine Leg must straddle 0°/360° ("behind the keeper").
// Going around: Fine Leg → Square Leg → Mid Wicket → Long On → Long Off →
// Cover → Point → Third Man → (back to Fine Leg), putting leg/on-side in
// [0°,180°] and off-side in [180°,360°].
const AREA_WEDGE_CENTER: Record<string, number> = {
  'Fine Leg': 22.5, 'Deep Fine Leg': 22.5,
  'Square Leg': 67.5, 'Deep Square Leg': 67.5,
  'Mid Wicket': 112.5, 'Deep Mid Wicket': 112.5,
  'Mid On': 157.5, 'Long On': 157.5,
  'Mid Off': 202.5, 'Long Off': 202.5,
  Cover: 247.5, 'Deep Cover': 247.5,
  Point: 292.5, 'Deep Point': 292.5,
  Slip: 337.5, 'Third Man': 337.5,
};

// Half-width kept a little inside the true 22.5° wedge edge so a shot never
// visually crosses into the neighboring named area.
const WEDGE_HALF_SPREAD = 18;

const getRandomAngleForArea = (area: string): number => {
  const center = AREA_WEDGE_CENTER[area] ?? 0;
  const offset = (Math.random() * 2 - 1) * WEDGE_HALF_SPREAD;
  return (center + offset + 360) % 360;
};

// Distance is driven by runs, not by the area's inner/deep label — a six is
// a six regardless of which named wedge it was hit through.
// Must match `boundaryRadius` (65m) in WagonWheelModal.tsx, where the
// boundary rope is actually drawn.
const BOUNDARY_ROPE_DISTANCE = 65;

const getRandomDistanceForRuns = (runs: number): number => {
  // Every four/six reaches the same rope — only the angle should vary,
  // so distance is fixed here, not randomized.
  if (runs >= 6) return BOUNDARY_ROPE_DISTANCE + 5; // cleared the rope
  if (runs === 4) return BOUNDARY_ROPE_DISTANCE; // reaches exactly the rope
  if (runs >= 1) {
    // Outside the 30-yard circle (~27m) but well short of the boundary,
    // nudged a little further out the more runs were taken.
    const min = 26 + runs * 2;
    return randomBetween(min, min + 12);
  }
  return 15; // dot ball — not animated, distance is nominal
};

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

const describeShot = (area: string, runs: number): string => {
  if (runs >= 6) return `Six over ${area}`;
  if (runs === 4) return `Four through ${area}`;
  if (runs === 1) return `Single to ${area}`;
  if (runs === 0) return `Dot ball to ${area}`;
  return `${runs} runs to ${area}`;
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
    const rawAngle = getRandomAngleForArea(b.area);
    const angle = b.battingHand === 'LHB' ? (360 - rawAngle) % 360 : rawAngle;
    return {
      id: b.id,
      runs: b.runs,
      shotType: describeShot(b.area, b.runs),
      area: b.area,
      angle,
      distance: getRandomDistanceForRuns(b.runs),
    };
  });

  return {
    animationType: 'WAGON_WHEEL',
    theme,
    batsman,
    battingHand: balls[0]?.battingHand || 'RHB',
    runsTotal: shots.reduce((sum, s) => sum + s.runs, 0),
    ballsTotal: balls.length,
    fours: shots.filter((s) => s.runs === 4).length,
    sixes: shots.filter((s) => s.runs === 6).length,
    shots,
  };
};

// Shape of GET /api/v1/matches/:id/wagon-wheel?name=...&innings=... —
// the real scoring backend endpoint.
export interface WagonWheelApiBall {
  ball_id: number;
  innings: number;
  over_number: string;
  batsman_runs: number;
  is_boundary: boolean;
  shot_type: string | null;
  fielding_type: string | null;
}

export interface WagonWheelApiResponse {
  match_id: string;
  player_name: string;
  batting_hand?: string; // e.g. "Right Handed" / "Left Handed"
  innings_filter: number;
  summary: {
    total_runs: number;
    balls_faced: number;
    fours: number;
    sixes: number;
  };
  wagon_wheel: WagonWheelApiBall[];
}

// "Right Handed"/"Left Handed" (case-insensitive) -> our internal RHB/LHB.
// Defaults to RHB for anything else/missing, rather than guessing wrong.
const mapBattingHand = (raw: string | undefined): 'RHB' | 'LHB' =>
  raw?.toLowerCase().includes('left') ? 'LHB' : 'RHB';

const ALL_ZONE_NAMES = new Set<string>([...DEEP_ZONE_NAMES, ...INNER_ZONE_NAMES]);

// The API spells some zones with hyphens ("Mid-Off", "Mid-On") where
// everywhere else in this app uses spaces ("Mid Off", "Long Off", ...).
// Cleans that up and validates against our canonical 16 zones — returns
// null (never a guess) for anything that still doesn't match, so a ball
// we can't confidently place never gets silently mis-plotted.
const normalizeAreaName = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const cleaned = raw.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  if (ALL_ZONE_NAMES.has(cleaned)) return cleaned;
  console.warn(`[WagonWheel] Unrecognized field zone from API: "${raw}"`);
  return null;
};

/**
 * Converts the real scoring API's wagon-wheel response into the
 * WagonWheelData shape the 3D modal renders. Batting hand now comes from
 * the API itself (`batting_hand`); the parameter is only a fallback/override
 * for callers that already know it from elsewhere.
 */
export const buildWagonWheelDataFromApiResponse = (
  response: WagonWheelApiResponse,
  battingHandOverride?: 'RHB' | 'LHB',
  theme: string = 'dark'
): WagonWheelData => {
  if (!response || !Array.isArray(response.wagon_wheel)) {
    console.error('[WagonWheel] Unexpected API response shape (no wagon_wheel array):', response);
    throw new Error('Wagon wheel response is missing the expected "wagon_wheel" array');
  }

  const battingHand = battingHandOverride || mapBattingHand(response.batting_hand);
  const shots: WagonWheelShot[] = response.wagon_wheel
    .map((ball): WagonWheelShot | null => {
      const area = normalizeAreaName(ball.fielding_type);
      // No recorded field position for this ball — it still counts toward
      // the totals (taken from response.summary below) but can't be drawn
      // on the field since there's no zone to place it in.
      if (!area) return null;

      const rawAngle = getRandomAngleForArea(area);
      const angle = battingHand === 'LHB' ? (360 - rawAngle) % 360 : rawAngle;
      return {
        id: ball.ball_id,
        runs: ball.batsman_runs,
        shotType: ball.shot_type ? `${ball.shot_type} to ${area}` : describeShot(area, ball.batsman_runs),
        area,
        angle,
        distance: getRandomDistanceForRuns(ball.batsman_runs),
      };
    })
    .filter((s): s is WagonWheelShot => s !== null);

  return {
    animationType: 'WAGON_WHEEL',
    theme,
    batsman: response.player_name,
    battingHand,
    // From the API's own summary, not recomputed from `shots` — balls with
    // no recorded field position are excluded from `shots` but must still
    // count toward runs/balls faced/fours/sixes.
    runsTotal: response.summary.total_runs,
    ballsTotal: response.summary.balls_faced,
    fours: response.summary.fours,
    sixes: response.summary.sixes,
    shots,
  };
};

// Static stand-in for the live scorer feed — same shape the real API
// will send once ball-by-ball wagon-wheel data is wired in.
export const SAMPLE_SCORER_BALLS: ScorerBallInput[] = [
  { id: 1, over: 1, ballNumber: 1, runs: 0, area: 'Cover', battingHand: 'RHB' },
  { id: 2, over: 1, ballNumber: 2, runs: 1, area: 'Mid On', battingHand: 'RHB' },
  { id: 3, over: 1, ballNumber: 4, runs: 1, area: 'Fine Leg', battingHand: 'RHB' },
  { id: 4, over: 1, ballNumber: 6, runs: 2, area: 'Point', battingHand: 'RHB' },
  { id: 5, over: 2, ballNumber: 1, runs: 0, area: 'Mid Off', battingHand: 'RHB' },
  { id: 6, over: 2, ballNumber: 2, runs: 2, area: 'Mid Wicket', battingHand: 'RHB' },
  { id: 7, over: 2, ballNumber: 5, runs: 1, area: 'Cover', battingHand: 'RHB' },
  { id: 8, over: 3, ballNumber: 1, runs: 2, area: 'Point', battingHand: 'RHB' },
  { id: 9, over: 3, ballNumber: 3, runs: 1, area: 'Slip', battingHand: 'RHB' },
  { id: 10, over: 3, ballNumber: 6, runs: 4, area: 'Deep Cover', battingHand: 'RHB' },
  { id: 11, over: 4, ballNumber: 2, runs: 1, area: 'Square Leg', battingHand: 'RHB' },
  { id: 12, over: 4, ballNumber: 3, runs: 4, area: 'Deep Point', battingHand: 'RHB' },
  { id: 13, over: 4, ballNumber: 5, runs: 3, area: 'Deep Square Leg', battingHand: 'RHB' },
  { id: 14, over: 5, ballNumber: 1, runs: 1, area: 'Mid On', battingHand: 'RHB' },
  { id: 15, over: 5, ballNumber: 2, runs: 4, area: 'Deep Cover', battingHand: 'RHB' },
  { id: 16, over: 5, ballNumber: 4, runs: 0, area: 'Mid Wicket', battingHand: 'RHB' },
  { id: 17, over: 6, ballNumber: 1, runs: 2, area: 'Fine Leg', battingHand: 'RHB' },
  { id: 18, over: 6, ballNumber: 6, runs: 4, area: 'Long On', battingHand: 'RHB' },
  { id: 19, over: 7, ballNumber: 2, runs: 1, area: 'Point', battingHand: 'RHB' },
  { id: 20, over: 7, ballNumber: 4, runs: 4, area: 'Deep Mid Wicket', battingHand: 'RHB' },
  { id: 21, over: 8, ballNumber: 1, runs: 4, area: 'Deep Fine Leg', battingHand: 'RHB' },
  { id: 22, over: 8, ballNumber: 3, runs: 1, area: 'Cover', battingHand: 'RHB' },
  { id: 23, over: 8, ballNumber: 5, runs: 2, area: 'Mid On', battingHand: 'RHB' },
  { id: 24, over: 9, ballNumber: 3, runs: 4, area: 'Long Off', battingHand: 'RHB' },
  { id: 25, over: 9, ballNumber: 6, runs: 1, area: 'Square Leg', battingHand: 'RHB' },
  { id: 26, over: 10, ballNumber: 2, runs: 4, area: 'Deep Square Leg', battingHand: 'RHB' },
  { id: 27, over: 10, ballNumber: 5, runs: 6, area: 'Long On', battingHand: 'RHB' },
  { id: 28, over: 11, ballNumber: 1, runs: 0, area: 'Slip', battingHand: 'RHB' },
  { id: 29, over: 11, ballNumber: 2, runs: 6, area: 'Deep Mid Wicket', battingHand: 'RHB' },
  { id: 30, over: 11, ballNumber: 4, runs: 2, area: 'Third Man', battingHand: 'RHB' },
  { id: 31, over: 12, ballNumber: 3, runs: 4, area: 'Deep Fine Leg', battingHand: 'RHB' },
  { id: 32, over: 12, ballNumber: 4, runs: 6, area: 'Third Man', battingHand: 'RHB' },
  { id: 33, over: 12, ballNumber: 6, runs: 1, area: 'Mid Off', battingHand: 'RHB' },
  { id: 34, over: 13, ballNumber: 2, runs: 4, area: 'Deep Point', battingHand: 'RHB' },
  { id: 35, over: 13, ballNumber: 5, runs: 3, area: 'Fine Leg', battingHand: 'RHB' },
  { id: 36, over: 13, ballNumber: 6, runs: 6, area: 'Long Off', battingHand: 'RHB' },
  { id: 37, over: 14, ballNumber: 1, runs: 1, area: 'Mid Wicket', battingHand: 'RHB' },
  { id: 38, over: 14, ballNumber: 3, runs: 4, area: 'Deep Cover', battingHand: 'RHB' },
  { id: 39, over: 14, ballNumber: 5, runs: 6, area: 'Long On', battingHand: 'RHB' },
  { id: 40, over: 15, ballNumber: 2, runs: 2, area: 'Point', battingHand: 'RHB' },
  { id: 41, over: 15, ballNumber: 4, runs: 4, area: 'Deep Square Leg', battingHand: 'RHB' },
  { id: 42, over: 15, ballNumber: 6, runs: 1, area: 'Cover', battingHand: 'RHB' },
];

export const SAMPLE_WAGON_WHEEL_DATA: WagonWheelData = buildWagonWheelDataFromScorerBalls(
  SAMPLE_SCORER_BALLS,
  'V. Kohli'
);
