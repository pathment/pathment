'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getNavigationLinks, type NavLink } from '@/lib/config/navigation';
import {
  loadNavPrefs, saveNavPrefs, applyNavPrefs, loadNavUsage, recordNavUsage, clearNavUsage,
  type RolePrefs, type RoleUsage,
} from '@/lib/config/navPreferences';
import type { UserRole } from '@/lib/types';

/**
 * Sidebar pin/reorder + ADAPTIVE ordering for the current user+role. Reads the
 * static nav config, overlays the saved order + pinned set, and — when the user
 * hasn't manually reordered — floats the items they use most toward the top via
 * a recency-weighted frequency (frecency) score. Usage is recorded on click but
 * the visible order is computed once per mount, so the menu never reshuffles
 * under the cursor mid-navigation (it adapts between sessions). Guards SSR with
 * a `mounted` flag.
 */
export function useNavPreferences(role: UserRole) {
  const base = useMemo(() => getNavigationLinks(role), [role]);
  const [prefs, setPrefs] = useState<RolePrefs | undefined>(undefined);
  const [usage, setUsage] = useState<RoleUsage | undefined>(undefined);
  const [now, setNow] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setMounted(true);
    setPrefs(loadNavPrefs()[role]);
    setUsage(loadNavUsage()[role]);
    setNow(Date.now());
  }, [role]);

  const links = useMemo(
    () => (mounted ? applyNavPrefs(base, prefs, usage, now) : base),
    [mounted, base, prefs, usage, now]
  );
  const pinned = useMemo(() => new Set(prefs?.pinned ?? []), [prefs]);

  const persist = useCallback((next: RolePrefs) => {
    setPrefs(next);
    const all = loadNavPrefs();
    all[role] = next;
    saveNavPrefs(all);
  }, [role]);

  const displayedOrder = useCallback((): string[] => links.map((l: NavLink) => l.path), [links]);

  // Pin/unpin without freezing the adaptive order (preserve manual flag/order as-is).
  const togglePin = useCallback((path: string) => {
    const current = prefs?.pinned ?? [];
    const nextPinned = current.includes(path) ? current.filter((p) => p !== path) : [...current, path];
    persist({ order: prefs?.order ?? [], pinned: nextPinned, manual: prefs?.manual });
  }, [prefs, persist]);

  // Manual move commits an explicit order (switches this role to manual mode).
  const move = useCallback((path: string, dir: -1 | 1) => {
    const order = displayedOrder();
    const i = order.indexOf(path);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    persist({ order, pinned: prefs?.pinned ?? [], manual: true });
  }, [displayedOrder, persist, prefs]);

  // Reset = back to the adaptive default (clear manual order, pins, and usage).
  const reset = useCallback(() => {
    persist({ order: [], pinned: [], manual: false });
    clearNavUsage(role);
    setUsage({});
  }, [persist, role]);

  // Record a click toward frecency (persists for the next mount; the visible
  // order stays stable this session by design).
  const recordUsage = useCallback((path: string) => {
    if (typeof window === 'undefined') return;
    recordNavUsage(role, path, Date.now());
  }, [role]);

  return {
    links,
    pinned,
    isEditing,
    toggleEdit: () => setIsEditing((e) => !e),
    togglePin,
    moveUp: (p: string) => move(p, -1),
    moveDown: (p: string) => move(p, 1),
    reset,
    recordUsage,
  };
}
