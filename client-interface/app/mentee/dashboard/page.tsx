"use client";

import Link from "next/link";
import { LearningStat } from "@/components/mentee/LearningStat";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  ListTodo,
  Loader2,
  TrendingUp,
  MessageSquareHeart,
  ArrowRight,
  Flag,
  Link2,
} from "lucide-react";
import { useAuth } from "@/lib/context/AuthContext";
import {
  useMenteeDashboard,
  useMyActivity,
  useMenteeTasks,
} from "@/lib/hooks/mentee";
import { ProgressBar, StatusBadge } from "@/components/admin/ui";
import { MentorFeedbackDrawer } from "@/components/mentee/MentorFeedbackDrawer";
import { ActivityCard } from "@/components/shared/ActivityCard";
import { RecurringRitualsCard } from "@/components/mentee/RecurringRitualsCard";
import { PlanStripCard } from "@/components/mentor/PlanStripCard";
import { AnnouncementsCard } from "@/components/shared/AnnouncementsCard";
import { ClanWorkspaceNotice } from "@/components/shared/ClanWorkspaceNotice";
import { TaskDrawer } from "@/components/mentee/TaskDrawer";
import {
  SubmitTaskDrawer,
  type SubmitTaskTarget,
} from "@/components/mentee/SubmitTaskDrawer";
import { useClan, isHistoricalCohortClan } from "@/lib/context/ClanContext";
import { useMenteeScope } from "@/lib/hooks/mentee";
import { PoolQualification } from "@/components/mentee/pool/PoolQualification";

function WhatsAppGroupCard({
  enrollment,
  compact = false,
}: {
  enrollment: any;
  compact?: boolean;
}) {
  const link = enrollment.clan?.whatsappGroupLink;
  const enrollmentId = enrollment.id;

  const localStorageKey = `whatsapp-joined-${enrollmentId}-${link}`;
  const [hasJoined, setHasJoined] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasJoined(localStorage.getItem(localStorageKey) === "true");
    }
  }, [localStorageKey]);

  if (!link) return null;

  const handleJoin = () => {
    window.open(link, "_blank", "noopener,noreferrer");
    localStorage.setItem(localStorageKey, "true");
    setHasJoined(true);
  };

  if (compact) {
    return (
      <div className="p-3.5 rounded-2xl border border-emerald-100 dark:border-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-500/5 flex items-center justify-between gap-4 text-left shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <Link2 className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-none mb-1">
              WhatsApp Group
            </h4>
            <p className="text-[10px] text-slate-500 truncate max-w-[120px] sm:max-w-[180px] leading-none">
              {enrollment.program?.name || "Program"}
            </p>
          </div>
        </div>
        <button
          onClick={handleJoin}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all flex items-center justify-center gap-1 shrink-0 ${
            hasJoined
              ? "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
              : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
          }`}
        >
          {hasJoined ? "Joined" : "Join Group"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-left">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
          <Link2 className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            WhatsApp Group
          </h4>
          <p className="text-xs text-slate-500 truncate">
            {hasJoined
              ? "Already joined the cohort group"
              : "Join your mentor's cohort group"}
          </p>
        </div>
      </div>

      <button
        onClick={handleJoin}
        className={`w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shrink-0 ${
          hasJoined
            ? "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
            : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
        }`}
      >
        {hasJoined ? (
          <>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500" />
            Already Joined
          </>
        ) : (
          "Join WhatsApp Group"
        )}
      </button>
    </div>
  );
}

function MenteeDashboardInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const { menteeClans, menteeActiveClanId } = useClan();
  const historical = isHistoricalCohortClan(
    menteeClans.find((c) => c.id === menteeActiveClanId),
  );
  /**
   * The task being read, in a drawer over this page.
   *
   * Every other mentee surface opens a task this way — the list, the day
   * planner — and this one sent you to a full page instead, so clicking the
   * same task from two places did two different things. `/mentee/tasks/:id`
   * is still the address and still what notifications link to; this is the
   * shortcut from here, as it is everywhere else.
   */
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [submitTarget, setSubmitTarget] = useState<SubmitTaskTarget | null>(null);
  // Standing has no program enrollment — hide cohort enrollment chrome so
  // completed-clan history never appears while this clan is selected.
  const standing =
    menteeClans.find((c) => c.id === menteeActiveClanId)?.kind === "standing";
  const {
    enrollments,
    loading,
    currentProgramEnrollments,
    pendingEnrollments,
    approvedEnrollments,
    pendingCompletionEnrollments,
    levelCompletedEnrollments,
    completedEnrollments,
    feedbackTarget,
    openFeedback,
    closeFeedback,
    reviewedEnrollmentIds,
    markReviewed,
  } = useMenteeDashboard();

  // Deep link from the "Leave feedback" notification: ?review=<enrollmentId>
  useEffect(() => {
    if (standing) return;
    const reviewId = searchParams.get("review");
    if (!reviewId || loading) return;
    const target = enrollments.find((e) => e.id === reviewId);
    if (target && target.status === "program_completed") {
      openFeedback(reviewId, target.program?.name || "your program");
    }
  }, [standing, searchParams, enrollments, loading, openFeedback]);

  const {
    summary: actSummary,
    dailySessions: actSessions,
    recentEvents: actEvents,
    loading: actLoading,
    days: actDays,
    setDays: setActDays,
    refetch: refetchActivity,
  } = useMyActivity();

  const {
    tasks: allTasks,
    loading: tasksLoading,
    handleStartTask,
    fetchTasks,
  } = useMenteeTasks();

  /** Hand a dashboard row to the submit drawer in the shape it expects. */
  const askToSubmit = (task: {
    id: string;
    title?: string;
    status?: string;
    type?: string;
    isCustomTask?: boolean;
    roadmapTask?: {
      title?: string;
      type?: string;
      deliverable?: string | null;
      acceptanceCriteria?: string[];
    };
  }) => setSubmitTarget({
    id: task.id,
    title: task.roadmapTask?.title || task.title || "Task",
    status: task.status,
    deliverable: task.roadmapTask?.deliverable,
    acceptanceCriteria: task.roadmapTask?.acceptanceCriteria || [],
    type: task.roadmapTask?.type || task.type,
    isCustomTask: task.isCustomTask,
  });

  /**
   * Still an anchor, so ⌘-click and "open in new tab" reach the real page; a
   * plain click opens the drawer instead of navigating.
   */
  const openInDrawer = (taskId: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setOpenTaskId(taskId);
  };

  // This Week: surface the single most important next action.
  const now = Date.now();
  const taskTitle = (t: any) => t?.roadmapTask?.title || t?.title || "Task";
  const isLate = (t: any) =>
    t.dueDate &&
    new Date(t.dueDate).getTime() < now &&
    !["completed", "submitted", "cancelled"].includes(t.status);
  const activeTasks = (allTasks || []).filter(
    (t: any) => !["completed", "cancelled", "submitted"].includes(t.status),
  );
  const heroTask =
    activeTasks.find(isLate) ||
    activeTasks.find((t: any) => t.status === "revision_needed") ||
    activeTasks.find((t: any) => t.status === "in_progress") ||
    activeTasks[0] ||
    null;
  const weekTasks = [...activeTasks]
    .sort((a: any, b: any) => {
      if (isLate(a) !== isLate(b)) return isLate(a) ? -1 : 1;
      return (
        new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime()
      );
    })
    .slice(0, 8);
  const firstName = user?.profile?.firstName || user?.firstName || "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mentee-welcome flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2 font-bold">
            Keep moving forward{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-slate-600">
            Your next step, your progress, and your people. All in one place.
          </p>
        </div>

        {/* WhatsApp Group links — cohort enrollment only (standing has no enrollment) */}
        {!standing && (
          <div className="w-full md:w-auto flex flex-col gap-2 shrink-0 md:max-w-md">
            {currentProgramEnrollments
              .filter((e) => e.clan?.whatsappGroupLink)
              .map((enrollment) => (
                <WhatsAppGroupCard
                  key={enrollment.id}
                  enrollment={enrollment}
                  compact
                />
              ))}
          </div>
        )}
      </div>

      <div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        aria-label="Your learning at a glance"
      >
        <Link href="/mentee/tasks">
          <LearningStat
            label="Ready to work on"
            value={tasksLoading ? "—" : activeTasks.length}
            icon={ListTodo}
            tone={0}
            hint="Open your active tasks →"
          />
        </Link>
        <Link href="/mentee/tasks?status=submitted">
          <LearningStat
            label="With your mentor"
            value={
              tasksLoading
                ? "—"
                : allTasks.filter((t) => t.status === "submitted").length
            }
            icon={Clock}
            tone={1}
            hint="Waiting for feedback →"
          />
        </Link>
        <Link href="/mentee/tasks?view=completed">
          <LearningStat
            label="Completed"
            value={
              tasksLoading
                ? "—"
                : allTasks.filter((t) => t.status === "completed").length
            }
            icon={CheckCircle2}
            tone={2}
            hint="Look back at your work →"
          />
        </Link>
        <Link href="/mentee/tasks?status=revision_needed">
          <LearningStat
            label="Needs another look"
            value={
              tasksLoading
                ? "—"
                : allTasks.filter((t) => t.status === "revision_needed").length
            }
            icon={Flag}
            tone={3}
            hint="Put mentor feedback into practice →"
          />
        </Link>
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)] gap-5">
        {/* Hero: the single most important next action */}
        {heroTask && (
          <Link
            href={`/mentee/tasks/${heroTask.id}`}
            onClick={openInDrawer(heroTask.id)}
            className="mentee-next-task block transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-brand-600 uppercase tracking-wide">
                Next up
              </span>
              {isLate(heroTask) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">
                  <Clock className="w-3 h-3" />
                  overdue
                </span>
              )}
            </div>
            <h2 className="text-xl font-semibold text-slate-900">
              {taskTitle(heroTask)}
            </h2>
            <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
              {heroTask.roadmapTask?.type && (
                <span className="capitalize">{heroTask.roadmapTask.type}</span>
              )}
              {heroTask.dueDate && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>
                    Due {new Date(heroTask.dueDate).toLocaleDateString()}
                  </span>
                </>
              )}
            </div>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700">
              Open task <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
        )}

        {!heroTask && (
          <div className="mentee-next-task">
            <CheckCircle2 className="h-8 w-8 text-brand-600 mb-4" />
            <h2 className="text-xl font-semibold">
              {tasksLoading ? "Finding your next step…" : "You’re caught up"}
            </h2>
            <p className="text-muted-foreground mt-2">
              {tasksLoading
                ? "Your tasks will appear here shortly."
                : "Check your roadmap or revisit feedback while you wait for your next task."}
            </p>
            <Link
              href="/mentee/roadmap"
              className="inline-flex mt-4 text-brand-600 font-medium"
            >
              Explore your roadmap →
            </Link>
          </div>
        )}

      </div>

      {/*
          Today as a line, with the planner one click behind it.

          The whole DayPlanner was rendered inline here — the blocks, the
          "work to plan" tray with a row and two controls per task, the drag
          targets — so on a mentee with five unplanned items the dashboard was
          mostly the planner, and the work queue underneath it was below the
          fold. Planning a day is a thing you sit down to do; a dashboard
          should say whether it is done.

          `PlanStripCard` is the mentor's existing strip-plus-drawer: one row
          saying what today looks like, the full planner in a drawer when you
          open it. Same component, same behaviour, one screen lighter.
      */}
      <section aria-label="Your plan for today" className="mt-6">
        <PlanStripCard menteeId="me" clanId={menteeActiveClanId || null} compact own />
      </section>

      {/* Recurring rituals (from your schedule) */}
      <RecurringRitualsCard />

      {/* This week's tasks */}
      {weekTasks.length > 0 && (
        <div className="bg-card rounded-2xl border border-slate-200">
          <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-slate-900">Your work queue</h2>
            <Link
              href="/mentee/tasks"
              className="text-brand-600 hover:text-brand-700 text-sm flex items-center gap-1"
            >
              All tasks <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {weekTasks.map((t: any) => (
              <Link
                key={t.id}
                href={`/mentee/tasks/${t.id}`}
                onClick={openInDrawer(t.id)}
                className="flex items-center gap-3 px-6 py-3.5 hover:bg-slate-50 transition-colors"
              >
                {t.status === "revision_needed" ? (
                  <Flag className="w-4 h-4 text-orange-500 shrink-0" />
                ) : (
                  <Clock
                    className={`w-4 h-4 shrink-0 ${isLate(t) ? "text-red-500" : "text-slate-300"}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {taskTitle(t)}
                  </p>
                  {t.roadmapTask?.type && (
                    <p className="text-xs text-slate-500 capitalize">
                      {t.roadmapTask.type}
                    </p>
                  )}
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : ""}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <AnnouncementsCard href="/mentee/announcements" />
      <details className="rounded-2xl border border-border bg-card p-5">
        <summary className="cursor-pointer font-medium">
          Your activity · time, consistency, and recent work
        </summary>
        <div className="mt-5">
          {" "}
      {/* Reference, not today's work.
          These three links were directly under the hero, above the day and
          above the queue — three things a mentee might do, in front of the
          two they came to do. Below them now. */}
      <section className="rounded-3xl border border-border bg-card p-6 space-y-2">
        <h2 className="font-semibold mb-3">Your support, one click away</h2>
        {[
          {
            href: "/mentee/daily-log",
            title: "Log today’s progress",
            detail: "Capture what you learned.",
            icon: ListTodo,
          },
          {
            href: "/mentee/meetings",
            title: "Meet your mentor",
            detail: "Find a time to talk it through.",
            icon: MessageSquareHeart,
          },
          {
            href: "/mentee/blockers",
            title: "Get unstuck",
            detail: "Share what is slowing you down.",
            icon: Flag,
          },
        ].map(({ href, title, detail, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex gap-3 items-center rounded-xl p-3 hover:bg-muted transition-colors"
          >
            <Icon className="h-5 w-5 text-brand-600 shrink-0" />
            <span className="flex-1">
              <span className="block text-sm font-medium">{title}</span>
              <span className="text-xs text-muted-foreground">{detail}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </section>
          {/* Activity self-view */}
          <ActivityCard
            summary={actSummary}
            dailySessions={actSessions}
            recentEvents={actEvents}
            loading={actLoading}
            days={actDays}
            onDaysChange={setActDays}
            onRefresh={refetchActivity}
          />
        </div>
      </details>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      ) : (
        <>
          {/* No enrollment yet - placement is admin/invite-driven now.
              Standing clans skip this: the mentee is already placed by clan. */}
          {!standing && enrollments.length === 0 && (
            <div className="bg-linear-to-br from-brand-50 dark:from-brand-500/10 to-brand-50 dark:to-transparent border border-brand-200 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-brand-900 mb-3">
                You're all set up
              </h2>
              <p className="text-brand-700">
                You haven't been placed in a program yet. Your program team will
                enroll you and connect you with a mentor - this page will fill
                in as soon as that happens.
              </p>
            </div>
          )}

          {/* Pending Completion - Awaiting Mentor Approval */}
          {!standing && pendingCompletionEnrollments.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-orange-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-orange-900 mb-1">Ready to complete 🎯</h3>
                  <div className="space-y-2">
                    {pendingCompletionEnrollments.map((e) => (
                      <div key={e.id}>
                        <p className="text-orange-700 text-sm">
                          You&apos;ve finished everything in{" "}
                          <strong>{e.program?.name}</strong> - your mentor will
                          review and confirm completion. Nothing more to do
                          here.
                        </p>
                        {e.completionRejectionReason && (
                          <div className="mt-1 p-2 bg-orange-100 rounded-lg text-orange-800 text-xs">
                            <strong>Mentor note:</strong>{" "}
                            {e.completionRejectionReason}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Level Completed - Auto-promoted to pending_match */}
          {!standing && levelCompletedEnrollments.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-green-900 mb-1">
                    Level{levelCompletedEnrollments.length > 1 ? "s" : ""}{" "}
                    Completed! 🎉
                  </h3>
                  <div className="space-y-1">
                    {levelCompletedEnrollments.map((e) => (
                      <p key={e.id} className="text-green-700 text-sm">
                        <strong>{e.program?.name}</strong> - the admin is
                        assigning your next mentor.
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pending Approvals Alert */}
          {!standing && pendingEnrollments.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-amber-900 mb-2">Pending Approval</h3>
                  <p className="text-amber-700 text-sm mb-3">
                    {pendingEnrollments.length} enrollment request(s) awaiting
                    admin approval
                  </p>
                  <div className="space-y-2">
                    {pendingEnrollments.map((enrollment) => (
                      <div
                        key={enrollment.id}
                        className="text-amber-900 text-sm"
                      >
                        • {enrollment.program?.name || "Unknown Program"}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Approved but not matched Alert */}
          {!standing && approvedEnrollments.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-blue-900 mb-2">
                    Approved - Awaiting Mentor Match
                  </h3>
                  <p className="text-blue-700 text-sm mb-3">
                    Your enrollment has been approved! Admin is matching you
                    with a mentor.
                  </p>
                  <div className="space-y-2">
                    {approvedEnrollments.map((enrollment) => (
                      <div
                        key={enrollment.id}
                        className="text-blue-900 text-sm"
                      >
                        • {enrollment.program?.name || "Unknown Program"}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active Programs - one card per in-progress enrollment */}
          {!standing && currentProgramEnrollments.length > 0 && (
            <div>
              <h2 className="text-slate-900 mb-4">
                Active Program{currentProgramEnrollments.length > 1 ? "s" : ""}
              </h2>
              <div className="grid gap-6 lg:grid-cols-2">
                {currentProgramEnrollments.map((enrollment) => (
                  <div
                    key={enrollment.id}
                    className="bg-card rounded-2xl border border-slate-200 p-6"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0 mr-3">
                        <h3 className="text-slate-900 truncate mb-1">
                          {enrollment.program?.name || "Unknown Program"}
                        </h3>
                        <p className="text-slate-600 text-sm">
                          Week {enrollment.currentWeek || 1}
                        </p>
                      </div>
                      <StatusBadge status={enrollment.status} noIcon />
                    </div>

                    {/* Progress Bar */}
                    {(() => {
                      const completed = enrollment.tasksCompleted || 0;
                      const total = enrollment.tasksTotal || 0;
                      // prefer server-supplied percentage; fall back to task ratio
                      const rawPct = parseFloat(
                        enrollment.overallProgressPercentage,
                      );
                      const pct =
                        rawPct > 0
                          ? rawPct
                          : total > 0
                            ? Math.round((completed / total) * 100)
                            : 0;

                      return (
                        <>
                          <div className="mb-4">
                            <ProgressBar value={pct} size="md" />
                          </div>

                          <div className="flex items-center gap-4 text-sm text-slate-600 mb-4">
                            <span className="flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                              {completed} completed
                            </span>
                            {total > 0 && (
                              <>
                                <span className="flex items-center gap-1.5">
                                  <ListTodo className="w-4 h-4 text-brand-600" />
                                  {total} program tasks
                                </span>
                              </>
                            )}
                          </div>
                        </>
                      );
                    })()}

                    <Link
                      href="/mentee/tasks"
                      className="block w-full text-center px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm transition-colors"
                    >
                      View Tasks
                    </Link>
                    <p className="mt-3 text-xs text-slate-500 text-center">
                      Finish every task and your mentor will confirm completion
                      - no request needed.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed Programs - Rate Your Mentor prompt */}
          {!standing && completedEnrollments.length > 0 && (
            <div>
              <h2 className="text-slate-900 mb-4">Completed Programs 🎓</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {completedEnrollments.map((e) => {
                  const reviewed = reviewedEnrollmentIds.has(e.id);
                  return (
                    <div
                      key={e.id}
                      className="bg-card rounded-2xl border border-slate-200 p-5 flex items-start justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                          <h3 className="text-slate-900 truncate">
                            {e.program?.name || "Unknown Program"}
                          </h3>
                        </div>
                        <p className="text-slate-500 text-sm">
                          Completed ·{" "}
                          {parseFloat(e.overallProgressPercentage || 0).toFixed(
                            0,
                          )}
                          % progress
                        </p>
                      </div>

                      {reviewed ? (
                        <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                          Feedback sent
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            openFeedback(
                              e.id,
                              e.program?.name || "this program",
                            )
                          }
                          className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-brand-50 hover:bg-brand-100 border border-brand-200 text-brand-700 rounded-xl text-sm transition-colors"
                        >
                          <MessageSquareHeart className="w-4 h-4" />
                          Leave feedback
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* All Enrollments */}
          {!standing && enrollments.length > 0 && (
            <details className="bg-card rounded-2xl border border-slate-200 p-6">
              <summary className="cursor-pointer font-medium mb-4">
                Enrollment history · {enrollments.length}
              </summary>
              <div className="space-y-3">
                {enrollments.map((enrollment) => (
                  <div
                    key={enrollment.id}
                    className="p-4 border border-slate-200 rounded-xl"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-slate-900">
                            {enrollment.program?.name || "Unknown Program"}
                          </h3>
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              enrollment.status === "pending_approval"
                                ? "bg-amber-100 text-amber-700"
                                : enrollment.status === "approved"
                                  ? "bg-blue-100 text-blue-700"
                                  : enrollment.status === "pending_match"
                                    ? "bg-purple-100 text-purple-700"
                                    : enrollment.status === "matched"
                                      ? "bg-green-100 text-green-700"
                                      : enrollment.status === "active"
                                        ? "bg-brand-100 text-brand-700"
                                        : enrollment.status ===
                                            "pending_completion"
                                          ? "bg-orange-100 text-orange-700"
                                          : enrollment.status ===
                                              "level_completed"
                                            ? "bg-teal-100 text-teal-700"
                                            : enrollment.status ===
                                                "program_completed"
                                              ? "bg-green-100 text-green-700"
                                              : enrollment.status === "rejected"
                                                ? "bg-red-100 text-red-700"
                                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {enrollment.status.replace(/_/g, " ")}
                          </span>
                        </div>
                        <div className="text-slate-600 text-sm">
                          Enrolled{" "}
                          {new Date(enrollment.enrolledAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}

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

      {/* Anonymous mentor feedback drawer */}
      <MentorFeedbackDrawer
        open={Boolean(feedbackTarget)}
        enrollmentId={feedbackTarget?.enrollmentId ?? null}
        programName={feedbackTarget?.programName ?? ""}
        onClose={closeFeedback}
        onSubmitted={markReviewed}
      />
    </div>
  );
}

export default function MenteeDashboard() {
  // Standing and cohort clans share the same mentee home — clan scope (X-Active-Clan)
  // and useMenteeTasks already isolate standing work from completed-cohort enrollments.
  // Frozen-clan notice only on This Week (not every mentee tab).
  const scope = useMenteeScope();

  /*
   * A selection-pool candidate has no clan, no mentor and no roadmap, so the
   * clan home has nothing to show them — it would be a page of empty cards
   * about things that only exist once they are placed. Their round is the
   * same workspace with the scope switched, so the home switches with it.
   */
  /*
   * Which home this is depends on the scope, so it waits for the scope.
   *
   * Rendering the clan home first and swapping it out looks cheap and is not:
   * it mounts a page's worth of requests about an enrollment, a mentor and a
   * roadmap that a candidate does not have, and a learner in more than one
   * clan has no clan header to send while the scope is a round, so the first
   * of those requests comes back 400 and the error boundary keeps the page in
   * its failed state long after the scope has settled.
   */
  if (scope.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }
  if (scope.inPool) return <PoolQualification poolId={scope.pool?.id} />;

  return (
    <>
      <ClanWorkspaceNotice role="mentee" />
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          </div>
        }
      >
        <MenteeDashboardInner />
      </Suspense>
    </>
  );
}
