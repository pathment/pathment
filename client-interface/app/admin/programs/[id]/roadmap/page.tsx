'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Sparkles,
  Plus,
  X,
  Edit2,
  Trash2,
  Save,
  RotateCw,
  BookOpen,
  Link as LinkIcon,
  GripVertical,
  Loader2
} from 'lucide-react';
import { useProgramRoadmap } from '@/lib/hooks/admin';
import { GenerateConfirmModal } from '@/components/admin/programs';

export default function RoadmapGenerator() {
  const router = useRouter();
  const {
    id, isGenerating, loading, roadmap, roadmapId, levels,
    selectedLevelId, selectedLevel, editingWeek, taskModal, taskForm, savingTask,
    weekModal, weekForm, savingWeek, generateConfirmModal,
    setSelectedLevelId, setEditingWeek, setTaskModal, setTaskForm,
    setWeekModal, setWeekForm,
    handleLevelChange, handleGenerateRoadmap, confirmGenerateRoadmap, cancelGenerateRoadmap,
    openAddWeekModal, openEditWeek, handleSaveWeek,
    openAddTask, openEditTask, handleSaveTask,
    deleteTask, deleteWeek,
  } = useProgramRoadmap();

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
            <Link
              href={`/admin/programs/${id}`}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center gap-2"
            >
              <Save className="w-5 h-5" />
              Save Changes
            </Link>
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
                  <h2 className="text-slate-900 mb-3">Week {week.week}: {week.title}</h2>
                  
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
                      {week.objectives.length === 0 && (
                        <p className="text-slate-400 text-sm italic">No objectives yet — click edit to add some</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditWeek(week)}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Edit week"
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
                        onClick={() => openEditTask(task, week.id, week.week)}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Edit task"
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
                onClick={() => openAddTask(week.id, week.week, week.tasks.length)}
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
          onClick={openAddWeekModal}
          className="w-full p-6 border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 rounded-2xl transition-colors flex items-center justify-center gap-2 text-slate-600 hover:text-indigo-700"
        >
          <Plus className="w-5 h-5" />
          Add Week
        </button>
        </div>
      )}

      {/* Week Form Modal */}
      {weekModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-slate-900 font-semibold text-lg">
                {weekModal.mode === 'add' ? 'Add New Week' : `Edit Week ${weekModal.week?.week}`}
              </h2>
              <button onClick={() => setWeekModal(null)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Week Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={weekForm.title}
                  onChange={(e) => setWeekForm({ ...weekForm, title: e.target.value })}
                  placeholder="e.g., Frontend Fundamentals"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>

              {/* Objectives */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Learning Objectives</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={weekForm.objectiveInput}
                    onChange={(e) => setWeekForm({ ...weekForm, objectiveInput: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = weekForm.objectiveInput.trim();
                        if (val && !weekForm.objectives.includes(val)) {
                          setWeekForm({ ...weekForm, objectives: [...weekForm.objectives, val], objectiveInput: '' });
                        }
                      }
                    }}
                    placeholder="Type an objective and press Enter or click Add"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = weekForm.objectiveInput.trim();
                      if (val && !weekForm.objectives.includes(val)) {
                        setWeekForm({ ...weekForm, objectives: [...weekForm.objectives, val], objectiveInput: '' });
                      }
                    }}
                    className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg text-sm transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {weekForm.objectives.map((obj, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                      <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full shrink-0" />
                      <span className="flex-1 text-sm text-slate-700">{obj}</span>
                      <button
                        type="button"
                        onClick={() => setWeekForm({ ...weekForm, objectives: weekForm.objectives.filter((_, i) => i !== idx) })}
                        className="p-1 hover:bg-red-100 rounded transition-colors"
                      >
                        <X className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  ))}
                  {weekForm.objectives.length === 0 && (
                    <p className="text-slate-400 text-xs italic">No objectives added yet</p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-6 border-t border-slate-200">
              <button
                onClick={() => setWeekModal(null)}
                className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveWeek}
                disabled={savingWeek}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                {savingWeek ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="w-4 h-4" /> {weekModal.mode === 'add' ? 'Add Week' : 'Save Changes'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Form Modal */}
      {taskModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-slate-900 font-semibold text-lg">
                {taskModal.mode === 'add' ? `Add Task – Week ${taskModal.weekNumber}` : 'Edit Task'}
              </h2>
              <button onClick={() => setTaskModal(null)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  placeholder="e.g., Build a React component"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  placeholder="Describe what the mentee needs to do (min 10 characters)..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
                />
              </div>

              {/* Deliverable */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Deliverable <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={taskForm.deliverable}
                  onChange={(e) => setTaskForm({ ...taskForm, deliverable: e.target.value })}
                  placeholder="What should the mentee submit? e.g., GitHub repo link, screenshot, written report..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
                />
              </div>

              {/* Week & Task Order */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Week</label>
                  <select
                    value={taskForm.weekId}
                    onChange={(e) => setTaskForm({ ...taskForm, weekId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
                  >
                    {roadmap.map((w: any) => (
                      <option key={w.id} value={w.id}>Week {w.week}: {w.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Task Order</label>
                  <input
                    type="number"
                    min={1}
                    value={taskForm.taskOrder}
                    onChange={(e) => setTaskForm({ ...taskForm, taskOrder: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>

              {/* Type & Difficulty */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
                  <select
                    value={taskForm.type}
                    onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
                  >
                    <option value="reading">Reading</option>
                    <option value="video">Video</option>
                    <option value="exercise">Exercise</option>
                    <option value="project">Project</option>
                    <option value="quiz">Quiz</option>
                    <option value="practical">Practical</option>
                    <option value="assessment">Assessment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Difficulty</label>
                  <select
                    value={taskForm.difficulty}
                    onChange={(e) => setTaskForm({ ...taskForm, difficulty: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                    <option value="expert">Expert</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 p-6 border-t border-slate-200">
              <button
                onClick={() => setTaskModal(null)}
                className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTask}
                disabled={savingTask}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                {savingTask ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="w-4 h-4" /> {taskModal.mode === 'add' ? 'Add Task' : 'Save Changes'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Confirmation Modal */}
      <GenerateConfirmModal
        isOpen={generateConfirmModal.isOpen}
        isLoading={isGenerating}
        title="Generate AI Roadmap"
        message={
          generateConfirmModal.hasExistingRoadmap
            ? 'This will replace the existing roadmap. All manual edits to this roadmap will be overwritten. Do you want to continue?'
            : 'Generate an AI-powered learning roadmap for this level?'
        }
        confirmText="Generate"
        cancelText="Cancel"
        onConfirm={confirmGenerateRoadmap}
        onCancel={cancelGenerateRoadmap}
      />

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
