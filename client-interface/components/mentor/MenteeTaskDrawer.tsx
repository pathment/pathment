'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  CheckCircle2, Clock, Award, Pencil, RotateCcw, Trash2, Loader2, StickyNote, ClipboardCheck, XCircle,
} from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { ResourceLink } from '@/components/shared/ResourceLink';
import { TaskEditDrawer } from '@/components/mentor/TaskEditDrawer';
import { InterviewAssignmentPanel } from '@/components/mentor/InterviewAssignmentPanel';
import taskApi from '@/lib/services/task-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { pointsForDifficulty } from '@/lib/config/points';
import { isMissingDescription, looksLikeHtml } from '@/lib/utils/html';

const STATUS_CLS: Record<string, string> = {
  assigned: 'bg-slate-100 text-slate-600', not_started: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700', submitted: 'bg-violet-100 text-violet-700',
  revision_needed: 'bg-amber-100 text-amber-700', completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-400',
};
const DIFF_CLS: Record<string, string> = {
  easy: 'bg-emerald-50 text-emerald-700', medium: 'bg-amber-50 text-amber-700',
  hard: 'bg-orange-50 text-orange-700', expert: 'bg-red-50 text-red-700',
};

/**
 * In-context detail + management for ONE mentee's assigned task, opened from the
 * Clan Review "Assigned work" list. Shows the full (override-merged) content,
 * the mentor note, and lets the mentor edit-for-this-mentee, reassign a
 * cancelled task, or unassign — without leaving the review flow.
 */
export function MenteeTaskDrawer({ task, onClose, onChanged }: { task: any; onClose: () => void; onChanged: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  // Open in the edit form directly (one click from the review list). Closing
  // the editor returns to this read-only view so Unassign / Review stay available.
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const rt = task.roadmapTask || {};
  const title = rt.title || task.title || 'Task';
  const description = rt.description || task.description || '';
  const isHtml = looksLikeHtml(description);
  const missingDescription = isMissingDescription(description, title);
  const criteria: string[] = rt.acceptanceCriteria || task.acceptanceCriteria || [];
  const resources: any[] = rt.resources || [];
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const isInterview = (rt.type || task.type) === 'interview';
  const canCancel = !['completed', 'cancelled'].includes(task.status);
  const canUnassign = !['submitted', 'completed', 'cancelled'].includes(task.status);

  const reassign = async () => {
    try { setBusy(true); await taskApi.reassignTask(task.id); toast.success('Task reassigned'); onChanged(); onClose(); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not reassign the task')); }
    finally { setBusy(false); }
  };
  const unassign = async () => {
    if (!(await confirm({ title: 'Unassign this task?', description: "It will be removed from the mentee's list.", variant: 'danger', confirmLabel: 'Unassign' }))) return;
    try { setBusy(true); await taskApi.unassignTask(task.id); toast.success('Task unassigned'); onChanged(); onClose(); }
    catch (e) { toast.error(extractApiErrorMessage(e, 'Could not unassign the task')); }
    finally { setBusy(false); }
  };

  const cancelTask = async () => {
    const reason = cancelReason.trim() || 'Cancelled by mentor';
    const interviewNote = isInterview
      ? ' Any in-progress interview attempt will end and the mentee will no longer see a resume prompt.'
      : '';
    if (!(await confirm({
      title: 'Cancel this task?',
      description: `The task will be marked cancelled for this mentee.${interviewNote}`,
      variant: 'danger',
      confirmLabel: 'Cancel task',
    }))) return;
    try {
      setBusy(true);
      await taskApi.cancelTask(task.id, reason);
      toast.success('Task cancelled');
      setCancelOpen(false);
      setCancelReason('');
      onChanged();
      onClose();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not cancel the task'));
    } finally {
      setBusy(false);
    }
  };

  // Submitted / revision tasks open the review; an already-reviewed (completed)
  // task opens the same page in edit mode so the mentor can correct feedback.
  const canReview = ['submitted', 'revision_needed'].includes(task.status);
  const isReviewed = task.status === 'completed';
  const openReview = () => router.push(`/mentor/tasks/${task.id}/feedback`);

  return (
    <>
      {!editing && <Drawer open onClose={onClose} title={title} subtitle="Assigned task · this mentee"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            {canCancel && (
              <button
                type="button"
                onClick={() => setCancelOpen((v) => !v)}
                disabled={busy}
                className="px-3 py-2 rounded-lg border border-slate-200 text-amber-700 hover:bg-amber-50 text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />Cancel task
              </button>
            )}
            {canUnassign && (
              <button onClick={unassign} disabled={busy} className="px-3 py-2 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50 text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
                <Trash2 className="w-4 h-4" />Unassign
              </button>
            )}
            {task.status === 'cancelled' && (
              <button onClick={reassign} disabled={busy} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}Reassign
              </button>
            )}
            <button onClick={() => setEditing(true)} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium inline-flex items-center gap-1.5">
              <Pencil className="w-4 h-4" />Edit / add note
            </button>
            {canReview && (
              <button onClick={openReview} className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium inline-flex items-center gap-1.5">
                <ClipboardCheck className="w-4 h-4" />Review
              </button>
            )}
            {isReviewed && (
              <button onClick={openReview} className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium inline-flex items-center gap-1.5">
                <ClipboardCheck className="w-4 h-4" />Edit review
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_CLS[task.status] || 'bg-slate-100 text-slate-600'}`}>{(task.status || 'assigned').replace('_', ' ')}</span>
            {rt.type && <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 text-[11px] font-medium capitalize">{rt.type}</span>}
            {rt.difficulty && <span className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize ${DIFF_CLS[rt.difficulty] || 'bg-slate-100 text-slate-600'}`}>{rt.difficulty}</span>}
            {/* Where the task came from: a roadmap (which one) or a custom task. */}
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">
              {task.isCustomTask ? 'Custom task' : (task.roadmapName || rt.roadmap?.name ? `Roadmap · ${task.roadmapName || rt.roadmap?.name}` : 'Roadmap')}
            </span>
            {task.hasOverrides && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-medium">Customized for this mentee</span>}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            {due && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />due {due.toLocaleDateString()}</span>}
            {rt.estimatedHours != null && <span>{rt.estimatedHours}h est.</span>}
            <span className="inline-flex items-center gap-1"><Award className="w-3.5 h-3.5" />{pointsForDifficulty(rt.difficulty)} pts</span>
          </div>

          {isInterview && (
            <InterviewAssignmentPanel taskId={task.id} taskStatus={task.status} onChanged={onChanged} />
          )}

          {cancelOpen && canCancel && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
              <p className="text-sm font-medium text-amber-900">Cancel this task for the mentee</p>
              <p className="text-xs text-amber-800">
                {isInterview
                  ? 'Ends any live interview attempt. The mentee keeps the task on their list as cancelled (unlike unassign, which removes it).'
                  : 'The task stays on the mentee\'s list with a cancelled status.'}
              </p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason (optional)"
                rows={2}
                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={cancelTask}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-medium disabled:opacity-50"
                >
                  {busy ? 'Cancelling…' : 'Confirm cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => { setCancelOpen(false); setCancelReason(''); }}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-900 text-xs font-medium hover:bg-white disabled:opacity-50"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {task.status === 'cancelled' && task.cancellationReason && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-[11px] font-medium text-red-900">Cancelled</p>
              <p className="text-sm text-red-700">{task.cancellationReason}</p>
            </div>
          )}

          {task.mentorNote && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2.5">
              <p className="text-[11px] font-medium text-amber-900 dark:text-amber-300 inline-flex items-center gap-1.5"><StickyNote className="w-3.5 h-3.5" />Your note to this mentee</p>
              <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap mt-0.5">{task.mentorNote}</p>
            </div>
          )}

          {missingDescription
            ? <p className="text-sm text-slate-400">No description provided.</p>
            : isHtml
            ? <div className="prose prose-sm max-w-none dark:prose-invert text-slate-600 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: description }} />
            : <p className="text-sm text-slate-600 whitespace-pre-wrap">{description}</p>}

          {rt.deliverable && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
              <p className="text-[11px] font-medium text-blue-900">Deliverable</p>
              <p className="text-sm text-blue-800">{rt.deliverable}</p>
            </div>
          )}

          {!!criteria.length && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1">Acceptance criteria</p>
              <ul className="space-y-1">
                {criteria.map((c, i) => <li key={i} className="flex items-start gap-2 text-sm text-slate-700"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />{c}</li>)}
              </ul>
            </div>
          )}

          {!!resources.length && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1">Resources</p>
              <ul className="space-y-1">
                {resources.map((r, i) => (
                  <ResourceLink key={r.id || r.url || i} url={r.url} title={r.title} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </Drawer>}

      {editing && <TaskEditDrawer task={task} onClose={() => setEditing(false)} onSaved={() => { onChanged(); onClose(); }} />}
    </>
  );
}
