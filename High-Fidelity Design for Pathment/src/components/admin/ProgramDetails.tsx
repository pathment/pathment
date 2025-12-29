import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navigation from '../shared/Navigation';
import {
  ArrowLeft,
  Edit,
  Users,
  UserCheck,
  Calendar,
  Clock,
  BookOpen,
  CheckCircle2,
  Circle,
  Sparkles,
  Download,
  Share2
} from 'lucide-react';

export default function ProgramDetails() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState<'overview' | 'roadmap' | 'mentors' | 'enrollments'>('overview');

  const program = {
    id: 1,
    name: 'Full Stack Development Bootcamp',
    description: 'Comprehensive program covering modern web development with React, Node.js, and PostgreSQL. Students will build real-world projects and gain practical experience in full-stack development.',
    type: 'Bootcamp',
    level: 'Intermediate',
    duration: '12 weeks',
    startDate: '2024-01-15',
    endDate: '2024-04-07',
    status: 'active',
    enrollments: 45,
    mentors: 8,
    completion: 68,
    tags: ['React', 'Node.js', 'PostgreSQL', 'REST APIs', 'Git']
  };

  const roadmap = [
    {
      week: 1,
      title: 'Web Fundamentals',
      status: 'completed',
      tasks: 5,
      completedTasks: 5,
      topics: ['HTML5', 'CSS3', 'JavaScript Basics']
    },
    {
      week: 2,
      title: 'Modern JavaScript',
      status: 'completed',
      tasks: 6,
      completedTasks: 6,
      topics: ['ES6+', 'Async/Await', 'Promises']
    },
    {
      week: 3,
      title: 'React Fundamentals',
      status: 'in_progress',
      tasks: 7,
      completedTasks: 4,
      topics: ['Components', 'Props', 'State', 'Hooks']
    },
    {
      week: 4,
      title: 'Advanced React',
      status: 'upcoming',
      tasks: 6,
      completedTasks: 0,
      topics: ['Context API', 'Custom Hooks', 'Performance']
    },
  ];

  const assignedMentors = [
    { id: 1, name: 'Sarah Johnson', mentees: 6, expertise: 'Frontend Development', rating: 4.9 },
    { id: 2, name: 'Michael Chen', mentees: 5, expertise: 'Backend Development', rating: 4.8 },
    { id: 3, name: 'Emma Wilson', mentees: 7, expertise: 'Full Stack', rating: 4.9 },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation role="admin" />
      
      <div className="lg:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <Link
              to="/admin/programs"
              className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Programs
            </Link>
            
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-slate-900">{program.name}</h1>
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm">
                    {program.status}
                  </span>
                </div>
                <p className="text-slate-600 mb-4">{program.description}</p>
                <div className="flex flex-wrap gap-2">
                  {program.tags.map((tag) => (
                    <span key={tag} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Link
                  to={`/admin/programs/${id}/roadmap`}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Edit Roadmap
                </Link>
                <button className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors">
                  <Share2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-2xl p-6 border border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-indigo-600" />
                </div>
                <span className="text-slate-600 text-sm">Enrollments</span>
              </div>
              <div className="text-slate-900 text-2xl">{program.enrollments}</div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <UserCheck className="w-5 h-5 text-purple-600" />
                </div>
                <span className="text-slate-600 text-sm">Mentors</span>
              </div>
              <div className="text-slate-900 text-2xl">{program.mentors}</div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <span className="text-slate-600 text-sm">Completion</span>
              </div>
              <div className="text-slate-900 text-2xl">{program.completion}%</div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-slate-600 text-sm">Duration</span>
              </div>
              <div className="text-slate-900 text-2xl">{program.duration}</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-6">
            <div className="border-b border-slate-200">
              <div className="flex gap-6">
                {[
                  { id: 'overview', label: 'Overview' },
                  { id: 'roadmap', label: 'Roadmap' },
                  { id: 'mentors', label: 'Mentors' },
                  { id: 'enrollments', label: 'Enrollments' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`pb-3 border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-2xl p-6 border border-slate-200">
                  <h2 className="text-slate-900 mb-4">Program Information</h2>
                  <div className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <div className="text-slate-600 text-sm mb-1">Type</div>
                        <div className="text-slate-900">{program.type}</div>
                      </div>
                      <div>
                        <div className="text-slate-600 text-sm mb-1">Level</div>
                        <div className="text-slate-900">{program.level}</div>
                      </div>
                      <div>
                        <div className="text-slate-600 text-sm mb-1">Start Date</div>
                        <div className="text-slate-900">{program.startDate}</div>
                      </div>
                      <div>
                        <div className="text-slate-600 text-sm mb-1">End Date</div>
                        <div className="text-slate-900">{program.endDate}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-slate-200">
                  <h2 className="text-slate-900 mb-4">Learning Roadmap Preview</h2>
                  <div className="space-y-3">
                    {roadmap.slice(0, 3).map((week) => (
                      <div key={week.week} className="p-4 border border-slate-200 rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            {week.status === 'completed' ? (
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            ) : week.status === 'in_progress' ? (
                              <Circle className="w-5 h-5 text-indigo-600 fill-indigo-600" />
                            ) : (
                              <Circle className="w-5 h-5 text-slate-300" />
                            )}
                            <span className="text-slate-900">Week {week.week}: {week.title}</span>
                          </div>
                          <span className="text-slate-600 text-sm">{week.completedTasks}/{week.tasks} tasks</span>
                        </div>
                        <div className="flex flex-wrap gap-2 ml-8">
                          {week.topics.map((topic) => (
                            <span key={topic} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <Link
                    to={`/admin/programs/${id}/roadmap`}
                    className="mt-4 text-indigo-600 hover:text-indigo-700 text-sm inline-block"
                  >
                    View Full Roadmap →
                  </Link>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white rounded-2xl p-6 border border-slate-200">
                  <h3 className="text-slate-900 mb-4">Assigned Mentors</h3>
                  <div className="space-y-3">
                    {assignedMentors.map((mentor) => (
                      <div key={mentor.id} className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-slate-600 text-sm">
                            {mentor.name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-slate-900 text-sm">{mentor.name}</div>
                          <div className="text-slate-600 text-xs">{mentor.mentees} mentees</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Link
                    to="/admin/mentors/assign"
                    className="mt-4 text-indigo-600 hover:text-indigo-700 text-sm block text-center"
                  >
                    Manage Mentors
                  </Link>
                </div>

                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-6">
                  <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mb-4">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-indigo-900 mb-2">AI Roadmap</h3>
                  <p className="text-indigo-700 text-sm mb-4">
                    This program uses AI-generated learning paths tailored to each mentee's progress.
                  </p>
                  <Link
                    to={`/admin/programs/${id}/roadmap`}
                    className="text-indigo-600 hover:text-indigo-700 text-sm"
                  >
                    Edit Roadmap →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'roadmap' && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-slate-900">Learning Roadmap</h2>
                <Link
                  to={`/admin/programs/${id}/roadmap`}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Edit Roadmap
                </Link>
              </div>
              <div className="space-y-4">
                {roadmap.map((week) => (
                  <div key={week.week} className="p-6 border border-slate-200 rounded-xl">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-4">
                        {week.status === 'completed' ? (
                          <CheckCircle2 className="w-6 h-6 text-green-600 mt-1" />
                        ) : week.status === 'in_progress' ? (
                          <Circle className="w-6 h-6 text-indigo-600 fill-indigo-600 mt-1" />
                        ) : (
                          <Circle className="w-6 h-6 text-slate-300 mt-1" />
                        )}
                        <div>
                          <h3 className="text-slate-900 mb-2">Week {week.week}: {week.title}</h3>
                          <div className="flex flex-wrap gap-2">
                            {week.topics.map((topic) => (
                              <span key={topic} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-sm">
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-slate-900 mb-1">{week.completedTasks}/{week.tasks}</div>
                        <div className="text-slate-600 text-sm">Tasks</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full"
                          style={{ width: `${(week.completedTasks / week.tasks) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm text-slate-600">
                        {Math.round((week.completedTasks / week.tasks) * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
