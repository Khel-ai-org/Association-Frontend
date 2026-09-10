/**
 * PlayerEngine
 *
 * 1:1 port of Ball-tracker-Z4's player.js Player class.
 *
 * Architecture now matches Z4 exactly:
 *   Z4:  browser fetches JPEG from  /api/clips/{id}/frame/{index}
 *   Ours: browser fetches JPEG from /api/video/frame?url=...&index=...
 *
 *   Z4:  Python _start_extraction() pre-extracts all frames to disk
 *   Ours: POST /api/video/preload  pre-extracts all frames to disk
 *
 *   Z4:  FrameSource (frames.js)   → our FrameCache (FrameCache.ts)
 *   Z4:  Player     (player.js)    → our PlayerEngine (PlayerEngine.ts)
 */

import { FrameCache } from './FrameCache';
import { AnnotationLayer } from './AnnotationLayer';

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

// -------------------------------------------------------------------- //
// Engine                                                                //
// -------------------------------------------------------------------- //

export class PlayerEngine {
  // ---- canvas ----
  private canvas: HTMLCanvasElement;
  private ctx:    CanvasRenderingContext2D | null;

  // ---- frame cache (like Z4's FrameSource) ----
  public cache: FrameCache = new FrameCache();

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

  // ---- view & filters ----
  public view:    ViewState   = { ...DEFAULT_VIEW };
  public filters: FilterState = { ...DEFAULT_FILTERS };

  // ---- preload status ----
  public preloadStatus: 'idle' | 'extracting' | 'done' = 'idle';

  // ---- internals ----
  private listeners: Map<string, Set<Function>> = new Map();
  private _lastTime:   number = 0;
  private _acc:        number = 0;
  private _raf:        number | null = null;
  private _needsRender = true;
  private _lastValidImg: HTMLImageElement | null = null;
  private _resizeObserver: ResizeObserver;
  public  cssWidth  = 0;
  public  cssHeight = 0;
  public  dpr       = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

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
  // Source loading — equivalent of Z4's setClip()                      //
  //                                                                     //
  // Step 1: GET /api/video/info   → get frameCount, fps, dimensions    //
  // Step 2: init FrameCache with  videoUrl + fps                        //
  // Step 3: POST /api/video/preload → start background extraction       //
  // Step 4: prefetch first window → player is usable immediately        //
  // ================================================================== //

  async loadVideo(url: string): Promise<void> {
    this.pause();
    this.isReady       = false;
    this.frame         = 0;
    this._acc          = 0;
    this.videoUrl      = url;
    this.preloadStatus = 'idle';
    this._lastValidImg = null;
    this.cache.clear();

    // ---- Step 1: probe metadata via ffprobe ----
    const res  = await fetch(`/api/video/info?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`Failed to probe video: ${res.statusText}`);
    const info: VideoInfo = await res.json();

    this.videoInfo = info;
    this.view      = { ...DEFAULT_VIEW };
    this.resize();

    // ---- Step 2: init FrameCache ----
    this.cache.init(url, info.frameCount, info.fps);
    this.isReady = true;
    this.emit('clip', this.state());

    // ---- Step 3: warm first frames so player is usable immediately ----
    // (same as Z4: source.load(0).then(() => this.invalidate()); source.prefetch(0))
    this.cache.load(0).then(() => this.invalidate()).catch(() => {});
    this.cache.prefetch(0, { ahead: 48, behind: 0, direction: 1 });
    this.invalidate();

    // ---- Step 4: trigger background bulk extraction (non-blocking) ----
    // This is the equivalent of Z4's _start_extraction(clip).
    // After it completes, ALL frame requests are served from disk (< 5ms each).
    this._startPreload(url, info.fps);
  }

  private _startPreload(url: string, fps: number) {
    this.preloadStatus = 'extracting';
    this.emit('preload', { status: 'extracting' });

    fetch('/api/video/preload', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url, fps }),
    }).then(res => res.json()).then((data) => {
      if (data.status === 'done') {
        this.preloadStatus = 'done';
        this.emit('preload', { status: 'done' });
      } else {
        // Poll until extraction completes
        this._pollPreload(url);
      }
    }).catch(() => {
      this.preloadStatus = 'done'; // fail gracefully — on-demand still works
      this.emit('preload', { status: 'done' });
    });
  }

  private _pollPreload(url: string) {
    const check = () => {
      if (!this.isReady || this.videoUrl !== url) return;
      fetch(`/api/video/preload?url=${encodeURIComponent(url)}`)
        .then(r => r.json())
        .then((data) => {
          if (data.status === 'done') {
            this.preloadStatus = 'done';
            this.emit('preload', { status: 'done' });
          } else if (data.status === 'extracting') {
            setTimeout(check, 2000); // poll every 2s
          }
        })
        .catch(() => {});
    };
    setTimeout(check, 2000);
  }

  // ================================================================== //
  // Getters                                                             //
  // ================================================================== //

  get frameCount(): number { return this.cache.frameCount; }
  get fps():        number { return this.cache.fps || 25; }
  get lastFrame():  number { return Math.max(0, this.frameCount - 1); }

  // ================================================================== //
  // Transport controls — exact Z4 player.js methods                    //
  // ================================================================== //

  play(direction = this.direction) {
    if (!this.isReady) return;
    this.direction = direction >= 0 ? 1 : -1;
    this.playing   = true;
    this._lastTime = performance.now();
    this._acc      = 0;
    this.emit('transport', this.state());
  }

  pause() {
    this.playing = false;
    this.emit('transport', this.state());
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  setSpeed(speed: number) {
    this.speed = speed;
    this.emit('transport', this.state());
    this.invalidate();
  }

  nudgeSpeed(delta: number) {
    const i = SPEEDS.indexOf(this.speed);
    const next = i < 0 ? SPEEDS.indexOf(1) : Math.min(SPEEDS.length - 1, Math.max(0, i + delta));
    this.setSpeed(SPEEDS[next]);
  }

  // Z4 seek() — exact logic
  seek(targetFrame: number, emit = true) {
    if (!this.isReady) return;
    const next = Math.min(this.lastFrame, Math.max(0, Math.round(targetFrame)));
    if (next === this.frame) { this.invalidate(); return; }
    this.frame = next;
    this._acc  = 0;
    this.cache.prefetch(next, { direction: this.direction });
    if (emit) this.emit('seek', this.state());
    this.invalidate();
  }

  step(count = 1) { this.pause(); this.seek(this.frame + count); }

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
  // State snapshot — mirrors Z4's player.state()                       //
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
      cacheHitRate:  this.cache.stats().hitRate,
      preloadStatus: this.preloadStatus,
    };
  }

  // ================================================================== //
  // View math — exact Z4 player.js _transform(), resize(), fitScale()  //
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
  // Animation tick — wall-clock fractional accumulator.                //
  // Exact Z4 player.js _tick() logic (line 406-438).                   //
  // ================================================================== //

  private _tick(now: number) {
    this._raf = requestAnimationFrame(this._tick);

    if (this.playing && this.isReady) {
      const dt = Math.min(0.25, (now - this._lastTime) / 1000);
      this._lastTime = now;

      // ← This is the exact Z4 line 411: _acc += dt * fps * speed * direction
      this._acc += dt * this.fps * this.speed * this.direction;

      if (Math.abs(this._acc) >= 1) {
        const advance = Math.trunc(this._acc);
        this._acc -= advance;

        let next = this.frame + advance;
        if (next > this.lastFrame) {
          if (this.loop) next = 0;
          else { next = this.lastFrame; this.pause(); }
        } else if (next < 0) {
          if (this.loop) next = this.lastFrame;
          else { next = 0; this.pause(); }
        }

        if (next !== this.frame) {
          this.frame = next;
          this.cache.prefetch(next, { direction: this.direction });
          this.emit('seek', this.state());
          this._needsRender = true;
        }
      }
      this.emit('tick', this.state());
    } else {
      this._lastTime = now;
    }

    if (this._needsRender) {
      this._needsRender = false;
      this.render();
    }
  }

  // ================================================================== //
  // Render — exact Z4 player.js render() logic (lines 446-508).        //
  // ================================================================== //

  private render() {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    // Same background color as Z4
    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    if (!this.isReady) { ctx.restore(); return; }

    // ---- Synchronous peek from RAM cache (< 1ms) ----
    const img = this.cache.peek(this.frame);
    if (!img) {
      // Async load if not cached yet (first-time or cache miss)
      this.cache.load(this.frame).then(() => this.invalidate()).catch(() => {});
    } else {
      this._lastValidImg = img;
    }

    const renderImg = img || this._lastValidImg;

    // ---- Apply canvas transform (exact Z4 lines 466-470) ----
    const matrix = this._transform();
    ctx.setTransform(
      matrix.a * this.dpr, matrix.b * this.dpr,
      matrix.c * this.dpr, matrix.d * this.dpr,
      matrix.e * this.dpr, matrix.f * this.dpr,
    );

    const { rawW, rawH } = this.imageSize();
    const scale = this.effectiveScale() || 1;

    // ---- Draw frame (exact Z4 lines 488-495) ----
    if (renderImg) {
      ctx.save();
      ctx.filter = [
        `brightness(${this.filters.brightness})`,
        `contrast(${this.filters.contrast})`,
        `saturate(${this.filters.saturate})`,
      ].join(' ');
      ctx.imageSmoothingEnabled = scale < 2;  // exact Z4
      ctx.drawImage(renderImg, 0, 0, rawW, rawH);
      ctx.restore();
    }

    // ---- Render Annotation Overlay Layer ----
    this.annotations.render(ctx, rawW, rawH, (n: number) => n / scale);

    ctx.restore();
    this.emit('render', this.frame);
  }

  // ================================================================== //
  // Cleanup                                                             //
  // ================================================================== //

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._resizeObserver.disconnect();
    this.cache.clear();
    this.isReady = false;
  }
}

// -------------------------------------------------------------------- //
// Timecode helper — exact Z4 formatTimecode()                          //
// -------------------------------------------------------------------- //

export function formatTimecode(seconds: number): string {
  const total = Math.max(0, seconds);
  const m   = Math.floor(total / 60);
  const s   = Math.floor(total % 60);
  const ms  = Math.floor((total % 1) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
