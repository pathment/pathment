/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { taskApi } from '@/lib/services/task-api';
import { enrollmentApi } from '@/lib/services/enrollment-api';
import { toast } from 'sonner';
import { useAuth } from '@/lib/context/AuthContext';

export interface UseMenteeTasksReturn {
  tasks: any[];
  filteredTasks: any[];
  stats: any;
  loading: boolean;
  enrollments: any[];
  selectedEnrollmentId: string | null;
  filterStatus: string;
  searchTerm: string;
  setSelectedEnrollmentId: (id: string | null) => void;
  setFilterStatus: (status: string) => void;
  setSearchTerm: (term: string) => void;
  handleStartTask: (taskId: string) => Promise<void>;
  fetchTasks: () => Promise<void>;
}

export function useMenteeTasks(): UseMenteeTasksReturn {
  const { user } = useAuth();

  const [tasks, setTasks] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  const [enrollmentsReady, setEnrollmentsReady] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchEnrollments = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await enrollmentApi.getAll({ menteeId: user.id });
      const list: any[] = res?.data?.enrollments || [];
      setEnrollments(list);
      // Auto-select first active/in_progress enrollment
      const active =
        list.find((e: any) => ['active', 'matched'].includes(e.status)) || list[0];
      if (active) {
        setSelectedEnrollmentId(active.id);
      }
    } catch (err: any) {
      console.error('Failed to fetch enrollments:', err);
    } finally {
      setEnrollmentsReady(true);
    }
  }, [user?.id]);

  const fetchTasks = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);

      const statsRes = await taskApi.getMenteeTaskStats(user.id, selectedEnrollmentId ?? undefined);
      setStats(statsRes?.data?.stats);

      const params: any = {};
      if (filterStatus !== 'all') params.status = filterStatus;
      if (selectedEnrollmentId) params.enrollmentId = selectedEnrollmentId;

      const tasksRes = await taskApi.getMenteeTasks(user.id, params);
      setTasks(tasksRes.data.tasks || []);
    } catch (err: any) {
      console.error('Failed to fetch tasks:', err);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [user?.id, filterStatus, selectedEnrollmentId]);

  // Load enrollments once on mount
  useEffect(() => {
    if (user?.id) fetchEnrollments();
  }, [user?.id, fetchEnrollments]);

  // Re-fetch tasks when filter or program selection changes — only after enrollments are loaded
  useEffect(() => {
    if (user?.id && enrollmentsReady) fetchTasks();
  }, [user?.id, filterStatus, selectedEnrollmentId, fetchTasks, enrollmentsReady]);

  const handleStartTask = useCallback(async (taskId: string) => {
    try {
      await taskApi.updateTaskStatus(taskId, 'in_progress');
      toast.success('Task started!');
      fetchTasks();
    } catch {
      toast.error('Failed to start task');
    }
  }, [fetchTasks]);

  const filteredTasks = useMemo(() => {
    if (!searchTerm.trim()) return tasks;
    const lower = searchTerm.toLowerCase();
    return tasks.filter(
      (task) =>
        task.roadmapTask?.title?.toLowerCase().includes(lower) ||
        task.roadmapTask?.description?.toLowerCase().includes(lower)
    );
  }, [tasks, searchTerm]);

  return {
    tasks,
    filteredTasks,
    stats,
    loading,
    enrollments,
    selectedEnrollmentId,
    filterStatus,
    searchTerm,
    setSelectedEnrollmentId,
    setFilterStatus,
    setSearchTerm,
    handleStartTask,
    fetchTasks,
  };
}
