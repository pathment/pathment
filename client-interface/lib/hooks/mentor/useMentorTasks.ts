/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { taskApi } from '@/lib/services/task-api';
import { matchingApi } from '@/lib/services/enrollment-api';
import { useAuth } from '@/lib/context/AuthContext';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export type MentorTaskTab = 'pending' | 'extensions' | 'all' | 'roadmap' | 'create' | 'templates';

export interface CustomTaskFormData {
  mentees: { menteeId: string; enrollmentId: string }[];
  title: string;
  description: string;
  type: string;
  difficulty: string;
  dueDate: string;
  pointsBase: number;
  estimatedHours: number;
  deliverable: string;
  acceptanceCriteria: string[];
}

const EMPTY_FORM: CustomTaskFormData = {
  mentees: [],
  title: '',
  description: '',
  type: 'custom',
  difficulty: 'medium',
  dueDate: '',
  pointsBase: 10,
  estimatedHours: 2,
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
  handleMenteeChange: (menteeIds: string[]) => void;
  handleCreateCustomTask: (e: React.FormEvent) => Promise<void>;
  handleSaveAndAssign: (e: React.FormEvent) => Promise<void>;
  handleSaveTemplateOnly: (e: React.FormEvent) => Promise<void>;

  // cancel
  cancellingTask: string | null;
  cancelReason: string;
  setCancellingTask: (id: string | null) => void;
  setCancelReason: (v: string) => void;

  // templates
  templates: any[];
  templatesLoading: boolean;
  fetchTemplates: () => Promise<void>;
  handleCreateTemplate: (data: any) => Promise<void>;
  handleUpdateTemplate: (id: string, data: any) => Promise<void>;
  handleDeleteTemplate: (id: string) => Promise<void>;
  handleAssignTemplate: (templateId: string, menteesData: { menteeId: string; enrollmentId: string }[], dueDate?: string) => Promise<void>;
  handleCancelTask: (taskId: string) => Promise<void>;
}

export function useMentorTasks(): UseMentorTasksReturn {
  const { user } = useAuth();
  const userId = user?.id;
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

  const [templates, setTemplates] = useState<any[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  // ─── Fetchers ─────────────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    if (!userId) return;
    try {
      setStatsLoading(true);
      const res = await taskApi.getMentorTaskStats(userId);
      setStats(res?.data?.stats);
    } catch {
      // non-critical
    } finally {
      setStatsLoading(false);
    }
  }, [userId]);

  const fetchPendingTasks = useCallback(async () => {
    if (!userId) return;
    try {
      setPendingLoading(true);
      const res = await taskApi.getMentorTasks(userId, { pendingReview: true });
      setPendingTasks(res?.data?.tasks || []);
    } catch {
      toast.error('Failed to load pending tasks');
    } finally {
      setPendingLoading(false);
    }
  }, [userId]);

  const fetchAllTasks = useCallback(async () => {
    if (!userId) return;
    try {
      setAllTasksLoading(true);
      const res = await taskApi.getMentorTasks(userId);
      setAllTasks(res?.data?.tasks || []);
      setAllTasksLoaded(true);
    } catch {
      toast.error('Failed to load tasks');
    } finally {
      setAllTasksLoading(false);
    }
  }, [userId]);

  const fetchMentees = useCallback(async (): Promise<any[]> => {
    if (!userId) return [];
    try {
      setMenteesLoading(true);
      const res = await matchingApi.getMatches({ mentorId: userId, status: 'active' });
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
  }, [userId]);

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

  const fetchTemplates = useCallback(async () => {
    try {
      setTemplatesLoading(true);
      const res = await taskApi.getTemplates();
      setTemplates(res?.data?.templates || []);
      setTemplatesLoaded(true);
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  // ─── Initial boot ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userId) return;

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
              mentees: [{ menteeId: paramMenteeId, enrollmentId: match.enrollmentId || '' }],
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
  }, [userId]);

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
      if (tab === 'templates' && !templatesLoaded && !templatesLoading) {
        fetchTemplates();
        if (!menteesLoaded && !menteesLoading) fetchMentees();
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
      templatesLoaded,
      templatesLoading,
      fetchTemplates,
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
      if (formData.mentees.length === 0 || !formData.title || !formData.description) {
        toast.error('Please fill in all required fields and select at least one mentee');
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

  const handleCreateTemplate = useCallback(async (data: any) => {
    try {
      await taskApi.createTemplate(data);
      toast.success('Template saved');
      fetchTemplates();
    } catch (error: any) {
      toast.error(extractApiErrorMessage(error, 'Failed to save template'));
    }
  }, [fetchTemplates]);

  const handleUpdateTemplate = useCallback(async (id: string, data: any) => {
    try {
      await taskApi.updateTemplate(id, data);
      toast.success('Template updated');
      fetchTemplates();
    } catch (error: any) {
      toast.error(extractApiErrorMessage(error, 'Failed to update template'));
    }
  }, [fetchTemplates]);

  const handleDeleteTemplate = useCallback(async (id: string) => {
    try {
      await taskApi.deleteTemplate(id);
      toast.success('Template deleted');
      fetchTemplates();
    } catch (error: any) {
      toast.error(extractApiErrorMessage(error, 'Failed to delete template'));
    }
  }, [fetchTemplates]);

  const handleAssignTemplate = useCallback(async (templateId: string, menteesData: { menteeId: string, enrollmentId: string }[], dueDate?: string) => {
    try {
      await taskApi.assignTemplate(templateId, { mentees: menteesData, dueDate });
      toast.success('Template assigned to mentees');
      fetchStats();
      setAllTasksLoaded(false);
    } catch (error: any) {
      toast.error(extractApiErrorMessage(error, 'Failed to assign template'));
    }
  }, [fetchStats]);

  const handleSaveAndAssign = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (formData.mentees.length === 0 || !formData.title || !formData.description) {
        toast.error('Please fill in all required fields and select at least one mentee');
        return;
      }
      try {
        const templatePayload = {
          title: formData.title,
          description: formData.description,
          type: formData.type,
          difficulty: formData.difficulty,
          deliverable: formData.deliverable,
          acceptanceCriteria: formData.acceptanceCriteria,
          pointsBase: formData.pointsBase,
          estimatedHours: formData.estimatedHours,
        };
        await taskApi.createTemplate(templatePayload);

        await taskApi.createCustomTask(formData);
        toast.success('Task assigned and saved as template');
        setFormData(EMPTY_FORM);
        fetchStats();
        fetchPendingTasks();
        setAllTasksLoaded(false);
        setTemplatesLoaded(false);
        setActiveTab('all');
        fetchAllTasks();
      } catch (error: any) {
        toast.error(extractApiErrorMessage(error, 'Failed to save and assign'));
      }
    },
    [formData, fetchStats, fetchPendingTasks, fetchAllTasks]
  );

  const handleSaveTemplateOnly = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.title || !formData.description) {
        toast.error('Please provide a title and description to save as a template');
        return;
      }
      
      const templatePayload = {
        title: formData.title,
        description: formData.description,
        type: formData.type,
        difficulty: formData.difficulty,
        deliverable: formData.deliverable,
        acceptanceCriteria: formData.acceptanceCriteria,
        pointsBase: formData.pointsBase,
        estimatedHours: formData.estimatedHours,
      };

      try {
        await taskApi.createTemplate(templatePayload);


        toast.success('Template saved successfully');
        setFormData(EMPTY_FORM);
        setTemplatesLoaded(false);
        setActiveTab('templates');
      } catch (error: any) {
        toast.error(extractApiErrorMessage(error, 'Failed to save template'));
      }
    },
    [formData]
  );

  const handleMenteeChange = useCallback(
    (menteeIds: string[]) => {
      const selectedMentees = menteeIds.map(id => {
        const match = mentees.find((m) => m.menteeId === id);
        return {
          menteeId: id,
          enrollmentId: match?.enrollmentId || ''
        };
      });
      setFormData((prev) => ({ ...prev, mentees: selectedMentees }));
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
    handleSaveAndAssign,
    handleSaveTemplateOnly,
    cancellingTask,
    cancelReason,
    setCancellingTask,
    setCancelReason,
    handleCancelTask,
    templates,
    templatesLoading,
    fetchTemplates,
    handleCreateTemplate,
    handleUpdateTemplate,
    handleDeleteTemplate,
    handleAssignTemplate,
  };
}
