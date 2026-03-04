'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  BookOpen, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Mail, 
  MessageSquare,
  Plus,
  Target,
  TrendingUp,
  User,
  Loader2,
  Star,
  Award,
  ThumbsUp,
  ThumbsDown,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useMenteeDetailPage } from '@/lib/hooks/mentor';

export default function MenteeDetail() {
  const params = useParams();
  const router = useRouter();
  const menteeId = params.id as string;

  const {
    match,
    tasks,
    loading,
    completionLoading,
    rejectReason,
    showRejectModal,
    showCompleteConfirm,
    setRejectReason,
    setShowRejectModal,
    setShowCompleteConfirm,
    handleApproveCompletion,
    handleRejectCompletion,
  } = useMenteeDetailPage(menteeId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="text-center py-12">
        <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-600">Mentee not found</p>
        <Link href="/mentor/mentees" className="text-indigo-600 hover:text-indigo-700 text-sm mt-2 inline-block">
          Back to Mentees
        </Link>
      </div>
    );
  }

  const mentee = match.mentee;
  const enrollment = match.enrollment;
  const profile = mentee?.menteeProfile;
  const progress = parseFloat(enrollment?.overallProgressPercentage) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/mentor/mentees"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Mentees
        </Link>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-20 h-20 bg-indigo-200 rounded-full flex items-center justify-center">
              <span className="text-indigo-700 text-2xl">
                {mentee?.firstName?.[0]}{mentee?.lastName?.[0]}
              </span>
            </div>
            <div>
              <h1 className="text-slate-900 mb-1">
                {mentee?.firstName} {mentee?.lastName}
              </h1>
              <div className="flex items-center gap-2 text-slate-600 mb-2">
                <Mail className="w-4 h-4" />
                {mentee?.email}
              </div>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm">
                Active Mentee
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => toast.info('Messaging feature coming soon!')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center gap-2"
            >
              <MessageSquare className="w-5 h-5" />
              Send Message
            </button>
            <button
              onClick={() => router.push(`/mentor/tasks?tab=create&menteeId=${menteeId}&programId=${enrollment?.programId || ''}`)}
              className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Assign Task
            </button>
            {/* Mentor directly approves completion — no self-request loop */}
            {(enrollment?.status === 'active' || enrollment?.status === 'matched') && (
              <button
                onClick={() => setShowCompleteConfirm(true)}
                disabled={completionLoading}
                className="px-4 py-2 bg-green-50 hover:bg-green-100 border border-green-300 text-green-700 rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                Complete Level
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Completion Request Banner ────────────────────────────────── */}
      {enrollment?.status === 'pending_completion' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-start gap-3 flex-1">
            <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-900 font-medium text-sm">
                {mentee?.firstName} {mentee?.lastName} has requested level completion
              </p>
              <p className="text-amber-700 text-xs mt-1">
                Requested on {enrollment.completionRequestedAt
                  ? new Date(enrollment.completionRequestedAt).toLocaleDateString()
                  : 'recently'}
                {enrollment.completionRequestedByRole === 'mentor' ? ' (by mentor)' : ' (by mentee)'}
              </p>
            </div>
          </div>
          <div className="flex gap-3 shrink-0">
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={completionLoading}
              className="px-4 py-2 bg-white border border-red-300 text-red-700 hover:bg-red-50 rounded-xl text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <ThumbsDown className="w-4 h-4" />
              Reject
            </button>
            <button
              onClick={handleApproveCompletion}
              disabled={completionLoading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {completionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
              Approve Completion
            </button>
          </div>
        </div>
      )}

      {/* ─── Complete Level Confirmation Modal ────────────────────────── */}
      {showCompleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-slate-900 text-lg font-semibold mb-2">Complete This Level?</h3>
            {progress < 100 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-amber-800 text-sm">
                  This mentee has only completed <strong>{progress}%</strong> of tasks ({enrollment?.tasksCompleted}/{enrollment?.tasksTotal}).
                  Are you sure they&apos;re ready to advance?
                </p>
              </div>
            )}
            <p className="text-slate-600 text-sm mb-5">
              This will mark <strong>{mentee?.firstName}&apos;s</strong> current level as complete.
              {enrollment?.program?.levels?.length > 1
                ? ' They will move to the next level once promoted by admin.'
                : ' This completes their entire program.'}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCompleteConfirm(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowCompleteConfirm(false);
                  await handleApproveCompletion();
                }}
                disabled={completionLoading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {completionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Yes, Complete Level
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Reject Completion Modal ─────────────────────────────────── */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-slate-900 text-lg font-semibold mb-2">Reject Completion Request</h3>
            <p className="text-slate-600 text-sm mb-4">
              Provide a reason so the mentee knows what still needs to be done.
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Final project submission is still outstanding..."
              rows={4}
              className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectCompletion}
                disabled={completionLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {completionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
            </div>
          </div>
          <div className="text-slate-600 text-sm mb-1">Progress</div>
          <div className="text-slate-900 text-2xl">{progress}%</div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <div className="text-slate-600 text-sm mb-1">Current Week</div>
          <div className="text-slate-900 text-2xl">{enrollment?.currentWeek || 1}</div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <div className="text-slate-600 text-sm mb-1">Tasks Done</div>
          <div className="text-slate-900 text-2xl">{enrollment?.tasksCompleted ?? 0}</div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
              <Star className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
          <div className="text-slate-600 text-sm mb-1">Avg Rating</div>
          <div className="text-slate-900 text-2xl">
            {enrollment?.avgTaskRating && parseFloat(enrollment.avgTaskRating) > 0
              ? parseFloat(enrollment.avgTaskRating).toFixed(1)
              : '-'}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Program Info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-slate-900 mb-4">Current Program</h2>
            <div className="space-y-4">
              <div>
                <div className="text-sm text-slate-600 mb-1">Program</div>
                <div className="text-slate-900">{enrollment?.program?.name || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600 mb-1">Level</div>
                <div className="text-slate-900">{match?.level?.name || enrollment?.currentLevel?.name || 'Level 1'}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600 mb-1">Enrolled Date</div>
                <div className="text-slate-900">
                  {enrollment?.enrolledAt ? new Date(enrollment.enrolledAt).toLocaleDateString() : '-'}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600 mb-2">Overall Progress</div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-slate-900">{progress}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tasks */}
          <div className="bg-white rounded-2xl border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-slate-900">Tasks</h2>
                {tasks.length > 0 && (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
                    {tasks.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => router.push(`/mentor/tasks?tab=create&menteeId=${menteeId}&programId=${enrollment?.programId || ''}`)}
                className="text-indigo-600 hover:text-indigo-700 text-sm flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Assign Task
              </button>
            </div>
            <div className="p-6">
              {tasks.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600 text-sm">No tasks yet</p>
                  <p className="text-slate-500 text-xs mt-1">Tasks will appear here when assigned</p>
                </div>
              ) : (
                <div className="max-h-[480px] overflow-y-auto pr-1 space-y-3">
                  {tasks.map((task: any) => (
                    <div
                      key={task.id}
                      className="flex items-start justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-200 transition-colors cursor-pointer"
                      onClick={() => router.push(`/mentor/tasks/${task.id}`)}
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-slate-900 text-sm font-medium truncate">
                          {task.roadmapTask?.title || task.title}
                        </p>
                        <p className="text-slate-500 text-xs mt-1">
                          {task.enrollment?.program?.name || 'Custom Task'}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs shrink-0 ${
                        task.status === 'completed' ? 'bg-green-100 text-green-700' :
                        task.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                        task.status === 'pending_review' ? 'bg-yellow-100 text-yellow-700' :
                        task.status === 'revision_needed' ? 'bg-orange-100 text-orange-700' :
                        task.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {task.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Activity Timeline */}
          <div className="bg-white rounded-2xl border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-200">
              <h2 className="text-slate-900">Activity Timeline</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-900 text-sm">Matched with mentor</p>
                    <p className="text-slate-500 text-xs mt-1">
                      {match.matchedAt ? new Date(match.matchedAt).toLocaleDateString() : 'Recently'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-900 text-sm">Enrollment approved</p>
                    <p className="text-slate-500 text-xs mt-1">
                      {enrollment?.enrolledAt ? new Date(enrollment.enrolledAt).toLocaleDateString() : '-'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Learning Profile */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-slate-900 mb-4">Learning Profile</h3>
            
            {profile?.learningGoals && profile.learningGoals.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 text-slate-600 text-sm mb-2">
                  <Target className="w-4 h-4" />
                  Learning Goals
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile.learningGoals.map((goal: string, idx: number) => (
                    <span key={idx} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs">
                      {goal}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {profile?.interests && profile.interests.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 text-slate-600 text-sm mb-2">
                  <Star className="w-4 h-4" />
                  Interests
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile.interests.map((interest: string, idx: number) => (
                    <span key={idx} className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {profile?.priorExperience && (
              <div>
                <div className="flex items-center gap-2 text-slate-600 text-sm mb-2">
                  <BookOpen className="w-4 h-4" />
                  Background
                </div>
                <p className="text-slate-700 text-sm">{profile.priorExperience}</p>
              </div>
            )}

            {!profile?.learningGoals && !profile?.interests && !profile?.priorExperience && (
              <p className="text-slate-500 text-sm">No profile information available</p>
            )}
          </div>

          {/* Performance */}
          <div className="bg-linear-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-6">
            <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center mb-4">
              <Award className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-green-900 mb-2">
              {progress >= 75 ? 'Excellent Progress!' :
               progress >= 50 ? 'Good Progress' :
               progress >= 25 ? 'Making Progress' : 'Just Getting Started'}
            </h3>
            <p className="text-green-700 text-sm">
              {progress >= 75 ? 'This mentee is performing exceptionally well!' :
               progress >= 50 ? 'On track with the program objectives' :
               progress >= 25 ? 'Building momentum in the learning journey' :
               'Beginning their learning journey'}
            </p>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-slate-900 mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <button
                onClick={() => toast.info('Messaging feature coming soon!')}
                className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors text-left"
              >
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-indigo-600" />
                </div>
                <span className="text-slate-700">Send Message</span>
              </button>
              <button
                onClick={() => router.push(`/mentor/tasks?tab=create&menteeId=${menteeId}&programId=${enrollment?.programId || ''}`)}
                className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors text-left"
              >
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Plus className="w-5 h-5 text-purple-600" />
                </div>
                <span className="text-slate-700">Assign Task</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
