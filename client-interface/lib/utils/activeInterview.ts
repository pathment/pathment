import { interviewApi, type CandidateInterview } from '@/lib/services/interview-api';

/**
 * Tiny cross-page marker for an in-progress interview. The runner writes it when a
 * session is live and clears it on submit; a mentee-wide floating bar reads it to
 * nudge "resume interview" if the candidate wandered off (or reloaded onto another
 * page). Kept in localStorage so it survives a tab close/reopen — the wall-clock
 * deadline keeps running regardless.
 */
const KEY = 'pathment:activeInterview';
const EVENT = 'active-interview-change';

export interface ActiveInterview {
  taskId: string;
  title: string;
  timingMode: 'per_question' | 'total';
  // Client-epoch deadline (ms) for total-time interviews; null for per-question
  // (a precise off-page per-question clock would be misleading — it auto-advances).
  deadlineTs: number | null;
}

export function setActiveInterview(v: ActiveInterview): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
    window.dispatchEvent(new Event(EVENT));
  } catch { /* private mode / no storage */ }
}

export function clearActiveInterview(): void {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch { /* noop */ }
}

export function getActiveInterview(): ActiveInterview | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as ActiveInterview) : null;
  } catch { return null; }
}

/** True when the server still has an in-progress session for this assignment. */
export function isResumableInterview(data: CandidateInterview | null | undefined): boolean {
  return !!data?.state?.activeSessionId;
}

/**
 * Drop a stale local marker when the task/session is gone or no longer resumable.
 * Returns the marker when still valid; null when cleared or never set.
 */
export async function reconcileActiveInterview(taskId: string): Promise<ActiveInterview | null> {
  const stored = getActiveInterview();
  if (!stored || stored.taskId !== taskId) return stored;

  try {
    const res = await interviewApi.getCandidateInterview(taskId) as { data?: CandidateInterview };
    if (!isResumableInterview(res?.data)) {
      clearActiveInterview();
      return null;
    }
    return stored;
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 403) {
      clearActiveInterview();
      return null;
    }
    // Transient/network errors — keep the nudge rather than clearing optimistically.
    return stored;
  }
}

export const ACTIVE_INTERVIEW_EVENT = EVENT;
