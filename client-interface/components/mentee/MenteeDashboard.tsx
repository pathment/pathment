import React from 'react';
import { Link, useRouter } from 'next/navigation';
import Navigation from '../shared/Navigation';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  User,
  Star,
  TrendingUp,
  Target,
  Award
} from 'lucide-react';

export default function MenteeDashboard() {
  const currentProgram = {
    name: 'Full Stack Development Bootcamp',
    progress: 68,
    currentWeek: 3,
    totalWeeks: 12,
    tasksCompleted: 24,
    totalTasks: 35,
    mentor: {
      name: 'Sarah Johnson',
      expertise: 'Full Stack Development',
      rating: 4.9
    }
  };

  const upcomingTasks = [
    {
      id: 1,
      title: 'Build a React component library',
      program: 'Full Stack Development',
      dueDate: '2024-02-20',
      status: 'assigned',
      priority: 'high'
    },
    {
      id: 2,
      title: 'Implement user authentication',
      program: 'Full Stack Development',
      dueDate: '2024-02-22',
      status: 'in_progress',
      priority: 'medium'
    },
    {
      id: 3,
      title: 'Create REST API endpoints',
      program: 'Full Stack Development',
      dueDate: '2024-02-25',
      status: 'assigned',
      priority: 'medium'
    }
  ];

  const recentFeedback = [
    {
      id: 1,
      task: 'Build responsive landing page',
      mentor: 'Sarah Johnson',
      rating: 5,
      comment: 'Excellent work! Your attention to detail and responsive design principles are outstanding.',
      date: '2024-02-15'
    },
    {
      id: 2,
      task: 'JavaScript array methods exercise',
      mentor: 'Sarah Johnson',
      rating: 4,
      comment: 'Good job! Consider using more modern ES6 methods for cleaner code.',
      date: '2024-02-12'
    }
  ];

  const stats = [
    { label: 'Tasks Completed', value: currentProgram.tasksCompleted, icon: CheckCircle2, color: 'green' },
    { label: 'In Progress', value: '2', icon: Clock, color: 'blue' },
    { label: 'Pending Review', value: '1', icon: AlertCircle, color: 'yellow' },
    { label: 'Average Rating', value: '4.5', icon: Star, color: 'purple' }
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation role="mentee" />
      
      <div className="lg:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-slate-900 mb-2">Welcome back!</h1>
            <p className="text-slate-600">Keep up the great work on your learning journey</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="bg-white rounded-2xl p-6 border border-slate-200">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 bg-${stat.color}-100 rounded-xl flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 text-${stat.color}-600`} />
                    </div>
                  </div>
                  <div className="text-slate-600 text-sm mb-1">{stat.label}</div>
                  <div className="text-slate-900 text-2xl">{stat.value}</div>
                </div>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Current Program */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-slate-900 mb-4">Current Program</h2>
                <div className="mb-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-slate-900 mb-1">{currentProgram.name}</h3>
                      <p className="text-slate-600 text-sm">
                        Week {currentProgram.currentWeek} of {currentProgram.totalWeeks}
                      </p>
                    </div>
                    <Link
                      to="/mentee/tasks"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm transition-colors"
                    >
                      View Tasks
                    </Link>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-slate-600">Overall Progress</span>
                      <span className="text-slate-900">{currentProgram.progress}%</span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full"
                        style={{ width: `${currentProgram.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-sm text-slate-600">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      {currentProgram.tasksCompleted} tasks completed
                    </span>
                    <span className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-indigo-600" />
                      {currentProgram.totalTasks - currentProgram.tasksCompleted} remaining
                    </span>
                  </div>
                </div>

                {/* Mentor Info */}
                <div className="p-4 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-200 rounded-full flex items-center justify-center">
                      <span className="text-purple-700">
                        {currentProgram.mentor.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="text-slate-900 mb-1">Your Mentor</div>
                      <div className="text-slate-600 text-sm">{currentProgram.mentor.name}</div>
                      <div className="flex items-center gap-1 text-sm">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        <span className="text-slate-600">{currentProgram.mentor.rating}</span>
                      </div>
                    </div>
                    <button className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-sm transition-colors">
                      Message
                    </button>
                  </div>
                </div>
              </div>

              {/* Upcoming Tasks */}
              <div className="bg-white rounded-2xl border border-slate-200">
                <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-slate-900">Upcoming Tasks</h2>
                  <Link to="/mentee/tasks" className="text-indigo-600 hover:text-indigo-700 text-sm">
                    View all
                  </Link>
                </div>
                <div className="divide-y divide-slate-200">
                  {upcomingTasks.map((task) => (
                    <Link
                      key={task.id}
                      to={`/mentee/tasks/${task.id}/submit`}
                      className="block px-6 py-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-slate-900">{task.title}</h3>
                            {task.priority === 'high' && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                                High Priority
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-600">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              Due {task.dueDate}
                            </span>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-lg text-xs ${
                          task.status === 'in_progress'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {task.status === 'in_progress' ? 'In Progress' : 'Assigned'}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Recent Feedback */}
              <div className="bg-white rounded-2xl border border-slate-200">
                <div className="px-6 py-5 border-b border-slate-200">
                  <h3 className="text-slate-900">Recent Feedback</h3>
                </div>
                <div className="divide-y divide-slate-200">
                  {recentFeedback.map((feedback) => (
                    <Link
                      key={feedback.id}
                      to={`/mentee/feedback/${feedback.id}`}
                      className="block px-6 py-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-1 mb-2">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-4 h-4 ${
                              i < feedback.rating
                                ? 'text-yellow-500 fill-yellow-500'
                                : 'text-slate-300'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-slate-900 text-sm mb-2">{feedback.task}</p>
                      <p className="text-slate-600 text-sm mb-2 line-clamp-2">{feedback.comment}</p>
                      <p className="text-slate-500 text-xs">{feedback.date}</p>
                    </Link>
                  ))}
                </div>
                <div className="px-6 py-4 border-t border-slate-200">
                  <Link to="/mentee/tasks" className="text-indigo-600 hover:text-indigo-700 text-sm block text-center">
                    View All Feedback
                  </Link>
                </div>
              </div>

              {/* Learning Streak */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-6">
                <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mb-4">
                  <Award className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-indigo-900 mb-2">7 Day Streak!</h3>
                <p className="text-indigo-700 text-sm mb-4">
                  You've been consistent with your learning. Keep it up!
                </p>
                <div className="flex gap-1">
                  {[...Array(7)].map((_, i) => (
                    <div key={i} className="flex-1 h-2 bg-indigo-600 rounded-full" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
