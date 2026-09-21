/**
 * Service for Referee/COC Video Upload Pipeline:
 * 1. Initialize with Backend (POST /coc-video-upload/init) -> gets presigned upload_url & s3_key
 * 2. Upload directly to AWS S3 (PUT upload_url with XMLHttpRequest for real progress tracking)
 * 3. Confirm with Backend (POST /video-upload) -> sets upload_status = 'uploaded'
 */

export interface InitCocVideoUploadParams {
  over_number: string;
  innings: number;
  file_name: string;
  content_type: string;
}

export interface InitCocVideoUploadResponse {
  success: boolean;
  upload_url: string;
  s3_key: string;
  ball_video_id: number | string;
  error?: string;
}

export interface ConfirmCocVideoUploadParams {
  ball_video_id: number | string;
  s3_key: string;
  group?: string;
}

export interface CocVideoItem {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  sizeFormatted: string;
  progress: number;
  status: 'pending' | 'uploading' | 'ready' | 'error';
  error?: string;
  ballVideoId?: number | string;
  s3Key?: string;
}

const getScoringBaseUrl = () => {
  return process.env.NEXT_PUBLIC_SCORING_API_URL || 'http://localhost:5500';
};

/**
 * Step 1: Initialize upload with backend to generate S3 presigned PUT URL and DB record
 */
export async function initCocVideoUpload(
  matchId: string,
  params: InitCocVideoUploadParams
): Promise<InitCocVideoUploadResponse> {
  const baseUrl = getScoringBaseUrl();
  const url = `${baseUrl}/api/v1/matches/${matchId}/coc-video-upload/init`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify({
      over_number: params.over_number,
      innings: params.innings,
      file_name: params.file_name,
      content_type: params.content_type || 'video/mp4',
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Init upload failed (HTTP ${res.status}): ${errText}`);
  }

  const data = await res.json();
  if (data.success === false) {
    throw new Error(data.error || 'Backend rejected upload initialization');
  }

  return data;
}

/**
 * Step 2: Upload directly to AWS S3 using XMLHttpRequest for accurate real-time progress
 */
export function uploadToS3WithProgress(
  uploadUrl: string,
  file: File,
  onProgress?: (progressPct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          const pct = Math.min(100, Math.round((e.loaded / e.total) * 100));
          onProgress(pct);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100);
        resolve();
      } else {
        reject(new Error(`Direct S3 upload failed (HTTP ${xhr.status}): ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error occurred during direct S3 upload'));
    };

    xhr.onabort = () => {
      reject(new Error('Upload was aborted by user'));
    };

    xhr.send(file);
  });
}

/**
 * Step 3: Confirm upload with backend to set upload_status = 'uploaded'
 */
export async function confirmCocVideoUpload(
  matchId: string,
  params: ConfirmCocVideoUploadParams
): Promise<any> {
  const baseUrl = getScoringBaseUrl();
  const url = `${baseUrl}/api/v1/matches/${matchId}/video-upload`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify({
      ball_video_id: params.ball_video_id,
      s3_key: params.s3_key,
      ...(params.group ? { group: params.group } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Confirm upload failed (HTTP ${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * Complete Pipeline: Runs Step 1 -> Step 2 -> Step 3 sequentially
 */
export async function uploadCocVideoPipeline(
  matchId: string,
  overNumber: string,
  innings: number,
  videoFile: File,
  onProgress?: (progressPct: number) => void
): Promise<{ s3Key: string; ballVideoId: number | string; confirmResult: any }> {
  // 1. Init
  const initData = await initCocVideoUpload(matchId, {
    over_number: overNumber,
    innings: innings,
    file_name: videoFile.name,
    content_type: videoFile.type || 'video/mp4',
  });

  const { upload_url, s3_key, ball_video_id } = initData;
  if (!upload_url || !s3_key) {
    throw new Error('Invalid upload init response: missing upload_url or s3_key');
  }

  // Extract group if present in init response
  const group = (initData as any).group;

  // 2. Direct S3 Upload with live progress
  await uploadToS3WithProgress(upload_url, videoFile, onProgress);

  // 3. Confirm with Backend
  const confirmResult = await confirmCocVideoUpload(matchId, {
    ball_video_id,
    s3_key,
    group,
  });

  return {
    s3Key: s3_key,
    ballVideoId: ball_video_id,
    confirmResult,
  };
}

/**
 * Helper to format bytes to human readable size (KB, MB, GB)
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
