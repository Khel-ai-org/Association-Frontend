/**
 * Minimal MP4 sample-table reader for FrameDecoder.
 *
 * Reads only what WebCodecs needs from the first H.264 video track: the
 * decoder config (avcC) and, for every sample, where its bytes live in the
 * file, whether it's a keyframe, and its presentation time. Written for the
 * files ensureStreamable() produces (ffmpeg's mp4 muxer, closed GOPs), but
 * parses the standard boxes generically rather than assuming their offsets.
 */

export interface Mp4Sample {
  offset: number;
  size: number;
  isKey: boolean;
  timestampUs: number;
  durationUs: number;
  /** Position in presentation order (the player's frame number); -1 if trimmed by the edit list. */
  frameIndex: number;
}

export interface Mp4VideoTrack {
  codec: string;
  description: Uint8Array;
  codedWidth: number;
  codedHeight: number;
  /** Decode order. */
  samples: Mp4Sample[];
  /** frameIndex -> index into `samples`. */
  sampleByFrame: number[];
  /** Indices into `samples` of keyframes, ascending. */
  keySamples: number[];
}

interface Box {
  type: string;
  end: number;
  content: number;
}

function readBoxes(view: DataView, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = view.getUint32(pos);
    const type = String.fromCharCode(
      view.getUint8(pos + 4), view.getUint8(pos + 5), view.getUint8(pos + 6), view.getUint8(pos + 7),
    );
    let header = 8;
    if (size === 1) {
      size = Number(view.getBigUint64(pos + 8));
      header = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < header || pos + size > end) throw new Error(`Malformed MP4: box '${type}' at ${pos}`);
    boxes.push({ type, end: pos + size, content: pos + header });
    pos += size;
  }
  return boxes;
}

function find(view: DataView, parent: Box, type: string): Box | undefined {
  return readBoxes(view, parent.content, parent.end).find((b) => b.type === type);
}

function need(view: DataView, parent: Box, type: string): Box {
  const box = find(view, parent, type);
  if (!box) throw new Error(`Malformed MP4: missing '${type}'`);
  return box;
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, '0');
}

// mvhd and mdhd share this layout: v0 has 32-bit times, v1 64-bit.
function timescaleOf(view: DataView, box: Box): number {
  return view.getUint8(box.content) === 1 ? view.getUint32(box.content + 20) : view.getUint32(box.content + 12);
}

export function parseMp4VideoTrack(bytes: Uint8Array): Mp4VideoTrack {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const top = readBoxes(view, 0, bytes.byteLength);
  const moov = top.find((b) => b.type === 'moov');
  if (!moov) throw new Error('Malformed MP4: missing moov');
  const movieTimescale = timescaleOf(view, need(view, moov, 'mvhd'));

  const trak = readBoxes(view, moov.content, moov.end)
    .filter((b) => b.type === 'trak')
    .find((t) => {
      const hdlr = find(view, need(view, t, 'mdia'), 'hdlr');
      return !!hdlr && view.getUint32(hdlr.content + 8) === 0x76696465; // 'vide'
    });
  if (!trak) throw new Error('MP4 has no video track');

  const mdia = need(view, trak, 'mdia');
  const timescale = timescaleOf(view, need(view, mdia, 'mdhd'));
  const stbl = need(view, need(view, mdia, 'minf'), 'stbl');

  // ---- sample description: avc1/avc3 entry + its avcC ----
  const stsd = need(view, stbl, 'stsd');
  const entry = readBoxes(view, stsd.content + 8, stsd.end)[0];
  if (!entry || (entry.type !== 'avc1' && entry.type !== 'avc3')) {
    throw new Error(`Unsupported video codec '${entry?.type}'`);
  }
  const codedWidth = view.getUint16(entry.content + 24);
  const codedHeight = view.getUint16(entry.content + 26);
  // 78 = SampleEntry (8) + VisualSampleEntry fields (70) before child boxes
  const avcC = readBoxes(view, entry.content + 78, entry.end).find((b) => b.type === 'avcC');
  if (!avcC) throw new Error('Malformed MP4: missing avcC');
  const description = bytes.slice(avcC.content, avcC.end);
  const codec = `avc1.${hex2(description[1])}${hex2(description[2])}${hex2(description[3])}`;

  // ---- per-sample sizes ----
  const stsz = need(view, stbl, 'stsz');
  const uniformSize = view.getUint32(stsz.content + 4);
  const count = view.getUint32(stsz.content + 8);
  const sizes = new Array<number>(count);
  for (let i = 0; i < count; i++) sizes[i] = uniformSize || view.getUint32(stsz.content + 12 + 4 * i);

  // ---- decode times + durations (stts) ----
  const dts = new Array<number>(count);
  const durations = new Array<number>(count);
  const stts = need(view, stbl, 'stts');
  let s = 0;
  let t = 0;
  for (let e = 0, n = view.getUint32(stts.content + 4); e < n; e++) {
    const run = view.getUint32(stts.content + 8 + 8 * e);
    const delta = view.getUint32(stts.content + 12 + 8 * e);
    for (let k = 0; k < run && s < count; k++, s++) {
      dts[s] = t;
      durations[s] = delta;
      t += delta;
    }
  }

  // ---- composition offsets (ctts, only present with B-frames) ----
  const cts = dts.slice();
  const ctts = find(view, stbl, 'ctts');
  if (ctts) {
    s = 0;
    for (let e = 0, n = view.getUint32(ctts.content + 4); e < n; e++) {
      const run = view.getUint32(ctts.content + 8 + 8 * e);
      const offset = view.getInt32(ctts.content + 12 + 8 * e);
      for (let k = 0; k < run && s < count; k++, s++) cts[s] += offset;
    }
  }

  // ---- keyframes (no stss = every sample is a keyframe) ----
  const stss = find(view, stbl, 'stss');
  const isKey = new Array<boolean>(count).fill(!stss);
  if (stss) {
    for (let e = 0, n = view.getUint32(stss.content + 4); e < n; e++) {
      const sampleNumber = view.getUint32(stss.content + 8 + 4 * e); // 1-based
      if (sampleNumber >= 1 && sampleNumber <= count) isKey[sampleNumber - 1] = true;
    }
  }

  // ---- byte offsets: chunks (stco/co64) x samples-per-chunk (stsc) ----
  const co64 = find(view, stbl, 'co64');
  const stco = co64 ?? need(view, stbl, 'stco');
  const chunkCount = view.getUint32(stco.content + 4);
  const chunkOffset = (c: number) =>
    co64 ? Number(view.getBigUint64(co64.content + 8 + 8 * c)) : view.getUint32(stco.content + 8 + 4 * c);
  const stsc = need(view, stbl, 'stsc');
  const stscCount = view.getUint32(stsc.content + 4);
  const offsets = new Array<number>(count);
  s = 0;
  for (let e = 0; e < stscCount; e++) {
    const firstChunk = view.getUint32(stsc.content + 8 + 12 * e) - 1;
    const perChunk = view.getUint32(stsc.content + 12 + 12 * e);
    const nextFirst = e + 1 < stscCount ? view.getUint32(stsc.content + 8 + 12 * (e + 1)) - 1 : chunkCount;
    for (let c = firstChunk; c < nextFirst; c++) {
      let pos = chunkOffset(c);
      for (let k = 0; k < perChunk && s < count; k++, s++) {
        offsets[s] = pos;
        pos += sizes[s];
      }
    }
  }
  if (s !== count) throw new Error(`Malformed MP4: chunk table covers ${s} of ${count} samples`);

  // ---- edit list: where presentation starts in media time ----
  let mediaStart = 0;
  let delayUs = 0;
  const edts = find(view, trak, 'edts');
  const elst = edts && find(view, edts, 'elst');
  if (elst) {
    const v1 = view.getUint8(elst.content) === 1;
    const stride = v1 ? 20 : 12;
    for (let e = 0, n = view.getUint32(elst.content + 4); e < n; e++) {
      const at = elst.content + 8 + stride * e;
      const segmentDuration = v1 ? Number(view.getBigUint64(at)) : view.getUint32(at);
      const mediaTime = v1 ? Number(view.getBigInt64(at + 8)) : view.getInt32(at + 4);
      if (mediaTime === -1) {
        delayUs += (segmentDuration / movieTimescale) * 1e6; // empty edit: presentation starts later
        continue;
      }
      mediaStart = mediaTime;
      break;
    }
  }

  const samples: Mp4Sample[] = new Array(count);
  for (let i = 0; i < count; i++) {
    samples[i] = {
      offset: offsets[i],
      size: sizes[i],
      isKey: isKey[i],
      timestampUs: Math.round(((cts[i] - mediaStart) / timescale) * 1e6 + delayUs),
      durationUs: Math.round((durations[i] / timescale) * 1e6),
      frameIndex: -1,
    };
  }

  // Frames that end before the edit list's start are decoded but never shown.
  const shown = samples
    .map((sample, i) => ({ i, end: cts[i] + durations[i] }))
    .filter(({ end }) => end > mediaStart)
    .sort((a, b) => cts[a.i] - cts[b.i])
    .map(({ i }) => i);
  shown.forEach((sampleIndex, frameIndex) => { samples[sampleIndex].frameIndex = frameIndex; });

  const keySamples: number[] = [];
  for (let i = 0; i < count; i++) if (samples[i].isKey) keySamples.push(i);
  if (keySamples[0] !== 0) throw new Error('MP4 does not start with a keyframe');

  return { codec, description, codedWidth, codedHeight, samples, sampleByFrame: shown, keySamples };
}
