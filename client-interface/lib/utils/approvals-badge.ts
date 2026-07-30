/**
 * Lets the Approvals page tell the sidebar badge that the queue changed, so the
 * count drops the moment a mentor reviews something instead of waiting for the
 * next navigation. Plain DOM event — no extra state library or provider.
 */
export const APPROVALS_CHANGED = 'pathment:approvals-changed';

export function notifyApprovalsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(APPROVALS_CHANGED));
}
