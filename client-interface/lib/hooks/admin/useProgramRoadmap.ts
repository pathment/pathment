'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { programManagementApi } from '@/lib/services/program-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export interface RoadmapWeekTask {
  id: string;
  title: string;
  description: string;
  deliverable: string;
  taskOrder: number;
  type: string;
  difficulty: string;
  resources?: unknown[];
}

export interface RoadmapWeek {
  id: string;
  week: number;
  title: string;
  objectives: string[];
  tasks: RoadmapWeekTask[];
}

export interface ProgramRoadmapLevel {
  id: string;
  name: string;
  durationWeeks: number;
  description?: string;
}

export interface TaskForm {
  title: string;
  description: string;
  deliverable: string;
  taskOrder: number;
  type: string;
  difficulty: string;
  weekId: string;
}

export interface WeekForm {
  title: string;
  objectives: string[];
  objectiveInput: string;
}

export interface TaskModalState {
  mode: 'add' | 'edit';
  weekId: string;
  weekNumber: number;
  task?: RoadmapWeekTask;
}

export interface WeekModalState {
  mode: 'add' | 'edit';
  week?: RoadmapWeek;
}

interface GenerateConfirmState {
  isOpen: boolean;
  hasExistingRoadmap: boolean;
}

interface UseProgramRoadmapReturn {
  id: string;
  isGenerating: boolean;
  loading: boolean;
  roadmap: RoadmapWeek[];
  roadmapId: string;
  levels: ProgramRoadmapLevel[];
  selectedLevelId: string;
  selectedLevel: ProgramRoadmapLevel | undefined;
  editingWeek: number | null;
  taskModal: TaskModalState | null;
  taskForm: TaskForm;
  savingTask: boolean;
  weekModal: WeekModalState | null;
  weekForm: WeekForm;
  savingWeek: boolean;
  generateConfirmModal: GenerateConfirmState;
  setSelectedLevelId: (id: string) => void;
  setEditingWeek: (week: number | null) => void;
  setTaskModal: (modal: TaskModalState | null) => void;
  setTaskForm: React.Dispatch<React.SetStateAction<TaskForm>>;
  setWeekModal: (modal: WeekModalState | null) => void;
  setWeekForm: React.Dispatch<React.SetStateAction<WeekForm>>;
  handleLevelChange: (levelId: string) => void;
  handleGenerateRoadmap: () => void;
  confirmGenerateRoadmap: () => Promise<void>;
  cancelGenerateRoadmap: () => void;
  openAddWeekModal: () => void;
  openEditWeek: (week: RoadmapWeek) => void;
  handleSaveWeek: () => Promise<void>;
  openAddTask: (weekId: string, weekNumber: number, taskCount: number) => void;
  openEditTask: (task: RoadmapWeekTask, weekId: string, weekNumber: number) => void;
  handleSaveTask: () => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  deleteWeek: (weekId: string) => Promise<void>;
}

export function useProgramRoadmap(): UseProgramRoadmapReturn {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params?.id as string;
  const levelParam = searchParams.get('level');

  const [isGenerating, setIsGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [roadmap, setRoadmap] = useState<RoadmapWeek[]>([]);
  const [roadmapId, setRoadmapId] = useState('');
  const [levels, setLevels] = useState<ProgramRoadmapLevel[]>([]);
  const [selectedLevelId, setSelectedLevelIdRaw] = useState<string>(levelParam || '');
  const [editingWeek, setEditingWeek] = useState<number | null>(null);
  const [taskModal, setTaskModal] = useState<TaskModalState | null>(null);
  const [taskForm, setTaskForm] = useState<TaskForm>({
    title: '', description: '', deliverable: '', taskOrder: 1, type: 'exercise', difficulty: 'medium', weekId: '',
  });
  const [savingTask, setSavingTask] = useState(false);
  const [weekModal, setWeekModal] = useState<WeekModalState | null>(null);
  const [weekForm, setWeekForm] = useState<WeekForm>({ title: '', objectives: [], objectiveInput: '' });
  const [savingWeek, setSavingWeek] = useState(false);
  const [generateConfirmModal, setGenerateConfirmModal] = useState<GenerateConfirmState>({
    isOpen: false,
    hasExistingRoadmap: false,
  });

  const fetchRoadmap = useCallback(async (levelId?: string) => {
    const lvlId = levelId ?? selectedLevelId;
    if (!lvlId) return;
    try {
      setLoading(true);
      const response = (await programManagementApi.roadmaps.getByLevel(id, lvlId)) as {
        data?: { roadmap?: { id: string; weeks?: Array<{ id: string; weekNumber: number; title: string; objectives?: string[]; tasks?: Array<{ id: string; title: string; description: string; deliverable?: string; taskOrder?: number; type?: string; difficulty?: string; resources?: unknown[] }> }> } };
        roadmap?: { id: string; weeks?: Array<{ id: string; weekNumber: number; title: string; objectives?: string[]; tasks?: Array<{ id: string; title: string; description: string; deliverable?: string; taskOrder?: number; type?: string; difficulty?: string; resources?: unknown[] }> }> };
      };
      const roadmapData = response?.data?.roadmap ?? response?.roadmap;
      if (roadmapData?.weeks) {
        setRoadmapId(roadmapData.id);
        setRoadmap(
          roadmapData.weeks.map((w) => ({
            id: w.id,
            week: w.weekNumber,
            title: w.title,
            objectives: w.objectives ?? [],
            tasks: (w.tasks ?? []).map((t) => ({
              id: t.id,
              title: t.title,
              description: t.description,
              deliverable: t.deliverable ?? '',
              taskOrder: t.taskOrder ?? 1,
              type: t.type ?? 'exercise',
              difficulty: t.difficulty ?? 'medium',
              resources: t.resources ?? [],
            })),
          }))
        );
      } else {
        setRoadmapId('');
        setRoadmap([]);
      }
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } };
      if (e.response?.status !== 404) {
        console.error('Failed to fetch roadmap:', e);
        toast.error('Failed to load roadmap');
      }
      setRoadmapId('');
      setRoadmap([]);
    } finally {
      setLoading(false);
    }
  }, [id, selectedLevelId]);

  const fetchLevels = useCallback(async () => {
    try {
      const response = (await programManagementApi.levels.getByProgram(id)) as {
        data?: { levels?: ProgramRoadmapLevel[] };
        levels?: ProgramRoadmapLevel[];
      } | ProgramRoadmapLevel[];
      const list: ProgramRoadmapLevel[] = Array.isArray(response)
        ? response
        : ((response as { data?: { levels?: ProgramRoadmapLevel[] }; levels?: ProgramRoadmapLevel[] })?.data?.levels
            ?? (response as { data?: { levels?: ProgramRoadmapLevel[] }; levels?: ProgramRoadmapLevel[] })?.levels
            ?? []);
      setLevels(list);
      if (!selectedLevelId && list.length > 0) {
        const defaultId = levelParam || list[0].id;
        setSelectedLevelIdRaw(defaultId);
      }
    } catch (err: unknown) {
      console.error('Failed to fetch levels:', err);
      toast.error('Failed to load levels');
    }
  }, [id, levelParam, selectedLevelId]);

  useEffect(() => {
    if (id) fetchLevels();
  }, [id, fetchLevels]);

  useEffect(() => {
    if (selectedLevelId) fetchRoadmap(selectedLevelId);
  }, [selectedLevelId, fetchRoadmap]);

  const handleLevelChange = useCallback((levelId: string) => {
    setSelectedLevelIdRaw(levelId);
    router.push(`/admin/programs/${id}/roadmap?level=${levelId}`);
  }, [id, router]);

  const handleGenerateRoadmap = useCallback(() => {
    if (!selectedLevelId) { 
      toast.error('Please select a level first'); 
      return; 
    }
    setGenerateConfirmModal({
      isOpen: true,
      hasExistingRoadmap: roadmap.length > 0,
    });
  }, [selectedLevelId, roadmap.length]);

  const confirmGenerateRoadmap = useCallback(async () => {
    try {
      setIsGenerating(true);
      const response = (await programManagementApi.roadmaps.generate(
        id, selectedLevelId,
        'Generate a comprehensive roadmap with practical tasks and learning objectives'
      )) as { data?: { roadmap?: { id: string; weeks?: unknown[] } }; roadmap?: { id: string; weeks?: unknown[] } };
      const newRoadmap = response?.data?.roadmap ?? response?.roadmap;
      if (newRoadmap?.weeks) {
        await fetchRoadmap(selectedLevelId);
        toast.success('Roadmap generated successfully!');
      }
    } catch (err: unknown) {
      console.error('Failed to generate roadmap:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to generate roadmap'));
    } finally {
      setIsGenerating(false);
      setGenerateConfirmModal({ isOpen: false, hasExistingRoadmap: false });
    }
  }, [id, selectedLevelId, fetchRoadmap]);

  const cancelGenerateRoadmap = useCallback(() => {
    setGenerateConfirmModal({ isOpen: false, hasExistingRoadmap: false });
  }, []);

  const openAddWeekModal = useCallback(() => {
    if (!roadmapId) { toast.error('Roadmap not found. Please generate a roadmap first.'); return; }
    setWeekForm({ title: `Week ${roadmap.length + 1}`, objectives: [], objectiveInput: '' });
    setWeekModal({ mode: 'add' });
  }, [roadmapId, roadmap.length]);

  const openEditWeek = useCallback((week: RoadmapWeek) => {
    setWeekForm({ title: week.title, objectives: [...(week.objectives ?? [])], objectiveInput: '' });
    setWeekModal({ mode: 'edit', week });
  }, []);

  const handleSaveWeek = useCallback(async () => {
    if (!weekForm.title.trim()) { toast.error('Week title is required'); return; }
    setSavingWeek(true);
    try {
      const payload = { title: weekForm.title.trim(), objectives: weekForm.objectives };
      if (weekModal?.mode === 'add') {
        await programManagementApi.roadmaps.addWeek(roadmapId, { weekNumber: roadmap.length + 1, ...payload });
        toast.success('Week added successfully');
      } else if (weekModal?.mode === 'edit' && weekModal.week?.id) {
        await programManagementApi.roadmaps.updateWeek(weekModal.week.id, payload);
        toast.success('Week updated successfully');
      }
      setWeekModal(null);
      await fetchRoadmap(selectedLevelId);
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, 'Failed to save week'));
    } finally {
      setSavingWeek(false);
    }
  }, [weekForm, weekModal, roadmapId, roadmap.length, fetchRoadmap, selectedLevelId]);

  const openAddTask = useCallback((weekId: string, weekNumber: number, taskCount: number) => {
    setTaskForm({ title: '', description: '', deliverable: '', taskOrder: taskCount + 1, type: 'exercise', difficulty: 'medium', weekId });
    setTaskModal({ mode: 'add', weekId, weekNumber });
  }, []);

  const openEditTask = useCallback((task: RoadmapWeekTask, weekId: string, weekNumber: number) => {
    setTaskForm({
      title: task.title, description: task.description, deliverable: task.deliverable ?? '',
      taskOrder: task.taskOrder ?? 1, type: task.type ?? 'exercise', difficulty: task.difficulty ?? 'medium', weekId,
    });
    setTaskModal({ mode: 'edit', weekId, weekNumber, task });
  }, []);

  const handleSaveTask = useCallback(async () => {
    if (!taskForm.title.trim() || !taskForm.description.trim() || !taskForm.deliverable.trim()) {
      toast.error('Title, description and deliverable are required'); return;
    }
    setSavingTask(true);
    try {
      const payload = {
        title: taskForm.title.trim(), description: taskForm.description.trim(),
        deliverable: taskForm.deliverable.trim(), taskOrder: taskForm.taskOrder,
        type: taskForm.type, difficulty: taskForm.difficulty,
      };
      if (taskModal?.mode === 'add') {
        await programManagementApi.roadmaps.addTask(taskForm.weekId, payload);
        toast.success('Task added successfully');
      } else if (taskModal?.mode === 'edit' && taskModal.task) {
        const updatePayload: Record<string, unknown> = { ...payload };
        if (taskForm.weekId !== taskModal.weekId) updatePayload.roadmapWeekId = taskForm.weekId;
        await programManagementApi.roadmaps.updateTask(taskModal.task.id, updatePayload);
        toast.success('Task updated successfully');
      }
      setTaskModal(null);
      await fetchRoadmap(selectedLevelId);
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, 'Failed to save task'));
    } finally {
      setSavingTask(false);
    }
  }, [taskForm, taskModal, fetchRoadmap, selectedLevelId]);

  const deleteTask = useCallback(async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await programManagementApi.roadmaps.deleteTask(taskId);
      toast.success('Task deleted successfully');
      await fetchRoadmap(selectedLevelId);
    } catch (err: unknown) {
      console.error('Failed to delete task:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to delete task'));
    }
  }, [fetchRoadmap, selectedLevelId]);

  const deleteWeek = useCallback(async (weekId: string) => {
    if (!confirm('Are you sure you want to delete this week and all its tasks?')) return;
    try {
      await programManagementApi.roadmaps.deleteWeek(weekId);
      toast.success('Week deleted successfully');
      await fetchRoadmap(selectedLevelId);
    } catch (err: unknown) {
      console.error('Failed to delete week:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to delete week'));
    }
  }, [fetchRoadmap, selectedLevelId]);

  const selectedLevel = levels.find((l) => l.id === selectedLevelId);

  return {
    id, isGenerating, loading, roadmap, roadmapId, levels, selectedLevelId, selectedLevel,
    editingWeek, taskModal, taskForm, savingTask, weekModal, weekForm, savingWeek,
    generateConfirmModal,
    setSelectedLevelId: setSelectedLevelIdRaw, setEditingWeek, setTaskModal, setTaskForm,
    setWeekModal, setWeekForm, handleLevelChange, handleGenerateRoadmap, confirmGenerateRoadmap,
    cancelGenerateRoadmap, openAddWeekModal, openEditWeek, handleSaveWeek, openAddTask, openEditTask, 
    handleSaveTask, deleteTask, deleteWeek,
  };
}
