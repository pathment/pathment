import React, { useState } from 'react';
import { Link, useParams, useRouter } from 'next/navigation';
import Navigation from '../shared/Navigation';
import {
  ArrowLeft,
  Sparkles,
  Plus,
  Edit2,
  Trash2,
  Save,
  RotateCw,
  Calendar,
  BookOpen,
  Link as LinkIcon,
  GripVertical
} from 'lucide-react';

export default function RoadmapGenerator() {
  const { id } = useParams();
  const navigate = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [roadmap, setRoadmap] = useState([
    {
      week: 1,
      title: 'Web Fundamentals & Setup',
      objectives: ['Understand HTML5 structure', 'Master CSS layouts', 'Setup development environment'],
      tasks: [
        {
          id: 1,
          title: 'Build a responsive landing page',
          description: 'Create a fully responsive landing page using HTML5 and CSS3',
          resources: ['MDN Web Docs', 'CSS-Tricks Flexbox Guide']
        },
        {
          id: 2,
          title: 'Setup Git and GitHub',
          description: 'Initialize a Git repository and push to GitHub',
          resources: ['GitHub Docs', 'Git Documentation']
        }
      ]
    },
    {
      week: 2,
      title: 'Modern JavaScript Essentials',
      objectives: ['Master ES6+ features', 'Understand asynchronous programming', 'Work with APIs'],
      tasks: [
        {
          id: 3,
          title: 'Build a weather app with API integration',
          description: 'Fetch data from a weather API and display it dynamically',
          resources: ['JavaScript.info', 'OpenWeather API Docs']
        }
      ]
    }
  ]);

  const [editingWeek, setEditingWeek] = useState<number | null>(null);
  const [editingTask, setEditingTask] = useState<any>(null);

  const handleGenerateRoadmap = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      // Roadmap would be generated here
    }, 2000);
  };

  const addWeek = () => {
    const newWeek = {
      week: roadmap.length + 1,
      title: 'New Week',
      objectives: [],
      tasks: []
    };
    setRoadmap([...roadmap, newWeek]);
    setEditingWeek(newWeek.week);
  };

  const addTask = (weekIndex: number) => {
    const newRoadmap = [...roadmap];
    const newTask = {
      id: Date.now(),
      title: 'New Task',
      description: '',
      resources: []
    };
    newRoadmap[weekIndex].tasks.push(newTask);
    setRoadmap(newRoadmap);
    setEditingTask({ weekIndex, task: newTask });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation role="admin" />
      
      <div className="lg:pl-64">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <Link
              to={`/admin/programs/${id}`}
              className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Program
            </Link>
            
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h1 className="text-slate-900 mb-2">AI Roadmap Generator</h1>
                <p className="text-slate-600">Full Stack Development Bootcamp</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleGenerateRoadmap}
                  disabled={isGenerating}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:from-indigo-400 disabled:to-purple-400 text-white rounded-xl transition-colors flex items-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <RotateCw className="w-5 h-5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Regenerate with AI
                    </>
                  )}
                </button>
                <button
                  onClick={() => navigate(`/admin/programs/${id}`)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  Save Changes
                </button>
              </div>
            </div>
          </div>

          {/* AI Generation Info */}
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-6 mb-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
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

          {/* Roadmap Editor */}
          <div className="space-y-6">
            {roadmap.map((week, weekIndex) => (
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
                          onBlur={() => setEditingWeek(null)}
                          autoFocus
                        />
                      ) : (
                        <h2 className="text-slate-900 mb-3">Week {week.week}: {week.title}</h2>
                      )}
                      
                      {/* Objectives */}
                      <div className="mb-4">
                        <div className="text-slate-700 text-sm mb-2">Learning Objectives</div>
                        <div className="space-y-2">
                          {week.objectives.map((objective, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-slate-600 text-sm">
                              <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                              {objective}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setEditingWeek(week.week)}
                      className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-5 h-5 text-slate-600" />
                    </button>
                  </div>
                </div>

                {/* Tasks */}
                <div className="p-6 space-y-4">
                  {week.tasks.map((task, taskIdx) => (
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
                                {task.resources.map((resource, idx) => (
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
                          <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                            <Edit2 className="w-4 h-4 text-slate-600" />
                          </button>
                          <button className="p-2 hover:bg-red-50 rounded-lg transition-colors">
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

          {/* Save Actions */}
          <div className="mt-8 flex justify-end gap-4">
            <button
              onClick={() => navigate(`/admin/programs/${id}`)}
              className="px-6 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => navigate(`/admin/programs/${id}`)}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center gap-2"
            >
              <Save className="w-5 h-5" />
              Save Roadmap
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
