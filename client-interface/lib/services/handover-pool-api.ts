import { apiClient } from './api-client';
import type { MenteeProfile } from '@/lib/hooks/mentor/useMenteeProfile';

/**
 * The handover pool: mentees offered out of one clan and taken into another.
 *
 * Mentors and admins call the same endpoints. What comes back is decided by the
 * caller's own clans and programme scope on the server, so there is no admin
 * variant of any of these and a programme admin needs no special handling here.
 */

export type HandoverReason =
  | 'program_closed' | 'mentor_leaving' | 'capacity' | 'fit' | 'mentee_request' | 'other';

export interface PoolEntry {
  id: string;
  menteeId: string;
  status: 'open' | 'claimed' | 'withdrawn';
  reason: HandoverReason | null;
  handoverNote: string | null;
  /** How long this offer has been sitting. The number the admin view sorts on. */
  waitingDays: number;
  createdAt: string;
  claimedAt: string | null;
  mentee: { id: string; name: string; email: string; avatarUrl: string | null } | null;
  pushedBy: string;
  pushedByName: string | null;
  fromClan: { id: string; name: string; kind: string; frozen: boolean } | null;
  claimedClan: { id: string; name: string } | null;
  program: { id: string; name: string } | null;
  /** What a puller would inherit — the reason to take this one. */
  work: {
    tasks: number;
    completed: number;
    lastActiveAt: string | null;
    roadmaps: {
      id: string;
      name: string;
      tasks: number;
      completed: number;
      recentTasks: { id: string; title: string; status: string }[];
    }[];
    customTasks: { id: string; title: string; status: string }[];
  };
  canWithdraw: boolean;
  carried: { tasks?: number; submissions?: number; feedback?: number; progress?: number };
}

export interface ClaimableClan {
  id: string;
  name: string;
  programId: string | null;
  programName: string | null;
  programStatus: string | null;
  kind: 'cohort' | 'standing';
  available: boolean;
  unavailableReason: string | null;
  seated: number;
  maxMentees: number | null;
  full: boolean;
}

export interface PoolOverview {
  open: number;
  waitingTooLong: number;
  oldestDays: number;
  byProgram: { programId: string | null; programName: string; open: number; oldestDays: number }[];
  entries: PoolEntry[];
  recentlyClaimed: PoolEntry[];
  recentlyWithdrawn: PoolEntry[];
}

export const handoverPoolApi = {
  list: (params: { programId?: string | null; status?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.programId) qs.set('programId', params.programId);
    if (params.status) qs.set('status', params.status);
    return apiClient
      .get<{ data: { entries: PoolEntry[] } }>(`/handover-pool?${qs.toString()}`)
      .then((r) => r.data.entries);
  },

  overview: (programId?: string | null) =>
    apiClient
      .get<{ data: PoolOverview }>(`/handover-pool/overview${programId ? `?programId=${programId}` : ''}`)
      .then((r) => r.data),

  claimableClans: () =>
    apiClient
      .get<{ data: { clans: ClaimableClan[] } }>('/handover-pool/claimable-clans')
      .then((r) => r.data.clans),

  profile: (entryId: string) =>
    apiClient
      .get<{ data: { profile: MenteeProfile } }>(`/handover-pool/${entryId}/profile`)
      .then((r) => r.data.profile),

  /** Offer one mentee out of a clan. Nothing moves until somebody claims it. */
  push: (input: { menteeId: string; clanId: string; reason?: HandoverReason; handoverNote?: string }) =>
    apiClient.post<{ data: { entry: PoolEntry; alreadyOpen: boolean } }>('/handover-pool/push', input)
      .then((r) => r.data),

  /** Offer every mentee in a clan — the closing-cohort case. */
  /**
   * Offer a chosen set. Each item carries its own clan, because the selection
   * can span clans and a mentee can belong to more than one.
   */
  pushMany: (input: {
    mentees: { menteeId: string; clanId: string }[];
    reason?: HandoverReason;
    handoverNote?: string;
  }) =>
    apiClient
      .post<{ data: { pushed: number; alreadyOffered: number; failed: number; total: number } }>(
        '/handover-pool/push-many',
        input,
      )
      .then((r) => r.data),

  pushClan: (input: { clanId: string; reason?: HandoverReason; handoverNote?: string }) =>
    apiClient
      .post<{ data: { pushed: number; skipped: number; total: number } }>('/handover-pool/push-clan', input)
      .then((r) => r.data),

  /**
   * Take them into one of your clans, with their work.
   *
   * Conflicts here are expected rather than exceptional — two mentors reaching
   * for the same person is the normal case when a cohort closes — so callers
   * should show the rejection as news ("somebody got there first"), not as an
   * error the user did something wrong to cause.
   */
  claim: (entryId: string, toClanId: string) =>
    apiClient
      .post<{ data: { carried: Record<string, number>; freshStart: boolean } }>(
        `/handover-pool/${entryId}/claim`, { toClanId },
      )
      .then((r) => r.data),

  withdraw: (entryId: string) =>
    apiClient.post(`/handover-pool/${entryId}/withdraw`, {}),
};
