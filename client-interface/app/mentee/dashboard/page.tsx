'use client';

import Link from 'next/link';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Target,
  Loader2,
  Plus,
  TrendingUp,
  Send
} from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { useMenteeDashboard } from '@/lib/hooks/mentee';
import { ProgressBar, StatusBadge } from '@/components/admin/ui';

export default function MenteeDashboard() {
  const { user } = useAuth();
  const {
    enrollments,
    loading,
    completionLoading,
    currentProgramEnrollments,
    pendingEnrollments,
    approvedEnrollments,
    pendingCompletionEnrollments,
    levelCompletedEnrollments,
    WORKING_STATUSES,
    handleRequestCompletion,
  } = useMenteeDashboard();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-slate-900 mb-2">Welcome back{user?.profile?.firstName ? `, ${user.profile.firstName}` : ''}!</h1>
        <p className="text-slate-600">Keep up the great work on your learning journey</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          {/* Quick Actions if no enrollments */}
          {enrollments.length === 0 && (
            <div className="bg-linear-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-indigo-900 mb-3">Start Your Learning Journey</h2>
              <p className="text-indigo-700 mb-6">
                Browse available programs and request enrollment to get matched with a mentor
              </p>
              <Link
                href="/mentee/programs"
                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
              >
                <Plus className="w-5 h-5" />
                Browse Programs
              </Link>
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
                  <h3 className="text-orange-900 mb-1">Completion Request{pendingCompletionEnrollments.length > 1 ? 's' : ''} Pending</h3>
                  <div className="space-y-2">
                    {pendingCompletionEnrollments.map((e) => (
                      <div key={e.id}>
                        <p className="text-orange-700 text-sm">
                          <strong>{e.program?.name}</strong> — awaiting your mentor&apos;s approval.
                        </p>
                        {e.completionRejectionReason && (
                          <div className="mt-1 p-2 bg-orange-100 rounded-lg text-orange-800 text-xs">
                            <strong>Last rejection reason:</strong> {e.completionRejectionReason}
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
                          {enrollment.currentLevel?.name
                            ? `Level: ${enrollment.currentLevel.name} · Week ${enrollment.currentWeek || 1}`
                            : `Week ${enrollment.currentWeek || 1}`}
                        </p>
                      </div>
                      <StatusBadge status={enrollment.status} noIcon />
                    </div>

                    {/* Progress Bar */}
                    {(() => {
                      const completed = enrollment.tasksCompleted || 0;
                      const total     = enrollment.tasksTotal     || 0;
                      const remaining = Math.max(0, total - completed);
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
                              {completed} task{completed !== 1 ? 's' : ''} done
                            </span>
                            {total > 0 && (
                              <>
                                <span className="flex items-center gap-1.5">
                                  <Target className="w-4 h-4 text-indigo-600" />
                                  {remaining} remaining
                                </span>
                                <span className="text-slate-400 ml-auto">{total} total</span>
                              </>
                            )}
                          </div>
                        </>
                      );
                    })()}

                    <div className="flex items-center gap-2">
                      <Link
                        href="/mentee/tasks"
                        className="flex-1 text-center px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm transition-colors"
                      >
                        View Tasks
                      </Link>
                      {WORKING_STATUSES.includes(enrollment.status) && (
                        <button
                          onClick={() => handleRequestCompletion(enrollment.id)}
                          disabled={completionLoading === enrollment.id}
                          className="flex-1 px-3 py-2 bg-green-50 hover:bg-green-100 border border-green-300 text-green-700 rounded-xl text-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                          title="Ask your mentor to review and close this level"
                        >
                          {completionLoading === enrollment.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Send className="w-4 h-4" />}
                          Request Completion
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Enrollments */}
          {enrollments.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-slate-900">My Enrollments</h2>
                <Link
                  href="/mentee/programs"
                  className="text-indigo-600 hover:text-indigo-700 text-sm flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Browse More Programs
                </Link>
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
    </div>
  );
}
