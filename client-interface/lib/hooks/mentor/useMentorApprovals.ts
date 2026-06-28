import { useCallback, useEffect, useState } from 'react';
import { mentorApi } from '@/lib/services/mentor-api';
import { submissionService } from '@/lib/services/submissionService';

export interface BulkReviewPayload {
  decision: 'approved' | 'approved_notes' | 'changes' | 'rejected';
  rating?: number;
  feedbackText?: string;
  revisionNotes?: string;
  pointsAwarded?: number;
}

export interface ApprovalItem {
  submissionId: string;
  taskId: string;
  roadmapTaskId: string | null;
  version: number;
  submissionText: string;
  submissionUrls: string[];
  submittedAt: string;
  isLate: boolean;
  title: string;
  type: string | null;
  brief: string | null;
  deliverable: string | null;
  criteria: string[];
  maxPoints: number;
  mentee: { id: string; name: string; avatar: string } | null;
  isExtensionRequest: boolean;
  extensionReason: string | null;
  extensionDays: number | null;
  dueDate: string | null;
  menteeTimezone: string | null;
}

/** A task the mentor sent back for changes, awaiting the mentee's resubmission. */
export interface ChangesRequestedItem {
  taskId: string;
  roadmapTaskId: string | null;
  title: string;
  type: string | null;
  revisionCount: number;
  /** 'changes' = changes requested, 'rejected' = rejected. Both await resubmission. */
  decision: 'changes' | 'rejected';
  revisionNotes: string | null;
  feedbackText: string | null;
  requestedAt: string;
  dueDate: string | null;
  isLate: boolean;
  mentee: { id: string; name: string; avatar: string } | null;
}

/** A task the mentor has already approved — the "Reviewed" history. */
export interface ReviewedItem {
  taskId: string;
  roadmapTaskId: string | null;
  title: string;
  type: string | null;
  /** 'approved' or 'approved_notes'. */
  decision: 'approved' | 'approved_notes';
  rating: number | null;
  pointsAwarded: number;
  maxPoints: number;
  feedbackText: string | null;
  reviewedAt: string;
  isLate: boolean;
  mentee: { id: string; name: string; avatar: string; profilePictureUrl?: string | null } | null;
}

export interface UseMentorApprovalsReturn {
  queue: ApprovalItem[];
  changesRequested: ChangesRequestedItem[];
  reviewed: ReviewedItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  bulkApprove: (submissionIds: string[]) => Promise<void>;
  bulkReview: (submissionIds: string[], payload: BulkReviewPayload) => Promise<void>;
  handleExtension: (submissionId: string, approved: boolean, newDueDate?: string) => Promise<void>;
}

export function useMentorApprovals(): UseMentorApprovalsReturn {
  const [queue, setQueue] = useState<ApprovalItem[]>([]);
  const [changesRequested, setChangesRequested] = useState<ChangesRequestedItem[]>([]);
  const [reviewed, setReviewed] = useState<ReviewedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Load the review queue, the changes-requested list, and the reviewed
      // history together. The latter two are best-effort: a failure there must
      // not blank the whole page.
      const [res, changesRes, reviewedRes] = await Promise.all([
        mentorApi.getApprovals(),
        mentorApi.getChangesRequested().catch(() => null),
        mentorApi.getReviewed().catch(() => null),
      ]);
      setQueue(res?.data?.queue ?? []);
      setChangesRequested(changesRes?.data?.items ?? []);
      setReviewed(reviewedRes?.data?.items ?? []);
    } catch {
      setError('Failed to load the approvals queue');
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const bulkApprove = useCallback(async (submissionIds: string[]) => {
    await mentorApi.bulkApprove(submissionIds);
    await fetchQueue();
  }, [fetchQueue]);

  const bulkReview = useCallback(async (submissionIds: string[], payload: BulkReviewPayload) => {
    await mentorApi.bulkReview(submissionIds, payload);
    await fetchQueue();
  }, [fetchQueue]);

  const handleExtension = useCallback(async (submissionId: string, approved: boolean, newDueDate?: string) => {
    await submissionService.handleExtension(submissionId, approved, newDueDate);
    await fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  return { queue, changesRequested, reviewed, loading, error, refetch: fetchQueue, bulkApprove, bulkReview, handleExtension };
}
