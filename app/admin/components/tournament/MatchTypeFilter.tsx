"use client";

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export const MATCH_TYPE_FILTERS = ['All', 'T10', 'T20', 'ODI', 'TEST', 'CUSTOM'] as const;

interface MatchTypeFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export default function MatchTypeFilter({ value, onChange }: MatchTypeFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const label = (m: string) => (m === 'All' ? 'All Match Types' : m);

  return (
    <div ref={ref} className="relative w-full md:w-44">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-sm hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
      >
        <span className="truncate">{label(value)}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg py-1">
          {MATCH_TYPE_FILTERS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { onChange(m); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-50 cursor-pointer ${value === m ? 'text-slate-900 font-semibold' : 'text-slate-600'}`}
            >
              {label(m)}
              {value === m && <Check className="w-4 h-4 text-slate-900" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
