"use client";

import { Suspense, useEffect, useState } from "react";
import { LearningStat } from "@/components/mentee/LearningStat";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Clock,
  CheckCircle2,
  FileText,
  Loader2,
  GraduationCap,
  ClipboardList,
  Layers,
} from "lucide-react";
import { useMenteeTasks } from "@/lib/hooks/mentee";
import { SearchAndFilterBar } from "@/components/admin/ui";
import {
  SubmitTaskDrawer,
  type SubmitTaskTarget,
} from "@/components/mentee/SubmitTaskDrawer";
import { TaskDrawer } from "@/components/mentee/TaskDrawer";
import {
  MenteeTaskRow,
  type MenteeTaskView,
} from "@/components/mentee/tasks/MenteeTaskRow";
import { useClan, isHistoricalCohortClan } from "@/lib/context/ClanContext";
import { useMenteeScope } from "@/lib/hooks/mentee";
import { PoolWorkList } from "@/components/mentee/pool/PoolQualification";

function MenteeTasksContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { menteeClans, menteeActiveClanId } = useClan();
  const activeClan = menteeClans.find((c) => c.id === menteeActiveClanId);
  const standing = activeClan?.kind === "standing";
  const historical = isHistoricalCohortClan(activeClan);
  const HISTORICAL_TITLE = "Completed programs are read-only";
  const [submitTarget, setSubmitTarget] = useState<SubmitTaskTarget | null>(
    null,
  );
  /**
   * The task being read, in a drawer over the list.
   *
   * Reading a brief is the commonest thing a mentee does here and it used to
   * cost a full page load and a trip back. `/mentee/tasks/:id` still exists and
   * is still what every notification links to — this is the shortcut from the
   * list, not a replacement for the address.
   */
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  /** Hand a list row to the submit drawer in the shape it expects. */
  const askToSubmit = (task: any) => setSubmitTarget({ // eslint-disable-line @typescript-eslint/no-explicit-any
    id: task.id,
    title: task.roadmapTask?.title || task.title || "Task",
    status: task.status,
    deliverable: task.roadmapTask?.deliverable,
    acceptanceCriteria: task.roadmapTask?.acceptanceCriteria || [],
    type: task.roadmapTask?.type || task.type,
    isCustomTask: task.isCustomTask,
  });
  /**
   * A clan task in the shape the shared row reads.
   *
   * The row itself is the same component a selection round uses: the two were
   * drifting apart for no reason other than where the work is fetched from.
   */
  const toRow = (task: any): MenteeTaskView => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    id: task.id,
    title: task.roadmapTask?.title || task.title || "Task",
    description: task.roadmapTask?.description ?? null,
    type: task.roadmapTask?.type || task.type || null,
    difficulty: task.roadmapTask?.difficulty ?? null,
    dueDate: task.dueDate ?? null,
    estimatedHours: task.roadmapTask?.estimatedHours ?? 0,
    points: task.points ?? task.roadmapTask?.pointsBase ?? null,
    status: task.status,
    source: task.isCustomTask ? "custom" : "roadmap",
    cancellationReason: task.cancellationReason ?? null,
    finalRating: task.finalRating ?? null,
    pointsAwarded: task.pointsAwarded ?? null,
    revisionNote: task.submissions?.[0]?.feedback?.[0]?.comments ?? null,
    discussionGroupId: task.discussionGroupId ?? null,
  });

  const {
    filteredTasks,
    stats,
    loading,
    enrollments,
    selectedEnrollmentId,
    filterStatus,
    searchTerm,
    view,
    activeCount,
    completedCount,
    setSelectedEnrollmentId,
    setFilterStatus,
    setSearchTerm,
    setView,
    handleStartTask,
    fetchTasks,
  } = useMenteeTasks();

  const requestedView = searchParams.get("view");
  const requestedStatus = searchParams.get("status");
  useEffect(() => {
    setView(requestedView === "completed" ? "completed" : "active");
    setFilterStatus(
      ["assigned", "in_progress", "submitted", "revision_needed"].includes(
        requestedStatus || "",
      )
        ? requestedStatus!
        : "all",
    );
  }, [requestedView, requestedStatus, setView, setFilterStatus]);


  // Group tasks by their personal lane (track) for a calm, scannable list.
  const trackGroups = (filteredTasks as any[]).reduce(
    (acc: Record<string, any[]>, t: any) => {
      const key = t.track?.name || "General";
      (acc[key] = acc[key] || []).push(t);
      return acc;
    },
    {} as Record<string, any[]>,
  );
  const showTrackHeaders =
    Object.keys(trackGroups).some((k) => k !== "General") ||
    Object.keys(trackGroups).length > 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mentee-page-heading">
        <h1 className="text-slate-900 mb-2">My tasks</h1>
        <p className="text-slate-600">
          {standing
            ? activeClan?.name || "Standing clan"
            : enrollments.length === 1
              ? enrollments[0].program?.name
              : "Track your learning progress and submit your work"}
        </p>
      </div>

      {/* Program Selector — cohort only; standing work is clan-scoped, not enrollment-scoped */}
      {!standing && enrollments.length > 1 && (
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
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-card text-slate-600 border-slate-200 hover:border-brand-400 hover:text-brand-600"
                  }`}
                >
                  {enrollment.program?.name || "Program"}
                  {enrollment.status === "completed" && (
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
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-card text-slate-600 border-slate-200 hover:border-brand-400 hover:text-brand-600"
                }`}
              >
                All Programs
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "In progress",
            value: stats?.inProgress || 0,
            icon: Clock,
            tone: 0,
            status: "in_progress",
            hint: "Keep your momentum →",
          },
          {
            label: "With your mentor",
            value: stats?.submitted || 0,
            icon: FileText,
            tone: 1,
            status: "submitted",
            hint: "Submitted, awaiting feedback →",
          },
          {
            label: "Completed",
            value: stats?.completed || 0,
            icon: CheckCircle2,
            tone: 2,
            status: "completed",
            hint: "Revisit your work and feedback →",
          },
          {
            label: "Active tasks",
            value: activeCount,
            icon: ClipboardList,
            tone: 3,
            status: "all",
            hint: "Explore your active work →",
          },
        ].map((stat) => (
          <button
            key={stat.status}
            type="button"
            className="text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              setView(stat.status === "completed" ? "completed" : "active");
              setFilterStatus(
                stat.status === "completed" ? "all" : stat.status,
              );
            }}
          >
            <LearningStat
              compact
              label={stat.label}
              value={loading ? "—" : stat.value}
              icon={stat.icon}
              tone={stat.tone as 0 | 1 | 2 | 3}
              hint={stat.hint}
            />
          </button>
        ))}
      </div>

      {/* Active / Completed toggle */}
      <div className="inline-flex rounded-xl border border-slate-200 bg-card p-1">
        <button
          onClick={() => setView("active")}
          aria-pressed={view === "active"}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === "active"
              ? "bg-brand-600 text-white shadow-sm"
              : "text-slate-600 hover:text-brand-600"
          }`}
        >
          <Clock className="w-4 h-4" />
          Active
          {loading ? null : (
            <span
              className={`text-xs tabular-nums ${view === "active" ? "text-white/80" : "text-slate-400"}`}
            >
              {activeCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setView("completed")}
          aria-pressed={view === "completed"}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === "completed"
              ? "bg-brand-600 text-white shadow-sm"
              : "text-slate-600 hover:text-brand-600"
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Completed
          {loading ? null : (
            <span
              className={`text-xs tabular-nums ${view === "completed" ? "text-white/80" : "text-slate-400"}`}
            >
              {completedCount}
            </span>
          )}
        </button>
      </div>

      {/* Filters */}
      <SearchAndFilterBar
        search={searchTerm}
        onSearch={setSearchTerm}
        placeholder={
          view === "completed" ? "Search completed tasks..." : "Search tasks..."
        }
        filters={[
          ...(view === "active"
            ? [
                {
                  value: filterStatus,
                  onChange: setFilterStatus,
                  options: [
                    { value: "all", label: "All Tasks" },
                    { value: "assigned", label: "New Tasks" },
                    { value: "in_progress", label: "In Progress" },
                    { value: "submitted", label: "Submitted" },
                    { value: "revision_needed", label: "Needs Revision" },
                  ],
                },
              ]
            : []),
        ]}
      />

      {/* Tasks List */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            {view === "completed" ? (
              <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            ) : (
              <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            )}
            <p className="text-slate-600 mb-2">
              {view === "completed"
                ? "No completed tasks yet"
                : "No active tasks"}
            </p>
            <p className="text-slate-500 text-sm">
              {searchTerm
                ? "Try a different search term"
                : filterStatus !== "all"
                  ? "No tasks in this category"
                  : view === "completed"
                    ? "Completed tasks will appear here when you finish them"
                    : "Tasks will appear here when assigned"}
            </p>
          </div>
        ) : (
          <div>
            {Object.entries(trackGroups).map(([trackName, groupTasks]) => (
              <div key={trackName}>
                {showTrackHeaders && (
                  <div className="px-6 pt-4 pb-1 flex items-center gap-2 border-t border-slate-100 first:border-t-0">
                    <Layers className="w-3.5 h-3.5 text-brand-500" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {trackName}
                    </span>
                    <span className="text-xs text-slate-400 tabular-nums">
                      {(groupTasks as any[]).length}
                    </span>
                  </div>
                )}
                <div className="mentee-task-list">
                  {(groupTasks as any[]).map((task) => (
                    <MenteeTaskRow
                      key={task.id}
                      task={toRow(task)}
                      href={`/mentee/tasks/${task.id}`}
                      readOnly={historical}
                      readOnlyTitle={HISTORICAL_TITLE}
                      onOpen={setOpenTaskId}
                      onStart={handleStartTask}
                      onSubmit={() => askToSubmit(task)}
                      onViewFeedback={
                        task.submissions?.[0]?.feedback?.[0]
                          ? (id) => router.push(`/mentee/feedback/${id}`)
                          : undefined
                      }
                      quizHref={(id) => `/mentee/quizzes/${id}`}
                      interviewHref={(id) => `/mentee/interviews/${id}`}
                      courseHref={(id) => `/mentee/tasks/${id}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <TaskDrawer
        taskId={openTaskId}
        open={!!openTaskId}
        onClose={() => setOpenTaskId(null)}
        readOnly={historical}
        onStart={async (id) => { await handleStartTask(id); }}
        onSubmit={(task) => {
          // One drawer at a time: hand off to the submit form rather than
          // stacking a second panel on top of this one.
          setOpenTaskId(null);
          askToSubmit(task);
        }}
      />

      <SubmitTaskDrawer
        open={!!submitTarget}
        task={submitTarget}
        onClose={() => setSubmitTarget(null)}
        onSubmitted={fetchTasks}
        readOnly={historical}
      />
    </div>
  );
}

export default function MenteeTasks() {
  const scope = useMenteeScope();
  // In a selection round, "my tasks" means the qualifying work — which lives
  // outside every clan query by design (the AssignedTask pool fence). Wait for
  // the scope before choosing: the clan list is clan-scoped on the server, and
  // asking it without a clan is an error rather than an empty list.
  if (scope.loading) return <p role="status">Loading tasks…</p>;
  if (scope.inPool) return <PoolWorkList poolId={scope.pool?.id} />;
  return (
    <Suspense fallback={<p role="status">Loading tasks…</p>}>
      <MenteeTasksContent />
    </Suspense>
  );
}
