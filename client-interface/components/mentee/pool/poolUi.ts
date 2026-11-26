import { workspacePath } from '@/lib/services/workspace-scope';
/**
 * Candidate wording for the shared task statuses (same colours as everywhere
 * else). A round calls the end of a piece of work "approved", not "complete",
 * because approval is what earns its points.
 */
export const POOL_WORK_STATUS = {
  assigned: { label: 'To do', className: 'bg-blue-100 text-blue-700' },
  not_started: { label: 'To do', className: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In progress', className: 'bg-yellow-100 text-yellow-700' },
  submitted: { label: 'Awaiting review', className: 'bg-purple-100 text-purple-700' },
  revision_needed: { label: 'Changes requested', className: 'bg-orange-100 text-orange-700' },
  completed: { label: 'Approved', className: 'bg-green-100 text-green-700' },
};

/** The same input style the mentee submit screens use. */
export const poolField = 'w-full px-3 py-2 border border-slate-200 rounded-xl bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

/** Work that is still the candidate's to do something about. */
export const OPEN_STATUSES = ['assigned', 'not_started', 'in_progress', 'revision_needed'];

export const fmtPoolDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : null;

/**
 * The link to a piece of pool work inside the learner workspace.
 *
 * Workspace-scoped on purpose. An unscoped `/mentee/...` path is not where the
 * app lives, so following one goes out to the proxy and comes back redirected
 * — and the `?pool=1` that says to read this from the candidate endpoint has to
 * survive that trip. Addressing the real path means there is no trip.
 */
export const poolTaskHref = (taskId: string) => workspacePath(`/mentee/tasks/${taskId}?pool=1`);
