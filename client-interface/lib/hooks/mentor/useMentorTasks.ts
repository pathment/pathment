/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { taskApi } from '@/lib/services/task-api';
import { matchingApi } from '@/lib/services/enrollment-api';
import { useAuth } from '@/lib/context/AuthContext';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export type MentorTaskTab = 'pending' | 'extensions' | 'all' | 'roadmap' | 'create';

export interface CustomTaskFormData {
  menteeId: string;
  enrollmentId: string;
  title: string;
  description: string;
  type: string;
  difficulty: string;
  dueDate: string;
  pointsBase: number;
  deliverable: string;
  acceptanceCriteria: string[];
}

const EMPTY_FORM: CustomTaskFormData = {
  menteeId: '',
  enrollmentId: '',
  title: '',
  description: '',
  type: 'custom',
  difficulty: 'medium',
  dueDate: '',
  pointsBase: 10,
  deliverable: '',
  acceptanceCriteria: [],
};

export interface UseMentorTasksReturn {
  // tab
  activeTab: MentorTaskTab;
  handleTabSwitch: (tab: MentorTaskTab) => void;

  // stats
  stats: any;
  statsLoading: boolean;

  // pending
  pendingTasks: any[];
  pendingLoading: boolean;

  // all tasks
  allTasks: any[];
  allTasksLoading: boolean;
  extensionTasks: any[];
  filteredAllTasks: any[];
  searchTerm: string;
  setSearchTerm: (v: string) => void;

  // mentees + level assignments
  mentees: any[];
  menteesLoading: boolean;
  mentorLevelAssignments: any[];
  mentorLevelsLoading: boolean;

  // roadmap
  roadmapData: any;
  selectedProgram: string;
  selectedLevel: string;
  selectedMenteeForAssign: string;
  assigningTask: string | null;
  setAssigningTask: (id: string | null) => void;
  handleProgramChange: (id: string) => void;
  handleLevelChange: (id: string) => void;
  handleMenteeForAssignChange: (id: string) => void;
  handleAssignRoadmapTask: (taskId: string, weekNumber: number) => Promise<void>;

  // create form
  formData: CustomTaskFormData;
  setFormData: React.Dispatch<React.SetStateAction<CustomTaskFormData>>;
  handleMenteeChange: (menteeId: string) => void;
  handleCreateCustomTask: (e: React.FormEvent) => Promise<void>;
  isCreatingTask: boolean;

  // cancel
  cancellingTask: string | null;
  cancelReason: string;
  setCancellingTask: (id: string | null) => void;
  setCancelReason: (v: string) => void;
  handleCancelTask: (taskId: string) => Promise<void>;
}

export function useMentorTasks(): UseMentorTasksReturn {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<MentorTaskTab>('pending');
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);

  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [allTasksLoading, setAllTasksLoading] = useState(false);
  const [allTasksLoaded, setAllTasksLoaded] = useState(false);

  const [mentees, setMentees] = useState<any[]>([]);
  const [menteesLoading, setMenteesLoading] = useState(false);
  const [menteesLoaded, setMenteesLoaded] = useState(false);

  const [mentorLevelAssignments, setMentorLevelAssignments] = useState<any[]>([]);
  const [mentorLevelsLoaded, setMentorLevelsLoaded] = useState(false);
  const [mentorLevelsLoading, setMentorLevelsLoading] = useState(false);

  const [roadmapData, setRoadmapData] = useState<any>(null);
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedMenteeForAssign, setSelectedMenteeForAssign] = useState('');
  const [assigningTask, setAssigningTask] = useState<string | null>(null);

  const [formData, setFormData] = useState<CustomTaskFormData>(EMPTY_FORM);
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const [cancellingTask, setCancellingTask] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // ─── Fetchers ─────────────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    if (!user?.id) return;
    try {
      setStatsLoading(true);
      const res = await taskApi.getMentorTaskStats(user.id);
      setStats(res?.data?.stats);
    } catch {
      // non-critical
    } finally {
      setStatsLoading(false);
    }
  }, [user?.id]);

  const fetchPendingTasks = useCallback(async () => {
    if (!user?.id) return;
    try {
      setPendingLoading(true);
      const res = await taskApi.getMentorTasks(user.id, { pendingReview: true });
      setPendingTasks(res?.data?.tasks || []);
    } catch {
      toast.error('Failed to load pending tasks');
    } finally {
      setPendingLoading(false);
    }
  }, [user?.id]);

  const fetchAllTasks = useCallback(async () => {
    if (!user?.id) return;
    try {
      setAllTasksLoading(true);
      const res = await taskApi.getMentorTasks(user.id);
      setAllTasks(res?.data?.tasks || []);
      setAllTasksLoaded(true);
    } catch {
      toast.error('Failed to load tasks');
    } finally {
      setAllTasksLoading(false);
    }
  }, [user?.id]);

  const fetchMentees = useCallback(async (): Promise<any[]> => {
    if (!user?.id) return [];
    try {
      setMenteesLoading(true);
      const res = await matchingApi.getMatches({ mentorId: user.id, status: 'active' });
      const list = res?.data?.matches || res?.matches || [];
      setMentees(list);
      setMenteesLoaded(true);
      return list;
    } catch {
      toast.error('Failed to load mentees');
      return [];
    } finally {
      setMenteesLoading(false);
    }
  }, [user?.id]);

  const fetchMentorLevelAssignments = useCallback(async (): Promise<any[]> => {
    try {
      setMentorLevelsLoading(true);
      const res = await matchingApi.getMentorAssignedLevels();
      const list = res?.data?.programs || [];
      setMentorLevelAssignments(list);
      setMentorLevelsLoaded(true);
      return list;
    } catch {
      toast.error('Failed to load assigned levels');
      return [];
    } finally {
      setMentorLevelsLoading(false);
    }
  }, []);

  const fetchRoadmap = useCallback(async (programId: string, levelId: string, menteeId?: string) => {
    try {
      const res = await taskApi.getRoadmapTasks(programId, levelId, menteeId);
      setRoadmapData(res.data.roadmap);
    } catch {
      toast.error('Failed to load roadmap');
    }
  }, []);

  // ─── Initial boot ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.id) return;

    const paramTab = searchParams.get('tab') as MentorTaskTab | null;
    const paramMenteeId = searchParams.get('menteeId');
    const paramProgramId = searchParams.get('programId');

    const needsMentees = paramTab === 'create' || paramTab === 'roadmap' || !!paramMenteeId;
    const needsAllTasks = paramTab === 'all' || paramTab === 'extensions';

    fetchStats();
    fetchPendingTasks();

    if (needsMentees) {
      fetchMentorLevelAssignments();
      fetchMentees().then((list) => {
        if (paramMenteeId && list.length > 0) {
          const match = list.find((m: any) => m.menteeId === paramMenteeId);
          if (match) {
            const programId = paramProgramId || match.enrollment?.programId || '';
            const levelId = match.levelId || '';
            setFormData((prev) => ({
              ...prev,
              menteeId: paramMenteeId,
              enrollmentId: match.enrollmentId || '',
            }));
            setSelectedMenteeForAssign(paramMenteeId);
            if (programId) setSelectedProgram(programId);
            if (levelId) setSelectedLevel(levelId);
            if (programId && levelId) fetchRoadmap(programId, levelId, paramMenteeId);
          }
        }
        if (paramTab) setActiveTab(paramTab);
        else if (paramMenteeId) setActiveTab('create');
      });
    }

    if (needsAllTasks) {
      fetchAllTasks();
      if (paramTab) setActiveTab(paramTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ─── Tab switch ───────────────────────────────────────────────────────────

  const handleTabSwitch = useCallback(
    (tab: MentorTaskTab) => {
      setActiveTab(tab);
      if ((tab === 'all' || tab === 'extensions') && !allTasksLoaded && !allTasksLoading) {
        fetchAllTasks();
      }
      if ((tab === 'roadmap' || tab === 'create') && !menteesLoaded && !menteesLoading) {
        fetchMentees();
      }
      if ((tab === 'roadmap' || tab === 'create') && !mentorLevelsLoaded && !mentorLevelsLoading) {
        fetchMentorLevelAssignments();
      }
    },
    [
      allTasksLoaded,
      allTasksLoading,
      fetchAllTasks,
      menteesLoaded,
      menteesLoading,
      fetchMentees,
      mentorLevelsLoaded,
      mentorLevelsLoading,
      fetchMentorLevelAssignments,
    ]
  );

  // ─── Derived ──────────────────────────────────────────────────────────────

  const extensionTasks = useMemo(
    () =>
      allTasks.filter((task) =>
        task.submissions?.some((s: any) => s.extensionRequested && s.extensionStatus === 'pending')
      ),
    [allTasks]
  );

  const filteredAllTasks = useMemo(() => {
    if (!searchTerm) return allTasks;
    const q = searchTerm.toLowerCase();
    return allTasks.filter(
      (task) =>
        task.roadmapTask?.title?.toLowerCase().includes(q) ||
        task.mentee?.firstName?.toLowerCase().includes(q) ||
        task.mentee?.lastName?.toLowerCase().includes(q)
    );
  }, [allTasks, searchTerm]);

  // ─── Mutations ────────────────────────────────────────────────────────────

  const handleAssignRoadmapTask = useCallback(
    async (taskId: string, weekNumber: number) => {
      if (!selectedMenteeForAssign) {
        toast.error('Please select a mentee first');
        return;
      }
      try {
        const match = mentees.find((m) => m.menteeId === selectedMenteeForAssign);
        if (!match) return;
        await taskApi.createCustomTask({
          menteeId: selectedMenteeForAssign,
          enrollmentId: match.enrollmentId,
          title: `Week ${weekNumber} - Roadmap Task`,
          description: 'Assigned from roadmap',
          roadmapTaskId: taskId,
        } as any);
        toast.success('Roadmap task assigned successfully!');
        setAssigningTask(null);
        if (selectedProgram && selectedLevel)
          fetchRoadmap(selectedProgram, selectedLevel, selectedMenteeForAssign);
        setAllTasksLoaded(false);
      } catch (error: any) {
        toast.error(extractApiErrorMessage(error, 'Failed to assign task'));
      }
    },
    [selectedMenteeForAssign, mentees, selectedProgram, selectedLevel, fetchRoadmap]
  );

  const handleCreateCustomTask = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isCreatingTask) return;
      if (!formData.menteeId || !formData.title || !formData.description) {
        toast.error('Please fill in all required fields');
        return;
      }
      try {
        setIsCreatingTask(true);
        await taskApi.createCustomTask(formData);
        toast.success('Custom task created successfully!');
        setFormData(EMPTY_FORM);
        fetchStats();
        fetchPendingTasks();
        setAllTasksLoaded(false);
        setActiveTab('all');
        fetchAllTasks();
      } catch (error: any) {
        toast.error(extractApiErrorMessage(error, 'Failed to create custom task'));
      } finally {
        setIsCreatingTask(false);
      }
    },
    [formData, isCreatingTask, fetchStats, fetchPendingTasks, fetchAllTasks]
  );

  const handleCancelTask = useCallback(
    async (taskId: string) => {
      if (!cancelReason.trim()) {
        toast.error('Please provide a reason for cancellation');
        return;
      }
      try {
        await taskApi.cancelTask(taskId, cancelReason);
        toast.success('Task cancelled successfully');
        setCancellingTask(null);
        setCancelReason('');
        fetchStats();
        fetchPendingTasks();
        if (allTasksLoaded) fetchAllTasks();
      } catch (error: any) {
        toast.error(extractApiErrorMessage(error, 'Failed to cancel task'));
      }
    },
    [cancelReason, fetchStats, fetchPendingTasks, allTasksLoaded, fetchAllTasks]
  );

  const handleMenteeChange = useCallback(
    (menteeId: string) => {
      const match = mentees.find((m) => m.menteeId === menteeId);
      setFormData((prev) => ({ ...prev, menteeId, enrollmentId: match?.enrollmentId || '' }));
    },
    [mentees]
  );

  const handleProgramChange = useCallback((programId: string) => {
    setSelectedProgram(programId);
    setSelectedLevel('');
    setSelectedMenteeForAssign('');
    setRoadmapData(null);
  }, []);

  const handleLevelChange = useCallback((levelId: string) => {
    setSelectedLevel(levelId);
    setSelectedMenteeForAssign('');
    setRoadmapData(null);
  }, []);

  const handleMenteeForAssignChange = useCallback(
    (menteeId: string) => {
      setSelectedMenteeForAssign(menteeId);
      if (selectedProgram && selectedLevel) fetchRoadmap(selectedProgram, selectedLevel, menteeId);
    },
    [selectedProgram, selectedLevel, fetchRoadmap]
  );

  return {
    activeTab,
    handleTabSwitch,
    stats,
    statsLoading,
    pendingTasks,
    pendingLoading,
    allTasks,
    allTasksLoading,
    extensionTasks,
    filteredAllTasks,
    searchTerm,
    setSearchTerm,
    mentees,
    menteesLoading,
    mentorLevelAssignments,
    mentorLevelsLoading,
    roadmapData,
    selectedProgram,
    selectedLevel,
    selectedMenteeForAssign,
    assigningTask,
    setAssigningTask,
    handleProgramChange,
    handleLevelChange,
    handleMenteeForAssignChange,
    handleAssignRoadmapTask,
    formData,
    setFormData,
    handleMenteeChange,
    handleCreateCustomTask,
    isCreatingTask,
    cancellingTask,
    cancelReason,
    setCancellingTask,
    setCancelReason,
    handleCancelTask,
  };
}
