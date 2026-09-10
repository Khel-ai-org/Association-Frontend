"use client";

/**
 * SplitCanvasVideoPlayer
 *
 * Dual-canvas player supporting Split View (Side-by-Side and Overlay Blend).
 * Ported directly from Ball-tracker-Z4's compare architecture (app.js + player.js).
 *
 * Mode 1: Single       - Player A full size
 * Mode 2: Side-by-Side - Player A + Player B synchronized side by side
 * Mode 3: Overlay      - Player B blended over Player A with opacity slider
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Play, Pause, Settings, Maximize, Minimize, ZoomIn, ZoomOut,
  Columns, Square, Layers, RefreshCw, Link as LinkIcon, Unlink
} from "lucide-react";
import { PlayerEngine, PlayerState, SPEEDS } from "./PlayerEngine";
import { MarkerMenu } from "./MarkerMenu";
import { AnnotationTool, Point } from "./AnnotationLayer";

export type CompareMode = "single" | "side";

interface CompareOption {
  url: string;
  label: string;
}

interface SplitCanvasVideoPlayerProps {
  srcA: string | null;
  titleA?: string;
  subtitleA?: string;
  optionsB?: CompareOption[];
  srcB?: string | null;
  titleB?: string;
  subtitleB?: string;
  fps?: number;
}

export const SplitCanvasVideoPlayer: React.FC<SplitCanvasVideoPlayerProps> = ({
  srcA,
  titleA,
  subtitleA,
  optionsB = [],
  srcB: initialSrcB = null,
  titleB: initialTitleB,
  subtitleB: initialSubtitleB,
  fps = 25,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Canvases
  const canvasARef = useRef<HTMLCanvasElement>(null);
  const canvasBRef = useRef<HTMLCanvasElement>(null);

  // Engines
  const engineARef = useRef<PlayerEngine | null>(null);
  const engineBRef = useRef<PlayerEngine | null>(null);

  // View & Mode State
  const [mode, setMode] = useState<CompareMode>("single");
  const [activeSrcB, setActiveSrcB] = useState<string | null>(initialSrcB);
  const [activeTitleB, setActiveTitleB] = useState<string | undefined>(initialTitleB);
  const [isSyncLocked, setIsSyncLocked] = useState<boolean>(true);
  const [frameOffsetB, setFrameOffsetB] = useState<number>(0);

  // Auto-select first available camera option for B if none selected yet
  useEffect(() => {
    if (!activeSrcB && optionsB.length > 0) {
      setActiveSrcB(optionsB[0].url);
      setActiveTitleB(optionsB[0].label);
    }
  }, [optionsB, activeSrcB]);

  // Engine States
  const [stateA, setStateA] = useState<PlayerState>({
    frame: 0, frameCount: 0, currentTime: 0, duration: 0,
    playing: false, speed: 1, direction: 1, fps,
    timecode: "00:00.000", zoom: 1, cacheHitRate: 0,
    preloadStatus: 'idle',
  });

  const [stateB, setStateB] = useState<PlayerState>({
    frame: 0, frameCount: 0, currentTime: 0, duration: 0,
    playing: false, speed: 1, direction: 1, fps,
    timecode: "00:00.000", zoom: 1, cacheHitRate: 0,
    preloadStatus: 'idle',
  });

  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [errorA, setErrorA]     = useState<string | null>(null);
  const [errorB, setErrorB]     = useState<string | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Active Camera Focus Pane ('A' | 'B')
  const [activePane, setActivePane] = useState<'A' | 'B'>('A');

  // Marker & Annotation State
  const [activeTool, setActiveTool]   = useState<AnnotationTool>('select');
  const [activeColor, setActiveColor] = useState<string>('#ffcc33');
  const [textInputPos, setTextInputPos] = useState<{ point: Point; engineTarget: 'A' | 'B' } | null>(null);
  const [textInputVal, setTextInputVal] = useState<string>('');

  // ================================================================== //
  // Engine Initialization                                               //
  // ================================================================== //

  // Create Engine A once on mount
  useEffect(() => {
    if (canvasARef.current && !engineARef.current) {
      const eA = new PlayerEngine(canvasARef.current);
      engineARef.current = eA;
      eA.on('transport', (st: PlayerState) => setStateA({ ...st }));
      eA.on('tick',      (st: PlayerState) => setStateA({ ...st }));
      eA.on('seek',      (st: PlayerState) => setStateA({ ...st }));
      eA.on('clip',      (st: PlayerState) => setStateA({ ...st }));
      eA.on('preload',   () => setStateA(prev => ({ ...prev, preloadStatus: eA.preloadStatus })));
    }

    return () => {
      engineARef.current?.destroy();
      engineARef.current = null;
    };
  }, []);

  // Create Engine B whenever Canvas B mounts into the DOM (e.g. when entering split view)
  useEffect(() => {
    if (mode === "single") return;

    // Small delay to wait for canvas B element to render in DOM
    const timer = setTimeout(() => {
      if (canvasBRef.current && !engineBRef.current) {
        const eB = new PlayerEngine(canvasBRef.current);
        engineBRef.current = eB;
        eB.on('transport', (st: PlayerState) => setStateB({ ...st }));
        eB.on('tick',      (st: PlayerState) => setStateB({ ...st }));
        eB.on('seek',      (st: PlayerState) => setStateB({ ...st }));
        eB.on('clip',      (st: PlayerState) => setStateB({ ...st }));
        eB.on('preload',   () => setStateB(prev => ({ ...prev, preloadStatus: eB.preloadStatus })));

        if (activeSrcB) {
          setLoadingB(true);
          eB.loadVideo(activeSrcB)
            .then(() => {
              setLoadingB(false);
              // Instantly sync Engine B frame & UI state to current Engine A frame upon loading
              if (engineARef.current) {
                const targetFrame = engineARef.current.frame;
                eB.seek(targetFrame, false);
                setStateB(eB.state());
              }
            })
            .catch(() => setLoadingB(false));
        }
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [mode, activeSrcB]);

  // Sync B to A whenever A seeks or ticks (Z4 syncCompare logic)
  useEffect(() => {
    const eA = engineARef.current;
    const eB = engineBRef.current;
    if (!eA || !eB) return;

    const sync = () => {
      if (!isSyncLocked || mode === "single" || !eB.isReady) return;
      const targetB = eA.frame + frameOffsetB;
      eB.seek(targetB, false);
    };

    const offSeek = eA.on('seek', sync);
    const offTick = eA.on('tick', sync);

    return () => {
      (offSeek as Function)();
      (offTick as Function)();
    };
  }, [isSyncLocked, mode, frameOffsetB]);

  // Per-Camera Saved Annotations Store Map<videoUrl, Shape[]>
  const annotationsStoreRef = useRef<Map<string, any[]>>(new Map());
  const prevSrcARef = useRef<string | null>(null);
  const prevSrcBRef = useRef<string | null>(null);

  // Handle Load Video A with per-camera saved drawings
  useEffect(() => {
    if (!engineARef.current || !srcA) return;

    // Save previous camera A annotations before loading new video
    if (prevSrcARef.current && engineARef.current) {
      annotationsStoreRef.current.set(
        prevSrcARef.current,
        engineARef.current.annotations.getShapes()
      );
    }
    prevSrcARef.current = srcA;

    setLoadingA(true);
    setErrorA(null);
    engineARef.current.loadVideo(srcA)
      .then(() => {
        setLoadingA(false);
        // Restore saved annotations for this camera (or empty array if new)
        const saved = annotationsStoreRef.current.get(srcA) || [];
        engineARef.current?.annotations.setShapes(saved);
      })
      .catch((err) => { setLoadingA(false); setErrorA(err.message); });
  }, [srcA]);

  // Handle Load Video B with per-camera saved drawings
  useEffect(() => {
    if (!engineBRef.current || !activeSrcB) return;

    // Save previous camera B annotations before loading new video
    if (prevSrcBRef.current && engineBRef.current) {
      annotationsStoreRef.current.set(
        prevSrcBRef.current,
        engineBRef.current.annotations.getShapes()
      );
    }
    prevSrcBRef.current = activeSrcB;

    setLoadingB(true);
    setErrorB(null);
    engineBRef.current.loadVideo(activeSrcB)
      .then(() => {
        setLoadingB(false);
        // Restore saved annotations for this camera (or empty array if new)
        const saved = annotationsStoreRef.current.get(activeSrcB) || [];
        engineBRef.current?.annotations.setShapes(saved);
      })
      .catch((err) => { setLoadingB(false); setErrorB(err.message); });
  }, [activeSrcB]);

  // Window resize trigger for canvas bounds update
  useEffect(() => {
    requestAnimationFrame(() => {
      engineARef.current?.resize();
      engineBRef.current?.resize();
    });
  }, [mode]);

  // ================================================================== //
  // Keyboard Shortcuts                                                 //
  // ================================================================== //

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) {
        if (event.key === 'Escape') target.blur();
        return;
      }

      const eA = engineARef.current;
      const eB = engineBRef.current;
      if (!eA || !eA.isReady) return;

      switch (event.key) {
        case ' ':
          event.preventDefault();
          eA.toggle();
          if (mode !== 'single' && eB?.isReady) {
            eA.playing ? eB.play() : eB.pause();
          }
          break;
        case 'ArrowLeft':
          event.preventDefault();
          const stepBack = event.shiftKey ? -5 : -1;
          eA.step(stepBack);
          if (mode !== 'single' && isSyncLocked && eB?.isReady) {
            eB.seek(eA.frame + frameOffsetB);
          }
          break;
        case 'ArrowRight':
          event.preventDefault();
          const stepFwd = event.shiftKey ? 5 : 1;
          eA.step(stepFwd);
          if (mode !== 'single' && isSyncLocked && eB?.isReady) {
            eB.seek(eA.frame + frameOffsetB);
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          eA.nudgeSpeed(1);
          if (mode !== 'single' && eB?.isReady) eB.setSpeed(eA.speed);
          break;
        case 'ArrowDown':
          event.preventDefault();
          eA.nudgeSpeed(-1);
          if (mode !== 'single' && eB?.isReady) eB.setSpeed(eA.speed);
          break;
        case 'f':
        case 'F':
          eA.fitToWindow();
          if (mode !== 'single' && eB?.isReady) eB.fitToWindow();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, isSyncLocked, frameOffsetB]);

  // ================================================================== //
  // Mouse / Trackpad Wheel Scroll — Exact 1:1 match of Z4 annotate.js  //
  // ================================================================== //

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      const eA = engineARef.current;
      const eB = engineBRef.current;
      if (!eA || !eA.isReady) return;

      // Ctrl / Cmd / Alt + Scroll → Zoom In / Out on active focus camera
      if (event.ctrlKey || event.metaKey || event.altKey) {
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        const targetEngine = (mode !== 'single' && activePane === 'B') ? eB : eA;
        if (targetEngine?.isReady) {
          targetEngine.setZoom(targetEngine.effectiveScale() * factor);
        }
        return;
      }

      // Plain wheel scroll steps frames — exact 1:1 match of Z4 annotate.js line 72-73
      const step = event.shiftKey ? 5 : 1;
      const deltaFrame = event.deltaY > 0 ? step : -step;

      eA.pause();
      eA.step(deltaFrame);

      if (mode !== 'single' && isSyncLocked && eB?.isReady) {
        eB.pause();
        eB.seek(eA.frame + deltaFrame + frameOffsetB);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [mode, isSyncLocked, frameOffsetB, activePane]);

  // ================================================================== //
  // Controls                                                            //
  // ================================================================== //

  const togglePlay = useCallback(() => {
    const eA = engineARef.current;
    const eB = engineBRef.current;
    if (!eA) return;
    eA.toggle();
    if (mode !== 'single' && eB && isSyncLocked) {
      eA.playing ? eB.play() : eB.pause();
    }
  }, [mode, isSyncLocked]);

  const handleStep = useCallback((n: number) => {
    const eA = engineARef.current;
    const eB = engineBRef.current;
    if (!eA) return;
    eA.step(n);
    if (mode !== 'single' && eB && isSyncLocked) {
      eB.seek(eA.frame + frameOffsetB);
    }
  }, [mode, isSyncLocked, frameOffsetB]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const target = Number(e.target.value);
    const eA = engineARef.current;
    const eB = engineBRef.current;
    if (!eA) return;
    eA.seek(target);
    if (mode !== 'single' && eB && isSyncLocked) {
      eB.seek(target + frameOffsetB);
    }
  }, [mode, isSyncLocked, frameOffsetB]);

  const handleSpeed = useCallback((s: number) => {
    engineARef.current?.setSpeed(s);
    if (mode !== 'single' && engineBRef.current) engineBRef.current.setSpeed(s);
    setShowSettings(false);
  }, [mode]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const selectVideoB = (url: string) => {
    const opt = optionsB.find(o => o.url === url);
    setActiveSrcB(url);
    if (opt) setActiveTitleB(opt.label);
    if (mode === "single") setMode("side");
  };

  const handleToolChange = (tool: AnnotationTool) => {
    setActiveTool(tool);
    engineARef.current?.annotations.setTool(tool);
    engineBRef.current?.annotations.setTool(tool);
  };

  const handleColorChange = (color: string) => {
    setActiveColor(color);
    engineARef.current?.annotations.setColor(color);
    engineBRef.current?.annotations.setColor(color);
  };

  const handleClearAll = () => {
    engineARef.current?.annotations.clearAll();
    engineBRef.current?.annotations.clearAll();
  };

  const handlePointerDownCanvas = (
    e: React.PointerEvent<HTMLCanvasElement>,
    targetEngine: 'A' | 'B'
  ) => {
    if (activeTool === 'select') return;

    const engine = targetEngine === 'A' ? engineARef.current : engineBRef.current;
    if (!engine) return;

    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const normPt = engine.screenToNormalizedPoint(screenX, screenY);
    const res = engine.annotations.onPointerDown(normPt);

    if (res.requestTextInput && res.textPosition) {
      setTextInputPos({ point: res.textPosition, engineTarget: targetEngine });
      setTextInputVal('');
    } else {
      canvas.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMoveCanvas = (
    e: React.PointerEvent<HTMLCanvasElement>,
    targetEngine: 'A' | 'B'
  ) => {
    if (activeTool === 'select') return;

    const engine = targetEngine === 'A' ? engineARef.current : engineBRef.current;
    if (!engine) return;

    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const normPt = engine.screenToNormalizedPoint(screenX, screenY);
    engine.annotations.onPointerMove(normPt);
  };

  const handlePointerUpCanvas = (
    e: React.PointerEvent<HTMLCanvasElement>,
    targetEngine: 'A' | 'B'
  ) => {
    if (activeTool === 'select') return;

    const engine = targetEngine === 'A' ? engineARef.current : engineBRef.current;
    if (!engine) return;

    engine.annotations.onPointerUp();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleConfirmText = () => {
    if (!textInputPos || !textInputVal.trim()) {
      setTextInputPos(null);
      return;
    }

    const engine = textInputPos.engineTarget === 'A' ? engineARef.current : engineBRef.current;
    engine?.annotations.addText(textInputPos.point, textInputVal);

    setTextInputPos(null);
    setTextInputVal('');
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  };

  // ================================================================== //
  // Render Layouts                                                      //
  // ================================================================== //

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video bg-[#0b0e13] rounded-2xl md:rounded-[32px] overflow-hidden shadow-2xl group text-white flex flex-col"
    >
      {/* ---- Loading overlay ---- */}
      {(loadingA || loadingB) && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 backdrop-blur-sm">
          <div className="w-9 h-9 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-300 tracking-wide">
            {loadingA && loadingB ? "Loading videos…" : loadingA ? "Loading Camera A…" : "Loading Camera B…"}
          </p>
        </div>
      )}

      {/* ---- Extraction progress banner ---- */}
      {(stateA.preloadStatus === 'extracting' || stateB.preloadStatus === 'extracting') && !loadingA && !loadingB && (
        <div className="absolute top-0 left-0 right-0 z-40 flex items-center gap-2 px-4 py-2 bg-blue-600/20 backdrop-blur-md border-b border-blue-500/20">
          <div className="w-3 h-3 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin flex-shrink-0" />
          <p className="text-[10px] font-bold text-blue-300 tracking-wide">
            Extracting frames into server cache — first-time only, subsequent loads are instant
          </p>
        </div>
      )}

      {/* Top Header Toolbar */}
      <div className="absolute top-4 left-4 right-4 z-30 flex items-center justify-between pointer-events-none">
        {/* Title Badges */}
        <div className="flex gap-2 pointer-events-auto">
          <div className="bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/15">
            {subtitleA && <p className="text-[8px] uppercase tracking-widest opacity-60 font-bold mb-0.5">{subtitleA}</p>}
            <p className="text-xs md:text-sm font-bold">{titleA || "Camera A"}</p>
          </div>

          {mode !== "single" && activeSrcB && (
            <div className="bg-blue-950/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-blue-400/30">
              {initialSubtitleB && <p className="text-[8px] uppercase tracking-widest opacity-60 font-bold mb-0.5">{initialSubtitleB}</p>}
              <p className="text-xs md:text-sm font-bold text-blue-300">{activeTitleB || "Camera B"}</p>
            </div>
          )}
        </div>

        {/* View Mode & Controls */}
        <div className="flex items-center gap-2 pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Marker Menu Dropdown (Line, Angle, Text, Brush, Clear All) */}
          <MarkerMenu
            activeTool={activeTool}
            activeColor={activeColor}
            onSelectTool={handleToolChange}
            onSelectColor={handleColorChange}
            onClearAll={handleClearAll}
          />

          {/* Zoom controls (Targeting only the active selected camera A or B) */}
          <button
            onClick={() => {
              const target = (mode !== 'single' && activePane === 'B') ? engineBRef.current : engineARef.current;
              if (target) target.setZoom((target.effectiveScale() || 1) * 1.25);
            }}
            className="p-2 bg-white/10 backdrop-blur-md rounded-lg border border-white/20 hover:bg-white/20 transition-colors"
            title={`Zoom In (${mode !== 'single' ? (activePane === 'A' ? 'Cam A' : 'Cam B') : 'Active Video'})`}
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              const target = (mode !== 'single' && activePane === 'B') ? engineBRef.current : engineARef.current;
              if (target) target.setZoom((target.effectiveScale() || 1) / 1.25);
            }}
            className="p-2 bg-white/10 backdrop-blur-md rounded-lg border border-white/20 hover:bg-white/20 transition-colors"
            title={`Zoom Out (${mode !== 'single' ? (activePane === 'A' ? 'Cam A' : 'Cam B') : 'Active Video'})`}
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          {/* Speed picker */}
          <div className="relative">
            <button
              onClick={() => setShowSettings(v => !v)}
              className={`p-2 backdrop-blur-md rounded-lg border border-white/20 transition-colors ${showSettings ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20'}`}
            >
              <Settings className="w-4 h-4" />
            </button>
            {showSettings && (
              <div className="absolute top-11 right-0 w-36 bg-slate-900/95 backdrop-blur-md rounded-xl border border-white/10 shadow-2xl p-2 z-50">
                <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest px-2 mb-2">Playback Speed</p>
                <div className="flex flex-col gap-0.5">
                  {SPEEDS.map(rate => (
                    <button
                      key={rate}
                      onClick={() => handleSpeed(rate)}
                      className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg transition-colors ${stateA.speed === rate ? 'bg-blue-500 text-white font-bold' : 'text-slate-300 hover:bg-white/10'}`}
                    >
                      {rate}×
                      {stateA.speed === rate && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Split View Toggle Button */}
          <div className="flex bg-black/60 backdrop-blur-md rounded-lg p-1 border border-white/15 gap-1">
            <button
              onClick={() => setMode("single")}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md transition-colors ${mode === "single" ? "bg-blue-600 text-white" : "hover:bg-white/10 text-slate-400"}`}
              title="Single Video View"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Single</span>
            </button>
            <button
              onClick={() => {
                setMode("side");
                if (!activeSrcB && optionsB[0]) selectVideoB(optionsB[0].url);
                if (engineARef.current && engineBRef.current) {
                  engineBRef.current.seek(engineARef.current.frame, false);
                }
              }}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md transition-colors ${mode === "side" ? "bg-blue-600 text-white" : "hover:bg-white/10 text-slate-400"}`}
              title="Split View (Side by Side)"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Split View</span>
            </button>
          </div>

          {/* Camera B Dropdown Selector */}
          {optionsB.length > 0 && mode !== "single" && (
            <select
              value={activeSrcB || ""}
              onChange={(e) => selectVideoB(e.target.value)}
              className="bg-black/60 backdrop-blur-md text-xs text-slate-200 border border-white/15 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
            >
              <option value="" disabled>Select 2nd Camera…</option>
              {optionsB.map((opt, i) => (
                <option key={i} value={opt.url}>{opt.label}</option>
              ))}
            </select>
          )}

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} className="p-2 bg-white/10 backdrop-blur-md rounded-lg border border-white/20 hover:bg-white/20 transition-colors">
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div className="relative flex-1 w-full h-full flex overflow-hidden">
        {/* Canvas A */}
        <div className={`relative h-full transition-all duration-300 ${mode === 'side' ? 'w-1/2 border-r border-white/10' : 'w-full'}`}>
          <canvas
            ref={canvasARef}
            onPointerDown={(e) => {
              setActivePane('A');
              handlePointerDownCanvas(e, 'A');
            }}
            onPointerMove={(e) => handlePointerMoveCanvas(e, 'A')}
            onPointerUp={(e) => handlePointerUpCanvas(e, 'A')}
            className={`absolute inset-0 w-full h-full ${activeTool !== 'select' ? 'cursor-crosshair' : ''}`}
          />
          {loadingA && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <div className="w-7 h-7 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Canvas B */}
        {mode !== "single" && (
          <div className="relative h-full w-1/2 transition-all duration-300">
            {activeSrcB ? (
              <canvas
                ref={canvasBRef}
                onPointerDown={(e) => {
                  setActivePane('B');
                  handlePointerDownCanvas(e, 'B');
                }}
                onPointerMove={(e) => handlePointerMoveCanvas(e, 'B')}
                onPointerUp={(e) => handlePointerUpCanvas(e, 'B')}
                className={`absolute inset-0 w-full h-full ${activeTool !== 'select' ? 'cursor-crosshair' : ''}`}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-4 text-center">
                <p className="text-sm font-semibold text-slate-300 mb-1">No Secondary Camera Selected</p>
                <p className="text-xs text-slate-500">Pick a camera from the "Select 2nd Camera…" dropdown at top right</p>
              </div>
            )}

            {loadingB && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                <div className="w-7 h-7 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Text Prompt Popup Modal */}
      {textInputPos && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs">
          <div className="bg-slate-900 border border-white/20 p-4 rounded-xl shadow-2xl flex flex-col gap-3 w-80">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Add Text Annotation</h4>
            <input
              type="text"
              autoFocus
              placeholder="Enter note text…"
              value={textInputVal}
              onChange={(e) => setTextInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmText();
                if (e.key === 'Escape') setTextInputPos(null);
              }}
              className="bg-black/60 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
            <div className="flex justify-end gap-2 text-xs font-semibold">
              <button
                onClick={() => setTextInputPos(null)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmText}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                Add Text
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Center Transport Controls (Only visible in Select/Pointer mode) */}
      {activeTool === 'select' && (
        <div className="absolute inset-0 flex items-center justify-center gap-3 md:gap-6 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <button onClick={() => handleStep(-5)} className="pointer-events-auto w-11 h-11 md:w-14 md:h-14 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 hover:bg-white/20 transition-colors">
            <span className="text-[9px] font-extrabold">−5F</span>
          </button>
          <button onClick={() => handleStep(-1)} className="pointer-events-auto w-10 h-10 md:w-12 md:h-12 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 hover:bg-white/20 transition-colors">
            <span className="text-[9px] font-extrabold">−1F</span>
          </button>
          <button onClick={togglePlay} className="pointer-events-auto w-14 h-14 md:w-20 md:h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center shadow-2xl hover:scale-105 hover:bg-white/30 transition-all border border-white/30">
            {stateA.playing
              ? <Pause className="w-6 h-6 md:w-8 md:h-8 fill-white" />
              : <Play  className="w-6 h-6 md:w-8 md:h-8 fill-white ml-1" />}
          </button>
          <button onClick={() => handleStep(1)} className="pointer-events-auto w-10 h-10 md:w-12 md:h-12 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 hover:bg-white/20 transition-colors">
            <span className="text-[9px] font-extrabold">+1F</span>
          </button>
          <button onClick={() => handleStep(5)} className="pointer-events-auto w-11 h-11 md:w-14 md:h-14 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 hover:bg-white/20 transition-colors">
            <span className="text-[9px] font-extrabold">+5F</span>
          </button>
        </div>
      )}

      {/* Bottom Progress & Timeline Bar with Compact Integrated Transport */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-4 md:px-8 pb-4 md:pb-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="bg-black/75 backdrop-blur-md rounded-xl md:rounded-2xl border border-white/15 p-3 flex flex-col gap-2">
          {/* Top Row: Timecode, Camera Frames, Duration */}
          <div className="flex items-center justify-between text-[10px] md:text-xs font-mono font-bold">
            <span className="text-slate-300">{stateA.timecode}</span>
            <div className="flex items-center gap-4">
              {/* Cam A Inline Editable Frame */}
              <div className="flex items-center gap-1 text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 hover:border-blue-400/50 transition-colors">
                <span className="text-[10px] uppercase font-bold text-blue-300/80 tracking-wider">Cam A</span>
                <span className="text-blue-400/60 text-[10px]">#</span>
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, stateA.frameCount - 1)}
                  value={stateA.frame}
                  onChange={(e) => {
                    const valA = Math.max(0, Number(e.target.value) || 0);
                    engineARef.current?.seek(valA);
                    if (engineBRef.current && isSyncLocked) {
                      setFrameOffsetB(engineBRef.current.frame - valA);
                    }
                  }}
                  className="w-12 bg-transparent text-center text-xs font-mono font-bold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:bg-white/10 rounded"
                  title="Click to edit Cam A frame"
                />
                <span className="text-slate-400 text-[10px]">/ {Math.max(0, stateA.frameCount - 1)}</span>
              </div>

              {/* Cam B Inline Editable Frame */}
              {mode !== "single" && activeSrcB && (
                <div className="flex items-center gap-1 text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20 hover:border-purple-400/50 transition-colors">
                  <span className="text-[10px] uppercase font-bold text-purple-300/80 tracking-wider">Cam B</span>
                  <span className="text-purple-400/60 text-[10px]">#</span>
                  <input
                    type="number"
                    min={0}
                    max={Math.max(0, stateB.frameCount - 1)}
                    value={stateB.frame}
                    onChange={(e) => {
                      const valB = Math.max(0, Number(e.target.value) || 0);
                      if (engineBRef.current) {
                        if (isSyncLocked && engineARef.current) {
                          setFrameOffsetB(valB - engineARef.current.frame);
                        }
                        engineBRef.current.seek(valB);
                      }
                    }}
                    className="w-12 bg-transparent text-center text-xs font-mono font-bold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:bg-white/10 rounded"
                    title="Click to edit Cam B frame"
                  />
                  <span className="text-slate-400 text-[10px]">/ {Math.max(0, stateB.frameCount - 1)}</span>
                </div>
              )}
            </div>
            <span className="text-slate-300">{fmtTime(stateA.duration)}</span>
          </div>

          {/* Scrubber Range Input */}
          <input
            type="range"
            min={0}
            max={Math.max(0, stateA.frameCount - 1)}
            value={stateA.frame}
            onChange={handleSeek}
            className="w-full h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer accent-blue-500"
          />

          {/* Bottom Row: Compact Integrated Transport Buttons (always accessible) */}
          <div className="flex items-center justify-center gap-2 pt-1 border-t border-white/10">
            <button onClick={() => handleStep(-5)} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-extrabold transition-colors">−5F</button>
            <button onClick={() => handleStep(-1)} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-extrabold transition-colors">−1F</button>
            <button onClick={togglePlay} className="p-1.5 bg-blue-600 hover:bg-blue-500 rounded-full transition-colors mx-1">
              {stateA.playing ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white ml-0.5" />}
            </button>
            <button onClick={() => handleStep(1)} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-extrabold transition-colors">+1F</button>
            <button onClick={() => handleStep(5)} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-extrabold transition-colors">+5F</button>
          </div>
        </div>
      </div>
    </div>
  );
};
