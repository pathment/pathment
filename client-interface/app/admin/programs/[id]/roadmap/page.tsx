'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Sparkles,
  Plus,
  Edit2,
  Trash2,
  Save,
  RotateCw,
  BookOpen,
  Link as LinkIcon,
  GripVertical,
  Loader2
} from 'lucide-react';
import { programManagementApi } from '@/lib/services/program-api';
import { toast } from 'sonner';

export default function RoadmapGenerator() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params?.id as string;
  const levelParam = searchParams.get('level');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [roadmap, setRoadmap] = useState<any[]>([]);
  const [roadmapId, setRoadmapId] = useState<string>('');
  const [levels, setLevels] = useState<any[]>([]);
  const [selectedLevelId, setSelectedLevelId] = useState<string>(levelParam || '');
  const [editingWeek, setEditingWeek] = useState<number | null>(null);

  useEffect(() => {
    if (id) {
      fetchLevels();
    }
  }, [id]);

  useEffect(() => {
    if (selectedLevelId) {
      fetchRoadmap();
    }
  }, [selectedLevelId]);

  const fetchLevels = async () => {
    try {
      const response = await programManagementApi.levels.getByProgram(id);
      const levelsList = response?.data?.levels || response?.levels || response || [];
      const levelsArray = Array.isArray(levelsList) ? levelsList : [];
      setLevels(levelsArray);
      
      // Use URL param if available, otherwise use first level
      if (!selectedLevelId && levelsArray.length > 0) {
        setSelectedLevelId(levelParam || levelsArray[0].id);
      }
    } catch (error: any) {
      console.error('Failed to fetch levels:', error);
      toast.error('Failed to load levels');
    }
  };

  const fetchRoadmap = async () => {
    if (!selectedLevelId) return;
    
    try {
      setLoading(true);
      const response = await programManagementApi.roadmaps.getByLevel(id, selectedLevelId);
      const roadmapData = response?.data?.roadmap || response?.roadmap || response;
      
      if (roadmapData?.weeks) {
        setRoadmapId(roadmapData.id);
        const formattedWeeks = roadmapData.weeks.map((week: any) => ({
          id: week.id,
          week: week.weekNumber,
          title: week.title,
          objectives: week.objectives || [],
          tasks: (week.tasks || []).map((task: any) => ({
            id: task.id,
            title: task.title,
            description: task.description,
            resources: task.resources || []
          }))
        }));
        setRoadmap(formattedWeeks);
      } else {
        setRoadmapId('');
        setRoadmap([]);
      }
    } catch (error: any) {
      // 404 is expected when no roadmap exists for this level
      if (error.response?.status === 404) {
        setRoadmapId('');
        setRoadmap([]);
      } else {
        console.error('Failed to fetch roadmap:', error);
        toast.error('Failed to load roadmap');
        setRoadmapId('');
        setRoadmap([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateRoadmap = async () => {
    if (!selectedLevelId) {
      toast.error('Please select a level first');
      return;
    }

    const confirmGenerate = confirm(
      roadmap.length > 0
        ? 'This will replace the existing roadmap. Continue?' 
        : 'Generate AI roadmap for this level?'
    );
    
    if (!confirmGenerate) return;

    try {
      setIsGenerating(true);
      const response = await programManagementApi.roadmaps.generate(
        id,
        selectedLevelId,
        'Generate a comprehensive roadmap with practical tasks and learning objectives'
      );
      
      const newRoadmap = response?.data?.roadmap || response?.roadmap || response;
      
      if (newRoadmap?.weeks) {
        const formattedWeeks = newRoadmap.weeks.map((week: any) => ({
          week: week.weekNumber,
          title: week.title,
          objectives: week.objectives || [],
          tasks: (week.tasks || []).map((task: any) => ({
            id: task.id,
            title: task.title,
            description: task.description,
            resources: task.resources || []
          }))
        }));
        setRoadmap(formattedWeeks);
        toast.success('Roadmap generated successfully!');
      }
    } catch (error: any) {
      console.error('Failed to generate roadmap:', error);
      toast.error(error.response?.data?.message || 'Failed to generate roadmap');
    } finally {
      setIsGenerating(false);
    }
  };

  const addWeek = async () => {
    if (!roadmapId) {
      toast.error('Roadmap not found. Please generate a roadmap first.');
      return;
    }

    try {
      const newWeekData = {
        weekNumber: roadmap.length + 1,
        title: `Week ${roadmap.length + 1}`,
        objectives: [],
      };
      
      const response = await programManagementApi.roadmaps.addWeek(roadmapId, newWeekData);
      const newWeek = response?.data?.week || response?.week || response;
      
      toast.success('Week added successfully');
      await fetchRoadmap(); // Refresh to get updated data
      if (newWeek?.id) {
        setEditingWeek(newWeek.weekNumber);
      }
    } catch (error: any) {
      console.error('Failed to add week:', error);
      toast.error(error.response?.data?.message || 'Failed to add week');
    }
  };

  const addTask = async (weekIndex: number) => {
    const week = roadmap[weekIndex];
    if (!week?.id) {
      toast.error('Week not found');
      return;
    }

    try {
      const newTaskData = {
        title: 'New Task',
        description: 'Click edit to add description',
        resources: []
      };
      
      await programManagementApi.roadmaps.addTask(week.id, newTaskData);
      toast.success('Task added successfully');
      await fetchRoadmap(); // Refresh to get updated data
    } catch (error: any) {
      console.error('Failed to add task:', error);
      toast.error(error.response?.data?.message || 'Failed to add task');
    }
  };

  const deleteTask = async (taskId: string) => {
    const confirmDelete = confirm('Are you sure you want to delete this task?');
    if (!confirmDelete) return;

    try {
      await programManagementApi.roadmaps.deleteTask(taskId);
      toast.success('Task deleted successfully');
      await fetchRoadmap(); // Refresh to get updated data
    } catch (error: any) {
      console.error('Failed to delete task:', error);
      toast.error(error.response?.data?.message || 'Failed to delete task');
    }
  };

  const updateTask = async (taskId: string, updates: any) => {
    try {
      await programManagementApi.roadmaps.updateTask(taskId, updates);
      toast.success('Task updated successfully');
      await fetchRoadmap(); // Refresh to get updated data
    } catch (error: any) {
      console.error('Failed to update task:', error);
      toast.error(error.response?.data?.message || 'Failed to update task');
    }
  };

  const deleteWeek = async (weekId: string) => {
    const confirmDelete = confirm('Are you sure you want to delete this week and all its tasks?');
    if (!confirmDelete) return;

    try {
      await programManagementApi.roadmaps.deleteWeek(weekId);
      toast.success('Week deleted successfully');
      await fetchRoadmap(); // Refresh to get updated data
    } catch (error: any) {
      console.error('Failed to delete week:', error);
      toast.error(error.response?.data?.message || 'Failed to delete week');
    }
  };

  const updateWeek = async (weekId: string, updates: any) => {
    try {
      await programManagementApi.roadmaps.updateWeek(weekId, updates);
      toast.success('Week updated successfully');
      await fetchRoadmap(); // Refresh to get updated data
    } catch (error: any) {
      console.error('Failed to update week:', error);
      toast.error(error.response?.data?.message || 'Failed to update week');
    }
  };

  const handleLevelChange = (levelId: string) => {
    setSelectedLevelId(levelId);
    // Update URL with new level param
    router.push(`/admin/programs/${id}/roadmap?level=${levelId}`);
  };

  const selectedLevel = levels.find(l => l.id === selectedLevelId);

  if (loading && selectedLevelId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/admin/programs/${id}`}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Program
        </Link>
        
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-slate-900 mb-2">AI Roadmap Generator</h1>
            <p className="text-slate-600">
              {selectedLevel ? selectedLevel.name : 'Select a level'}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleGenerateRoadmap}
              disabled={isGenerating || !selectedLevelId}
              className="px-4 py-2 bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:from-indigo-400 disabled:to-purple-400 text-white rounded-xl transition-colors flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <RotateCw className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  {roadmap.length > 0 ? 'Regenerate with AI' : 'Generate with AI'}
                </>
              )}
            </button>
            <button
              onClick={() => router.push(`/admin/programs/${id}`)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center gap-2"
            >
              <Save className="w-5 h-5" />
              Save Changes
            </button>
          </div>
        </div>
      </div>

      {/* Level Selector */}
      {levels.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-3">
            Select Level
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {levels.map((level: any) => (
              <button
                key={level.id}
                onClick={() => handleLevelChange(level.id)}
                className={`p-4 border-2 rounded-xl transition-all text-left ${
                  selectedLevelId === level.id
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className="font-medium text-slate-900">{level.name}</div>
                <div className="text-sm text-slate-600 mt-1">
                  {level.durationWeeks} weeks
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI Generation Info */}
      <div className="bg-linear-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-6 mb-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-indigo-900 mb-2">AI-Powered Learning Path</h2>
            <p className="text-indigo-700 text-sm mb-4">
              Our AI analyzes the program details, skill tags, and learning objectives to generate a comprehensive 
              weekly roadmap with tasks, learning objectives, and curated resources. You can edit any part of the 
              generated content or regenerate specific sections.
            </p>
            <div className="flex gap-3">
              <button className="px-4 py-2 bg-white hover:bg-indigo-50 border border-indigo-300 text-indigo-700 rounded-lg text-sm transition-colors">
                Customize AI Parameters
              </button>
              <button className="px-4 py-2 bg-white hover:bg-indigo-50 border border-indigo-300 text-indigo-700 rounded-lg text-sm transition-colors">
                View AI Suggestions
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* No Roadmap State */}
      {roadmap.length === 0 && !loading && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Sparkles className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">No Roadmap Yet</h2>
          <p className="text-slate-600 mb-6">
            Generate an AI-powered learning roadmap for this program to get started.
          </p>
          <button
            onClick={handleGenerateRoadmap}
            disabled={isGenerating}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl transition-colors flex items-center gap-2 mx-auto"
          >
            {isGenerating ? (
              <>
                <RotateCw className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate AI Roadmap
              </>
            )}
          </button>
        </div>
      )}

      {/* Roadmap Editor */}
      {roadmap.length > 0 && (
        <div className="space-y-6">
        {roadmap.map((week: any, weekIndex: number) => (
          <div key={week.week} className="bg-white rounded-2xl border border-slate-200">
            {/* Week Header */}
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-start gap-4">
                <div className="p-2 cursor-move hover:bg-slate-100 rounded-lg">
                  <GripVertical className="w-5 h-5 text-slate-400" />
                </div>
                <div className="flex-1">
                  {editingWeek === week.week ? (
                    <input
                      type="text"
                      defaultValue={week.title}
                      className="w-full text-slate-900 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
                      onBlur={(e) => {
                        if (e.target.value !== week.title && week.id) {
                          updateWeek(week.id, { title: e.target.value });
                        }
                        setEditingWeek(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <h2 className="text-slate-900 mb-3">Week {week.week}: {week.title}</h2>
                  )}
                  
                  {/* Objectives */}
                  <div className="mb-4">
                    <div className="text-slate-700 text-sm mb-2">Learning Objectives</div>
                    <div className="space-y-2">
                      {week.objectives.map((objective: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 text-slate-600 text-sm">
                          <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                          {objective}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingWeek(week.week)}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-5 h-5 text-slate-600" />
                  </button>
                  <button
                    onClick={() => week.id && deleteWeek(week.id)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5 text-red-600" />
                  </button>
                </div>
              </div>
            </div>

            {/* Tasks */}
            <div className="p-6 space-y-4">
              {week.tasks.map((task: any) => (
                <div key={task.id} className="p-5 border border-slate-200 rounded-xl hover:border-indigo-300 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <BookOpen className="w-5 h-5 text-indigo-600" />
                        <h3 className="text-slate-900">{task.title}</h3>
                      </div>
                      <p className="text-slate-600 text-sm mb-3 ml-8">{task.description}</p>
                      
                      {/* Resources */}
                      {task.resources.length > 0 && (
                        <div className="ml-8">
                          <div className="text-slate-700 text-sm mb-2">Learning Resources</div>
                          <div className="space-y-1">
                            {task.resources.map((resource: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-2 text-indigo-600 text-sm">
                                <LinkIcon className="w-4 h-4" />
                                {resource}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          // TODO: Implement task editing modal
                          toast.info('Task editing modal coming soon');
                        }}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4 text-slate-600" />
                      </button>
                      <button 
                        onClick={() => deleteTask(task.id)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add Task Button */}
              <button
                onClick={() => addTask(weekIndex)}
                className="w-full p-4 border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 rounded-xl transition-colors flex items-center justify-center gap-2 text-slate-600 hover:text-indigo-700"
              >
                <Plus className="w-5 h-5" />
                Add Task
              </button>
            </div>
          </div>
        ))}

        {/* Add Week Button */}
        <button
          onClick={addWeek}
          className="w-full p-6 border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 rounded-2xl transition-colors flex items-center justify-center gap-2 text-slate-600 hover:text-indigo-700"
        >
          <Plus className="w-5 h-5" />
          Add Week
        </button>
        </div>
      )}

      {/* Save Actions */}
      <div className="mt-8 flex justify-end gap-4">
        <button
          onClick={() => router.push(`/admin/programs/${id}`)}
          className="px-6 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => router.push(`/admin/programs/${id}`)}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center gap-2"
        >
          <Save className="w-5 h-5" />
          Save Roadmap
        </button>
      </div>
    </>
  );
}
