/**
 * GET /api/video/stream?url={encodedS3Url}
 *
 * Serves the browser-seekable copy of a clip (see ensureStreamable) with
 * HTTP Range support — the <video> element seeks by requesting byte ranges,
 * so without 206 responses every seek would re-download from the start.
 */

import { NextRequest } from 'next/server';
import { createReadStream, statSync } from 'fs';
import { Readable } from 'stream';
import { parseAllowedVideoUrl, ensureStreamable } from '@/lib/ffmpegUtils';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) {
    return Response.json({ error: 'url param required' }, { status: 400 });
  }

  let src: URL;
  try {
    src = parseAllowedVideoUrl(raw);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 400 });
  }

  let path: string;
  try {
    path = await ensureStreamable(src);
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 502 });
  }

  const size = statSync(path).size;
  const headers: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  };

  const range = req.headers.get('range');
  if (!range) {
    headers['Content-Length'] = String(size);
    return new Response(toWebStream(createReadStream(path)), { status: 200, headers });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || (match[1] === '' && match[2] === '')) {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
  }

  let start: number;
  let end: number;
  if (match[1] === '') {
    // "bytes=-N" means the last N bytes
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }

  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
  }

  headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  headers['Content-Length'] = String(end - start + 1);
  return new Response(toWebStream(createReadStream(path, { start, end })), { status: 206, headers });
}

// Node's web ReadableStream type and the DOM one Response expects are the
// same thing at runtime but distinct to TypeScript.
function toWebStream(stream: Readable): ReadableStream {
  return Readable.toWeb(stream) as unknown as ReadableStream;
}
