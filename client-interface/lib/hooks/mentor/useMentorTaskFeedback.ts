/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { taskApi } from '@/lib/services/task-api';
import { submissionService } from '@/lib/services/submissionService';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

export interface InlineFeedbackItem {
  id: number;
  comment: string;
  type: 'suggestion' | 'issue' | 'praise';
}

export interface UseMentorTaskFeedbackReturn {
  task: any | null;
  submission: any | null;
  loading: boolean;
  isSubmitting: boolean;
  showSuccess: boolean;
  /** True when this submission was already reviewed — the form edits the
   * existing review instead of creating one, and the decision is locked. */
  alreadyReviewed: boolean;
  rating: number;
  hoveredRating: number;
  feedbackText: string;
  revisionNotes: string;
  decision: 'approve' | 'revision' | null;
  pointsAwarded: number;
  inlineFeedback: InlineFeedbackItem[];
  error: string;
  ratingError: string;
  feedbackError: string;
  decisionError: string;
  revisionError: string;
  pointsError: string;
  setRating: (v: number) => void;
  setHoveredRating: (v: number) => void;
  setFeedbackText: (v: string) => void;
  setRevisionNotes: (v: string) => void;
  setDecision: (v: 'approve' | 'revision' | null) => void;
  setPointsAwarded: (v: number) => void;
  setRatingError: (v: string) => void;
  setFeedbackError: (v: string) => void;
  setDecisionError: (v: string) => void;
  setRevisionError: (v: string) => void;
  setPointsError: (v: string) => void;
  addInlineFeedback: () => void;
  updateInlineFeedback: (id: number, field: string, value: string) => void;
  removeInlineFeedback: (id: number) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
}

export function useMentorTaskFeedback(taskId: string): UseMentorTaskFeedbackReturn {
  const router = useRouter();

  const [task, setTask] = useState<any>(null);
  const [submission, setSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [revisionNotes, setRevisionNotes] = useState('');
  const [decision, setDecision] = useState<'approve' | 'revision' | null>(null);
  const [pointsAwarded, setPointsAwarded] = useState(0);
  const [inlineFeedback, setInlineFeedback] = useState<InlineFeedbackItem[]>([]);

  const [error, setError] = useState('');
  const [ratingError, setRatingError] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [revisionError, setRevisionError] = useState('');
  const [pointsError, setPointsError] = useState('');

  const loadTaskAndSubmission = useCallback(async () => {
    try {
      const response = await taskApi.getTaskById(taskId);
      const taskData = response.data.task;
      setTask(taskData);

      const sub = taskData.submissions?.[0] ?? null;
      setSubmission(sub);

      // Already-reviewed? Prefill the form from the existing review so the
      // mentor edits it in place instead of starting from a blank form.
      const reviewed = sub?.status === 'approved' || sub?.status === 'revision_needed';
      setAlreadyReviewed(reviewed);

      if (reviewed && Array.isArray(sub?.feedback) && sub.feedback.length > 0) {
        // hasMany feedback; take the most recently created row.
        const fb = [...sub.feedback].sort(
          (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];
        setRating(Number(fb.rating) || 0);
        setFeedbackText(fb.feedbackText || '');
        setRevisionNotes(fb.revisionNotes || '');
        setDecision(sub.status === 'approved' ? 'approve' : 'revision');
        setInlineFeedback(
          Array.isArray(fb.inlineFeedback)
            ? fb.inlineFeedback.map((item: any, i: number) => ({
                id: Date.now() + i,
                comment: item.comment || '',
                type: item.type || 'suggestion',
              }))
            : []
        );
        // Points live on the task once approved; fall back to the base value.
        setPointsAwarded(
          Number(taskData.pointsAwarded ?? taskData.roadmapTask?.pointsBase ?? 0) || 0
        );
      } else if (taskData.roadmapTask?.pointsBase) {
        setPointsAwarded(taskData.roadmapTask.pointsBase);
      }
    } catch (err: unknown) {
      setError(extractApiErrorMessage(err, 'Failed to load task'));
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (!taskId) return;
    loadTaskAndSubmission();
  }, [taskId, loadTaskAndSubmission]);

  const addInlineFeedback = useCallback(() => {
    setInlineFeedback((prev) => [
      ...prev,
      { id: Date.now(), comment: '', type: 'suggestion' },
    ]);
  }, []);

  const updateInlineFeedback = useCallback((id: number, field: string, value: string) => {
    setInlineFeedback((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }, []);

  const removeInlineFeedback = useCallback((id: number) => {
    setInlineFeedback((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setRatingError('');
      setFeedbackError('');
      setDecisionError('');
      setRevisionError('');
      setPointsError('');

      if (!submission) {
        setError('No submission found');
        return;
      }

      let hasError = false;
      if (!decision) {
        setDecisionError('Please select a decision (Approve or Request Revision).');
        hasError = true;
      }
      // Requesting a revision: the Revision Notes ARE the description of what to
      // fix, so that's the only required field — don't also force a rating or
      // general feedback (those are for an approval). Approving: rating +
      // feedback are required.
      if (decision === 'revision') {
        if (!revisionNotes.trim()) {
          setRevisionError('Revision notes are required — tell the mentee what to fix.');
          hasError = true;
        }
      }
      if (decision === 'approve') {
        if (rating === 0) {
          setRatingError('Please select a rating before submitting.');
          hasError = true;
        }
        const plainText = feedbackText.replace(/<[^>]*>/g, '').trim();
        if (!plainText) {
          setFeedbackError('Feedback is required. Please describe your thoughts on the submission.');
          hasError = true;
        }
        const maxPoints = task?.roadmapTask?.pointsBase ?? 10;
        if (pointsAwarded > maxPoints) {
          setPointsError(`Maximum points are ${maxPoints}.`);
          hasError = true;
        }
      }
      if (hasError) return;

      setIsSubmitting(true);
      try {
        const validInlineFeedback = inlineFeedback
          .filter((item) => item.comment.trim())
          .map((item) => ({ line: 0, comment: item.comment, type: item.type }));

        if (alreadyReviewed) {
          // Editing an existing review: the decision is locked, so we never flip
          // approve/revision here — we only correct feedback, rating, and points.
          await submissionService.editReview(submission.id, {
            rating,
            feedbackText,
            revisionNotes: decision === 'revision' ? revisionNotes : undefined,
            pointsAwarded: decision === 'approve' ? pointsAwarded : undefined,
            inlineFeedback: validInlineFeedback,
          });
          setShowSuccess(true);
          // Stay on the page and refresh so the saved review is reflected.
          await loadTaskAndSubmission();
          setTimeout(() => setShowSuccess(false), 3000);
        } else {
          await submissionService.reviewSubmission(submission.id, {
            rating,
            feedbackText,
            isApproved: decision === 'approve',
            revisionNotes: decision === 'revision' ? revisionNotes : undefined,
            pointsAwarded: decision === 'approve' ? pointsAwarded : 0,
            inlineFeedback: validInlineFeedback,
          } as any);

          setShowSuccess(true);
          setTimeout(() => router.push('/mentor/tasks'), 2000);
        }
      } catch (err: unknown) {
        setError(extractApiErrorMessage(err, 'Failed to submit feedback'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      submission,
      rating,
      feedbackText,
      decision,
      revisionNotes,
      pointsAwarded,
      task,
      inlineFeedback,
      router,
      alreadyReviewed,
      loadTaskAndSubmission,
    ]
  );

  return {
    task,
    submission,
    loading,
    isSubmitting,
    showSuccess,
    alreadyReviewed,
    rating,
    hoveredRating,
    feedbackText,
    revisionNotes,
    decision,
    pointsAwarded,
    inlineFeedback,
    error,
    ratingError,
    feedbackError,
    decisionError,
    revisionError,
    pointsError,
    setRating,
    setHoveredRating,
    setFeedbackText,
    setRevisionNotes,
    setDecision,
    setPointsAwarded,
    setRatingError,
    setFeedbackError,
    setDecisionError,
    setRevisionError,
    setPointsError,
    addInlineFeedback,
    updateInlineFeedback,
    removeInlineFeedback,
    handleSubmit,
  };
}
