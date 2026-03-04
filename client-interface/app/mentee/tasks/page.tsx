'use client';

import { useRouter } from 'next/navigation';
import { Search, Clock, CheckCircle2, AlertCircle, FileText, Loader2, Star, Calendar, XCircle, BookOpen, Sparkles, GraduationCap } from 'lucide-react';
import { useMenteeTasks } from '@/lib/hooks/mentee';

export default function MenteeTasks() {
  const router = useRouter();
  const {
    filteredTasks,
    stats,
    loading,
    enrollments,
    selectedEnrollmentId,
    filterStatus,
    searchTerm,
    setSelectedEnrollmentId,
    setFilterStatus,
    setSearchTerm,
    handleStartTask,
  } = useMenteeTasks();const getStatusBadge = (status: string) => {
    const badges: any = {
      assigned: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'New', icon: AlertCircle },
      in_progress: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'In Progress', icon: Clock },
      submitted: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Submitted', icon: FileText },
      revision_needed: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Needs Revision', icon: AlertCircle },
      completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Completed', icon: CheckCircle2 },
      cancelled: { bg: 'bg-red-100', text: 'text-red-700', label: 'Cancelled', icon: XCircle }
    };
    const badge = badges[status] || badges.assigned;
    const Icon = badge.icon;
    
    return (
      <span className={`px-3 py-1 ${badge.bg} ${badge.text} rounded-lg text-sm flex items-center gap-1 font-medium`}>
        <Icon className="w-4 h-4" />
        {badge.label}
      </span>
    );
  };

  const getTaskSourceBadge = (isCustomTask: boolean) => {
    return isCustomTask ? (
      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium flex items-center gap-1">
        <Sparkles className="w-3 h-3" />
        Custom
      </span>
    ) : (
      <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium flex items-center gap-1">
        <BookOpen className="w-3 h-3" />
        Roadmap
      </span>
    );
  };

  const getDifficultyBadge = (difficulty: string) => {
    const badges: any = {
      easy: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
      medium: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
      hard: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
      expert: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' }
    };
    const badge = badges[difficulty] || badges.medium;
    return (
      <span className={`px-2 py-1 ${badge.bg} ${badge.text} border ${badge.border} rounded text-xs font-medium`}>
        {difficulty?.toUpperCase()}
      </span>
    );
  };

  const isOverdue = (dueDate: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-slate-900 mb-2">My Tasks</h1>
        <p className="text-slate-600">Track your learning progress and submit your work</p>
      </div>

      {/* Program Selector */}
      {enrollments.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-600">Program</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {enrollments.map((enrollment: any) => {
              const isSelected = enrollment.id === selectedEnrollmentId;
              return (
                <button
                  key={enrollment.id}
                  onClick={() => setSelectedEnrollmentId(enrollment.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600'
                  }`}
                >
                  {enrollment.program?.name || 'Program'}
                  {enrollment.status === 'completed' && (
                    <span className="ml-2 text-xs opacity-75">(Completed)</span>
                  )}
                </button>
              );
            })}
            {enrollments.length > 1 && (
              <button
                onClick={() => setSelectedEnrollmentId(null)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                  selectedEnrollmentId === null
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600'
                }`}
              >
                All Programs
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="text-slate-600 text-sm mb-1">Total Tasks</div>
          <div className="text-slate-900 text-2xl font-bold">{stats?.total || 0}</div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="text-slate-600 text-sm mb-1">Completed</div>
          <div className="text-green-600 text-2xl font-bold flex items-center gap-2">
            {stats?.completed || 0}
            {stats?.total > 0 && (
              <span className="text-xs text-slate-500">
                ({Math.round(((stats?.completed || 0) / stats?.total) * 100)}%)
              </span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="text-slate-600 text-sm mb-1">Pending Review</div>
          <div className="text-purple-600 text-2xl font-bold">{stats?.submitted || 0}</div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="text-slate-600 text-sm mb-1">In Progress</div>
          <div className="text-yellow-600 text-2xl font-bold">{stats?.inProgress || 0}</div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <div className="text-slate-600 text-sm mb-1">Overdue</div>
          <div className="text-red-600 text-2xl font-bold">{stats?.overdue || 0}</div>
        </div>
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

          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="all">All Tasks</option>
              <option value="assigned">New Tasks</option>
              <option value="in_progress">In Progress</option>
              <option value="submitted">Submitted</option>
              <option value="revision_needed">Needs Revision</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tasks List */}
      <div className="bg-white rounded-2xl border border-slate-200">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 mb-2">No tasks found</p>
            <p className="text-slate-500 text-sm">
              {searchTerm ? 'Try a different search term' : filterStatus !== 'all' ? 'No tasks in this category' : 'Tasks will appear here when assigned'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredTasks.map((task) => {
              const overdue = isOverdue(task.dueDate) && !['completed', 'submitted'].includes(task.status);
              
              return (
                <div key={task.id} className="p-6 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-slate-900">{task.roadmapTask?.title}</h3>
                        {getTaskSourceBadge(task.isCustomTask)}
                        {getDifficultyBadge(task.roadmapTask?.difficulty)}
                      </div>
                      
                      {/* Show cancellation info if task is cancelled */}
                      {task.status === 'cancelled' && task.cancellationReason && (
                        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-red-900 font-medium text-sm">Task Cancelled</p>
                              <p className="text-red-700 text-sm mt-1">{task.cancellationReason}</p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <p className="text-slate-600 text-sm line-clamp-2 mb-3">
                        {task.roadmapTask?.description}
                      </p>
                      
                      <div className="flex items-center gap-4 text-sm text-slate-600">
                        {task.roadmapTask?.week && (
                          <>
                            <span>Week {task.roadmapTask.week.weekNumber}</span>
                            <span>•</span>
                          </>
                        )}
                        {task.dueDate && (
                          <>
                            <span className={`flex items-center gap-1 ${overdue ? 'text-red-600' : ''}`}>
                              <Calendar className="w-4 h-4" />
                              Due {new Date(task.dueDate).toLocaleDateString()}
                              {overdue && ' (Overdue)'}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        <span>{task.roadmapTask?.estimatedHours || 0}h estimated</span>
                        {task.roadmapTask?.pointsBase && (
                          <>
                            <span>•</span>
                            <span>{task.roadmapTask.pointsBase} points</span>
                          </>
                        )}
                      </div>
                      
                      {task.finalRating && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-4 h-4 ${
                                  star <= task.finalRating
                                    ? 'fill-yellow-400 text-yellow-400'
                                    : 'text-slate-300'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-slate-600 text-sm">
                            {task.pointsAwarded} points earned
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(task.status)}
                      
                      {task.status === 'assigned' && (
                        <button
                          onClick={() => handleStartTask(task.id)}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors"
                        >
                          Start Task
                        </button>
                      )}
                      
                      {(task.status === 'in_progress' || task.status === 'revision_needed') && (
                        <button
                          onClick={() => router.push(`/mentee/tasks/${task.id}/submit`)}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors"
                        >
                          Submit Work
                        </button>
                      )}
                      
                      {task.status === 'submitted' && (
                        <span className="text-slate-600 text-sm">
                          Awaiting review
                        </span>
                      )}
                      
                      {task.status === 'cancelled' && (
                        <span className="text-red-600 text-sm">
                          No action needed
                        </span>
                      )}

                      {task.status === 'completed' && task.submissions?.[0]?.feedback?.[0] && (
                        <button
                          onClick={() => router.push(`/mentee/feedback/${task.id}`)}
                          className="text-indigo-600 hover:underline text-sm"
                        >
                          View Feedback
                        </button>
                      )}
                      
                      {/* Always show a way to view task details */}
                      <button
                        onClick={() => router.push(`/mentee/tasks/${task.id}`)}
                        className="text-slate-600 hover:text-indigo-600 text-sm transition-colors"
                      >
                        View Details
                      </button>
                    </div>
                  </div>

                  {/* Show latest feedback for revision needed */}
                  {task.status === 'revision_needed' && task.submissions?.[0]?.feedback?.[0] && (
                    <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                      <p className="text-orange-900 text-sm font-medium mb-1">Revision Requested</p>
                      <p className="text-orange-700 text-sm">
                        {task.submissions[0].feedback[0].comments}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
