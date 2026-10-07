/**
 * ffmpegUtils — server-side video preparation for the canvas player.
 *
 * The player decodes video in the browser through a native <video>
 * element (see PlayerEngine.ts) instead of fetching per-frame JPEGs.
 * The camera files themselves aren't browser-friendly, though: HEVC
 * 10-bit (no Firefox support, patchy elsewhere), ~65 Mbps, and one
 * keyframe per 200 frames — so seeking to a frame can mean decoding up to
 * 199 frames before it. ensureStreamable() converts each clip ONCE into
 * H.264 8-bit with a short keyframe interval, cached on local disk and
 * served by /api/video/stream with HTTP Range support. probeVideo() reads
 * the converted file's fps/frame count, which <video> can't report.
 *
 * ffmpeg/ffprobe only ever read LOCAL files: Node downloads the source
 * first. The static Linux builds shipped by ffmpeg-static/ffprobe-static
 * crash (SIGSEGV) when they open an https URL themselves — seen on the
 * Debian deploy server, while the same binaries handle local files fine.
 *
 * extractSingleFrame()/startBulkExtraction()/the frame disk-cache helpers
 * are DEAD CODE — kept only because /api/video/frame and /api/video/preload
 * (no longer called by the player) still import them. Safe to delete those
 * two routes and that code once this approach is confirmed to be a keeper.
 */

import ffmpegLib from 'fluent-ffmpeg';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  existsSync, mkdirSync, readFileSync, chmodSync, createWriteStream,
  renameSync, unlinkSync, readdirSync, statSync, utimesSync,
} from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

// -------------------------------------------------------------------- //
// Binary setup                                                          //
//                                                                       //
// Both ffmpeg-static and ffprobe-static resolve their bundled binary's  //
// path via __dirname internally — which Next.js/Turbopack rewrites to a //
// fake "/ROOT/" in dev (confirmed by testing both directly: ffprobe-    //
// static's own `.path` export came back as "/ROOT/node_modules/...").  //
// process.cwd() is the real project root both in dev and in a deployed  //
// build, so paths are built manually from it instead of trusting either //
// package's own export.                                                 //
//                                                                       //
// This also fixes the previous hardcoded "darwin" path segment for      //
// ffprobe, which pointed at a nonexistent file on any Linux deployment  //
// (ffprobe-static installs Linux's binary under bin/linux/…, never      //
// bin/darwin/…, no matter what OS actually requested the install) —     //
// process.platform/process.arch are used instead, matching exactly how  //
// ffprobe-static names its own per-platform folders.                    //
// -------------------------------------------------------------------- //

// FFMPEG_PATH / FFPROBE_PATH override the bundled binaries (e.g. to use a
// distro-packaged ffmpeg if a bundled build misbehaves on some server).
const FFMPEG_BIN  = process.env.FFMPEG_PATH || join(process.cwd(), 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const FFPROBE_BIN = process.env.FFPROBE_PATH || join(
  process.cwd(), 'node_modules', 'ffprobe-static', 'bin',
  process.platform, process.arch,
  process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
);

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
  console.log('[ffprobe] using binary:', FFPROBE_BIN);
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
// Streamable conversion — one-time, cached per clip                     //
// -------------------------------------------------------------------- //

const STREAMABLE_DIR = join(tmpdir(), 'assoc-streamable');

// Tuned for a small server (2 vCPU / 2 GB: one conversion alone takes both
// cores for ~50 s and ~500 MB, so two at once swap and starve the other app
// on the box). Raise these on bigger machines.
//   VIDEO_MAX_CONVERSIONS   conversions running at once (others queue)
//   VIDEO_FFMPEG_THREADS    threads per ffmpeg (1 leaves a core free)
//   VIDEO_CACHE_MAX_GB      converted-clip cache size before the least
//                           recently viewed clips are deleted
function positiveNumber(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
const MAX_CONCURRENT_CONVERSIONS = Math.max(1, Math.floor(positiveNumber('VIDEO_MAX_CONVERSIONS', 1)));
const FFMPEG_THREADS = Math.max(1, Math.floor(positiveNumber('VIDEO_FFMPEG_THREADS', 1)));
const STREAMABLE_CACHE_MAX_BYTES = positiveNumber('VIDEO_CACHE_MAX_GB', 5) * 1024 ** 3;
// A killed conversion (server restart, crash) leaves its temp files behind.
const STALE_TEMP_FILE_AGE_MS = 60 * 60 * 1000;
// 25 frames = 125ms at 200fps: a seek decodes at most 24 frames before the
// target, instead of up to 199 in the camera originals.
const KEYFRAME_INTERVAL = 25;

// The server fetches whatever URL it's handed, so restrict it to S3 (where
// ball-details' presigned links point). Otherwise any caller could make this
// server request internal hosts or cloud metadata endpoints via ffmpeg.
export function parseAllowedVideoUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error('Invalid video URL'); }
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.amazonaws.com')) {
    throw new Error('Video URL host not allowed');
  }
  return u;
}

// Keyed on the S3 object path, not the full URL: ball-details re-signs the
// URLs on every fetch, so the query string changes on every page load.
function streamableKey(u: URL): string {
  return createHash('md5').update(u.origin + u.pathname).digest('hex').slice(0, 16);
}

const inFlight = new Map<string, Promise<string>>();
let activeConversions = 0;
const waitingForSlot: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeConversions < MAX_CONCURRENT_CONVERSIONS) {
    activeConversions++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waitingForSlot.push(resolve));
}

function releaseSlot() {
  const next = waitingForSlot.shift();
  if (next) next(); // hand the slot straight over, so a new caller can't jump the queue
  else activeConversions--;
}

/**
 * Returns a local path to a browser-seekable copy of the clip, converting
 * it first if needed. Concurrent requests for the same clip share one
 * conversion; different clips queue behind MAX_CONCURRENT_CONVERSIONS.
 */
export function ensureStreamable(u: URL): Promise<string> {
  const key = streamableKey(u);
  const out = join(STREAMABLE_DIR, `${key}.mp4`);

  if (existsSync(out)) {
    const now = new Date();
    try { utimesSync(out, now, now); } catch {} // mtime drives LRU eviction
    return Promise.resolve(out);
  }

  let job = inFlight.get(key);
  if (!job) {
    job = (async () => {
      await acquireSlot();
      try {
        if (existsSync(out)) return out; // finished while we waited for a slot
        removeStaleTempFiles();
        await convertToStreamable(u, out);
        evictStreamableCache(out);
        return out;
      } finally {
        releaseSlot();
      }
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  return job;
}

// Measured on a real 5s/200fps camera clip on an M1: Apple's hardware
// encoder took ~10s CPU vs ~55s for x264, at comparable quality (SSIM 0.971
// vs 0.974, 17MB vs 14MB). It only exists on macOS, so x264 covers other
// platforms and is the retry if a hardware encode session fails.
const VIDEOTOOLBOX_ENCODER = ['-c:v', 'h264_videotoolbox', '-q:v', '55', '-profile:v', 'high'];
// -bf 0: no B-frames (VideoToolbox emits none either), so the browser's
// FrameDecoder decodes each GOP in display order with no reordering delay.
const X264_ENCODER = [
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-bf', '0',
  '-keyint_min', String(KEYFRAME_INTERVAL), '-sc_threshold', '0',
];

async function convertToStreamable(u: URL, outPath: string): Promise<void> {
  mkdirSync(STREAMABLE_DIR, { recursive: true });
  const sourcePath = `${outPath}.${process.pid}.source`;
  try {
    await downloadToFile(u, sourcePath);
    if (process.platform === 'darwin') {
      try {
        return await runConversion(sourcePath, outPath, VIDEOTOOLBOX_ENCODER);
      } catch (err: any) {
        console.warn('[ffmpeg] hardware encode failed, retrying with libx264:', err.message);
      }
    }
    return await runConversion(sourcePath, outPath, X264_ENCODER);
  } finally {
    try { unlinkSync(sourcePath); } catch {}
  }
}

// Gives up if no data arrives for this long, rather than holding a conversion slot forever.
const DOWNLOAD_IDLE_TIMEOUT_MS = 30_000;

async function downloadToFile(u: URL, dest: string): Promise<void> {
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), DOWNLOAD_IDLE_TIMEOUT_MS);
  try {
    const res = await fetch(u, { signal: controller.signal });
    if (!res.ok || !res.body) throw new Error(`source download failed: HTTP ${res.status}`);
    const body = Readable.fromWeb(res.body as any);
    body.on('data', () => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), DOWNLOAD_IDLE_TIMEOUT_MS);
    });
    await pipeline(body, createWriteStream(dest));
  } catch (err) {
    try { unlinkSync(dest); } catch {}
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Probes a clip that couldn't be converted, by downloading it to a temp file first. */
export async function probeRemoteVideo(u: URL): Promise<VideoInfo> {
  mkdirSync(STREAMABLE_DIR, { recursive: true });
  const tmpPath = join(STREAMABLE_DIR, `${streamableKey(u)}.${process.pid}.${Date.now()}.probe`);
  try {
    await downloadToFile(u, tmpPath);
    return await probeVideo(tmpPath);
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
}

function runConversion(sourcePath: string, outPath: string, encoderArgs: string[]): Promise<void> {
  // Written under a temp name and renamed when complete, so a half-written
  // file is never served to a request that arrives mid-conversion.
  const partPath = `${outPath}.${process.pid}.part`;

  return new Promise((resolve, reject) => {
    ffmpegLib(sourcePath)
      .inputOptions([
        // Hardware decode where available (VideoToolbox on macOS: ~10x faster
        // than software for these HEVC 10-bit files), software otherwise.
        // VideoToolbox failed on the last frame of a test clip and dropped it —
        // accepted, as it doesn't shift any earlier frame numbers.
        '-hwaccel', 'auto',
        '-threads', String(FFMPEG_THREADS), // decoder
      ])
      .outputOptions([
        '-threads', String(FFMPEG_THREADS), // encoder
        '-map', '0:v:0',
        '-an',
        // Default timing mode duplicated the last frame on a real camera
        // clip (999 out vs 998 in); passthrough keeps output frames 1:1 with
        // the source so frame numbers match.
        '-fps_mode', 'passthrough',
        ...encoderArgs,
        '-pix_fmt', 'yuv420p', // 8-bit: browsers can't decode 10-bit H.264
        '-g', String(KEYFRAME_INTERVAL),
        '-movflags', '+faststart',
      ])
      .format('mp4')
      .output(partPath)
      .on('end', () => {
        try {
          renameSync(partPath, outPath);
          resolve();
        } catch (err) {
          reject(err);
        }
      })
      .on('error', (err, _stdout, stderr) => {
        try { unlinkSync(partPath); } catch {}
        reject(new Error(`ffmpeg convert failed: ${err.message} | stderr: ${stderr?.slice(-300)}`));
      })
      .run();
  });
}

// Only temp files older than an hour: with the slot held, nothing in this
// process is still writing to them, and a live download or conversion never
// goes that long without touching its file.
function removeStaleTempFiles() {
  let names: string[];
  try { names = readdirSync(STREAMABLE_DIR); } catch { return; }
  const cutoff = Date.now() - STALE_TEMP_FILE_AGE_MS;
  for (const name of names) {
    if (!/\.(part|source|probe)$/.test(name)) continue;
    const path = join(STREAMABLE_DIR, name);
    try {
      if (statSync(path).mtimeMs < cutoff) unlinkSync(path);
    } catch {}
  }
}

function evictStreamableCache(keep: string) {
  let entries: { path: string; size: number; mtime: number }[];
  try {
    entries = readdirSync(STREAMABLE_DIR)
      .filter((f) => f.endsWith('.mp4'))
      .map((f) => {
        const path = join(STREAMABLE_DIR, f);
        const st = statSync(path);
        return { path, size: st.size, mtime: st.mtimeMs };
      });
  } catch {
    return;
  }

  let total = entries.reduce((sum, e) => sum + e.size, 0);
  entries.sort((a, b) => a.mtime - b.mtime);
  for (const e of entries) {
    if (total <= STREAMABLE_CACHE_MAX_BYTES) break;
    if (e.path === keep) continue;
    try {
      unlinkSync(e.path); // safe even mid-stream: open file handles keep reading the unlinked data
      total -= e.size;
    } catch {}
  }
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
