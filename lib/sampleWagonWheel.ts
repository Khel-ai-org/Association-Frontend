/**
 * Sample Wagon Wheel Data structure mirroring test.json from broadcaster app
 */

export interface WagonWheelShot {
  id: number;
  runs: number;
  shotType: string;
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

export const SAMPLE_WAGON_WHEEL_DATA: WagonWheelData = {
  animationType: 'WAGON_WHEEL',
  theme: 'dark',
  batsman: 'V. Kohli',
  runsTotal: 82,
  ballsTotal: 53,
  fours: 6,
  sixes: 4,
  shots: [
    { id: 1,  runs: 1, shotType: 'Push to Mid-On',           angle: 15,  distance: 35 },
    { id: 2,  runs: 1, shotType: 'Glance to Fine Leg',       angle: 135, distance: 42 },
    { id: 3,  runs: 2, shotType: 'Flick to Mid-Wicket',      angle: 80,  distance: 48 },
    { id: 4,  runs: 1, shotType: 'Push to Cover',            angle: 285, distance: 30 },
    { id: 5,  runs: 2, shotType: 'Cut to Backward Point',    angle: 250, distance: 40 },
    { id: 6,  runs: 4, shotType: 'Square Cut',               angle: 260, distance: 68 },
    { id: 7,  runs: 4, shotType: 'Cover Drive',              angle: 295, distance: 72 },
    { id: 8,  runs: 4, shotType: 'Straight Drive',           angle: 5,   distance: 70 },
    { id: 9,  runs: 4, shotType: 'Pull to Deep Mid-Wicket',  angle: 95,  distance: 69 },
    { id: 10, runs: 4, shotType: 'Fine Leg Sweep',          angle: 145, distance: 67 },
    { id: 11, runs: 4, shotType: 'On Drive',                 angle: 25,  distance: 71 },
    { id: 12, runs: 6, shotType: 'Lofted Cover Drive',       angle: 305, distance: 88 },
    { id: 13, runs: 6, shotType: 'Pull over Mid-Wicket',     angle: 100, distance: 85 },
    { id: 14, runs: 6, shotType: 'Upper Cut over Point',     angle: 245, distance: 82 },
    { id: 15, runs: 6, shotType: 'Straight Six over Long-On',angle: 10,  distance: 92 },
  ],
};
