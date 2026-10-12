import { apiClient } from './api-client';

export interface TalkCategory {
  id: string;
  name: string;
  talkCount?: number;
}

export interface TalkItem {
  id: string;
  title: string;
  speaker: string | null;
  description: string | null;
  url: string;
  durationMins: number | null;
  uploadedBy: string | null;
  uploaderName: string | null;
  categories: { id: string; name: string }[];
  canManage: boolean;
  createdAt: string;
}

export interface TalkInput {
  title: string;
  speaker?: string;
  description?: string;
  url: string;
  durationMins?: number | null;
  categoryIds: string[];
}

export interface TalksListParams {
  search?: string;
  categoryId?: string;
  limit?: number;
  offset?: number;
}

export const talksApi = {
  list: (params?: TalksListParams) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.categoryId) qs.set('categoryId', params.categoryId);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const query = qs.toString();
    return apiClient.get(query ? `/talks?${query}` : '/talks');
  },
  get: (id: string) => apiClient.get(`/talks/${id}`),
  create: (data: TalkInput) => apiClient.post('/talks', data),
  update: (id: string, data: Partial<TalkInput>) => apiClient.patch(`/talks/${id}`, data),
  remove: (id: string) => apiClient.delete(`/talks/${id}`),

  listCategories: () => apiClient.get('/talks/categories'),
  createCategory: (name: string) => apiClient.post('/talks/categories', { name }),
  updateCategory: (id: string, name: string) => apiClient.patch(`/talks/categories/${id}`, { name }),
  removeCategory: (id: string) => apiClient.delete(`/talks/categories/${id}`),
};
