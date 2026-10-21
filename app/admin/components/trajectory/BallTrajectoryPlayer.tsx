"use client";

/**
 * BallTrajectoryPlayer
 *
 * Plays the one clip the ops team marked for a ball and draws its trajectory
 * over it the way the analytics ball tracker does (see TrackRenderer): a white
 * tube along full_trajectory that grows with the ball, and ball markers at the
 * pitch and impact points.
 *
 * It plays by itself from just before release; at impact the video stops on
 * that frame and the whole trajectory is drawn. No manual frame controls.
 *
 * Sync is by time, not frame number: analytics' frame_no counts from where
 * its decoder started (it only scans the clip's last seconds), so each frame
 * is placed by its real timestamp_ms from frame_timestamps and compared with
 * the presented frame's mediaTime (requestVideoFrameCallback).
 *
 * The clip plays through /api/video/stream, which converts it to H.264 with
 * frames kept 1:1 (HEVC camera files don't play in every browser).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Eye, EyeOff } from "lucide-react";
import { TrackRenderer } from "./TrackRenderer";

export interface MarkedPoint { x: number; y: number }

export interface BallTrajectory {
  ball_id: number;
  camera: string;
  s3_key: string;
  url: string | null;
  video_width: number;
  video_height: number;
  video_fps: number | null;
  frame_timestamps: { frame_no: number; timestamp_ms: number }[] | null;
  release_point: MarkedPoint;
  release_frame_no: number;
  pitch_point: MarkedPoint;
  pitch_frame_no: number;
  impact_point: MarkedPoint;
  impact_frame_no: number;
  shot_point: MarkedPoint | null;
  shot_frame_no: number | null;
  full_trajectory: { frame_no: number; x: number; y: number }[] | null;
  submitted_at: string;
}

const SPEEDS = [0.1, 0.25, 0.5, 1];
// Playback starts this long before release, as in the ball tracker.
const LEAD_SECONDS = 0.3;

export const MARKER_STYLES = {
  release: { label: "Release", color: "#38bdf8" },
  pitch:   { label: "Pitch",   color: "#facc15" },
  impact:  { label: "Impact",  color: "#34d399" },
  shot:    { label: "Shot",    color: "#c084fc" },
} as const;

export interface Marker {
  key: keyof typeof MARKER_STYLES;
  point: MarkedPoint;
  ms: number;    // real time in the clip
  frame: number; // frame index in the clip, as the player counts it
}

/** Marked points and the path, each with its real time in the clip. */
export function useTrajectoryTimeline(t: BallTrajectory) {
  return useMemo(() => {
    const fps = t.video_fps || 25;
    const stamps = t.frame_timestamps || [];
    const byFrame = new Map(stamps.map((e) => [Number(e.frame_no), Number(e.timestamp_ms)]));
    const ref = stamps[0];
    const msOf = (frameNo: number) =>
      byFrame.get(frameNo) ??
      (ref ? ref.timestamp_ms + ((frameNo - ref.frame_no) * 1000) / fps : (frameNo * 1000) / fps);
    const frameOf = (ms: number) => Math.round((ms * fps) / 1000);

    const marker = (key: Marker["key"], point: MarkedPoint | null, frameNo: number | null): Marker | null => {
      if (!point || frameNo === null || frameNo === undefined) return null;
      const ms = msOf(frameNo);
      return { key, point, ms, frame: frameOf(ms) };
    };
    const markers = [
      marker("release", t.release_point, t.release_frame_no),
      marker("pitch", t.pitch_point, t.pitch_frame_no),
      marker("impact", t.impact_point, t.impact_frame_no),
      marker("shot", t.shot_point, t.shot_frame_no),
    ].filter(Boolean) as Marker[];

    const path = [...(t.full_trajectory || [])]
      .sort((a, b) => a.frame_no - b.frame_no)
      .map((p) => ({ x: p.x, y: p.y, ms: msOf(p.frame_no) }));

    return { fps, markers, path, frameOf };
  }, [t]);
}

interface Props {
  trajectory: BallTrajectory;
}

export const BallTrajectoryPlayer: React.FC<Props> = ({ trajectory }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<TrackRenderer | null>(null);
  const finishedRef = useRef(false);

  const { fps, markers, path } = useTrajectoryTimeline(trajectory);
  const [speed, setSpeed] = useState(1);
  const [showTrack, setShowTrack] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [drawingReady, setDrawingReady] = useState(false);
  const ready = videoReady && drawingReady;
  // Read from the two "ready" callbacks, which start the delivery once both are true.
  const readyRef = useRef({ video: false, drawing: false, started: false });
  const startRef = useRef<() => void>(() => {});
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const src = trajectory.url ? `/api/video/stream?url=${encodeURIComponent(trajectory.url)}` : null;
  const width = trajectory.video_width;
  const height = trajectory.video_height;

  const release = markers.find((m) => m.key === "release");
  const impact = markers.find((m) => m.key === "impact");
  const startSeconds = release ? Math.max(0, release.ms / 1000 - LEAD_SECONDS) : 0;
  const impactSeconds = impact ? impact.ms / 1000 : path.length ? path[path.length - 1].ms / 1000 : Infinity;

  // The renderer lives as long as the canvas; it follows the canvas size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new TrackRenderer(canvas);
    rendererRef.current = renderer;
    renderer.ready.then(() => {
      if (rendererRef.current !== renderer) return;
      readyRef.current.drawing = true;
      setDrawingReady(true);
      startRef.current();
    });
    const observer = new ResizeObserver(() => renderer.resize());
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const at = (key: Marker["key"]) => {
      const m = markers.find((x) => x.key === key);
      return m ? { ms: m.ms, x: m.point.x, y: m.point.y } : null;
    };
    rendererRef.current?.setTrack({ width, height, points: path, pitch: at("pitch"), impact: at("impact") });
  }, [path, markers, width, height]);

  useEffect(() => { rendererRef.current?.setVisible(showTrack); }, [showTrack]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  // Once the ball reaches impact: hold the video on the impact frame and draw the whole trajectory.
  const finish = useCallback(() => {
    const v = videoRef.current;
    finishedRef.current = true;
    setFinished(true);
    if (v) {
      v.pause();
      v.currentTime = impactSeconds + 0.1 / fps; // undo any overshoot past the impact frame
    }
    rendererRef.current?.setProgressive(false);
  }, [impactSeconds, fps]);

  const showTime = useCallback((seconds: number) => {
    // Half a frame of slack: currentTime after a seek sits inside the frame, not on its start.
    rendererRef.current?.update(seconds * 1000 + 500 / fps);
    if (!finishedRef.current && seconds >= impactSeconds) finish();
  }, [fps, impactSeconds, finish]);

  // Follow every presented frame.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let handle = 0;
    let raf = 0;
    const rvfc = typeof v.requestVideoFrameCallback === "function";
    const onVideoFrame = (_: number, meta: VideoFrameCallbackMetadata) => {
      showTime(meta.mediaTime);
      handle = v.requestVideoFrameCallback(onVideoFrame);
    };
    const onRaf = () => {
      showTime(v.currentTime);
      raf = requestAnimationFrame(onRaf);
    };
    if (rvfc) handle = v.requestVideoFrameCallback(onVideoFrame);
    else raf = requestAnimationFrame(onRaf);
    return () => {
      if (rvfc) v.cancelVideoFrameCallback(handle);
      cancelAnimationFrame(raf);
    };
  }, [showTime]);

  // Play the delivery from just before release, growing the track with the ball.
  const playDelivery = () => {
    const v = videoRef.current;
    if (!v) return;
    finishedRef.current = false;
    setFinished(false);
    rendererRef.current?.setProgressive(true);
    v.currentTime = startSeconds + 0.1 / fps;
    v.play().catch(() => {});
  };

  // Start the delivery only once both the clip and the drawing are ready, so the track keeps up from the first frame.
  useEffect(() => {
    startRef.current = () => {
      const r = readyRef.current;
      if (!r.video || !r.drawing || r.started) return;
      r.started = true;
      playDelivery();
    };
  });

  const onLoadedMetadata = () => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
    readyRef.current.video = true;
    setVideoReady(true);
    startRef.current();
  };

  if (!src) {
    return (
      <div className="aspect-video w-full rounded-2xl bg-[#0b0e13] flex items-center justify-center text-sm text-slate-400">
        No playable link for the marked clip.
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* The stage has the clip's own aspect ratio and the video fills it, so the canvas maps 1:1 onto the picture. */}
      <div
        className="relative w-full bg-[#0b0e13] rounded-2xl md:rounded-[32px] overflow-hidden shadow-2xl"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <video
          ref={videoRef}
          src={src}
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={onLoadedMetadata}
          onError={() => setError("The clip could not be loaded.")}
          className="absolute inset-0 w-full h-full object-fill"
        />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        {!ready && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85">
            <div className="w-9 h-9 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-xs font-semibold text-slate-300">Preparing video…</p>
            <p className="text-[10px] text-slate-500 max-w-xs text-center">
              The first view of a clip converts it for frame-by-frame playback — later views open instantly
            </p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 text-sm text-red-300">{error}</div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-4 bg-white rounded-xl border border-slate-200 p-3 shadow-sm flex flex-wrap items-center gap-3 text-slate-800">
        <button
          onClick={playDelivery}
          disabled={!ready || !finished}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F1117] text-white text-[11px] font-bold hover:bg-slate-800 disabled:opacity-40"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Replay
        </button>

        <div className="flex items-center gap-3 ml-auto">
          <button
            onClick={() => setShowTrack((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-bold hover:bg-slate-50"
          >
            {showTrack ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showTrack ? "Hide trajectory" : "Show trajectory"}
          </button>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="text-[11px] font-bold border border-slate-200 rounded-lg px-2 py-1 bg-white"
            title="Playback speed"
          >
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </div>
      </div>
    </div>
  );
};
