/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { taskApi } from '@/lib/services/task-api';
import { submissionService } from '@/lib/services/submissionService';
import { toast } from 'sonner';

export interface UseMentorTaskDetailReturn {
  task: any | null;
  loading: boolean;
  error: string;
  cancellingTask: boolean;
  cancelReason: string;
  isCancelling: boolean;
  extensionDecision: 'approve' | 'reject' | null;
  newDueDate: string;
  isHandlingExtension: boolean;
  setCancellingTask: (v: boolean) => void;
  setCancelReason: (v: string) => void;
  setExtensionDecision: (v: 'approve' | 'reject' | null) => void;
  setNewDueDate: (v: string) => void;
  handleExtension: (approved: boolean, submissionId: string) => Promise<void>;
  handleCancelTask: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useMentorTaskDetail(taskId: string): UseMentorTaskDetailReturn {
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingTask, setCancellingTask] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [extensionDecision, setExtensionDecision] = useState<'approve' | 'reject' | null>(null);
  const [newDueDate, setNewDueDate] = useState('');
  const [isHandlingExtension, setIsHandlingExtension] = useState(false);

  const fetchTask = useCallback(async () => {
    if (!taskId) return;
    try {
      const response = await taskApi.getTaskById(taskId);
      setTask(response.data.task);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load task');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  const handleExtension = useCallback(
    async (approved: boolean, submissionId: string) => {
      setIsHandlingExtension(true);
      try {
        await submissionService.handleExtension(
          submissionId,
          approved,
          approved && newDueDate ? newDueDate : undefined
        );
        toast.success(
          approved ? 'Extension approved! Due date updated.' : 'Extension request rejected.'
        );
        setExtensionDecision(null);
        setNewDueDate('');
        await fetchTask();
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        toast.error(e.response?.data?.message || 'Failed to handle extension request');
      } finally {
        setIsHandlingExtension(false);
      }
    },
    [newDueDate, fetchTask]
  );

  const handleCancelTask = useCallback(async () => {
    if (!cancelReason.trim()) {
      toast.error('Please provide a reason for cancellation');
      return;
    }
    setIsCancelling(true);
    try {
      await taskApi.cancelTask(taskId, cancelReason);
      toast.success('Task cancelled successfully');
      setCancellingTask(false);
      setCancelReason('');
      await fetchTask();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Failed to cancel task');
    } finally {
      setIsCancelling(false);
    }
  }, [taskId, cancelReason, fetchTask]);

  return {
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
    refetch: fetchTask,
  };
}
