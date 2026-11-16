'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { programsApi } from '@/lib/services/program-api';
import { clanApi } from '@/lib/services/clan-api';
import { useAuth } from '@/lib/context/AuthContext';
import { byLifecycle } from '@/lib/utils/lifecycleOrder';

/**
 * Which programme — and clan — the admin portal is looking at.
 *
 * The mentor portal has had a clan selector for a long time, and the admin
 * portal had nothing: every people screen listed the whole workspace. This is
 * the same idea one level up, shared across the screens that need it so the
 * choice is made once rather than on each page.
 *
 * Stored per account, like the mentor's clan choice, because two people
 * sharing a browser must not inherit each other's scope. See
 * `lib/services/clan-choice.ts` for why that key shape matters.
 */

export const ALL_PROGRAMS = 'all';
export const ALL_CLANS_IN_SCOPE = 'all';

export interface ScopeProgram { id: string; name: string }
export interface ScopeClan { id: string; name: string; kind: string; programId: string; programName: string }

interface AdminScope {
  programId: string;
  setProgramId: (id: string) => void;
  clanId: string;
  setClanId: (id: string) => void;
  programs: ScopeProgram[];
  clans: ScopeClan[];
  loading: boolean;
  /** `undefined` when nothing is selected — ready to spread into a query. */
  query: { programId?: string; clanId?: string };
}

const Ctx = createContext<AdminScope | null>(null);

const keyFor = (userId: string | null | undefined, what: string) =>
  (userId ? `pathment-admin-${what}:${userId}` : '');

const read = (key: string) => {
  if (!key || typeof window === 'undefined') return '';
  try { return window.localStorage.getItem(key) || ''; } catch { return ''; }
};

export function AdminScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [programId, setProgram] = useState(ALL_PROGRAMS);
  const [clanId, setClan] = useState(ALL_CLANS_IN_SCOPE);

  // Adopt the stored choice once the account is known, not before — reading
  // it earlier would apply the previous account's scope for a beat.
  useEffect(() => {
    if (!userId) return;
    setProgram(read(keyFor(userId, 'program')) || ALL_PROGRAMS);
    setClan(read(keyFor(userId, 'clan')) || ALL_CLANS_IN_SCOPE);
  }, [userId]);

  const persist = useCallback((what: string, value: string) => {
    const key = keyFor(userId, what);
    if (!key) return;
    try { window.localStorage.setItem(key, value); } catch { /* private mode */ }
  }, [userId]);

  const setProgramId = useCallback((id: string) => {
    setProgram(id);
    persist('program', id);
    // A clan belongs to a programme; changing the programme cannot keep it.
    setClan(ALL_CLANS_IN_SCOPE);
    persist('clan', ALL_CLANS_IN_SCOPE);
  }, [persist]);

  const setClanId = useCallback((id: string) => { setClan(id); persist('clan', id); }, [persist]);

  const { data, loading } = useApiQuery<{ programs: ScopeProgram[]; clans: ScopeClan[] }>({
    queryKey: qk.admin.placementOptions,
    queryFn: async () => {
      // Same two reads the invite flow already shares this cache key with.
      const [pRes, cRes] = await Promise.all([
        programsApi.getAll().catch(() => null),
        clanApi.list().catch(() => null),
      ]) as [{ data?: unknown } | null, { data?: { clans?: unknown[] } } | null];
      const raw = (pRes as { data?: unknown } | null)?.data;
      const pList = (Array.isArray(raw) ? raw : (raw as { programs?: unknown[] })?.programs ?? []) as Array<{ id: string; name: string; status?: string }>;
      const cList = (cRes?.data?.clans ?? []) as Array<{ id: string; name: string; kind?: string; programId: string; program?: { name?: string } }>;
      return {
        // Running programs first in the picker, then completed, then archived.
        programs: [...pList].sort(byLifecycle((p) => p.status)).map((p) => ({ id: p.id, name: p.name })),
        clans: cList.map((c) => ({
          id: c.id, name: c.name, kind: c.kind || 'cohort', programId: c.programId, programName: c.program?.name || '',
        })),
      };
    },
    staleTime: STALE.long,
    errorMessage: '',
  });

  const value = useMemo<AdminScope>(() => ({
    programId,
    setProgramId,
    clanId,
    setClanId,
    programs: data?.programs ?? [],
    clans: data?.clans ?? [],
    loading,
    query: {
      ...(programId !== ALL_PROGRAMS ? { programId } : {}),
      ...(clanId !== ALL_CLANS_IN_SCOPE ? { clanId } : {}),
    },
  }), [programId, setProgramId, clanId, setClanId, data, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Safe outside the provider: a screen that is not wrapped behaves exactly as
 * it did before, with no scope at all.
 */
export function useAdminScope(): AdminScope {
  return useContext(Ctx) ?? {
    programId: ALL_PROGRAMS,
    setProgramId: () => {},
    clanId: ALL_CLANS_IN_SCOPE,
    setClanId: () => {},
    programs: [],
    clans: [],
    loading: false,
    query: {},
  };
}
