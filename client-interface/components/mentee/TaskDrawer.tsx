'use client';

/* eslint-disable @typescript-eslint/no-explicit-any -- the task payload is
   untyped at its source (`useTaskDetail` returns `any`); typing it here would
   invent a contract the API does not yet publish. */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Award, CheckCircle2, ChevronDown, Clock, ExternalLink, FileText, Loader2,
  MessageSquare, Star, XCircle,
} from 'lucide-react';

import { Drawer } from '@/components/shared/Drawer';
import { participateHref } from '@/components/mentee/tasks/MenteeTaskRow';
import { StatusBadge } from '@/components/admin/ui';
import { SubmissionFileList } from '@/components/shared/SubmissionFileList';
import { ResourceLink } from '@/components/shared/ResourceLink';
import { TaskProgressTimeline } from '@/components/shared/TaskProgressTimeline';
import { useMenteeTaskDetail, type MenteeTaskSource } from '@/lib/hooks/mentee';
import { isMissingDescription } from '@/lib/utils/html';
import { MyDiscussionResult } from '@/components/mentee/discussions/MyDiscussionResult';
import { discussionReviewText } from '@/components/mentee/discussions/discussionReviewText';

/**
 * One task, opened where the mentee already is.
 *
 * Reading a task used to mean leaving the list for a full page and then finding
 * your way back to it — for something you often only want to re-read the brief
 * of before carrying on. The route still exists and still works, because every
 * notification the server sends links straight to `/mentee/tasks/:id` and those
 * links have to keep resolving. This is the fast path, not a replacement.
 *
 * The drawer leads with whatever is true right now rather than showing one
 * fixed layout:
 *   assigned         → the brief, and a button to start
 *   in progress      → the brief and the log, and a button to submit
 *   changes needed   → the mentor's notes FIRST, then the brief
 *   submitted        → what was sent, and that it is being looked at
 *   completed        → the verdict and the points, then the work, then the brief
 *
 * Submission itself is not re-implemented here. The caller already owns
 * `SubmitTaskDrawer`; this asks for it through `onSubmit` so there is exactly
 * one submission form in the product.
 */
export function TaskDrawer({
  taskId, open, onClose, onStart, onSubmit, readOnly = false, source = 'clan',
}: {
  /** Null when nothing is selected — the detail query stays idle. */
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  onStart?: (taskId: string) => void | Promise<void>;
  onSubmit?: (task: any) => void;
  readOnly?: boolean;
  /**
   * Which scope the task belongs to. A selection round's work is fenced out of
   * the clan endpoints, so it is read through the candidate API and mapped onto
   * this same shape — the drawer itself does not care which it got.
   */
  source?: MenteeTaskSource;
}) {
  const { task, loading, error } = useMenteeTaskDetail(open && taskId ? taskId : '', source);
  const [starting, setStarting] = useState(false);
  useEffect(() => { setStarting(false); }, [taskId]);

  const status: string = task?.status ?? '';
  const title = task?.roadmapTask?.title || task?.title || 'Task';
  const description = task?.roadmapTask?.description || task?.description || '';
  const descriptionIsHtml = /<\/?[a-z][\s\S]*>/i.test(description);
  const criteria: string[] = task?.roadmapTask?.acceptanceCriteria || [];
  const deliverable = task?.roadmapTask?.deliverable;

  const submissions: any[] = Array.isArray(task?.submissions) ? task.submissions : [];
  // The API orders submissions version DESC, so the newest is index 0. Indexing
  // [length - 1] here is the bug that once hid every mentor's feedback.
  const latest = submissions[0] ?? null;
  const feedback: any[] = Array.isArray(latest?.feedback) ? latest.feedback : [];

  const needsRevision = status === 'revision_needed';
  const isDone = status === 'completed';

  /**
   * Interviews and quizzes never submit through this drawer.
   *
   * They are timed, attempt-tracked flows that own the whole screen, and the
   * generic start/submit path would create an attempt out from under them. The
   * drawer is still worth opening for the brief — it just hands off rather than
   * offering a Start button that would do the wrong thing.
   */
  const taskType = task?.roadmapTask?.type || task?.type;
  const assessment = taskType === 'interview' ? 'interview' : taskType === 'quiz' ? 'quiz' : null;
  const assessmentHref = assessment === 'interview'
    ? `/mentee/interviews/${task?.id}` : `/mentee/quizzes/${task?.id}`;

  const discussion = participateHref({ type: taskType, discussionGroupId: task?.discussionGroupId });
  const isDiscussion = taskType === 'group_discussion';
  const canStart = status === 'assigned' && !assessment && !discussion;
  const canSubmit = (status === 'in_progress' || needsRevision) && !assessment;

  const start = async () => {
    if (!taskId || !onStart) return;
    setStarting(true);
    try { await onStart(taskId); } finally { setStarting(false); }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={loading ? 'Loading…' : title}
      subtitle={task ? subtitleFor(task) : undefined}
      footer={task ? (
        <div className="flex w-full items-center justify-between gap-3">
          {/* The durable address for this task — for sharing, or for a reload
              that should land somewhere real rather than back on the list. */}
          <Link
            href={`/mentee/tasks/${task.id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-600"
          >
            Open full page <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              Close
            </button>
            {assessment && !['cancelled'].includes(status) && (
              <Link
                href={assessmentHref}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                {isDone || status === 'submitted'
                  ? `View ${assessment}`
                  : status === 'assigned' ? `Start ${assessment}` : `Resume ${assessment}`}
              </Link>
            )}
            {!readOnly && status === 'assigned' && discussion && (
              <Link
                href={discussion}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Participate
              </Link>
            )}
            {!readOnly && canStart && onStart && (
              <button
                type="button"
                onClick={start}
                disabled={starting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {starting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Start task
              </button>
            )}
            {!readOnly && canSubmit && onSubmit && (
              <button
                type="button"
                onClick={() => onSubmit(task)}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                {needsRevision ? 'Submit revision' : 'Submit work'}
              </button>
            )}
          </div>
        </div>
      ) : undefined}
    >
      {loading && (
        <div className="flex justify-center py-16" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-label="Loading task" />
        </div>
      )}
      {!loading && (error || !task) && (
        <p className="py-10 text-center text-sm text-slate-500">
          {error || 'Could not open this task.'}
        </p>
      )}

      {!loading && task && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            {task.pointsAwarded > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                <Award className="h-3.5 w-3.5" aria-hidden /> {task.pointsAwarded} points earned
              </span>
            )}
          </div>

          {task.status === 'cancelled' && task.cancellationReason && (
            <Callout tone="rose" icon={XCircle} title="Task cancelled">
              {task.cancellationReason}
            </Callout>
          )}

          {/* Changes requested leads, because it is the only thing the mentee
              needs in order to act. Everything else is reference. */}
          {needsRevision && feedback[0] && (
            <Callout tone="amber" icon={MessageSquare} title="Changes requested">
              {feedback[0].revisionNotes || feedback[0].feedbackText || 'Your mentor asked for changes.'}
            </Callout>
          )}

          {isDone && feedback[0] && (
            <Callout tone="emerald" icon={CheckCircle2} title="Approved">
              {(isDiscussion ? discussionReviewText(feedback[0].feedbackText) : feedback[0].feedbackText) || 'Your mentor approved this work.'}
              {Number.isFinite(Number(feedback[0].rating)) && Number(feedback[0].rating) > 0 && (
                <span className="mt-1.5 flex items-center gap-1 text-xs">
                  <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
                  {Number(feedback[0].rating)}/5
                </span>
              )}
            </Callout>
          )}

          {/* A group discussion is reviewed on how they took part: their stars,
              the five skills, speaking time and their mentor's notes. */}
          {isDiscussion && task.discussionGroupId && isDone && (
            <Section title="Your participation">
              <MyDiscussionResult groupId={task.discussionGroupId} embedded />
            </Section>
          )}

          {status === 'submitted' && (
            <Callout tone="sky" icon={Clock} title="With your mentor">
              You have submitted this. There is nothing more to do until they reply.
            </Callout>
          )}

          <Section title="What you’ll work on" defaultOpen={!isDone && !needsRevision}>
            {isMissingDescription(description, title) ? (
              <p className="text-sm text-slate-400">No description provided.</p>
            ) : descriptionIsHtml ? (
              <div
                className="prose prose-sm max-w-none text-slate-600 dark:prose-invert dark:text-slate-300"
                dangerouslySetInnerHTML={{ __html: description }}
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{description}</p>
            )}

            {deliverable && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deliverable</p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{deliverable}</p>
              </div>
            )}

            {criteria.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What your mentor checks</p>
                <ul className="mt-2 space-y-1.5">
                  {criteria.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(task.resources) && task.resources.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {task.resources.map((r: any, i: number) => (
                  <li key={r.id || r.url || i}><ResourceLink url={r.url} title={r.title} /></li>
                ))}
              </ul>
            )}
          </Section>

          {latest && (
            <Section
              title={`Your submission${submissions.length > 1 ? ` (v${latest.version})` : ''}`}
              defaultOpen={isDone || status === 'submitted' || needsRevision}
            >
              {latest.submissionText && (
                <div
                  className="prose prose-sm max-w-none rounded-lg border border-slate-100 bg-slate-50 p-3 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: latest.submissionText }}
                />
              )}
              {Array.isArray(latest.submissionUrls) && latest.submissionUrls.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {latest.submissionUrls.map((url: string) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 break-all text-sm text-brand-600 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />{url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {Array.isArray(latest.attachments) && latest.attachments.length > 0 && (
                <div className="mt-3"><SubmissionFileList files={latest.attachments} /></div>
              )}
              {!latest.submissionText && !latest.submissionUrls?.length && !latest.attachments?.length && (
                <p className="text-sm text-slate-400">Nothing was attached to this submission.</p>
              )}
            </Section>
          )}

          {/* Already collapsible on its own, and it carries its own write box.
              The timeline is clan-scoped work history, and a selection round
              keeps none, so it is left out rather than asked for and failed. */}
          {source === 'clan' && !['cancelled'].includes(status) && (
            <TaskProgressTimeline taskId={task.id} mode="mentee" readOnly={readOnly} />
          )}
        </div>
      )}
    </Drawer>
  );
}

/** "Due 29 Aug · 4h estimated · 10 points" — the facts, in the subtitle slot. */
function subtitleFor(task: any): string {
  const bits: string[] = [];
  if (task.dueDate) bits.push(`Due ${new Date(task.dueDate).toLocaleDateString()}`);
  const hours = task.roadmapTask?.estimatedHours;
  if (hours) bits.push(`${hours}h estimated`);
  const points = task.pointsBase ?? task.roadmapTask?.pointsBase;
  if (points) bits.push(`${points} points`);
  return bits.join(' · ');
}

/** A section that remembers nothing — its default is decided by the status. */
function Section({ title, defaultOpen = true, children }: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-slate-200 bg-card dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
      >
        <h3 className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">
          <FileText className="h-4 w-4 text-brand-600" aria-hidden /> {title}
        </h3>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">{children}</div>}
    </div>
  );
}

const TONES = {
  amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
  rose: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
  sky: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
} as const;

function Callout({ tone, icon: Icon, title, children }: {
  tone: keyof typeof TONES;
  icon: typeof MessageSquare;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${TONES[tone]}`}>
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="h-4 w-4 shrink-0" aria-hidden /> {title}
      </p>
      <div className="mt-1 text-sm leading-relaxed opacity-90">{children}</div>
    </div>
  );
}
