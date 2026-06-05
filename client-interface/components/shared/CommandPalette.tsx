'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft, ShieldCheck } from 'lucide-react';
import { UserRole } from '@/lib/types';
import { getFlatNavItems, FlatNavItem } from '@/lib/config/navigation';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { useNavPreferences } from '@/lib/hooks/shared';

/**
 * Global quick-search / command palette (⌘K). Lists every page the current user
 * can actually open for their role — reusing the sidebar's permission rules — and
 * lets them jump straight there by keyboard. Mounted once per role inside Navigation,
 * so it's available app-wide. Opens via ⌘K / Ctrl+K or the `pathment:open-search` event.
 */
export function CommandPalette({ role }: { role: UserRole }) {
  const router = useRouter();
  const { can, canAny, canAccessAdmin, loading: permsLoading } = usePermissions();
  const { recordUsage } = useNavPreferences(role);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Every destination this user is allowed to reach (same filter as the sidebar).
  const pages = useMemo<FlatNavItem[]>(() => {
    const items = getFlatNavItems(role).filter((item) => {
      if (permsLoading) return true;
      if (item.requiresAdminArea && !canAccessAdmin) return false;
      if (item.permission && !can(item.permission)) return false;
      if (item.anyOf && !canAny(item.anyOf)) return false;
      return true;
    });
    // Surface the cross-portal "Admin area" jump for non-admins who have access.
    if (role !== 'admin' && !permsLoading && canAccessAdmin) {
      items.push({ path: '/admin', label: 'Admin area', icon: ShieldCheck });
    }
    return items;
  }, [role, permsLoading, canAccessAdmin, can, canAny]);

  // Filter + rank by the query (matches label and group/section name).
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    const scored = pages
      .map((p) => {
        const label = p.label.toLowerCase();
        const group = (p.group || '').toLowerCase();
        let score = -1;
        if (label.startsWith(q)) score = 0;
        else if (label.includes(q)) score = 1;
        else if (group.includes(q)) score = 2;
        else if (p.path.toLowerCase().includes(q)) score = 3;
        return { p, score };
      })
      .filter((s) => s.score >= 0)
      .sort((a, b) => a.score - b.score);
    return scored.map((s) => s.p);
  }, [pages, query]);

  // Reset highlight whenever the result set changes.
  useEffect(() => { setActive(0); }, [query, open]);

  const close = useCallback(() => { setOpen(false); setQuery(''); }, []);

  const go = useCallback((item: FlatNavItem) => {
    recordUsage(item.path);
    router.push(item.path);
    close();
  }, [recordUsage, router, close]);

  // Open via ⌘K / Ctrl+K (and the toolbar buttons that fire this event).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pathment:open-search', onOpen as EventListener);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pathment:open-search', onOpen as EventListener);
    };
  }, []);

  // Focus the input when the palette opens.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  if (!open) return null;

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const item = results[active]; if (item) go(item); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 sm:pt-[12vh] bg-slate-900/40 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Search pages"
    >
      <div
        className="w-full max-w-xl rounded-2xl glass shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onListKey}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-slate-100">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages…"
            className="flex-1 py-4 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="hidden sm:inline-block text-[11px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">No pages match “{query}”.</p>
          ) : (
            results.map((item, idx) => {
              const Icon = item.icon;
              const isActive = idx === active;
              return (
                <button
                  key={item.path}
                  data-idx={idx}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => go(item)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-brand-600' : 'text-slate-400'}`} />
                  <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
                  {item.group && <span className="text-xs text-slate-400 shrink-0">{item.group}</span>}
                  {isActive && <CornerDownLeft className="w-3.5 h-3.5 text-brand-400 shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-100 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1"><kbd className="border border-slate-200 rounded px-1">↑</kbd><kbd className="border border-slate-200 rounded px-1">↓</kbd> navigate</span>
          <span className="inline-flex items-center gap-1"><kbd className="border border-slate-200 rounded px-1">↵</kbd> open</span>
          <span className="ml-auto inline-flex items-center gap-1"><kbd className="border border-slate-200 rounded px-1">⌘</kbd><kbd className="border border-slate-200 rounded px-1">K</kbd></span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
