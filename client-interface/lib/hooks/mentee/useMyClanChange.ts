'use client';

import { qk, useApiQuery } from '@/lib/query';
import { myClanChangeApi } from '@/lib/services/clan-requests-api';

/** A clan the mentee could ask to be moved into. */
export interface ClanOption {
  id: string;
  name: string;
  avatarUrl: string | null;
  mentor: string | null;
  mentees: number;
  programId: string;
  /** Shown for a placement, where the clan may be in a program they do not know. */
  programName: string | null;
}

/** One of the mentee's own clans, with where it could lead. */
export interface MyClanPlacement {
  id: string;
  name: string;
  avatarUrl: string | null;
  paused: boolean;
  /** Its programme has closed, so it is read-only and cannot be left. */
  closed: boolean;
  /**
   * A standing clan — the group that continues after a cohort ends. It DOES
   * belong to a programme (it inherits the one it continues), but it is not
   * one of several parallel clans you can be shuffled between, so it is shown
   * without the ask.
   */
  standing: boolean;
  /** The server's single answer to "may they ask about this clan" — now always true. */
  canRequest: boolean;
  /**
   * What approval would actually do.
   *
   * 'move' — they leave this clan; within one program their work is mirrored
   * across. 'placement' — there is no live membership to close, so this clan
   * stays exactly as it is (a finished program keeps its record and
   * certificates) and they are added somewhere new, which may be another
   * program entirely.
   */
  moveKind: 'move' | 'placement';
  programId: string;
  programName: string | null;
  options: ClanOption[];
}

export interface MyClanChangeRequest {
  id: string;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  reason: string | null;
  fromClan: string | null;
  fromClanId: string | null;
  /** Null while open and no preference was named — the admin has not chosen. */
  toClan: string | null;
  toClanId: string | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  at: string;
}

export interface MyClanChangeData {
  clans: MyClanPlacement[];
  reasons: { code: string; label: string }[];
  requests: MyClanChangeRequest[];
}

export interface UseMyClanChangeReturn extends MyClanChangeData {
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const EMPTY: MyClanChangeData = { clans: [], reasons: [], requests: [] };

/**
 * Everything the mentee's clan page needs, in one read.
 *
 * Deliberately NOT keyed on the clan picker's active clan. A mentee in two
 * clans may want to move out of one of them, and the page shows both with
 * their own destinations and their own open request — splitting it per clan
 * would hide the second placement behind a picker the request form also has
 * to ask about.
 */
export function useMyClanChange(): UseMyClanChangeReturn {
  const { data, loading, error, refetch } = useApiQuery<MyClanChangeData>({
    queryKey: qk.me.clanChange,
    queryFn: async () => {
      const res = await myClanChangeApi.options();
      const payload = res?.data as MyClanChangeData | undefined;
      return {
        clans: payload?.clans ?? [],
        reasons: payload?.reasons ?? [],
        requests: payload?.requests ?? [],
      };
    },
    errorMessage: 'Failed to load your clan',
  });

  return { ...(data ?? EMPTY), loading, error, refetch };
}
