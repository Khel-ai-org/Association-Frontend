/**
 * GET /api/video/info?url={encodedS3Url}
 *
 * Ensures a browser-seekable copy of the clip exists (converting it on the
 * first request — see ensureStreamable), then returns its metadata:
 * duration, fps, frameCount, width, height, plus `streamable`.
 *
 * If conversion fails, falls back to probing the raw source with
 * `streamable: false`, so the player can still stream the original file
 * directly with the right fps instead of failing outright.
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseAllowedVideoUrl, ensureStreamable, probeVideo, probeRemoteVideo } from '@/lib/ffmpegUtils';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) {
    return NextResponse.json({ error: 'url param required' }, { status: 400 });
  }

  let src: URL;
  try {
    src = parseAllowedVideoUrl(raw);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  try {
    const info = await probeVideo(await ensureStreamable(src));
    return NextResponse.json(
      { ...info, streamable: true },
      { headers: { 'Cache-Control': 'private, max-age=3600' } },
    );
  } catch (convertErr: any) {
    console.error('[video/info] conversion failed, probing raw source instead:', convertErr.message);
    try {
      const info = await probeRemoteVideo(src);
      return NextResponse.json(
        { ...info, streamable: false },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }
}
