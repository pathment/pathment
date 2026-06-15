import { apiClient } from './api-client';

export type ChangelogType = 'feature' | 'improvement' | 'fix';
export type ChangelogRole = 'admin' | 'mentor' | 'mentee';

export interface ChangelogEntry {
  id: string;
  title: string;
  body: string;
  type: ChangelogType;
  isMajor: boolean;
  actionUrl?: string | null;
  actionLabel?: string | null;
  publishedAt: string | null;
  unread?: boolean;
}

export interface ChangelogFeed {
  updates: ChangelogEntry[];
  unreadCount: number;
  majorUnseen: ChangelogEntry[];
}

export interface ChangelogAdminEntry extends ChangelogEntry {
  audience: ChangelogRole[];
  createdAt: string;
  isDraft: boolean;
  author: string | null;
}

export interface ChangelogInput {
  title: string;
  body: string;
  type: ChangelogType;
  audience: ChangelogRole[];
  isMajor?: boolean;
  actionUrl?: string | null;
  actionLabel?: string | null;
  publish?: boolean;
}

export const changelogApi = {
  // User-facing feed for the current portal role.
  async feed(role: string): Promise<ChangelogFeed> {
    const res = await apiClient.get<any>(`/changelog?role=${encodeURIComponent(role)}`);
    return res.data || { updates: [], unreadCount: 0, majorUnseen: [] };
  },

  async markSeen(): Promise<void> {
    await apiClient.post('/changelog/seen');
  },

  // Admin authoring — server-side search + filters + pagination.
  async listAll(params: { search?: string; type?: string; status?: string; page?: number; limit?: number } = {}): Promise<{ updates: ChangelogAdminEntry[]; total: number; page: number; limit: number }> {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.type) qs.set('type', params.type);
    if (params.status) qs.set('status', params.status);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    const res = await apiClient.get<any>(`/changelog/manage?${qs.toString()}`);
    return res.data || { updates: [], total: 0, page: 1, limit: 20 };
  },

  async create(input: ChangelogInput): Promise<ChangelogEntry> {
    const res = await apiClient.post<any>('/changelog', input);
    return res.data?.update;
  },

  async update(id: string, input: Partial<ChangelogInput>): Promise<ChangelogEntry> {
    const res = await apiClient.patch<any>(`/changelog/${id}`, input);
    return res.data?.update;
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/changelog/${id}`);
  },

  // Bulk import from a pasted JSON array (or { updates, publish }).
  async importMany(payload: ChangelogInput[] | { updates: ChangelogInput[]; publish?: boolean }): Promise<{ created: number; total: number; errors: { index: number; title: string | null; message: string }[] }> {
    const res = await apiClient.post<any>('/changelog/import', payload);
    return res.data;
  },
};
