'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { clanApi } from '@/lib/services/clan-api';

// Clan roles that mean "I mentor this clan" (so it belongs in the scope picker).
const MENTOR_CLAN_ROLES = ['lead_mentor', 'co_mentor', 'core_team'];
export const MENTOR_CLAN_STORAGE_KEY = 'pathment-active-clan';
export const MENTEE_CLAN_STORAGE_KEY = 'pathment-active-mentee-clan';
export const ALL_CLANS = 'all';

function readStored(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export interface ClanLite { id: string; name: string; }

interface ClanContextValue {
  /** Clans the current user mentors (drives the mentor scope selector). */
  clans: ClanLite[];
  /** 'all' (merged view) or a specific clan id. Mentor workspace only. */
  activeClanId: string;
  setActiveClanId: (id: string) => void;
  /** Clans the current user is a mentee of. */
  menteeClans: ClanLite[];
  /** Active mentee workspace clan (never 'all'). Empty string while unknown. */
  menteeActiveClanId: string;
  setMenteeActiveClanId: (id: string) => void;
  loading: boolean;
}

const ClanContext = createContext<ClanContextValue | undefined>(undefined);

const EMPTY_MEMBERSHIPS = { mentor: [] as ClanLite[], mentee: [] as ClanLite[] };

export function ClanProvider({ children }: { children: ReactNode }) {
  const { user, availableRoles } = useAuth();
  const [activeClanId, setActiveClanIdState] = useState<string>(ALL_CLANS);
  const [menteeActiveClanId, setMenteeActiveClanIdState] = useState<string>('');

  const isMentor = !!availableRoles?.includes('mentor');
  const isMentee = !!availableRoles?.includes('mentee');

  const { data = EMPTY_MEMBERSHIPS, loading } = useApiQuery<{ mentor: ClanLite[]; mentee: ClanLite[] }>({
    queryKey: qk.clan.memberships,
    queryFn: async () => {
      const r = await clanApi.myMemberships() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const rows = r?.data?.memberships ?? r?.memberships ?? [];
      const mentorSeen = new Set<string>();
      const menteeSeen = new Set<string>();
      const mentor: ClanLite[] = [];
      const mentee: ClanLite[] = [];
      for (const m of rows) {
        const c = m.clan;
        if (!c) continue;
        if (MENTOR_CLAN_ROLES.includes(m.role) && !mentorSeen.has(c.id)) {
          mentorSeen.add(c.id);
          mentor.push({ id: c.id, name: c.name });
        }
        if (m.role === 'mentee' && (m.status === 'active' || m.status === 'paused') && !menteeSeen.has(c.id)) {
          menteeSeen.add(c.id);
          mentee.push({ id: c.id, name: c.name });
        }
      }
      return { mentor, mentee };
    },
    enabled: !!user && (isMentor || isMentee),
    staleTime: STALE.long,
  });

  const clans = data.mentor;
  const menteeClans = data.mentee;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = readStored(MENTOR_CLAN_STORAGE_KEY);
    if (!saved || saved === ALL_CLANS) { setActiveClanIdState(ALL_CLANS); return; }
    setActiveClanIdState(clans.some((c) => c.id === saved) ? saved : ALL_CLANS);
  }, [clans]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = readStored(MENTEE_CLAN_STORAGE_KEY);
    const valid = saved && menteeClans.some((c) => c.id === saved) ? saved : (menteeClans[0]?.id || '');
    setMenteeActiveClanIdState(valid);
    if (valid && typeof window !== 'undefined') {
      try { window.localStorage.setItem(MENTEE_CLAN_STORAGE_KEY, valid); } catch { /* ignore */ }
    }
  }, [menteeClans]);

  const setActiveClanId = useCallback((id: string) => {
    setActiveClanIdState(id);
    if (typeof window !== 'undefined') localStorage.setItem(MENTOR_CLAN_STORAGE_KEY, id);
  }, []);

  const setMenteeActiveClanId = useCallback((id: string) => {
    setMenteeActiveClanIdState(id);
    if (typeof window !== 'undefined') localStorage.setItem(MENTEE_CLAN_STORAGE_KEY, id);
  }, []);

  return (
    <ClanContext.Provider value={{
      clans, activeClanId, setActiveClanId,
      menteeClans, menteeActiveClanId, setMenteeActiveClanId,
      loading,
    }}>
      {children}
    </ClanContext.Provider>
  );
}

/** Safe even outside the provider (returns an inert "all clans" context). */
export function useClan(): ClanContextValue {
  const ctx = useContext(ClanContext);
  if (!ctx) {
    return {
      clans: [], activeClanId: ALL_CLANS, setActiveClanId: () => {},
      menteeClans: [], menteeActiveClanId: '', setMenteeActiveClanId: () => {},
      loading: false,
    };
  }
  return ctx;
}
