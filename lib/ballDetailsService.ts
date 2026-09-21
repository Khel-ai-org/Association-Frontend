/**
 * Service for fetching a ball's persisted details and any videos already
 * uploaded against it (e.g. COC clips). This is the source of truth for
 * "what videos exist for this ball" — unlike locally-tracked upload
 * progress, it survives a page refresh.
 */

export interface BallVideoFileMap {
  [clipKey: string]: string;
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
      rows.push({
        key: `${record.id}-${clipKey}`,
        recordId: record.id,
        tag: record.tag,
        source: record.video_source,
        uploadStatus: record.upload_status,
        overNumber: record.over_number,
        clipLabel: clipKey,
        url: record.url[clipKey],
        uploadedAt: record.uploaded_at,
        createdAt: record.created_at,
      });
    });
  });

  return rows;
}
