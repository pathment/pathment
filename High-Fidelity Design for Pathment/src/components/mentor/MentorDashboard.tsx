import React from 'react';
import { Link } from 'react-router-dom';
import Navigation from '../shared/Navigation';
import {
  Users,
  ClipboardList,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  Star,
  TrendingUp,
  MessageSquare
} from 'lucide-react';

export default function MentorDashboard() {
  const stats = [
    { label: 'My Mentees', value: '6', icon: Users, color: 'indigo' },
    { label: 'Pending Reviews', value: '3', icon: Clock, color: 'yellow' },
    { label: 'Tasks Assigned', value: '24', icon: ClipboardList, color: 'blue' },
    { label: 'Avg. Rating', value: '4.9', icon: Star, color: 'purple' }
  ];

  const mentees = [
    {
      id: 1,
      name: 'Alex Thompson',
      program: 'Full Stack Development',
      progress: 68,
      tasksCompleted: 12,
      totalTasks: 18,
      pendingReviews: 1,
      lastActivity: '2 hours ago',
      status: 'active'
    },
    {
      id: 2,
      name: 'Maria Garcia',
      program: 'Full Stack Development',
      progress: 52,
      tasksCompleted: 9,
      totalTasks: 18,
      pendingReviews: 2,
      lastActivity: '1 day ago',
      status: 'active'
    },
    {
      id: 3,
      name: 'James Wilson',
      program: 'Full Stack Development',
      progress: 35,
      tasksCompleted: 6,
      totalTasks: 18,
      pendingReviews: 0,
      lastActivity: '3 hours ago',
      status: 'active'
    }
  ];

  const pendingReviews = [
    {
      id: 1,
      mentee: 'Alex Thompson',
      task: 'Build a React component library',
      submittedDate: '2024-02-18',
      hoursAgo: 4
    },
    {
      id: 2,
      mentee: 'Maria Garcia',
      task: 'Implement user authentication',
      submittedDate: '2024-02-17',
      hoursAgo: 24
    },
    {
      id: 3,
      mentee: 'Maria Garcia',
      task: 'Create REST API endpoints',
      submittedDate: '2024-02-17',
      hoursAgo: 26
    }
  ];

  const recentActivity = [
    {
      id: 1,
      type: 'submission',
      mentee: 'Alex Thompson',
      action: 'submitted',
      task: 'Build a React component library',
      time: '4 hours ago'
    },
    {
      id: 2,
      type: 'completed',
      mentee: 'James Wilson',
      action: 'completed',
      task: 'JavaScript array methods',
      time: '1 day ago'
    },
    {
      id: 3,
      type: 'question',
      mentee: 'Maria Garcia',
      action: 'asked a question about',
      task: 'Database schema design',
      time: '2 days ago'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation role="mentor" />
      
      <div className="lg:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-slate-900 mb-2">Mentor Dashboard</h1>
            <p className="text-slate-600">Manage your mentees and review their progress</p>
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
              {/* My Mentees */}
              <div className="bg-white rounded-2xl border border-slate-200">
                <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-slate-900">My Mentees</h2>
                  <Link to="/mentor/tasks/assign" className="text-indigo-600 hover:text-indigo-700 text-sm">
                    Assign Tasks
                  </Link>
                </div>
                <div className="divide-y divide-slate-200">
                  {mentees.map((mentee) => (
                    <div key={mentee.id} className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
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
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
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
                      to={`/mentor/tasks/${review.id}/feedback`}
                      className="block px-6 py-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
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
                    to="/mentor/tasks/review"
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
                    to="/mentor/tasks/assign"
                    className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors"
                  >
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <ClipboardList className="w-5 h-5 text-indigo-600" />
                    </div>
                    <span className="text-slate-700">Assign New Task</span>
                  </Link>
                  <Link
                    to="/mentor/tasks/review"
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
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-6">
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
    </div>
  );
}
