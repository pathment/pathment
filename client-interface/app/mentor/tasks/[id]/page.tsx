'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Calendar,
  Clock,
  Star,
  FileText,
  Link as LinkIcon,
  BookOpen,
  Sparkles,
  XCircle,
  AlertCircle,
  User,
  Award,
  MessageSquare,
  ExternalLink,
  Loader2,
  Send,
  AlertTriangle,
} from 'lucide-react';
import { useMentorTaskDetail } from '@/lib/hooks/mentor';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function MentorTaskDetailsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const {
    task,
    loading,
    error,
    cancellingTask,
    cancelReason,
    isCancelling,
    extensionDecision,
    newDueDate,
    isHandlingExtension,
    setCancellingTask,
    setCancelReason,
    setExtensionDecision,
    setNewDueDate,
    handleExtension,
    handleCancelTask,
  } = useMentorTaskDetail(resolvedParams.id);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
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
  const taskDeliverable = task.roadmapTask?.deliverable || task.deliverable;
  const acceptanceCriteria = task.roadmapTask?.acceptanceCriteria || task.acceptanceCriteria || [];
  const resources = task.roadmapTask?.resources || [];
  const latestSubmission = task.submissions?.[task.submissions.length - 1] || null;
  const feedback = latestSubmission?.feedback || [];

  const statusConfig: Record<string, { bg: string; text: string; label: string; icon: React.ElementType }> = {
    assigned: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Assigned', icon: AlertCircle },
    in_progress: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'In Progress', icon: Clock },
    submitted: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Submitted', icon: FileText },
    revision_needed: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Needs Revision', icon: AlertCircle },
    completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Completed', icon: CheckCircle2 },
    cancelled: { bg: 'bg-red-100', text: 'text-red-700', label: 'Cancelled', icon: XCircle },
  };

  const statusInfo = statusConfig[task.status] || statusConfig.assigned;
  const StatusIcon = statusInfo.icon;

  const submissionStatusConfig: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending Review' },
    approved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
    rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
    revision_requested: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Revision Requested' },
  };

  const canReview = ['submitted', 'revision_needed'].includes(task.status);
  const canCancel = !['completed', 'cancelled'].includes(task.status);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back button */}
      <button
        onClick={() => router.push('/mentor/tasks')}
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Tasks
      </button>

      {/* Task Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h1 className="text-2xl text-slate-900">{taskTitle}</h1>
              {task.isCustomTask ? (
                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Custom
                </span>
              ) : (
                <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> Roadmap
                </span>
              )}
            </div>
            <p className="text-slate-600">{taskDescription}</p>
          </div>
          <span className={`px-3 py-1.5 ${statusInfo.bg} ${statusInfo.text} rounded-lg text-sm flex items-center gap-1.5 font-medium whitespace-nowrap`}>
            <StatusIcon className="w-4 h-4" />
            {statusInfo.label}
          </span>
        </div>

        {/* Mentee info */}
        {task.mentee && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <User className="w-5 h-5 text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-900">
                {task.mentee.firstName} {task.mentee.lastName}
              </p>
              <p className="text-xs text-slate-500">
                {task.enrollment?.program?.name}
                {task.enrollment?.currentLevel?.name && ` · ${task.enrollment.currentLevel.name}`}
              </p>
            </div>
          </div>
        )}

        {/* Meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
          {task.dueDate && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Due Date</p>
              <p className="text-sm text-slate-900 flex items-center gap-1">
                <Calendar className="w-4 h-4 text-slate-400" />
                {new Date(task.dueDate).toLocaleDateString()}
              </p>
            </div>
          )}
          {task.assignedAt && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Assigned</p>
              <p className="text-sm text-slate-900 flex items-center gap-1">
                <Calendar className="w-4 h-4 text-slate-400" />
                {new Date(task.assignedAt).toLocaleDateString()}
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
        </div>

        {/* Rating & Points */}
        {task.status === 'completed' && (task.finalRating || task.pointsAwarded != null) && (
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
                <Award className="w-5 h-5 text-indigo-500" />
                <span className="text-sm font-semibold text-indigo-700">{task.pointsAwarded} points awarded</span>
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
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
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
              {resources.map((resource: any) => (
                <li key={resource.id}>
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-2"
                  >
                    <LinkIcon className="w-4 h-4" />
                    {resource.title}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Submission */}
      {task.submissions && task.submissions.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            Mentee Submission
            {task.submissions.length > 1 && (
              <span className="text-xs text-slate-500 font-normal ml-1">(v{latestSubmission?.version})</span>
            )}
          </h2>

          {latestSubmission && (
            <div className="space-y-4">
              {latestSubmission.status && submissionStatusConfig[latestSubmission.status] && (
                <span className={`inline-flex items-center px-3 py-1 text-sm rounded-lg font-medium ${submissionStatusConfig[latestSubmission.status].bg} ${submissionStatusConfig[latestSubmission.status].text}`}>
                  {submissionStatusConfig[latestSubmission.status].label}
                </span>
              )}

              {latestSubmission.submissionText && (
                <div>
                  <p className="text-xs text-slate-500 mb-2">Submission Description</p>
                  <div
                    className="prose prose-sm max-w-none text-slate-700 bg-slate-50 rounded-lg p-4 border border-slate-100"
                    dangerouslySetInnerHTML={{ __html: latestSubmission.submissionText }}
                  />
                </div>
              )}

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
                          className="text-sm text-indigo-600 hover:underline flex items-center gap-2"
                        >
                          <ExternalLink className="w-4 h-4" />
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

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

      {/* Feedback given */}
      {feedback.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-500" />
            Feedback Given
          </h2>
          {feedback.map((fb: any, index: number) => (
            <div key={fb.id || index} className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-indigo-900">
                  {fb.action === 'approve' || fb.action === 'approved' ? 'Approved' : fb.action === 'request_revision' ? 'Revision Requested' : 'Reviewed'}
                </p>
                {fb.rating != null && (
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 ${
                          star <= fb.rating
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
              {fb.comments && (
                <p className="text-sm text-indigo-800">{fb.comments}</p>
              )}
              {fb.strengths && (
                <div>
                  <p className="text-xs font-medium text-green-700 mb-1">Strengths</p>
                  <p className="text-sm text-green-800">{fb.strengths}</p>
                </div>
              )}
              {fb.improvements && (
                <div>
                  <p className="text-xs font-medium text-orange-700 mb-1">Areas for Improvement</p>
                  <p className="text-sm text-orange-800">{fb.improvements}</p>
                </div>
              )}
              {fb.createdAt && (
                <p className="text-xs text-slate-400">{new Date(fb.createdAt).toLocaleString()}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Extension Request ── */}
      {(() => {
        const pendingExtension = task.submissions?.find(
          (s: any) => s.extensionRequested && s.extensionStatus === 'pending'
        );
        if (!pendingExtension) return null;
        return (
          <div className="bg-orange-50 border-2 border-orange-300 rounded-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Clock className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-orange-900 mb-1">Extension Request Pending</h2>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-orange-700 font-medium">Days Requested</p>
                    <p className="text-orange-900">{pendingExtension.extensionDays} day{pendingExtension.extensionDays !== 1 ? 's' : ''}</p>
                  </div>
                  <div>
                    <p className="text-orange-700 font-medium">Reason</p>
                    <p className="text-orange-900">{pendingExtension.extensionReason || '—'}</p>
                  </div>
                  <div>
                    <p className="text-orange-700 font-medium">Current Due Date</p>
                    <p className="text-orange-900">{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}</p>
                  </div>
                  {task.dueDate && pendingExtension.extensionDays && (
                    <div>
                      <p className="text-orange-700 font-medium">New Due Date if Approved</p>
                      <p className="text-orange-900">
                        {new Date(
                          new Date(task.dueDate).getTime() + pendingExtension.extensionDays * 86400000
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Decision UI */}
            {extensionDecision === null && (
              <div className="flex gap-3 pt-2 border-t border-orange-200">
                <button
                  onClick={() => setExtensionDecision('approve')}
                  className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve Extension
                </button>
                <button
                  onClick={() => setExtensionDecision('reject')}
                  className="px-5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  Reject Extension
                </button>
              </div>
            )}

            {extensionDecision === 'approve' && (
              <div className="pt-2 border-t border-orange-200 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-orange-800 mb-1">
                    Override new due date <span className="text-orange-500 font-normal">(optional — leave blank to use +{pendingExtension.extensionDays} days)</span>
                  </label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="px-3 py-2 border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExtension(true, pendingExtension.id)}
                    disabled={isHandlingExtension}
                    className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isHandlingExtension ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Approving...</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4" /> Confirm Approve</>
                    )}
                  </button>
                  <button
                    onClick={() => setExtensionDecision(null)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-white transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}

            {extensionDecision === 'reject' && (
              <div className="pt-2 border-t border-orange-200 space-y-3">
                <p className="text-sm text-orange-800">Are you sure you want to reject this extension request? The mentee will keep the original due date.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExtension(false, pendingExtension.id)}
                    disabled={isHandlingExtension}
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isHandlingExtension ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Rejecting...</>
                    ) : (
                      <><XCircle className="w-4 h-4" /> Confirm Reject</>
                    )}
                  </button>
                  <button
                    onClick={() => setExtensionDecision(null)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-white transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Actions */}
      <div className="flex items-center justify-between gap-4">
        {canCancel && !cancellingTask && (
          <button
            onClick={() => setCancellingTask(true)}
            className="px-5 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl border border-red-200 font-medium transition-colors text-sm"
          >
            Cancel Task
          </button>
        )}

        {canReview && !cancellingTask && (
          <button
            onClick={() => router.push(`/mentor/tasks/${task.id}/feedback`)}
            className="ml-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Review Submission
          </button>
        )}
      </div>

      {/* Cancel confirmation */}
      {cancellingTask && (
        <div className="p-5 bg-red-50 border border-red-200 rounded-2xl">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-red-900 font-medium mb-1">Cancel this task?</p>
              <p className="text-red-700 text-sm">This will mark the task as cancelled. The mentee will be notified.</p>
            </div>
          </div>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Provide a reason for cancellation..."
            className="w-full p-3 border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 mb-3 text-sm"
            rows={3}
          />
          <div className="flex gap-2">
            <button
              onClick={handleCancelTask}
              disabled={isCancelling}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              {isCancelling ? 'Cancelling...' : 'Confirm Cancel'}
            </button>
            <button
              onClick={() => { setCancellingTask(false); setCancelReason(''); }}
              className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition-colors border border-slate-200 text-sm"
            >
              Keep Task
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
