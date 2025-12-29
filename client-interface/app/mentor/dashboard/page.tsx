'use client';

import Link from 'next/link';
import { Users, ClipboardList, Star, Clock, CheckCircle2, MessageSquare, TrendingUp } from 'lucide-react';

export default function MentorDashboard() {
  const stats = [
    { label: 'My Mentees', value: '6', icon: Users, color: 'indigo' },
    { label: 'Pending Reviews', value: '3', icon: Clock, color: 'yellow' },
    { label: 'Tasks Assigned', value: '24', icon: ClipboardList, color: 'blue' },
    { label: 'Avg. Rating', value: '4.9', icon: Star, color: 'purple' },
  ];

  const mentees = [
    {
      id: 1,
      name: 'Sarah Johnson',
      program: 'Full Stack Development',
      progress: 68,
      tasksCompleted: 12,
      totalTasks: 18,
      pendingReviews: 1,
      lastActivity: '2 hours ago',
      status: 'active',
    },
    {
      id: 2,
      name: 'Michael Chen',
      program: 'Mobile Development',
      progress: 52,
      tasksCompleted: 9,
      totalTasks: 18,
      pendingReviews: 2,
      lastActivity: '1 day ago',
      status: 'active',
    },
    {
      id: 3,
      name: 'Emily Davis',
      program: 'Full Stack Development',
      progress: 35,
      tasksCompleted: 6,
      totalTasks: 18,
      pendingReviews: 0,
      lastActivity: '3 hours ago',
      status: 'active',
    },
  ];

  const pendingReviews = [
    { id: 1, mentee: 'Sarah Johnson', task: 'Build REST API', submittedDate: '2024-01-15', hoursAgo: 2 },
    { id: 2, mentee: 'Michael Chen', task: 'React Components', submittedDate: '2024-01-14', hoursAgo: 18 },
    { id: 3, mentee: 'Michael Chen', task: 'State Management', submittedDate: '2024-01-14', hoursAgo: 22 },
  ];

  const recentActivity = [
    { id: 1, type: 'submission', mentee: 'Sarah Johnson', action: 'submitted', task: 'Build REST API', time: '2 hours ago' },
    { id: 2, type: 'completed', mentee: 'Emily Davis', action: 'completed', task: 'Setup Development', time: '3 hours ago' },
    { id: 3, type: 'question', mentee: 'Michael Chen', action: 'asked a question about', task: 'State Management', time: '5 hours ago' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl text-slate-900 mb-2">Mentor Dashboard</h1>
          <p className="text-slate-600">Guide and support your mentees on their learning journey.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
          {/* Left Column - My Mentees & Recent Activity */}
          <div className="lg:col-span-2 space-y-6">
            {/* My Mentees */}
            <div className="bg-white rounded-2xl border border-slate-200">
              <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-slate-900">My Mentees</h2>
                <Link href="/mentor/tasks/assign" className="text-indigo-600 hover:text-indigo-700 text-sm">
                  Assign Tasks
                </Link>
              </div>
              <div className="divide-y divide-slate-200">
                {mentees.map((mentee) => (
                  <div key={mentee.id} className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-slate-600">
                            {mentee.name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-slate-900 mb-1">{mentee.name}</h3>
                          <p className="text-slate-600 text-sm mb-2">{mentee.program}</p>
                          <div className="flex items-center gap-4 text-sm text-slate-600">
                            <span>{mentee.tasksCompleted}/{mentee.totalTasks} tasks</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {mentee.lastActivity}
                            </span>
                          </div>
                        </div>
                      </div>
                      {mentee.pendingReviews > 0 && (
                        <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-sm">
                          {mentee.pendingReviews} pending
                        </span>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full"
                          style={{ width: `${mentee.progress}%` }}
                        />
                      </div>
                      <span className="text-sm text-slate-600">{mentee.progress}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-2xl border border-slate-200">
              <div className="px-6 py-5 border-b border-slate-200">
                <h2 className="text-slate-900">Recent Activity</h2>
              </div>
              <div className="divide-y divide-slate-200">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="px-6 py-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        activity.type === 'submission' ? 'bg-blue-100' :
                        activity.type === 'completed' ? 'bg-green-100' : 'bg-purple-100'
                      }`}>
                        {activity.type === 'submission' ? (
                          <Clock className="w-5 h-5 text-blue-600" />
                        ) : activity.type === 'completed' ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        ) : (
                          <MessageSquare className="w-5 h-5 text-purple-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-slate-900 text-sm">
                          <span className="text-slate-700">{activity.mentee}</span> {activity.action}{' '}
                          <span className="text-slate-700">{activity.task}</span>
                        </p>
                        <p className="text-slate-500 text-xs mt-1">{activity.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
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
                  <span className="w-6 h-6 bg-yellow-100 text-yellow-700 rounded-full flex items-center justify-center text-xs">
                    {pendingReviews.length}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-slate-200">
                {pendingReviews.map((review) => (
                  <Link
                    key={review.id}
                    href={`/mentor/tasks/${review.id}/feedback`}
                    className="block px-6 py-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-slate-600 text-sm">
                          {review.mentee.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-slate-900 text-sm mb-1">{review.mentee}</div>
                        <div className="text-slate-600 text-xs mb-2">{review.task}</div>
                        <div className="flex items-center gap-1 text-yellow-600 text-xs">
                          <Clock className="w-3 h-3" />
                          {review.hoursAgo}h ago
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="px-6 py-4 border-t border-slate-200">
                <Link
                  href="/mentor/tasks/review"
                  className="block text-center text-indigo-600 hover:text-indigo-700 text-sm"
                >
                  View All Submissions
                </Link>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="text-slate-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <Link
                  href="/mentor/tasks/assign"
                  className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <ClipboardList className="w-5 h-5 text-indigo-600" />
                  </div>
                  <span className="text-slate-700">Assign New Task</span>
                </Link>
                <Link
                  href="/mentor/tasks/review"
                  className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-purple-600" />
                  </div>
                  <span className="text-slate-700">Review Submissions</span>
                </Link>
              </div>
            </div>

            {/* Performance Stats */}
            <div className="bg-linear-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-6">
              <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-indigo-900 mb-2">Great Performance!</h3>
              <p className="text-indigo-700 text-sm mb-4">
                Your mentees have a 92% task completion rate this month.
              </p>
              <div className="flex items-center gap-2 text-indigo-600 text-sm">
                <Star className="w-4 h-4 fill-indigo-600" />
                <span>Top 10% of mentors</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
