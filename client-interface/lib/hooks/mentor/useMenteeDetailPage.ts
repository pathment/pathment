/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useState } from 'react';
import { matchingApi, enrollmentApi } from '@/lib/services/enrollment-api';
import { taskApi } from '@/lib/services/task-api';
import { useAuth } from '@/lib/context/AuthContext';
import { useClan } from '@/lib/context/ClanContext';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { qk, useApiQuery, useInvalidate } from '@/lib/query';
import { toast } from 'sonner';

/**
 * Why the page could not resolve a mentee. `forbidden` and `notFound` are very
 * different situations that both used to render as "Mentee not found".
 */
export type MenteeLoadError = 'forbidden' | 'notFound' | 'failed' | null;

export interface UseMenteeDetailPageReturn {
  match: any | null;
  tasks: any[];
  loadError: MenteeLoadError;
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

const NO_TASKS: any[] = [];

export function useMenteeDetailPage(menteeId: string): UseMenteeDetailPageReturn {
  const { user } = useAuth();
  const { activeClanId } = useClan();
  const invalidate = useInvalidate();

  const [completionLoading, setCompletionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  const enabled = !!user?.id && !!menteeId;

  const matchQuery = useApiQuery<any | null>({
    queryKey: qk.mentee.matches(user?.id ?? '', menteeId),
    queryFn: async () => {
      const response = await matchingApi.getMatches({ mentorId: user!.id, menteeId, status: 'active' });
      const matches = response?.data?.matches || response?.matches || [];
      if (matches.length > 0) return matches[0];

      // Clan-placed mentees have no MentorMenteeMatch — resolve them via their
      // enrollment instead so the page works for the clan model.
      const enrRes: any = await enrollmentApi.getAll({ menteeId });
      const enrollments = enrRes?.data?.enrollments || enrRes?.data || [];
      const active = enrollments.find((e: any) => !['rejected', 'dropped'].includes(e.status)) || enrollments[0];
      return active ? { mentee: active.mentee, enrollment: active } : null;
    },
    enabled,
  });

  // Independent of the match query, so the two run in parallel rather than the
  // tasks waiting on a request they do not depend on.
  const tasksQuery = useApiQuery<any[]>({
    queryKey: qk.mentee.tasks(menteeId, activeClanId),
    queryFn: async () => {
      const res = await taskApi.getMenteeTasks(menteeId);
      return res?.data?.tasks || [];
    },
    enabled,
  });

  const status = matchQuery.errorStatus ?? tasksQuery.errorStatus;
  const failed = !!matchQuery.error || !!tasksQuery.error;
  const loadError: MenteeLoadError = status === 403 ? 'forbidden'
    : status === 404 ? 'notFound'
      : failed ? 'failed'
        : (!matchQuery.loading && matchQuery.data === null) ? 'notFound'
          : null;

  const fetchMenteeDetails = useCallback(async () => {
    await Promise.all([matchQuery.refetch(), tasksQuery.refetch()]);
  }, [matchQuery, tasksQuery]);

  const enrollment = matchQuery.data?.enrollment;

  const refreshAfterCompletion = useCallback(
    () => invalidate(qk.mentee.matches(user?.id ?? '', menteeId), qk.mentee.tasks(menteeId, activeClanId), qk.mentor.cohort),
    [invalidate, user?.id, menteeId, activeClanId]
  );

  const handleApproveCompletion = useCallback(async () => {
    if (!enrollment?.id) return;
    try {
      setCompletionLoading(true);
      const res = await enrollmentApi.approveCompletion(enrollment.id);
      const result = (res as any)?.data?.result;
      if (result?.autoPromoted) {
        toast.success(`Level complete! Mentee advanced to "${result.nextLevelName}" - awaiting new mentor match.`);
      } else if (result?.hasNextLevel === false) {
        toast.success('Program completed! Well done.');
      } else {
        toast.success('Completion approved!');
      }
      setShowCompleteConfirm(false);
      await refreshAfterCompletion();
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to approve completion'));
    } finally {
      setCompletionLoading(false);
    }
  }, [enrollment?.id, refreshAfterCompletion]);

  const handleRejectCompletion = useCallback(async () => {
    if (!enrollment?.id) return;
    try {
      setCompletionLoading(true);
      await enrollmentApi.rejectCompletion(enrollment.id, rejectReason);
      toast.success('Completion request rejected - mentee returned to active');
      setShowRejectModal(false);
      setRejectReason('');
      await refreshAfterCompletion();
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to reject completion'));
    } finally {
      setCompletionLoading(false);
    }
  }, [enrollment?.id, rejectReason, refreshAfterCompletion]);

  return {
    match: matchQuery.data ?? null,
    tasks: tasksQuery.data ?? NO_TASKS,
    loadError,
    loading: matchQuery.loading || tasksQuery.loading,
    completionLoading,
    rejectReason,
    showRejectModal,
    showCompleteConfirm,
    setRejectReason,
    setShowRejectModal,
    setShowCompleteConfirm,
    handleApproveCompletion,
    handleRejectCompletion,
    fetchMenteeDetails,
  };
}
