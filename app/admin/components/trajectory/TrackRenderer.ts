/**
 * TrackRenderer
 *
 * The analytics ball tracker's look (analytics_track/web/track_renderer.js on
 * analytics dev / k-pro-dev), ported for one ball: a smoothed white tube with
 * round caps along full_trajectory, lit with ACES tone mapping + an HDRI, and
 * a ball sprite at the pitch and impact points.
 *
 * Differences from the original: points carry their real time in the clip
 * (ms, from frame_timestamps) instead of a frame number at a fixed 200 fps,
 * the image size comes from the stored video size, not a fixed 1920×1080,
 * and reflections come from three's procedural RoomEnvironment instead of the
 * 17.6 MB park.exr, which took seconds to decode on the main thread.
 */

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// Same constants as the tracker's config.json.
const TRACK_COLOR = "#ffffff";
const TRACK_RADIUS = 5;          // CSS px
const PITCH_BALL_SCALE = 1.2;    // × tube diameter
const IMPACT_BALL_SCALE = 1.2;
const HDRI_INTENSITY = 0.5;
const SMOOTH_ITERATIONS = 12;
const Z_STEP = 30;               // depth step along the path: z = -idx / 30

const BALL_IMAGE = "/trajectory/ball_red.png";

export interface TrackPoint { ms: number; x: number; y: number }

export interface TrackData {
  width: number;            // image size the points are in
  height: number;
  points: TrackPoint[];     // sorted by ms
  pitch: TrackPoint | null;
  impact: TrackPoint | null;
}

type Px = { x: number; y: number };

export class TrackRenderer {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private ballTexture: THREE.Texture | null = null;
  // One material each for the whole session: disposing one per rebuild made
  // the GPU recompile its shader every time the tube grew by a frame.
  private tubeMat: THREE.MeshStandardMaterial;
  private ballMat: THREE.SpriteMaterial | null = null;
  private disposed = false;

  /** Resolves once the ball image is loaded and shaders are compiled — start playback after this. */
  readonly ready: Promise<void>;

  private W = 2;
  private H = 2;
  private track: TrackData | null = null;
  private smoothedPx: Px[] = [];

  private group = new THREE.Group();
  private tube: { group: THREE.Group; dispose: () => void } | null = null;
  private markers: { pitch: THREE.Sprite | null; impact: THREE.Sprite | null } = { pitch: null, impact: null };
  private lastReveal = -1;
  private lastMs = 0;
  private progressive = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false });
    renderer.setClearColor(0x000000, 0); // transparent: the video shows through
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    this.renderer = renderer;

    this.camera.position.set(0, 0, 1);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const dir = new THREE.DirectionalLight(0xffffff, 0.5);
    dir.position.set(-1, 1, 1);
    this.scene.add(dir);
    const fill = new THREE.DirectionalLight(0xffffff, 0.25);
    fill.position.set(1, 1, 1);
    this.scene.add(fill);
    this.scene.add(this.group);

    // Glossy reflections, generated in a few ms (no download).
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    this.scene.environmentIntensity = 1.0;
    room.dispose();
    pmrem.dispose();

    this.tubeMat = this.tubeMaterial();
    this.resize();
    this.ready = this.loadBallTexture().then(() => this.precompile());
  }

  private loadBallTexture() {
    return new Promise<void>((resolve) => {
      new THREE.TextureLoader().load(
        BALL_IMAGE,
        (tex) => {
          if (this.disposed) { tex.dispose(); resolve(); return; }
          tex.colorSpace = THREE.SRGBColorSpace;
          this.ballTexture = tex;
          this.ballMat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.1, toneMapped: false });
          resolve();
        },
        undefined,
        () => resolve(), // markers just won't show if the image fails
      );
    });
  }

  // Compile the tube and ball shaders now, so the first drawn frame doesn't stall on it.
  private precompile() {
    if (this.disposed) return;
    const probe = new THREE.Group();
    const geom = new THREE.SphereGeometry(0.001, 4, 4);
    probe.add(new THREE.Mesh(geom, this.tubeMat));
    if (this.ballMat) probe.add(new THREE.Sprite(this.ballMat));
    this.scene.add(probe);
    this.renderer.compile(this.scene, this.camera);
    this.scene.remove(probe);
    geom.dispose();
    this.update(this.lastMs);
  }

  resize() {
    const w = Math.max(2, this.canvas.clientWidth || 2);
    const h = Math.max(2, this.canvas.clientHeight || 2);
    const changed = w !== this.W || h !== this.H;
    this.W = w;
    this.H = h;
    const aspect = w / h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.left = -aspect;
    this.camera.right = aspect;
    this.camera.top = 1;
    this.camera.bottom = -1;
    this.camera.updateProjectionMatrix();

    // Positions and radii are in canvas px, so everything drawn is rebuilt.
    if (changed && this.track) {
      this.smoothedPx = this.smoothPx(this.track.points);
      this.clearTube();
      this.resetMarkers();
      this.update(this.lastMs);
    } else {
      this.render();
    }
  }

  setTrack(track: TrackData) {
    this.track = track;
    this.smoothedPx = this.smoothPx(track.points);
    this.clearTube();
    this.resetMarkers();
    this.update(this.lastMs);
  }

  /** false = draw the whole path at once instead of growing it with the ball. */
  setProgressive(progressive: boolean) {
    this.progressive = progressive;
    this.lastReveal = -1;
    this.update(this.lastMs);
  }

  setVisible(visible: boolean) {
    this.group.visible = visible;
    this.render();
  }

  /** Show the track as it is at `nowMs` into the clip, and render. */
  update(nowMs: number) {
    this.lastMs = nowMs;
    const t = this.track;
    if (!t) { this.render(); return; }

    const pts = t.points;
    let reveal = pts.length;
    if (this.progressive) {
      reveal = 0;
      while (reveal < pts.length && pts[reveal].ms <= nowMs) reveal++;
    }
    if (reveal !== this.lastReveal) {
      this.clearTube();
      if (reveal >= 2) {
        this.tube = this.buildTube(this.smoothedPx.slice(0, reveal));
        if (this.tube) this.group.add(this.tube.group);
      }
      this.lastReveal = reveal;
    }

    // Markers appear once the ball has reached pitch / impact.
    const reached = (p: TrackPoint) => !this.progressive || nowMs >= p.ms;
    if (t.pitch && !this.markers.pitch && reached(t.pitch)) {
      this.markers.pitch = this.addBallSprite(t.pitch, PITCH_BALL_SCALE);
    } else if (t.pitch && this.markers.pitch && !reached(t.pitch)) {
      this.removeSprite("pitch");
    }
    if (t.impact && !this.markers.impact && reached(t.impact)) {
      this.markers.impact = this.addBallSprite(t.impact, IMPACT_BALL_SCALE);
    } else if (t.impact && this.markers.impact && !reached(t.impact)) {
      this.removeSprite("impact");
    }
    this.render();
  }

  render() {
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.clearTube();
    this.resetMarkers();
    this.tubeMat.dispose();
    this.ballMat?.dispose();
    this.ballTexture?.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }

  // --- coordinate helpers (as in the tracker) --------------------------------

  private toPx(x: number, y: number): Px {
    const t = this.track!;
    return { x: (x * this.W) / t.width, y: (y * this.H) / t.height };
  }

  private normalize(xpx: number, ypx: number, z: number) {
    const halfH = Math.max(1, this.H) / 2;
    return new THREE.Vector3((xpx - this.W / 2) / halfH, -(ypx - this.H / 2) / halfH, z);
  }

  // 3-point moving average, endpoints fixed, in canvas px.
  private smoothPx(points: TrackPoint[]): Px[] {
    let arr = points.map((p) => this.toPx(p.x, p.y));
    if (arr.length < 3) return arr;
    for (let it = 0; it < SMOOTH_ITERATIONS; it++) {
      const copy = arr.map((a) => ({ ...a }));
      for (let i = 1; i < arr.length - 1; i++) {
        copy[i].x = (arr[i - 1].x + arr[i].x + arr[i + 1].x) / 3;
        copy[i].y = (arr[i - 1].y + arr[i].y + arr[i + 1].y) / 3;
      }
      arr = copy;
    }
    return arr;
  }

  private get tubeRadius() {
    return (TRACK_RADIUS / Math.max(1, this.H)) * 2;
  }

  private tubeMaterial() {
    const color = new THREE.Color(TRACK_COLOR);
    return new THREE.MeshStandardMaterial({
      color,
      emissive: color.clone().multiplyScalar(0.03),
      side: THREE.DoubleSide,
      metalness: 0,
      roughness: 0.35,
      envMapIntensity: HDRI_INTENSITY,
    });
  }

  // Tube along the smoothed points, with sphere caps so both ends read as rounded.
  private buildTube(smoothedPx: Px[]) {
    if (smoothedPx.length < 2) return null;
    const radius = this.tubeRadius;
    const vecs = smoothedPx.map((p, idx) => this.normalize(p.x, p.y, -idx / Z_STEP));
    const curve = vecs.length === 2 ? new THREE.LineCurve3(vecs[0], vecs[1]) : new THREE.CatmullRomCurve3(vecs);
    const tubeGeom = new THREE.TubeGeometry(curve, Math.max(8, Math.floor(vecs.length * 2)), radius, 8, false);

    const mat = this.tubeMat;
    const group = new THREE.Group();
    group.add(new THREE.Mesh(tubeGeom, mat));
    const capGeom = new THREE.SphereGeometry(radius, 12, 12);
    const cap1 = new THREE.Mesh(capGeom, mat);
    cap1.position.copy(vecs[0]);
    const cap2 = new THREE.Mesh(capGeom, mat);
    cap2.position.copy(vecs[vecs.length - 1]);
    group.add(cap1, cap2);

    return { group, dispose: () => { tubeGeom.dispose(); capGeom.dispose(); } };
  }

  // Ball marker sized relative to the tube (scale 1.0 == the tube's diameter), in front of it.
  private addBallSprite(p: TrackPoint, scale: number) {
    if (!this.ballMat) return null;
    const sprite = new THREE.Sprite(this.ballMat);
    const px = this.toPx(p.x, p.y);
    const n = this.normalize(px.x, px.y, 0.5);
    const size = this.tubeRadius * 2 * scale;
    sprite.position.set(n.x, n.y, 0.5);
    sprite.scale.set(size, size, 1);
    this.group.add(sprite);
    return sprite;
  }

  private removeSprite(key: "pitch" | "impact") {
    const s = this.markers[key];
    if (!s) return;
    this.group.remove(s);
    this.markers[key] = null;
  }

  private resetMarkers() {
    this.removeSprite("pitch");
    this.removeSprite("impact");
  }

  private clearTube() {
    if (this.tube) {
      this.group.remove(this.tube.group);
      this.tube.dispose();
      this.tube = null;
    }
    this.lastReveal = -1;
  }
}
