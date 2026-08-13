import { apiClient } from './api-client';

/**
 * Auto reply setup.
 *
 * The readiness check lives on the server and is enforced there, so this is the
 * one source for both the checklist a mentor reads and the refusal they get if
 * they try to enable it anyway.
 */

export interface SetupStep {
  key: 'key' | 'documents' | 'style';
  title: string;
  /** Why it is needed, not only what it is. */
  why: string;
  action: string;
  done: boolean;
  /** False for steps that improve the feature without gating it. */
  blocking: boolean;
  progress?: { current: number; needed: number };
}

export interface AutoReplyStatus {
  canEnable: boolean;
  enabled: boolean;
  steps: SetupStep[];
  nextStep: string | null;
  usage: { sent: number; limit: number };
}

export const autoReplyApi = {
  status: () => apiClient.get<{ data: AutoReplyStatus }>('/auto-reply').then((r) => r.data),

  /** Refused by the server when the prerequisites are not met. */
  setEnabled: (enabled: boolean) =>
    apiClient.put<{ data: AutoReplyStatus }>('/auto-reply', { enabled }).then((r) => r.data),
};
