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

  useEffect(() => {
    if (!taskId) return;
    const fetchTaskAndSubmission = async () => {
      try {
        const response = await taskApi.getTaskById(taskId);
        const taskData = response.data.task;
        setTask(taskData);
        if (taskData.submissions && taskData.submissions.length > 0) {
          setSubmission(taskData.submissions[0]);
        }
        if (taskData.roadmapTask?.pointsBase) {
          setPointsAwarded(taskData.roadmapTask.pointsBase);
        }
      } catch (err: unknown) {
        setError(extractApiErrorMessage(err, 'Failed to load task'));
      } finally {
        setLoading(false);
      }
    };
    fetchTaskAndSubmission();
  }, [taskId]);

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
          .filter((item) => item.comment.trim())
          .map((item) => ({ line: 0, comment: item.comment, type: item.type }));

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
      inlineFeedback,
      router,
    ]
  );

  return {
    task,
    submission,
    loading,
    isSubmitting,
    showSuccess,
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
    addInlineFeedback,
    updateInlineFeedback,
    removeInlineFeedback,
    handleSubmit,
  };
}
