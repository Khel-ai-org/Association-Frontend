/**
 * Service for fetching a ball's persisted details and any videos already
 * uploaded against it (e.g. COC clips). This is the source of truth for
 * "what videos exist for this ball" — unlike locally-tracked upload
 * progress, it survives a page refresh.
 */

// A clip entry can be a direct URL string (e.g. COC records: { video1: "url" })
// or, for multi-camera "pull_system" records, a nested map of camera angles
// (e.g. { ball1: { camera1: "url", camera2: "url", ... } }).
export interface BallVideoFileMap {
  [clipKey: string]: string | Record<string, string>;
}

export interface BallVideoRecord {
  id: number;
  tag: string;
  video_source: string;
  upload_status: string;
  over_number: string;
  video_id: BallVideoFileMap;
  url: BallVideoFileMap;
  uploaded_at: string | null;
  created_at: string;
}

export interface BallOverInfo {
  id: number;
  over_number: string;
  bowler_name: string;
  match_over_id: number;
}

export interface BallDetails {
  id: number;
  match_id: string;
  innings: number;
  ball_number: number;
  total_runs: number;
  batsman_name: string;
  over: BallOverInfo;
  score_after: any;
  appeal: any;
  videos: BallVideoRecord[];
  video_count: number;
}

interface BallDetailsResponse {
  success: boolean;
  ball: BallDetails;
  error?: string;
}

const getScoringBaseUrl = () => {
  return process.env.NEXT_PUBLIC_SCORING_API_URL || 'http://localhost:5500';
};

export async function fetchBallDetails(
  matchId: string,
  ballId: number | string
): Promise<BallDetails> {
  const url = `${getScoringBaseUrl()}/api/v1/matches/${matchId}/ball-details/${ballId}`;

  const res = await fetch(url, {
    headers: { 'ngrok-skip-browser-warning': 'true' },
  });

  if (!res.ok) {
    throw new Error(`Failed to load ball videos (HTTP ${res.status})`);
  }

  const data: BallDetailsResponse = await res.json();
  if (!data.success || !data.ball) {
    throw new Error(data.error || 'Invalid ball details response');
  }

  return data.ball;
}

/**
 * A single playable clip, one row per camera/angle inside a video record's
 * url map (e.g. a "coc_0.6" record with video1 + video2 becomes 2 rows).
 */
export interface FlattenedBallVideo {
  key: string;
  recordId: number;
  tag: string;
  source: string;
  uploadStatus: string;
  overNumber: string;
  clipLabel: string;
  url: string;
  uploadedAt: string | null;
  createdAt: string;
}

export function flattenBallVideos(videos: BallVideoRecord[]): FlattenedBallVideo[] {
  const rows: FlattenedBallVideo[] = [];

  videos.forEach((record) => {
    const clipKeys = Object.keys(record.url || {});

    if (clipKeys.length === 0) {
      rows.push({
        key: `${record.id}`,
        recordId: record.id,
        tag: record.tag,
        source: record.video_source,
        uploadStatus: record.upload_status,
        overNumber: record.over_number,
        clipLabel: record.tag,
        url: '',
        uploadedAt: record.uploaded_at,
        createdAt: record.created_at,
      });
      return;
    }

    clipKeys.forEach((clipKey) => {
      const value = record.url[clipKey];

      if (typeof value === 'string') {
        // Flat shape (e.g. COC): the top-level key IS the clip label.
        rows.push({
          key: `${record.id}-${clipKey}`,
          recordId: record.id,
          tag: record.tag,
          source: record.video_source,
          uploadStatus: record.upload_status,
          overNumber: record.over_number,
          clipLabel: clipKey,
          url: value,
          uploadedAt: record.uploaded_at,
          createdAt: record.created_at,
        });
        return;
      }

      // Nested shape (e.g. pull_system multi-camera): clipKey is a group
      // (like "ball1"), and each inner key is a camera angle with its own URL.
      Object.entries(value || {}).forEach(([cameraKey, cameraUrl]) => {
        rows.push({
          key: `${record.id}-${clipKey}-${cameraKey}`,
          recordId: record.id,
          tag: record.tag,
          source: record.video_source,
          uploadStatus: record.upload_status,
          overNumber: record.over_number,
          clipLabel: `${clipKey} · ${cameraKey}`,
          url: cameraUrl,
          uploadedAt: record.uploaded_at,
          createdAt: record.created_at,
        });
      });
    });
  });

  return rows;
}
