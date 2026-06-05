import type { NavLink } from './navigation';

/** Per-user sidebar customization (pin + reorder), persisted in localStorage. */
export const NAV_PREFS_KEY = 'pathment-nav-prefs';
/** Per-user, per-item usage frecency (recency-weighted frequency). */
export const NAV_USAGE_KEY = 'pathment-nav-usage';

export interface RolePrefs {
  /** Stable nav paths in the user's chosen order (only honoured when `manual`). */
  order: string[];
  /** Stable nav paths the user pinned to the top. */
  pinned: string[];
  /**
   * True only when the user EXPLICITLY reordered via customize→move. Legacy prefs
   * (older builds auto-froze `order` on pin) lack this, so we ignore their order
   * and fall back to adaptive — auto-migrating them without clearing storage.
   */
  manual?: boolean;
}
export type NavPrefs = Record<string, RolePrefs>;

/** A decaying frecency score per path: `score` as of `last` (epoch ms). */
export interface UsageEntry { score: number; last: number }
export type RoleUsage = Record<string, UsageEntry>;
export type NavUsage = Record<string, RoleUsage>;

// Frecency = frequency that fades with time. Each visit adds 1; the running
// score halves every HALF_LIFE. So a tab used often & recently floats up, and
// one you've stopped using sinks back toward its default slot on its own (RFU).
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
// How hard usage promotes an item: ~1 frecency point ≈ this many rank slots.
const PROMOTE = 2.5;

function decay(score: number, last: number, now: number): number {
  if (!score) return 0;
  const dt = Math.max(0, now - last);
  return score * Math.pow(0.5, dt / HALF_LIFE_MS);
}

// ── persistence ──────────────────────────────────────────────────────────────
export function loadNavPrefs(): NavPrefs {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(NAV_PREFS_KEY) || '{}') as NavPrefs; } catch { return {}; }
}
export function saveNavPrefs(prefs: NavPrefs): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(NAV_PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore quota */ }
}

export function loadNavUsage(): NavUsage {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(NAV_USAGE_KEY) || '{}') as NavUsage; } catch { return {}; }
}
export function saveNavUsage(usage: NavUsage): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(NAV_USAGE_KEY, JSON.stringify(usage)); } catch { /* ignore quota */ }
}

/** Record one visit to a nav item (decays the old score to now, then +1). */
export function recordNavUsage(role: string, path: string, now: number): void {
  const all = loadNavUsage();
  const roleUsage = all[role] ?? (all[role] = {});
  const prev = roleUsage[path];
  const base = prev ? decay(prev.score, prev.last, now) : 0;
  roleUsage[path] = { score: base + 1, last: now };
  saveNavUsage(all);
}

export function clearNavUsage(role: string): void {
  const all = loadNavUsage();
  if (all[role]) { delete all[role]; saveNavUsage(all); }
}

/**
 * Overlay a role's saved prefs + usage on the static config.
 *
 * - If the user has a MANUAL order (from customize mode), honour it exactly.
 * - Otherwise order ADAPTIVELY: blend the curated default rank with each item's
 *   frecency so the tabs you actually use rise toward the top, and unused ones
 *   keep their sensible default slot.
 * - Pinned items always float to the top, preserving their relative order.
 * New config items the user has never seen are always included.
 */
export function applyNavPrefs(links: NavLink[], prefs?: RolePrefs, usage?: RoleUsage, now = 0): NavLink[] {
  const order = prefs?.order ?? [];
  const pinned = new Set(prefs?.pinned ?? []);

  let ordered: NavLink[];

  if (prefs?.manual && order.length > 0) {
    // Manual order: respect it, append any new items at the end.
    const byPath = new Map(links.map((l) => [l.path, l]));
    const seen = new Set<string>();
    ordered = [];
    order.forEach((p) => { const l = byPath.get(p); if (l && !seen.has(p)) { ordered.push(l); seen.add(p); } });
    links.forEach((l) => { if (!seen.has(l.path)) { ordered.push(l); seen.add(l.path); } });
  } else {
    // Adaptive: baseScore from curated position + frecency-weighted promotion.
    const n = links.length;
    ordered = links
      .map((l, i) => {
        const base = n - i; // top of config = highest base
        const u = usage?.[l.path];
        const frec = u ? decay(u.score, u.last, now) : 0;
        return { l, i, blended: base + frec * PROMOTE };
      })
      .sort((a, b) => (b.blended - a.blended) || (a.i - b.i)) // stable on ties → default order
      .map((x) => x.l);
  }

  // Pinned float to the top, preserving their relative order in `ordered`.
  const pinnedLinks = ordered.filter((l) => pinned.has(l.path));
  const rest = ordered.filter((l) => !pinned.has(l.path));
  return [...pinnedLinks, ...rest];
}
