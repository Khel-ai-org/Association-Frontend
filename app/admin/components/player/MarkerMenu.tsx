"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Pencil,
  Ruler,
  Compass,
  Type,
  Paintbrush,
  Eraser,
  Trash2,
  ChevronDown,
  Check
} from "lucide-react";
import { AnnotationTool } from "./AnnotationLayer";

interface MarkerMenuProps {
  activeTool: AnnotationTool;
  activeColor: string;
  onSelectTool: (tool: AnnotationTool) => void;
  onSelectColor: (color: string) => void;
  onClearAll: () => void;
}

const COLORS = [
  { label: "Yellow", hex: "#ffcc33" },
  { label: "Cyan", hex: "#38bdf8" },
  { label: "Red", hex: "#f43f5e" },
  { label: "Green", hex: "#22c55e" },
  { label: "White", hex: "#ffffff" },
];

export const MarkerMenu: React.FC<MarkerMenuProps> = ({
  activeTool,
  activeColor,
  onSelectTool,
  onSelectColor,
  onClearAll,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isDrawingActive = activeTool !== "select";

  return (
    <div ref={menuRef} className="relative inline-block text-left pointer-events-auto">
      {/* Main Marker Trigger Button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold backdrop-blur-md transition-all shadow-sm ${
          isDrawingActive
            ? "bg-blue-600/90 text-white border-blue-400"
            : "bg-black/60 text-slate-200 border-white/20 hover:bg-white/10"
        }`}
        title="Drawing & Measurement Tools"
      >
        <Pencil className="w-3.5 h-3.5" />
        <span>Marker</span>
        {isDrawingActive && (
          <span className="text-[10px] uppercase font-bold px-1 py-0.2 bg-white/20 rounded">
            {activeTool}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Options Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-11 left-0 w-48 bg-slate-900/95 backdrop-blur-md rounded-xl border border-white/15 shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest px-2.5 mb-1.5">
            Drawing Tools
          </p>

          <div className="flex flex-col gap-0.5 mb-2">
            {/* Select / Normal Pointer */}
            <button
              onClick={() => {
                onSelectTool("select");
                setIsOpen(false);
              }}
              className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                activeTool === "select"
                  ? "bg-blue-600 text-white font-bold"
                  : "text-slate-300 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <Pencil className="w-3.5 h-3.5 opacity-60" />
                <span>Pointer (Select Mode)</span>
              </div>
              {activeTool === "select" && <Check className="w-3.5 h-3.5" />}
            </button>

            {/* Line Tool */}
            <button
              onClick={() => {
                onSelectTool("line");
                setIsOpen(false);
              }}
              className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                activeTool === "line"
                  ? "bg-blue-600 text-white font-bold"
                  : "text-slate-300 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <Ruler className="w-3.5 h-3.5" />
                <span>Line</span>
              </div>
              {activeTool === "line" && <Check className="w-3.5 h-3.5" />}
            </button>

            {/* Angle Tool */}
            <button
              onClick={() => {
                onSelectTool("angle");
                setIsOpen(false);
              }}
              className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                activeTool === "angle"
                  ? "bg-blue-600 text-white font-bold"
                  : "text-slate-300 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <Compass className="w-3.5 h-3.5" />
                <span>Angle (°)</span>
              </div>
              {activeTool === "angle" && <Check className="w-3.5 h-3.5" />}
            </button>

            {/* Text Tool */}
            <button
              onClick={() => {
                onSelectTool("text");
                setIsOpen(false);
              }}
              className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                activeTool === "text"
                  ? "bg-blue-600 text-white font-bold"
                  : "text-slate-300 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <Type className="w-3.5 h-3.5" />
                <span>Text</span>
              </div>
              {activeTool === "text" && <Check className="w-3.5 h-3.5" />}
            </button>



            {/* Eraser Tool */}
            <button
              onClick={() => {
                onSelectTool("eraser");
                setIsOpen(false);
              }}
              className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                activeTool === "eraser"
                  ? "bg-blue-600 text-white font-bold"
                  : "text-slate-300 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <Eraser className="w-3.5 h-3.5" />
                <span>Eraser</span>
              </div>
              {activeTool === "eraser" && <Check className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Color Palette */}
          <div className="border-t border-white/10 pt-2 mb-2">
            <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest px-2.5 mb-1.5">
              Color
            </p>
            <div className="flex items-center justify-between px-2.5">
              {COLORS.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => onSelectColor(c.hex)}
                  className={`w-5 h-5 rounded-full border border-black/50 transition-transform ${
                    activeColor === c.hex ? "scale-125 ring-2 ring-blue-400" : "opacity-80 hover:opacity-100"
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* Clear All Button */}
          <div className="border-t border-white/10 pt-1.5">
            <button
              onClick={() => {
                onClearAll();
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 text-xs text-red-400 hover:bg-red-500/10 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
