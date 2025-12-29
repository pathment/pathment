import React, { useState } from 'react';
import { Link, useRouter } from 'next/navigation';
import Navigation from '../shared/Navigation';
import {
  Search,
  Filter,
  Clock,
  Calendar,
  User,
  ExternalLink,
  FileText,
  MessageSquare,
  AlertCircle
} from 'lucide-react';

export default function ReviewQueue() {
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const submissions = [
    {
      id: 1,
      mentee: 'Alex Thompson',
      task: 'Build a React component library',
      program: 'Full Stack Development',
      submittedDate: '2024-02-18',
      hoursAgo: 4,
      priority: 'high',
      hasFiles: true,
      hasLinks: true,
      description: 'I built a comprehensive React component library with TypeScript...'
    },
    {
      id: 2,
      mentee: 'Maria Garcia',
      task: 'Implement user authentication',
      program: 'Full Stack Development',
      submittedDate: '2024-02-17',
      hoursAgo: 24,
      priority: 'medium',
      hasFiles: false,
      hasLinks: true,
      description: 'Implemented JWT-based authentication with refresh tokens...'
    },
    {
      id: 3,
      mentee: 'Maria Garcia',
      task: 'Create REST API endpoints',
      program: 'Full Stack Development',
      submittedDate: '2024-02-17',
      hoursAgo: 26,
      priority: 'medium',
      hasFiles: true,
      hasLinks: true,
      description: 'Built CRUD operations for user management and products...'
    },
    {
      id: 4,
      mentee: 'James Wilson',
      task: 'Database design and schema',
      program: 'Full Stack Development',
      submittedDate: '2024-02-16',
      hoursAgo: 48,
      priority: 'low',
      hasFiles: true,
      hasLinks: false,
      description: 'Designed a normalized database schema for the e-commerce application...'
    }
  ];

  const stats = [
    { label: 'Pending Reviews', value: submissions.length, color: 'yellow' },
    { label: 'High Priority', value: submissions.filter(s => s.priority === 'high').length, color: 'red' },
    { label: 'Avg. Review Time', value: '18h', color: 'blue' },
  ];

  const getUrgencyColor = (hoursAgo: number) => {
    if (hoursAgo > 48) return 'text-red-600 bg-red-50 border-red-200';
    if (hoursAgo > 24) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-slate-600 bg-slate-50 border-slate-200';
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation role="mentor" />
      
      <div className="lg:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-slate-900 mb-2">Review Queue</h1>
            <p className="text-slate-600">Review and provide feedback on mentee submissions</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-white rounded-2xl p-6 border border-slate-200">
                <div className="text-slate-600 text-sm mb-2">{stat.label}</div>
                <div className="text-slate-900 text-3xl">{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search submissions..."
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
                  <option value="all">All Submissions</option>
                  <option value="high">High Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="low">Low Priority</option>
                </select>
              </div>
            </div>
          </div>

          {/* Submissions List */}
          <div className="space-y-4">
            {submissions.map((submission) => (
              <div
                key={submission.id}
                className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg hover:shadow-slate-200/50 transition-shadow"
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="flex-1">
                    {/* Header */}
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-6 h-6 text-slate-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-slate-900">{submission.mentee}</h3>
                          {submission.priority === 'high' && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                              High Priority
                            </span>
                          )}
                        </div>
                        <p className="text-slate-900 mb-1">{submission.task}</p>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            Submitted {submission.submittedDate}
                          </span>
                          <span className={`px-2 py-1 rounded border text-xs ${getUrgencyColor(submission.hoursAgo)}`}>
                            <Clock className="w-3 h-3 inline mr-1" />
                            {submission.hoursAgo}h ago
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Description Preview */}
                    <div className="p-4 bg-slate-50 rounded-xl mb-4">
                      <p className="text-slate-700 text-sm line-clamp-2">{submission.description}</p>
                    </div>

                    {/* Attachments */}
                    <div className="flex flex-wrap gap-3">
                      {submission.hasLinks && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm">
                          <ExternalLink className="w-4 h-4" />
                          Project Links
                        </div>
                      )}
                      {submission.hasFiles && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm">
                          <FileText className="w-4 h-4" />
                          Attachments
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex lg:flex-col gap-2">
                    <Link
                      to={`/mentor/tasks/${submission.id}/feedback`}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm transition-colors flex items-center gap-2 justify-center"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Review & Feedback
                    </Link>
                  </div>
                </div>

                {/* Urgency Alert for Old Submissions */}
                {submission.hoursAgo > 48 && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-red-900 text-sm">
                        This submission has been waiting for more than 48 hours
                      </p>
                      <p className="text-red-700 text-xs mt-1">
                        Please provide feedback to keep your mentee engaged
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Empty State */}
          {submissions.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-slate-900 mb-2">No submissions to review</h3>
              <p className="text-slate-600 text-sm">
                All caught up! Check back later for new submissions.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
