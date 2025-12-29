import React, { useState } from 'react';
import { Link, useRouter } from 'next/navigation';
import Navigation from '../shared/Navigation';
import { ArrowLeft, Search, Filter, Download, CheckCircle2, Clock, XCircle, User } from 'lucide-react';

export default function EnrollmentOverview() {
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const enrollments = [
    {
      id: 1,
      menteeName: 'Alex Thompson',
      mentorName: 'Sarah Johnson',
      program: 'Full Stack Development Bootcamp',
      status: 'active',
      startDate: '2024-01-15',
      progress: 68,
      tasksCompleted: 24,
      totalTasks: 35
    },
    {
      id: 2,
      menteeName: 'Maria Garcia',
      mentorName: 'Michael Chen',
      program: 'Full Stack Development Bootcamp',
      status: 'active',
      startDate: '2024-01-20',
      progress: 52,
      tasksCompleted: 18,
      totalTasks: 35
    },
    {
      id: 3,
      menteeName: 'James Wilson',
      mentorName: null,
      program: 'Full Stack Development Bootcamp',
      status: 'pending',
      startDate: '2024-02-05',
      progress: 0,
      tasksCompleted: 0,
      totalTasks: 35
    },
    {
      id: 4,
      menteeName: 'Emily Davis',
      mentorName: 'Sarah Johnson',
      program: 'UI/UX Design Mastery',
      status: 'active',
      startDate: '2024-01-10',
      progress: 89,
      tasksCompleted: 32,
      totalTasks: 36
    },
    {
      id: 5,
      menteeName: 'David Kim',
      mentorName: 'Emma Wilson',
      program: 'Data Science Fundamentals',
      status: 'completed',
      startDate: '2023-11-01',
      progress: 100,
      tasksCompleted: 40,
      totalTasks: 40
    },
    {
      id: 6,
      menteeName: 'Sophie Chen',
      mentorName: null,
      program: 'Mobile App Development',
      status: 'pending',
      startDate: '2024-02-10',
      progress: 0,
      tasksCompleted: 0,
      totalTasks: 30
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      case 'completed':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4" />;
      default:
        return <XCircle className="w-4 h-4" />;
    }
  };

  const stats = [
    { label: 'Total Enrollments', value: enrollments.length, color: 'indigo' },
    { label: 'Active', value: enrollments.filter(e => e.status === 'active').length, color: 'green' },
    { label: 'Pending Match', value: enrollments.filter(e => e.status === 'pending').length, color: 'yellow' },
    { label: 'Completed', value: enrollments.filter(e => e.status === 'completed').length, color: 'blue' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation role="admin" />
      
      <div className="lg:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
            <div>
              <Link
                to="/admin/dashboard"
                className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to Dashboard
              </Link>
              <h1 className="text-slate-900 mb-2">Enrollment Overview</h1>
              <p className="text-slate-600">Track mentee-mentor pairings and program progress</p>
            </div>
            <button className="mt-4 sm:mt-0 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors flex items-center gap-2">
              <Download className="w-5 h-5" />
              Export Data
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
                  placeholder="Search by mentee, mentor, or program..."
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
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="pending">Pending Match</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
          </div>

          {/* Enrollments Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-slate-700 text-sm">Mentee</th>
                    <th className="px-6 py-4 text-left text-slate-700 text-sm">Mentor</th>
                    <th className="px-6 py-4 text-left text-slate-700 text-sm">Program</th>
                    <th className="px-6 py-4 text-left text-slate-700 text-sm">Status</th>
                    <th className="px-6 py-4 text-left text-slate-700 text-sm">Progress</th>
                    <th className="px-6 py-4 text-left text-slate-700 text-sm">Start Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {enrollments.map((enrollment) => (
                    <tr key={enrollment.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-slate-600" />
                          </div>
                          <span className="text-slate-900">{enrollment.menteeName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {enrollment.mentorName ? (
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-purple-200 rounded-full flex items-center justify-center">
                              <span className="text-purple-700 text-xs">
                                {enrollment.mentorName.split(' ').map(n => n[0]).join('')}
                              </span>
                            </div>
                            <span className="text-slate-900 text-sm">{enrollment.mentorName}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-sm">Not assigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-slate-900 text-sm">{enrollment.program}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs ${getStatusColor(enrollment.status)}`}>
                          {getStatusIcon(enrollment.status)}
                          {enrollment.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 max-w-[120px] h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-600 rounded-full"
                              style={{ width: `${enrollment.progress}%` }}
                            />
                          </div>
                          <span className="text-slate-600 text-sm">{enrollment.progress}%</span>
                        </div>
                        <div className="text-slate-500 text-xs mt-1">
                          {enrollment.tasksCompleted}/{enrollment.totalTasks} tasks
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-slate-600 text-sm">{enrollment.startDate}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
