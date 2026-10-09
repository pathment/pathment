/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useCallback, useMemo, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { qk, useApiQuery } from '@/lib/query';
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
  /** HTTP status when the load failed — lets the page tell 403 from 404. */
  errorStatus: number | null;
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [hoveredRating, setHoveredRating] = useState(0);

  const [ratingError, setRatingError] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [revisionError, setRevisionError] = useState('');
  const [pointsError, setPointsError] = useState('');
  const [submitError, setSubmitError] = useState('');

  const { data: task, loading, error: loadError, errorStatus, refetch } = useApiQuery<any>({
    queryKey: qk.mentor.taskDetail(taskId),
    queryFn: async () => (await taskApi.getTaskById(taskId)).data.task,
    enabled: !!taskId,
    errorMessage: 'Failed to load task',
  });

  const submission = task?.submissions?.[0] ?? null;
  const alreadyReviewed = submission?.status === 'approved' || submission?.status === 'revision_needed';

  // An already-reviewed submission prefills the form so the mentor edits it in
  // place. Derived from the loaded task rather than copied into state on load,
  // so the form can never show a prefill from a previous task.
  const prefill = useMemo(() => {
    const base = {
      rating: 0,
      feedbackText: '',
      revisionNotes: '',
      decision: null as 'approve' | 'revision' | null,
      inlineFeedback: [] as InlineFeedbackItem[],
      pointsAwarded: Number(task?.pointsBase ?? task?.roadmapTask?.pointsBase ?? task?.points ?? 0) || 0,
    };
    if (!alreadyReviewed || !Array.isArray(submission?.feedback) || !submission.feedback.length) return base;

    // hasMany feedback; take the most recently created row.
    const fb = [...submission.feedback].sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    return {
      rating: Number(fb.rating) || 0,
      feedbackText: fb.feedbackText || '',
      revisionNotes: fb.revisionNotes || '',
      decision: (submission.status === 'approved' ? 'approve' : 'revision') as 'approve' | 'revision',
      inlineFeedback: Array.isArray(fb.inlineFeedback)
        ? fb.inlineFeedback.map((item: any, i: number) => ({
            id: Date.now() + i,
            comment: item.comment || '',
            type: item.type || 'suggestion',
          }))
        : [],
      // Points live on the task once approved; fall back to the base value.
      pointsAwarded: Number(task?.pointsAwarded ?? task?.pointsBase ?? task?.roadmapTask?.pointsBase ?? 0) || 0,
    };
  }, [task, submission, alreadyReviewed]);

  // Drafts hold the mentor's edits; the prefill is the fallback underneath.
  const [ratingDraft, setRating] = useState<number | null>(null);
  const [feedbackDraft, setFeedbackText] = useState<string | null>(null);
  const [revisionDraft, setRevisionNotes] = useState<string | null>(null);
  const [decisionDraft, setDecisionRaw] = useState<'approve' | 'revision' | null | undefined>(undefined);
  const [pointsDraft, setPointsAwarded] = useState<number | null>(null);
  const [inlineDraft, setInlineDraft] = useState<InlineFeedbackItem[] | null>(null);

  const rating = ratingDraft ?? prefill.rating;
  const feedbackText = feedbackDraft ?? prefill.feedbackText;
  const revisionNotes = revisionDraft ?? prefill.revisionNotes;
  const decision = decisionDraft === undefined ? prefill.decision : decisionDraft;
  const pointsAwarded = pointsDraft ?? prefill.pointsAwarded;
  const inlineFeedback: InlineFeedbackItem[] = inlineDraft ?? prefill.inlineFeedback;

  const setDecision = useCallback((v: 'approve' | 'revision' | null) => setDecisionRaw(v), []);

  // Supports the functional form used by the add/update/remove helpers below.
  const setInlineFeedback = useCallback((v: SetStateAction<InlineFeedbackItem[]>) => {
    setInlineDraft((d) => (typeof v === 'function'
      ? (v as (p: InlineFeedbackItem[]) => InlineFeedbackItem[])(d ?? prefill.inlineFeedback)
      : v));
  }, [prefill.inlineFeedback]);

  const error = submitError || (loadError ?? '');
  const loadTaskAndSubmission = refetch;

  const addInlineFeedback = useCallback(() => {
    setInlineFeedback((prev) => [
      ...prev,
      { id: Date.now(), comment: '', type: 'suggestion' },
    ]);
  }, [setInlineFeedback]);

  const updateInlineFeedback = useCallback((id: number, field: string, value: string) => {
    setInlineFeedback((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }, [setInlineFeedback]);

  const removeInlineFeedback = useCallback((id: number) => {
    setInlineFeedback((prev) => prev.filter((item) => item.id !== id));
  }, [setInlineFeedback]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError('');
      setRatingError('');
      setFeedbackError('');
      setDecisionError('');
      setRevisionError('');
      setPointsError('');

      if (!submission) {
        setSubmitError('No submission found');
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
        const maxPoints = Number(
          task?.pointsBase ?? task?.roadmapTask?.pointsBase ?? task?.points ?? 10,
        ) || 10;
        if (pointsAwarded > maxPoints) {
          setPointsError(`Maximum XP & Coins are ${maxPoints}.`);
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
        setSubmitError(extractApiErrorMessage(err, 'Failed to submit feedback'));
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
    errorStatus,
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
