/**
 * PlayerEngine
 *
 * Draws video onto a canvas so zoom/pan/rotate/filters/annotations can be
 * layered on top.
 *
 * Where the pictures come from:
 *  - The server converts each clip once into a browser-friendly H.264 file
 *    (ensureStreamable in lib/ffmpegUtils.ts); the player downloads it whole.
 *  - Paused, stepping and scrubbing: FrameDecoder decodes frames in the
 *    browser and keeps the ones around the playhead in memory, so a step is
 *    an instant draw — like the old server-extracted JPEG frames, but with no
 *    per-view server work.
 *  - Playback: a hidden native <video> playing the same downloaded bytes.
 *    Speeds the browser can't play natively, and reverse, step through
 *    decoded frames instead.
 * Without WebCodecs (or if conversion failed) everything falls back to
 * seeking the <video>.
 *
 * `frame` is the index of the frame on screen. Mapping to and from time
 * assumes constant frame rate — verified on the real camera files (every
 * frame exactly 5 ms apart at 200 fps).
 */

import { AnnotationLayer } from './AnnotationLayer';
import { FrameDecoder } from './FrameDecoder';
import { parseMp4VideoTrack, type Mp4VideoTrack } from './mp4Index';

export const SPEEDS = [0.05, 0.1, 0.25, 0.5, 1, 1.5, 2, 4];

// -------------------------------------------------------------------- //
// Types                                                                 //
// -------------------------------------------------------------------- //

export interface VideoInfo {
  duration:   number;
  width:      number;
  height:     number;
  fps:        number;
  frameCount: number;
}

export interface PlayerState {
  frame:          number;
  frameCount:     number;
  currentTime:    number;
  duration:       number;
  playing:        boolean;
  speed:          number;
  direction:      number;
  fps:            number;
  timecode:       string;
  zoom:           number;
  cacheHitRate:   number;
  preloadStatus:  'idle' | 'extracting' | 'done';
}

export interface ViewState {
  zoom:    number;
  panX:    number;
  panY:    number;
  rotate:  number;
  mirrorH: boolean;
  flipV:   boolean;
  fit:     boolean;
  aspect:  number;
}

export interface FilterState {
  brightness: number;
  contrast:   number;
  saturate:   number;
}

/** Payload of the 'loading' event while loadVideo() is in progress. */
export interface LoadProgress {
  phase:   'preparing' | 'downloading';
  loaded?: number;
  total?:  number;
}

// -------------------------------------------------------------------- //
// Defaults                                                              //
// -------------------------------------------------------------------- //

const DEFAULT_VIEW: ViewState = {
  zoom: 1, panX: 0, panY: 0, rotate: 0,
  mirrorH: false, flipV: false, fit: true, aspect: 1,
};

const DEFAULT_FILTERS: FilterState = {
  brightness: 1, contrast: 1, saturate: 1,
};

const FALLBACK_FPS = 25;

// While the <video> is playing, a seek to within this many frames of where
// it already is (e.g. keeping the second camera in sync) is ignored rather
// than interrupting playback with a real seek.
const NATIVE_DRIFT_TOLERANCE = 2;

// -------------------------------------------------------------------- //
// Engine                                                                //
// -------------------------------------------------------------------- //

export class PlayerEngine {
  // ---- canvas ----
  private canvas: HTMLCanvasElement;
  private ctx:    CanvasRenderingContext2D | null;

  // ---- picture sources ----
  private video: HTMLVideoElement; // never attached to the DOM
  private frames: FrameDecoder | null = null;
  private blobUrl: string | null = null;

  // ---- annotation layer ----
  public annotations: AnnotationLayer = new AnnotationLayer();

  // ---- video info ----
  public videoInfo: VideoInfo | null = null;
  private videoUrl: string = '';
  public  isReady = false;

  // ---- playback state ----
  public frame:     number = 0;
  public playing:   boolean = false;
  public speed:     number = 1;
  public direction: number = 1;
  public loop:      boolean = false;
  /** True while playback runs on the <video> element's own clock. */
  private native = false;

  // ---- view & filters ----
  public view:    ViewState   = { ...DEFAULT_VIEW };
  public filters: FilterState = { ...DEFAULT_FILTERS };

  // ---- kept for UI/type compatibility — no extraction step exists anymore ----
  public preloadStatus: 'idle' | 'extracting' | 'done' = 'idle';

  // ---- internals ----
  private listeners: Map<string, Set<Function>> = new Map();
  private loadToken = 0;
  private painted = false; // whether the canvas currently shows a picture
  private _lastTime:   number = 0;
  private _acc:        number = 0;
  private _raf:        number | null = null;
  private _needsRender = true;
  private _resizeObserver: ResizeObserver;
  public  cssWidth  = 0;
  public  cssHeight = 0;
  public  dpr       = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    this.video = document.createElement('video');
    this.video.muted       = true; // the old JPEG-frame player had no audio either
    this.video.playsInline = true;
    this.video.preload     = 'auto';
    this.video.addEventListener('seeked', () => this.invalidate());
    this.video.addEventListener('ended', () => {
      if (this.playing && this.native && !this.loop) this.pause();
    });

    this.annotations.onChange = () => this.invalidate();

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas.parentElement ?? canvas);

    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
  }

  // ================================================================== //
  // Events                                                              //
  // ================================================================== //

  on(name: string, fn: Function) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(fn);
    return () => this.listeners.get(name)?.delete(fn);
  }

  private emit(name: string, payload?: any) {
    this.listeners.get(name)?.forEach(fn => fn(payload, this));
  }

  // ================================================================== //
  // Source loading                                                      //
  //                                                                     //
  // 1. /api/video/info converts the clip on its first request (one-time,  //
  //    shared by every later viewer) and reports fps/frame count.        //
  // 2. Download the converted file whole, index its frames, and hand the //
  //    bytes to both FrameDecoder and the <video> (as a blob URL, so its //
  //    seeks never wait on the network).                                 //
  // If conversion failed, info says `streamable: false` and the raw S3   //
  // file is streamed instead — slower seeking, but it still plays.       //
  // ================================================================== //

  async loadVideo(url: string): Promise<void> {
    const token = ++this.loadToken;
    this.pause();
    this.releaseSource();
    this.isReady       = false;
    this.frame         = 0;
    this.videoUrl      = url;
    this.preloadStatus = 'idle';
    this.invalidate();
    this.emit('loading', { phase: 'preparing' } satisfies LoadProgress);

    const query = `url=${encodeURIComponent(url)}`;
    let info: (VideoInfo & { streamable?: boolean }) | null = null;
    try {
      const res = await fetch(`/api/video/info?${query}`);
      if (res.ok) info = await res.json();
    } catch {
      // server unreachable — stream the raw file with browser-reported metadata below
    }
    if (token !== this.loadToken) return; // a newer loadVideo() took over

    let src = url;
    let bytes: Uint8Array<ArrayBuffer> | null = null;
    let track: Mp4VideoTrack | null = null;
    if (info?.streamable) {
      src = `/api/video/stream?${query}`;
      try {
        bytes = await this.download(src, token);
        track = parseMp4VideoTrack(bytes);
      } catch (err) {
        if (token !== this.loadToken) return;
        console.warn('[PlayerEngine] in-browser frame decoding unavailable, streaming instead:', err);
        bytes = null;
        track = null;
      }
    }
    if (token !== this.loadToken) return;

    if (bytes) {
      this.blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
      src = this.blobUrl;
    }
    this.video.src = src;
    this.video.load();
    const loaded = this.waitForLoadedData();

    const decoder = bytes && track
      ? await FrameDecoder.create(bytes, track, (i) => { if (i === this.frame) this.invalidate(); })
      : null;
    if (token !== this.loadToken) {
      decoder?.destroy();
      return;
    }
    this.frames = decoder;

    await loaded;
    if (token !== this.loadToken) return;

    const fps        = info?.fps || FALLBACK_FPS;
    const duration   = info?.duration ?? this.video.duration ?? 0;
    const width      = info?.width  ?? this.video.videoWidth  ?? 1280;
    const height     = info?.height ?? this.video.videoHeight ?? 720;
    const frameCount = track?.sampleByFrame.length ?? info?.frameCount ?? Math.max(1, Math.round(duration * fps));

    this.videoInfo = { duration, width, height, fps, frameCount };
    this.view      = { ...DEFAULT_VIEW };
    this.resize();

    this.isReady       = true;
    this.preloadStatus = 'done';
    this.frames?.setTarget(0, 1);
    this.emit('clip', this.state());
    this.invalidate();
  }

  private async download(url: string, token: number): Promise<Uint8Array<ArrayBuffer>> {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
    const total = Number(res.headers.get('Content-Length')) || 0;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    let lastPercent = -1;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (token !== this.loadToken) {
        void reader.cancel();
        throw new Error('superseded by a newer load');
      }
      chunks.push(value);
      loaded += value.byteLength;
      const percent = total ? Math.floor((loaded / total) * 100) : -1;
      if (percent !== lastPercent) {
        lastPercent = percent;
        this.emit('loading', { phase: 'downloading', loaded, total } satisfies LoadProgress);
      }
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }

  private waitForLoadedData(): Promise<void> {
    return new Promise((resolve, reject) => {
      const video = this.video;
      const onLoaded = () => { cleanup(); resolve(); };
      const onError  = () => { cleanup(); reject(new Error(`Failed to load video: ${video.error?.message || 'unknown error'}`)); };
      const cleanup  = () => {
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('loadeddata', onLoaded, { once: true });
      video.addEventListener('error', onError, { once: true });
    });
  }

  private releaseSource() {
    this.frames?.destroy();
    this.frames = null;
    // Detach before revoking, so the element doesn't try to read a dead blob URL.
    this.video.removeAttribute('src');
    this.video.load();
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }

  // ================================================================== //
  // Getters                                                             //
  // ================================================================== //

  get frameCount(): number { return this.videoInfo?.frameCount ?? 0; }
  get fps():        number { return this.videoInfo?.fps ?? FALLBACK_FPS; }
  get lastFrame():  number { return Math.max(0, this.frameCount - 1); }

  private videoFrameIndex(): number {
    return Math.max(0, Math.min(this.lastFrame, Math.floor(this.video.currentTime * this.fps)));
  }

  // Aim at the middle of the frame's display interval, not its start: e.g.
  // 3/200 is stored as 0.01499999…, which would land on frame 2.
  private setVideoFrame(frame: number) {
    this.video.currentTime = Math.min(this.videoInfo?.duration ?? 0, (frame + 0.5) / this.fps);
  }

  // ================================================================== //
  // Transport controls                                                  //
  // ================================================================== //

  play(direction = this.direction) {
    if (!this.isReady) return;
    if (this.playing && this.native) this.frame = this.videoFrameIndex();
    this.direction = direction >= 0 ? 1 : -1;
    this.playing   = true;
    this._lastTime = performance.now();
    this._acc      = 0;

    this.native = this.direction === 1 && this.trySetPlaybackRate(this.speed);
    if (this.native) {
      if (this.video.seeking || this.videoFrameIndex() !== this.frame) this.setVideoFrame(this.frame);
      this.video.play().catch(() => {
        // Rejected (e.g. decode error); if we still mean to play, step through frames instead.
        if (this.playing && this.native) this.native = false;
      });
    } else {
      this.video.pause();
    }
    this.emit('transport', this.state());
  }

  pause() {
    const wasNative = this.playing && this.native;
    this.playing = false;
    this.native  = false;
    this.video.pause();
    if (wasNative && this.isReady) {
      this.frame = this.videoFrameIndex();
      this.frames?.setTarget(this.frame, this.direction >= 0 ? 1 : -1);
    }
    this.emit('transport', this.state());
    this.invalidate();
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  setSpeed(speed: number) {
    this.speed = speed;
    if (this.playing) this.play(this.direction); // re-picks native vs. frame-stepping for the new rate
    else this.emit('transport', this.state());
    this.invalidate();
  }

  nudgeSpeed(delta: number) {
    const i = SPEEDS.indexOf(this.speed);
    const next = i < 0 ? SPEEDS.indexOf(1) : Math.min(SPEEDS.length - 1, Math.max(0, i + delta));
    this.setSpeed(SPEEDS[next]);
  }

  seek(targetFrame: number, emit = true) {
    if (!this.isReady) return;
    const next = Math.min(this.lastFrame, Math.max(0, Math.round(targetFrame)));

    if (this.playing && this.native) {
      if (Math.abs(next - this.videoFrameIndex()) > NATIVE_DRIFT_TOLERANCE) {
        this.setVideoFrame(next);
        this.frame = next;
      }
      if (emit) this.emit('seek', this.state());
      this.invalidate();
      return;
    }

    if (next === this.frame) { this.invalidate(); return; }
    this.showFrame(next, next > this.frame ? 1 : -1);
    if (emit) this.emit('seek', this.state());
    this.invalidate();
  }

  step(count = 1) { this.pause(); this.seek(this.frame + count); }

  private showFrame(next: number, direction: 1 | -1) {
    this.frame = next;
    const decoding = !!this.frames && !this.frames.failed;
    if (decoding) this.frames!.setTarget(next, direction);
    // Not decoded yet (a far jump, or the decoder still starting up): seek the
    // <video> as well, and render shows whichever has the frame first.
    if (!decoding || !this.frames!.has(next)) this.setVideoFrame(next);
  }

  private trySetPlaybackRate(rate: number): boolean {
    try {
      this.video.playbackRate = rate;
      return this.video.playbackRate === rate;
    } catch {
      return false; // e.g. Chrome rejects rates below 0.0625
    }
  }

  // ================================================================== //
  // View controls                                                       //
  // ================================================================== //

  setZoom(zoom: number) {
    this.view.fit  = false;
    this.view.zoom = Math.min(24, Math.max(0.05, zoom));
    this.emit('view', this.view);
    this.invalidate();
  }

  panBy(dx: number, dy: number) {
    this.view.panX += dx;
    this.view.panY += dy;
    this.view.fit   = false;
    this.invalidate();
  }

  fitToWindow() {
    this.view = { ...DEFAULT_VIEW, fit: true };
    this.emit('view', this.view);
    this.invalidate();
  }

  setFilter(name: keyof FilterState, value: number) {
    this.filters[name] = value;
    this.invalidate();
  }

  // ================================================================== //
  // State snapshot                                                      //
  // ================================================================== //

  state(): PlayerState {
    const fps         = this.fps;
    const currentTime = this.frame / fps;
    return {
      frame:         this.frame,
      frameCount:    this.frameCount,
      currentTime,
      duration:      this.frameCount / fps,
      playing:       this.playing,
      speed:         this.speed,
      direction:     this.direction,
      fps,
      timecode:      formatTimecode(currentTime),
      zoom:          this.effectiveScale(),
      cacheHitRate:  1, // no server frame cache in this architecture
      preloadStatus: this.preloadStatus,
    };
  }

  // ================================================================== //
  // View math — unchanged: still just canvas transform arithmetic       //
  // ================================================================== //

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr    = window.devicePixelRatio || 1;
    const width  = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    if (width === this.cssWidth && height === this.cssHeight && dpr === this.dpr) return;
    this.canvas.width  = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.cssWidth  = width;
    this.cssHeight = height;
    this.dpr       = dpr;
    this.painted   = false; // resizing a canvas clears it
    this.invalidate();
  }

  private imageSize() {
    const rotated = this.view.rotate === 90 || this.view.rotate === 270;
    const w = this.videoInfo?.width  ?? 1280;
    const h = this.videoInfo?.height ?? 720;
    return rotated
      ? { w: h, h: w, rawW: w, rawH: h }
      : { w,         h,         rawW: w, rawH: h };
  }

  private fitScale() {
    const { w, h } = this.imageSize();
    return Math.min(
      (this.cssWidth  || 1) / (w * this.view.aspect),
      (this.cssHeight || 1) / h,
    );
  }

  effectiveScale(): number {
    return this.view.fit ? this.fitScale() : this.view.zoom;
  }

  private _transform(): DOMMatrix {
    const scale = this.effectiveScale();
    const { rawW, rawH } = this.imageSize();
    const m = new DOMMatrix();
    m.translateSelf(
      (this.cssWidth  || 0) / 2 + this.view.panX,
      (this.cssHeight || 0) / 2 + this.view.panY,
    );
    m.rotateSelf(this.view.rotate);
    m.scaleSelf(
      scale * this.view.aspect * (this.view.mirrorH ? -1 : 1),
      scale                    * (this.view.flipV   ? -1 : 1),
    );
    m.translateSelf(-rawW / 2, -rawH / 2);
    return m;
  }

  screenToNormalizedPoint(screenX: number, screenY: number): { x: number; y: number } {
    const { rawW, rawH } = this.imageSize();
    const inv = this._transform().inverse();
    const pt = new DOMPoint(screenX, screenY).matrixTransform(inv);
    return {
      x: Math.max(0, Math.min(1, pt.x / (rawW || 1))),
      y: Math.max(0, Math.min(1, pt.y / (rawH || 1))),
    };
  }

  invalidate() { this._needsRender = true; }

  // ================================================================== //
  // Animation tick                                                      //
  // ================================================================== //

  private _tick(now: number) {
    this._raf = requestAnimationFrame(this._tick);

    if (this.playing && this.isReady) {
      if (this.native) this.tickNative();
      else this.tickManual(now);
      this._needsRender = true;
    }
    this._lastTime = now;

    // render() returns false when there's nothing new to show yet; try again next frame.
    if (this._needsRender) this._needsRender = !this.render();
  }

  private tickNative() {
    const v = this.video;
    if (v.ended || v.currentTime >= (this.videoInfo?.duration ?? Infinity)) {
      if (this.loop) {
        this.setVideoFrame(0);
        v.play().catch(() => {});
      } else {
        this.pause();
      }
      return;
    }
    if (v.seeking) return;
    const live = this.videoFrameIndex();
    if (live !== this.frame) {
      this.frame = live;
      this.emit('tick', this.state());
    }
  }

  // Reverse, and speeds the <video> can't play: advance through decoded frames on a wall clock.
  private tickManual(now: number) {
    const dt = Math.min(0.25, (now - this._lastTime) / 1000);
    this._acc += dt * this.fps * this.speed * this.direction;
    if (Math.abs(this._acc) < 1) return;

    const direction: 1 | -1 = this.direction >= 0 ? 1 : -1;
    const advance = Math.trunc(this._acc);
    let next = this.frame + advance;
    if (next > this.lastFrame || next < 0) {
      if (!this.loop) {
        this._acc = 0;
        const end = Math.max(0, Math.min(this.lastFrame, next));
        if (end !== this.frame) this.showFrame(end, direction);
        this.pause();
        return;
      }
      next = next > this.lastFrame ? 0 : this.lastFrame;
    }

    // Keep pace with the decoder rather than skipping frames it hasn't produced yet.
    if (this.frames && !this.frames.failed && !this.frames.has(next)) {
      this.frames.setTarget(next, direction);
      this._acc = Math.sign(this._acc);
      return;
    }

    this._acc -= advance;
    this.showFrame(next, direction);
    this.emit('seek', this.state());
  }

  // ================================================================== //
  // Render                                                              //
  // ================================================================== //

  private pictureSource(): 'frames' | 'video' | null {
    const v = this.video;
    const videoReady = v.readyState >= 2 && !v.seeking; // HAVE_CURRENT_DATA, not mid-seek
    if (this.playing && this.native) return videoReady ? 'video' : null;
    if (this.frames?.has(this.frame)) return 'frames';
    if (videoReady && this.videoFrameIndex() === this.frame) return 'video';
    return null;
  }

  /** Returns false if the frame to show isn't available yet (the canvas is left untouched). */
  private render(): boolean {
    const ctx = this.ctx;
    if (!ctx) return true;

    const source = this.isReady ? this.pictureSource() : null;
    // A frame still decoding, or the <video> mid-seek: keep the previous
    // picture on screen instead of clearing to black (the old flicker).
    if (source === null && this.isReady && this.painted) return false;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    if (!this.isReady) {
      ctx.restore();
      this.painted = false;
      return true;
    }

    const matrix = this._transform();
    ctx.setTransform(
      matrix.a * this.dpr, matrix.b * this.dpr,
      matrix.c * this.dpr, matrix.d * this.dpr,
      matrix.e * this.dpr, matrix.f * this.dpr,
    );

    const { rawW, rawH } = this.imageSize();
    const scale = this.effectiveScale() || 1;

    if (source) {
      ctx.save();
      ctx.filter = [
        `brightness(${this.filters.brightness})`,
        `contrast(${this.filters.contrast})`,
        `saturate(${this.filters.saturate})`,
      ].join(' ');
      ctx.imageSmoothingEnabled = scale < 2;
      if (source === 'frames') this.frames?.draw(ctx, this.frame, rawW, rawH);
      else ctx.drawImage(this.video, 0, 0, rawW, rawH);
      ctx.restore();
      this.painted = true;
    }

    this.annotations.render(ctx, rawW, rawH, (n: number) => n / scale);

    ctx.restore();
    this.emit('render', this.frame);
    return true;
  }

  // ================================================================== //
  // Cleanup                                                             //
  // ================================================================== //

  destroy() {
    this.loadToken++; // abandons any loadVideo() still in flight
    if (this._raf) cancelAnimationFrame(this._raf);
    this._resizeObserver.disconnect();
    this.video.pause();
    this.releaseSource();
    this.isReady = false;
  }
}

// -------------------------------------------------------------------- //
// Timecode helper                                                       //
// -------------------------------------------------------------------- //

export function formatTimecode(seconds: number): string {
  const total = Math.max(0, seconds);
  const m   = Math.floor(total / 60);
  const s   = Math.floor(total % 60);
  const ms  = Math.floor((total % 1) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
