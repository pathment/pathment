'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
  /**
   * A second line under the label — what this option IS, as opposed to what it
   * is called.
   *
   * It exists because the alternative people reach for is `label: 'Name · kind
   * · status'`, and in a sidebar-width menu that single string truncates from
   * the right, eating the status first and then the name itself. Two lines let
   * the name keep the full width. Search matches this as well as the label.
   */
  description?: string;
  /**
   * Section heading this option belongs under. Options are rendered in the
   * order their groups first appear, so the caller controls the order by
   * ordering the array. Ungrouped options render first, with no heading.
   */
  group?: string;
  /** Small muted text pinned to the right of the row (e.g. "Read-only"). */
  meta?: string;
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
  disabled?: boolean;
  /**
   * Told what the person typed, so the caller can go and fetch matches.
   *
   * Needed when the real list is bigger than the options on hand — the city
   * picker holds 150,000 of them, so typing has to reach the server rather
   * than filter the fifty already downloaded. The built-in filter still runs
   * over whatever `options` currently holds, which keeps the menu responsive
   * between keystroke and response.
   */
  onSearch?: (query: string) => void;
}

/**
 * SelectMenu - the single, consistent single-select dropdown. Replaces native
 * `<select>` / `<datalist>` (whose popups the browser positions unpredictably and
 * can't be searched well) with a menu that always anchors to the trigger, opens
 * downward (flips up only when there isn't room), aligns to trigger width, caps
 * its height with a scroll, is dark-mode aware, keyboard accessible
 * (↑/↓/Enter/Esc), and - for long lists - type-to-filter searchable.
 */
export function SelectMenu({ value, onChange, options, placeholder = 'Select…', className = '', ariaLabel, searchable, disabled = false, onSearch }: SelectMenuProps) {
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
    // A caller fetching its own matches has already applied the term; filtering
    // the response by it again drops rows the server matched on a field this
    // component cannot see.
    if (onSearch) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.description || ''} ${o.group || ''}`.toLowerCase().includes(q));
  }, [options, query, onSearch]);

  const openMenu = () => {
    if (!triggerRef.current || disabled) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const rowHeight = options.some((o) => o.description) ? 52 : 40;
    const needed = Math.min(options.length * rowHeight + (withSearch ? 56 : 16), 320);
    setFlipUp(spaceBelow < needed && rect.top > spaceBelow);
    setQuery('');
    setActiveIdx(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
    requestAnimationFrame(() => (withSearch ? searchRef.current : menuRef.current)?.focus());
  };

  // Outside-click + Escape close; focus search (or menu) so keys work.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // Keep the active row in view as it changes.
  useEffect(() => {
    if (activeIdx >= 0) menuRef.current?.querySelector(`[data-idx="${activeIdx}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const choose = (v: string) => { onChange(v); setOpen(false); setQuery(''); triggerRef.current?.focus(); };

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu(); }
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
        onClick={() => { if (open) setOpen(false); else openMenu(); }}
        onKeyDown={onTriggerKey}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        // A truncated label with no tooltip leaves no way at all to read the
        // full name. Browsers only show `title` on a non-disabled element, so
        // this lives on the trigger rather than the inner span.
        title={selected ? [selected.label, selected.description].filter(Boolean).join(' — ') : undefined}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 border border-border rounded-xl text-sm text-foreground bg-card hover:border-brand-300 dark:hover:border-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selected?.icon}
          <span className="min-w-0 flex-1 text-left">
            <span className={`block truncate ${selected ? '' : 'text-slate-400'}`}>{selected?.label ?? placeholder}</span>
            {selected?.description && (
              <span className="block truncate text-[11px] font-normal text-slate-500 dark:text-slate-500">{selected.description}</span>
            )}
          </span>
        </span>
        {/*
          The selected option's `meta` stays visible on the trigger, not just
          in the open menu. For the clan picker that is the "Read-only" marker
          on a finished programme — otherwise the only clue you are looking at
          history is that scattered buttons are greyed out, which reads as a
          bug rather than as a scope.
        */}
        {selected?.meta && (
          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-700/60 dark:text-slate-300">
            {selected.meta}
          </span>
        )}
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
                  onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); onSearch?.(e.target.value); }}
                  placeholder="Search…"
                  className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          )}
          <div role="listbox" className="overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-slate-400 text-center">No matches</p>
            ) : filtered.map((o, i) => {
              const isSel = o.value === value;
              // A heading whenever the group changes. Driven by the array's
              // order rather than a separate structure, so a caller groups
              // simply by ordering — and an ungrouped list renders as before.
              const newGroup = o.group && o.group !== filtered[i - 1]?.group;
              return (
                <div key={o.value}>
                  {newGroup && (
                    <p className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {o.group}
                    </p>
                  )}
                  <button
                    type="button"
                    role="option"
                    data-idx={i}
                    aria-selected={isSel}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => choose(o.value)}
                    title={[o.label, o.description].filter(Boolean).join(' — ')}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      i === activeIdx
                        ? 'bg-brand-50 dark:bg-brand-500/15 text-brand-800 dark:text-brand-200'
                        : 'text-foreground hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0 flex-1">
                      {o.icon}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{o.label}</span>
                        {o.description && (
                          <span className="block truncate text-[11px] text-slate-500 dark:text-slate-500">{o.description}</span>
                        )}
                      </span>
                    </span>
                    {o.meta && !isSel && (
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-400">{o.meta}</span>
                    )}
                    {isSel && <Check className="w-4 h-4 text-brand-600 shrink-0" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default SelectMenu;
