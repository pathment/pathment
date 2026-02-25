'use client';

import { useState, use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Star,
  Send,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  FileText,
  Download,
  User,
  Calendar,
  RotateCw,
  ThumbsUp,
  ThumbsDown,
  Loader2
} from 'lucide-react';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { submissionService } from '@/lib/services/submissionService';
import { taskApi } from '@/lib/services/task-api';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface Submission {
  id: string;
  version: number;
  submissionText: string;
  submissionUrls?: string[];
  submittedAt: string;
  status: string;
  extensionRequested?: boolean;
  extensionDays?: number;
  extensionReason?: string;
  files?: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    fileType: string;
    fileSize: number;
  }>;
}

interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  type: string;
  difficulty: string;
  deliverable?: string;
  acceptanceCriteria?: string[];
  status: string;
  isCustomTask: boolean;
  roadmapTask?: {
    title: string;
    description: string;
    deliverable?: string;
    acceptanceCriteria?: string[];
  };
  mentee?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  enrollment?: {
    program?: {
      name: string;
    };
  };
  submissions?: Submission[];
}

export default function FeedbackProvision({ params }: PageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [revisionNotes, setRevisionNotes] = useState('');
  const [decision, setDecision] = useState<'approve' | 'revision' | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [pointsAwarded, setPointsAwarded] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [ratingError, setRatingError] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [revisionError, setRevisionError] = useState('');
  const [inlineFeedback, setInlineFeedback] = useState<Array<{
    id: number;
    comment: string;
    type: 'suggestion' | 'issue' | 'praise';
  }>>([]);

  useEffect(() => {
    const fetchTaskAndSubmission = async () => {
      try {
        const response = await taskApi.getTaskById(resolvedParams.id);
        const taskData = response.data.task;
        setTask(taskData);
        
        // Get the latest submission
        if (taskData.submissions && taskData.submissions.length > 0) {
          setSubmission(taskData.submissions[0]);
        }
        
        // Set default points based on task
        if (taskData.pointsBase) {
          setPointsAwarded(taskData.pointsBase);
        }
      } catch (err: unknown) {
        const error = err as { response?: { data?: { message?: string } } };
        setError(error.response?.data?.message || 'Failed to load task');
      } finally {
        setLoading(false);
      }
    };

    fetchTaskAndSubmission();
  }, [resolvedParams.id]);

  const addInlineFeedback = () => {
    setInlineFeedback([
      ...inlineFeedback,
      { id: Date.now(), comment: '', type: 'suggestion' }
    ]);
  };

  const updateInlineFeedback = (id: number, field: string, value: string) => {
    setInlineFeedback(
      inlineFeedback.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const removeInlineFeedback = (id: number) => {
    setInlineFeedback(inlineFeedback.filter(item => item.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRatingError('');
    setFeedbackError('');
    setDecisionError('');
    setRevisionError('');

    if (!submission) {
      setError('No submission found');
      return;
    }

    let hasError = false;

    if (rating === 0) {
      setRatingError('Please select a rating before submitting.');
      hasError = true;
    }

    const plainText = feedbackText.replace(/<[^>]*>/g, '').trim();
    if (!plainText) {
      setFeedbackError('Feedback is required. Please describe your thoughts on the submission.');
      hasError = true;
    }

    if (!decision) {
      setDecisionError('Please select a decision (Approve or Request Revision).');
      hasError = true;
    }

    if (decision === 'revision' && !revisionNotes.trim()) {
      setRevisionError('Revision notes are required when requesting a revision.');
      hasError = true;
    }

    if (hasError) return;

    setIsSubmitting(true);

    try {
      const validInlineFeedback = inlineFeedback
        .filter(item => item.comment.trim())
        .map(item => ({
          line: 0,
          comment: item.comment,
          type: item.type
        }));

      await submissionService.reviewSubmission(submission.id, {
        rating,
        feedbackText,
        inlineFeedback: validInlineFeedback.length > 0 ? validInlineFeedback : undefined,
        isApproved: decision === 'approve',
        revisionNotes: decision === 'revision' ? revisionNotes : undefined,
        pointsAwarded: decision === 'approve' ? pointsAwarded : undefined
      });

      setShowSuccess(true);
      setTimeout(() => router.push('/mentor/tasks'), 2000);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Failed to submit review');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!task || !submission) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
        <p className="text-red-900">Task or submission not found</p>
      </div>
    );
  }

  const taskTitle = task.roadmapTask?.title || task.title;
  const taskDescription = task.roadmapTask?.description || task.description;
  const taskDeliverable = task.roadmapTask?.deliverable || task.deliverable;
  const acceptanceCriteria = task.roadmapTask?.acceptanceCriteria || task.acceptanceCriteria || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <button
        onClick={() => router.push('/mentor/tasks')}
        className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Review Queue
      </button>

      {/* Success Message */}
      {showSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-green-900">Feedback submitted successfully!</p>
            <p className="text-green-700 text-sm mt-1">Your mentee will be notified.</p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-red-900">{error}</p>
        </div>
      )}

      {/* Mentee & Task Info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center shrink-0">
            <User className="w-6 h-6 text-slate-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-slate-900 mb-1">
              {task.mentee?.firstName} {task.mentee?.lastName}
            </h2>
            <p className="text-slate-600 text-sm mb-3">{task.enrollment?.program?.name}</p>
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Submitted {new Date(submission.submittedAt).toLocaleDateString()}
              </span>
              {submission.version > 1 && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                  Version {submission.version}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg text-slate-900">{taskTitle}</h3>
            {task.isCustomTask && (
              <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">Custom</span>
            )}
            <span className={`px-2 py-1 text-xs rounded ${
              task.difficulty === 'beginner' ? 'bg-green-100 text-green-700' :
              task.difficulty === 'intermediate' ? 'bg-yellow-100 text-yellow-700' :
              'bg-red-100 text-red-700'
            }`}>
              {task.difficulty}
            </span>
          </div>
          <p className="text-slate-600 text-sm mb-4">{taskDescription}</p>
          
          {taskDeliverable && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900"><strong>Expected Deliverable:</strong> {taskDeliverable}</p>
            </div>
          )}

          {acceptanceCriteria.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm text-slate-700 mb-2">Acceptance Criteria</h4>
              <ul className="space-y-1">
                {acceptanceCriteria.map((criterion, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-slate-600">
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                    {criterion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {submission.extensionRequested && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5" />
                <div>
                  <p className="text-sm text-orange-900 font-medium">Extension Requested</p>
                  <p className="text-sm text-orange-700">{submission.extensionDays} days - {submission.extensionReason}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Submission Content */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-lg text-slate-900 mb-4">Mentee&apos;s Submission</h3>
        
        <div className="prose prose-sm max-w-none mb-6 p-4 bg-slate-50 rounded-lg">
          <div dangerouslySetInnerHTML={{ __html: submission.submissionText }} />
        </div>

        {/* Links */}
        {submission.submissionUrls && submission.submissionUrls.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm text-slate-700 mb-3">Project Links</h4>
            <div className="space-y-2">
              {submission.submissionUrls.map((url, index) => (
                <a
                  key={index}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-blue-600" />
                  <span className="text-blue-700 text-sm">{url}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Files */}
        {submission.files && submission.files.length > 0 && (
          <div>
            <h4 className="text-sm text-slate-700 mb-3">File Attachments</h4>
            <div className="space-y-2">
              {submission.files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-slate-600" />
                    <div>
                      <p className="text-sm text-slate-900">{file.fileName}</p>
                      <p className="text-xs text-slate-500">{(file.fileSize / 1024).toFixed(2)} KB</p>
                    </div>
                  </div>
                  <a
                    href={file.fileUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 hover:bg-slate-200 rounded transition-colors"
                  >
                    <Download className="w-4 h-4 text-slate-600" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Review Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
        <h3 className="text-lg text-slate-900">Provide Feedback</h3>

        {/* Rating */}
        <div>
          <label className="block text-sm text-slate-700 mb-2">
            Rating <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => { setRating(star); setRatingError(''); }}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  className={`w-8 h-8 ${
                    star <= (hoveredRating || rating)
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-slate-300'
                  }`}
                />
              </button>
            ))}
            <span className="ml-3 text-slate-600 self-center">
              {rating > 0 ? `${rating}/5` : 'Not rated'}
            </span>
          </div>
          {ratingError && (
            <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {ratingError}
            </p>
          )}
        </div>

        {/* General Feedback */}
        <div>
          <label className="block text-sm text-slate-700 mb-2">
            General Feedback <span className="text-red-500">*</span>
          </label>
          <div className={feedbackError ? 'ring-2 ring-red-400 rounded-lg' : ''}>
            <RichTextEditor
              content={feedbackText}
              onChange={(val) => { setFeedbackText(val); if (val.replace(/<[^>]*>/g, '').trim()) setFeedbackError(''); }}
              placeholder="Provide detailed feedback on the submission..."
              minHeight="200px"
            />
          </div>
          {feedbackError && (
            <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {feedbackError}
            </p>
          )}
        </div>

        {/* Inline Feedback */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm text-slate-700">
              Inline Feedback (Optional)
            </label>
            <button
              type="button"
              onClick={addInlineFeedback}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Add inline comment
            </button>
          </div>
          <div className="space-y-3">
            {inlineFeedback.map((item) => (
              <div key={item.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex gap-2 mb-2">
                  <select
                    value={item.type}
                    onChange={(e) => updateInlineFeedback(item.id, 'type', e.target.value)}
                    className="px-2 py-1 text-sm border border-slate-300 rounded"
                  >
                    <option value="suggestion">💡 Suggestion</option>
                    <option value="issue">⚠️ Issue</option>
                    <option value="praise">👍 Praise</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeInlineFeedback(item.id)}
                    className="ml-auto text-sm text-slate-600 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  value={item.comment}
                  onChange={(e) => updateInlineFeedback(item.id, 'comment', e.target.value)}
                  placeholder="Add your comment..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Decision */}
        <div>
          <label className="block text-sm text-slate-700 mb-3">
            Decision <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => { setDecision('approve'); setDecisionError(''); }}
              className={`p-4 border-2 rounded-xl flex items-center gap-3 transition-all ${
                decision === 'approve'
                  ? 'border-green-500 bg-green-50'
                  : 'border-slate-200 hover:border-green-300'
              }`}
            >
              <ThumbsUp className={`w-6 h-6 ${decision === 'approve' ? 'text-green-600' : 'text-slate-400'}`} />
              <div className="text-left">
                <p className="text-slate-900">Approve</p>
                <p className="text-xs text-slate-500">Task completed successfully</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => { setDecision('revision'); setDecisionError(''); }}
              className={`p-4 border-2 rounded-xl flex items-center gap-3 transition-all ${
                decision === 'revision'
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-slate-200 hover:border-orange-300'
              }`}
            >
              <RotateCw className={`w-6 h-6 ${decision === 'revision' ? 'text-orange-600' : 'text-slate-400'}`} />
              <div className="text-left">
                <p className="text-slate-900">Request Revision</p>
                <p className="text-xs text-slate-500">Needs improvements</p>
              </div>
            </button>
          </div>
          {decisionError && (
            <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {decisionError}
            </p>
          )}
        </div>

        {/* Points (if approved) */}
        {decision === 'approve' && (
          <div>
            <label className="block text-sm text-slate-700 mb-2">
              Points Awarded
            </label>
            <input
              type="number"
              value={pointsAwarded}
              onChange={(e) => setPointsAwarded(Number(e.target.value))}
              min="0"
              max="100"
              className="w-32 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Revision Notes (if revision requested) */}
        {decision === 'revision' && (
          <div>
            <label className="block text-sm text-slate-700 mb-2">
              Revision Notes <span className="text-red-500">*</span>
            </label>
            <textarea
              value={revisionNotes}
              onChange={(e) => { setRevisionNotes(e.target.value); if (e.target.value.trim()) setRevisionError(''); }}
              placeholder="Specify what needs to be improved or corrected..."
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 min-h-[100px] ${
                revisionError
                  ? 'border-red-400 focus:ring-red-500'
                  : 'border-slate-200 focus:ring-blue-500'
              }`}
            />
            {revisionError && (
              <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {revisionError}
              </p>
            )}
          </div>
        )}

        {/* Submit Button */}
        <div className="flex justify-end pt-4 border-t">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit Review
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
