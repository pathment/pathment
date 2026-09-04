import { apiClient } from './api-client';

export type AIProvider = 'groq' | 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'custom';
export type AIKeyStatus = 'connected' | 'error' | 'untested';
export type AIFeature = 'summary' | 'delay' | 'atrisk' | 'nudge' | 'stall' | 'coaching' | 'feedback' | 'roadmap' | 'rag_generation' | 'rag_grounding' | 'rag_embedding' | 'auto_reply' | 'certificates';

export type AIRouting = Partial<Record<Exclude<AIFeature, 'auto_reply'>, string | null>>;

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
  setQuotaLimit: (limit: number) => apiClient.put('/ai-connections/quota-limit', { limit }),
};
