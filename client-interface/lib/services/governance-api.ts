import { apiClient } from './api-client';

export interface OrgGovernance {
  cohortReviewDeleteLocked: boolean;
}

/** Org-wide governance / compliance settings (admin). */
export const governanceApi = {
  get: () => apiClient.get<{ data: { governance: OrgGovernance } }>('/governance'),
  update: (governance: Partial<OrgGovernance>) =>
    apiClient.put<{ data: { governance: OrgGovernance } }>('/governance', governance),
};

export interface ReviewPolicies {
  cohortReviewDeleteLocked: boolean;
}
