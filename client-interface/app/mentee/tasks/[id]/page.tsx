'use client';

import { use, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Calendar,
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
  StickyNote,
} from 'lucide-react';
import { ResourceLink } from '@/components/shared/ResourceLink';
import { useTaskDetail } from '@/lib/hooks/mentee';
import { PageHeader, StatusBadge } from '@/components/admin/ui';
import { useActivityTracker } from '@/lib/hooks/shared/useActivityTracker';
import { FrictionPanel } from '@/components/mentee/FrictionPanel';
import { SubmitTaskDrawer } from '@/components/mentee/SubmitTaskDrawer';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TaskDetailsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const { task, loading, error, refetch } = useTaskDetail(resolvedParams.id);
  const { trackEvent } = useActivityTracker();
  const [submitOpen, setSubmitOpen] = useState(false);

  useEffect(() => {
    if (task?.id) {
      trackEvent('task_opened', {
        eventCategory: 'task',
        entityType: 'task',
        entityId: task.id,
      });
    }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Step details are authored in a rich-text editor (HTML); older tasks stored
  // plain text. Render HTML safely, fall back to plain text for legacy values.
  const descriptionIsHtml = /<[a-z][\s\S]*>/i.test(taskDescription);
  const taskDeliverable = task.roadmapTask?.deliverable || task.deliverable;
  const acceptanceCriteria = task.roadmapTask?.acceptanceCriteria || task.acceptanceCriteria || [];
  const resources = task.roadmapTask?.resources || [];
  // The API returns submissions ordered version DESC; pick the highest version
  // robustly (don't assume array order) so we show the mentee's LATEST work.
  const submissionsList: any[] = task.submissions || []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const latestSubmission = submissionsList.length
    ? [...submissionsList].sort((a, b) => (b.version || 0) - (a.version || 0))[0]
    : null;
  // Show ALL mentor feedback across every version (newest first) so the mentee
  // still sees what was requested even after they re-submit a new version.
  const feedback = submissionsList
    .flatMap((s: any) => (s.feedback || []).map((fb: any) => ({ ...fb, version: s.version }))) // eslint-disable-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()); // eslint-disable-line @typescript-eslint/no-explicit-any

  // A mentee can still change their work while it's awaiting review ('submitted')
  // — only a graded/cancelled task is locked. Resubmitting creates a new version.
  const canSubmit = ['in_progress', 'revision_needed', 'assigned', 'submitted'].includes(task.status);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back button */}
      <PageHeader backHref="/mentee/tasks" backLabel="Back to Tasks" />

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

        {/* Meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100">
          {task.dueDate && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Due Date</p>
              <p className="text-sm text-slate-900 flex items-center gap-1">
                <Calendar className="w-4 h-4 text-slate-400" />
                {new Date(task.dueDate).toLocaleDateString()}
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
          {(task.points ?? task.pointsBase ?? task.roadmapTask?.pointsBase) != null && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Points</p>
              <p className="text-sm text-slate-900 flex items-center gap-1">
                <Award className="w-4 h-4 text-brand-500" />
                {task.status === 'completed' && task.pointsAwarded != null
                  ? `${task.pointsAwarded} / ${task.points ?? task.pointsBase ?? task.roadmapTask?.pointsBase}`
                  : `Worth ${task.points ?? task.pointsBase ?? task.roadmapTask?.pointsBase}`}
              </p>
            </div>
          )}
        </div>

        {/* Rating & Points (completed tasks) */}
        {task.status === 'completed' && (task.finalRating || task.pointsAwarded) && (
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
                <span className="text-sm font-semibold text-brand-700">{task.pointsAwarded} points earned</span>
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

      {/* Submission(s) */}
      {task.submissions && task.submissions.length > 0 && (
        <div className="bg-card rounded-2xl border border-slate-200 p-6 space-y-5">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-500" />
            Your Submission
            {task.submissions.length > 1 && (
              <span className="text-xs text-slate-500 font-normal ml-1">(v{latestSubmission?.version})</span>
            )}
          </h2>

          {latestSubmission && (
            <div className="space-y-4">
              {/* Status badge */}
              {latestSubmission.status && (
                <StatusBadge status={latestSubmission.status} />
              )}

              {/* Submission text */}
              {latestSubmission.submissionText && (
                <div>
                  <p className="text-xs text-slate-500 mb-2">Submission Description</p>
                  <div
                    className="prose prose-sm max-w-none text-slate-700 bg-slate-50 rounded-lg p-4 border border-slate-100"
                    dangerouslySetInnerHTML={{ __html: latestSubmission.submissionText }}
                  />
                </div>
              )}

              {/* Submission URLs */}
              {latestSubmission.submissionUrls && latestSubmission.submissionUrls.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-2">Project Links</p>
                  <ul className="space-y-1.5">
                    {latestSubmission.submissionUrls.map((url: string, i: number) => (
                      <li key={i}>
                        <a
                          href={url}
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

              {/* Submitted at */}
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

      {/* Mentor Feedback */}
      {feedback.length > 0 && (
        <div className="bg-card rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-brand-500" />
            Mentor Feedback
          </h2>
          {feedback.map((fb: any, index: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            // Map the real TaskFeedback shape (feedbackText / revisionNotes /
            // inlineFeedback / decision), not the old comments/strengths fields.
            const decision: string = fb.decision || (fb.isApproved ? 'approved' : 'changes');
            const isChanges = decision === 'changes' || decision === 'rejected';
            const ratingNum = Number(fb.rating);
            const mentorName = [fb.mentor?.firstName || task.mentor?.firstName, fb.mentor?.lastName || task.mentor?.lastName].filter(Boolean).join(' ');
            const DECISION_META: Record<string, { label: string; cls: string }> = {
              approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700' },
              approved_notes: { label: 'Approved with notes', cls: 'bg-emerald-100 text-emerald-700' },
              changes: { label: 'Changes requested', cls: 'bg-amber-100 text-amber-700' },
              rejected: { label: 'Not accepted', cls: 'bg-rose-100 text-rose-700' },
            };
            const meta = DECISION_META[decision] || DECISION_META.changes;
            // feedbackText and revisionNotes are often identical for a "changes"
            // decision — only show the notes block when it adds something.
            const showNotes = fb.revisionNotes && fb.revisionNotes.trim() && fb.revisionNotes.trim() !== (fb.feedbackText || '').trim();
            const cardCls = isChanges
              ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20'
              : 'bg-brand-50 dark:bg-brand-500/10 border-brand-200 dark:border-brand-500/20';
            return (
              <div key={fb.id || index} className={`p-4 border rounded-lg space-y-3 ${cardCls}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-900">{mentorName || 'Your mentor'}</span>
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
                    <p className="text-xs font-medium text-slate-500 mb-1">{isChanges ? 'What the mentor asked for' : 'Feedback'}</p>
                    <div className="text-sm text-slate-800 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: fb.feedbackText }} />
                  </div>
                )}

                {showNotes && (
                  <div>
                    <p className="text-xs font-medium text-amber-700 mb-1">Changes to make</p>
                    <p className="text-sm text-amber-900 whitespace-pre-wrap">{fb.revisionNotes}</p>
                  </div>
                )}

                {Array.isArray(fb.inlineFeedback) && fb.inlineFeedback.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Inline notes</p>
                    <ul className="space-y-1">
                      {fb.inlineFeedback.map((line: any, i: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                        <li key={i} className="text-sm text-slate-700">• {typeof line === 'string' ? line : (line?.text || line?.note || JSON.stringify(line))}</li>
                      ))}
                    </ul>
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

      {/* What's getting in the way - log blocker / delay / request extension */}
      {!['completed', 'cancelled'].includes(task.status) && (
        <FrictionPanel taskId={task.id} />
      )}

      {/* Action: open the in-context submission drawer if the task needs work */}
      {canSubmit && (
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => setSubmitOpen(true)}
            className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium transition-colors"
          >
            {task.status === 'submitted' ? 'Update submission' : task.status === 'revision_needed' ? 'Re-submit Work' : 'Submit Work'}
          </button>
          {task.status === 'submitted' && (
            <p className="text-xs text-slate-400">You can update your work until your mentor reviews it.</p>
          )}
        </div>
      )}

      <SubmitTaskDrawer
        open={submitOpen}
        task={{ id: task.id, title: taskTitle, status: task.status, deliverable: taskDeliverable, acceptanceCriteria }}
        onClose={() => setSubmitOpen(false)}
        onSubmitted={refetch}
      />
    </div>
  );
}
