'use client';

import Link from 'next/link';
import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  ListTodo,
  Loader2,
  TrendingUp,
  MessageSquareHeart,
  ArrowRight,
  Flag,
} from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { useMenteeDashboard, useMyActivity, useMenteeTasks } from '@/lib/hooks/mentee';
import { ProgressBar, StatusBadge } from '@/components/admin/ui';
import { MentorFeedbackDrawer } from '@/components/mentee/MentorFeedbackDrawer';
import { ActivityCard } from '@/components/shared/ActivityCard';
import { RecurringRitualsCard } from '@/components/mentee/RecurringRitualsCard';
import { AnnouncementsCard } from '@/components/shared/AnnouncementsCard';

function MenteeDashboardInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const {
    enrollments,
    loading,
    currentProgramEnrollments,
    pendingEnrollments,
    approvedEnrollments,
    pendingCompletionEnrollments,
    levelCompletedEnrollments,
    completedEnrollments,
    feedbackTarget,
    openFeedback,
    closeFeedback,
    reviewedEnrollmentIds,
    markReviewed,
  } = useMenteeDashboard();

  // Deep link from the "Leave feedback" notification: ?review=<enrollmentId>
  useEffect(() => {
    const reviewId = searchParams.get('review');
    if (!reviewId || loading) return;
    const target = enrollments.find((e) => e.id === reviewId);
    if (target && target.status === 'program_completed') {
      openFeedback(reviewId, target.program?.name || 'your program');
    }
  }, [searchParams, enrollments, loading, openFeedback]);

  const {
    summary: actSummary,
    dailySessions: actSessions,
    recentEvents: actEvents,
    loading: actLoading,
    days: actDays,
    setDays: setActDays,
    refetch: refetchActivity,
  } = useMyActivity();

  const { tasks: allTasks } = useMenteeTasks();

  // This Week: surface the single most important next action.
  const now = Date.now();
  const taskTitle = (t: any) => t?.roadmapTask?.title || t?.title || 'Task';
  const isLate = (t: any) =>
    t.dueDate && new Date(t.dueDate).getTime() < now && !['completed', 'cancelled'].includes(t.status);
  const activeTasks = (allTasks || []).filter((t: any) => !['completed', 'cancelled'].includes(t.status));
  const heroTask =
    activeTasks.find(isLate) ||
    activeTasks.find((t: any) => t.status === 'in_progress') ||
    activeTasks.find((t: any) => t.status === 'revision_needed') ||
    activeTasks[0] ||
    null;
  const weekTasks = [...activeTasks]
    .sort((a: any, b: any) => {
      if (isLate(a) !== isLate(b)) return isLate(a) ? -1 : 1;
      return new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime();
    })
    .slice(0, 8);
  const firstName = user?.profile?.firstName || user?.firstName || '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-slate-900 mb-2">This week{firstName ? `, ${firstName}` : ''}</h1>
        <p className="text-slate-600">Here&apos;s the one thing worth doing next.</p>
      </div>

      {/* Hero: the single most important next action */}
      {heroTask && (
        <Link
          href={`/mentee/tasks/${heroTask.id}`}
          className="block rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 p-6 hover:border-indigo-400 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-indigo-600 uppercase tracking-wide">Next up</span>
            {isLate(heroTask) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">
                <Clock className="w-3 h-3" />overdue
              </span>
            )}
          </div>
          <h2 className="text-xl font-semibold text-slate-900">{taskTitle(heroTask)}</h2>
          <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
            {heroTask.roadmapTask?.type && <span className="capitalize">{heroTask.roadmapTask.type}</span>}
            {heroTask.dueDate && (<><span className="text-slate-300">·</span><span>Due {new Date(heroTask.dueDate).toLocaleDateString()}</span></>)}
          </div>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700">
            Open task <ArrowRight className="w-4 h-4" />
          </span>
        </Link>
      )}

      {/* Recurring rituals (from your schedule) */}
      <RecurringRitualsCard />

      {/* Latest announcements */}
      <AnnouncementsCard href="/mentee/announcements" />

      {/* This week's tasks */}
      {weekTasks.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200">
          <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-slate-900">This week</h2>
            <Link href="/mentee/tasks" className="text-indigo-600 hover:text-indigo-700 text-sm flex items-center gap-1">
              All tasks <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {weekTasks.map((t: any) => (
              <Link key={t.id} href={`/mentee/tasks/${t.id}`}
                className="flex items-center gap-3 px-6 py-3.5 hover:bg-slate-50 transition-colors">
                {t.status === 'revision_needed'
                  ? <Flag className="w-4 h-4 text-orange-500 shrink-0" />
                  : <Clock className={`w-4 h-4 shrink-0 ${isLate(t) ? 'text-red-500' : 'text-slate-300'}`} />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{taskTitle(t)}</p>
                  {t.roadmapTask?.type && <p className="text-xs text-slate-500 capitalize">{t.roadmapTask.type}</p>}
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : ''}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Activity self-view */}
      <ActivityCard
        summary={actSummary}
        dailySessions={actSessions}
        recentEvents={actEvents}
        loading={actLoading}
        days={actDays}
        onDaysChange={setActDays}
        onRefresh={refetchActivity}
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          {/* No enrollment yet — placement is admin/invite-driven now */}
          {enrollments.length === 0 && (
            <div className="bg-linear-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-indigo-900 mb-3">You're all set up</h2>
              <p className="text-indigo-700">
                You haven't been placed in a program yet. Your program team will enroll you and
                connect you with a mentor — this page will fill in as soon as that happens.
              </p>
            </div>
          )}

          {/* Pending Completion — Awaiting Mentor Approval */}
          {pendingCompletionEnrollments.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-orange-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-orange-900 mb-1">Ready to complete 🎯</h3>
                  <div className="space-y-2">
                    {pendingCompletionEnrollments.map((e) => (
                      <div key={e.id}>
                        <p className="text-orange-700 text-sm">
                          You&apos;ve finished everything in <strong>{e.program?.name}</strong> — your mentor
                          will review and confirm completion. Nothing more to do here.
                        </p>
                        {e.completionRejectionReason && (
                          <div className="mt-1 p-2 bg-orange-100 rounded-lg text-orange-800 text-xs">
                            <strong>Mentor note:</strong> {e.completionRejectionReason}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Level Completed — Auto-promoted to pending_match */}
          {levelCompletedEnrollments.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-green-900 mb-1">Level{levelCompletedEnrollments.length > 1 ? 's' : ''} Completed! 🎉</h3>
                  <div className="space-y-1">
                    {levelCompletedEnrollments.map((e) => (
                      <p key={e.id} className="text-green-700 text-sm">
                        <strong>{e.program?.name}</strong> — the admin is assigning your next mentor.
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pending Approvals Alert */}
          {pendingEnrollments.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-amber-900 mb-2">Pending Approval</h3>
                  <p className="text-amber-700 text-sm mb-3">
                    {pendingEnrollments.length} enrollment request(s) awaiting admin approval
                  </p>
                  <div className="space-y-2">
                    {pendingEnrollments.map((enrollment) => (
                      <div key={enrollment.id} className="text-amber-900 text-sm">
                        • {enrollment.program?.name || 'Unknown Program'}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Approved but not matched Alert */}
          {approvedEnrollments.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-blue-900 mb-2">Approved - Awaiting Mentor Match</h3>
                  <p className="text-blue-700 text-sm mb-3">
                    Your enrollment has been approved! Admin is matching you with a mentor.
                  </p>
                  <div className="space-y-2">
                    {approvedEnrollments.map((enrollment) => (
                      <div key={enrollment.id} className="text-blue-900 text-sm">
                        • {enrollment.program?.name || 'Unknown Program'}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active Programs — one card per in-progress enrollment */}
          {currentProgramEnrollments.length > 0 && (
            <div>
              <h2 className="text-slate-900 mb-4">
                Active Program{currentProgramEnrollments.length > 1 ? 's' : ''}
              </h2>
              <div className="grid gap-6 lg:grid-cols-2">
                {currentProgramEnrollments.map((enrollment) => (
                  <div key={enrollment.id} className="bg-white rounded-2xl border border-slate-200 p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0 mr-3">
                        <h3 className="text-slate-900 truncate mb-1">{enrollment.program?.name || 'Unknown Program'}</h3>
                        <p className="text-slate-600 text-sm">
                          Week {enrollment.currentWeek || 1}
                        </p>
                      </div>
                      <StatusBadge status={enrollment.status} noIcon />
                    </div>

                    {/* Progress Bar */}
                    {(() => {
                      const completed = enrollment.tasksCompleted || 0;
                      const total     = enrollment.tasksTotal     || 0;
                      // prefer server-supplied percentage; fall back to task ratio
                      const rawPct    = parseFloat(enrollment.overallProgressPercentage);
                      const pct       = rawPct > 0 ? rawPct : (total > 0 ? Math.round((completed / total) * 100) : 0);

                      return (
                        <>
                          <div className="mb-4">
                            <ProgressBar value={pct} size="md" />
                          </div>

                          <div className="flex items-center gap-4 text-sm text-slate-600 mb-4">
                            <span className="flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                              {completed} completed
                            </span>
                            {total > 0 && (
                              <>
                                <span className="flex items-center gap-1.5">
                                  <ListTodo className="w-4 h-4 text-indigo-600" />
                                  {total} program tasks
                                </span>
                              </>
                            )}
                          </div>
                        </>
                      );
                    })()}

                    <Link
                      href="/mentee/tasks"
                      className="block w-full text-center px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm transition-colors"
                    >
                      View Tasks
                    </Link>
                    <p className="mt-3 text-xs text-slate-500 text-center">
                      Finish every task and your mentor will confirm completion — no request needed.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed Programs — Rate Your Mentor prompt */}
          {completedEnrollments.length > 0 && (
            <div>
              <h2 className="text-slate-900 mb-4">Completed Programs 🎓</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {completedEnrollments.map((e) => {
                  const reviewed = reviewedEnrollmentIds.has(e.id);
                  return (
                    <div
                      key={e.id}
                      className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                          <h3 className="text-slate-900 truncate">{e.program?.name || 'Unknown Program'}</h3>
                        </div>
                        <p className="text-slate-500 text-sm">
                          Completed · {parseFloat(e.overallProgressPercentage || 0).toFixed(0)}% progress
                        </p>
                      </div>

                      {reviewed ? (
                        <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                          Feedback sent
                        </div>
                      ) : (
                        <button
                          onClick={() => openFeedback(e.id, e.program?.name || 'this program')}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl text-sm transition-colors"
                        >
                          <MessageSquareHeart className="w-4 h-4" />
                          Leave feedback
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* All Enrollments */}
          {enrollments.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-slate-900">My Enrollments</h2>
              </div>
              <div className="space-y-3">
                {enrollments.map((enrollment) => (
                  <div key={enrollment.id} className="p-4 border border-slate-200 rounded-xl">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-slate-900">{enrollment.program?.name || 'Unknown Program'}</h3>
                          <span className={`px-2 py-1 rounded text-xs ${
                            enrollment.status === 'pending_approval'   ? 'bg-amber-100 text-amber-700' :
                            enrollment.status === 'approved'           ? 'bg-blue-100 text-blue-700' :
                            enrollment.status === 'pending_match'      ? 'bg-purple-100 text-purple-700' :
                            enrollment.status === 'matched'            ? 'bg-green-100 text-green-700' :
                            enrollment.status === 'active'             ? 'bg-indigo-100 text-indigo-700' :
                            enrollment.status === 'pending_completion' ? 'bg-orange-100 text-orange-700' :
                            enrollment.status === 'level_completed'    ? 'bg-teal-100 text-teal-700' :
                            enrollment.status === 'program_completed'  ? 'bg-green-100 text-green-700' :
                            enrollment.status === 'rejected'           ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {enrollment.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="text-slate-600 text-sm">
                          Enrolled {new Date(enrollment.enrolledAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Anonymous mentor feedback drawer */}
      <MentorFeedbackDrawer
        open={Boolean(feedbackTarget)}
        enrollmentId={feedbackTarget?.enrollmentId ?? null}
        programName={feedbackTarget?.programName ?? ''}
        onClose={closeFeedback}
        onSubmitted={markReviewed}
      />
    </div>
  );
}

export default function MenteeDashboard() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>}>
      <MenteeDashboardInner />
    </Suspense>
  );
}
