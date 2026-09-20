'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  CheckCircle2, Clock, Award, Pencil, RotateCcw, Trash2, Loader2, StickyNote,
  ClipboardCheck, Star, ExternalLink, FileText, MessageSquare, Calendar, User,
  XCircle, Check, Code2
} from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { ResourceLink } from '@/components/shared/ResourceLink';
import { OpenSourceOrgAvatar } from '@/components/shared/OpenSourceOrgAvatar';

import { TaskEditDrawer } from '@/components/mentor/TaskEditDrawer';
import { RichContent } from '@/components/shared/RichContent';
import { SubmissionFileList } from '@/components/shared/SubmissionFileList';
import taskApi from '@/lib/services/task-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { pointsForDifficulty } from '@/lib/config/points';
import { isMissingDescription, looksLikeHtml } from '@/lib/utils/html';
import { toExternalHref } from '@/lib/utils/url';
import { getViewerTimeZone } from '@/lib/utils/datetime';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  assigned: { label: 'Assigned', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  not_started: { label: 'Not started', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  in_progress: { label: 'In progress', cls: 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800/40' },
  submitted: { label: 'Submitted', cls: 'bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-950/30 dark:text-brand-300 dark:border-brand-800/40' },
  revision_needed: { label: 'Changes requested', cls: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/40' },
  completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/40' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
};
const DIFF_CLS: Record<string, string> = {
  easy: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/40',
  medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/40',
  hard: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800/40',
  expert: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/40',
};

const DECISION_META: Record<string, { label: string; cls: string }> = {
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40' },
  approved_notes: { label: 'Approved with notes', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40' },
  changes: { label: 'Changes requested', cls: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/40' },
  rejected: { label: 'Not accepted', cls: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40' },
};

/**
 * In-context detail + management for ONE mentee's assigned task, opened from the
 * Clan Review "Assigned work" list.
 */
export function MenteeTaskDrawer({
  task,
  onClose,
  onChanged,
}: {
  task: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  onClose: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedSubIndex, setSelectedSubIndex] = useState(0);

  const rt = task.roadmapTask || {};
  const title = rt.title || task.title || 'Task';
  const description = rt.description || task.description || '';
  const isHtml = looksLikeHtml(description);
  const missingDescription = isMissingDescription(description, title);
  const criteria: string[] = rt.acceptanceCriteria || task.acceptanceCriteria || [];
  const resources: any[] = rt.resources || []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const isCompleted = task.status === 'completed';

  // Submissions list
  const submissions: any[] = useMemo(() => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (Array.isArray(task.submissions) && task.submissions.length > 0) {
      return task.submissions;
    }
    return [];
  }, [task.submissions]);

  const activeSubmission = submissions[selectedSubIndex] || submissions[0] || null;

  // Extract all feedbacks across submissions and direct task feedback
  const feedbacks = useMemo(() => {
    const list: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    submissions.forEach((sub) => {
      const fb = sub.feedback;
      if (Array.isArray(fb)) {
        fb.forEach((f) => {
          if (f) list.push({ ...f, version: sub.version });
        });
      } else if (fb) {
        list.push({ ...fb, version: sub.version });
      }
    });
    if (list.length === 0 && Array.isArray(task.feedback)) {
      task.feedback.forEach((f: any) => { if (f) list.push(f); }); // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    return list;
  }, [submissions, task.feedback]);

  const latestFeedback = feedbacks[0] || null;

  // Derive rating (from task.finalRating or latest feedback rating)
  const ratingNum: number | null = useMemo(() => {
    if (task.finalRating != null) {
      const parsed = parseFloat(task.finalRating);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    for (const fb of feedbacks) {
      if (fb.rating != null) {
        const parsed = Number(fb.rating);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
    }
    return null;
  }, [task.finalRating, feedbacks]);

  // Points computation
  const totalPoints = useMemo(() => {
    if (task.points != null) return task.points;
    if (task.pointsBase != null) return task.pointsBase;
    if (rt.pointsBase != null) return rt.pointsBase;
    if (rt.difficulty) return pointsForDifficulty(rt.difficulty);
    return null;
  }, [task.points, task.pointsBase, rt.pointsBase, rt.difficulty]);

  const pointsAwarded = task.pointsAwarded != null ? Number(task.pointsAwarded) : null;

  const formatDate = (val: string | Date | null | undefined, includeTime = false) => {
    if (!val) return null;
    const d = val instanceof Date ? val : new Date(val);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: includeTime ? 'numeric' : undefined,
      minute: includeTime ? '2-digit' : undefined,
      timeZone: getViewerTimeZone(),
    });
  };

  const reassign = async () => {
    try {
      setBusy(true);
      await taskApi.reassignTask(task.id);
      toast.success('Task reassigned');
      onChanged();
      onClose();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not reassign the task'));
    } finally {
      setBusy(false);
    }
  };

  const unassign = async () => {
    if (!(await confirm({
      title: 'Unassign this task?',
      description: "It will be removed from the mentee's list.",
      variant: 'danger',
      confirmLabel: 'Unassign',
    }))) return;
    try {
      setBusy(true);
      await taskApi.unassignTask(task.id);
      toast.success('Task unassigned');
      onChanged();
      onClose();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not unassign the task'));
    } finally {
      setBusy(false);
    }
  };

  const canUnassign = !['submitted', 'completed', 'cancelled'].includes(task.status);
  const canReview = ['submitted', 'revision_needed'].includes(task.status);
  const isReviewed = task.status === 'completed';
  const openReview = () => router.push(`/mentor/tasks/${task.id}/feedback`);

  const statusMeta = STATUS_META[task.status] || STATUS_META.assigned;
  const isLate = !!task.isLate || !!activeSubmission?.isLate;
  const completedDate = task.completedAt || activeSubmission?.reviewedAt;
  const showReviewCard = isCompleted || ratingNum != null || latestFeedback != null;

  return (
    <>
      {!editing && (
        <Drawer
          open
          onClose={onClose}
          title={title}
          subtitle="Assigned work · mentee task details"
          width="lg"
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2 w-full">
              <div className="flex items-center gap-2">
                {canUnassign && (
                  <button
                    onClick={unassign}
                    disabled={busy}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />Unassign
                  </button>
                )}
                {task.status === 'cancelled' && (
                  <button
                    onClick={reassign}
                    disabled={busy}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}Reassign
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5"
                >
                  <Pencil className="w-4 h-4" />Edit task / note
                </button>
                {canReview && (
                  <button
                    onClick={openReview}
                    className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-medium inline-flex items-center gap-1.5"
                  >
                    <ClipboardCheck className="w-4 h-4" />Review submission
                  </button>
                )}
                {isReviewed && (
                  <button
                    onClick={openReview}
                    className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-medium inline-flex items-center gap-1.5"
                  >
                    <ClipboardCheck className="w-4 h-4" />Edit review
                  </button>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Header Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusMeta.cls}`}>
                {statusMeta.label}
              </span>
              {rt.type && (
                <span className="px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-950/40 dark:text-brand-300 dark:border-brand-800/40 text-xs font-semibold capitalize">
                  {rt.type}
                </span>
              )}
              {rt.difficulty && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${DIFF_CLS[rt.difficulty] || 'bg-slate-100 text-slate-600'}`}>
                  {rt.difficulty}
                </span>
              )}
              <span className="px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-950/40 dark:text-brand-300 dark:border-brand-800/40 text-xs font-medium">
                {task.isCustomTask ? 'Custom task' : (task.roadmapName || rt.roadmap?.name ? `Roadmap · ${task.roadmapName || rt.roadmap?.name}` : 'Roadmap')}
              </span>
              {task.hasOverrides && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 text-xs font-medium border border-amber-200 dark:border-amber-800/40">
                  Customized for mentee
                </span>
              )}
              {isLate && (
                <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 text-xs font-medium border border-rose-200 dark:border-rose-800/40 inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />Late
                </span>
              )}
            </div>

            {/* Cancellation Banner */}
            {task.status === 'cancelled' && task.cancellationReason && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 p-3.5 flex items-start gap-2.5">
                <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-rose-900 dark:text-rose-300">Task Cancelled</p>
                  <p className="text-xs text-rose-700 dark:text-rose-300/90 mt-0.5">{task.cancellationReason}</p>
                </div>
              </div>
            )}

            {/* Mentor Note Banner */}
            {task.mentorNote && (
              <div className="rounded-xl bg-amber-50/80 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3.5 py-3">
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-300 inline-flex items-center gap-1.5">
                  <StickyNote className="w-3.5 h-3.5" />Your note to this mentee
                </p>
                <p className="text-xs text-amber-900 dark:text-amber-200 whitespace-pre-wrap mt-1">{task.mentorNote}</p>
              </div>
            )}

            {/* ── BOX 1: SINGLE UNIFIED REVIEW & EVALUATION CARD ── */}
            {showReviewCard && (
              <div className="bg-card rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    Review &amp; Feedback
                  </h3>
                  {totalPoints != null && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400">
                      <Award className="w-4 h-4" />
                      <span>
                        {isCompleted && pointsAwarded != null
                          ? `${pointsAwarded} / ${totalPoints} pts earned`
                          : isCompleted
                            ? `${totalPoints} pts awarded`
                            : `${totalPoints} pts`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Rating & Decision Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    {latestFeedback && (
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${DECISION_META[latestFeedback.decision || (latestFeedback.isApproved ? 'approved' : 'changes')]?.cls || DECISION_META.approved.cls
                        }`}>
                        {DECISION_META[latestFeedback.decision || (latestFeedback.isApproved ? 'approved' : 'changes')]?.label || 'Reviewed'}
                        {latestFeedback.version != null && <span className="ml-1 opacity-70 font-normal">v{latestFeedback.version}</span>}
                      </span>
                    )}

                    {ratingNum != null && (
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-4 h-4 ${star <= Math.round(ratingNum)
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-200 dark:text-slate-700'
                                }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                          {ratingNum.toFixed(1)} / 5
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Timestamps */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    {completedDate && (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Completed {formatDate(completedDate)}
                      </span>
                    )}
                    {due && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        Due {formatDate(due)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Feedbacks list (notes & criteria in high-contrast gray box) */}
                {feedbacks.length > 0 ? (
                  <div className="space-y-3">
                    {feedbacks.map((fb, idx) => {
                      const mentorName = [fb.mentor?.firstName || task.mentor?.firstName, fb.mentor?.lastName || task.mentor?.lastName].filter(Boolean).join(' ');
                      const showNotes = fb.revisionNotes && fb.revisionNotes.trim() && fb.revisionNotes.trim() !== (fb.feedbackText || '').trim();

                      return (
                        <div key={fb.id || idx} className="space-y-2.5">
                          {fb.feedbackText && (
                            <div className="rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 p-3.5">
                              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 mb-1">
                                Feedback Note
                              </p>
                              <RichContent
                                html={fb.feedbackText}
                                className="text-xs sm:text-sm text-emerald-900 dark:text-emerald-100 prose-p:text-emerald-900 dark:prose-p:text-emerald-100 prose-strong:text-emerald-950 dark:prose-strong:text-white leading-relaxed"
                              />
                            </div>
                          )}

                          {showNotes && (
                            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-3.5">
                              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">
                                Revision Instructions
                              </p>
                              <RichContent
                                html={fb.revisionNotes}
                                className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 prose-p:text-slate-800 dark:prose-p:text-slate-200 prose-strong:text-slate-900 dark:prose-strong:text-white leading-relaxed"
                              />
                            </div>
                          )}

                          {Array.isArray(fb.checkedCriteria) && fb.checkedCriteria.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">Met Criteria</p>
                              <div className="flex flex-wrap gap-1.5">
                                {fb.checkedCriteria.map((c: string, ci: number) => (
                                  <span key={ci} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
                                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                    {c}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-0.5">
                            <span className="inline-flex items-center gap-1">
                              <User className="w-3.5 h-3.5" />
                              {mentorName || 'Reviewing mentor'}
                            </span>
                            {fb.createdAt && <span>{formatDate(fb.createdAt, true)}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Completed without written feedback note.</p>
                )}
              </div>
            )}

            {/* ── BOX 2: SINGLE UNIFIED SUBMISSION CARD ── */}
            {submissions.length > 0 && (
              <div className="bg-card rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    Mentee Submission
                  </h3>
                  {submissions.length > 1 && (
                    <div className="flex items-center gap-1">
                      {submissions.map((sub, idx) => (
                        <button
                          key={sub.id || idx}
                          onClick={() => setSelectedSubIndex(idx)}
                          className={`px-2 py-0.5 text-xs rounded-md font-medium transition-colors ${selectedSubIndex === idx
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                            }`}
                        >
                          v{sub.version || idx + 1}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {activeSubmission && (
                  <div className="space-y-3">
                    {/* Submission text in refined inset box */}
                    {activeSubmission.submissionText ? (
                      <div className="rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 p-3.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 mb-1">
                          Submission Notes
                        </p>
                        <RichContent
                          html={activeSubmission.submissionText}
                          className="text-xs sm:text-sm text-emerald-900 dark:text-emerald-100 prose-p:text-emerald-900 dark:prose-p:text-emerald-100 prose-strong:text-emerald-950 dark:prose-strong:text-white leading-relaxed"
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No written submission description provided.</p>
                    )}

                    {/* Submission links */}
                    {Array.isArray(activeSubmission.submissionUrls) && activeSubmission.submissionUrls.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">Project Links</p>
                        <ul className="space-y-1.5">
                          {activeSubmission.submissionUrls.map((url: string, i: number) => (
                            <li key={i}>
                              <a
                                href={toExternalHref(url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline break-all"
                              >
                                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                                {url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Submission attachments */}
                    {Array.isArray(activeSubmission.files) && activeSubmission.files.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">Attached Files</p>
                        <SubmissionFileList files={activeSubmission.files} />
                      </div>
                    )}

                    {/* Submission footer metadata */}
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Submitted {formatDate(activeSubmission.submittedAt, true)}
                      </span>
                      {activeSubmission.status && (
                        <span className="capitalize font-medium text-slate-700 dark:text-slate-300">
                          {activeSubmission.status.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── BOX 3: SINGLE UNIFIED TASK REQUIREMENTS CARD ── */}
            <div className="bg-card rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3.5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Task Requirements
              </h3>

              {missingDescription ? (
                <p className="text-xs text-slate-400">No description provided.</p>
              ) : isHtml ? (
                <div
                  className="prose prose-xs sm:prose-sm max-w-none dark:prose-invert text-slate-900 dark:text-slate-100 prose-p:text-slate-900 dark:prose-p:text-slate-100"
                  dangerouslySetInnerHTML={{ __html: description }}
                />
              ) : (
                <p className="text-xs sm:text-sm text-slate-900 dark:text-slate-100 whitespace-pre-wrap leading-relaxed">{description}</p>
              )}

              {Array.isArray(task.openSourceOrgs) && task.openSourceOrgs.length > 0 && (
                <div className="rounded-xl border border-brand-200 dark:border-brand-500/30 bg-brand-50/60 dark:bg-brand-500/10 p-3.5 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-900 dark:text-brand-300 inline-flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                    Open Source Organization{task.openSourceOrgs.length > 1 ? 's' : ''}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {task.openSourceOrgs.map((org: any) => (
                      <a
                        key={org.id || org.name}
                        href={org.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-200 dark:border-brand-500/30 bg-white dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                      >
                        <OpenSourceOrgAvatar name={org.name} url={org.url} avatar={org.avatar} className="w-4 h-4 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700" />
                        <span>{org.name}</span>
                        <ExternalLink className="w-3 h-3 text-brand-600 dark:text-brand-400 opacity-70" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {rt.deliverable && (
                <div className="rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 mb-1">Required Deliverable</p>
                  <p className="text-xs sm:text-sm text-emerald-900 dark:text-emerald-100 font-normal leading-relaxed">{rt.deliverable}</p>
                </div>
              )}

              {criteria.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">Acceptance Criteria</p>
                  <ul className="space-y-1.5">
                    {criteria.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {resources.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1.5">Resources</p>
                  <ul className="space-y-1.5">
                    {resources.map((r, i) => (
                      <ResourceLink key={r.id || r.url || i} url={r.url} title={r.title} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </Drawer>
      )}

      {editing && (
        <TaskEditDrawer
          task={task}
          onClose={() => setEditing(false)}
          onSaved={() => {
            onChanged();
            onClose();
          }}
        />
      )}
    </>
  );
}
