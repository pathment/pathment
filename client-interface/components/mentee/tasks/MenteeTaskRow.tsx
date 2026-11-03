'use client';

import Link from 'next/link';
import { BookOpen, Calendar, Sparkles, Star, Video, XCircle } from 'lucide-react';
import { StatusBadge } from '@/components/admin/ui';
import { stripHtml } from '@/lib/utils/html';

/**
 * One piece of a learner's work, wherever that work comes from.
 *
 * A clan task and a selection round's qualifying work are the same object to
 * the person doing it: a brief, a deadline, what it is worth, a status, and
 * the one button that moves it along. They are fetched from different places
 * and have to be - pool work is fenced out of every clan query by design - but
 * that is a server concern, and it had leaked into the screens: the round got
 * a thin list of titles while a clan got a real task row, so the same person
 * saw two different products depending on which scope they were in.
 *
 * So the ROW is shared and the SOURCE is not. Each caller maps its own payload
 * to `MenteeTaskView` and passes the handlers that make sense where it lives:
 * no `onStart` means no Start button, no `onViewFeedback` means no link to a
 * feedback page that a round does not have.
 */
export interface MenteeTaskView {
  id: string;
  title: string;
  description?: string | null;
  /** assignment | exercise | project | quiz | interview | course | … */
  type?: string | null;
  difficulty?: string | null;
  dueDate?: string | null;
  estimatedHours?: number | null;
  /** What the work is worth. Never what was earned on it. */
  points?: number | null;
  status: string;
  /** The "Roadmap"/"Custom" chip. Omitted where the distinction means nothing. */
  source?: 'roadmap' | 'custom' | null;
  /** Shown as an "Optional" chip — a round can hand out work that is not required. */
  optional?: boolean;
  cancellationReason?: string | null;
  /** The mentor's verdict, on work that has one. */
  finalRating?: number | null;
  pointsAwarded?: number | null;
  /** The note attached to a "changes requested", shown under the row. */
  revisionNote?: string | null;
  /** A Group Discussion task's group: Participate opens its chat. */
  discussionGroupId?: string | null;
}

/**
 * Where a Group Discussion task is done: its group's chat in Messages. Opening
 * that chat starts the task, so Participate then gives way to Submit Work.
 */
export const participateHref = (task: { type?: string | null; discussionGroupId?: string | null }) =>
  task.type === 'group_discussion' && task.discussionGroupId
    ? `/mentee/messages?discussion=${task.discussionGroupId}`
    : null;

const DIFFICULTY_CHIP: Record<string, string> = {
  easy: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  hard: 'bg-orange-50 text-orange-700 border-orange-200',
  expert: 'bg-red-50 text-red-700 border-red-200',
};

const ACTION = 'px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm transition-colors w-full sm:w-auto wrap-break-word disabled:opacity-50';

const isOverdue = (due?: string | null, status?: string) =>
  Boolean(due) && new Date(due as string) < new Date() && !['completed', 'submitted', 'cancelled'].includes(status || '');

export function MenteeTaskRow({
  task,
  href,
  statusConfig,
  readOnly = false,
  readOnlyTitle,
  onOpen,
  onStart,
  onSubmit,
  onViewFeedback,
  quizHref,
  interviewHref,
  courseHref,
}: {
  task: MenteeTaskView;
  /** The real page for this task — kept an anchor so ⌘-click still works. */
  href: string;
  /** Status wording for this scope (a round says "Approved", a clan "Completed"). */
  statusConfig?: Record<string, { label: string; className: string }>;
  readOnly?: boolean;
  readOnlyTitle?: string;
  onOpen?: (taskId: string) => void;
  onStart?: (taskId: string) => void;
  onSubmit?: (task: MenteeTaskView) => void;
  onViewFeedback?: (taskId: string) => void;
  quizHref?: (taskId: string) => string;
  interviewHref?: (taskId: string) => string;
  courseHref?: (taskId: string) => string;
}) {
  const overdue = isOverdue(task.dueDate, task.status);
  // Interviews and quizzes run in their own flow and are never started or
  // submitted through the generic path; a course is studied elsewhere again.
  const isInterview = task.type === 'interview' && !!interviewHref;
  const isQuiz = task.type === 'quiz' && !!quizHref;
  const isCourse = task.type === 'course' && !!courseHref;
  const blocked = readOnly ? readOnlyTitle : undefined;
  const open = () => onOpen?.(task.id);

  const runner = isCourse ? courseHref!(task.id) : isInterview ? interviewHref!(task.id) : isQuiz ? quizHref!(task.id) : null;
  const discussion = participateHref(task);

  /**
   * A link, unless the scope is read-only.
   *
   * `aria-disabled` on an anchor stops nothing, and a completed programme (or a
   * closed round) has to stop a quiz being opened and answered. So read-only
   * renders the real disabled control and gives up the ⌘-click.
   */
  const runnerButton = (label: string, to = runner) =>
    readOnly ? (
      <button disabled title={blocked} className={ACTION}>{label}</button>
    ) : (
      <Link href={to as string} className={`${ACTION} inline-block text-center`}>{label}</Link>
    );

  return (
    <div className="mentee-task-row p-5 sm:p-6 transition-colors w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="text-slate-900 wrap-break-word min-w-0 flex-1">
              {/* Still an anchor, so ⌘-click and "open in new tab" reach the
                  real page; a plain click opens the drawer instead. */}
              <Link
                href={href}
                onClick={(e) => {
                  if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  open();
                }}
                className="hover:text-brand-600 hover:underline underline-offset-4"
              >
                {task.title}
              </Link>
            </h3>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {task.source === 'custom' && (
                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Custom
                </span>
              )}
              {task.source === 'roadmap' && (
                <span className="px-2 py-1 bg-brand-100 text-brand-700 rounded text-xs font-medium flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> Roadmap
                </span>
              )}
              {/* A talk is watched rather than built, so it is worth saying on
                  the row itself - and saying it here rather than in the page
                  means the pool work screen gets it too. */}
              {task.type === 'talk' && (
                <span className="px-2 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 rounded text-xs font-medium flex items-center gap-1">
                  <Video className="w-3 h-3" /> Talk
                </span>
              )}
              {task.optional && (
                <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium">Optional</span>
              )}
              {task.difficulty && (
                <span className={`px-2 py-1 border rounded text-xs font-medium capitalize ${DIFFICULTY_CHIP[task.difficulty] || DIFFICULTY_CHIP.medium}`}>
                  {task.difficulty}
                </span>
              )}
            </div>
          </div>

          {task.status === 'cancelled' && task.cancellationReason && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-red-900 font-medium text-sm wrap-break-word">Task Cancelled</p>
                  <p className="text-red-700 text-sm mt-1 wrap-break-word">{task.cancellationReason}</p>
                </div>
              </div>
            </div>
          )}

          {task.description && (
            <p className="text-slate-600 text-sm line-clamp-2 mb-3 wrap-break-word">{stripHtml(task.description)}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            {task.dueDate && (
              <>
                <span className={`flex items-center gap-1 shrink-0 ${overdue ? 'text-red-600' : ''}`}>
                  <Calendar className="w-4 h-4 shrink-0" />
                  Due {new Date(task.dueDate).toLocaleDateString()}
                  {overdue && ' (Overdue)'}
                </span>
                <span className="hidden sm:inline">•</span>
              </>
            )}
            {task.estimatedHours != null && (
              <span className="shrink-0">{task.estimatedHours}h estimated</span>
            )}
            {task.points != null && (
              <>
                {task.estimatedHours != null && <span className="hidden sm:inline">•</span>}
                <span className="shrink-0">{task.points} points</span>
              </>
            )}
          </div>

          {task.finalRating != null && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 shrink-0">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 shrink-0 ${star <= (task.finalRating as number) ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300'}`}
                  />
                ))}
              </div>
              {task.pointsAwarded != null && (
                <span className="text-slate-600 text-sm shrink-0">{task.pointsAwarded} points earned</span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-start sm:items-end gap-2 shrink-0 max-w-full">
          <div className="max-w-full overflow-hidden">
            <StatusBadge status={task.status} config={statusConfig} />
          </div>

          {task.status === 'assigned' && (
            discussion ? runnerButton('Participate', discussion) : runner ? (
              // A course is studied elsewhere and is never locked by the scope.
              isCourse
                ? <Link href={runner} className={`${ACTION} inline-block text-center`}>View course</Link>
                : runnerButton(isInterview ? 'Start interview' : 'Start quiz')
            ) : onStart ? (
              <button onClick={() => onStart(task.id)} disabled={readOnly} title={blocked} className={ACTION}>
                Start Task
              </button>
            ) : null
          )}

          {(task.status === 'in_progress' || task.status === 'revision_needed') && (
            runner ? (
              isCourse
                ? <Link href={runner} className={`${ACTION} inline-block text-center`}>Continue course</Link>
                : runnerButton(
                  isInterview ? (task.status === 'revision_needed' ? 'Redo questions' : 'Resume interview') : 'Resume quiz',
                )
            ) : onSubmit ? (
              <button onClick={() => onSubmit(task)} disabled={readOnly} title={blocked} className={ACTION}>
                Submit Work
              </button>
            ) : null
          )}

          {isQuiz && (task.status === 'submitted' || task.status === 'completed') && (
            <Link href={quizHref!(task.id)} className={`${ACTION} inline-block text-center`}>View quiz</Link>
          )}

          {task.status === 'submitted' && !isQuiz && (
            <span className="text-slate-600 text-sm shrink-0">Awaiting review</span>
          )}

          {task.status === 'cancelled' && (
            <span className="text-red-600 text-sm shrink-0">No action needed</span>
          )}

          {task.status === 'completed' && onViewFeedback && (
            <button onClick={() => onViewFeedback(task.id)} className="text-brand-600 hover:underline text-sm shrink-0">
              View Feedback
            </button>
          )}

          {onOpen && (
            <button onClick={open} className="text-slate-600 hover:text-brand-600 text-sm transition-colors cursor-pointer shrink-0">
              View Details
            </button>
          )}
        </div>
      </div>

      {task.status === 'revision_needed' && task.revisionNote && (
        <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <p className="text-orange-900 text-sm font-medium mb-1">Revision Requested</p>
          <p className="text-orange-700 text-sm">{task.revisionNote}</p>
        </div>
      )}
    </div>
  );
}
