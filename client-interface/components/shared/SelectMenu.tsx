'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectMenuProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Extra classes on the trigger wrapper (e.g. `w-full`). */
  className?: string;
  ariaLabel?: string;
  /**
   * Show a search box inside the menu. Defaults to auto: enabled once the list
   * is long enough to be annoying to scan (> 8 options). Pass false to force off.
   */
  searchable?: boolean;
}

/**
 * SelectMenu - the single, consistent single-select dropdown. Replaces native
 * `<select>` / `<datalist>` (whose popups the browser positions unpredictably and
 * can't be searched well) with a menu that always anchors to the trigger, opens
 * downward (flips up only when there isn't room), aligns to trigger width, caps
 * its height with a scroll, is dark-mode aware, keyboard accessible
 * (↑/↓/Enter/Esc), and - for long lists - type-to-filter searchable.
 */
export function SelectMenu({ value, onChange, options, placeholder = 'Select…', className = '', ariaLabel, searchable }: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const [flipUp, setFlipUp] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const withSearch = searchable ?? options.length > 8;
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Open downward by default; flip up only if there genuinely isn't room below.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const needed = Math.min(options.length * 40 + (withSearch ? 56 : 16), 320);
    setFlipUp(spaceBelow < needed && rect.top > spaceBelow);
  }, [open, options.length, withSearch]);

  // Outside-click + Escape close; focus search (or menu) so keys work.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIdx(Math.max(0, options.findIndex((o) => o.value === value)));
    requestAnimationFrame(() => (withSearch ? searchRef.current : menuRef.current)?.focus());
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the active row in view as it changes.
  useEffect(() => {
    if (activeIdx >= 0) menuRef.current?.querySelector(`[data-idx="${activeIdx}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const choose = (v: string) => { onChange(v); setOpen(false); setQuery(''); triggerRef.current?.focus(); };

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); }
  };
  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = filtered[activeIdx]; if (o) choose(o.value); }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-700 bg-card hover:border-slate-300 dark:hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <span className={`truncate ${selected ? '' : 'text-slate-400'}`}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          ref={menuRef}
          tabIndex={-1}
          onKeyDown={onListKey}
          className={`absolute left-0 right-0 z-50 ${flipUp ? 'bottom-full mb-1' : 'top-full mt-1'} flex flex-col max-h-80 rounded-xl glass shadow-xl dark:shadow-[0_8px_30px_rgba(0,0,0,0.6)] outline-none overflow-hidden`}
        >
          {withSearch && (
            <div className="p-2 border-b border-slate-200/70 dark:border-slate-700/70 bg-card">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
                  placeholder="Search…"
                  className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-card text-sm text-slate-700 dark:text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          )}
          <div role="listbox" className="overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-slate-400 text-center">No matches</p>
            ) : filtered.map((o, i) => {
              const isSel = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  data-idx={i}
                  aria-selected={isSel}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => choose(o.value)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    i === activeIdx
                      ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-800 dark:text-brand-200'
                      : 'text-slate-700 dark:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-100'
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {isSel && <Check className="w-4 h-4 text-brand-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default SelectMenu;
