"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getCountryCallingCode } from 'react-phone-number-input';
import { ChevronDown, Search, Check } from 'lucide-react';

// Custom country dropdown for react-phone-number-input (`countrySelectComponent`): a flag button that opens a
// searchable list (country name, code or dial code), about 6 rows tall with scrolling.
const ROW_HEIGHT = 40;
const VISIBLE_ROWS = 6;

export default function CountrySelect({ value, onChange, options, iconComponent: Icon, disabled, readOnly }: any) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const countries = useMemo(
    () => (options as any[]).filter((o) => o && o.value && !o.divider),
    [options]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, '');
    if (!q) return countries;
    return countries.filter((o) => {
      let dial = '';
      try { dial = getCountryCallingCode(o.value); } catch { /* unknown code */ }
      return String(o.label).toLowerCase().includes(q) || String(o.value).toLowerCase() === q || dial.startsWith(q);
    });
  }, [countries, query]);

  const openMenu = () => {
    if (disabled || readOnly) return;
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) {
      const menuHeight = ROW_HEIGHT * VISIBLE_ROWS + 60;
      const below = window.innerHeight - r.bottom;
      setPos({ left: r.left, top: below >= menuHeight || r.top < menuHeight ? r.bottom + 4 : r.top - menuHeight - 4 });
    }
    setQuery('');
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    const onResize = () => setOpen(false);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  return (
    <div className="relative flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        disabled={disabled}
        aria-label="Select country"
        className="flex items-center gap-1.5 pr-1 cursor-pointer disabled:cursor-not-allowed"
      >
        {value && Icon ? <Icon country={value} label={value} /> : <span className="text-xs text-gray-500">—</span>}
        <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 1000 }}
          className="w-72 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
        >
          <div className="relative p-2 border-b border-gray-100">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country"
              className="w-full pl-8 pr-3 py-2 text-sm text-gray-800 placeholder:text-gray-500 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-black"
            />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: ROW_HEIGHT * VISIBLE_ROWS }}>
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-500 italic">No country found</p>
            ) : (
              filtered.map((o) => {
                let dial = '';
                try { dial = getCountryCallingCode(o.value); } catch { /* unknown code */ }
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => { onChange(o.value); setOpen(false); }}
                    style={{ height: ROW_HEIGHT }}
                    className={`w-full flex items-center gap-3 px-3 text-left text-sm hover:bg-gray-50 cursor-pointer ${value === o.value ? 'bg-gray-50 font-semibold text-gray-900' : 'text-gray-700'}`}
                  >
                    {Icon && <Icon country={o.value} label={o.label} />}
                    <span className="flex-1 truncate">{o.label}</span>
                    {dial && <span className="text-xs text-gray-500 shrink-0">+{dial}</span>}
                    {value === o.value && <Check className="w-4 h-4 text-gray-900 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
