import { apiClient } from './api-client';

export interface RoleCatalogEntry {
  key: string;
  label: string;
  scope: 'org' | 'program' | 'clan' | 'self';
  description: string;
  permissions: string[] | '*';
  custom?: boolean;
  id?: string;
}

export interface UserAccess {
  user: { id: string; firstName: string; lastName: string; email: string };
  explicit: { id: string; role: string; roleLabel: string; scopeType: string; scopeId: string | null; scopeLabel: string; createdAt: string }[];
  derived: { role: string; roleLabel: string; scopeType: string; scopeId: string | null; scopeLabel: string }[];
}

export interface CustomRole {
  id: string;
  key: string;
  label: string;
  description?: string;
  scopeLevel: 'org' | 'program' | 'clan' | 'self';
  permissions: string[];
}

export interface DirectoryUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

/** IAM admin API + the current user's effective permissions (for UI gating). */
export const accessApi = {
  myPermissions: () =>
    apiClient.get<any>('/access/me/permissions').then((r) => ({
      permissions: (r.data?.permissions || []) as string[],
      canAccessAdmin: Boolean(r.data?.canAccessAdmin),
    })),
  roleCatalog: () =>
    apiClient.get<any>('/access/roles').then((r) => (r.data?.roles || []) as RoleCatalogEntry[]),
  userAccess: (userId: string) =>
    apiClient.get<any>(`/access/users/${userId}`).then((r) => r.data as UserAccess),
  /** Paginated org-wide user directory for the IAM People tab (all roles, searchable). */
  directory: (params: { search?: string; role?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.role) qs.set('role', params.role);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    return apiClient.get<any>(`/access/directory?${qs.toString()}`).then((r) => r.data as { users: DirectoryUser[]; total: number; page: number; limit: number });
  },
  grant: (payload: { userId: string; role: string; scopeType: string; scopeId?: string | null }) =>
    apiClient.post<any>('/access/grants', payload),
  revoke: (assignmentId: string) =>
    apiClient.delete<any>(`/access/grants/${assignmentId}`),

  // Custom roles
  listCustomRoles: () =>
    apiClient.get<any>('/access/custom-roles').then((r) => (r.data?.roles || []) as CustomRole[]),
  createCustomRole: (payload: { label: string; description?: string; scopeLevel: string; permissions: string[] }) =>
    apiClient.post<any>('/access/custom-roles', payload).then((r) => r.data?.role as CustomRole),
  updateCustomRole: (id: string, payload: Partial<{ label: string; description: string; scopeLevel: string; permissions: string[] }>) =>
    apiClient.patch<any>(`/access/custom-roles/${id}`, payload).then((r) => r.data?.role as CustomRole),
  deleteCustomRole: (id: string) =>
    apiClient.delete<any>(`/access/custom-roles/${id}`),

  // Reuse the messaging directory search to pick a user (empty q → first N users).
  searchUsers: (q: string) =>
    apiClient.get<any>('/messaging/users/search', { params: { q, limit: 25 } }).then((r) => (r.data?.users || []) as DirectoryUser[]),

  /** Invite a not-yet-registered person and pre-assign a role on registration. */
  invite: (payload: { email: string; baseRole: 'mentor' | 'mentee'; role: string; scopeType: string; scopeId?: string | null }) =>
    apiClient.post<any>('/access/invites', payload),
};
