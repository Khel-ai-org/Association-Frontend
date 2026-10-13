/**
 * FrameDecoder
 *
 * Decodes an in-memory MP4 in the browser (WebCodecs) and keeps a window of
 * decoded frames around the playhead, so stepping and scrubbing draw
 * straight from memory instead of seeking a <video> element (which takes a
 * round trip and briefly has no frame to show). It's the old "extract every
 * frame" approach moved from the server to the viewer's machine: the server
 * does no per-view work, and the browser uses its hardware decoder where
 * available.
 *
 * Decodes one GOP (keyframe up to the next keyframe) at a time — every frame
 * in a GOP depends on its keyframe, so a GOP is the cheapest unit — and
 * prefetches the neighbouring GOPs in the direction of travel. Assumes closed
 * GOPs, which is what ensureStreamable() produces.
 */

import type { Mp4VideoTrack } from './mp4Index';

type StoredFrame =
  | { kind: 'bitmap'; bitmap: ImageBitmap; bytes: number }
  | { kind: 'yuv'; data: Uint8Array; init: VideoFrameBufferInit; bytes: number };

// Shared by every live decoder (split view has two), so total memory stays
// bounded: ~60 full-HD frames for one camera, ~30 each for two. Frames are
// kept as GPU bitmaps (~8 MB at 1080p): measured in Chrome on an M1,
// hardware decode + bitmap ran at 512 frames/s vs 188 for copying frames out
// to compact (~3 MB) YUV buffers — that readback was the bottleneck.
const TOTAL_MEMORY_BUDGET_BYTES = 512 * 1024 * 1024;
let liveDecoders = 0;

export class FrameDecoder {
  static async create(
    bytes: Uint8Array,
    track: Mp4VideoTrack,
    onFrame: (frameIndex: number) => void,
  ): Promise<FrameDecoder | null> {
    if (typeof VideoDecoder === 'undefined') return null;
    const config: VideoDecoderConfig = {
      codec: track.codec,
      codedWidth: track.codedWidth,
      codedHeight: track.codedHeight,
      description: track.description,
      optimizeForLatency: true,
    };
    try {
      const { supported } = await VideoDecoder.isConfigSupported(config);
      if (!supported) return null;
      return new FrameDecoder(bytes, track, config, onFrame);
    } catch {
      return null;
    }
  }

  /** Set once decoding has broken; the player falls back to seeking its <video>. */
  failed = false;

  private bytes: Uint8Array;
  private track: Mp4VideoTrack;
  private onFrame: (frameIndex: number) => void;
  private decoder: VideoDecoder;
  private frameByTimestamp = new Map<number, number>();
  private gopByFrame: Int32Array;
  private framesInGop: number[];

  private frames = new Map<number, StoredFrame>();
  private usedBytes = 0;
  private bytesPerFrame: number;
  private decodedGops = new Set<number>();
  private pendingStores: Promise<void>[] = [];

  private target = 0;
  private direction: 1 | -1 = 1;
  private pumping = false;
  private destroyed = false;

  private constructor(
    bytes: Uint8Array,
    track: Mp4VideoTrack,
    config: VideoDecoderConfig,
    onFrame: (frameIndex: number) => void,
  ) {
    this.bytes = bytes;
    this.track = track;
    this.onFrame = onFrame;
    this.bytesPerFrame = track.codedWidth * track.codedHeight * 4;
    liveDecoders++;

    this.gopByFrame = new Int32Array(track.sampleByFrame.length);
    this.framesInGop = new Array(track.keySamples.length).fill(0);
    let gop = 0;
    for (let i = 0; i < track.samples.length; i++) {
      if (gop + 1 < track.keySamples.length && i >= track.keySamples[gop + 1]) gop++;
      const sample = track.samples[i];
      if (sample.frameIndex < 0) continue;
      this.gopByFrame[sample.frameIndex] = gop;
      this.framesInGop[gop]++;
      this.frameByTimestamp.set(sample.timestampUs, sample.frameIndex);
    }

    this.decoder = new VideoDecoder({
      output: (frame) => this.onOutput(frame),
      error: (err) => {
        if (this.destroyed) return;
        this.failed = true;
        console.warn('[FrameDecoder] decoder error:', err);
      },
    });
    this.decoder.configure(config);
  }

  has(frameIndex: number): boolean {
    return this.frames.has(frameIndex);
  }

  /** Draws the frame if it's decoded; returns false (drawing nothing) if not. */
  draw(ctx: CanvasRenderingContext2D, frameIndex: number, width: number, height: number): boolean {
    const stored = this.frames.get(frameIndex);
    if (!stored) return false;
    if (stored.kind === 'bitmap') {
      ctx.drawImage(stored.bitmap, 0, 0, width, height);
    } else {
      const frame = new VideoFrame(stored.data, stored.init);
      try {
        ctx.drawImage(frame, 0, 0, width, height);
      } finally {
        frame.close();
      }
    }
    return true;
  }

  /** Moves the decode window: the target's GOP first, then neighbours toward `direction`. */
  setTarget(frameIndex: number, direction: 1 | -1) {
    this.target = Math.max(0, Math.min(frameIndex, this.gopByFrame.length - 1));
    this.direction = direction;
    void this.pump();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    liveDecoders--;
    if (this.decoder.state !== 'closed') this.decoder.close();
    for (const frameIndex of [...this.frames.keys()]) this.release(frameIndex);
  }

  private budget(): number {
    return TOTAL_MEMORY_BUDGET_BYTES / Math.max(1, liveDecoders);
  }

  private gopBytes(gop: number): number {
    return this.framesInGop[gop] * this.bytesPerFrame;
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        if (this.failed || this.destroyed) return;
        const gop = this.nextGop();
        if (gop === null) return;
        await this.decodeGop(gop);
      }
    } catch (err) {
      if (!this.destroyed) {
        this.failed = true;
        console.warn('[FrameDecoder] decoding stopped:', err);
      }
    } finally {
      this.pumping = false;
    }
  }

  private plannedGops(): number[] {
    const gop = this.gopByFrame[this.target];
    const d = this.direction;
    return [gop, gop + d, gop - d, gop + 2 * d].filter((g) => g >= 0 && g < this.framesInGop.length);
  }

  private nextGop(): number | null {
    const plan = this.plannedGops();
    for (let k = 0; k < plan.length; k++) {
      const gop = plan[k];
      if (this.decodedGops.has(gop)) continue;
      // A GOP may evict anything ranked below it in the plan (e.g. the one
      // ahead in the direction of travel beats the one just left behind);
      // the target's own GOP is always decoded.
      const fits = this.makeRoom(this.gopBytes(gop), new Set(plan.slice(0, k + 1)));
      return fits || k === 0 ? gop : null;
    }
    return null;
  }

  // Frees frames outside `keep`, farthest from the target first, until
  // `needed` more bytes fit. Recently viewed frames stay while there's room,
  // so stepping back across a GOP boundary stays instant.
  private makeRoom(needed: number, keep: Set<number>): boolean {
    const budget = this.budget();
    if (this.usedBytes + needed <= budget) return true;
    const candidates = [...this.frames.keys()]
      .filter((i) => !keep.has(this.gopByFrame[i]))
      .sort((a, b) => Math.abs(b - this.target) - Math.abs(a - this.target));
    for (const frameIndex of candidates) {
      if (this.usedBytes + needed <= budget) break;
      this.release(frameIndex);
    }
    return this.usedBytes + needed <= budget;
  }

  private release(frameIndex: number) {
    const stored = this.frames.get(frameIndex);
    if (!stored) return;
    if (stored.kind === 'bitmap') stored.bitmap.close();
    this.usedBytes -= stored.bytes;
    this.frames.delete(frameIndex);
    this.decodedGops.delete(this.gopByFrame[frameIndex]);
  }

  private async decodeGop(gop: number) {
    const { samples, keySamples } = this.track;
    const start = keySamples[gop];
    const end = gop + 1 < keySamples.length ? keySamples[gop + 1] : samples.length;
    for (let i = start; i < end; i++) {
      const sample = samples[i];
      this.decoder.decode(new EncodedVideoChunk({
        type: sample.isKey ? 'key' : 'delta',
        timestamp: sample.timestampUs,
        duration: sample.durationUs,
        data: this.bytes.subarray(sample.offset, sample.offset + sample.size),
      }));
    }
    await this.decoder.flush();
    await Promise.all(this.pendingStores.splice(0));
    if (!this.destroyed) this.decodedGops.add(gop);
  }

  private onOutput(frame: VideoFrame) {
    const frameIndex = this.frameByTimestamp.get(frame.timestamp);
    if (this.destroyed || frameIndex === undefined || this.frames.has(frameIndex)) {
      frame.close();
      return;
    }
    this.pendingStores.push(this.store(frameIndex, frame));
  }

  // Converts the decoded frame and closes it right away: decoders (hardware
  // ones especially) hand out frames from a small pool and stall if frames
  // are held on to.
  private async store(frameIndex: number, frame: VideoFrame) {
    let stored: StoredFrame | null = null;
    try {
      const bitmap = await createImageBitmap(frame);
      stored = { kind: 'bitmap', bitmap, bytes: bitmap.width * bitmap.height * 4 };
    } catch {
      // No bitmap support for this frame — fall back to copying the pixels out below.
    }
    try {
      if (!stored && frame.format) {
        const data = new Uint8Array(frame.allocationSize());
        const layout = await frame.copyTo(data);
        // copyTo() copies only the visible rect, so the copy's coded size is the visible size.
        const width = frame.visibleRect ? frame.visibleRect.width : frame.codedWidth;
        const height = frame.visibleRect ? frame.visibleRect.height : frame.codedHeight;
        stored = {
          kind: 'yuv',
          data,
          bytes: data.byteLength,
          init: {
            format: frame.format,
            codedWidth: width,
            codedHeight: height,
            timestamp: frame.timestamp,
            layout,
            displayWidth: frame.displayWidth,
            displayHeight: frame.displayHeight,
          },
        };
      }
    } catch (err) {
      console.warn('[FrameDecoder] could not keep frame', frameIndex, err);
    } finally {
      frame.close();
    }

    if (!stored) return;
    if (this.destroyed || this.frames.has(frameIndex)) {
      if (stored.kind === 'bitmap') stored.bitmap.close();
      return;
    }
    this.frames.set(frameIndex, stored);
    this.usedBytes += stored.bytes;
    this.bytesPerFrame = stored.bytes;
    this.onFrame(frameIndex);
  }
}
