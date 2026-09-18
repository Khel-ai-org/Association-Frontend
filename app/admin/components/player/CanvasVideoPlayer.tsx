"use client";

/**
 * CanvasVideoPlayer
 *
 * React UI wrapper around PlayerEngine.
 * Architecture is now identical to Ball-tracker-Z4:
 *
 *   src (S3 MP4 URL)
 *     → GET /api/video/info          (ffprobe metadata)
 *     → POST /api/video/preload      (background bulk extraction — like Python _start_extraction)
 *     → GET /api/video/frame?index=N (JPEG served from disk — like /api/clips/{id}/frame/{N})
 *     → FrameCache (LRU RAM, img.src = url — exact Z4 FrameSource)
 *     → PlayerEngine (canvas render loop — exact Z4 Player)
 *     → <canvas>
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Settings, Maximize, Minimize, ZoomIn, ZoomOut } from "lucide-react";
import { PlayerEngine, PlayerState, SPEEDS } from "./PlayerEngine";
import { MarkerMenu } from "./MarkerMenu";
import { AnnotationTool, Point } from "./AnnotationLayer";

// -------------------------------------------------------------------- //
// Props                                                                 //
// -------------------------------------------------------------------- //

interface CanvasVideoPlayerProps {
  src:       string | null;
  fps?:      number;
  title?:    string;
  subtitle?: string;
}

// -------------------------------------------------------------------- //
// Component                                                             //
// -------------------------------------------------------------------- //

export const CanvasVideoPlayer: React.FC<CanvasVideoPlayerProps> = ({
  src,
  fps = 25,
  title,
  subtitle,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const engineRef    = useRef<PlayerEngine | null>(null);

  const [state, setState] = useState<PlayerState>({
    frame: 0, frameCount: 0, currentTime: 0, duration: 0,
    playing: false, speed: 1, direction: 1, fps,
    timecode: "00:00.000", zoom: 1, cacheHitRate: 0,
    preloadStatus: 'idle',
  });

  const [loading,      setLoading]      = useState(false);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Marker & Annotation State
  const [activeTool, setActiveTool]   = useState<AnnotationTool>('select');
  const [activeColor, setActiveColor] = useState<string>('#ffcc33');
  const [textInputPos, setTextInputPos] = useState<Point | null>(null);
  const [textInputVal, setTextInputVal] = useState<string>('');

  const handleToolChange = (tool: AnnotationTool) => {
    setActiveTool(tool);
    engineRef.current?.annotations.setTool(tool);
  };

  const handleColorChange = (color: string) => {
    setActiveColor(color);
    engineRef.current?.annotations.setColor(color);
  };

  const handleClearAll = () => {
    engineRef.current?.annotations.clearAll();
  };

  const handlePointerDownCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTool === 'select') return;

    const engine = engineRef.current;
    if (!engine) return;

    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const normPt = engine.screenToNormalizedPoint(screenX, screenY);
    const res = engine.annotations.onPointerDown(normPt);

    if (res.requestTextInput && res.textPosition) {
      setTextInputPos(res.textPosition);
      setTextInputVal('');
    } else {
      canvas.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMoveCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTool === 'select') return;

    const engine = engineRef.current;
    if (!engine) return;

    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const normPt = engine.screenToNormalizedPoint(screenX, screenY);
    engine.annotations.onPointerMove(normPt);
  };

  const handlePointerUpCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTool === 'select') return;

    const engine = engineRef.current;
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

    engineRef.current?.annotations.addText(textInputPos, textInputVal);
    setTextInputPos(null);
    setTextInputVal('');
  };

  // ================================================================== //
  // Mount — create PlayerEngine once                                   //
  // ================================================================== //

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new PlayerEngine(canvasRef.current);
    engineRef.current = engine;

    const offs = [
      engine.on('transport', (st: PlayerState) => setState({ ...st })),
      engine.on('tick',      (st: PlayerState) => setState({ ...st })),
      engine.on('seek',      (st: PlayerState) => setState({ ...st })),
      engine.on('clip',      (st: PlayerState) => setState({ ...st })),
      engine.on('preload',   () => setState(prev => ({
        ...prev,
        preloadStatus: engine.preloadStatus,
      }))),
    ];

    return () => {
      offs.forEach(off => (off as Function)());
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // ================================================================== //
  // Keyboard Shortcuts — Exact 1:1 match of Z4 reference (app.js)      //
  // ================================================================== //

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
         target.tagName === 'TEXTAREA' ||
         target.tagName === 'SELECT' ||
         target.isContentEditable)
      ) {
        if (event.key === 'Escape') target.blur();
        return;
      }

      const engine = engineRef.current;
      if (!engine || !engine.isReady) return;

      switch (event.key) {
        case ' ':
          event.preventDefault();
          engine.toggle();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          engine.step(event.shiftKey ? -5 : -1);
          break;
        case 'ArrowRight':
          event.preventDefault();
          engine.step(event.shiftKey ? 5 : 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          engine.nudgeSpeed(1);
          break;
        case 'ArrowDown':
          event.preventDefault();
          engine.nudgeSpeed(-1);
          break;
        case 'Home':
          event.preventDefault();
          engine.seek(0);
          break;
        case 'End':
          event.preventDefault();
          engine.seek(engine.lastFrame);
          break;
        case '+':
        case '=':
          engine.setZoom(engine.effectiveScale() * 1.25);
          break;
        case '-':
          engine.setZoom(engine.effectiveScale() / 1.25);
          break;
        case '1':
          engine.setZoom(1);
          break;
        case 'f':
        case 'F':
          engine.fitToWindow();
          break;
        case 'm':
        case 'M':
          engine.view.mirrorH = !engine.view.mirrorH;
          engine.invalidate();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ================================================================== //
  // Mouse / Trackpad Wheel Scroll — Exact 1:1 match of Z4 annotate.js  //
  // ================================================================== //

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      const engine = engineRef.current;
      if (!engine || !engine.isReady) return;

      // Ctrl / Cmd / Alt + Scroll → Zoom In / Out
      if (event.ctrlKey || event.metaKey || event.altKey) {
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        engine.setZoom(engine.effectiveScale() * factor);
        return;
      }

      // Plain wheel scroll steps frames — exact 1:1 match of Z4 annotate.js line 72-73
      const step = event.shiftKey ? 5 : 1;
      const deltaFrame = event.deltaY > 0 ? step : -step;

      engine.pause();
      engine.step(deltaFrame);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Per-Camera Saved Annotations Store Map<videoUrl, Shape[]>
  const annotationsStoreRef = useRef<Map<string, any[]>>(new Map());
  const prevSrcRef = useRef<string | null>(null);

  // ================================================================== //
  // Load new src with per-camera saved drawings                        //
  // ================================================================== //

  useEffect(() => {
    if (!engineRef.current || !src) return;
    let cancelled = false;

    // Save previous camera annotations before loading new video
    if (prevSrcRef.current && engineRef.current) {
      annotationsStoreRef.current.set(
        prevSrcRef.current,
        engineRef.current.annotations.getShapes()
      );
    }
    prevSrcRef.current = src;

    setLoading(true);
    setLoadError(null);

    engineRef.current.loadVideo(src)
      .then(() => {
        if (!cancelled) {
          setLoading(false);
          // Restore saved annotations for this camera (or empty array if new)
          const saved = annotationsStoreRef.current.get(src) || [];
          engineRef.current?.annotations.setShapes(saved);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoading(false);
          setLoadError(err.message || "Failed to load video");
        }
      });

    return () => { cancelled = true; };
  }, [src]);

  // ================================================================== //
  // Controls                                                            //
  // ================================================================== //

  const togglePlay  = useCallback(() => engineRef.current?.toggle(), []);
  const handleStep  = useCallback((n: number) => engineRef.current?.step(n), []);
  const handleSpeed = useCallback((s: number) => {
    engineRef.current?.setSpeed(s);
    setShowSettings(false);
  }, []);
  const handleSeek  = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    engineRef.current?.seek(Number(e.target.value));
  }, []);
  const handleZoom  = useCallback((factor: number) => {
    if (!engineRef.current) return;
    engineRef.current.setZoom(engineRef.current.effectiveScale() * factor);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // ================================================================== //
  // Helpers                                                             //
  // ================================================================== //

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  };

  const isExtracting = state.preloadStatus === 'extracting';

  // ================================================================== //
  // Render                                                              //
  // ================================================================== //

  return (
    <div
      ref={containerRef}
      className="relative aspect-video bg-[#0b0e13] rounded-2xl md:rounded-[32px] overflow-hidden shadow-2xl group text-white"
    >
      {/* ---- Top-right tools ---- */}
      <div className="absolute top-4 right-4 md:top-6 md:right-6 flex gap-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {/* Marker Menu Dropdown (Line, Angle, Text, Brush, Clear All) */}
        <MarkerMenu
          activeTool={activeTool}
          activeColor={activeColor}
          onSelectTool={handleToolChange}
          onSelectColor={handleColorChange}
          onClearAll={handleClearAll}
        />

        <button onClick={() => handleZoom(1.25)} className="p-2 bg-white/10 backdrop-blur-md rounded-lg border border-white/20 hover:bg-white/20 transition-colors" title="Zoom In">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={() => handleZoom(0.8)} className="p-2 bg-white/10 backdrop-blur-md rounded-lg border border-white/20 hover:bg-white/20 transition-colors" title="Zoom Out">
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
                    className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg transition-colors ${state.speed === rate ? 'bg-blue-500 text-white font-bold' : 'text-slate-300 hover:bg-white/10'}`}
                  >
                    {rate}×
                    {state.speed === rate && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button onClick={toggleFullscreen} className="p-2 bg-white/10 backdrop-blur-md rounded-lg border border-white/20 hover:bg-white/20 transition-colors">
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDownCanvas}
        onPointerMove={handlePointerMoveCanvas}
        onPointerUp={handlePointerUpCanvas}
        className={`absolute inset-0 w-full h-full ${activeTool !== 'select' ? 'cursor-crosshair' : ''}`}
      />

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

      {/* ---- Center transport (Only visible in Select/Pointer mode) ---- */}
      {activeTool === 'select' && (
        <div className="absolute inset-0 flex items-center justify-center gap-3 md:gap-6 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <button onClick={() => handleStep(-5)} className="pointer-events-auto w-11 h-11 md:w-14 md:h-14 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 hover:bg-white/20 transition-colors">
            <span className="text-[9px] font-extrabold">−5F</span>
          </button>
          <button onClick={() => handleStep(-1)} className="pointer-events-auto w-10 h-10 md:w-12 md:h-12 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 hover:bg-white/20 transition-colors">
            <span className="text-[9px] font-extrabold">−1F</span>
          </button>
          <button onClick={togglePlay} className="pointer-events-auto w-14 h-14 md:w-20 md:h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center shadow-2xl hover:scale-105 hover:bg-white/30 transition-all border border-white/30">
            {state.playing
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

      {/* ---- Bottom progress bar with Integrated Transport ---- */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-4 md:px-8 pb-4 md:pb-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="bg-black/75 backdrop-blur-md rounded-xl md:rounded-2xl border border-white/15 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[10px] md:text-xs font-mono font-bold">
            <span className="text-slate-300">{state.timecode}</span>
            <span className="text-blue-400">Frame {state.frame} / {Math.max(0, state.frameCount - 1)}</span>
            <span className="text-slate-300">{fmtTime(state.duration)}</span>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, state.frameCount - 1)}
            value={state.frame}
            onChange={handleSeek}
            className="w-full h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer accent-blue-500"
          />

          {/* Compact Integrated Transport Controls */}
          <div className="flex items-center justify-center gap-2 pt-1 border-t border-white/10">
            <button onClick={() => handleStep(-5)} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-extrabold transition-colors">−5F</button>
            <button onClick={() => handleStep(-1)} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-extrabold transition-colors">−1F</button>
            <button onClick={togglePlay} className="p-1.5 bg-blue-600 hover:bg-blue-500 rounded-full transition-colors mx-1">
              {state.playing ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white ml-0.5" />}
            </button>
            <button onClick={() => handleStep(1)} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-extrabold transition-colors">+1F</button>
            <button onClick={() => handleStep(5)} className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-extrabold transition-colors">+5F</button>
          </div>
        </div>
      </div>
    </div>
  );
};
