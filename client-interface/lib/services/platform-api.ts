import { apiClient } from './api-client';
import type { FeatureUsageResponse } from '@/lib/types/activity';
// The report shape is shared with the per-workspace board on purpose: the same
// row is read in both places, and only the owner of its lane may write it.
import type { FeedbackReport, FeedbackStatus, FeedbackType, FeedbackLane } from './feedback-api';

/**
 * The platform console API - the OPERATOR surface (/api/platform/*).
 * Server-side, every route is gated on platform_admins tiers; nothing here is
 * reachable through a workspace role. The workspace header the client sends is
 * ignored for these paths.
 */

// ── Identity & governance ─────────────────────────────────────────────────────

export type PlatformRole = 'owner' | 'billing' | 'support' | 'readonly';
export type PlatformGate = 'read' | 'support' | 'billing' | 'lifecycle' | 'owner';

export interface PlatformMe {
  isPlatformAdmin: boolean;
  role: PlatformRole | null;
  via: 'grant' | 'env' | null;
  gates: PlatformGate[];
  user: { id: string; firstName: string; lastName: string; email: string };
}

export interface PlatformAdminRow {
  id: string;
  userId: string;
  role: PlatformRole;
  revokedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
}

export interface PlatformAuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetOrganizationId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  reason: string | null;
  actorEmail: string | null;
  createdAt: string;
  actor: { id: string; firstName: string; lastName: string; email: string } | null;
  targetOrganization: { id: string; name: string; slug: string } | null;
}

export interface Paged { total: number; page: number; pages: number }

// ── Workspaces ────────────────────────────────────────────────────────────────

export type WorkspaceStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'archived';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled';

export interface DirectoryRow {
  id: string;
  name: string;
  slug: string;
  status: WorkspaceStatus;
  logoUrl: string | null;
  primaryColor: string;
  timezone: string;
  createdAt: string;
  onboardingSource: string;
  isDemo: boolean;
  plan: { key: string; name: string } | null;
  requestedPlan: { key: string; name: string; requestedAt: string | null } | null;
  subscriptionStatus: SubscriptionStatus | null;
  billingInterval: 'monthly' | 'annual' | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  overriddenKeys: string[];
  usage: { members: number; programs: number; clans: number };
  limits: { members: number | null; programs: number | null; clans: number | null };
  owner: { id: string; firstName: string; lastName: string; email: string; membershipStatus: string } | null;
  lastActivityAt: string | null;
}

export interface PlatformPlan {
  id: string;
  key: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  annualPriceCents: number;
  currency: string;
  limits: Record<string, number>;
  features: Record<string, boolean>;
  active: boolean;
  sortOrder: number;
}

export interface WorkspaceSubscription {
  id: string;
  status: SubscriptionStatus;
  billingInterval: 'monthly' | 'annual';
  provider: string | null;
  requestedPlanId: string | null;
  requestedAt: string | null;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  overrides: { limits?: Record<string, number>; features?: Record<string, boolean>; meta?: Record<string, unknown> };
  plan: PlatformPlan & { publishedLimits?: Record<string, number>; publishedFeatures?: Record<string, boolean> };
  requestedPlan?: PlatformPlan | null;
  overriddenLimits?: string[];
}

export interface WorkspaceDetail {
  organization: {
    id: string; name: string; slug: string; status: WorkspaceStatus;
    logoUrl: string | null; primaryColor: string; timezone: string;
    createdAt: string; updatedAt: string; deletedAt: string | null;
    onboardingSource: string; isDemo: boolean;
    settings: Record<string, unknown>;
    creator: { id: string; firstName: string; lastName: string; email: string } | null;
  };
  subscription: WorkspaceSubscription | null;
  usage: { members: number; programs: number; clans: number };
  memberBreakdown: { active: number; invited: number; suspended: number; left: number };
  counts: { programsByStatus: Record<string, number>; enrollments: number | null };
  domains: Array<{ id: string; hostname: string; status: string; isPrimary: boolean; verifiedAt: string | null }>;
  apps: Array<{ id: string; status: string; credentialsMasked: string | null; lastVerifiedAt: string | null; app: { id: string; name: string; type: string; integrationKey: string | null } }>;
  aiConnections: Array<{ id: string; provider: string; label: string; model: string | null; status: string; keyMasked: string | null; ownerId: string | null; createdAt: string }>;
  ownerInvite: { id: string; status: 'pending' | 'used' | 'revoked' | 'expired'; expiresAt: string; usedAt: string | null; createdAt: string } | null;
  lastActivityAt: string | null;
}

export interface WorkspaceMemberRow {
  membershipId: string;
  role: 'owner' | 'admin' | 'member' | 'guest';
  status: 'invited' | 'active' | 'suspended' | 'left';
  joinedAt: string | null;
  user: { id: string; firstName: string; lastName: string; email: string; role: string; status: string; lastLoginAt: string | null; createdAt: string; deletedAt?: string | null } | null;
}

export interface PlatformMetrics {
  organizations: { total: number; byStatus: Record<string, number>; newLast30Days: number };
  users: { total: number; activeMemberships: number; newLast30Days: number };
  billing: {
    planDistribution: Array<{ key: string; name: string; count: number }>;
    pendingPlanRequests: number;
    trialsExpiringIn14Days: number;
    mrrCents: number;
  };
  leads: { new: number };
}


export interface PlatformFeedbackQuery {
  status?: FeedbackStatus;
  type?: FeedbackType;
  platform?: 'web' | 'android' | 'ios';
  /** 'all' includes the workspace lane, which is support work, not product work. */
  lane?: FeedbackLane | 'all';
  organizationId?: string;
  page?: number;
  limit?: number;
}

export interface PlatformFeedbackPage {
  reports: FeedbackReport[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  openCount: number;
  byStatus: Record<string, number>;
  byPlatform: Record<string, number>;
}

export interface ProvisionInput {
  name: string;
  slug: string;
  timezone: string;
  planKey: string;
  billingInterval: 'monthly' | 'annual';
  trialDays: number;
  owner: { email: string; firstName: string; lastName: string };
  leadId?: string | null;
  reason?: string;
}

export interface ProvisionResult {
  organization: { id: string; name: string; slug: string; status: WorkspaceStatus };
  owner: { id: string; email: string; account: 'existing' | 'created' };
  activation: 'email_sent' | 'not_needed';
}

export interface ActivationInfo {
  organization: { name: string; slug: string };
  owner: { email: string; firstName: string };
  expiresAt: string;
}


export interface OverrideReportRow {
  organization: { id: string; name: string; slug: string; status: WorkspaceStatus };
  plan: { key: string; name: string } | null;
  limits: Array<{ key: string; value: number; planValue: number | null }>;
  features: Array<{ key: string; value: boolean; planValue: boolean | null }>;
  meta: { reason?: string | null; updatedBy?: string; updatedAt?: string } | null;
}


export interface PendingPlanRequest {
  organization: { id: string; name: string; slug: string; status: WorkspaceStatus };
  currentPlan: { key: string; name: string; monthlyPriceCents: number; annualPriceCents: number; currency: string } | null;
  requestedPlan: { key: string; name: string; monthlyPriceCents: number; annualPriceCents: number; currency: string } | null;
  requestedAt: string | null;
  billingInterval: 'monthly' | 'annual';
  subscriptionStatus: SubscriptionStatus;
}


export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'provisioned' | 'lost';

export interface BuyerLeadRow {
  id: string;
  email: string;
  fullName: string;
  organizationName: string;
  organizationSize: string | null;
  participants: string | null;
  programType: string | null;
  launchTimeframe: string | null;
  planInterest: string | null;
  message: string | null;
  source: string;
  status: LeadStatus;
  notes: string | null;
  createdAt: string;
  provisionedOrganization: { id: string; name: string; slug: string } | null;
}


export interface PlatformUserHit {
  id: string; firstName: string; lastName: string; email: string;
  role: string; status: string; emailVerified: boolean; twoFactorEnabled: boolean;
  lastLoginAt: string | null; createdAt: string;
  memberships: Array<{ organizationId: string; organization: { id: string; name: string; slug: string; status: string } | null; role: string; status: string }>;
}

export interface PlatformUserDetail extends PlatformUserHit {
  activeSessions: number;
  suppressedEmail: { reason: string; detail: string | null; since: string } | null;
  platformRole: PlatformRole | null;
}

export interface OpsOverview {
  email: {
    countsByStatus: Record<string, number>;
    oldestPendingAt: string | null;
    recentFailures: Array<{ id: string; recipientEmail: string; subject: string; emailType: string; status: string; attemptCount: number; errorCategory: string | null; lastError: string | null; updatedAt: string }>;
  };
  aiEvaluation: { countsByStatus: Record<string, number> };
  jobs: Array<{ id: string; jobName: string; jobType: string; cronExpression: string | null; isActive: boolean; lastRunAt: string | null; nextRunAt: string | null }>;
  flags: Array<{ key: string; value: boolean; description: string }>;
}

// ── App catalog (global; what workspace admins can connect) ───────────────────

export type CatalogAppType = 'course' | 'communication' | 'productivity' | 'developer' | 'analytics' | 'other';
export const CATALOG_APP_TYPES: CatalogAppType[] = ['course', 'communication', 'productivity', 'developer', 'analytics', 'other'];

export interface CatalogApp {
  id: string;
  name: string;
  type: CatalogAppType;
  description: string | null;
  iconUrl: string | null;
  /** null = listed but not connectable; a key = backed by a server integration. */
  integrationKey: string | null;
  /** Provider API host the server calls (integration apps only). */
  apiBaseUrl: string | null;
  /** Where users go to use the app; defaults to apiBaseUrl. */
  appUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Workspaces currently connected - the blast radius of deactivating/deleting. */
  connections: number;
}

export interface CatalogIntegration {
  key: string;
  /** What to show for the key (e.g. 'Edorax' for 'buildment'). */
  label: string;
  credentialFields: Array<{ key: string; label: string; secret: boolean }>;
  /** Name of the app already claiming this key (keys are unique), or null. */
  usedBy: string | null;
}

export interface CatalogAppInput {
  name: string;
  type: CatalogAppType;
  description?: string | null;
  iconUrl?: string | null;
  integrationKey?: string | null;
  apiBaseUrl?: string | null;
  appUrl?: string | null;
  isActive?: boolean;
}

// ── Storage & retention (the whole database) ──────────────────────────────────

export interface StorageTableRow {
  table: string;
  totalBytes: number;
  heapBytes: number;
  indexBytes: number;
  liveRows: number;
  deadRows: number;
  lastAutovacuum: string | null;
}

export interface StorageOverview {
  totalBytes: number;
  tableBytes: number;
  indexBytes: number;
  liveRows: number;
  deadRows: number;
  tableCount: number;
  tables: StorageTableRow[];
  prunable: Record<string, number>;
}

const data = <T,>(response: { data: T }) => response.data;

export const platformApi = {
  me: () => apiClient.get<{ data: PlatformMe }>('/platform/me').then(data),

  admins: {
    list: (includeRevoked = false) =>
      apiClient.get<{ data: { admins: PlatformAdminRow[] } }>('/platform/admins', { params: { includeRevoked } }).then((r) => r.data.admins),
    grant: (input: { email: string; role: PlatformRole }) =>
      apiClient.post<{ data: { admin: PlatformAdminRow } }>('/platform/admins', input).then((r) => r.data.admin),
    update: (id: string, input: { role: PlatformRole }) =>
      apiClient.patch<{ data: { admin: PlatformAdminRow } }>(`/platform/admins/${id}`, input).then((r) => r.data.admin),
    revoke: (id: string) => apiClient.delete(`/platform/admins/${id}`),
  },

  audit: {
    list: (params: { q?: string; action?: string; organizationId?: string; page?: number; limit?: number }) =>
      apiClient.get<{ data: Paged & { entries: PlatformAuditEntry[] } }>('/platform/audit', { params }).then(data),
    actions: () => apiClient.get<{ data: { actions: string[] } }>('/platform/audit/actions').then((r) => r.data.actions),
  },

  metrics: () => apiClient.get<{ data: PlatformMetrics }>('/platform/metrics').then(data),

  organizations: {
    list: (params: {
      search?: string; status?: string; planKey?: string; hasOverrides?: boolean;
      sort?: 'created' | 'name' | 'members' | 'activity'; page?: number; limit?: number;
    }) => apiClient.get<{ data: Paged & { organizations: DirectoryRow[] } }>('/platform/organizations', { params }).then(data),
    detail: (id: string) => apiClient.get<{ data: WorkspaceDetail }>(`/platform/organizations/${id}`).then(data),
    members: (id: string, params: { search?: string; page?: number; limit?: number }) =>
      apiClient.get<{ data: Paged & { members: WorkspaceMemberRow[] } }>(`/platform/organizations/${id}/members`, { params }).then(data),
    audit: (id: string, params: { page?: number; limit?: number }) =>
      apiClient.get<{ data: { entries: Array<{ id: string; action: string; entityType: string; createdAt: string; user: { firstName: string; lastName: string; email: string } | null }> } & Paged }>(`/platform/organizations/${id}/audit`, { params }).then(data),
    setStatus: (id: string, input: { status: WorkspaceStatus; reason: string }) =>
      apiClient.post<{ data: { id: string; slug: string; status: WorkspaceStatus } }>(`/platform/organizations/${id}/status`, input).then(data),
    featureUsage: (id: string, days: number) =>
      apiClient.get<{ data: FeatureUsageResponse }>(`/platform/organizations/${id}/feature-usage`, { params: { days } }).then(data),
  },
  storage: {
    overview: () => apiClient.get<{ data: StorageOverview }>('/platform/storage').then(data),
    sweep: () =>
      apiClient.post<{ data: { removed: Record<string, number>; reclaimsDiskSpace: boolean } }>('/platform/storage/sweep', {}).then(data),
  },

  apps: {
    list: (params?: { search?: string; type?: CatalogAppType }) =>
      apiClient.get<{ data: { apps: CatalogApp[]; integrations: CatalogIntegration[] } }>('/platform/apps', { params }).then(data),
    create: (input: CatalogAppInput) =>
      apiClient.post<{ data: { app: CatalogApp } }>('/platform/apps', input).then((r) => r.data.app),
    update: (id: string, patch: Partial<CatalogAppInput>) =>
      apiClient.patch<{ data: { app: CatalogApp } }>(`/platform/apps/${id}`, patch).then((r) => r.data.app),
    remove: (id: string) => apiClient.delete(`/platform/apps/${id}`),
  },

  plans: {
    // One shape under one query key: every consumer reads `.plans` off this.
    // (A second fn returning a bare array under the same key once poisoned the
    // cache for whichever page loaded second.)
    catalog: () => apiClient.get<{ data: { plans: PlatformPlan[]; subscriberCounts: Record<string, number> } }>('/platform/plans').then(data),
    create: (input: Omit<PlatformPlan, 'id'>) =>
      apiClient.post<{ data: { plan: PlatformPlan } }>('/platform/plans', input).then((r) => r.data.plan),
    update: (id: string, patch: Partial<Omit<PlatformPlan, 'id' | 'key'>>) =>
      apiClient.patch<{ data: { plan: PlatformPlan } }>(`/platform/plans/${id}`, patch).then((r) => r.data.plan),
  },

  provisioning: {
    checkSlug: (slug: string) =>
      apiClient.get<{ data: { slug: string | null; available: boolean; reason: string | null } }>('/platform/slug-check', { params: { slug } }).then(data),
    provision: (input: ProvisionInput) =>
      apiClient.post<{ data: ProvisionResult }>('/platform/organizations', input).then(data),
    resendActivation: (organizationId: string) =>
      apiClient.post<{ data: { resent: boolean; owner: string } }>(`/platform/organizations/${organizationId}/activation/resend`).then(data),
    revokeActivation: (organizationId: string) =>
      apiClient.post<{ data: { revoked: boolean } }>(`/platform/organizations/${organizationId}/activation/revoke`).then(data),
  },

  activation: {
    validate: (token: string) =>
      apiClient.post<{ data: ActivationInfo }>('/platform/activation/validate', { token }).then(data),
    consume: (input: { token: string; password: string }) =>
      apiClient.post<{ data: { workspace: { name: string; slug: string }; email: string } }>('/platform/activation/consume', input).then(data),
  },
  billing: {
    subscription: (organizationId: string) =>
      apiClient.get<{ data: { subscription: WorkspaceSubscription } }>(`/platform/organizations/${organizationId}/subscription`).then((r) => r.data.subscription),
    setOverrides: (organizationId: string, input: {
      limits: Record<string, number | null>; features: Record<string, boolean | null>; reason: string;
    }) => apiClient.put<{ data: { subscription: WorkspaceSubscription } }>(`/platform/organizations/${organizationId}/overrides`, input).then((r) => r.data.subscription),
    overridesReport: () =>
      apiClient.get<{ data: { workspaces: OverrideReportRow[] } }>('/platform/overrides').then((r) => r.data.workspaces),
    pendingRequests: () =>
      apiClient.get<{ data: { requests: PendingPlanRequest[] } }>('/platform/billing/requests').then((r) => r.data.requests),
    activateRequested: (input: { organizationId: string; planKey: string; invoiceReference: string; periodEnd: string }) =>
      apiClient.post<{ data: { workspace: string; plan: string; alreadyActivated: boolean; subscription: WorkspaceSubscription } }>('/platform/billing/requests/activate', input).then(data),
    assignPlan: (organizationId: string, input: {
      planKey: string; billingInterval?: 'monthly' | 'annual'; periodEnd?: string | null;
      reason: string; acknowledgeOverLimit?: boolean;
    }) => apiClient.post<{ data: { assigned: string; overages: string[]; subscription: WorkspaceSubscription } }>(`/platform/organizations/${organizationId}/plan`, input).then(data),
    patchSubscription: (organizationId: string, input: {
      status?: SubscriptionStatus; cancelAtPeriodEnd?: boolean;
      currentPeriodEnd?: string | null; trialEndsAt?: string | null; reason: string;
    }) => apiClient.patch<{ data: { subscription: WorkspaceSubscription } }>(`/platform/organizations/${organizationId}/subscription`, input).then((r) => r.data.subscription),
  },
  leads: {
    list: (params: { status?: string; page?: number; limit?: number }) =>
      apiClient.get<{ data: Paged & { leads: BuyerLeadRow[]; countsByStatus: Record<string, number> } }>('/platform/leads', { params }).then(data),
    update: (id: string, input: { status?: LeadStatus; notes?: string }) =>
      apiClient.patch<{ data: { lead: BuyerLeadRow } }>(`/platform/leads/${id}`, input).then((r) => r.data.lead),
  },
  /**
   * Product feedback from every workspace - the other half of "What's new".
   * Updates flow out to every workspace; bug reports flow back here.
   */
  feedback: {
    list: (params: PlatformFeedbackQuery) =>
      apiClient.get<{ data: PlatformFeedbackPage }>('/platform/feedback', { params }).then(data),
    update: (id: string, input: { status?: FeedbackStatus; resolutionNote?: string; priority?: 'low' | 'normal' | 'high' }) =>
      apiClient.patch<{ data: { report: FeedbackReport } }>(`/platform/feedback/${id}`, input).then((r) => r.data.report),
  },
  users: {
    search: (q: string) =>
      apiClient.get<{ data: { users: PlatformUserHit[] } }>('/platform/users', { params: { q } }).then((r) => r.data.users),
    detail: (id: string) =>
      apiClient.get<{ data: { user: PlatformUserDetail } }>(`/platform/users/${id}`).then((r) => r.data.user),
    forceSignOut: (id: string, reason?: string) =>
      apiClient.post<{ data: { signedOut: boolean; revokedTokens: number } }>(`/platform/users/${id}/sign-out`, { reason }).then(data),
    setStatus: (id: string, input: { status: 'active' | 'suspended'; reason: string }) =>
      apiClient.post<{ data: { id: string; status: string } }>(`/platform/users/${id}/status`, input).then(data),
    resetTwoFactor: (id: string, reason?: string) =>
      apiClient.post<{ data: { reset: boolean } }>(`/platform/users/${id}/reset-2fa`, { reason }).then(data),
    unsuppressEmail: (id: string, reason?: string) =>
      apiClient.post<{ data: { unsuppressed: boolean } }>(`/platform/users/${id}/unsuppress-email`, { reason }).then(data),
  },

  ops: {
    overview: () => apiClient.get<{ data: OpsOverview }>('/platform/ops').then(data),
    retryEmail: (id: string) => apiClient.post(`/platform/ops/email/${id}/retry`),
    toggleJob: (id: string, isActive: boolean) => apiClient.patch(`/platform/ops/jobs/${id}`, { isActive }),
  },
};
