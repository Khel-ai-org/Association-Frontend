/**
 * ffmpegUtils — server-side frame extraction utilities.
 *
 * Cache strategy (mirrors Z4 Python backend):
 *   - Frames stored as JPEG on disk: /tmp/assoc-frames/{urlHash}/%06d.jpg
 *   - First request  = on-demand extract + cache (~300-800ms)
 *   - After preload  = read from disk (< 5ms)
 *   - Preload        = extract ALL frames in one ffmpeg pass (background)
 */

import ffmpegLib from 'fluent-ffmpeg';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, chmodSync } from 'fs';

// -------------------------------------------------------------------- //
// Binary setup                                                          //
// ffmpeg-static uses __dirname which Next.js rewrites to /ROOT/ in dev. //
// Use process.cwd() — always the real project root at runtime.         //
// -------------------------------------------------------------------- //

const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64';
const SYSTEM_FFMPEG = '/opt/homebrew/bin/ffmpeg';
const STATIC_FFMPEG = join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');

const FFMPEG_BIN = existsSync(SYSTEM_FFMPEG) ? SYSTEM_FFMPEG : STATIC_FFMPEG;
const FFPROBE_BIN = join(process.cwd(), 'node_modules', 'ffprobe-static', 'bin', 'darwin', ARCH, 'ffprobe');

if (existsSync(FFMPEG_BIN)) {
  try { chmodSync(FFMPEG_BIN, 0o755); } catch {}
  ffmpegLib.setFfmpegPath(FFMPEG_BIN);
  console.log('[ffmpeg] using binary:', FFMPEG_BIN);
} else {
  console.warn('[ffmpeg] binary not found at', FFMPEG_BIN, '— falling back to system ffmpeg');
}

if (existsSync(FFPROBE_BIN)) {
  try { chmodSync(FFPROBE_BIN, 0o755); } catch {}
  ffmpegLib.setFfprobePath(FFPROBE_BIN);
} else {
  console.warn('[ffprobe] binary not found at', FFPROBE_BIN, '— falling back to system ffprobe');
}

// -------------------------------------------------------------------- //
// Disk cache helpers                                                    //
//                                                                       //
// Both on-demand and bulk extraction write to the same directory.       //
// Bulk output is 1-indexed (%06d starts at 000001), so:                //
//   frame index 0  → 000001.jpg                                        //
//   frame index N  → {N+1 zero-padded to 6 digits}.jpg                //
// -------------------------------------------------------------------- //

function videoHash(url: string): string {
  return createHash('md5').update(url).digest('hex').slice(0, 16);
}

function frameDir(videoUrl: string): string {
  const dir = join(tmpdir(), 'assoc-frames', videoHash(videoUrl));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Maps a 0-based frame index → the 1-based filename ffmpeg bulk writes. */
function diskPath(videoUrl: string, index: number): string {
  return join(frameDir(videoUrl), `${String(index + 1).padStart(6, '0')}.jpg`);
}

export function frameExistsOnDisk(videoUrl: string, index: number): boolean {
  return existsSync(diskPath(videoUrl, index));
}

export function readFrameFromDisk(videoUrl: string, index: number): Buffer | null {
  const path = diskPath(videoUrl, index);
  return existsSync(path) ? readFileSync(path) : null;
}

// -------------------------------------------------------------------- //
// Video metadata (ffprobe)                                              //
// -------------------------------------------------------------------- //

export interface VideoInfo {
  duration:   number;
  width:      number;
  height:     number;
  fps:        number;
  frameCount: number;
}

export function probeVideo(url: string): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    ffmpegLib.ffprobe(url, (err, meta) => {
      if (err) return reject(new Error(`ffprobe failed: ${err.message}`));

      const vs       = meta.streams.find((s) => s.codec_type === 'video');
      const duration = meta.format.duration ?? 0;

      // Prefer avg_frame_rate (actual decode rate) over r_frame_rate (container timebase).
      // Both are valid for high-speed cameras (e.g. 200fps).
      let fps = 25;
      const rateStr = vs?.avg_frame_rate || vs?.r_frame_rate;
      if (rateStr && rateStr !== '0/0') {
        const [num, den] = rateStr.split('/').map(Number);
        if (num > 0 && den > 0) fps = Math.round((num / den) * 100) / 100;
      }

      const width      = vs?.width  ?? 1280;
      const height     = vs?.height ?? 720;
      const frameCount = Math.max(1, Math.floor(duration * fps));

      resolve({ duration, width, height, fps, frameCount });
    });
  });
}

// -------------------------------------------------------------------- //
// On-demand single-frame extraction                                     //
// Used as a fallback while bulk preload is still running.              //
// -------------------------------------------------------------------- //

export function extractSingleFrame(
  videoUrl: string,
  index:    number,
  fps:      number,
): Promise<Buffer> {
  const outPath     = diskPath(videoUrl, index);
  const timeSeconds = index / fps;

  return new Promise((resolve, reject) => {
    ffmpegLib(videoUrl)
      .inputOptions([
        '-ss', String(timeSeconds),
        '-threads', '0',               // Use all available CPU cores
      ])
      .outputOptions([
        '-vframes', '1',
        '-vcodec',  'mjpeg',
        '-q:v',     '3',               // high quality MJPEG
        '-an',                         // strip audio
      ])
      .output(outPath)
      .on('end', () => {
        const buf = existsSync(outPath) ? readFileSync(outPath) : null;
        if (!buf) return reject(new Error(`ffmpeg wrote nothing to: ${outPath}`));
        resolve(buf);
      })
      .on('error', (err, _stdout, stderr) => {
        reject(new Error(`ffmpeg: ${err.message} | stderr: ${stderr?.slice(-300)}`));
      })
      .run();
  });
}

// -------------------------------------------------------------------- //
// Bulk preload — equivalent of Z4's Python _start_extraction(clip).    //
// -------------------------------------------------------------------- //
const _running = new Set<string>();

export function startBulkExtraction(
  videoUrl: string,
  fps:      number = 25,
  priority: boolean = false,
): { alreadyRunning: boolean } {
  const hash = videoHash(videoUrl);
  if (_running.has(hash)) return { alreadyRunning: true };

  _running.add(hash);
  const dir = frameDir(videoUrl);

  ffmpegLib(videoUrl)
    .inputOptions([
      '-threads', '0',                 // Maximize all CPU cores
    ])
    .outputOptions([
      '-vsync',   '0',                 // Pass native frames directly (instant decode)
      '-vcodec',  'mjpeg',
      '-q:v',     '4',                 // Optimized JPEG compression for fast disk write
      '-start_number', '0',
      '-an',
    ])
    .output(join(dir, '%06d.jpg'))
    .on('end',   () => {
      _running.delete(hash);
    })
    .on('error', (err) => {
      console.error(`FFmpeg extraction error for ${hash}:`, err.message);
      _running.delete(hash);
    })
    .run();

  return { alreadyRunning: false };
}

export function isExtracting(videoUrl: string): boolean {
  return _running.has(videoHash(videoUrl));
}
