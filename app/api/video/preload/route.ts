/**
 * POST /api/video/preload
 * Body: { url: string, fps: number }
 *
 * Triggers background bulk frame extraction.
 * Equivalent of Z4's _start_extraction(clip).
 *
 * GET /api/video/preload?url={encodedUrl}
 * Returns current extraction status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { startBulkExtraction, isExtracting, frameExistsOnDisk } from '@/lib/ffmpegUtils';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body   = await req.json().catch(() => ({}));
  const rawUrl = body.url as string | undefined;
  const fps    = Number(body.fps ?? 25);

  if (!rawUrl) {
    return NextResponse.json({ error: 'url required' }, { status: 400 });
  }

  const videoUrl = decodeURIComponent(rawUrl);

  // If first frame already exists on disk, extraction is complete
  if (frameExistsOnDisk(videoUrl, 0)) {
    return NextResponse.json({ status: 'done', alreadyRunning: false });
  }

  const { alreadyRunning } = startBulkExtraction(videoUrl, fps);

  return NextResponse.json({
    status: alreadyRunning ? 'running' : 'started',
    alreadyRunning,
  });
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url');
  if (!rawUrl) {
    return NextResponse.json({ error: 'url required' }, { status: 400 });
  }

  const videoUrl = decodeURIComponent(rawUrl);
  const running  = isExtracting(videoUrl);
  const frame0   = frameExistsOnDisk(videoUrl, 0);

  return NextResponse.json({
    running,
    hasFrames: frame0,
    status: running ? 'extracting' : frame0 ? 'done' : 'not_started',
  });
}
