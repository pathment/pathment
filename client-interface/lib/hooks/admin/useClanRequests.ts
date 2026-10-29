'use client';

import { qk, useApiQuery } from '@/lib/query';
import { clanRequestsApi } from '@/lib/services/clan-requests-api';

export interface ChangeRequest {
  id: string;
  mentee: string | null;
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
  at: string;
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
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface RequestsData { requests: ChangeRequest[]; crossClan: CrossClanItem[] }

const EMPTY: RequestsData = { requests: [], crossClan: [] };

export function useClanRequests(): UseClanRequestsReturn {
  const { data, loading, error, refetch } = useApiQuery<RequestsData>({
    queryKey: qk.admin.clanRequests,
    queryFn: async () => {
      const res = await clanRequestsApi.overview();
      return { requests: res?.data?.requests ?? [], crossClan: res?.data?.crossClan ?? [] };
    },
    errorMessage: 'Failed to load clan requests',
  });

  return { ...(data ?? EMPTY), loading, error, refetch };
}
