import { apiClient } from './api-client';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  logoUrl: string | null;
  primaryColor: string;
  timezone: string;
  membershipRole: 'owner' | 'admin' | 'member' | 'guest' | null;
}

export interface Plan {
  id: string;
  key: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  annualPriceCents: number;
  currency: string;
  limits: Record<string, number>;
  features: Record<string, boolean>;
}

export interface OrganizationOverview {
  workspaceCreationEnabled?: boolean;
  canManageOrganization: boolean;
  organization: OrganizationSummary;
  organizations: OrganizationSummary[];
  membership: { role: string; status: string };
  subscription: { status: string; billingInterval: string; currentPeriodEnd?: string | null; plan: Plan; requestedPlan?: Plan | null; requestedAt?: string | null };
  usage: { members: number; programs: number; clans: number };
}

export interface AccountOrganizations {
  organizations: OrganizationSummary[];
  workspaceCreationEnabled: boolean;
}

export type WorkspaceEntryDecision =
  | { kind: 'open'; workspace: OrganizationSummary }
  | { kind: 'choose' };

/** Resolve `/` without ever trusting a stale tenant stored in the browser. */
export function resolveWorkspaceEntry(
  organizations: OrganizationSummary[],
  rememberedSlug: string | null,
): WorkspaceEntryDecision {
  const recent = rememberedSlug
    ? organizations.find((organization) => organization.slug === rememberedSlug)
    : undefined;
  if (recent) return { kind: 'open', workspace: recent };
  if (organizations.length === 1) return { kind: 'open', workspace: organizations[0] };
  return { kind: 'choose' };
}

export const organizationsApi = {
  create: (input: { name: string; slug: string; timezone: string }) =>
    apiClient.post<{ data: { organization: OrganizationSummary } }>('/organizations', input).then((r) => r.data.organization),
  current: () => apiClient.get<{ data: OrganizationOverview }>('/organizations/current').then((r) => r.data),
  account: () => apiClient.get<{ data: AccountOrganizations }>('/organizations/me').then((r) => r.data),
  mine: () => apiClient.get<{ data: AccountOrganizations }>('/organizations/me').then((r) => r.data.organizations),
  plans: () => apiClient.get<{ data: { plans: Plan[] } }>('/organizations/plans').then((r) => r.data.plans),
  update: (patch: Partial<Pick<OrganizationSummary, 'name' | 'primaryColor' | 'timezone'>>) =>
    apiClient.patch<{ data: { organization: OrganizationSummary } }>('/organizations/current', patch).then((r) => r.data.organization),
  uploadLogo: (blob: Blob, filename = 'workspace-logo.jpg') => {
    const body = new FormData();
    body.append('file', blob, filename);
    return apiClient.post<{ data: { organization: OrganizationSummary } }>('/organizations/current/logo', body)
      .then((r) => r.data.organization);
  },
  removeLogo: () =>
    apiClient.delete<{ data: { organization: OrganizationSummary } }>('/organizations/current/logo')
      .then((r) => r.data.organization),
  requestPlan: (planKey: string) => apiClient.post<{ data: { subscription: OrganizationOverview['subscription'] } }>(
    '/organizations/current/plan-request', { planKey },
  ).then((r) => r.data.subscription),
};
