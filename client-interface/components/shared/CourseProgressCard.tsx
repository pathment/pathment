'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Loader2, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react';
import { qk } from '@/lib/query';
import { useCourseEnrollment } from '@/lib/hooks/shared';
import { coursesApi, type CourseEnrollment, type CourseLifecycle } from '@/lib/services/courses-api';

/**
 * What each access state means for the learner. PENDING_ACCOUNT is a
 * successful enrollment waiting on the learner to sign up — never an error.
 */
const LIFECYCLE: Record<CourseLifecycle, {
  label: string; cls: string;
  mentee: (e: CourseEnrollment) => string; mentor: (e: CourseEnrollment) => string;
  action: string | null;
}> = {
  PENDING_ACCOUNT: {
    label: 'Waiting for sign-up', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
    mentee: (e) => `You're enrolled. Register on Edorax with ${e.learnerEmail} to start — it has to be this email.`,
    mentor: (e) => `Enrolled. They still need to register on Edorax with ${e.learnerEmail}.`,
    action: 'Register on Edorax',
  },
  PAYMENT_REQUIRED: {
    label: 'Payment required', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
    mentee: () => 'Complete checkout in Edorax to unlock this course.',
    mentor: () => 'Enrolled, but they need to complete checkout in Edorax before they can study.',
    action: 'Complete checkout',
  },
  ACTIVE: {
    label: 'Active', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
    mentee: () => 'Your course is ready. This task completes on its own when you finish it.',
    mentor: () => 'They have access. This task completes on its own when they finish the course.',
    action: 'Continue on Edorax',
  },
  COMPLETED: {
    label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
    mentee: () => 'You finished this course.',
    mentor: () => 'They finished this course.',
    action: 'Review on Edorax',
  },
  CANCELLED: {
    label: 'Unassigned', cls: 'bg-slate-100 text-slate-500',
    mentee: () => 'This course was unassigned.',
    mentor: () => 'This enrollment was cancelled and its seat released.',
    action: null,
  },
  EXPIRED: {
    label: 'Expired', cls: 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400',
    mentee: () => 'Access to this course has expired. Ask your mentor about it.',
    mentor: () => 'Access to this course has expired on Edorax.',
    action: null,
  },
};

const syncedAgo = (iso: string | null) => {
  if (!iso) return 'not synced yet';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'synced just now';
  if (mins < 60) return `synced ${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `synced ${hours}h ago` : `synced ${Math.round(hours / 24)}d ago`;
};

/**
 * The course behind a `course` task: access state, progress read from
 * Buildment, and (for the mentee) the way into Buildment. Progress is read-only
 * here — it is tracked on Buildment and pulled in.
 */
export function CourseProgressCard({
  taskId,
  viewer,
  onTaskStatusChange,
}: {
  taskId: string;
  viewer: 'mentee' | 'mentor';
  /** Fired when a sync moves the task (e.g. to completed) so the host can reload it. */
  onTaskStatusChange?: () => void;
}) {
  const client = useQueryClient();
  const { enrollment, loading, error } = useCourseEnrollment(taskId);
  const [refreshing, setRefreshing] = useState(false);

  // Opening the card can itself complete the task (the read syncs first).
  const seenStatus = useRef<string | null>(null);
  useEffect(() => {
    if (!enrollment?.taskStatus) return;
    if (seenStatus.current && seenStatus.current !== enrollment.taskStatus) onTaskStatusChange?.();
    seenStatus.current = enrollment.taskStatus;
  }, [enrollment?.taskStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res: any = await coursesApi.getForTask(taskId, true); // eslint-disable-line @typescript-eslint/no-explicit-any
      if (res?.data?.enrollment) client.setQueryData(qk.courses.enrollment(taskId), res.data.enrollment);
    } catch { /* keep the current snapshot */ }
    finally { setRefreshing(false); }
  };

  if (loading) {
    return <div className="rounded-xl border border-border p-4 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin text-brand-600" />Loading course…</div>;
  }
  if (!enrollment) {
    return <div className="rounded-xl border border-border p-4 text-sm text-slate-500">{error || 'This course is unavailable.'}</div>;
  }

  const meta = LIFECYCLE[enrollment.lifecycle] || LIFECYCLE.ACTIVE;
  const pct = Math.max(0, Math.min(100, enrollment.overallProgress || 0));
  const closed = enrollment.lifecycle === 'CANCELLED' || enrollment.lifecycle === 'EXPIRED';

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/50 dark:border-brand-500/20 dark:bg-brand-500/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-brand-700 dark:text-brand-400">
            <GraduationCap className="w-4 h-4" /> Edorax course
          </div>
          <p className="text-sm font-medium text-slate-900 mt-1 truncate">{enrollment.courseTitle}</p>
        </div>
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
      </div>

      <p className="text-sm text-slate-600">{viewer === 'mentee' ? meta.mentee(enrollment) : meta.mentor(enrollment)}</p>

      {!closed && (
        <div>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>
              {enrollment.totalLessons
                ? `${enrollment.completedLessons ?? 0} of ${enrollment.totalLessons} lessons`
                : 'Progress'}
            </span>
            <span className="tabular-nums font-medium text-slate-700">{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Course progress">
            <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          {enrollment.currentChapter?.title && (
            <p className="text-xs text-slate-500 mt-1.5">
              Current chapter: <span className="text-slate-700">{enrollment.currentChapter.title}</span>
              {typeof enrollment.currentChapter.progress === 'number' ? ` · ${enrollment.currentChapter.progress}%` : ''}
            </p>
          )}
        </div>
      )}

      {enrollment.syncError && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Couldn&apos;t refresh from Edorax — showing the last known progress.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          {viewer === 'mentee' && meta.action && enrollment.appUrl && (
            <a
              href={enrollment.appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium"
            >
              {meta.action} <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {!closed && (
            <button
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-card text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
          )}
        </div>
        <span className="text-xs text-slate-400">{syncedAgo(enrollment.lastSyncedAt)}</span>
      </div>
    </div>
  );
}
