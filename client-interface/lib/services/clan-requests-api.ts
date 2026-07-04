import { apiClient } from './api-client';

/** Admin clan operations: change requests, cross-clan assignments, policies. */
export const clanRequestsApi = {
  overview: () => apiClient.get('/clan-requests'),
  listCrossClan: (clanId: string) => apiClient.get('/clan-requests/cross-clan', { params: { clanId } }),
  resolveRequest: (id: string, status: 'approved' | 'denied', note?: string) =>
    apiClient.patch(`/clan-requests/requests/${id}/resolve`, { status, note }),
  createRequest: (data: { toClanId: string; fromClanId?: string; reason?: string }) =>
    apiClient.post('/clan-requests/requests', data),
  listMyRequests: () => apiClient.get('/clan-requests/requests/mine'),
  createCrossClan: (data: { kind: string; userId: string; toClanId: string; fromClanId?: string; note?: string }) =>
    apiClient.post('/clan-requests/cross-clan', data),
  removeCrossClan: (id: string) => apiClient.delete(`/clan-requests/cross-clan/${id}`),
  // The covering person's own surface.
  listMyCrossClan: () => apiClient.get('/clan-requests/cross-clan/mine'),
  respondCrossClan: (id: string, accept: boolean) =>
    apiClient.post(`/clan-requests/cross-clan/${id}/respond`, { accept }),
};
