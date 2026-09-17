"use client";

import React, { useEffect, useRef, useState } from 'react';
import { X, Play, RotateCcw, Eye } from 'lucide-react';
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

const SECTORS = [
  { name: 'Straight / Long-On', minAngle: 337.5, maxAngle: 22.5,  color: '#6366f1' },
  { name: 'Mid-Wicket',         minAngle: 22.5,  maxAngle: 67.5,  color: '#8b5cf6' },
  { name: 'Square Leg',         minAngle: 67.5,  maxAngle: 112.5, color: '#ec4899' },
  { name: 'Fine Leg',           minAngle: 112.5, maxAngle: 157.5, color: '#f43f5e' },
  { name: 'Behind Wickets',     minAngle: 157.5, maxAngle: 202.5, color: '#ef4444' },
  { name: 'Third Man / Point',  minAngle: 202.5, maxAngle: 247.5, color: '#10b981' },
  { name: 'Cover / Extra Cover',minAngle: 247.5, maxAngle: 292.5, color: '#06b6d4' },
  { name: 'Mid-Off / Long-Off', minAngle: 292.5, maxAngle: 337.5, color: '#3b82f6' },
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

  const [phaseBanner, setPhaseBanner] = useState<{ visible: boolean; text: string; color: string }>({
    visible: false,
    text: '',
    color: '#6366f1',
  });

  const [isAnimating, setIsAnimating] = useState(false);
  const [showRightHud, setShowRightHud] = useState(false);
  const [sectorStats, setSectorStats] = useState<Array<{ name: string; runs: number; percentage: number; color: string }>>([]);

  // Internal refs for Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animatedObjectsRef = useRef<THREE.Object3D[]>([]);
  const sectorLineObjectsRef = useRef<THREE.Object3D[]>([]);
  const animationFrameIdRef = useRef<number | null>(null);

  const boundaryRadius = 65;
  const batsmanPosition = new THREE.Vector3(0, 0.1, 0);

  useEffect(() => {
    if (!isOpen || !mountRef.current) return;

    const container = mountRef.current;
    const width = container.clientWidth || window.innerWidth * 0.9;
    const height = container.clientHeight || 600;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.FogExp2(0x050510, 0.0018);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 160, 120);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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

    // 7. Render Loop
    const animate = (time?: number) => {
      animationFrameIdRef.current = requestAnimationFrame(animate);
      TWEEN.update(time);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

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
      window.removeEventListener('resize', handleResize);
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      clearDrawings();
      if (rendererRef.current && rendererRef.current.domElement) {
        container.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, [isOpen]);

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
    setPhaseBanner({ visible: false, text: '', color: '#6366f1' });
  };

  // Smooth Camera Interpolation
  const smoothCameraTo = (pos: { x: number; y: number; z: number }, lookAt: { x: number; y: number; z: number }, duration: number) => {
    return new Promise<void>((resolve) => {
      let isDone = false;
      const done = (reason: string) => {
        if (!isDone) {
          isDone = true;
          console.log(`[WagonWheel] smoothCameraTo finished via ${reason}`);
          resolve();
        }
      };

      if (!cameraRef.current || !controlsRef.current) {
        done('no-refs');
        return;
      }

      // Safety timeout in case TWEEN onComplete is throttled or delayed
      const timer = setTimeout(() => done('timeout-fallback'), duration + 350);

      new TWEEN.Tween(cameraRef.current.position)
        .to({ x: pos.x, y: pos.y, z: pos.z }, duration)
        .easing(TWEEN.Easing.Cubic.InOut)
        .start();

      new TWEEN.Tween(controlsRef.current.target)
        .to({ x: lookAt.x, y: lookAt.y, z: lookAt.z }, duration)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onComplete(() => {
          clearTimeout(timer);
          done('onComplete');
        })
        .start();
    });
  };

  const convertShotTo3D = (shot: WagonWheelShot) => {
    const angleRad = THREE.MathUtils.degToRad(shot.angle || 0);
    const dist = Math.min(shot.distance || 50, boundaryRadius * 0.95);
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

  const animateShotBatchSimultaneous = (shotList: WagonWheelShot[], colorHex: number, arcHeight: number, tubeRadius: number) => {
    return new Promise<void>((resolve) => {
      if (shotList.length === 0) {
        resolve();
        return;
      }
      let completed = 0;
      const total = shotList.length;

      shotList.forEach((shot, i) => {
        const target = convertShotTo3D(shot);
        const curve = createShotCurve(batsmanPosition, target, arcHeight);

        setTimeout(() => {
          animateSingleShot(curve, colorHex, tubeRadius, target, 800).then(() => {
            completed++;
            if (completed >= total) resolve();
          });
        }, i * 80);
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

  const drawSectorLines = () => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    sectorLineObjectsRef.current.forEach((obj) => {
      scene.remove(obj);
      disposeObject(obj);
    });
    sectorLineObjectsRef.current = [];

    SECTORS.forEach((sec) => {
      const edgeAngleRad = THREE.MathUtils.degToRad(sec.minAngle);
      const lineLength = boundaryRadius * 0.92;
      const endX = Math.sin(edgeAngleRad) * lineLength;
      const endZ = -Math.cos(edgeAngleRad) * lineLength;

      const start = new THREE.Vector3(batsmanPosition.x, 0.15, batsmanPosition.z);
      const end = new THREE.Vector3(endX, 0.15, endZ);
      const lineCurve = new THREE.LineCurve3(start, end);
      const tubeGeom = new THREE.TubeGeometry(lineCurve, 1, 0.35, 6, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(sec.color),
        transparent: true,
        opacity: 0.7,
      });
      const tubeLine = new THREE.Mesh(tubeGeom, tubeMat);
      scene.add(tubeLine);
      sectorLineObjectsRef.current.push(tubeLine);
    });
  };

  const calculateAndShowDirectionalStats = (shots: WagonWheelShot[]) => {
    const totalRuns = shots.reduce((sum, s) => sum + (typeof s.runs === 'number' ? s.runs : 0), 0);
    const stats = SECTORS.map((sec) => ({ ...sec, runs: 0, percentage: 0 }));

    shots.forEach((s) => {
      const angle = (((s.angle || 0) % 360) + 360) % 360;
      const runVal = typeof s.runs === 'number' ? s.runs : 0;
      const matched = stats.find((sec) => {
        if (sec.minAngle > sec.maxAngle) {
          return angle >= sec.minAngle || angle < sec.maxAngle;
        }
        return angle >= sec.minAngle && angle < sec.maxAngle;
      });
      if (matched) matched.runs += runVal;
    });

    stats.forEach((st) => {
      st.percentage = totalRuns > 0 ? Math.round((st.runs / totalRuns) * 100) : 0;
    });

    setSectorStats(stats);
    setShowRightHud(true);
  };

  // Trigger Full 4-Phase Sequential Animation
  const startWagonWheelAnimation = async () => {
    console.log('🚀 [WagonWheel] startWagonWheelAnimation clicked. isAnimating:', isAnimating);
    if (isAnimating) {
      console.warn('⚠️ [WagonWheel] Animation is already running! Ignoring click.');
      return;
    }
    const shots = activeData.shots || [];
    console.log('📊 [WagonWheel] Active shots dataset:', shots.length, shots);
    if (shots.length === 0) {
      console.warn('⚠️ [WagonWheel] No shots found in activeData!');
      return;
    }

    setIsAnimating(true);
    clearDrawings();

    const ones = shots.filter((s) => s.runs >= 1 && s.runs <= 3);
    const fours = shots.filter((s) => s.runs === 4);
    const sixes = shots.filter((s) => s.runs === 6);
    console.log(`🏏 [WagonWheel] Breakdown -> 1-3s: ${ones.length}, 4s: ${fours.length}, 6s: ${sixes.length}`);

    // Initial camera view
    console.log('📷 [WagonWheel] Moving camera to initial top-down view...');
    await smoothCameraTo({ x: 0, y: 180, z: 110 }, { x: 0, y: 0, z: 0 }, 1200);

    // Phase 1: Singles & Doubles
    if (ones.length > 0) {
      console.log('⚡ [WagonWheel] Starting Phase 1: Singles & Doubles');
      setPhaseBanner({ visible: true, text: 'Phase 1 · Singles & Doubles', color: '#f59e0b' });
      await smoothCameraTo({ x: -50, y: 130, z: 110 }, { x: 0, y: 0, z: -5 }, 1500);
      await animateShotBatchSimultaneous(ones, 0xf59e0b, 0.08, 0.3);
      await new Promise((r) => setTimeout(r, 800));
      setPhaseBanner({ visible: false, text: '', color: '#f59e0b' });
      await new Promise((r) => setTimeout(r, 400));
    }

    // Phase 2: Boundary Fours
    if (fours.length > 0) {
      console.log('⚡ [WagonWheel] Starting Phase 2: Boundary Fours');
      setPhaseBanner({ visible: true, text: 'Phase 2 · Boundary Fours', color: '#06b6d4' });
      await smoothCameraTo({ x: 70, y: 110, z: 100 }, { x: 0, y: 2, z: -5 }, 1800);
      await animateShotBatchSimultaneous(fours, 0x06b6d4, 0.25, 0.35);
      await new Promise((r) => setTimeout(r, 800));
      setPhaseBanner({ visible: false, text: '', color: '#06b6d4' });
      await new Promise((r) => setTimeout(r, 400));
    }

    // Phase 3: Maximum Sixes
    if (sixes.length > 0) {
      console.log('⚡ [WagonWheel] Starting Phase 3: Maximum Sixes');
      setPhaseBanner({ visible: true, text: 'Phase 3 · Maximum Sixes', color: '#ec4899' });
      await smoothCameraTo({ x: -40, y: 140, z: 120 }, { x: 0, y: 10, z: -5 }, 2000);
      await animateShotBatchSimultaneous(sixes, 0xec4899, 1.2, 0.45);
      await new Promise((r) => setTimeout(r, 1000));
      setPhaseBanner({ visible: false, text: '', color: '#ec4899' });
      await new Promise((r) => setTimeout(r, 400));
    }

    // Phase 4: Scoring Direction Breakdown
    console.log('📊 [WagonWheel] Starting Phase 4: Scoring Direction Breakdown');
    setPhaseBanner({ visible: true, text: 'Scoring Direction Breakdown', color: '#818cf8' });
    await fadeOutShotTrajectories();
    await smoothCameraTo({ x: 0, y: 180, z: 45 }, { x: 0, y: 0, z: 0 }, 2200);
    drawSectorLines();
    calculateAndShowDirectionalStats(shots);
    await new Promise((r) => setTimeout(r, 3000));
    setPhaseBanner({ visible: false, text: '', color: '#818cf8' });

    console.log('✅ [WagonWheel] Animation fully complete!');
    setIsAnimating(false);
  };

  const handleReset = () => {
    clearDrawings();
    smoothCameraTo({ x: 0, y: 160, z: 120 }, { x: 0, y: 0, z: 0 }, 1200);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200 select-none text-white">
      <div className="relative w-full max-w-[1100px] h-[85vh] max-h-[750px] bg-[#050510] rounded-[28px] overflow-hidden border border-indigo-500/20 shadow-2xl flex flex-col">
        
        {/* Top Header / HUD */}
        <div className="absolute top-4 left-4 z-40 flex items-center gap-3">
          <div className="bg-[#0f172a]/90 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 shadow-lg">
            <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mb-0.5">3D Wagon Wheel</p>
            <h3 className="text-base font-black text-white tracking-wide">{activeData.batsman}</h3>
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

        {/* Top Control Bar */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-[#0f172a]/90 backdrop-blur-md px-4 py-1.5 rounded-full border border-indigo-500/30 shadow-xl">
          <button
            onClick={startWagonWheelAnimation}
            disabled={isAnimating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs font-bold rounded-full transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>{isAnimating ? 'Animating...' : 'Animate'}</span>
          </button>

          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-full border border-white/10 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-40 w-9 h-9 flex items-center justify-center rounded-full bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 border border-white/10 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Phase Banner Overlay */}
        {phaseBanner.visible && (
          <div
            className="absolute top-20 left-1/2 -translate-x-1/2 z-40 px-6 py-2 bg-[#0f172a]/90 backdrop-blur-md border rounded-full text-xs font-black uppercase tracking-widest shadow-2xl transition-all animate-bounce"
            style={{ borderColor: phaseBanner.color, color: phaseBanner.color }}
          >
            {phaseBanner.text}
          </div>
        )}

        {/* 3D Canvas Container */}
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Right Directional Stats Matrix HUD */}
        {showRightHud && (
          <div className="absolute bottom-6 right-6 z-40 w-72 bg-[#0f172a]/90 backdrop-blur-md rounded-2xl border border-white/10 p-4 shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-white/10">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Scoring Direction</span>
              <span className="text-xs font-black text-indigo-400">
                {activeData.shots?.reduce((sum, s) => sum + (s.runs || 0), 0)} RUNS
              </span>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
              {sectorStats.map((st) => (
                <div key={st.name} className="flex items-center gap-2 text-xs">
                  <span className="text-[10px] font-semibold text-slate-300 w-28 truncate">{st.name}</span>
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
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
