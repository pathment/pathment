import { apiClient } from './api-client';

/** Settings → Integrations: API keys, sync connections, sync history (server: routes/integrations.js). */

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  status: 'active' | 'revoked' | 'expired';
}

export interface MappingRule { from?: string; transform?: string; map?: Record<string, string>; default?: string }
export interface FieldMapping { fields: Record<string, MappingRule>; keepUnmapped?: boolean }

export interface SyncConnection {
  id: string;
  name: string;
  cohortId: string | null;
  cohort?: { id: string; name: string } | null;
  mapping: FieldMapping;
  afterSync: 'none' | 'send_assessment';
  createdAt: string;
}

export interface SyncJobError { index: number; externalId: string | null; email: string | null; field: string | null; code: string; message: string }

export interface SyncRun {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed';
  dryRun: boolean;
  intakeId: string;
  connection: string | null;
  total: number;
  counts: { created: number; updated: number; unchanged: number; skipped: number; failed: number };
  assessmentsSent: number;
  errors: SyncJobError[];
  message?: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  connectionName?: string | null;
  intakeName?: string | null;
  apiKey?: { name: string; prefix: string } | null;
  source?: 'api' | 'app';
}

export interface IntegrationMeta {
  scopes: { key: string; description: string }[];
  fields: string[];
  transforms: string[];
  maxRecords: number;
  baseUrl: string;
}

export interface PreviewRow { values: Record<string, string>; responses: Record<string, unknown>; errors: { field: string; code: string; message: string }[] }

type Envelope<T> = { data: T };

export const integrationsApi = {
  meta: () => apiClient.get<Envelope<IntegrationMeta>>('/integrations/meta').then((r) => r.data),

  listKeys: () => apiClient.get<Envelope<{ apiKeys: ApiKeyInfo[] }>>('/integrations/api-keys').then((r) => r.data.apiKeys),
  createKey: (body: { name: string; scopes: string[]; expiresAt?: string | null }) =>
    apiClient.post<Envelope<{ key: string; apiKey: ApiKeyInfo }>>('/integrations/api-keys', body).then((r) => r.data),
  revokeKey: (id: string) => apiClient.post<Envelope<{ apiKey: ApiKeyInfo }>>(`/integrations/api-keys/${id}/revoke`, {}).then((r) => r.data.apiKey),

  listConnections: () => apiClient.get<Envelope<{ connections: SyncConnection[] }>>('/integrations/connections').then((r) => r.data.connections),
  createConnection: (body: Partial<SyncConnection>) =>
    apiClient.post<Envelope<{ connection: SyncConnection }>>('/integrations/connections', body).then((r) => r.data.connection),
  updateConnection: (id: string, body: Partial<SyncConnection>) =>
    apiClient.patch<Envelope<{ connection: SyncConnection }>>(`/integrations/connections/${id}`, body).then((r) => r.data.connection),
  removeConnection: (id: string) => apiClient.delete(`/integrations/connections/${id}`),
  suggest: (sample: unknown) => apiClient.post<Envelope<{ mapping: FieldMapping }>>('/integrations/connections/suggest', { sample }).then((r) => r.data.mapping),
  preview: (mapping: FieldMapping, samples: unknown[]) =>
    apiClient.post<Envelope<{ problems: string[]; rows: PreviewRow[] }>>('/integrations/connections/preview', { mapping, samples }).then((r) => r.data),

  listRuns: (params?: { cohortId?: string; connectionId?: string }) =>
    apiClient.get<Envelope<{ runs: SyncRun[] }>>('/integrations/runs', { params }).then((r) => r.data.runs),
  getRun: (id: string) => apiClient.get<Envelope<{ run: SyncRun }>>(`/integrations/runs/${id}`).then((r) => r.data.run),
  startRun: (body: { cohortId: string; connectionId?: string | null; records: unknown[]; dryRun?: boolean; sendAssessment?: boolean }) =>
    apiClient.post<Envelope<{ run: SyncRun }>>('/integrations/runs', body).then((r) => r.data.run),
  errorsCsv: (id: string) => apiClient.get<string>(`/integrations/runs/${id}/errors.csv`, { responseType: 'text' as const }),
};
