"use client";

import { useQuery } from "@tanstack/react-query";
import taskApi from "@/lib/services/task-api";
import { RichContent } from "@/components/shared/RichContent";
import { ResourceLink } from "@/components/shared/ResourceLink";
import { SubmissionFileList } from "@/components/shared/SubmissionFileList";
import type { SubmissionFile } from "@/lib/types/submission";
import { Star, FileText, MessageSquare, Clock, CheckCircle2, User, ExternalLink, Check } from "lucide-react";
import { toExternalHref } from "@/lib/utils/url";
import { getViewerTimeZone } from "@/lib/utils/datetime";

type Feedback = {
  id: string;
  rating?: number | string | null;
  feedbackText?: string | null;
  decision?: string;
  isApproved?: boolean;
  revisionNotes?: string | null;
  mentor?: { firstName?: string; lastName?: string };
  createdAt?: string;
  checkedCriteria?: string[];
};
type Submission = {
  id: string;
  version: number;
  submittedAt?: string;
  submissionText?: string;
  submissionUrls?: string[];
  files?: SubmissionFile[];
  status?: string;
  feedback?: Feedback[] | Feedback | null;
};

const DECISION_META: Record<string, { label: string; cls: string }> = {
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40' },
  approved_notes: { label: 'Approved with notes', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40' },
  changes: { label: 'Changes requested', cls: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/40' },
  rejected: { label: 'Not accepted', cls: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40' },
};

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

/** Fetch full submissions on demand; display them with premium UI cards. */
export function TaskSubmissionHistory({ taskId }: { taskId: string }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["assigned-task-detail", taskId],
    queryFn: async () =>
      (await taskApi.getTaskById(taskId)).data.task as {
        submissions?: Submission[];
      },
  });
  const submissions = data?.submissions || [];

  if (isPending) return <p role="status" className="text-sm text-slate-500 flex items-center gap-2"><Clock className="w-4 h-4 animate-spin" /> Loading submissions…</p>;
  if (isError) return (
    <div role="alert" className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
      <p>Could not load submissions.</p>
      <button onClick={() => refetch()} className="font-semibold underline mt-1">Try again</button>
    </div>
  );
  if (!submissions.length) return null;

  return (
    <section aria-label="Submissions and feedback" className="space-y-6">
      {submissions.map((submission) => {
        const feedbacks = Array.isArray(submission.feedback)
          ? submission.feedback
          : submission.feedback
            ? [submission.feedback]
            : [];

        const latestFeedback = feedbacks[0] || null;
        const ratingNum = latestFeedback?.rating ? Number(latestFeedback.rating) : null;
        const decisionMeta = latestFeedback ? (DECISION_META[latestFeedback.decision || (latestFeedback.isApproved ? 'approved' : 'changes')] || DECISION_META.approved) : null;

        return (
          <article key={submission.id} className="space-y-4">

            {/* SUBMISSION CARD */}
            <div className="bg-card rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  Mentee Submission v{submission.version || 1}
                </h3>
                <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDate(submission.submittedAt, true)}
                </span>
              </div>

              {submission.submissionText ? (
                <div className="rounded-xl bg-muted border border-border/50 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Submission Notes
                  </p>
                  <RichContent
                    html={submission.submissionText}
                    className="text-xs sm:text-sm text-foreground prose-p:text-foreground prose-strong:text-foreground leading-relaxed"
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No written submission description provided.</p>
              )}

              {Array.isArray(submission.submissionUrls) && submission.submissionUrls.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Project Links</p>
                  <ul className="space-y-1.5">
                    {submission.submissionUrls.map((url: string, i: number) => (
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

              {!!submission.files?.length && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Attached Files</p>
                  <SubmissionFileList files={submission.files} />
                </div>
              )}
            </div>

            {/* FEEDBACK CARD */}
            {feedbacks.length > 0 && (
              <div className="bg-emerald-500/10 rounded-2xl border border-emerald-500/20 p-4 sm:p-5 space-y-4 shadow-sm">

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-500/20 pb-3">
                  <h3 className="text-sm font-semibold text-emerald-600 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-emerald-500" />
                    Review &amp; Feedback
                  </h3>

                  <div className="flex items-center gap-3 flex-wrap">
                    {decisionMeta && (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${decisionMeta.cls}`}>
                        {decisionMeta.label}
                      </span>
                    )}

                    {ratingNum != null && ratingNum > 0 && (
                      <div className="flex items-center gap-1.5 bg-background px-2.5 py-1 rounded-full border border-border">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-3.5 h-3.5 ${star <= Math.round(ratingNum)
                                ? 'fill-amber-500 text-amber-500'
                                : 'text-muted'
                                }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs font-bold text-foreground tabular-nums">
                          {ratingNum.toFixed(1)} / 5
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {feedbacks.map((fb, idx) => {
                    const mentorName = [fb.mentor?.firstName, fb.mentor?.lastName].filter(Boolean).join(' ');
                    const showNotes = fb.revisionNotes && fb.revisionNotes.trim() && fb.revisionNotes.trim() !== (fb.feedbackText || '').trim();

                    return (
                      <div key={fb.id || idx} className="space-y-3">
                        {fb.feedbackText && (
                          <div className="rounded-xl bg-background border border-emerald-500/20 p-4 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-2">
                              Feedback Note
                            </p>
                            <RichContent
                              html={fb.feedbackText}
                              className="text-xs sm:text-sm text-foreground prose-p:text-foreground prose-strong:text-foreground leading-relaxed"
                            />
                          </div>
                        )}

                        {showNotes && (
                          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 mb-2">
                              Revision Instructions
                            </p>
                            <RichContent
                              html={fb.revisionNotes}
                              className="text-xs sm:text-sm text-foreground prose-p:text-foreground prose-strong:text-foreground leading-relaxed"
                            />
                          </div>
                        )}

                        {Array.isArray(fb.checkedCriteria) && fb.checkedCriteria.length > 0 && (
                          <div className="pt-1">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Met Criteria</p>
                            <div className="flex flex-wrap gap-1.5">
                              {fb.checkedCriteria.map((c: string, ci: number) => (
                                <span key={ci} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
                                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  {c}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 px-1">
                          <span className="inline-flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 bg-slate-100 dark:bg-slate-800 rounded-full p-0.5" />
                            {mentorName || 'Reviewing mentor'}
                          </span>
                          {fb.createdAt && <span>{formatDate(fb.createdAt, true)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
