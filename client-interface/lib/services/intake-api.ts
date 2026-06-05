import { apiClient } from './api-client';

/** Cohorts — a program's intake batch/season. Admin-only. */
export const cohortApi = {
  list: (params?: { programId?: string; status?: string }) =>
    apiClient.get('/intake/cohorts', { params }),
  get: (id: string) => apiClient.get(`/intake/cohorts/${id}`),
  create: (data: {
    programId: string;
    name: string;
    description?: string;
    status?: string;
    capacity?: number | null;
    startDate?: string;
    endDate?: string;
  }) => apiClient.post('/intake/cohorts', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/intake/cohorts/${id}`, data),
  /** Turn the public self-serve intake link on (mints a slug) — returns { cohort, applyUrl }. */
  enablePublicLink: (id: string) => apiClient.post(`/intake/cohorts/${id}/public-link`, {}),
  disablePublicLink: (id: string) => apiClient.delete(`/intake/cohorts/${id}/public-link`),
};

/** Applications — intake records inside a cohort. Admin-only. */
export const applicationApi = {
  list: (cohortId: string, status?: string) =>
    apiClient.get(`/intake/cohorts/${cohortId}/applications`, { params: { status } }),
  /** Full detail incl. attached assessment + the applicant's submission. */
  get: (id: string) => apiClient.get(`/intake/applications/${id}`),
  /** Set/override the manual + total score for an assessment submission. */
  gradeSubmission: (submissionId: string, data: { manualScore?: number; totalScore?: number }) =>
    apiClient.post(`/intake/assessment-submissions/${submissionId}/grade`, data),
  /** Bulk import header→value rows parsed client-side from a CSV. */
  import: (cohortId: string, rows: Record<string, string>[]) =>
    apiClient.post(`/intake/cohorts/${cohortId}/applications/import`, { rows }),
  create: (cohortId: string, data: Record<string, unknown>) =>
    apiClient.post(`/intake/cohorts/${cohortId}/applications`, data),
  update: (id: string, data: { status?: string; assessmentScore?: number; reviewerNotes?: string }) =>
    apiClient.patch(`/intake/applications/${id}`, data),
  accept: (id: string, clanId?: string) =>
    apiClient.post(`/intake/applications/${id}/accept`, { clanId }),
  reject: (id: string, reason?: string) =>
    apiClient.post(`/intake/applications/${id}/reject`, { reason }),
};
