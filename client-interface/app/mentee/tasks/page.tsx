'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  ArrowUpRight,
  Star
} from 'lucide-react';

export default function TaskList() {
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const tasks = [
    {
      id: 1,
      title: 'Build a responsive landing page',
      description: 'Create a fully responsive landing page using HTML5 and CSS3',
      status: 'completed',
      dueDate: '2024-02-10',
      submittedDate: '2024-02-09',
      feedback: 'Excellent work!',
      rating: 5,
      program: 'Full Stack Development'
    },
    {
      id: 2,
      title: 'JavaScript array methods exercise',
      description: 'Complete exercises using map, filter, and reduce',
      status: 'completed',
      dueDate: '2024-02-12',
      submittedDate: '2024-02-11',
      feedback: 'Good job! Consider using more modern ES6 methods.',
      rating: 4,
      program: 'Full Stack Development'
    },
    {
      id: 3,
      title: 'Build a React component library',
      description: 'Create reusable React components with TypeScript',
      status: 'revision_needed',
      dueDate: '2024-02-15',
      submittedDate: '2024-02-14',
      feedback: 'Good start, but please add prop-types validation.',
      program: 'Full Stack Development'
    },
    {
      id: 4,
      title: 'Implement user authentication',
      description: 'Add JWT-based authentication to your application',
      status: 'submitted',
      dueDate: '2024-02-18',
      submittedDate: '2024-02-17',
      program: 'Full Stack Development'
    },
    {
      id: 5,
      title: 'Create REST API endpoints',
      description: 'Build CRUD operations for your application',
      status: 'in_progress',
      dueDate: '2024-02-22',
      program: 'Full Stack Development'
    },
    {
      id: 6,
      title: 'Database design and schema',
      description: 'Design and implement PostgreSQL database schema',
      status: 'assigned',
      dueDate: '2024-02-25',
      program: 'Full Stack Development'
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700';
      case 'submitted':
        return 'bg-blue-100 text-blue-700';
      case 'in_progress':
        return 'bg-indigo-100 text-indigo-700';
      case 'revision_needed':
        return 'bg-orange-100 text-orange-700';
      case 'assigned':
        return 'bg-slate-100 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'submitted':
        return <Clock className="w-4 h-4" />;
      case 'in_progress':
        return <Clock className="w-4 h-4" />;
      case 'revision_needed':
        return <AlertCircle className="w-4 h-4" />;
      case 'assigned':
        return <Calendar className="w-4 h-4" />;
      default:
        return <XCircle className="w-4 h-4" />;
    }
  };

  const stats = [
    { label: 'Completed', value: tasks.filter(t => t.status === 'completed').length, color: 'green' },
    { label: 'In Progress', value: tasks.filter(t => t.status === 'in_progress').length, color: 'blue' },
    { label: 'Pending Review', value: tasks.filter(t => t.status === 'submitted').length, color: 'yellow' },
    { label: 'Needs Revision', value: tasks.filter(t => t.status === 'revision_needed').length, color: 'orange' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-slate-900 mb-2">My Tasks</h1>
        <p className="text-slate-600">Track and manage your learning assignments</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl p-6 border border-slate-200">
            <div className="text-slate-600 text-sm mb-2">{stat.label}</div>
            <div className="text-slate-900 text-3xl">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none"
            >
              <option value="all">All Tasks</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="submitted">Submitted</option>
              <option value="revision_needed">Needs Revision</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tasks List */}
      <div className="space-y-4">
        {tasks.map((task) => (
          <div key={task.id} className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg hover:shadow-slate-200/50 transition-shadow">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-slate-900">{task.title}</h3>
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs ${getStatusColor(task.status)}`}>
                        {getStatusIcon(task.status)}
                        {task.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-slate-600 text-sm mb-3">{task.description}</p>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Due: {task.dueDate}
                      </span>
                      {task.submittedDate && (
                        <span>Submitted: {task.submittedDate}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Feedback */}
                {task.feedback && (
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-slate-900 text-sm">Mentor Feedback</span>
                      {task.rating && (
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-4 h-4 ${
                                i < task.rating
                                  ? 'text-yellow-500 fill-yellow-500'
                                  : 'text-slate-300'
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-slate-600 text-sm">{task.feedback}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex lg:flex-col gap-2">
                {task.status === 'assigned' || task.status === 'revision_needed' ? (
                  <Link
                    href={`/mentee/tasks/${task.id}/submit`}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm transition-colors flex items-center gap-2 justify-center"
                  >
                    {task.status === 'revision_needed' ? 'Resubmit' : 'Start Task'}
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                ) : task.status === 'in_progress' ? (
                  <Link
                    href={`/mentee/tasks/${task.id}/submit`}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm transition-colors flex items-center gap-2 justify-center"
                  >
                    Continue
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                ) : task.status === 'completed' ? (
                  <Link
                    href={`/mentee/feedback/${task.id}`}
                    className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-sm transition-colors flex items-center gap-2 justify-center"
                  >
                    View Feedback
                  </Link>
                ) : (
                  <button className="px-4 py-2 bg-slate-100 text-slate-500 rounded-xl text-sm cursor-not-allowed">
                    Under Review
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
