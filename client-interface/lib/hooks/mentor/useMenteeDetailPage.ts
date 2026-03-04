/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { matchingApi, enrollmentApi } from '@/lib/services/enrollment-api';
import { taskApi } from '@/lib/services/task-api';
import { useAuth } from '@/lib/context/AuthContext';
import { toast } from 'sonner';

export interface UseMenteeDetailPageReturn {
  match: any | null;
  tasks: any[];
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

  const [match, setMatch] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [completionLoading, setCompletionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  const fetchMenteeDetails = useCallback(async () => {
    if (!user?.id || !menteeId) return;
    try {
      setLoading(true);
      const response = await matchingApi.getMatches({
        mentorId: user.id,
        menteeId,
        status: 'active',
      });
      const matches = response?.data?.matches || response?.matches || [];
      if (matches.length > 0) {
        setMatch(matches[0]);
      }
      const tasksRes = await taskApi.getMentorTasks(user.id, { menteeId });
      setTasks(tasksRes?.data?.tasks || []);
    } catch (error: any) {
      console.error('Failed to fetch mentee details:', error);
      toast.error('Failed to load mentee details');
    } finally {
      setLoading(false);
    }
  }, [user?.id, menteeId]);

  useEffect(() => {
    if (user?.id && menteeId) {
      fetchMenteeDetails();
    }
  }, [user?.id, menteeId, fetchMenteeDetails]);

  const enrollment = match?.enrollment;

  const handleApproveCompletion = useCallback(async () => {
    if (!enrollment?.id) return;
    try {
      setCompletionLoading(true);
      const res = await enrollmentApi.approveCompletion(enrollment.id);
      const result = (res as any)?.data?.result;
      if (result?.autoPromoted) {
        toast.success(
          `Level complete! Mentee advanced to "${result.nextLevelName}" — awaiting new mentor match.`
        );
      } else if (result?.hasNextLevel === false) {
        toast.success('Program completed! Well done.');
      } else {
        toast.success('Completion approved!');
      }
      setShowCompleteConfirm(false);
      fetchMenteeDetails();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to approve completion');
    } finally {
      setCompletionLoading(false);
    }
  }, [enrollment?.id, fetchMenteeDetails]);

  const handleRejectCompletion = useCallback(async () => {
    if (!enrollment?.id) return;
    try {
      setCompletionLoading(true);
      await enrollmentApi.rejectCompletion(enrollment.id, rejectReason);
      toast.success('Completion request rejected — mentee returned to active');
      setShowRejectModal(false);
      setRejectReason('');
      fetchMenteeDetails();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to reject completion');
    } finally {
      setCompletionLoading(false);
    }
  }, [enrollment?.id, rejectReason, fetchMenteeDetails]);

  return {
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
    fetchMenteeDetails,
  };
}
