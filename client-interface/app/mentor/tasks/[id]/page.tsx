'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Calendar,
  CalendarClock,
  Clock,
  Star,
  FileText,
  BookOpen,
  Sparkles,
  XCircle,
  AlertCircle,
  User,
  Award,
  MessageSquare,
  ExternalLink,
  Loader2,
  Send,
  AlertTriangle,
  Trash2,
  Pencil,
  RotateCcw,
  StickyNote,
} from 'lucide-react';
import { ResourceLink } from '@/components/shared/ResourceLink';
import { useMentorTaskDetail } from '@/lib/hooks/mentor';
import taskApi from '@/lib/services/task-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toExternalHref } from '@/lib/utils/url';
import { RichContent } from '@/components/shared/RichContent';
import { PageHeader, StatusBadge } from '@/components/admin/ui';
import { TaskEditDrawer } from '@/components/mentor/TaskEditDrawer';
import { useConfirm } from '@/lib/context/ConfirmContext';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function MentorTaskDetailsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const confirm = useConfirm();
  const {
    task,
    loading,
    error,
    cancellingTask,
    cancelReason,
    isCancelling,
    extensionDecision,
    newDueDate,
    isHandlingExtension,
    setCancellingTask,
    setCancelReason,
    setExtensionDecision,
    setNewDueDate,
    handleExtension,
    handleCancelTask,
  } = useMentorTaskDetail(resolvedParams.id);

  // Local controls for mentor-driven deadline edits + unassign (not part of the hook).
  const [dueEdit, setDueEdit] = useState('');
  const [savingDue, setSavingDue] = useState(false);
  const [unassigning, setUnassigning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reassigning, setReassigning] = useState(false);

  const reassign = async () => {
    try {
      setReassigning(true);
      await taskApi.reassignTask(resolvedParams.id);
      toast.success('Task reassigned to the mentee');
      window.location.reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not reassign the task'));
      setReassigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
        <p className="text-red-900">{error || 'Task not found'}</p>
      </div>
    );
  }

  const taskTitle = task.roadmapTask?.title || task.title || 'Untitled Task';
  const taskDescription = task.roadmapTask?.description || task.description || '';
  const descriptionIsHtml = /<[a-z][\s\S]*>/i.test(taskDescription);
  const taskDeliverable = task.roadmapTask?.deliverable || task.deliverable;
  const acceptanceCriteria = task.roadmapTask?.acceptanceCriteria || task.acceptanceCriteria || [];
  const resources = task.roadmapTask?.resources || [];
  // The API returns submissions ordered version DESC — pick the highest version
  // (don't assume array order) and show feedback across all versions, newest first.
  const submissionsList: any[] = task.submissions || []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const latestSubmission = submissionsList.length
    ? [...submissionsList].sort((a, b) => (b.version || 0) - (a.version || 0))[0]
    : null;
  const feedback = submissionsList
    .flatMap((s: any) => (s.feedback || []).map((fb: any) => ({ ...fb, version: s.version }))) // eslint-disable-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()); // eslint-disable-line @typescript-eslint/no-explicit-any

  const canReview = ['submitted', 'revision_needed'].includes(task.status);
  const canCancel = !['completed', 'cancelled'].includes(task.status);
  const canUnassign = !['submitted', 'completed', 'cancelled'].includes(task.status);

  const saveDueDate = async () => {
    if (!dueEdit) { toast.error('Pick a date first'); return; }
    try {
      setSavingDue(true);
      await taskApi.updateTaskDueDate(task.id, dueEdit);
      toast.success('Deadline updated');
      window.location.reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not update the deadline'));
      setSavingDue(false);
    }
  };
  const unassign = async () => {
    if (!(await confirm({ title: 'Unassign this task?', description: "It will be removed from the mentee's list.", variant: 'danger', confirmLabel: 'Unassign' }))) return;
    try {
      setUnassigning(true);
      await taskApi.unassignTask(task.id);
      toast.success('Task unassigned');
      router.push('/mentor/tasks');
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not unassign the task'));
      setUnassigning(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back button */}
      <PageHeader backHref="/mentor/tasks" backLabel="Back to Tasks" />

      {/* Task Header */}
      <div className="bg-card rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h1 className="text-2xl text-slate-900">{taskTitle}</h1>
              {task.isCustomTask ? (
                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Custom
                </span>
              ) : (
                <span className="px-2 py-1 bg-brand-100 text-brand-700 rounded text-xs font-medium flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> Roadmap
                </span>
              )}
              {task.hasOverrides && (
                <span className="px-2 py-1 bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300 rounded text-xs font-medium flex items-center gap-1">
                  <Pencil className="w-3 h-3" /> Customized for this mentee
                </span>
              )}
            </div>
            {taskDescription && (descriptionIsHtml ? (
              <div className="prose prose-sm max-w-none dark:prose-invert text-slate-600 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: taskDescription }} />
            ) : (
              <p className="text-slate-600 whitespace-pre-wrap">{taskDescription}</p>
            ))}
            {task.mentorNote && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 px-3 py-2">
                <StickyNote className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Note from your mentor</p>
                  <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap">{task.mentorNote}</p>
                </div>
              </div>
            )}
          </div>
              <StatusBadge status={task.status} />
        </div>

        {/* Mentee info */}
        {task.mentee && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <User className="w-5 h-5 text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-900">
                {task.mentee.firstName} {task.mentee.lastName}
              </p>
              <p className="text-xs text-slate-500">
                {task.enrollment?.program?.name}
              </p>
            </div>
          </div>
        )}

        {/* Meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
          {task.dueDate && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Due Date</p>
              <p className="text-sm text-slate-900 flex items-center gap-1">
                <Calendar className="w-4 h-4 text-slate-400" />
                {new Date(task.dueDate).toLocaleDateString()}
              </p>
            </div>
          )}
          {task.assignedAt && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Assigned</p>
              <p className="text-sm text-slate-900 flex items-center gap-1">
                <Calendar className="w-4 h-4 text-slate-400" />
                {new Date(task.assignedAt).toLocaleDateString()}
              </p>
            </div>
          )}
          {task.completedAt && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Completed</p>
              <p className="text-sm text-slate-900 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                {new Date(task.completedAt).toLocaleDateString()}
              </p>
            </div>
          )}
          {task.roadmapTask?.estimatedHours && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Estimated</p>
              <p className="text-sm text-slate-900 flex items-center gap-1">
                <Clock className="w-4 h-4 text-slate-400" />
                {task.roadmapTask.estimatedHours}h
              </p>
            </div>
          )}
        </div>

        {/* Mentor task controls: change deadline + unassign a mistaken assignment */}
        {(canCancel || canUnassign) && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" />Manage deadline</p>
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={dueEdit} onChange={(e) => setDueEdit(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <button onClick={saveDueDate} disabled={savingDue || !dueEdit}
                className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
                {savingDue ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}Set deadline
              </button>
              {canUnassign && (
                <button onClick={unassign} disabled={unassigning}
                  className="ml-auto px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
                  {unassigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}Unassign
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">The deadline lands at end of day in the mentee&apos;s timezone, and they&apos;re notified.</p>
          </div>
        )}

        {/* Rating & Points */}
        {task.status === 'completed' && (task.finalRating || task.pointsAwarded != null) && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-6">
            {task.finalRating && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-5 h-5 ${
                        star <= parseFloat(task.finalRating)
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-slate-200'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-slate-600">{parseFloat(task.finalRating).toFixed(1)} / 5</span>
              </div>
            )}
            {task.pointsAwarded != null && (
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-brand-500" />
                <span className="text-sm font-semibold text-brand-700">{task.pointsAwarded} points awarded</span>
              </div>
            )}
          </div>
        )}

        {/* Cancellation reason */}
        {task.status === 'cancelled' && task.cancellationReason && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-900">Task Cancelled</p>
              <p className="text-sm text-red-700 mt-1">{task.cancellationReason}</p>
            </div>
          </div>
        )}

        {/* Edit (per-mentee) + Reassign (if cancelled) */}
        {task.status !== 'completed' && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <button onClick={() => setEditing(true)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium inline-flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5" />Edit for this mentee
            </button>
            {task.status === 'cancelled' && (
              <button onClick={reassign} disabled={reassigning}
                className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
                {reassigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}Reassign
              </button>
            )}
          </div>
        )}
      </div>

      {/* Task Requirements */}
      <div className="bg-card rounded-2xl border border-slate-200 p-6 space-y-5">
        <h2 className="text-lg font-semibold text-slate-900">Task Requirements</h2>

        {taskDeliverable && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900 mb-1">Deliverable</p>
            <p className="text-sm text-blue-800">{taskDeliverable}</p>
          </div>
        )}

        {acceptanceCriteria.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-3">Acceptance Criteria</h3>
            <ul className="space-y-2">
              {acceptanceCriteria.map((criterion: string, index: number) => (
                <li key={index} className="flex items-start gap-2 text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span className="text-sm">{criterion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {resources.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-3">Learning Resources</h3>
            <ul className="space-y-2">
              {resources.map((resource: any, index: number) => (
                <ResourceLink key={resource.id || resource.url || index} url={resource.url} title={resource.title} />
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Submission */}
      {task.submissions && task.submissions.length > 0 && (
        <div className="bg-card rounded-2xl border border-slate-200 p-6 space-y-5">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-500" />
            Mentee Submission
            {task.submissions.length > 1 && (
              <span className="text-xs text-slate-500 font-normal ml-1">(v{latestSubmission?.version})</span>
            )}
          </h2>

          {latestSubmission && (
            <div className="space-y-4">
              {latestSubmission.status && (
                <StatusBadge status={latestSubmission.status} />
              )}

              {latestSubmission.submissionText && (
                <div>
                  <p className="text-xs text-slate-500 mb-2">Submission Description</p>
                  <RichContent
                    html={latestSubmission.submissionText}
                    className="text-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 border border-slate-100 dark:border-slate-700"
                  />
                </div>
              )}

              {latestSubmission.submissionUrls && latestSubmission.submissionUrls.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-2">Project Links</p>
                  <ul className="space-y-1.5">
                    {latestSubmission.submissionUrls.map((url: string, i: number) => (
                      <li key={i}>
                        <a
                          href={toExternalHref(url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-brand-600 hover:underline flex items-center gap-2"
                        >
                          <ExternalLink className="w-4 h-4" />
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Submitted on {new Date(latestSubmission.submittedAt).toLocaleString()}
                {latestSubmission.reviewedAt && (
                  <> · Reviewed on {new Date(latestSubmission.reviewedAt).toLocaleString()}</>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Feedback given */}
      {feedback.length > 0 && (
        <div className="bg-card rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-brand-500" />
            Feedback Given
          </h2>
          {feedback.map((fb: any, index: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            const decision: string = fb.decision || (fb.isApproved ? 'approved' : 'changes');
            const isChanges = decision === 'changes' || decision === 'rejected';
            const ratingNum = Number(fb.rating);
            const DECISION_META: Record<string, { label: string; cls: string }> = {
              approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700' },
              approved_notes: { label: 'Approved with notes', cls: 'bg-emerald-100 text-emerald-700' },
              changes: { label: 'Changes requested', cls: 'bg-amber-100 text-amber-700' },
              rejected: { label: 'Not accepted', cls: 'bg-rose-100 text-rose-700' },
            };
            const meta = DECISION_META[decision] || DECISION_META.changes;
            const showNotes = fb.revisionNotes && fb.revisionNotes.trim() && fb.revisionNotes.trim() !== (fb.feedbackText || '').trim();
            return (
              <div key={fb.id || index} className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                    {fb.version != null && <span className="text-[11px] text-slate-400">on v{fb.version}</span>}
                  </div>
                  {Number.isFinite(ratingNum) && ratingNum > 0 && (
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} className={`w-4 h-4 ${star <= Math.round(ratingNum) ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200'}`} />
                      ))}
                    </div>
                  )}
                </div>
                {fb.feedbackText && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">{isChanges ? 'What you asked for' : 'Feedback'}</p>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{fb.feedbackText}</p>
                  </div>
                )}
                {showNotes && (
                  <div>
                    <p className="text-xs font-medium text-amber-700 mb-1">Changes to make</p>
                    <p className="text-sm text-amber-900 whitespace-pre-wrap">{fb.revisionNotes}</p>
                  </div>
                )}
                {fb.createdAt && (
                  <p className="text-xs text-slate-400">{new Date(fb.createdAt).toLocaleString()}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Extension Request ── */}
      {(() => {
        const pendingExtension = task.submissions?.find(
          (s: any) => s.extensionRequested && s.extensionStatus === 'pending'
        );
        if (!pendingExtension) return null;
        return (
          <div className="bg-orange-50 border-2 border-orange-300 rounded-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Clock className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-orange-900 mb-1">Extension Request Pending</h2>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-orange-700 font-medium">Days Requested</p>
                    <p className="text-orange-900">{pendingExtension.extensionDays} day{pendingExtension.extensionDays !== 1 ? 's' : ''}</p>
                  </div>
                  <div>
                    <p className="text-orange-700 font-medium">Reason</p>
                    <p className="text-orange-900">{pendingExtension.extensionReason || '-'}</p>
                  </div>
                  <div>
                    <p className="text-orange-700 font-medium">Current Due Date</p>
                    <p className="text-orange-900">{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '-'}</p>
                  </div>
                  {task.dueDate && pendingExtension.extensionDays && (
                    <div>
                      <p className="text-orange-700 font-medium">New Due Date if Approved</p>
                      <p className="text-orange-900">
                        {new Date(
                          new Date(task.dueDate).getTime() + pendingExtension.extensionDays * 86400000
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Decision UI */}
            {extensionDecision === null && (
              <div className="flex gap-3 pt-2 border-t border-orange-200">
                <button
                  onClick={() => setExtensionDecision('approve')}
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve Extension
                </button>
                <button
                  onClick={() => setExtensionDecision('reject')}
                  className="px-5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  Reject Extension
                </button>
              </div>
            )}

            {extensionDecision === 'approve' && (
              <div className="pt-2 border-t border-orange-200 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-orange-800 mb-1">
                    Override new due date <span className="text-orange-500 font-normal">(optional - leave blank to use +{pendingExtension.extensionDays} days)</span>
                  </label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="px-3 py-2 border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExtension(true, pendingExtension.id)}
                    disabled={isHandlingExtension}
                    className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isHandlingExtension ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Approving...</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4" /> Confirm Approve</>
                    )}
                  </button>
                  <button
                    onClick={() => setExtensionDecision(null)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-card transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}

            {extensionDecision === 'reject' && (
              <div className="pt-2 border-t border-orange-200 space-y-3">
                <p className="text-sm text-orange-800">Are you sure you want to reject this extension request? The mentee will keep the original due date.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExtension(false, pendingExtension.id)}
                    disabled={isHandlingExtension}
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isHandlingExtension ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Rejecting...</>
                    ) : (
                      <><XCircle className="w-4 h-4" /> Confirm Reject</>
                    )}
                  </button>
                  <button
                    onClick={() => setExtensionDecision(null)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-card transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Actions */}
      <div className="flex items-center justify-between gap-4">
        {canCancel && !cancellingTask && (
          <button
            onClick={() => setCancellingTask(true)}
            className="px-5 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl border border-red-200 font-medium transition-colors text-sm"
          >
            Cancel Task
          </button>
        )}

        {canReview && !cancellingTask && (
          <button
            onClick={() => router.push(`/mentor/tasks/${task.id}/feedback`)}
            className="ml-auto px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Review Submission
          </button>
        )}

        {task.status === 'completed' && !cancellingTask && (
          <button
            onClick={() => router.push(`/mentor/tasks/${task.id}/feedback`)}
            className="ml-auto px-6 py-2.5 border border-slate-200 text-slate-700 hover:bg-card rounded-xl font-medium transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Edit Review
          </button>
        )}
      </div>

      {/* Cancel confirmation */}
      {cancellingTask && (
        <div className="p-5 bg-red-50 border border-red-200 rounded-2xl">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-red-900 font-medium mb-1">Cancel this task?</p>
              <p className="text-red-700 text-sm">This will mark the task as cancelled. The mentee will be notified.</p>
            </div>
          </div>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Provide a reason for cancellation..."
            className="w-full p-3 border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 mb-3 text-sm"
            rows={3}
          />
          <div className="flex gap-2">
            <button
              onClick={handleCancelTask}
              disabled={isCancelling}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              {isCancelling ? 'Cancelling...' : 'Confirm Cancel'}
            </button>
            <button
              onClick={() => { setCancellingTask(false); setCancelReason(''); }}
              className="px-4 py-2 bg-card hover:bg-slate-50 text-slate-700 rounded-lg transition-colors border border-slate-200 text-sm"
            >
              Keep Task
            </button>
          </div>
        </div>
      )}

      {editing && (
        <TaskEditDrawer task={task} onClose={() => setEditing(false)} onSaved={() => window.location.reload()} />
      )}
    </div>
  );
}
