/**
 * GET /api/video/frame?url={encodedS3Url}&index={n}&fps={fps}
 *
 * Serves a JPEG for a single frame. Equivalent of Z4's:
 *   GET /api/clips/{clipId}/frame/{index}
 *
 * Lookup order:
 *   1. Frame already on disk (from bulk preload or previous on-demand) → instant
 *   2. Extract on-demand with ffmpeg → write to disk → serve (~300-800ms first time)
 *
 * After preload completes, every request hits path 1 (< 5ms).
 */

import { NextRequest, NextResponse } from 'next/server';
import { frameExistsOnDisk, readFrameFromDisk, extractSingleFrame } from '@/lib/ffmpegUtils';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const params  = req.nextUrl.searchParams;
  const rawUrl  = params.get('url');
  const index   = parseInt(params.get('index') ?? '0', 10);
  const fps     = parseFloat(params.get('fps')  ?? '25');

  if (!rawUrl) {
    return NextResponse.json({ error: 'url param required' }, { status: 400 });
  }

  const videoUrl = decodeURIComponent(rawUrl);

  // 1. Disk cache hit (bulk or prior on-demand)
  if (frameExistsOnDisk(videoUrl, index)) {
    const buf = readFrameFromDisk(videoUrl, index);
    if (buf) return jpegResponse(buf);
  }

  // 2. On-demand extraction
  try {
    const buf = await extractSingleFrame(videoUrl, index, fps);
    return jpegResponse(buf);
  } catch (err: any) {
    console.error('[frame] extraction failed:', err.message);
    return NextResponse.json(
      { error: err.message, index, fps },
      { status: 500 }
    );
  }
}

function jpegResponse(buf: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type':  'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
