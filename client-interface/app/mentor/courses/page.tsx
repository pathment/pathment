'use client';

import Link from 'next/link';
import { GraduationCap, Loader2, RefreshCw, Users, CalendarClock } from 'lucide-react';
import { useCourses, useCoursesStatus } from '@/lib/hooks/shared';
import { formatCoursePrice } from '@/lib/services/courses-api';
import { workspacePath } from '@/lib/services/workspace-scope';

/**
 * Mentor › Courses — the Buildment courses this workspace may assign. Shown
 * only while the workspace's Buildment connection is live; courses are assigned
 * to a mentee as a `course` task from the Assign task drawer.
 */
export default function MentorCoursesPage() {
  const { connected, status, loading: statusLoading } = useCoursesStatus();
  const { courses, loading, fetching, error, refetch } = useCourses(connected);

  if (statusLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>;
  }

  if (!connected) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <GraduationCap className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-900 font-medium">Courses aren&apos;t connected</p>
          <p className="text-sm text-slate-500 mt-1">A workspace admin can connect Edorax in Settings → Apps.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-brand-600" /> Courses
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Edorax courses available to {status.organizationName || 'your workspace'}. Assign one to a mentee as a
            task — they&apos;re enrolled right away and their progress shows up on the task.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={fetching}
          className="shrink-0 inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <p className="text-slate-900 font-medium">Couldn&apos;t load courses</p>
          <p className="text-sm text-slate-500 mt-1">{error}</p>
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <GraduationCap className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-900 font-medium">No courses yet</p>
          <p className="text-sm text-slate-500 mt-1">Edorax hasn&apos;t allocated any courses to this workspace.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {courses.map((c) => {
              const full = c.availableSeats !== null && c.availableSeats <= 0;
              return (
                <div key={c.courseId} className="rounded-2xl border border-slate-200 bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-medium text-slate-900 min-w-0 truncate">{c.title}</h3>
                    <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${c.pricingType === 'PAID' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {formatCoursePrice(c)}
                    </span>
                  </div>
                  {c.description && <p className="text-sm text-slate-500 mt-1 line-clamp-3">{c.description}</p>}
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-slate-500">
                    {c.availableSeats !== null && (
                      <span className={`inline-flex items-center gap-1 ${full ? 'text-red-600' : ''}`}>
                        <Users className="w-3.5 h-3.5" />
                        {full ? 'No seats left' : `${c.availableSeats} seat${c.availableSeats === 1 ? '' : 's'} left`}
                      </span>
                    )}
                    {c.expiresAt && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="w-3.5 h-3.5" />
                        Until {new Date(c.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-sm text-slate-500 mt-5">
            To assign a course, open{' '}
            <Link href={workspacePath('/mentor/mentees')} className="text-brand-600 hover:text-brand-700 font-medium">My mentees</Link>
            , choose <span className="font-medium text-slate-700">Assign task</span> and pick the <span className="font-medium text-slate-700">Course</span> type.
          </p>
        </>
      )}
    </div>
  );
}
