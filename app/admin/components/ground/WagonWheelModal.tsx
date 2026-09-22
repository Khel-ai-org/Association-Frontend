"use client";

import React, { useEffect, useRef, useState } from 'react';
import { X, Eye, Loader2 } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as TWEEN from '@tweenjs/tween.js';
import { SAMPLE_WAGON_WHEEL_DATA, WagonWheelData, WagonWheelShot } from '@/lib/sampleWagonWheel';

interface WagonWheelModalProps {
  isOpen: boolean;
  onClose: () => void;
  batsmanName?: string;
  data?: WagonWheelData;
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

export const WagonWheelModal: React.FC<WagonWheelModalProps> = ({
  isOpen,
  onClose,
  batsmanName,
  data,
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
  const [viewMode, setViewMode] = useState<'3d' | 'stats'>('3d');

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
        percentage: totalRuns > 0 ? Math.round((runs / totalRuns) * 100) : 0,
        color: sec.color,
      };
    });
  }, [activeData.shots]);

  // Draw/clear the ground wedges whenever the view toggle changes, and hide
  // the shot-trajectory lines while in Stat View so only the zone sections
  // show (they're never disposed, just toggled, so 3D View comes back exactly
  // as it was).
  const hasToggledViewRef = useRef(false);

  useEffect(() => {
    const showShots = viewMode !== 'stats';
    animatedObjectsRef.current.forEach((obj) => { obj.visible = showShots; });
    sectorLineObjectsRef.current.forEach((obj) => { obj.visible = showShots; });
    // OFF-SIDE/ON-SIDE ground branding is redundant once the Stat View
    // wedges are up (they already convey the same split), so hide it there.
    sideLabelObjectsRef.current.forEach((obj) => { obj.visible = showShots; });

    // Skip the camera move on the initial mount — this effect always fires
    // once on mount too, and moving the camera here would fight with the
    // auto-play animation's own camera tween that starts around the same time.
    const isUserToggle = hasToggledViewRef.current;
    hasToggledViewRef.current = true;

    if (viewMode === 'stats') {
      // Pure straight-down camera — the flat ground wedges/labels only line
      // up with their true angular position from directly overhead; any x/z
      // offset introduces perspective skew that makes them look misaligned.
      if (isUserToggle) smoothCameraTo({ x: 0, y: 220, z: 0 }, { x: 0, y: 0, z: 0 }, 600);
      drawStatBreakdown(statViewAreas);
    } else {
      if (isUserToggle) smoothCameraTo({ x: 0, y: 160, z: 120 }, { x: 0, y: 0, z: 0 }, 600);
      clearStatObjects();
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
    setViewMode('3d');
    statObjectsRef.current = [];
    hasToggledViewRef.current = false;

    const container = mountRef.current;
    const width = container.clientWidth || window.innerWidth * 0.9;
    const height = container.clientHeight || 600;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.FogExp2(0x050510, 0.0018);
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

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    // 4. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 30;
    controls.maxDistance = 250;
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
      renderer.render(scene, camera);
    };
    animate();

    // Kick off the animation shortly after mount; the loader stays up
    // (see startWagonWheelAnimation) until shots actually start drawing,
    // so it never disappears before there's something to see.
    const startTimer = setTimeout(() => {
      startWagonWheelAnimation();
    }, 200);

    // Resize handler
    const handleResize = () => {
      if (!container || !cameraRef.current || !rendererRef.current) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      cameraRef.current.aspect = newW / newH;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(newW, newH);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(startTimer);
      window.removeEventListener('resize', handleResize);
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
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
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
  const createWedgeLabel = (name: string, percentage: number, colorCss: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    // Dark rounded backing so the text stays readable regardless of the
    // wedge's own color underneath it (the % is drawn in that same color).
    ctx.fillStyle = 'rgba(5, 5, 16, 0.85)';
    if ((ctx as any).roundRect) {
      ctx.beginPath();
      (ctx as any).roundRect(16, 16, 608, 224, 20);
      ctx.fill();
    } else {
      ctx.fillRect(16, 16, 608, 224);
    }
    ctx.strokeStyle = colorCss;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText(name, 320, 96);
    ctx.fillStyle = colorCss;
    ctx.font = 'bold 84px sans-serif';
    ctx.fillText(`${percentage}%`, 320, 184);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(24, 9.6, 1);
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

  // Each of the 8 directional zones is a fixed, full-boundary pie-slice —
  // every section always tiles the field the same size, no gaps. The %
  // share of runs is conveyed by the label and by fill intensity (more
  // opaque = more runs), not by shrinking the section.
  const drawStatBreakdown = (stats: typeof statViewAreas) => {
    if (!sceneRef.current || stats.length === 0) return;
    const scene = sceneRef.current;
    clearStatObjects();

    const maxPercentage = Math.max(...stats.map((s) => s.percentage), 1);
    const radius = boundaryRadius * 0.95;

    stats.forEach((stat, i) => {
      const center = AREA_WEDGE_CENTER[stat.name] ?? 0;
      // CircleGeometry's local angle runs opposite to the world-angle
      // convention used everywhere else (sin/-cos) once flattened onto the
      // ground via rotation.x = -90°: local = 90° - world. So the wedge's
      // lower world-angle bound (center - 22.5) maps to the LARGER local
      // theta, meaning the sweep must start from the upper bound's local angle.
      const thetaStart = THREE.MathUtils.degToRad(67.5 - center);
      const thetaLength = THREE.MathUtils.degToRad(45);
      const intensity = 0.25 + (stat.percentage / maxPercentage) * 0.5;

      const wedgeGeom = new THREE.CircleGeometry(radius, 24, thetaStart, thetaLength);
      const wedgeMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(stat.color),
        transparent: true,
        opacity: intensity,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      });
      const wedge = new THREE.Mesh(wedgeGeom, wedgeMat);
      wedge.rotation.x = -Math.PI / 2;
      // Centered on the true ground origin (where the boundary rope is
      // centered), not the crease/batsmanPosition — a full-field pie chart
      // must share the boundary's own center or it'll sit off to one side.
      wedge.position.set(0, 1, 0);
      wedge.renderOrder = 5 + i;
      scene.add(wedge);
      statObjectsRef.current.push(wedge);

      const midAngleRad = THREE.MathUtils.degToRad(center);
      const labelDist = Math.min(radius * 0.8, boundaryRadius * 0.85);
      const label = createWedgeLabel(stat.name, stat.percentage, stat.color);
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
      label.position.set(Math.sin(rad) * dist, 0.03, -Math.cos(rad) * dist);
      scene.add(label);
      sideLabelObjectsRef.current.push(label);
    });
  };

  // Build 3D Stadium geometry
  const buildStadium = (scene: THREE.Scene) => {
    // Grass Ground
    const grassGeom = new THREE.CircleGeometry(boundaryRadius + 12, 64);
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x112918,
      roughness: 0.8,
      metalness: 0.1,
    });
    const grass = new THREE.Mesh(grassGeom, grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    scene.add(grass);

    // Mown grass rings
    for (let r = 10; r < boundaryRadius; r += 8) {
      const ringGeom = new THREE.RingGeometry(r, r + 4, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x173821,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      scene.add(ring);
    }

    // Boundary Rope
    const ropeGeom = new THREE.TorusGeometry(boundaryRadius, 0.4, 8, 64);
    const ropeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const rope = new THREE.Mesh(ropeGeom, ropeMat);
    rope.rotation.x = Math.PI / 2;
    rope.position.y = 0.2;
    scene.add(rope);

    // Pitch
    const pitchGeom = new THREE.PlaneGeometry(3.05, 20.12);
    const pitchMat = new THREE.MeshStandardMaterial({ color: 0xc2a675, roughness: 0.9 });
    const pitch = new THREE.Mesh(pitchGeom, pitchMat);
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.y = 0.02;
    scene.add(pitch);

    // Crease marks
    const creaseMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [-8.8, 8.8].forEach((z) => {
      const creaseGeom = new THREE.PlaneGeometry(2.44, 0.12);
      const crease = new THREE.Mesh(creaseGeom, creaseMat);
      crease.rotation.x = -Math.PI / 2;
      crease.position.set(0, 0.03, z);
      scene.add(crease);

      // Wickets (3 stumps)
      [-0.22, 0, 0.22].forEach((x) => {
        const stumpGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.75, 8);
        const stumpMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
        const stump = new THREE.Mesh(stumpGeom, stumpMat);
        stump.position.set(x, 0.38, z);
        scene.add(stump);
      });
    });

    // Stadium Stands Ring
    const standGeom = new THREE.TorusGeometry(boundaryRadius + 8, 4, 8, 64);
    const standMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
    const stand = new THREE.Mesh(standGeom, standMat);
    stand.rotation.x = Math.PI / 2;
    stand.position.y = 2;
    scene.add(stand);
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

      const tubeMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.92 });
      const glowMat = new THREE.MeshBasicMaterial({
        color: colorHex,
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
          const dotMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
          const dot = new THREE.Mesh(dotGeom, dotMat);
          dot.rotation.x = -Math.PI / 2;
          dot.position.set(landingPt.x, 0.06, landingPt.z);
          scene.add(dot);
          animatedObjectsRef.current.push(dot);

          // Pulse Ring
          const ringGeom = new THREE.RingGeometry(0.8, 1.8, 24);
          const ringMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
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
    if (runs >= 6) return { color: 0xec4899, arcHeight: 1.2, tubeRadius: 0.4 };
    if (runs === 4) return { color: 0x06b6d4, arcHeight: 0.25, tubeRadius: 0.32 };
    if (runs >= 1) return { color: 0xf59e0b, arcHeight: 0.08, tubeRadius: 0.26 };
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

  // Same three colors as the shot animation and the top-left badges:
  // amber = 1-3 runs, cyan = fours, pink = sixes.
  const getRunBucketColor = (runs: number) => (runs >= 6 ? 0xec4899 : runs === 4 ? 0x06b6d4 : 0xf59e0b);

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
        const tubeGeom = new THREE.TubeGeometry(lineCurve, 1, 0.18, 6, false);
        const tubeMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(colorHex),
          transparent: true,
          opacity: 0.75,
        });
        const tubeLine = new THREE.Mesh(tubeGeom, tubeMat);
        scene.add(tubeLine);
        sectorLineObjectsRef.current.push(tubeLine);

        const dotGeom = new THREE.CircleGeometry(0.7, 12);
        const dotMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide });
        const dot = new THREE.Mesh(dotGeom, dotMat);
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(end.x, 0.18, end.z);
        scene.add(dot);
        sectorLineObjectsRef.current.push(dot);
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

    // Loader disappears at the exact moment motion starts — camera pan and
    // shot drawing run together instead of one after another, so there's
    // no gap where the loader is gone but the field is still just sitting still.
    setIsSceneLoading(false);
    await Promise.all([
      smoothCameraTo({ x: 10, y: 145, z: 130 }, { x: 0, y: 4, z: -8 }, 700),
      animateShotBatchSimultaneous(shots),
    ]);
    await new Promise((r) => setTimeout(r, 300));

    await fadeOutShotTrajectories();
    await smoothCameraTo({ x: 0, y: 180, z: 45 }, { x: 0, y: 0, z: 0 }, 1000);
    drawAllShotLines(shots);
    calculateAndShowDirectionalStats(shots);

    setIsAnimating(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200 select-none text-white">
      <div className="relative w-full max-w-[1100px] h-[85vh] max-h-[750px] bg-[#050510] rounded-[28px] overflow-hidden border border-indigo-500/20 shadow-2xl flex flex-col">
        
        {/* Top Header / HUD */}
        <div className="absolute top-4 left-4 z-40 flex items-center gap-3">
          <div className="bg-[#0f172a]/90 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 shadow-lg">
            <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mb-0.5">3D Wagon Wheel</p>
            <h3 className="text-base font-black text-white tracking-wide">
              {activeData.batsman}
              <span className="text-indigo-400 ml-1.5">
                {activeData.runsTotal}
                {activeData.ballsTotal ? ` (${activeData.ballsTotal})` : ''}
              </span>
            </h3>
            <div className="flex gap-1.5 mt-1">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                1-3s: {(activeData.shots || []).filter(s => s.runs >= 1 && s.runs <= 3).length}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                4s: {(activeData.shots || []).filter(s => s.runs === 4).length}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20">
                6s: {(activeData.shots || []).filter(s => s.runs === 6).length}
              </span>
            </div>
          </div>
        </div>

        {/* View Toggle */}
        <div className="absolute top-4 right-16 z-40 flex items-center gap-1 bg-[#0f172a]/90 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-lg">
          {([
            { key: '3d', label: '3D View' },
            { key: 'stats', label: 'Stat View' },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setViewMode(opt.key)}
              className={`px-3 py-1.5 text-[11px] font-bold rounded-full transition-all cursor-pointer ${
                viewMode === opt.key
                  ? 'bg-indigo-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-40 w-9 h-9 flex items-center justify-center rounded-full bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 border border-white/10 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 3D Canvas Container */}
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Loading Overlay */}
        {isSceneLoading && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#050510] animate-in fade-in duration-150">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading Wagon Wheel...</p>
          </div>
        )}

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
