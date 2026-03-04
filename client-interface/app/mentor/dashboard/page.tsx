'use client';

import Link from 'next/link';
import { Users, ClipboardList, Star, Clock, CheckCircle2, TrendingUp, Loader2, BookOpen } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { useMentorDashboard } from '@/lib/hooks/mentor';

export default function MentorDashboard() {
  const { user } = useAuth();
  const { activeMentees, programsCount, loading } = useMentorDashboard();

  const pendingReviewsCount = 0; // TODO: Implement task submissions API

  const stats = [
    { label: 'Active Mentees', value: activeMentees.length.toString(), icon: Users, color: 'indigo' },
    { label: 'Programs', value: programsCount.toString(), icon: BookOpen, color: 'blue' },
    { label: 'Pending Reviews', value: pendingReviewsCount.toString(), icon: Clock, color: 'yellow' },
    { label: 'Avg. Rating', value: '4.9', icon: Star, color: 'purple' },
  ];

  const recentActivity: any[] = []; // TODO: Implement activity feed

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-slate-900 mb-2">Welcome back{user?.firstName ? `, ${user.firstName}` : ''}!</h1>
        <p className="text-slate-600">Guide and support your mentees on their learning journey</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const bgColor = stat.color === 'indigo' ? 'bg-indigo-100' :
                         stat.color === 'yellow' ? 'bg-yellow-100' :
                         stat.color === 'blue' ? 'bg-blue-100' : 'bg-purple-100';
          const textColor = stat.color === 'indigo' ? 'text-indigo-600' :
                           stat.color === 'yellow' ? 'text-yellow-600' :
                           stat.color === 'blue' ? 'text-blue-600' : 'text-purple-600';

          return (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 ${bgColor} rounded-xl flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${textColor}`} />
                </div>
              </div>
              <div className="text-3xl text-slate-900 mb-1">{stat.value}</div>
              <div className="text-slate-600 text-sm">{stat.label}</div>
            </div>
          );
        })}
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left Column - My Mentees */}
        <div className="lg:col-span-2 space-y-6">
          {/* My Mentees */}
          <div className="bg-white rounded-2xl border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-slate-900">My Mentees</h2>
              <Link href="/mentor/mentees" className="text-indigo-600 hover:text-indigo-700 text-sm">
                View All
              </Link>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              </div>
            ) : activeMentees.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 mb-2">No active mentees yet</p>
                <p className="text-slate-500 text-sm">You'll see your mentees here once admin assigns them to you</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {activeMentees.slice(0, 5).map((match) => {
                  const mentee = match.mentee;
                  const enrollment = match.enrollment;
                  return (
                    <div key={match.id} className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 bg-indigo-200 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-indigo-700">
                              {mentee?.firstName?.[0]}{mentee?.lastName?.[0]}
                            </span>
                          </div>
                          <div className="flex-1">
                            <h3 className="text-slate-900 mb-1">
                              {mentee?.firstName} {mentee?.lastName}
                            </h3>
                            <p className="text-slate-600 text-sm mb-2">
                              {enrollment?.program?.name || 'Unknown Program'}
                            </p>
                            <div className="flex items-center gap-4 text-sm text-slate-600">
                              <span>Week {enrollment?.currentWeek || 1}</span>
                              <span>•</span>
                              <span>{match?.level?.name || enrollment?.currentLevel?.name || 'Level 1'}</span>
                            </div>
                          </div>
                        </div>
                        {pendingReviewsCount > 0 && (
                          <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-sm">
                            {pendingReviewsCount} pending
                          </span>
                        )}
                      </div>

                      {/* Progress Bar */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 rounded-full"
                            style={{ width: `${parseFloat(enrollment?.overallProgressPercentage) || 0}%` }}
                          />
                        </div>
                        <span className="text-sm text-slate-600">
                          {parseFloat(enrollment?.overallProgressPercentage) || 0}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-2xl border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-200">
              <h2 className="text-slate-900">Recent Activity</h2>
            </div>
            <div className="p-6">
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 text-sm">No recent activity</p>
                <p className="text-slate-500 text-xs mt-1">Task submissions and completions will appear here</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Pending Reviews */}
          <div className="bg-white rounded-2xl border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-slate-900">Pending Reviews</h3>
                {pendingReviewsCount > 0 && (
                  <span className="w-6 h-6 bg-yellow-100 text-yellow-700 rounded-full flex items-center justify-center text-xs">
                    {pendingReviewsCount}
                  </span>
                )}
              </div>
            </div>
            <div className="p-6">
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 text-sm">No pending reviews</p>
                <p className="text-slate-500 text-xs mt-1">Task submissions will appear here</p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-slate-900 mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <Link
                href="/mentor/tasks"
                className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors"
              >
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-indigo-600" />
                </div>
                <span className="text-slate-700">Manage Tasks</span>
              </Link>
              <Link
                href="/mentor/mentees"
                className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors"
              >
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
                <span className="text-slate-700">View All Mentees</span>
              </Link>
            </div>
          </div>

          {/* Performance Stats */}
          <div className="bg-linear-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-6">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-indigo-900 mb-2">Great Mentoring!</h3>
            <p className="text-indigo-700 text-sm mb-4">
              {activeMentees.length > 0 
                ? `You're guiding ${activeMentees.length} mentee${activeMentees.length > 1 ? 's' : ''} to success`
                : 'Ready to start mentoring when mentees are assigned'}
            </p>
            <div className="flex items-center gap-2 text-indigo-600 text-sm">
              <Star className="w-4 h-4 fill-indigo-600" />
              <span>4.9/5.0 avg rating</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
