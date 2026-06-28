'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Star,
  CheckCircle2,
  Calendar,
  FileText,
  ExternalLink,
  ThumbsUp,
  Clock,
  Award,
  AlertCircle,
  Loader2,
  MessageSquare,
  BookOpen,
  Sparkles,
  User,
} from 'lucide-react';
import { useTaskDetail } from '@/lib/hooks/mentee';
import { toExternalHref } from '@/lib/utils/url';
import { RichContent } from '@/components/shared/RichContent';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function FeedbackView({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { task, loading, error } = useTaskDetail(id);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push('/mentee/tasks')}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Tasks
        </button>
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-red-900">{error || 'Task not found'}</p>
        </div>
      </div>
    );
  }

  const taskTitle = task.roadmapTask?.title || task.title || 'Task Feedback';
  const taskDescription = task.roadmapTask?.description || task.description || '';
  const latestSubmission = task.submissions?.[task.submissions.length - 1] || null;
  const feedback = latestSubmission?.feedback || [];
  const latestFeedback = feedback[feedback.length - 1] || null;

  const mentorFirstName = task.mentor?.firstName || '';
  const mentorLastName = task.mentor?.lastName || '';
  const mentorName =
    mentorFirstName || mentorLastName
      ? `${mentorFirstName} ${mentorLastName}`.trim()
      : 'Your Mentor';
  const mentorInitials =
    (mentorFirstName[0] || '') + (mentorLastName[0] || '') || 'M';

  const rating = latestFeedback?.rating ?? task.finalRating ?? null;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <button
        onClick={() => router.push('/mentee/tasks')}
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Tasks
      </button>

      {/* Task Header */}
      <div className="bg-card rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 mr-4">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-slate-900">{taskTitle}</h1>
              {task.isCustomTask ? (
                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Custom
                </span>
              ) : (
                <span className="px-2 py-1 bg-brand-100 text-brand-700 rounded text-xs font-medium flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> Roadmap
                </span>
              )}
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                Completed
              </span>
            </div>
            {taskDescription && (
              <p className="text-slate-600 text-sm">{taskDescription}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-6 text-sm text-slate-600">
          {latestSubmission?.submittedAt && (
            <span className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Submitted: {new Date(latestSubmission.submittedAt).toLocaleDateString()}
            </span>
          )}
          {(latestSubmission?.reviewedAt || task.completedAt) && (
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              Reviewed:{' '}
              {new Date(
                latestSubmission?.reviewedAt || task.completedAt
              ).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Points earned */}
        {task.pointsAwarded != null && (
          <div className="mt-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-brand-500" />
            <span className="text-sm font-semibold text-brand-700">
              {task.pointsAwarded} points earned
            </span>
          </div>
        )}
      </div>

      {/* Feedback Section */}
      {latestFeedback ? (
        <div className="bg-card rounded-2xl border border-slate-200 p-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center">
                <span className="text-purple-700 font-medium">
                  {mentorInitials.toUpperCase()}
                </span>
              </div>
              <div>
                <div className="text-slate-900 mb-1">{mentorName}</div>
                <div className="text-slate-500 text-sm flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  Mentor
                </div>
              </div>
            </div>

            {/* Rating */}
            {rating != null && (
              <div className="text-right">
                <div className="flex items-center gap-1 mb-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-6 h-6 ${
                        i < Math.round(parseFloat(rating))
                          ? 'text-yellow-500 fill-yellow-500'
                          : 'text-slate-300'
                      }`}
                    />
                  ))}
                </div>
                <div className="text-slate-600 text-sm">
                  {parseFloat(rating).toFixed(1)}/5 Rating
                </div>
              </div>
            )}
          </div>

          {/* Feedback Comment */}
          {latestFeedback.comments && (
            <div className="p-5 bg-slate-50 rounded-xl mb-6">
              <h3 className="text-slate-900 mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-brand-500" />
                Mentor Feedback
              </h3>
              <div className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">
                {latestFeedback.comments}
              </div>
            </div>
          )}

          {/* Strengths & Improvements */}
          {(latestFeedback.strengths || latestFeedback.improvements) && (
            <div className="grid md:grid-cols-2 gap-6">
              {latestFeedback.strengths && (
                <div className="p-5 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <ThumbsUp className="w-5 h-5 text-green-600" />
                    <h4 className="text-green-900">Strengths</h4>
                  </div>
                  <p className="text-green-800 text-sm leading-relaxed">
                    {latestFeedback.strengths}
                  </p>
                </div>
              )}

              {latestFeedback.improvements && (
                <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <h4 className="text-blue-900">For Next Time</h4>
                  </div>
                  <p className="text-blue-800 text-sm leading-relaxed">
                    {latestFeedback.improvements}
                  </p>
                </div>
              )}
            </div>
          )}

          {latestFeedback.createdAt && (
            <p className="mt-4 text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Reviewed on {new Date(latestFeedback.createdAt).toLocaleString()}
            </p>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-slate-200 p-8 text-center">
          <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No feedback available yet</p>
          <p className="text-slate-500 text-sm mt-1">
            Your mentor hasn&apos;t left feedback for this task yet
          </p>
        </div>
      )}

      {/* Your Submission */}
      {latestSubmission && (
        <div className="bg-card rounded-2xl border border-slate-200 p-6">
          <h2 className="text-slate-900 mb-4">Your Submission</h2>

          {/* Submission text */}
          {latestSubmission.submissionText && (
            <div className="mb-6">
              <h3 className="text-slate-700 text-sm font-medium mb-2">Description</h3>
              <RichContent
                html={latestSubmission.submissionText}
                className="text-slate-600 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700 leading-relaxed"
              />
            </div>
          )}

          {/* Project Links */}
          {latestSubmission.submissionUrls &&
            latestSubmission.submissionUrls.length > 0 && (
              <div className="mb-6">
                <h3 className="text-slate-700 text-sm font-medium mb-2">Project Links</h3>
                <div className="space-y-2">
                  {latestSubmission.submissionUrls.map((link: string, idx: number) => (
                    <a
                      key={idx}
                      href={toExternalHref(link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-brand-600 hover:text-brand-700 text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      {link}
                    </a>
                  ))}
                </div>
              </div>
            )}

          {latestSubmission.submittedAt && (
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Submitted on {new Date(latestSubmission.submittedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={() => router.push('/mentee/tasks')}
          className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors"
        >
          View All Tasks
        </button>
        <button
          onClick={() => router.push(`/mentee/tasks/${id}`)}
          className="px-6 py-3 bg-card hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors"
        >
          View Task Details
        </button>
      </div>
    </div>
  );
}
