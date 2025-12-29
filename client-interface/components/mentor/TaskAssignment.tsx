import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '../shared/Navigation';
import {
  ArrowLeft,
  Plus,
  BookOpen,
  User,
  Calendar,
  Flag,
  Link as LinkIcon,
  X,
  Send
} from 'lucide-react';

export default function TaskAssignment() {
  const navigate = useRouter();
  const [taskType, setTaskType] = useState<'roadmap' | 'custom'>('roadmap');
  const [selectedMentee, setSelectedMentee] = useState('');
  const [selectedRoadmapTask, setSelectedRoadmapTask] = useState('');
  const [customTask, setCustomTask] = useState({
    title: '',
    description: '',
    dueDate: '',
    priority: 'medium',
    resources: ['']
  });

  const mentees = [
    { id: '1', name: 'Alex Thompson', program: 'Full Stack Development' },
    { id: '2', name: 'Maria Garcia', program: 'Full Stack Development' },
    { id: '3', name: 'James Wilson', program: 'Full Stack Development' }
  ];

  const roadmapTasks = [
    {
      id: '1',
      week: 3,
      title: 'Build a React component library',
      description: 'Create reusable React components with TypeScript',
      estimatedHours: 8
    },
    {
      id: '2',
      week: 3,
      title: 'Implement user authentication',
      description: 'Add JWT-based authentication to your application',
      estimatedHours: 6
    },
    {
      id: '3',
      week: 4,
      title: 'Create REST API endpoints',
      description: 'Build CRUD operations for your application',
      estimatedHours: 10
    },
    {
      id: '4',
      week: 4,
      title: 'Database design and schema',
      description: 'Design and implement PostgreSQL database schema',
      estimatedHours: 8
    }
  ];

  const addResource = () => {
    setCustomTask({ ...customTask, resources: [...customTask.resources, ''] });
  };

  const updateResource = (index: number, value: string) => {
    const newResources = [...customTask.resources];
    newResources[index] = value;
    setCustomTask({ ...customTask, resources: newResources });
  };

  const removeResource = (index: number) => {
    setCustomTask({ ...customTask, resources: customTask.resources.filter((_, i) => i !== index) });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Submit logic here
    navigate('/mentor/dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation role="mentor" />
      
      <div className="lg:pl-64">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <button
            onClick={() => navigate('/mentor/dashboard')}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </button>

          <div className="mb-8">
            <h1 className="text-slate-900 mb-2">Assign Task</h1>
            <p className="text-slate-600">Assign tasks from the roadmap or create custom assignments</p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Select Mentee */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
              <label className="block text-slate-900 mb-3">
                Select Mentee <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <select
                  value={selectedMentee}
                  onChange={(e) => setSelectedMentee(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none"
                  required
                >
                  <option value="">Choose a mentee...</option>
                  {mentees.map((mentee) => (
                    <option key={mentee.id} value={mentee.id}>
                      {mentee.name} - {mentee.program}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Task Type Selection */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
              <label className="block text-slate-900 mb-3">Task Type</label>
              <div className="grid sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setTaskType('roadmap')}
                  className={`p-4 border-2 rounded-xl transition-all text-left ${
                    taskType === 'roadmap'
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <BookOpen className={`w-6 h-6 mb-2 ${taskType === 'roadmap' ? 'text-indigo-600' : 'text-slate-600'}`} />
                  <div className={`mb-1 ${taskType === 'roadmap' ? 'text-indigo-900' : 'text-slate-900'}`}>
                    From Roadmap
                  </div>
                  <div className={`text-sm ${taskType === 'roadmap' ? 'text-indigo-700' : 'text-slate-600'}`}>
                    Choose from program curriculum
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTaskType('custom')}
                  className={`p-4 border-2 rounded-xl transition-all text-left ${
                    taskType === 'custom'
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Plus className={`w-6 h-6 mb-2 ${taskType === 'custom' ? 'text-indigo-600' : 'text-slate-600'}`} />
                  <div className={`mb-1 ${taskType === 'custom' ? 'text-indigo-900' : 'text-slate-900'}`}>
                    Custom Task
                  </div>
                  <div className={`text-sm ${taskType === 'custom' ? 'text-indigo-700' : 'text-slate-600'}`}>
                    Create your own assignment
                  </div>
                </button>
              </div>
            </div>

            {/* Roadmap Tasks */}
            {taskType === 'roadmap' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
                <label className="block text-slate-900 mb-3">
                  Select Task from Roadmap <span className="text-red-600">*</span>
                </label>
                <div className="space-y-3">
                  {roadmapTasks.map((task) => (
                    <label
                      key={task.id}
                      className={`block p-4 border-2 rounded-xl cursor-pointer transition-all ${
                        selectedRoadmapTask === task.id
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="roadmapTask"
                        value={task.id}
                        checked={selectedRoadmapTask === task.id}
                        onChange={(e) => setSelectedRoadmapTask(e.target.value)}
                        className="sr-only"
                      />
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs`}>
                              Week {task.week}
                            </span>
                            <h3 className={selectedRoadmapTask === task.id ? 'text-indigo-900' : 'text-slate-900'}>
                              {task.title}
                            </h3>
                          </div>
                          <p className={`text-sm mb-2 ${selectedRoadmapTask === task.id ? 'text-indigo-700' : 'text-slate-600'}`}>
                            {task.description}
                          </p>
                          <span className={`text-xs ${selectedRoadmapTask === task.id ? 'text-indigo-600' : 'text-slate-500'}`}>
                            Estimated: {task.estimatedHours} hours
                          </span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Due Date */}
                <div className="mt-6">
                  <label className="block text-slate-900 mb-2">
                    Due Date <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="date"
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Custom Task */}
            {taskType === 'custom' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 space-y-6">
                {/* Task Title */}
                <div>
                  <label className="block text-slate-900 mb-2">
                    Task Title <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={customTask.title}
                    onChange={(e) => setCustomTask({ ...customTask, title: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="e.g., Build a weather dashboard"
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-slate-900 mb-2">
                    Description <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    value={customTask.description}
                    onChange={(e) => setCustomTask({ ...customTask, description: e.target.value })}
                    rows={5}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    placeholder="Describe the task, requirements, and expectations..."
                    required
                  />
                </div>

                {/* Due Date & Priority */}
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-slate-900 mb-2">
                      Due Date <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="date"
                        value={customTask.dueDate}
                        onChange={(e) => setCustomTask({ ...customTask, dueDate: e.target.value })}
                        className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-900 mb-2">Priority</label>
                    <div className="relative">
                      <Flag className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <select
                        value={customTask.priority}
                        onChange={(e) => setCustomTask({ ...customTask, priority: e.target.value })}
                        className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Resources */}
                <div>
                  <label className="block text-slate-900 mb-2">Learning Resources</label>
                  <div className="space-y-3">
                    {customTask.resources.map((resource, index) => (
                      <div key={index} className="flex gap-2">
                        <div className="relative flex-1">
                          <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                          <input
                            type="url"
                            value={resource}
                            onChange={(e) => updateResource(index, e.target.value)}
                            className="w-full pl-11 pr-12 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="https://..."
                          />
                          {customTask.resources.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeResource(index)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-600"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addResource}
                      className="text-indigo-600 hover:text-indigo-700 text-sm flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add resource link
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-4">
              <button
                type="submit"
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center gap-2"
              >
                <Send className="w-5 h-5" />
                Assign Task
              </button>
              <button
                type="button"
                onClick={() => navigate('/mentor/dashboard')}
                className="px-6 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
