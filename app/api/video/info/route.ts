/**
 * GET /api/video/info?url={encodedS3Url}
 *
 * Returns video metadata: duration, fps, frameCount, width, height.
 * Used by PlayerEngine on load (equivalent of Z4's clip.video metadata).
 */

import { NextRequest, NextResponse } from 'next/server';
import { probeVideo } from '@/lib/ffmpegUtils';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url param required' }, { status: 400 });
  }

  try {
    const info = await probeVideo(decodeURIComponent(url));
    return NextResponse.json(info, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
