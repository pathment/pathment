import { apiClient } from './api-client';

export type AIProvider = 'groq' | 'openai' | 'anthropic' | 'gemini' | 'custom';
export type AIKeyStatus = 'connected' | 'error' | 'untested';
export type AIFeature = 'summary' | 'delay' | 'atrisk' | 'nudge' | 'stall' | 'coaching' | 'feedback';
export type AIRouting = Record<AIFeature, string | null>;

export interface AIConnection {
  id: string;
  provider: AIProvider;
  label: string;
  model?: string | null;
  baseUrl?: string | null;
  status: AIKeyStatus;
  keyMasked: string;
  addedAt: string;
}

export const aiConnectionsApi = {
  list: () => apiClient.get('/ai-connections'),
  create: (data: { provider: AIProvider; label: string; model?: string; baseUrl?: string; key: string }) =>
    apiClient.post('/ai-connections', data),
  remove: (id: string) => apiClient.delete(`/ai-connections/${id}`),
  test: (id: string) => apiClient.post(`/ai-connections/${id}/test`),
  setRouting: (routing: AIRouting) => apiClient.put('/ai-connections/routing', { routing }),
};
