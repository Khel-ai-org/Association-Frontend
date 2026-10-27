"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { Manrope, Inter } from 'next/font/google';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as TWEEN from '@tweenjs/tween.js';
import { SAMPLE_WAGON_WHEEL_DATA, WagonWheelData, WagonWheelShot } from '@/lib/sampleWagonWheel';

const manrope = Manrope({ subsets: ['latin'], weight: ['600', '700', '800'] });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] });
// Switzer isn't on Google Fonts. It's used if installed/loaded on the page;
// otherwise this falls back to Inter, which is loaded above.
const SWITZER_FONT = `Switzer, ${inter.style.fontFamily}, sans-serif`;

interface WagonWheelModalProps {
  isOpen: boolean;
  onClose: () => void;
  batsmanName?: string;
  data?: WagonWheelData;
  /** e.g. "India vs Australia • 1st Innings" */
  subtitle?: string;
  /** Adds the not-out star to the score: 30 (18)* */
  notOut?: boolean;
}

// Mirrors the AREA_WEDGE_CENTER zone centers in lib/sampleWagonWheel.ts,
// using the same field-zone names the scorer's wagon-wheel step sends.
// Order going around the field: Deep Fine Leg → Deep Square Leg → Deep Mid
// Wicket → Long On → Long Off → Deep Cover → Deep Point → Third Man, which
// puts leg/on-side in [0°,180°] and off-side in [180°,360°] (world angle
// 180° is "straight toward the bowler" from the batsman's crease).
const SECTORS = [
  { name: 'Deep Fine Leg',   minAngle: 0,     maxAngle: 45,    color: '#f43f5e' },
  { name: 'Deep Square Leg', minAngle: 45,    maxAngle: 90,    color: '#ec4899' },
  { name: 'Deep Mid Wicket', minAngle: 90,    maxAngle: 135,   color: '#8b5cf6' },
  { name: 'Long On',         minAngle: 135,   maxAngle: 180,   color: '#6366f1' },
  { name: 'Long Off',        minAngle: 180,   maxAngle: 225,   color: '#3b82f6' },
  { name: 'Deep Cover',      minAngle: 225,   maxAngle: 270,   color: '#06b6d4' },
  { name: 'Deep Point',      minAngle: 270,   maxAngle: 315,   color: '#10b981' },
  { name: 'Third Man',       minAngle: 315,   maxAngle: 360,   color: '#ef4444' },
];

// Same white as the modal header. The fog uses it too, so distant parts of
// the scene fade into the background, not into a dark colour.
const SCENE_BACKGROUND = 0xffffff;

// Fonts the Stat View area boxes are painted with (canvas text can't use a
// web font that hasn't finished loading).
const LABEL_FONTS = [`800 7.5px ${inter.style.fontFamily}`, `800 13px ${manrope.style.fontFamily}`];

// Starting camera height, before it is fitted to the canvas.
const REFERENCE_CAMERA_HEIGHT = 220;
// Share of the canvas's shorter side the outer ring may fill.
const RING_FILL = 0.92;

// Shot colours: the same three as the legend chips in the info bar
// (1-3 runs, 4s, 6s), for the animated shots and the final lines alike.
const SHOT_COLOR_SMALL = 0xc99528;
const SHOT_COLOR_FOUR = 0x3f6ac9;
const SHOT_COLOR_SIX = 0xea3700;

// 3D View opens straight down (0°), the same camera as Stat View, and can be
// dragged to tilt up to this far from vertical.
const TILT_MIN_3D_DEG = 0;
const TILT_MAX_3D_DEG = 50;
// The camera's resting angle from straight-down in both views, so the whole 3D model (stands,
// towers, screens) reads as a stadium instead of a flat disc. Inside the tilt range above.
const DEFAULT_TILT_DEG = 38;
const defaultCameraPosition = (distance: number) => {
  const t = THREE.MathUtils.degToRad(DEFAULT_TILT_DEG);
  return { x: 0, y: distance * Math.cos(t), z: distance * Math.sin(t) };
};
// How far the scene turns per pixel of drag (OrbitControls default is 1).
const ROTATE_SPEED = 0.3;

export const WagonWheelModal: React.FC<WagonWheelModalProps> = ({
  isOpen,
  onClose,
  batsmanName,
  data,
  subtitle,
  notOut,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const activeData = data || {
    ...SAMPLE_WAGON_WHEEL_DATA,
    batsman: batsmanName || SAMPLE_WAGON_WHEEL_DATA.batsman,
  };

  const [isAnimating, setIsAnimating] = useState(false);
  const [isSceneLoading, setIsSceneLoading] = useState(true);
  const [showRightHud, setShowRightHud] = useState(false);
  const [sectorStats, setSectorStats] = useState<Array<{ name: string; balls: number; runs: number; percentage: number; color: string }>>([]);
  const [viewMode, setViewMode] = useState<'3d' | 'stats'>('stats');

  // Runs-by-area % breakdown for the Stat View — computed straight from the
  // data (not tied to the animation), so it's available the instant you
  // switch tabs, regardless of whether the 3D animation has played.
  // Inner-ring zones fold into their same-direction boundary zone (e.g. "Mid
  // On" shots count toward "Long On") so Stat View shows one clean wedge per
  // direction instead of two overlapping ones at different radii.
  const INNER_TO_DEEP_NAME: Record<string, string> = {
    Cover: 'Deep Cover',
    'Mid Off': 'Long Off',
    'Mid On': 'Long On',
    'Mid Wicket': 'Deep Mid Wicket',
    'Square Leg': 'Deep Square Leg',
    'Fine Leg': 'Deep Fine Leg',
    Slip: 'Third Man',
    Point: 'Deep Point',
  };

  const statViewAreas = React.useMemo(() => {
    const shots = activeData.shots || [];
    const totalRuns = shots.reduce((sum, s) => sum + (typeof s.runs === 'number' ? s.runs : 0), 0);
    const byArea = new Map<string, { balls: number; runs: number }>();

    shots.forEach((s) => {
      const rawArea = s.area || 'Unknown';
      const key = INNER_TO_DEEP_NAME[rawArea] || rawArea;
      const runVal = typeof s.runs === 'number' ? s.runs : 0;
      const entry = byArea.get(key) || { balls: 0, runs: 0 };
      entry.balls += 1;
      entry.runs += runVal;
      byArea.set(key, entry);
    });

    // Always all 8 directional zones, even ones with zero shots — every
    // section must tile the field, so there can be no gaps in the circle.
    return SECTORS.map((sec) => {
      const { balls, runs } = byArea.get(sec.name) || { balls: 0, runs: 0 };
      return {
        name: sec.name,
        balls,
        runs,
        // One decimal: whole-number rounding of several zones can add up to
        // more than 100 (e.g. 24+24+24+24+6), and equal-run zones must read
        // the same.
        percentage: totalRuns > 0 ? Math.round((runs / totalRuns) * 1000) / 10 : 0,
        color: sec.color,
      };
    });
  }, [activeData.shots]);

  // Draw/clear the ground wedges whenever the view toggle changes, and hide
  // the shot-trajectory lines while in Stat View so only the zone sections
  // show (they're never disposed, just toggled, so 3D View comes back exactly
  // as it was).
  // Which view the scene is currently showing. Lets the toggle effect ignore
  // the setViewMode('stats') the scene setup does on open (a no-op when the
  // view is already 'stats'), without swallowing the user's first real click.
  const appliedViewModeRef = useRef<'3d' | 'stats'>('stats');
  const hasPlayedAnimationRef = useRef(false);

  useEffect(() => {
    // No scene yet, or it's already showing this view (the scene setup builds
    // the default Stat View itself) — nothing to switch.
    if (!sceneRef.current || appliedViewModeRef.current === viewMode) return;
    appliedViewModeRef.current = viewMode;

    const showShots = viewMode !== 'stats';
    animatedObjectsRef.current.forEach((obj) => { obj.visible = showShots; });
    sectorLineObjectsRef.current.forEach((obj) => { obj.visible = showShots; });
    dividerLineObjectsRef.current.forEach((obj) => { obj.visible = !showShots; });
    if (viewMode === 'stats') {
      // Same tilt range as 3D View; the camera swings back to top-down first.
      setTilt(0, TILT_MAX_3D_DEG);
      smoothCameraTo(defaultCameraPosition(statCameraHeightRef.current), { x: 0, y: 0, z: 0 }, 600).then(() => {
        if (appliedViewModeRef.current === 'stats') setTilt(TILT_MIN_3D_DEG, TILT_MAX_3D_DEG);
      });
      drawStatBreakdown(statViewAreas);
    } else {
      clearStatObjects();
      // Same camera as Stat View (the default tilted angle), so there is no camera move; the tilt range stays open.
      setTilt(TILT_MIN_3D_DEG, TILT_MAX_3D_DEG);
      // Shots only get animated the first time 3D View is actually opened.
      if (!hasPlayedAnimationRef.current) {
        hasPlayedAnimationRef.current = true;
        startWagonWheelAnimation();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // Internal refs for Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animatedObjectsRef = useRef<THREE.Object3D[]>([]);
  const sectorLineObjectsRef = useRef<THREE.Object3D[]>([]);
  const statObjectsRef = useRef<THREE.Object3D[]>([]);
  const sideLabelObjectsRef = useRef<THREE.Object3D[]>([]);
  // The 8-section divider lines: part of Stat View only.
  const dividerLineObjectsRef = useRef<THREE.Object3D[]>([]);
  // Crease-line materials, faded with camera distance: faint from afar, crisp when zoomed in.
  const creaseMaterialsRef = useRef<THREE.MeshBasicMaterial[]>([]);
  // Camera height that makes the outer ring fill the canvas (both views look straight down from it).
  const statCameraHeightRef = useRef(REFERENCE_CAMERA_HEIGHT);
  // Scale (in non-attenuated sprite units) that draws an area box at its design pixel size.
  const labelSizeRef = useRef({ w: 1, h: 1 });
  const animationFrameIdRef = useRef<number | null>(null);

  const boundaryRadius = 65;
  // The far (upper) crease/stumps — matches the crease/stump geometry built
  // in buildStadium (z = -8.8) — instead of the pitch's geometric center, so
  // every shot line originates from where the batsman actually stands.
  // Landing points are unaffected: convertShotTo3D measures distance from
  // world origin (where the boundary rope is centered), so boundary/six/four
  // distances stay exactly as calculated — only the line's start point moves.
  const batsmanPosition = new THREE.Vector3(0, 0.1, -8.8);

  useEffect(() => {
    if (!isOpen || !mountRef.current) return;
    setIsSceneLoading(true);
    setViewMode('stats');
    statObjectsRef.current = [];
    appliedViewModeRef.current = 'stats';
    hasPlayedAnimationRef.current = false;

    const container = mountRef.current;
    const width = container.clientWidth || window.innerWidth * 0.9;
    const height = container.clientHeight || 600;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SCENE_BACKGROUND);
    scene.fog = new THREE.FogExp2(SCENE_BACKGROUND, 0.0018);
    sceneRef.current = scene;

    // 2. Camera
    // Near/far were 0.1/1000 — a 10,000:1 ratio that starves the depth
    // buffer of precision at the distances actually used here (OrbitControls
    // only ever goes from 30 to 250 units out), causing z-fighting flicker
    // between near-coplanar ground surfaces (grass/mown rings/pitch/creases)
    // that gets worse the further the camera is zoomed out.
    const camera = new THREE.PerspectiveCamera(45, width / height, 5, 400);
    camera.position.set(0, 160, 120);
    cameraRef.current = camera;
    fitCameraToCanvas(width, height);

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    rendererRef.current = renderer;

    // Canvases are inline by default, which leaves a few px of line-height gap under them.
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    // 4. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = ROTATE_SPEED;
    controls.minDistance = 30;
    controls.maxDistance = Math.max(250, statCameraHeightRef.current * 1.3);
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(80, 150, 60);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x6366f1, 0.4);
    fillLight.position.set(-80, 80, -60);
    scene.add(fillLight);

    // 6. Build Stadium
    buildStadium(scene);
    addSideLabels(scene, activeData.battingHand || 'RHB');

    // 7. Render Loop
    const animate = (time?: number) => {
      animationFrameIdRef.current = requestAnimationFrame(animate);
      TWEEN.update(time);
      controls.update();
      const camDist = camera.position.distanceTo(controls.target);
      const creaseOpacity = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(camDist, 200, 90, 0.15, 1), 0.15, 1);
      creaseMaterialsRef.current.forEach((m) => { m.opacity = creaseOpacity; });
      renderer.render(scene, camera);
    };
    animate();

    // Default view is Stat View — set it up directly here (the shots
    // haven't been animated yet, so there's nothing for 3D View to show
    // until the user actually switches to it).
    const startPos = defaultCameraPosition(statCameraHeightRef.current);
    camera.position.set(startPos.x, startPos.y, startPos.z);
    controls.target.set(0, 0, 0);
    setTilt(TILT_MIN_3D_DEG, TILT_MAX_3D_DEG); // same tilt range as 3D View
    drawStatBreakdown(statViewAreas);
    // The boxes are painted onto canvas textures, which use Inter/Manrope Bold
    // only once loaded — repaint them when those fonts arrive.
    if (!LABEL_FONTS.every((f) => document.fonts.check(f))) {
      Promise.all(LABEL_FONTS.map((f) => document.fonts.load(f))).then(() => {
        if (sceneRef.current === scene && appliedViewModeRef.current === 'stats') drawStatBreakdown(statViewAreas);
      });
    }
    setIsSceneLoading(false);

    // Resize handler
    const handleResize = () => {
      if (!container || !cameraRef.current || !rendererRef.current) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      if (!newW || !newH) return;
      cameraRef.current.aspect = newW / newH;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(newW, newH);
      fitCameraToCanvas(newW, newH);
      const controls = controlsRef.current;
      if (controls) {
        // Keep the viewing direction, re-fit the distance to the new canvas.
        const dir = cameraRef.current.position.clone().sub(controls.target);
        if (dir.lengthSq() > 0) cameraRef.current.position.copy(controls.target).add(dir.setLength(statCameraHeightRef.current));
      }
      updateLabelSize();
    };
    // Watch the container itself, not just the window: any change to the space the
    // canvas has (window resize, a section above it changing height) re-fits the
    // renderer and camera, so the field stays centred in the area it's given.
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      clearDrawings();
      if (rendererRef.current && rendererRef.current.domElement) {
        container.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, [isOpen]);

  // Flat, semi-transparent text painted onto the grass — like real broadcast
  // turf branding, not a floating badge. Lies in the ground plane, no
  // background fill, so it reads as part of the field rather than a HUD element.
  const createGroundLabel = (text: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillText(text, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const geom = new THREE.PlaneGeometry(24, 6);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  };

  // Same 8-way wedge centers used to place shots in lib/sampleWagonWheel.ts —
  // duplicated here (small, static) so the Stat View wedges line up with
  // wherever a named zone's shots actually land.
  // Matches AREA_WEDGE_CENTER in lib/sampleWagonWheel.ts — see the comment
  // there for why world angle 180° (not 0°) is "toward the bowler".
  const AREA_WEDGE_CENTER: Record<string, number> = {
    'Fine Leg': 22.5, 'Deep Fine Leg': 22.5,
    'Square Leg': 67.5, 'Deep Square Leg': 67.5,
    'Mid Wicket': 112.5, 'Deep Mid Wicket': 112.5,
    'Mid On': 157.5, 'Long On': 157.5,
    'Mid Off': 202.5, 'Long Off': 202.5,
    Cover: 247.5, 'Deep Cover': 247.5,
    Point: 292.5, 'Deep Point': 292.5,
    Slip: 337.5, 'Third Man': 337.5,
  };

  // A camera-facing billboard (not flat ground text) — stays crisp and
  // horizontal from any viewing angle, since OrbitControls lets the user
  // rotate away from the straight-down Stat View camera at any time.
  const createWedgeLabel = (name: string, percentage: number) => {
    // The design's area box: 84×31px, white, 0.7px #E5E7EB border, 3px radius,
    // the zone name above the percentage. Painted at K canvas px per design px;
    // the sprite's on-screen size is set separately (updateLabelSize), so the
    // box keeps its design size whatever the size of the field.
    const K = 4;
    const W = 84;
    const H = 31;
    const canvas = document.createElement('canvas');
    canvas.width = W * K;
    canvas.height = H * K;
    const ctx = canvas.getContext('2d')!;

    const border = 0.7 * K;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = border;
    ctx.beginPath();
    if ((ctx as any).roundRect) {
      (ctx as any).roundRect(border / 2, border / 2, W * K - border, H * K - border, 3 * K);
    } else {
      ctx.rect(border / 2, border / 2, W * K - border, H * K - border);
    }
    ctx.fill();
    ctx.stroke();

    // 7.5px name + 2px gap + 13px percentage, centred in the box
    const blockTop = (H - (7.5 + 2 + 13)) / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#172B42';
    ctx.font = `800 ${7.5 * K}px ${inter.style.fontFamily}`;
    ctx.fillText(name, (W * K) / 2, (blockTop + 7.5 / 2) * K);
    ctx.fillStyle = '#6379FC';
    ctx.font = `800 ${13 * K}px ${manrope.style.fontFamily}`;
    // Whole values read as 0 / 5 / 100, everything else keeps its one decimal (23.5)
    ctx.fillText(`${Number.isInteger(percentage) ? percentage : percentage.toFixed(1)}%`, (W * K) / 2, (blockTop + 7.5 + 2 + 13 / 2) * K);

    const texture = new THREE.CanvasTexture(canvas);
    // Canvas pixels are sRGB. Without this three.js reads them as linear and
    // encodes them again on output, which washes every colour out (dull text).
    texture.colorSpace = THREE.SRGBColorSpace;
    // sizeAttenuation off: the box keeps one screen size at any camera distance.
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, sizeAttenuation: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(labelSizeRef.current.w, labelSizeRef.current.h, 1);
    sprite.renderOrder = 50;
    return sprite;
  };

  const clearStatObjects = () => {
    if (!sceneRef.current) return;
    statObjectsRef.current.forEach((obj) => {
      sceneRef.current?.remove(obj);
      const mesh = obj as any;
      // Sprite.geometry is a static geometry shared by every THREE.Sprite in
      // the app — disposing it would break all future sprites, so only real
      // per-instance geometry (the wedges) gets disposed here.
      if (mesh.geometry && !(obj instanceof THREE.Sprite)) mesh.geometry.dispose();
      if (mesh.material?.map) mesh.material.map.dispose();
      if (mesh.material) mesh.material.dispose();
    });
    statObjectsRef.current = [];
  };

  // Stat View: one area box per directional zone, sitting on the plain field
  // between the divider lines. The zones themselves aren't coloured.
  const drawStatBreakdown = (stats: typeof statViewAreas) => {
    if (!sceneRef.current || stats.length === 0) return;
    const scene = sceneRef.current;
    clearStatObjects();
    updateLabelSize();

    stats.forEach((stat) => {
      const midAngleRad = THREE.MathUtils.degToRad(AREA_WEDGE_CENTER[stat.name] ?? 0);
      // Box centres sit 181 design px from the middle (measured off the design).
      const labelDist = 181 * (boundaryRadius / 240);
      const label = createWedgeLabel(stat.name, stat.percentage);
      label.position.set(
        Math.sin(midAngleRad) * labelDist,
        1.1,
        -Math.cos(midAngleRad) * labelDist
      );
      scene.add(label);
      statObjectsRef.current.push(label);
    });
  };


  // Off/leg side flips with the batsman's hand — the shot angles already
  // mirror for LHB, so these labels mirror the same way to stay correct.
  // Matches the corrected zone scheme (see AREA_WEDGE_CENTER): off-side
  // spans [180°,360°] (center 270°), leg/on-side spans [0°,180°] (center 90°).
  const addSideLabels = (scene: THREE.Scene, battingHand: 'RHB' | 'LHB') => {
    const baseOffAngle = 270;
    const baseOnAngle = 90;
    const mirror = (angle: number) => (battingHand === 'LHB' ? (360 - angle) % 360 : angle);

    sideLabelObjectsRef.current = [];
    [
      { text: 'OFF-SIDE', angle: mirror(baseOffAngle) },
      { text: 'ON-SIDE', angle: mirror(baseOnAngle) },
    ].forEach(({ text, angle }) => {
      const rad = THREE.MathUtils.degToRad(angle);
      const dist = boundaryRadius * 0.85;
      const label = createGroundLabel(text);
      // Nudged up (toward the top of the screen) so the text clears the horizontal divider line.
      label.position.set(Math.sin(rad) * dist, 0.03, -Math.cos(rad) * dist - 4);
      scene.add(label);
      sideLabelObjectsRef.current.push(label);
    });
  };

  // Build 3D Stadium geometry
  const buildStadium = (scene: THREE.Scene) => {
    // One design px in metres (the design draws the 65m boundary as a 240px radius).
    const designPx = boundaryRadius / 240;

    // Outer ring: a 600px disc with the design's radial gradient. Its darker
    // band near the edge reads as a tube around the field; the grass sits on top.
    const ringCanvas = document.createElement('canvas');
    ringCanvas.width = 1024;
    ringCanvas.height = 1024;
    const ringCtx = ringCanvas.getContext('2d')!;
    const ringGradient = ringCtx.createRadialGradient(512, 512, 0, 512, 512, 512);
    ringGradient.addColorStop(0, '#FAFCFE');
    ringGradient.addColorStop(0.86, '#EEF2F6');
    ringGradient.addColorStop(0.94, '#DDE5EC');
    ringGradient.addColorStop(1, '#EFF3F7');
    ringCtx.fillStyle = ringGradient;
    ringCtx.fillRect(0, 0, 1024, 1024);
    const ringTexture = new THREE.CanvasTexture(ringCanvas);
    ringTexture.colorSpace = THREE.SRGBColorSpace; // canvas pixels are sRGB; keeps the colours exact
    const outerRing = new THREE.Mesh(
      new THREE.CircleGeometry(300 * designPx, 128),
      new THREE.MeshBasicMaterial({ map: ringTexture, fog: false }),
    );
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = -0.02;
    scene.add(outerRing);

    // Thin light-blue border between the ring and the grass (3.15px, 500px across).
    const midBorder = new THREE.Mesh(
      new THREE.RingGeometry((250 - 3.15) * designPx, 250 * designPx, 128),
      new THREE.MeshBasicMaterial({ color: 0xddefff, side: THREE.DoubleSide, fog: false }),
    );
    midBorder.rotation.x = -Math.PI / 2;
    midBorder.position.y = 0.003;
    scene.add(midBorder);

    // Grass Ground
    const grassGeom = new THREE.CircleGeometry(boundaryRadius, 64);
    // Unlit and fog-free so it renders as exactly the design's #80CB85 — a lit
    // material shades it, and the scene's fog tints a distant top-down view.
    // Mown stripes: alternating bands a hair lighter / darker than #80CB85 (averaging back to
    // it), running along the pitch like a real outfield. The canvas is mapped across the disc.
    const stripeCanvas = document.createElement('canvas');
    stripeCanvas.width = 1024;
    stripeCanvas.height = 4;
    const stripeCtx = stripeCanvas.getContext('2d')!;
    const stripeCount = 20;
    for (let i = 0; i < stripeCount; i++) {
      stripeCtx.fillStyle = i % 2 === 0 ? '#84cf89' : '#7cc781';
      stripeCtx.fillRect((i * 1024) / stripeCount, 0, 1024 / stripeCount + 1, 4);
    }
    const stripeTexture = new THREE.CanvasTexture(stripeCanvas);
    stripeTexture.colorSpace = THREE.SRGBColorSpace;
    const grassMat = new THREE.MeshBasicMaterial({ map: stripeTexture, fog: false });
    const grass = new THREE.Mesh(grassGeom, grassMat);
    grass.rotation.x = -Math.PI / 2;
    scene.add(grass);

    // Boundary rope: a simple raised cord along the grass edge in the ground's own green,
    // only slightly darker than the grass. Lit, so it shades a little and shows its height
    // when the view is tilted or zoomed in.
    const ropeTube = 0.5;
    const ropeColor = 0x6bb673; // a touch darker than the grass (#80CB85)
    const rope = new THREE.Mesh(
      new THREE.TorusGeometry(boundaryRadius - ropeTube, ropeTube, 12, 200),
      new THREE.MeshStandardMaterial({ color: ropeColor, emissive: ropeColor, emissiveIntensity: 0.55, roughness: 0.9, fog: false }),
    );
    rope.rotation.x = -Math.PI / 2;
    rope.position.y = ropeTube * 0.8;
    scene.add(rope);

    // Stands on the outer ring: three stepped tiers with a back wall. The steps are one
    // revolved profile; the tier tops are flat rings painted (on one polar canvas) as solid
    // colour blocks, with thin lines for aisles and seat rows — smooth shapes, not tiny
    // seats, which turn to noise at this scale.
    const standStart = 68.5; // just outside the thin border ring (67.7 m)
    const tierDepth = 3.6;
    const tierRise = 1.1;
    const tierCount = 3;
    const standEnd = standStart + tierCount * tierDepth;
    const wallTop = tierRise * tierCount + 1.2;
    const stepProfile: THREE.Vector2[] = [new THREE.Vector2(standStart, 0)];
    for (let k = 0; k < tierCount; k++) {
      const r0 = standStart + k * tierDepth;
      stepProfile.push(new THREE.Vector2(r0, tierRise * (k + 1)), new THREE.Vector2(r0 + tierDepth, tierRise * (k + 1)));
    }
    stepProfile.push(
      new THREE.Vector2(standEnd, wallTop),
      new THREE.Vector2(standEnd + 0.4, wallTop),
      new THREE.Vector2(standEnd + 0.4, 0),
    );
    scene.add(new THREE.Mesh(
      new THREE.LatheGeometry(stepProfile, 160),
      new THREE.MeshStandardMaterial({
        color: 0xe6eaf0, emissive: 0xe6eaf0, emissiveIntensity: 0.4, roughness: 0.9, side: THREE.DoubleSide, fog: false,
      }),
    ));

    // One polar canvas covering the stands (centre = field centre, 2048 px = 2 × paintR).
    const paintR = 80;
    const paintPx = 2048;
    const pxPerM = paintPx / (2 * paintR);
    const standCanvas = document.createElement('canvas');
    standCanvas.width = standCanvas.height = paintPx;
    const sctx = standCanvas.getContext('2d')!;
    const blockColors = ['#9db4f0', '#b7c7f5', '#d4def9', '#c3cbe0'];
    const blocks = 40; // seating blocks per tier, split by aisles
    for (let k = 0; k < tierCount; k++) {
      const r0 = (standStart + k * tierDepth) * pxPerM;
      const r1 = (standStart + (k + 1) * tierDepth) * pxPerM;
      for (let i = 0; i < blocks; i++) {
        // Leave a gap in the stands behind each end of the pitch for the sight screen.
        if (i === blocks / 4 - 1 || i === blocks / 4 || i === (3 * blocks) / 4 - 1 || i === (3 * blocks) / 4) continue;
        const a0 = (i / blocks) * Math.PI * 2 + 0.012;
        const a1 = ((i + 1) / blocks) * Math.PI * 2 - 0.012;
        sctx.beginPath();
        sctx.arc(paintPx / 2, paintPx / 2, r1, a0, a1);
        sctx.arc(paintPx / 2, paintPx / 2, r0 + 1.5, a1, a0, true);
        sctx.closePath();
        sctx.fillStyle = blockColors[(i * 3 + k) % blockColors.length];
        sctx.fill();
      }
      // faint seat-row lines across the blocks
      sctx.strokeStyle = 'rgba(255,255,255,0.45)';
      sctx.lineWidth = 1.5;
      for (let row = 1; row < 4; row++) {
        sctx.beginPath();
        sctx.arc(paintPx / 2, paintPx / 2, r0 + ((r1 - r0) * row) / 4, 0, Math.PI * 2);
        sctx.stroke();
      }
    }
    const standTexture = new THREE.CanvasTexture(standCanvas);
    standTexture.colorSpace = THREE.SRGBColorSpace;
    standTexture.anisotropy = 4;
    const standTopMat = new THREE.MeshBasicMaterial({ map: standTexture, transparent: true, side: THREE.DoubleSide, fog: false });
    for (let k = 0; k < tierCount; k++) {
      const top = new THREE.RingGeometry(standStart + k * tierDepth, standStart + (k + 1) * tierDepth, 160, 1);
      // RingGeometry's own UVs are per-ring; map every ring onto the shared polar canvas instead.
      const pos = top.attributes.position;
      const uv = top.attributes.uv;
      for (let v = 0; v < pos.count; v++) uv.setXY(v, (pos.getX(v) / paintR + 1) / 2, (pos.getY(v) / paintR + 1) / 2);
      const mesh = new THREE.Mesh(top, standTopMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = tierRise * (k + 1) + 0.02;
      scene.add(mesh);
    }

    // Sight screens: the big white screens behind the bowler's end, one at each end of the
    // pitch, standing in the gap left in the stands (middle tier height).
    const screenBase = tierRise * 2;
    const screenMat = new THREE.MeshStandardMaterial({ color: 0xf7f9fb, emissive: 0xf7f9fb, emissiveIntensity: 0.5, roughness: 0.9, fog: false });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3c4a5c, roughness: 0.8, fog: false });
    [1, -1].forEach((dir) => {
      const g = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(15, 6.6, 0.5), frameMat);
      frame.position.y = 3.3;
      const face = new THREE.Mesh(new THREE.BoxGeometry(14, 5.6, 0.6), screenMat);
      face.position.y = 3.3;
      g.add(frame, face);
      [-5.5, 5.5].forEach((x) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.2, 0.6), frameMat);
        leg.position.set(x, -0.9, 0);
        g.add(leg);
      });
      g.position.set(0, screenBase, dir * (standStart + 1.5 * tierDepth));
      scene.add(g);
    });

    // Floodlight towers: four towers just outside the stands, each a tapered mast on a base
    // with a catwalk under a framed bank of round lamps (a soft glow behind them), angled
    // in toward the field. The towers stand level, so the masts stay upright.
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xa3adbb, roughness: 0.65, fog: false });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.6, fog: false });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfffbe6, fog: false });
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 128;
    const glowCtx = glowCanvas.getContext('2d')!;
    const glowGrad = glowCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    glowGrad.addColorStop(0, 'rgba(255,248,214,0.85)');
    glowGrad.addColorStop(0.4, 'rgba(255,244,200,0.35)');
    glowGrad.addColorStop(1, 'rgba(255,244,200,0)');
    glowCtx.fillStyle = glowGrad;
    glowCtx.fillRect(0, 0, 128, 128);
    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    glowTexture.colorSpace = THREE.SRGBColorSpace;
    const mastHeight = 24;
    const lampRows = 4;
    const lampCols = 7;
    [45, 135, 225, 315].forEach((deg) => {
      const a = THREE.MathUtils.degToRad(deg);
      const tower = new THREE.Group();

      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 0.8, 12), steelMat);
      base.position.y = 0.4;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.85, mastHeight, 12), poleMat);
      mast.position.y = 0.8 + mastHeight / 2;
      tower.add(base, mast);

      // Head: catwalk, back frame, lamp bank
      const headY = mastHeight + 0.8 + 3.2;
      const catwalk = new THREE.Mesh(new THREE.BoxGeometry(10, 0.35, 1.6), steelMat);
      catwalk.position.set(0, headY - 3.4, 0.6);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(9.6, 6.2, 0.5), steelMat);
      frame.position.set(0, headY, 0);
      tower.add(catwalk, frame);
      const lampGeom = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14);
      for (let row = 0; row < lampRows; row++) {
        for (let col = 0; col < lampCols; col++) {
          const lamp = new THREE.Mesh(lampGeom, lampMat);
          lamp.rotation.x = Math.PI / 2; // lamp face toward +z
          lamp.position.set(-4.2 + col * 1.4, headY - 2.25 + row * 1.5, 0.35);
          tower.add(lamp);
        }
      }
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      }));
      glow.scale.set(16, 11, 1);
      glow.position.set(0, headY, 1.2);
      tower.add(glow);

      tower.position.set(Math.sin(a) * (standEnd + 1.8), 0, -Math.cos(a) * (standEnd + 1.8));
      tower.lookAt(0, 0, 0); // lamp face (+z) toward the field (level, so the mast stays upright)
      scene.add(tower);
    });

    // Advertising boards: a thin ring of low boards between the rope and the stands, in the
    // design's soft colours.
    const adCount = 120;
    const adR = 66.8;
    const adW = (2 * Math.PI * adR) / adCount - 0.12;
    const adH = 0.9;
    const adGeom = new THREE.BoxGeometry(0.35, adH, adW); // x radial, z tangential
    const adMats = [0xffffff, 0xddefff, 0xc7d0fe, 0xe6eaf0].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.45, roughness: 0.8, fog: false }),
    );
    for (let i = 0; i < adCount; i++) {
      const ang = (i / adCount) * Math.PI * 2;
      const board = new THREE.Mesh(adGeom, adMats[i % adMats.length]);
      board.position.set(Math.sin(ang) * adR, adH / 2, -Math.cos(ang) * adR);
      board.rotation.y = Math.PI / 2 - ang; // local x radial, local z tangential
      scene.add(board);
    }

    // Annular-sector prism helper (shape angles measured like world +x → -z), for the pavilion.
    const sectorPrism = (r0: number, r1: number, half: number, height: number, y0: number, mat: THREE.Material) => {
      const sh = new THREE.Shape();
      sh.absarc(0, 0, r1, -half, half, false);
      sh.absarc(0, 0, r0, half, -half, true);
      sh.closePath();
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: height, bevelEnabled: false, curveSegments: 28 }), mat);
      m.rotation.x = -Math.PI / 2; // extrusion → up, shape +y → world -z
      m.position.y = y0;
      scene.add(m);
      return m;
    };

    // Pavilion: the main stand on the east side — a tall white block over the tiers with a
    // dark glass band, front columns and a light roof over its upper rows.
    const pavHalf = 0.22; // rad each side of due east
    const pavHeight = 7;
    const pavMat = new THREE.MeshStandardMaterial({ color: 0xeef1f6, emissive: 0xeef1f6, emissiveIntensity: 0.4, roughness: 0.9, fog: false });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x3d4f73, emissive: 0x3d4f73, emissiveIntensity: 0.25, roughness: 0.4, fog: false });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xaab6e6, emissive: 0xaab6e6, emissiveIntensity: 0.3, roughness: 0.7, fog: false });
    const colMat = new THREE.MeshStandardMaterial({ color: 0xcfd6df, roughness: 0.7, fog: false });
    sectorPrism(standStart, standEnd + 0.4, pavHalf, pavHeight, 0, pavMat);
    sectorPrism(standStart - 0.06, standStart + 0.35, pavHalf - 0.015, 3.2, 2.6, glassMat);
    sectorPrism(standStart + 1.8, standEnd + 0.8, pavHalf, 0.5, pavHeight, roofMat);
    for (let k = 0; k <= 8; k++) {
      const ph = -pavHalf + 0.02 + (k * (2 * pavHalf - 0.04)) / 8;
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, pavHeight, 0.5), colMat);
      col.position.set(Math.cos(ph) * (standStart + 1.5), pavHeight / 2, -Math.sin(ph) * (standStart + 1.5));
      scene.add(col);
    }

    // Scoreboard: a large board on posts atop the stands opposite the pavilion (west), facing
    // the field, in the same soft palette as the rest of the ground (pale frame, light face,
    // lavender / blue bars with the accent colour). The face is abstract, so it never shows a
    // made-up score.
    const sbCanvas = document.createElement('canvas');
    sbCanvas.width = 512;
    sbCanvas.height = 208;
    const sbCtx = sbCanvas.getContext('2d')!;
    sbCtx.fillStyle = '#f3f6fa';
    sbCtx.fillRect(0, 0, 512, 208);
    sbCtx.fillStyle = '#dde5ec';
    [26, 62].forEach((y) => sbCtx.fillRect(28, y, 456, 20));
    sbCtx.fillStyle = '#c7d0fe';
    sbCtx.fillRect(28, 112, 140, 60);
    sbCtx.fillStyle = '#a7b7fe';
    sbCtx.fillRect(186, 112, 140, 60);
    sbCtx.fillStyle = '#6379fc';
    sbCtx.fillRect(344, 112, 140, 60);
    const sbTex = new THREE.CanvasTexture(sbCanvas);
    sbTex.colorSpace = THREE.SRGBColorSpace;
    const sbFrameMat = new THREE.MeshStandardMaterial({ color: 0xdde5ec, emissive: 0xdde5ec, emissiveIntensity: 0.45, roughness: 0.8, fog: false });
    const sbGroup = new THREE.Group();
    const sbW = 24;
    const sbH = 9.8;
    const sbFrame = new THREE.Mesh(new THREE.BoxGeometry(sbW + 1, sbH + 1, 1.2), sbFrameMat);
    sbFrame.position.y = 4.5 + sbH / 2;
    const sbFace = new THREE.Mesh(new THREE.PlaneGeometry(sbW, sbH), new THREE.MeshBasicMaterial({ map: sbTex, fog: false }));
    sbFace.position.set(0, 4.5 + sbH / 2, 0.65);
    sbGroup.add(sbFrame, sbFace);
    [-8, 8].forEach((x) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.5, 0.9), sbFrameMat);
      post.position.set(x, 2.25, 0);
      sbGroup.add(post);
    });
    sbGroup.position.set(-(standStart + 1.6 * tierDepth), tierRise * 2, 0);
    sbGroup.lookAt(0, tierRise * 2, 0); // face (+z) toward the field, level
    scene.add(sbGroup);

    // Lines dividing the field into its 8 sections: 4 full diameters (straight
    // and both diagonals) at the section boundaries, out to the boundary rope.
    // 1 design px (boundaryRadius / 240 metres) thick, laid under the pitch.
    // Shown in Stat View only — the view toggle hides them in 3D View.
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xe2e2e5, side: THREE.DoubleSide, fog: false });
    dividerLineObjectsRef.current = [];
    [0, 45, 90, 135].forEach((deg) => {
      const lineGeom = new THREE.PlaneGeometry(boundaryRadius / 240, boundaryRadius * 2);
      const line = new THREE.Mesh(lineGeom, lineMat);
      line.rotation.order = 'YXZ';
      line.rotation.y = THREE.MathUtils.degToRad(-deg);
      line.rotation.x = -Math.PI / 2;
      line.position.y = 0.01;
      scene.add(line);
      dividerLineObjectsRef.current.push(line);
    });

    // Powerplay circle. The design draws it 240px across, with a 2px dashed
    // border (8px dash, 4px gap), so every size below is scaled from design px.
    const powerplayOuter = 120 * designPx;
    const powerplayInner = powerplayOuter - 2 * designPx;
    const dashCount = Math.round((2 * Math.PI * ((powerplayOuter + powerplayInner) / 2)) / (12 * designPx));
    const dashStep = (2 * Math.PI) / dashCount; // dash + gap, so the pattern closes evenly
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false });
    for (let i = 0; i < dashCount; i++) {
      const dashGeom = new THREE.RingGeometry(powerplayInner, powerplayOuter, 4, 1, i * dashStep, dashStep * (8 / 12));
      const dash = new THREE.Mesh(dashGeom, dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.y = 0.05;
      scene.add(dash);
    }

    // Pitch
    const pitchGeom = new THREE.PlaneGeometry(3.05, 20.12);
    const pitchMat = new THREE.MeshStandardMaterial({ color: 0xc2a675, roughness: 0.9 });
    const pitch = new THREE.Mesh(pitchGeom, pitchMat);
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.y = 0.02;
    scene.add(pitch);

    // Crease marks
    const creaseMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 });
    [-8.8, 8.8].forEach((z) => {
      const creaseGeom = new THREE.PlaneGeometry(2.44, 0.12);
      const crease = new THREE.Mesh(creaseGeom, creaseMat);
      crease.rotation.x = -Math.PI / 2;
      crease.position.set(0, 0.03, z);
      scene.add(crease);

      // Wickets: 3 stumps with two bails, drawn larger than life (a real wicket is 23 cm wide)
      // so they read at field scale.
      const stumpH = 1.1;
      const stumpGap = 0.3;
      const stumpMat = new THREE.MeshStandardMaterial({ color: 0xf6e7a8, emissive: 0xf6e7a8, emissiveIntensity: 0.45, roughness: 0.6 });
      [-stumpGap, 0, stumpGap].forEach((x) => {
        const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, stumpH, 10), stumpMat);
        stump.position.set(x, stumpH / 2, z);
        scene.add(stump);
      });
      [-stumpGap / 2, stumpGap / 2].forEach((x) => {
        const bail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, stumpGap * 0.95, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 }));
        bail.rotation.z = Math.PI / 2;
        bail.position.set(x, stumpH + 0.04, z);
        scene.add(bail);
      });
    });

    // Pitch details: popping creases (1.22 m in front of each set of stumps) with the return
    // creases, and two softly worn patches at the bowlers' length.
    const creaseLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.15 });
    creaseMaterialsRef.current = [creaseMat, creaseLineMat];
    [-1, 1].forEach((dir) => {
      const popping = new THREE.Mesh(new THREE.PlaneGeometry(3.66, 0.1), creaseLineMat);
      popping.rotation.x = -Math.PI / 2;
      popping.position.set(0, 0.035, dir * (8.8 - 1.22));
      scene.add(popping);
      [-1.32, 1.32].forEach((x) => {
        const ret = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 2.6), creaseLineMat);
        ret.rotation.x = -Math.PI / 2;
        ret.position.set(x, 0.035, dir * (8.8 - 1.22 + 0.4));
        scene.add(ret);
      });
      const wear = new THREE.Mesh(
        new THREE.CircleGeometry(1, 24),
        new THREE.MeshBasicMaterial({ color: 0xa88b58, transparent: true, opacity: 0.4, fog: false }),
      );
      wear.rotation.x = -Math.PI / 2;
      wear.scale.set(0.8, 2.2, 1); // x radial before rotation: narrow across, long along the pitch
      wear.position.set(0, 0.025, dir * 3.8);
      scene.add(wear);
    });
  };

  const disposeObject = (obj: THREE.Object3D) => {
    const mesh = obj as any;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m: any) => m?.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  };

  // Clear previous trajectories & sector objects
  const clearDrawings = () => {
    if (sceneRef.current) {
      animatedObjectsRef.current.forEach((obj) => {
        sceneRef.current?.remove(obj);
        disposeObject(obj);
      });
      animatedObjectsRef.current = [];

      sectorLineObjectsRef.current.forEach((obj) => {
        sceneRef.current?.remove(obj);
        disposeObject(obj);
      });
      sectorLineObjectsRef.current = [];
    }
    setShowRightHud(false);
  };

  // Smooth Camera Interpolation
  // Places the camera so the outer ring (300 design px = 81.25 m radius) fills
  // RING_FILL of the canvas's shorter side. The design's own sizes assume a
  // taller window than most screens give, so the ground is fitted to the
  // space it actually has.
  const fitCameraToCanvas = (canvasW: number, canvasH: number) => {
    const ringRadius = 300 * (boundaryRadius / 240);
    const halfFov = Math.tan(THREE.MathUtils.degToRad(22.5)); // camera FOV is 45°
    const height = ringRadius / (RING_FILL * halfFov * Math.min(1, canvasW / canvasH));
    statCameraHeightRef.current = height;
  };

  // Area boxes are drawn at a fixed screen size (the design's 84×31px) whatever
  // the field's size, so their text stays readable; they only shrink on a field
  // too small to hold them without overlapping. Sprites that ignore distance
  // are sized in units where 1 px = 2·tan(fov/2) / canvasHeight.
  const updateLabelSize = () => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    if (!container || !camera) return;
    const canvasH = container.clientHeight || 1;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const fieldPx = (2 * boundaryRadius * canvasH) / (2 * statCameraHeightRef.current * tanHalf);
    const boxScale = Math.min(1, Math.max(0.6, fieldPx / 400));
    const unitsPerPx = (2 * tanHalf) / canvasH;
    labelSizeRef.current = { w: 84 * boxScale * unitsPerPx, h: 31 * boxScale * unitsPerPx };
    statObjectsRef.current.forEach((obj) => {
      if (obj instanceof THREE.Sprite) obj.scale.set(labelSizeRef.current.w, labelSizeRef.current.h, 1);
    });
  };

  const setTilt = (minDeg: number, maxDeg: number) => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.minPolarAngle = THREE.MathUtils.degToRad(minDeg);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(maxDeg);
  };

  const smoothCameraTo = (pos: { x: number; y: number; z: number }, lookAt: { x: number; y: number; z: number }, duration: number) => {
    return new Promise<void>((resolve) => {
      let isDone = false;
      const done = () => {
        if (!isDone) {
          isDone = true;
          resolve();
        }
      };

      if (!cameraRef.current || !controlsRef.current) {
        done();
        return;
      }

      // Safety timeout in case TWEEN onComplete is throttled or delayed
      const timer = setTimeout(() => done(), duration + 350);

      new TWEEN.Tween(cameraRef.current.position)
        .to({ x: pos.x, y: pos.y, z: pos.z }, duration)
        .easing(TWEEN.Easing.Cubic.InOut)
        .start();

      new TWEEN.Tween(controlsRef.current.target)
        .to({ x: lookAt.x, y: lookAt.y, z: lookAt.z }, duration)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onComplete(() => {
          clearTimeout(timer);
          done();
        })
        .start();
    });
  };

  const convertShotTo3D = (shot: WagonWheelShot) => {
    const angleRad = THREE.MathUtils.degToRad(shot.angle || 0);
    // Only clamps to stop a shot rendering past the stands — boundaries/sixes
    // (~60-70m) should comfortably clear the rope at boundaryRadius (65m).
    const dist = Math.min(shot.distance || 50, boundaryRadius * 1.1);
    return new THREE.Vector3(Math.sin(angleRad) * dist, 0, -Math.cos(angleRad) * dist);
  };

  const createShotCurve = (from: THREE.Vector3, to: THREE.Vector3, heightFactor: number) => {
    const dist = from.distanceTo(to);
    const peakH = dist * heightFactor * 0.5;
    const mid = new THREE.Vector3((from.x + to.x) / 2, from.y + peakH, (from.z + to.z) / 2);
    return new THREE.QuadraticBezierCurve3(from, mid, to);
  };

  const animateSingleShot = (curve: THREE.QuadraticBezierCurve3, colorHex: number, tubeRadius: number, landingPt: THREE.Vector3, duration: number) => {
    return new Promise<void>((resolve) => {
      let isDone = false;
      const done = (reason: string) => {
        if (!isDone) {
          isDone = true;
          resolve();
        }
      };

      if (!sceneRef.current) {
        done('no-scene');
        return;
      }
      const scene = sceneRef.current;
      const fullPoints = curve.getPoints(60);
      const currentIdx = { value: 2 };

      const safetyTimer = setTimeout(() => done('safety-timeout'), duration + 500);

      // Opaque and fog-free so the colour is exactly the legend's (still transparent: true so the fade-out works).
      const tubeMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 1, fog: false });
      const glowMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        fog: false,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
      });

      let currentTube: THREE.Mesh | null = null;
      let currentGlow: THREE.Mesh | null = null;

      new TWEEN.Tween(currentIdx)
        .to({ value: fullPoints.length }, duration)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate(() => {
          const idx = Math.floor(currentIdx.value);
          if (idx < 2) return;

          const pts = fullPoints.slice(0, idx);
          const partCurve = new THREE.CatmullRomCurve3(pts);

          if (currentTube) {
            scene.remove(currentTube);
            currentTube.geometry.dispose();
          }
          if (currentGlow) {
            scene.remove(currentGlow);
            currentGlow.geometry.dispose();
          }

          const tubularSegments = Math.min(24, Math.max(6, idx * 2));
          const tubeGeom = new THREE.TubeGeometry(partCurve, tubularSegments, tubeRadius, 6, false);
          currentTube = new THREE.Mesh(tubeGeom, tubeMat);
          currentTube.renderOrder = 10;
          scene.add(currentTube);

          const glowGeom = new THREE.TubeGeometry(partCurve, tubularSegments, tubeRadius * 2.2, 6, false);
          currentGlow = new THREE.Mesh(glowGeom, glowMat);
          scene.add(currentGlow);
        })
        .onComplete(() => {
          clearTimeout(safetyTimer);
          if (currentTube) animatedObjectsRef.current.push(currentTube);
          if (currentGlow) animatedObjectsRef.current.push(currentGlow);

          // Landing Dot
          const dotGeom = new THREE.CircleGeometry(1.0, 16);
          const dotMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 1, fog: false });
          const dot = new THREE.Mesh(dotGeom, dotMat);
          dot.rotation.x = -Math.PI / 2;
          dot.position.set(landingPt.x, 0.06, landingPt.z);
          scene.add(dot);
          animatedObjectsRef.current.push(dot);

          // Pulse Ring
          const ringGeom = new THREE.RingGeometry(0.8, 1.8, 24);
          const ringMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.6, fog: false });
          const ring = new THREE.Mesh(ringGeom, ringMat);
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(landingPt.x, 0.07, landingPt.z);
          scene.add(ring);
          animatedObjectsRef.current.push(ring);

          new TWEEN.Tween(ring.scale)
            .to({ x: 2.5, y: 2.5, z: 2.5 }, 500)
            .easing(TWEEN.Easing.Quadratic.Out)
            .start();

          new TWEEN.Tween(ringMat)
            .to({ opacity: 0 }, 500)
            .onComplete(() => {
              scene.remove(ring);
              ring.geometry.dispose();
              ringMat.dispose();
            })
            .start();

          done('onComplete');
        })
        .start();
    });
  };

  // Color/arc-height/tube-thickness per shot, keyed off runs scored on that ball.
  const getShotStyle = (runs: number) => {
    if (runs >= 6) return { color: SHOT_COLOR_SIX, arcHeight: 1.2, tubeRadius: 0.4 };
    if (runs === 4) return { color: SHOT_COLOR_FOUR, arcHeight: 0.25, tubeRadius: 0.32 };
    if (runs >= 1) return { color: SHOT_COLOR_SMALL, arcHeight: 0.08, tubeRadius: 0.26 };
    return { color: 0x64748b, arcHeight: 0.05, tubeRadius: 0.22 };
  };

  const animateShotBatchSimultaneous = (shotList: WagonWheelShot[]) => {
    return new Promise<void>((resolve) => {
      if (shotList.length === 0) {
        resolve();
        return;
      }
      let completed = 0;
      const total = shotList.length;

      shotList.forEach((shot, i) => {
        const target = convertShotTo3D(shot);
        const { color, arcHeight, tubeRadius } = getShotStyle(shot.runs);
        const curve = createShotCurve(batsmanPosition, target, arcHeight);

        setTimeout(() => {
          animateSingleShot(curve, color, tubeRadius, target, 380).then(() => {
            completed++;
            if (completed >= total) resolve();
          });
        }, i * 8);
      });
    });
  };

  const fadeOutShotTrajectories = () => {
    return new Promise<void>((resolve) => {
      animatedObjectsRef.current.forEach((obj) => {
        if ((obj as any).material && (obj as any).material.opacity !== undefined) {
          new TWEEN.Tween((obj as any).material)
            .to({ opacity: 0 }, 800)
            .easing(TWEEN.Easing.Quadratic.Out)
            .start();
        }
      });

      setTimeout(() => {
        if (sceneRef.current) {
          animatedObjectsRef.current.forEach((obj) => {
            sceneRef.current?.remove(obj);
            disposeObject(obj);
          });
        }
        animatedObjectsRef.current = [];
        resolve();
      }, 850);
    });
  };

  // Same three colors as the shot animation and the legend chips in the info
  // bar: 1-3 runs = gold, 4s = blue, 6s = red.
  const getRunBucketColor = (runs: number) => (runs >= 6 ? SHOT_COLOR_SIX : runs === 4 ? SHOT_COLOR_FOUR : SHOT_COLOR_SMALL);

  // Final wagon wheel: every scoring shot gets its own thin line + landing
  // dot at its real (randomized) angle/distance, instead of one line per
  // fixed 8-way sector — so all 18 runs in an area show as their own marks
  // fanned across that wedge, not collapsed into a single average line.
  const drawAllShotLines = (shots: WagonWheelShot[]) => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    sectorLineObjectsRef.current.forEach((obj) => {
      scene.remove(obj);
      disposeObject(obj);
    });
    sectorLineObjectsRef.current = [];

    shots
      .filter((s) => (s.runs || 0) > 0)
      .forEach((shot) => {
        const end = convertShotTo3D(shot);
        const colorHex = getRunBucketColor(shot.runs);

        const start = new THREE.Vector3(batsmanPosition.x, 0.15, batsmanPosition.z);
        const lineCurve = new THREE.LineCurve3(start, new THREE.Vector3(end.x, 0.15, end.z));
        // Draw order, not depth, decides what's on top (the line, then the dot).
        const addPiece = (geom: THREE.BufferGeometry, color: number, order: number, double = false, opacity = 1) => {
          const mat = new THREE.MeshBasicMaterial({
            color, fog: false, transparent: true, opacity, depthTest: false, depthWrite: false,
            side: double ? THREE.DoubleSide : THREE.FrontSide,
          });
          const mesh = new THREE.Mesh(geom, mat);
          mesh.renderOrder = order;
          scene.add(mesh);
          sectorLineObjectsRef.current.push(mesh);
          return mesh;
        };

        if (shot.runs >= 6) {
          // A six travels through the air: a real arc (apex ≈ ¼ of the distance) rather than a
          // ground line, with a faint straight shadow on the turf so the height still reads
          // as the view is rotated or tilted.
          const airCurve = createShotCurve(
            start,
            new THREE.Vector3(end.x, 0.15, end.z),
            1.0,
          );
          addPiece(new THREE.TubeGeometry(lineCurve, 1, 0.3, 8, false), 0x0b2a12, 1, false, 0.22);
          addPiece(new THREE.TubeGeometry(airCurve, 64, 0.27, 8, false), colorHex, 2);
        } else {
          addPiece(new THREE.TubeGeometry(lineCurve, 1, 0.27, 8, false), colorHex, 2);
        }

        const dot = addPiece(new THREE.CircleGeometry(1.0, 16), colorHex, 4, true);
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(end.x, 0.18, end.z);
      });
  };

  const calculateAndShowDirectionalStats = (shots: WagonWheelShot[]) => {
    const totalRuns = shots.reduce((sum, s) => sum + (typeof s.runs === 'number' ? s.runs : 0), 0);

    // Prefer the exact field zone per shot (e.g. "Mid On" vs "Long On") when
    // available, so the breakdown matches what was actually picked on the
    // scorer's wagon-wheel step rather than a coarser 8-way angle bucket.
    const hasAreaData = shots.some((s) => !!s.area);

    if (hasAreaData) {
      const byArea = new Map<string, { balls: number; runs: number }>();
      shots.forEach((s) => {
        const key = s.area || 'Unknown';
        const runVal = typeof s.runs === 'number' ? s.runs : 0;
        const entry = byArea.get(key) || { balls: 0, runs: 0 };
        entry.balls += 1;
        entry.runs += runVal;
        byArea.set(key, entry);
      });

      const stats = Array.from(byArea.entries())
        .sort((a, b) => b[1].runs - a[1].runs)
        .map(([name, { balls, runs }], i) => ({
          name,
          balls,
          runs,
          percentage: totalRuns > 0 ? Math.round((runs / totalRuns) * 100) : 0,
          color: SECTORS[i % SECTORS.length].color,
        }));

      setSectorStats(stats);
      setShowRightHud(true);
      return;
    }

    // Fallback for older data with only angle/distance (no named area):
    // bucket into the 8 fixed field sectors instead.
    const stats = SECTORS.map((sec) => ({ ...sec, balls: 0, runs: 0, percentage: 0 }));

    shots.forEach((s) => {
      const angle = (((s.angle || 0) % 360) + 360) % 360;
      const runVal = typeof s.runs === 'number' ? s.runs : 0;
      const matched = stats.find((sec) => {
        if (sec.minAngle > sec.maxAngle) {
          return angle >= sec.minAngle || angle < sec.maxAngle;
        }
        return angle >= sec.minAngle && angle < sec.maxAngle;
      });
      if (matched) {
        matched.runs += runVal;
        matched.balls += 1;
      }
    });

    stats.forEach((st) => {
      st.percentage = totalRuns > 0 ? Math.round((st.runs / totalRuns) * 100) : 0;
    });

    setSectorStats(stats);
    setShowRightHud(true);
  };

  // Single direct pass: every shot animates together, then the field
  // breakdown appears. No staged categories, no banners.
  const startWagonWheelAnimation = async () => {
    if (isAnimating) return;
    const shots = activeData.shots || [];
    if (shots.length === 0) return;

    setIsAnimating(true);
    clearDrawings();

    // The shots play on the same top-down camera as Stat View — no camera move.
    setIsSceneLoading(false);
    await animateShotBatchSimultaneous(shots);
    await new Promise((r) => setTimeout(r, 300));

    await fadeOutShotTrajectories();
    drawAllShotLines(shots);
    calculateAndShowDirectionalStats(shots);

    setIsAnimating(false);
  };

  if (!isOpen) return null;

  // Chip counts describe the whole innings (API summary / every ball), not just
  // the plotted shots — a ball with no field zone is still a four.
  const chipShots = activeData.shots || [];
  const smallScoreCount = activeData.smallScores ?? chipShots.filter((s) => s.runs >= 1 && s.runs <= 3).length;
  const fourCount = activeData.fours ?? chipShots.filter((s) => s.runs === 4).length;
  const sixCount = activeData.sixes ?? chipShots.filter((s) => s.runs === 6).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200 select-none text-white">
      <div className="relative w-full max-w-[1050px] h-[94vh] max-h-[900px] bg-white rounded-[28px] overflow-hidden shadow-2xl flex flex-col">

        {/* Header */}
        <div className="relative z-40 flex h-[77px] shrink-0 items-center justify-between border-b border-[#E1E3E4] bg-white px-6 py-4">
          <h2 className={`${manrope.className} text-[24px] font-semibold leading-[30px] tracking-[-0.32px] text-[#191C1D]`}>
            Wagon Wheel
          </h2>

          <div className="flex items-center gap-[33px]">
            <div className="flex h-[44px] w-[235px] items-center rounded-[10px] border border-[#E5E7EB] bg-white p-[3px]">
              {([
                { key: 'stats', label: 'Stat View' },
                { key: '3d', label: '3D View' },
              ] as const).map((opt) => {
                const active = viewMode === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setViewMode(opt.key)}
                    style={{ fontFamily: active ? SWITZER_FONT : inter.style.fontFamily }}
                    className={`h-[36px] flex-1 cursor-pointer rounded-[10px] text-center text-[16px] transition-colors ${
                      active
                        ? 'bg-[#0D0D12] font-semibold leading-[140%] text-white'
                        : 'font-medium leading-[18px] text-[#121212] hover:bg-[#F4F4F5]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-[44px] w-[44px] cursor-pointer items-center justify-center rounded-full border border-[#DEE5ED] bg-white transition-colors hover:bg-slate-50"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 1L11 11M11 1L1 11" stroke="#172B42" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Batsman info + shot colour key */}
        {/* Floats over the top of the field instead of reserving a full-width row, so the
            field gets all the space under the header and only the box's own area is covered. */}
        <div className="pointer-events-none absolute left-6 right-6 top-[93px] z-20">
          <div className={`pointer-events-auto flex items-center rounded-[12px] border border-[#E1E3E4] bg-[#F3F4F5] ${
            // 3D View: full width, name on the left and the colour key on the right.
            // Stat View: only the name and score with smaller type so the box stays compact.
            viewMode === '3d' ? 'w-full justify-between gap-4 px-4 py-2.5' : 'w-fit max-w-full px-4 py-2.5'
          }`}>
            <div className="flex min-w-0 flex-col">
              <div className={`flex items-center gap-2 h-6`}>
                <span className={`${manrope.className} truncate ${'text-[16px] leading-6 tracking-[0.4px]'} font-semibold text-[#191C1D]`}>
                  {activeData.batsman}
                </span>
                <span style={{ fontFamily: SWITZER_FONT }} className={`shrink-0 whitespace-nowrap text-right font-normal text-[#5D5E61] text-[13px] leading-5`}>
                  {activeData.runsTotal}
                  {activeData.ballsTotal ? ` (${activeData.ballsTotal})` : ''}
                  {notOut ? '*' : ''}
                </span>
              </div>
              {subtitle && (
                <p style={{ fontFamily: SWITZER_FONT }} className={`truncate font-normal text-[#5D5E61] text-[12px] leading-4`}>
                  {subtitle}
                </p>
              )}
            </div>

            {/* The colour key explains the shot lines, which only exist in 3D View. */}
            {viewMode === '3d' && (
              <div className="flex shrink-0 items-center gap-3">
                {[
                  { label: '1-3 (Runs)',  count: smallScoreCount, dot: 'bg-[#C99528]', box: 'bg-[#FBF2DF] border-[#F0D497]',     text: 'text-[#C99528]', badge: 'bg-[#C99528]/20' },
                  { label: '4s (Fours)',  count: fourCount,       dot: 'bg-[#3F6AC9]', box: 'bg-[#3F6AC91A] border-[#7197EB]',   text: 'text-[#3F6AC9]', badge: 'bg-[#3F6AC9]/20' },
                  { label: '6s (sixes)',  count: sixCount,        dot: 'bg-[#EA3700]', box: 'bg-[#EA37001A] border-[#EA370080]', text: 'text-[#EA3700]', badge: 'bg-[#EA3700]/20' },
                ].map((chip) => (
                  <div key={chip.label} className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 ${chip.box}`}>
                    <span className={`h-2.5 w-2.5 rounded-full ${chip.dot}`} />
                    <span className={`${manrope.className} text-[14px] font-semibold leading-5 ${chip.text}`}>{chip.label}</span>
                    <span className={`${manrope.className} ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[12px] font-bold leading-none ${chip.badge} ${chip.text}`}>
                      {chip.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 3D Canvas Container: its own clipped panel, inset like the info bar above it, so a
            zoomed-in field is cut off at a visible edge with a gap, not under the bar. */}
        <div className="flex-1 min-h-0 bg-white pb-3">
        {/* In 3D View the full-width info bar covers the top, so the field is centred in the space below it. */}
        <div className={`relative h-full overflow-hidden ${viewMode === '3d' ? 'pt-[84px]' : ''}`}>
        <div ref={mountRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

        {/* Loading Overlay */}
        {/* Centred loader while the shot animation plays after switching to 3D View.
            pointer-events-none so the scene stays draggable underneath. top-[84px] matches
            the canvas's top padding in 3D View, so it's centred on the ground. */}
        {viewMode === '3d' && isAnimating && (
          <div className="absolute inset-x-0 bottom-0 top-[84px] z-30 flex flex-col items-center justify-center gap-3 pointer-events-none animate-in fade-in duration-200">
            <div className="w-10 h-10 rounded-full border-[3px] border-indigo-400/20 border-t-indigo-400 animate-spin" />
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.25em]">Loading 3D View</p>
          </div>
        )}

        {isSceneLoading && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-white animate-in fade-in duration-150">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading Wagon Wheel...</p>
          </div>
        )}
        </div>
        </div>

        {/* Right Directional Stats Matrix HUD — commented out for now */}
        {/*
        {showRightHud && (
          <div className="absolute bottom-6 right-6 z-40 w-72 bg-[#0f172a]/90 backdrop-blur-md rounded-2xl border border-white/10 p-4 shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-white/10">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Scoring Direction</span>
              <span className="text-xs font-black text-indigo-400">
                {activeData.shots?.reduce((sum, s) => sum + (s.runs || 0), 0)} RUNS
              </span>
            </div>

            <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
              {sectorStats.map((st) => (
                <div key={st.name} className="text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-slate-300 truncate">{st.name}</span>
                    <span className="text-[9px] font-bold text-slate-500">
                      {st.balls} ball{st.balls !== 1 ? 's' : ''} · {st.runs} run{st.runs !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${st.percentage}%`, backgroundColor: st.color }}
                      />
                    </div>
                    <span className="text-[10px] font-bold w-7 text-right" style={{ color: st.color }}>
                      {st.percentage}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        */}
      </div>
    </div>
  );
};
