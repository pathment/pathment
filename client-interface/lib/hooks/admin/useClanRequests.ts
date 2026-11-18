'use client';

import { qk, useApiQuery } from '@/lib/query';
import { clanRequestsApi } from '@/lib/services/clan-requests-api';

export interface ChangeRequest {
  id: string;
  mentee: string | null;
  /** Opens their profile from the request. */
  menteeId?: string | null;
  fromClan: string | null;
  toClan: string | null;
  /** For the admin programme/clan filter. */
  fromClanId?: string | null;
  toClanId?: string | null;
  programId?: string | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  resolutionNote: string | null;
  /** 'mentor' = a mentor asked the target clan directly; that clan decides, but
   *  an admin can still step in. 'admin' = raised here. 'mentee' = the mentee
   *  asked to be moved, and only an admin can answer it — which is also the
   *  only origin where `toClanId` may be null, because they were allowed to
   *  leave the destination to whoever picks it up. */
  origin?: 'admin' | 'mentor' | 'mentee';
  /**
   * 'move' — approving ends the mentee's current membership. 'placement' —
   * they are asking out of a closed or standing clan, which approving leaves
   * untouched, so the destination is not bounded by that clan's program.
   */
  moveKind?: 'move' | 'placement';
  requestedBy?: string | null;
  resolvedAt?: string | null;
  /** False when the clan it names has since closed: approve by choosing another. */
  toClanOpen?: boolean | null;
  at: string;
}

/** A clan a request could go to (GET /clan-requests/requests/:id/destinations). */
export interface ClanDestination {
  id: string;
  name: string;
  avatarUrl: string | null;
  kind: 'cohort' | 'standing';
  /** The admin's own on/off switch for the clan. */
  status: 'active' | 'inactive' | string;
  programId: string | null;
  programName: string | null;
  programClosed: boolean;
  mentor: string | null;
  mentees: number;
  /** Weeks of the last four with at least one Clan Review. */
  reviewWeeks: number;
  lastReviewAt: string | null;
  activity: 'regular' | 'irregular' | 'none';
  sameProgram: boolean;
  preferred: boolean;
  /** Set on the standing clan that continues the closed clan they asked for / are in. */
  continues?: string | null;
  suggested: boolean;
  /** move · move_cross (ends their programme enrolment) · placement · join (standing) */
  effect: 'move' | 'move_cross' | 'placement' | 'join';
}
export interface CrossClanItem {
  id: string;
  kind: string;
  user: string | null;
  fromClan: string | null;
  toClan: string | null;
  /** For the admin programme/clan filter. */
  fromClanId?: string | null;
  toClanId?: string | null;
  programId?: string | null;
  note: string | null;
  status?: string;
  at: string;
}
export interface UseClanRequestsReturn {
  requests: ChangeRequest[];
  crossClan: CrossClanItem[];
  /** Rows in the selected tab, across all pages. */
  total: number;
  counts: { pending: number; decided: number };
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface RequestsData { requests: ChangeRequest[]; crossClan: CrossClanItem[]; total: number; counts: { pending: number; decided: number } }

const EMPTY: RequestsData = { requests: [], crossClan: [], total: 0, counts: { pending: 0, decided: 0 } };

export interface ClanRequestsQuery {
  tab?: 'pending' | 'decided';
  page?: number;
  pageSize?: number;
  programId?: string;
  clanId?: string;
}

export function useClanRequests(query: ClanRequestsQuery = {}): UseClanRequestsReturn {
  const { data, loading, error, refetch } = useApiQuery<RequestsData>({
    queryKey: [...qk.admin.clanRequests, query],
    queryFn: async () => {
      const res = await clanRequestsApi.overview(query);
      return {
        requests: res?.data?.requests ?? [],
        crossClan: res?.data?.crossClan ?? [],
        total: res?.data?.total ?? 0,
        counts: res?.data?.counts ?? { pending: 0, decided: 0 },
      };
    },
    errorMessage: 'Failed to load clan requests',
  });

  return { ...(data ?? EMPTY), loading, error, refetch };
}
