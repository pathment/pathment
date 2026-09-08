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

export const ACTIVE_INTERVIEW_EVENT = EVENT;
