/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useCallback, useMemo } from 'react';
import { taskApi } from '@/lib/services/task-api';
import { enrollmentApi } from '@/lib/services/enrollment-api';
import { toast } from 'sonner';
import { qk, useApiQuery } from '@/lib/query';
import { useAuth } from '@/lib/context/AuthContext';
import { useClan } from '@/lib/context/ClanContext';

export type TaskView = 'active' | 'completed';

export interface UseMenteeTasksReturn {
  tasks: any[];
  filteredTasks: any[];
  stats: any;
  loading: boolean;
  enrollments: any[];
  selectedEnrollmentId: string | null;
  filterStatus: string;
  searchTerm: string;
  view: TaskView;
  activeCount: number;
  completedCount: number;
  setSelectedEnrollmentId: (id: string | null) => void;
  setFilterStatus: (status: string) => void;
  setSearchTerm: (term: string) => void;
  setView: (view: TaskView) => void;
  handleStartTask: (taskId: string) => Promise<void>;
  fetchTasks: () => Promise<void>;
}

const NO_TASKS: any[] = [];
const NO_ENROLLMENTS: any[] = [];

export function useMenteeTasks(): UseMenteeTasksReturn {
  const { user } = useAuth();
  const { menteeActiveClanId } = useClan();
  const menteeId = user?.id ?? '';

  const [enrollmentOverride, setSelectedEnrollmentId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<TaskView>('active');

  // Same key as useMenteeDashboard — one cached answer serves both screens.
  const enrollmentsQuery = useApiQuery<any[]>({
    queryKey: qk.me.enrollments(menteeId),
    queryFn: async () => {
      const res = await enrollmentApi.getAll({ menteeId });
      return res?.data?.enrollments || [];
    },
    enabled: !!menteeId,
  });

  const enrollments = enrollmentsQuery.data ?? NO_ENROLLMENTS;
  const enrollmentsReady = !enrollmentsQuery.loading;

  // Default to the first active enrollment; an explicit pick wins. Derived
  // rather than synced into state, so there is no effect to fall out of step.
  const defaultEnrollmentId = useMemo(() => {
    const active = enrollments.find((e: any) => ['active', 'matched'].includes(e.status)) || enrollments[0];
    return active?.id ?? null;
  }, [enrollments]);
  const selectedEnrollmentId = enrollmentOverride ?? defaultEnrollmentId;

  const statsQuery = useApiQuery<any>({
    queryKey: qk.me.taskStats(selectedEnrollmentId, menteeActiveClanId),
    queryFn: async () => (await taskApi.getMenteeTaskStats(menteeId, selectedEnrollmentId ?? undefined))?.data?.stats,
    enabled: !!menteeId && enrollmentsReady,
  });

  const tasksQuery = useApiQuery<any[]>({
    queryKey: qk.me.tasks({ menteeId, filterStatus, enrollmentId: selectedEnrollmentId, clanId: menteeActiveClanId }),
    queryFn: async () => {
      const params: any = {};
      if (filterStatus !== 'all') params.status = filterStatus;
      if (selectedEnrollmentId) params.enrollmentId = selectedEnrollmentId;
      const tasksRes = await taskApi.getMenteeTasks(menteeId, params);
      return tasksRes.data.tasks || [];
    },
    enabled: !!menteeId && enrollmentsReady,
    errorMessage: 'Failed to load tasks',
  });

  const tasks = tasksQuery.data ?? NO_TASKS;
  const stats = statsQuery.data ?? null;
  const loading = tasksQuery.loading;
  const fetchTasks = tasksQuery.refetch;

  const handleStartTask = useCallback(async (taskId: string) => {
    try {
      await taskApi.updateTaskStatus(taskId, 'in_progress');
      toast.success('Task started!');
      fetchTasks();
    } catch {
      toast.error('Failed to start task');
    }
  }, [fetchTasks]);

  const changeView = useCallback((next: TaskView) => {
    setView(next);
    // A completed/active split is meaningless if a conflicting status filter is
    // still applied, so clear it whenever the view flips.
    setFilterStatus('all');
  }, []);

  const isActiveStatus = (status: string) =>
    ['assigned', 'in_progress', 'submitted', 'revision_needed'].includes(status);

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (view === 'completed') {
      list = list.filter((task) => task.status === 'completed');
    } else {
      list = list.filter((task) => isActiveStatus(task.status));
    }
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      list = list.filter(
        (task) =>
          task.roadmapTask?.title?.toLowerCase().includes(lower) ||
          task.roadmapTask?.description?.toLowerCase().includes(lower)
      );
    }
    // Active view: actionable, due-soonest tasks first (overdue > due date > none).
    if (view === 'active') {
      list = [...list].sort((a: any, b: any) => {
        const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return aDate - bDate;
      });
    }
    return list;
  }, [tasks, view, searchTerm]);

  const activeCount = useMemo(
    () => tasks.filter((task) => isActiveStatus(task.status)).length,
    [tasks]
  );
  const completedCount = useMemo(
    () => tasks.filter((task) => task.status === 'completed').length,
    [tasks]
  );

  return {
    tasks,
    filteredTasks,
    stats,
    loading,
    enrollments,
    selectedEnrollmentId,
    filterStatus,
    searchTerm,
    view,
    activeCount,
    completedCount,
    setSelectedEnrollmentId,
    setFilterStatus,
    setSearchTerm,
    setView: changeView,
    handleStartTask,
    fetchTasks,
  };
}
