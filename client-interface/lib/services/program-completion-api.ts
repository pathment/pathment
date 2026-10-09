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
export interface StandingRequest {
  id: string; name: string; description: string | null; status: 'pending' | 'approved' | 'rejected'; decisionNote: string | null;
  createdClanId: string | null; program: { id: string; name: string }; mentor: { firstName: string; lastName: string };
}
export const completionApi = {
  preview: (id: string) => apiClient.get<{ data: ClosurePreview }>(`/programs/${id}/completion`).then(r => r.data),
  close: (id: string, data?: { closedAt?: string | null }) =>
    apiClient.post(`/programs/${id}/close`, data || {}),
  reopen: (id: string, reason: string) => apiClient.post(`/programs/${id}/reopen`, { reason }),
  results: (id: string) => apiClient.get<{ data: FinalResults }>(`/programs/${id}/results`).then(r => r.data),
  requests: () => apiClient.get<{ data: StandingRequest[] }>('/clan-requests/standing').then(r => r.data),
  eligiblePrograms: () => apiClient.get<{ data: { id: string; name: string }[] }>('/clan-requests/standing/eligible-programs').then(r => r.data),
  request: (data: { programId: string; name: string; description: string }) => apiClient.post('/clan-requests/standing', data),
  decide: (id: string, decision: 'approved' | 'rejected', note: string) => apiClient.post(`/clan-requests/standing/${id}/decision`, { decision, note }),
  addMentees: (id: string, menteeIds: string[]) => apiClient.post(`/clans/${id}/standing-members`, { menteeIds }),
};
