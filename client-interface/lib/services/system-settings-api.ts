import { apiClient } from './api-client';

export interface OrgSystemSettings {
  cohortReviewDeleteLocked: boolean;
}

export interface CohortReviewEditRequest {
  id: string;
  mentorId: string;
  sessionId: string;
  clanId?: string | null;
  reason?: string | null;
  status: 'pending' | 'approved' | 'denied';
  resolutionNote?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  mentor?: { id: string; name: string; email: string };
  session?: { id: string; sessionDate: string; title?: string | null; status?: string };
  clan?: { id: string; name: string };
}

export interface CohortReviewClanGrant {
  id: string;
  clanId: string;
  clan?: { id: string; name: string } | null;
  expiresAt: string;
  note?: string | null;
  createdAt: string;
}

export const systemSettingsApi = {
  get: () => apiClient.get<{ data: { settings: OrgSystemSettings } }>('/admin/system-settings'),
  update: (settings: Partial<OrgSystemSettings>) =>
    apiClient.put<{ data: { settings: OrgSystemSettings } }>('/admin/system-settings', settings),
  listEditRequests: (status = 'pending') =>
    apiClient.get<{ data: { requests: CohortReviewEditRequest[] } }>(`/admin/cohort-review/edit-requests?status=${status}`),
  resolveEditRequest: (id: string, body: { status: 'approved' | 'denied'; resolutionNote?: string; expiresAt?: string }) =>
    apiClient.post<{ data: { request: CohortReviewEditRequest } }>(`/admin/cohort-review/edit-requests/${id}/resolve`, body),
  listClanGrants: () =>
    apiClient.get<{ data: { grants: CohortReviewClanGrant[] } }>('/admin/cohort-review/clan-grants'),
  createClanGrant: (body: { clanId: string; expiresAt: string; note?: string }) =>
    apiClient.post<{ data: { grant: CohortReviewClanGrant } }>('/admin/cohort-review/clan-grants', body),
};
