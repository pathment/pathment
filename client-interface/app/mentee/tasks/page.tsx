'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, CheckCircle2, AlertCircle, FileText, Loader2, Star, Calendar, XCircle, BookOpen, Sparkles, GraduationCap, ClipboardList, Layers } from 'lucide-react';
import { useMenteeTasks } from '@/lib/hooks/mentee';
import { StatsCard, SearchAndFilterBar, StatusBadge } from '@/components/admin/ui';
import { SubmitTaskDrawer, type SubmitTaskTarget } from '@/components/mentee/SubmitTaskDrawer';
import { stripHtml } from '@/lib/utils/html';

export default function MenteeTasks() {
  const router = useRouter();
  const [submitTarget, setSubmitTarget] = useState<SubmitTaskTarget | null>(null);
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
    fetchTasks,
  } = useMenteeTasks();

  const getTaskSourceBadge = (isCustomTask: boolean) => {
    return isCustomTask ? (
      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium flex items-center gap-1">
        <Sparkles className="w-3 h-3" />
        Custom
      </span>
    ) : (
      <span className="px-2 py-1 bg-brand-100 text-brand-700 rounded text-xs font-medium flex items-center gap-1">
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

  // Group tasks by their personal lane (track) for a calm, scannable list.
  const trackGroups = (filteredTasks as any[]).reduce((acc: Record<string, any[]>, t: any) => {
    const key = t.track?.name || 'General';
    (acc[key] = acc[key] || []).push(t);
    return acc;
  }, {} as Record<string, any[]>);
  const showTrackHeaders = Object.keys(trackGroups).some((k) => k !== 'General') || Object.keys(trackGroups).length > 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-slate-900 mb-2">My Tasks</h1>
        <p className="text-slate-600">Track your learning progress and submit your work</p>
      </div>

      {/* Program Selector */}
      {enrollments.length > 0 && (
        <div className="bg-card rounded-2xl border border-slate-200 p-4">
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
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-card text-slate-600 border-slate-200 hover:border-brand-400 hover:text-brand-600'
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
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-card text-slate-600 border-slate-200 hover:border-brand-400 hover:text-brand-600'
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
        <StatsCard icon={ClipboardList} label="Total Tasks"    value={stats?.total || 0}       colorClass="text-brand-600 bg-brand-50" />
        <StatsCard icon={CheckCircle2}  label="Completed"      value={stats?.completed || 0}   colorClass="text-green-600 bg-green-50"
          sub={stats?.total > 0 ? `${Math.round(((stats?.completed || 0) / stats?.total) * 100)}%` : undefined} />
        <StatsCard icon={FileText}      label="Pending Review" value={stats?.submitted || 0}   colorClass="text-purple-600 bg-purple-50" />
        <StatsCard icon={Clock}         label="In Progress"    value={stats?.inProgress || 0}  colorClass="text-yellow-600 bg-yellow-50" />
        <StatsCard icon={AlertCircle}   label="Overdue"        value={stats?.overdue || 0}     colorClass="text-red-600 bg-red-50" />
      </div>

      {/* Filters */}
      <SearchAndFilterBar
        search={searchTerm}
        onSearch={setSearchTerm}
        placeholder="Search tasks..."
        filters={[
          {
            value: filterStatus,
            onChange: setFilterStatus,
            options: [
              { value: 'all', label: 'All Tasks' },
              { value: 'assigned', label: 'New Tasks' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'submitted', label: 'Submitted' },
              { value: 'revision_needed', label: 'Needs Revision' },
              { value: 'completed', label: 'Completed' },
            ],
          },
        ]}
      />

      {/* Tasks List */}
      <div className="bg-card rounded-2xl border border-slate-200">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
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
          <div>
            {Object.entries(trackGroups).map(([trackName, groupTasks]) => (
              <div key={trackName}>
                {showTrackHeaders && (
                  <div className="px-6 pt-4 pb-1 flex items-center gap-2 border-t border-slate-100 first:border-t-0">
                    <Layers className="w-3.5 h-3.5 text-brand-500" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{trackName}</span>
                    <span className="text-xs text-slate-400 tabular-nums">{(groupTasks as any[]).length}</span>
                  </div>
                )}
                <div className="divide-y divide-slate-100">
                  {(groupTasks as any[]).map((task) => {
                    const overdue = isOverdue(task.dueDate) && !['completed', 'submitted'].includes(task.status);

                    return (
                <div key={task.id} className="p-6 hover:bg-slate-50 transition-colors w-full overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="text-slate-900 break-words min-w-0 flex-1">{task.roadmapTask?.title}</h3>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {getTaskSourceBadge(task.isCustomTask)}
                          {getDifficultyBadge(task.roadmapTask?.difficulty)}
                        </div>
                      </div>
                      
                      {/* Show cancellation info if task is cancelled */}
                      {task.status === 'cancelled' && task.cancellationReason && (
                        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-red-900 font-medium text-sm break-words">Task Cancelled</p>
                              <p className="text-red-700 text-sm mt-1 break-words">{task.cancellationReason}</p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <p className="text-slate-600 text-sm line-clamp-2 mb-3 break-words">
                        {stripHtml(task.roadmapTask?.description)}
                      </p>
                      
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                        {task.dueDate && (
                          <>
                            <span className={`flex items-center gap-1 shrink-0 ${overdue ? 'text-red-600' : ''}`}>
                              <Calendar className="w-4 h-4 shrink-0" />
                              Due {new Date(task.dueDate).toLocaleDateString()}
                              {overdue && ' (Overdue)'}
                            </span>
                            <span className="hidden sm:inline">•</span>
                          </>
                        )}
                        <span className="shrink-0">{task.roadmapTask?.estimatedHours || 0}h estimated</span>
                        {task.roadmapTask?.pointsBase && (
                          <>
                            <span className="hidden sm:inline">•</span>
                            <span className="shrink-0">{task.roadmapTask.pointsBase} points</span>
                          </>
                        )}
                      </div>
                      
                      {task.finalRating && (
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1 shrink-0">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-4 h-4 shrink-0 ${
                                  star <= task.finalRating
                                    ? 'fill-yellow-400 text-yellow-400'
                                    : 'text-slate-300'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-slate-600 text-sm shrink-0">
                            {task.pointsAwarded} points earned
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-start sm:items-end gap-2 shrink-0 max-w-full">
                      <div className="max-w-full overflow-hidden">
                        <StatusBadge status={task.status} />
                      </div>
                      
                      {task.status === 'assigned' && (
                        <button
                          onClick={() => handleStartTask(task.id)}
                          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm transition-colors w-full sm:w-auto break-words"
                        >
                          Start Task
                        </button>
                      )}
                      
                      {(task.status === 'in_progress' || task.status === 'revision_needed') && (
                        <button
                          onClick={() => setSubmitTarget({
                            id: task.id,
                            title: task.roadmapTask?.title || 'Task',
                            status: task.status,
                            deliverable: task.roadmapTask?.deliverable,
                            acceptanceCriteria: task.roadmapTask?.acceptanceCriteria || [],
                          })}
                          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm transition-colors w-full sm:w-auto break-words"
                        >
                          Submit Work
                        </button>
                      )}
                      
                      {task.status === 'submitted' && (
                        <span className="text-slate-600 text-sm shrink-0">
                          Awaiting review
                        </span>
                      )}
                      
                      {task.status === 'cancelled' && (
                        <span className="text-red-600 text-sm shrink-0">
                          No action needed
                        </span>
                      )}

                      {task.status === 'completed' && task.submissions?.[0]?.feedback?.[0] && (
                        <button
                          onClick={() => router.push(`/mentee/feedback/${task.id}`)}
                          className="text-brand-600 hover:underline text-sm shrink-0"
                        >
                          View Feedback
                        </button>
                      )}
                      
                      {/* Always show a way to view task details */}
                      <button
                        onClick={() => router.push(`/mentee/tasks/${task.id}`)}
                        className="text-slate-600 hover:text-brand-600 text-sm transition-colors cursor-pointer shrink-0"
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
              </div>
            ))}
          </div>
        )}
      </div>

      <SubmitTaskDrawer
        open={!!submitTarget}
        task={submitTarget}
        onClose={() => setSubmitTarget(null)}
        onSubmitted={fetchTasks}
      />
    </div>
  );
}
