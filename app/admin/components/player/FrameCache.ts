/**
 * FrameCache
 *
 * 1:1 port of Ball-tracker-Z4's frames.js FrameSource.
 *
 * Instead of fetching from /api/clips/{id}/frame/{index} (Z4 Python),
 * we fetch from /api/video/frame?url={s3url}&index={n}&fps={fps} (our Next.js API).
 *
 * The browser behavior is IDENTICAL to Z4:
 *   - peek()     → sync cache check (< 1ms, used by render loop)
 *   - load()     → async HTMLImageElement fetch + cache
 *   - prefetch() → directional window prefetch, biased toward playback direction
 *   - LRU eviction at MAX_CACHED = 480 frames
 */

const MAX_CACHED = 480;

export class FrameCache {
  private videoUrl:  string = '';
  private cache:     Map<number, HTMLImageElement> = new Map();  // LRU: insertion order
  private pending:   Map<number, Promise<HTMLImageElement | null>> = new Map();

  public frameCount = 0;
  public fps        = 25;
  public hits       = 0;
  public misses     = 0;

  // ---- init ---------------------------------------------------------

  init(videoUrl: string, frameCount: number, fps: number) {
    this.videoUrl   = videoUrl;
    this.frameCount = frameCount;
    this.fps        = fps;
    this.clear();
  }

  // ---- URL builder — mirrors Z4's url(index) method ----------------

  frameUrl(index: number): string {
    return `/api/video/frame?url=${encodeURIComponent(this.videoUrl)}&index=${index}&fps=${this.fps}`;
  }

  // ---- clamping ----------------------------------------------------

  private clamp(index: number): number {
    if (!this.frameCount) return Math.max(0, index);
    return Math.min(this.frameCount - 1, Math.max(0, index));
  }

  // ================================================================== //
  // Synchronous peek — used by render loop every rAF. Never blocks.    //
  // Exact Z4 frames.js peek() logic.                                   //
  // ================================================================== //

  peek(index: number): HTMLImageElement | null {
    const img = this.cache.get(index);
    if (img) {
      this.hits++;
      // Refresh LRU position (identical to Z4)
      this.cache.delete(index);
      this.cache.set(index, img);
      return img;
    }
    this.misses++;
    return null;
  }

  has(index: number): boolean {
    return this.cache.has(index);
  }

  // ================================================================== //
  // Async load — fetches JPEG from /api/video/frame.                   //
  // Exact Z4 frames.js load() logic (HTMLImageElement, img.src = url). //
  // ================================================================== //

  load(index: number): Promise<HTMLImageElement | null> {
    index = this.clamp(index);

    const cached = this.cache.get(index);
    if (cached) return Promise.resolve(cached);

    const inflight = this.pending.get(index);
    if (inflight) return inflight;

    const promise = new Promise<HTMLImageElement | null>((resolve) => {
      const img      = new Image();
      img.decoding   = 'async';    // exact Z4 setting
      img.onload     = () => {
        this.pending.delete(index);
        this.cache.set(index, img);
        this._evict();
        resolve(img);
      };
      img.onerror    = () => {
        this.pending.delete(index);
        resolve(null);
      };
      img.src = this.frameUrl(index);  // ← This is the Z4 equivalent line
    });

    this.pending.set(index, promise);
    return promise;
  }

  // ================================================================== //
  // Directional prefetch — identical to Z4 frames.js prefetch().       //
  // ================================================================== //

  prefetch(center: number, { ahead = 48, behind = 12, direction = 1 } = {}) {
    const lead = direction >= 0 ? ahead : behind;
    const lag  = direction >= 0 ? behind : ahead;
    const from = this.clamp(center - lag);
    const to   = this.clamp(center + lead);

    // Priority order: current frame → lead direction → lag direction
    const order: number[] = [];
    for (let i = center; i <= to; i++) order.push(i);
    for (let i = center - 1; i >= from; i--) order.push(i);

    let started = 0;
    for (const idx of order) {
      if (this.cache.has(idx) || this.pending.has(idx)) continue;
      this.load(idx).catch(() => {});
      if (++started >= 24) break;   // don't flood connection pool (same limit as Z4)
    }
  }

  // ================================================================== //
  // LRU eviction — frees memory at MAX_CACHED frames.                  //
  // ================================================================== //

  private _evict() {
    while (this.cache.size > MAX_CACHED) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  clear() {
    this.cache.clear();
    this.pending.clear();
    this.hits   = 0;
    this.misses = 0;
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      cached:  this.cache.size,
      hitRate: total ? this.hits / total : 1,
    };
  }
}
