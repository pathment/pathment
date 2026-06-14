import { apiClient } from './api-client';

/** Clans - mentor-led groups inside a program (admin management + assignment). */
export const clanApi = {
  /** No page/limit → full program-scoped list (for pickers/dropdowns).
   *  Pass page/limit for the server-paginated admin list ({ clans, total, … }). */
  list: (params: { programId?: string; status?: string; search?: string; page?: number; limit?: number } = {}) =>
    apiClient.get('/clans', { params }),
  /** Org-wide clan-health snapshot grouped by program (admin dashboard). */
  health: () => apiClient.get('/clans/health'),
  /** Org insights - clan comparison + fairness lens (admin /admin/insights). */
  insights: () => apiClient.get('/clans/insights'),
  /** Programs the current mentor runs, with their clans + roster counts. */
  mentorPrograms: () => apiClient.get('/clans/mentor/programs'),
  /** The current user's active clan memberships (with role per clan). */
  myMemberships: () => apiClient.get('/clans/me/memberships'),
  get: (id: string) => apiClient.get(`/clans/${id}`),
  create: (data: {
    programId: string;
    name: string;
    description?: string;
    leadMentorId?: string;
    levelLabel?: string;
    tags?: string[];
    maxMentees?: number;
  }) => apiClient.post('/clans', data),
  update: (id: string, data: Record<string, unknown>) => apiClient.patch(`/clans/${id}`, data),
  addMember: (id: string, userId: string, role: 'lead_mentor' | 'co_mentor' | 'mentee' | 'core_team') =>
    apiClient.post(`/clans/${id}/members`, { userId, role }),
  removeMember: (id: string, userId: string) => apiClient.delete(`/clans/${id}/members/${userId}`),
  /** A co-mentor's current toggle state: { keys, denied }. Works for co-mentors
   *  from any source (team membership / cross-clan cover / IAM grant). */
  getMemberPermissions: (id: string, userId: string) =>
    apiClient.get(`/clans/${id}/members/${userId}/permissions`),
  /** Fine-tune one co-mentor's permissions in a clan. `denied` is the subset of
   *  co-mentor default permissions to revoke (empty = full parity). */
  setMemberPermissions: (id: string, userId: string, denied: string[]) =>
    apiClient.patch(`/clans/${id}/members/${userId}/permissions`, { denied }),
  // Lead mentor: list unassigned mentees + invite a new one straight into the clan.
  availableMembers: (id: string, q?: string) => apiClient.get(`/clans/${id}/available`, { params: q ? { q } : {} }),
  inviteToClan: (id: string, email: string) => apiClient.post(`/clans/${id}/invite`, { email }),
  /** Move a mentee to a different clan (admin). Same program keeps progress; a
   *  different program wipes the old enrollment + tasks (clean transfer). */
  reassign: (menteeId: string, toClanId: string) => apiClient.post('/clans/reassign', { menteeId, toClanId }),
};
