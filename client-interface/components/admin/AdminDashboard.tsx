'use client';

import React from 'react';
import Link from 'next/link';
import { 
  BookOpen, 
  Users, 
  UserCheck, 
  TrendingUp, 
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  ArrowUpRight,
  Calendar
} from 'lucide-react';

export default function AdminDashboard() {
  const stats = [
    { label: 'Total Programs', value: '24', change: '+12%', icon: BookOpen, color: 'indigo' },
    { label: 'Active Mentees', value: '156', change: '+8%', icon: Users, color: 'green' },
    { label: 'Active Mentors', value: '42', change: '+5%', icon: UserCheck, color: 'purple' },
    { label: 'Completion Rate', value: '87%', change: '+3%', icon: TrendingUp, color: 'blue' },
  ];

  const recentPrograms = [
    { 
      id: 1, 
      name: 'Full Stack Development Bootcamp', 
      enrollments: 45, 
      status: 'active', 
      completion: 68,
      startDate: '2024-01-15'
    },
    { 
      id: 2, 
      name: 'UI/UX Design Mastery', 
      enrollments: 32, 
      status: 'active', 
      completion: 82,
      startDate: '2024-01-20'
    },
    { 
      id: 3, 
      name: 'Data Science Fundamentals', 
      enrollments: 28, 
      status: 'active', 
      completion: 45,
      startDate: '2024-02-01'
    },
    { 
      id: 4, 
      name: 'Mobile App Development', 
      enrollments: 51, 
      status: 'pending', 
      completion: 0,
      startDate: '2024-03-01'
    },
  ];

  const pendingMatches = [
    { id: 1, mentee: 'Sarah Johnson', program: 'Full Stack Development', waitTime: '2 days' },
    { id: 2, mentee: 'Michael Chen', program: 'UI/UX Design', waitTime: '1 day' },
    { id: 3, mentee: 'Emma Wilson', program: 'Data Science', waitTime: '5 hours' },
  ];

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage programs, mentors, and enrollments</p>
        </div>
        <Link
          href="/admin/programs/create"
          className="mt-4 sm:mt-0 inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 rounded-xl transition-colors"
        >
          <Plus className="w-5 h-5" />
          Create Program
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-card rounded-2xl p-6 border border-border">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 bg-${stat.color}-100 rounded-xl flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 text-${stat.color}-600`} />
                    </div>
                    <span className="text-green-600 text-sm flex items-center gap-1">
                      <ArrowUpRight className="w-4 h-4" />
                      {stat.change}
                    </span>
                  </div>
                  <div className="text-slate-600 text-sm mb-1">{stat.label}</div>
                  <div className="text-slate-900 text-2xl">{stat.value}</div>
                </div>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Recent Programs */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl border border-slate-200">
                <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-slate-900">Active Programs</h2>
                  <Link to="/admin/programs" className="text-indigo-600 hover:text-indigo-700 text-sm">
                    View all
                  </Link>
                </div>
                <div className="divide-y divide-slate-200">
                  {recentPrograms.map((program) => (
                    <Link
                      key={program.id}
                      to={`/admin/programs/${program.id}`}
                      className="block px-6 py-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="text-slate-900 mb-1">{program.name}</h3>
                          <div className="flex items-center gap-4 text-sm text-slate-600">
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {program.enrollments} enrolled
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {program.startDate}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-lg text-xs ${
                            program.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {program.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 rounded-full"
                            style={{ width: `${program.completion}%` }}
                          />
                        </div>
                        <span className="text-sm text-slate-600">{program.completion}%</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Pending Matches */}
            <div>
              <div className="bg-white rounded-2xl border border-slate-200">
                <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-slate-900">Pending Matches</h2>
                    <span className="w-6 h-6 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs">
                      {pendingMatches.length}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-slate-200">
                  {pendingMatches.map((match) => (
                    <div key={match.id} className="px-6 py-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-slate-600 text-sm">
                            {match.mentee.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-slate-900 text-sm mb-1">{match.mentee}</div>
                          <div className="text-slate-600 text-xs mb-2">{match.program}</div>
                          <div className="flex items-center gap-1 text-orange-600 text-xs">
                            <Clock className="w-3 h-3" />
                            Waiting {match.waitTime}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-6 py-4 border-t border-slate-200">
                  <Link
                    to="/admin/mentors/assign"
                    className="block text-center text-indigo-600 hover:text-indigo-700 text-sm"
                  >
                    Assign Mentors
                  </Link>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="mt-6 bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="text-slate-900 mb-4">Quick Actions</h3>
                <div className="space-y-3">
                  <Link
                    to="/admin/programs/create"
                    className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors"
                  >
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <Plus className="w-5 h-5 text-indigo-600" />
                    </div>
                    <span className="text-slate-700">Create Program</span>
                  </Link>
                  <Link
                    to="/admin/mentors/assign"
                    className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors"
                  >
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <UserCheck className="w-5 h-5 text-purple-600" />
                    </div>
                    <span className="text-slate-700">Assign Mentors</span>
                  </Link>
                  <Link
                    to="/admin/enrollments"
                    className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors"
                  >
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                    <span className="text-foreground">View Enrollments</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
    </>
  );
}
