'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search, ClipboardList, Clock, CheckCircle2, AlertCircle, Plus,
  Loader2, FileText, Star, XCircle, AlertTriangle, BookOpen, CalendarClock
} from 'lucide-react';
import { useMentorTasks } from '@/lib/hooks/mentor';
import { StatsCard, TabBar, StatusBadge } from '@/components/admin/ui';
import type { Tab } from '@/components/admin/ui';

export default function MentorTasks() {
  const router = useRouter();
  const {
    activeTab,
    handleTabSwitch,
    stats,
    statsLoading,
    pendingTasks,
    pendingLoading,
    allTasksLoading,
    allTasksLoaded,
    extensionTasks,
    filteredAllTasks,
    searchTerm,
    setSearchTerm,
    mentees,
    menteesLoading,
    mentorLevelAssignments,
    roadmapData,
    selectedProgram,
    selectedLevel,
    selectedMenteeForAssign,
    assigningTask,
    setAssigningTask,
    handleProgramChange,
    handleLevelChange,
    handleMenteeForAssignChange,
    handleAssignRoadmapTask,
    formData,
    setFormData,
    handleMenteeChange,
    handleCreateCustomTask,
    isCreatingTask,
    cancellingTask,
    cancelReason,
    setCancellingTask,
    setCancelReason,
    handleCancelTask,
  } = useMentorTasks();

  // ─── UI helpers ──────────────────────────────────────────────────────────

  const getTaskSourceBadge = (isCustomTask: boolean) =>
    isCustomTask ? (
      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">Custom</span>
    ) : (
      <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">Roadmap</span>
    );

  const getTaskAssignmentButton = (task: any, weekNumber: number) => {
    const as = task.assignmentStatus;
    if (!selectedMenteeForAssign)
      return (
        <button disabled className="px-4 py-2 bg-slate-200 text-slate-400 cursor-not-allowed rounded-lg text-sm font-medium">
          Select a mentee first
        </button>
      );
    if (!as || !as.isAssigned)
      return (
        <button
          onClick={() => handleAssignRoadmapTask(task.id, weekNumber)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Assign to Mentee
        </button>
      );
    const { status, taskId } = as;
    if (status === 'completed')
      return (
        <Link href={`/mentor/tasks/${taskId}/feedback`} className="px-4 py-2 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />Completed - View
        </Link>
      );
    if (status === 'submitted')
      return (
        <Link href={`/mentor/tasks/${taskId}/feedback`} className="px-4 py-2 bg-purple-600 text-white hover:bg-purple-700 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />Awaiting Review
        </Link>
      );
    if (status === 'revision_needed')
      return (
        <Link href={`/mentor/tasks/${taskId}/feedback`} className="px-4 py-2 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />Needs Revision
        </Link>
      );
    if (status === 'in_progress')
      return (
        <div className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium inline-flex items-center gap-2">
          <Clock className="w-4 h-4" />In Progress
        </div>
      );
    return (
      <div className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium inline-flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4" />Already Assigned
      </div>
    );
  };

  const TabLoader = () => (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-slate-900 mb-2">Task Management</h1>
        <p className="text-slate-600">Review submissions and manage tasks for your mentees</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatsCard icon={Clock}         label="Pending Review"  value={statsLoading ? '—' : stats?.pendingReview || 0} colorClass="text-yellow-600 bg-yellow-100" />
        <StatsCard icon={CheckCircle2}  label="Reviewed Today"  value={statsLoading ? '—' : stats?.reviewedToday || 0} colorClass="text-green-600 bg-green-100" />
        <StatsCard icon={ClipboardList} label="Total Tasks"     value={statsLoading ? '—' : stats?.total || 0}         colorClass="text-indigo-600 bg-indigo-100" />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200">
        <TabBar
          tabs={[
            { id: 'pending',    label: 'Pending Review',     icon: Clock,         count: pendingTasks.length > 0 ? pendingTasks.length : undefined },
            { id: 'extensions', label: 'Extensions',         icon: CalendarClock, count: allTasksLoaded && extensionTasks.length > 0 ? extensionTasks.length : undefined },
            { id: 'all',        label: 'All Tasks',          icon: ClipboardList },
            { id: 'roadmap',    label: 'Program Roadmap',    icon: FileText },
            { id: 'create',     label: 'Create Custom Task', icon: Plus },
          ] as Tab[]}
          activeTab={activeTab}
          onChange={(id) => handleTabSwitch(id as any)}
        />

        {/* Tab Content */}
        <div className="p-6">

          {/* ── Pending Review Tab ── */}
          {activeTab === 'pending' && (
            <div>
              {pendingLoading ? (
                <TabLoader />
              ) : pendingTasks.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600 mb-2">No pending reviews</p>
                  <p className="text-slate-500 text-sm">You're all caught up! Task submissions will appear here.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingTasks.map((task) => (
                    <div key={task.id} className="p-6 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-slate-900">{task.roadmapTask?.title}</h3>
                            {getTaskSourceBadge(task.isCustomTask)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-600">
                            <span className="flex items-center gap-1">
                              <FileText className="w-4 h-4" />
                              {task.mentee?.firstName} {task.mentee?.lastName}
                            </span>
                            <span>•</span>
                            <span>{task.enrollment?.program?.name}</span>
                            <span>•</span>
                            <span>Submitted {task.submittedAt ? new Date(task.submittedAt).toLocaleDateString() : 'recently'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2"><StatusBadge status={task.status} /></div>
                      </div>

                      {task.submissions?.[0] && (
                        <div className="mb-4 p-4 bg-white rounded-lg">
                          <div
                            className="prose prose-sm max-w-none text-slate-700 line-clamp-3"
                            dangerouslySetInnerHTML={{ __html: task.submissions[0].submissionText }}
                          />
                          {task.submissions[0].submissionUrls?.length > 0 && (
                            <div className="mt-2">
                              <p className="text-slate-600 text-xs mb-1">Attachments:</p>
                              {task.submissions[0].submissionUrls.map((url: string, idx: number) => (
                                <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline text-sm block">
                                  {url}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => router.push(`/mentor/tasks/${task.id}/feedback`)}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                        >
                          Review Submission
                        </button>
                        <button
                          onClick={() => setCancellingTask(task.id)}
                          className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors border border-red-200"
                        >
                          Cancel Task
                        </button>
                      </div>

                      {cancellingTask === task.id && (
                        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-start gap-3 mb-3">
                            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-red-900 font-medium mb-1">Cancel this task?</p>
                              <p className="text-red-700 text-sm mb-3">This will mark the task as cancelled. The mentee will be notified.</p>
                              <textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Provide a reason for cancellation..."
                                className="w-full p-3 border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
                                rows={3}
                              />
                              <div className="flex gap-2">
                                <button onClick={() => handleCancelTask(task.id)} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
                                  Confirm Cancel
                                </button>
                                <button
                                  onClick={() => { setCancellingTask(null); setCancelReason(''); }}
                                  className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition-colors border border-slate-200"
                                >
                                  Keep Task
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Extensions Tab ── */}
          {activeTab === 'extensions' && (
            <div>
              {allTasksLoading ? (
                <TabLoader />
              ) : extensionTasks.length === 0 ? (
                <div className="text-center py-12">
                  <CalendarClock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600 mb-2">No pending extension requests</p>
                  <p className="text-slate-500 text-sm">Extension requests from your mentees will appear here.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {extensionTasks.map((task) => {
                    const ext = task.submissions?.find((s: any) => s.extensionRequested && s.extensionStatus === 'pending');
                    const currentDue = task.dueDate ? new Date(task.dueDate) : null;
                    const newDue = currentDue && ext?.extensionDays
                      ? new Date(currentDue.getTime() + ext.extensionDays * 86400000)
                      : null;
                    return (
                      <div key={task.id} className="p-6 bg-orange-50 rounded-xl border-2 border-orange-200">
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="text-slate-900">{task.roadmapTask?.title}</h3>
                              {getTaskSourceBadge(task.isCustomTask)}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-slate-600">
                              <span className="font-medium text-slate-800">
                                {task.mentee?.firstName} {task.mentee?.lastName}
                              </span>
                              <span>•</span>
                              <span>{task.enrollment?.program?.name}</span>
                            </div>
                          </div>
                          <span className="px-3 py-1 bg-orange-100 text-orange-700 border border-orange-300 rounded-lg text-sm font-medium flex items-center gap-1.5 whitespace-nowrap">
                            <CalendarClock className="w-4 h-4" />Extension Pending
                          </span>
                        </div>

                        <div className="grid sm:grid-cols-3 gap-4 mb-4 p-4 bg-white rounded-xl border border-orange-100">
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Days Requested</p>
                            <p className="text-sm font-medium text-slate-900">{ext?.extensionDays} day{ext?.extensionDays !== 1 ? 's' : ''}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Current Due Date</p>
                            <p className="text-sm font-medium text-slate-900">{currentDue ? currentDue.toLocaleDateString() : '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">New Due Date if Approved</p>
                            <p className="text-sm font-medium text-green-700">{newDue ? newDue.toLocaleDateString() : '—'}</p>
                          </div>
                          <div className="sm:col-span-3">
                            <p className="text-xs text-slate-500 mb-1">Reason</p>
                            <p className="text-sm text-slate-800">{ext?.extensionReason || '—'}</p>
                          </div>
                        </div>

                        <button
                          onClick={() => router.push(`/mentor/tasks/${task.id}`)}
                          className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-medium transition-colors"
                        >
                          Review &amp; Respond
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── All Tasks Tab ── */}
          {activeTab === 'all' && (
            <div>
              {allTasksLoading ? (
                <TabLoader />
              ) : (
                <>
                  <div className="mb-4">
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
                  </div>

                  {filteredAllTasks.length === 0 ? (
                    <div className="text-center py-12">
                      <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-600 mb-2">No tasks found</p>
                      <p className="text-slate-500 text-sm">
                        {searchTerm ? 'Try a different search term' : 'Tasks will appear here when mentees are assigned'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredAllTasks.map((task) => {
                        const pendingExtension = task.submissions?.find((s: any) => s.extensionRequested && s.extensionStatus === 'pending');
                        return (
                          <div
                            key={task.id}
                            className={`p-4 bg-white rounded-xl border transition-colors ${pendingExtension ? 'border-orange-300 bg-orange-50/30 hover:border-orange-400' : 'border-slate-200 hover:border-indigo-200'}`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <h4 className="text-slate-900">{task.roadmapTask?.title}</h4>
                                  {getTaskSourceBadge(task.isCustomTask)}
                                  {pendingExtension && (
                                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 border border-orange-200 rounded text-xs font-medium flex items-center gap-1">
                                      <Clock className="w-3 h-3" />Extension Pending
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-sm text-slate-600 flex-wrap">
                                  <span>{task.mentee?.firstName} {task.mentee?.lastName}</span>
                                  <span>•</span>
                                  <span>{task.enrollment?.currentLevel?.name}</span>
                                  <span>•</span>
                                  <span>Due {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No deadline'}</span>
                                  {task.finalRating && (
                                    <>
                                      <span>•</span>
                                      <span className="flex items-center gap-1">
                                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                                        {task.finalRating}
                                      </span>
                                    </>
                                  )}
                                </div>
                                {pendingExtension && (
                                  <p className="text-xs text-orange-700 mt-1">
                                    Requesting <strong>{pendingExtension.extensionDays} day{pendingExtension.extensionDays !== 1 ? 's' : ''}</strong>: &quot;{pendingExtension.extensionReason}&quot;
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <StatusBadge status={task.status} />
                                {pendingExtension ? (
                                  <button onClick={() => router.push(`/mentor/tasks/${task.id}`)} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors">
                                    Handle Extension
                                  </button>
                                ) : (task.status === 'submitted' || task.status === 'revision_needed') ? (
                                  <button onClick={() => router.push(`/mentor/tasks/${task.id}/feedback`)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors">
                                    Review
                                  </button>
                                ) : (
                                  <button onClick={() => router.push(`/mentor/tasks/${task.id}`)} className="px-3 py-1.5 text-indigo-600 hover:text-indigo-800 text-sm font-medium transition-colors cursor-pointer">
                                    View Details
                                  </button>
                                )}
                                {task.status !== 'completed' && task.status !== 'cancelled' && (
                                  <button
                                    onClick={() => setCancellingTask(task.id)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Cancel task"
                                  >
                                    <XCircle className="w-5 h-5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {cancellingTask === task.id && (
                              <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                                <div className="flex items-start gap-3">
                                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                                  <div className="flex-1">
                                    <p className="text-red-900 font-medium mb-1">Cancel this task?</p>
                                    <p className="text-red-700 text-sm mb-3">This will mark the task as cancelled. The mentee will be notified.</p>
                                    <textarea
                                      value={cancelReason}
                                      onChange={(e) => setCancelReason(e.target.value)}
                                      placeholder="Provide a reason for cancellation..."
                                      className="w-full p-2 border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 mb-2 text-sm"
                                      rows={2}
                                    />
                                    <div className="flex gap-2">
                                      <button onClick={() => handleCancelTask(task.id)} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm">
                                        Confirm
                                      </button>
                                      <button
                                        onClick={() => { setCancellingTask(null); setCancelReason(''); }}
                                        className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition-colors border border-slate-200 text-sm"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Program Roadmap Tab ── */}
          {activeTab === 'roadmap' && (
            <div>
              <h3 className="text-slate-900 mb-6">Program Roadmap & Task Assignment</h3>

              {menteesLoading ? (
                <TabLoader />
              ) : (
                <>
                  {/* ── 3-step cascading selectors ── */}
                  <div className="grid md:grid-cols-3 gap-4 mb-6">
                    {/* Step 1 – Program */}
                    <div>
                      <label className="block text-slate-700 text-sm font-medium mb-2">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold mr-1.5">1</span>
                        Program
                      </label>
                      <select
                        value={selectedProgram}
                        onChange={(e) => handleProgramChange(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      >
                        <option value="">Select a program…</option>
                        {mentorLevelAssignments.map((prog: any) => (
                          <option key={prog.id} value={prog.id}>
                            {prog.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Step 2 – Level (filtered by selected program) */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                        selectedProgram ? 'text-slate-700' : 'text-slate-400'
                      }`}>
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold mr-1.5 ${
                          selectedProgram ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'
                        }`}>2</span>
                        Level
                      </label>
                      <select
                        value={selectedLevel}
                        onChange={(e) => handleLevelChange(e.target.value)}
                        disabled={!selectedProgram}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                      >
                        <option value="">{selectedProgram ? 'Select a level…' : 'Select program first'}</option>
                        {(mentorLevelAssignments.find((p: any) => p.id === selectedProgram)?.levels || []).map((level: any) => (
                          <option key={level.id} value={level.id}>
                            {level.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Step 3 – Mentee (filtered by program + level) */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                        selectedLevel ? 'text-slate-700' : 'text-slate-400'
                      }`}>
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold mr-1.5 ${
                          selectedLevel ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'
                        }`}>3</span>
                        Mentee to Assign
                      </label>
                      <select
                        value={selectedMenteeForAssign}
                        onChange={(e) => handleMenteeForAssignChange(e.target.value)}
                        disabled={!selectedLevel}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                      >
                        <option value="">{selectedLevel ? 'Choose a mentee…' : 'Select level first'}</option>
                        {Array.from(
                          new Map(
                            mentees
                              .filter((m) =>
                                m.enrollment?.programId === selectedProgram &&
                                m.levelId === selectedLevel
                              )
                              .map((m) => [m.menteeId, m])
                          ).values()
                        ).map((match: any) => (
                          <option key={match.menteeId} value={match.menteeId}>
                            {match.mentee?.firstName} {match.mentee?.lastName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Progress hint bar */}
                  {!selectedProgram && (
                    <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
                      <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-600 mb-2">Start by selecting a program</p>
                      <p className="text-slate-500 text-sm">Then pick a level and a mentee to view and assign roadmap tasks</p>
                    </div>
                  )}

                  {selectedProgram && !selectedLevel && (
                    <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
                      <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-600 mb-2">Now select a level</p>
                      <p className="text-slate-500 text-sm">Choose the program level whose roadmap you want to view</p>
                    </div>
                  )}

                  {selectedProgram && selectedLevel && !selectedMenteeForAssign && (
                    <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
                      <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-600 mb-2">Select a mentee to load the roadmap</p>
                      <p className="text-slate-500 text-sm">The roadmap will show each task's assignment status for that mentee</p>
                    </div>
                  )}

                  {selectedProgram && selectedLevel && selectedMenteeForAssign && !roadmapData && (
                    <div className="text-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-3" />
                      <p className="text-slate-600">Loading roadmap…</p>
                    </div>
                  )}

                  {roadmapData && (
                    <div className="space-y-6">
                      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <BookOpen className="w-5 h-5 text-indigo-600 mt-0.5" />
                          <div>
                            <h4 className="text-indigo-900 font-medium mb-1">{roadmapData.title}</h4>
                            {roadmapData.description && <p className="text-indigo-700 text-sm">{roadmapData.description}</p>}
                          </div>
                        </div>
                      </div>

                      {roadmapData.weeks?.map((week: any) => (
                        <div key={week.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                            <h4 className="text-slate-900 font-medium">Week {week.weekNumber}: {week.title}</h4>
                            {week.description && <p className="text-slate-600 text-sm mt-1">{week.description}</p>}
                          </div>
                          <div className="p-6 space-y-4">
                            {week.tasks?.length > 0 ? (
                              week.tasks.map((task: any) => (
                                <div key={task.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                  <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <h5 className="text-slate-900 font-medium">{task.title}</h5>
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${task.difficulty === 'easy' ? 'bg-green-100 text-green-700' : task.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' : task.difficulty === 'hard' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                                          {task.difficulty}
                                        </span>
                                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">{task.type}</span>
                                      </div>
                                      <p className="text-slate-600 text-sm mb-2">{task.description}</p>
                                      <div className="flex items-center gap-4 text-xs text-slate-500">
                                        <span>⏱️ {task.estimatedHours}h</span>
                                        <span>⭐ {task.pointsBase} points</span>
                                        {task.isMandatory && <span className="text-red-600">● Mandatory</span>}
                                      </div>
                                    </div>
                                  </div>
                                  {task.deliverable && (
                                    <div className="mb-2">
                                      <p className="text-slate-700 text-sm font-medium mb-1">Deliverable:</p>
                                      <p className="text-slate-600 text-sm">{task.deliverable}</p>
                                    </div>
                                  )}
                                  {task.acceptanceCriteria?.length > 0 && (
                                    <div className="mb-3">
                                      <p className="text-slate-700 text-sm font-medium mb-1">Acceptance Criteria:</p>
                                      <ul className="text-slate-600 text-sm space-y-1">
                                        {task.acceptanceCriteria.map((criteria: string, idx: number) => (
                                          <li key={idx} className="flex items-start gap-2">
                                            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                                            <span>{criteria}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {getTaskAssignmentButton(task, week.weekNumber)}
                                </div>
                              ))
                            ) : (
                              <p className="text-slate-500 text-sm text-center py-4">No tasks for this week</p>
                            )}
                          </div>
                        </div>
                      ))}

                      {(!roadmapData.weeks || roadmapData.weeks.length === 0) && (
                        <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
                          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                          <p className="text-slate-600">No weeks found in this roadmap</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Create Custom Task Tab ── */}
          {activeTab === 'create' && (
            <div className="max-w-2xl">
              <h3 className="text-slate-900 mb-4">Assign Custom Task</h3>

              {menteesLoading ? (
                <TabLoader />
              ) : (
                <form onSubmit={handleCreateCustomTask} className="space-y-6">
                  <div>
                    <label className="block text-slate-700 text-sm mb-2">
                      Select Mentee <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.menteeId}
                      onChange={(e) => handleMenteeChange(e.target.value)}
                      required
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="">Choose a mentee...</option>
                      {mentees.map((match) => (
                        <option key={`${match.menteeId}-${match.enrollment?.programId ?? match.enrollment?.program?.name}`} value={match.menteeId}>
                          {match.mentee?.firstName} {match.mentee?.lastName} - {match.enrollment?.program?.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 text-sm mb-2">
                      Task Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g., Build a REST API with authentication"
                      required
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 text-sm mb-2">
                      Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={6}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Provide detailed instructions for the task..."
                      required
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-slate-700 text-sm mb-2">Task Type</label>
                      <select
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      >
                        <option value="custom">Custom</option>
                        <option value="exercise">Extra Practice</option>
                        <option value="project">Project</option>
                        <option value="practical">Practical</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-700 text-sm mb-2">Difficulty</label>
                      <select
                        value={formData.difficulty}
                        onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                        <option value="expert">Expert</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-slate-700 text-sm mb-2">Due Date</label>
                      <input
                        type="date"
                        value={formData.dueDate}
                        onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 text-sm mb-2">Points</label>
                      <input
                        type="number"
                        value={formData.pointsBase}
                        onChange={(e) => setFormData({ ...formData, pointsBase: parseInt(e.target.value) || 0 })}
                        placeholder="e.g., 100"
                        min="0"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button
                      type="submit"
                      disabled={isCreatingTask}
                      className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isCreatingTask ? 'Assigning...' : 'Assign Task'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTabSwitch('all')}
                      className="px-6 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-blue-900 text-sm font-medium mb-1">Custom Task Guidelines</p>
                    <ul className="text-blue-700 text-sm space-y-1">
                      <li>• Be specific and clear in your instructions</li>
                      <li>• Set realistic deadlines based on task complexity</li>
                      <li>• Use appropriate difficulty levels</li>
                      <li>• Provide clear deliverables and success criteria</li>
                      <li>• Consider the mentee's current level and progress</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
