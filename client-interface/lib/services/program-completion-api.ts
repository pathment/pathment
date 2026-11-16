import { apiClient } from './api-client';

export interface ClosurePreview {
  ended: boolean; started: boolean; closed: boolean; canClose: boolean; enrollmentCount: number;
  earliestCloseDate?: string | null;
  today?: string;
  scheduledEndDate?: string | null;
  /** False on Starter/free plans — close/reopen UI should upgrade instead of offer close. */
  featureAvailable?: boolean;
  unresolved: { id: string; firstName: string; lastName: string }[];
  certificatesNotIssued?: { id: string; firstName: string; lastName: string }[];
  certificatesNotIssuedMessage?: string | null;
}
export interface FinalSnapshot {
  id: string; closureId: string; menteeId?: string; outcome: string; tier: string | null; cohortRank: number | null;
  mentee: { firstName: string; lastName: string };
  decision: { overrideReason?: string; decision?: string };
  performance: { score: number | null; parts: { key: string; score: number; weight: number }[];
    evidence: { absoluteProgress: number; onTimeRate: number; tasksCompleted: number; attendance: { present: number; absent: number; excused: number } | null } };
}
export interface FinalResults {
  closed: boolean;
  /** ISO timestamp when the program was formally closed (single close — no version history). */
  closedAt?: string | null;
  currentClosureId: string | null;
  history: { id: string; closedAt: string; reopenedAt: string | null; reopenReason: string | null }[];
  snapshots: FinalSnapshot[];
}

export interface ContinuationPreview {
  roadmaps: Array<{
    roadmapId: string;
    name: string;
    totalSteps: number;
    completedSteps: number;
    resumeIndex: number;
    resumeStep: { stepId: string; title: string; previousStatus: string | null; sourceTaskId: string | null };
    sourceClanName: string | null;
    /** The mentor who set this work. Carried automatically only when they are on this clan's team. */
    sourceMentorId: string | null;
  }>;
  customTasks: Array<{
    sourceTaskId: string;
    title: string;
    type: string;
    status: string;
    sourceClanName: string | null;
    sourceMentorId: string | null;
    supported: boolean;
    unavailableReason: string | null;
  }>;
  sourceClans: Array<{ id: string; name: string }>;
}
export interface StandingRequest {
  id: string; name: string; description: string | null; status: 'pending' | 'approved' | 'rejected'; decisionNote: string | null;
  createdClanId: string | null; program: { id: string; name: string }; mentor: { firstName: string; lastName: string };
  /**
   * The clan this continuation grew out of. A mentor can run several clans in
   * one programme, so matching on programme alone showed a request raised from
   * one clan as pending on all of them. Null only on rows that predate this.
   */
  sourceClanId?: string | null;
  sourceClan?: { id: string; name: string } | null;
}
export const completionApi = {
  preview: (id: string) => apiClient.get<{ data: ClosurePreview }>(`/programs/${id}/completion`).then(r => r.data),
  close: (id: string, data?: { closedAt?: string | null }) =>
    apiClient.post(`/programs/${id}/close`, data || {}),
  reopen: (id: string, reason: string) => apiClient.post(`/programs/${id}/reopen`, { reason }),
  results: (id: string) => apiClient.get<{ data: FinalResults }>(`/programs/${id}/results`).then(r => r.data),
  requests: () => apiClient.get<{ data: StandingRequest[] }>('/clan-requests/standing').then(r => r.data),
  /** Per CLAN: `clanId` says which clan each eligible entry is for. */
  eligiblePrograms: () => apiClient.get<{ data: { id: string; name: string; clanId?: string; clanName?: string }[] }>('/clan-requests/standing/eligible-programs').then(r => r.data),
  request: (data: { programId: string; sourceClanId: string; name: string; description: string }) => apiClient.post('/clan-requests/standing', data),
  decide: (id: string, decision: 'approved' | 'rejected', note: string) => apiClient.post(`/clan-requests/standing/${id}/decision`, { decision, note }),
  /** Whether a mentor's request waits for an admin (on by default). */
  settings: () => apiClient.get<{ data: { requiresApproval: boolean } }>('/clan-requests/standing/settings').then(r => r.data),
  setRequiresApproval: (requiresApproval: boolean) => apiClient.put<{ data: { requiresApproval: boolean } }>('/clan-requests/standing/settings', { requiresApproval }).then(r => r.data),
  addMentees: (id: string, menteeIds: string[]) => apiClient.post(`/clans/${id}/standing-members`, { menteeIds }),

  /**
   * What a mentee did before this standing clan. Read-only: their work stays in
   * the completed programme, where the final report and certificate still
   * account for it.
   */
  priorRecord: (clanId: string) => apiClient.get<{ data: {
    menteeId: string;
    certificate: { tier: string; certificateNumber: string | null } | null;
    priorClans: { clanId: string; clanName: string | null; tasksAssigned: number; tasksCompleted: number; tasksUnfinished: number; openBlockers: number }[];
  }[] }>(`/clans/${clanId}/prior-record`).then(r => r.data),

  /** The unfinished work a mentor may choose to carry forward. */
  unfinishedPriorWork: (clanId: string, menteeId: string) => apiClient.get<{ data: {
    id: string; titleOverride: string | null; status: string; dueDate: string | null;
  }[] }>(`/clans/${clanId}/mentees/${menteeId}/unfinished-prior-work`).then(r => r.data),

  /** Carry it forward as NEW assignments here; the originals are untouched. */
  carryForward: (clanId: string, menteeId: string, taskIds: string[]) =>
    apiClient.post(`/clans/${clanId}/mentees/${menteeId}/carry-forward`, { taskIds }),

  continuationPreview: (clanId: string, menteeId: string) =>
    apiClient.get<{ data: ContinuationPreview }>(`/clans/${clanId}/mentees/${menteeId}/continuation-preview`).then(r => r.data),

  continueWork: (clanId: string, menteeId: string, input: { roadmapIds?: string[]; taskIds?: string[]; dueDate?: string }) =>
    apiClient.post<{ data: { continued: Array<{ id: string; kind: 'roadmap' | 'custom'; title: string }>; createdCount: number; reusedCount: number } }>(
      `/clans/${clanId}/mentees/${menteeId}/continue-work`, input,
    ).then(r => r.data),
};
