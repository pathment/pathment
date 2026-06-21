'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { enrollmentApi } from '@/lib/services/enrollment-api';
import { useAuth } from '@/lib/context/AuthContext';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';
import { matchQueries } from '@/lib/queries/matches';
import { taskQueries } from '@/lib/queries/task';
import { cohortQueries } from '@/lib/queries/cohort';
import type { MenteeDetailMatch, CompletionResult } from '@/lib/types/matches';
import type { MenteeTask } from '@/lib/types/task';

export interface UseMenteeDetailPageReturn {
  match: MenteeDetailMatch | null;
  tasks: MenteeTask[];
  loading: boolean;
  completionLoading: boolean;
  rejectReason: string;
  showRejectModal: boolean;
  showCompleteConfirm: boolean;
  setRejectReason: (v: string) => void;
  setShowRejectModal: (v: boolean) => void;
  setShowCompleteConfirm: (v: boolean) => void;
  handleApproveCompletion: () => Promise<void>;
  handleRejectCompletion: () => Promise<void>;
  fetchMenteeDetails: () => Promise<void>;
}

export function useMenteeDetailPage(menteeId: string): UseMenteeDetailPageReturn {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const matchQuery = useQuery(matchQueries.menteeDetail({ mentorId: user?.id ?? '', menteeId }));
  const tasksQuery = useQuery(taskQueries.byMentee(menteeId));

  const match = matchQuery.data ?? null;
  const enrollmentId = match?.enrollment?.id ?? null;

  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  // Completion changes status and can auto-promote → refresh this match + the
  // cohort lists that 11 mentor pages read.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: matchQueries.all() });
    queryClient.invalidateQueries({ queryKey: cohortQueries.all() });
  };

  const approveMutation = useMutation<{ data?: { result?: CompletionResult } }, Error, void>({
    mutationFn: async () => {
      if (!enrollmentId) throw new Error('No active enrollment');
      const res: { data?: { result?: CompletionResult } } = await enrollmentApi.approveCompletion(enrollmentId);
      return res;
    },
    onSuccess: (res) => {
      const result = res.data?.result;
      if (result?.autoPromoted) {
        toast.success(`Level complete! Mentee advanced to "${result.nextLevelName}" - awaiting new mentor match.`);
      } else if (result?.hasNextLevel === false) {
        toast.success('Program completed! Well done.');
      } else {
        toast.success('Completion approved!');
      }
      setShowCompleteConfirm(false);
      invalidate();
    },
    onError: (err) => toast.error(extractApiErrorMessage(err, 'Failed to approve completion')),
  });

  const rejectMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      if (!enrollmentId) throw new Error('No active enrollment');
      return enrollmentApi.rejectCompletion(enrollmentId, rejectReason);
    },
    onSuccess: () => {
      toast.success('Completion request rejected - mentee returned to active');
      setShowRejectModal(false);
      setRejectReason('');
      invalidate();
    },
    onError: (err) => toast.error(extractApiErrorMessage(err, 'Failed to reject completion')),
  });

  return {
    match,
    tasks: tasksQuery.data ?? [],
    loading: matchQuery.isPending || tasksQuery.isPending,
    completionLoading: approveMutation.isPending || rejectMutation.isPending,
    rejectReason,
    showRejectModal,
    showCompleteConfirm,
    setRejectReason,
    setShowRejectModal,
    setShowCompleteConfirm,
    handleApproveCompletion: async () => {
      await approveMutation.mutateAsync().catch(() => {/* onError toasts */});
    },
    handleRejectCompletion: async () => {
      await rejectMutation.mutateAsync().catch(() => {/* onError toasts */});
    },
    fetchMenteeDetails: async () => {
      await Promise.all([matchQuery.refetch(), tasksQuery.refetch()]);
    },
  };
}
