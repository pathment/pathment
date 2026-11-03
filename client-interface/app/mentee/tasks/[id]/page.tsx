"use client";

import { OpenSourceOrgAvatar } from "@/components/shared/OpenSourceOrgAvatar";
import { Suspense, use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Calendar,
  Clock,
  Star,
  FileText,
  BookOpen,
  Sparkles,
  XCircle,
  User,
  Award,
  MessageSquare,
  ExternalLink,
  Loader2,
  StickyNote,
  Mic,
  ListChecks,
  Code2,
  Video,
} from "lucide-react";
import { ResourceLink } from "@/components/shared/ResourceLink";
import { SubmissionFileList } from "@/components/shared/SubmissionFileList";
import { useTaskDetail } from "@/lib/hooks/mentee";
import { ResourceError } from "@/components/shared/ResourceError";
import { PageHeader, StatusBadge } from "@/components/admin/ui";
import { useActivityTracker } from "@/lib/hooks/shared/useActivityTracker";
import { FrictionPanel } from "@/components/mentee/FrictionPanel";
import { TaskProgressTimeline } from "@/components/shared/TaskProgressTimeline";
import { SubmitTaskDrawer, isVideoPresentation } from "@/components/mentee/SubmitTaskDrawer";
import { participateHref } from "@/components/mentee/tasks/MenteeTaskRow";
import { RichContent } from "@/components/shared/RichContent";
import Link from "next/link";
import { InterviewReviewDrawer } from "@/components/mentor/InterviewReviewDrawer";
import { isMissingDescription } from "@/lib/utils/html";
import { TalkReviewSection } from "@/components/mentee/TalkReviewSection";
import { CourseProgressCard } from "@/components/shared/CourseProgressCard";
import { useClan, isHistoricalCohortClan } from "@/lib/context/ClanContext";
import { PoolTaskDetail } from "@/components/mentee/pool/PoolTaskDetail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TaskDetailsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  // `useSearchParams` needs a Suspense boundary above it to prerender.
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>}>
      <TaskDetailsRoute id={resolvedParams.id} />
    </Suspense>
  );
}

function TaskDetailsRoute({ id }: { id: string }) {
  /*
   * `?pool=1` says this id is qualifying work, not clan work.
   *
   * It is a flag rather than a guess because the two live in the same table
   * behind a fence: pool work is invisible to every ordinary task query, so
   * asking the clan endpoint first would 404 before falling through. The
   * links that get here all carry it (see `poolTaskHref`).
   */
  const isPoolWork = useSearchParams().get('pool') === '1';
  return isPoolWork ? <PoolTaskDetail id={id} /> : <ClanTaskDetail id={id} />;
}

function ClanTaskDetail({ id }: { id: string }) {
  const resolvedParams = { id };
  const router = useRouter();
  const { menteeClans, menteeActiveClanId } = useClan();
  const historical = isHistoricalCohortClan(
    menteeClans.find((c) => c.id === menteeActiveClanId),
  );
  const HISTORICAL_TITLE = "Completed programs are read-only";
  const { task, loading, error, errorStatus, refetch } = useTaskDetail(
    resolvedParams.id,
  );
  const { trackEvent } = useActivityTracker();
  const [section, setSection] = useState<"brief" | "work" | "progress" | null>(
    null,
  );
  useEffect(() => setSection(null), [resolvedParams.id]);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [interviewResultsOpen, setInterviewResultsOpen] = useState(false);

  useEffect(() => {
    if (task?.id) {
      trackEvent("task_opened", {
        eventCategory: "task",
        entityType: "task",
        entityId: task.id,
      });
    }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <ResourceError
        status={errorStatus ?? (task ? null : 404)}
        resource="task"
        message={error}
        backHref="/mentee/tasks"
        backLabel="Back to tasks"
        onRetry={refetch}
      />
    );
  }

  const activeSection =
    section ??
    (["completed", "submitted", "revision_needed"].includes(task.status)
      ? "work"
      : "brief");
  const taskTitle = task.roadmapTask?.title || task.title || "Untitled Task";
  const taskDescription =
    task.roadmapTask?.description || task.description || "";
  // Step details are authored in a rich-text editor (HTML); older tasks stored
  // plain text. Render HTML safely, fall back to plain text for legacy values.
  const descriptionIsHtml = /<[a-z][\s\S]*>/i.test(taskDescription);
  const taskDeliverable = task.roadmapTask?.deliverable || task.deliverable;
  const acceptanceCriteria =
    task.roadmapTask?.acceptanceCriteria || task.acceptanceCriteria || [];
  const resources = task.roadmapTask?.resources || [];
  // The API returns submissions ordered version DESC; pick the highest version
  // robustly (don't assume array order) so we show the mentee's LATEST work.
  const submissionsList: any[] = task.submissions || []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const workSubmissionsList = submissionsList.filter(
    (s: any) => !s.extensionRequested,
  );
  const latestSubmission = workSubmissionsList.length
    ? [...workSubmissionsList].sort(
        (a, b) => (b.version || 0) - (a.version || 0),
      )[0]
    : null;
  const hasPendingExtension = submissionsList.some(
    (s: any) => s.extensionRequested && s.extensionStatus === "pending",
  );
  const sortedExtensions = [...submissionsList]
    .filter((s: any) => s.extensionRequested)
    .sort((a: any, b: any) => (b.version || 0) - (a.version || 0));
  // Show ALL mentor feedback across every version (newest first) so the mentee
  // still sees what was requested even after they re-submit a new version.
  const feedback = submissionsList
    .flatMap((s: any) =>
      (s.feedback || []).map((fb: any) => ({ ...fb, version: s.version })),
    ) // eslint-disable-line @typescript-eslint/no-explicit-any
    .sort(
      (a: any, b: any) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime(),
    ); // eslint-disable-line @typescript-eslint/no-explicit-any

  // A mentee can still change their work while it's awaiting review ('submitted')
  // — only a graded/cancelled task is locked. Resubmitting creates a new version.
  const canSubmit = [
    "in_progress",
    "revision_needed",
    "assigned",
    "submitted",
  ].includes(task.status);
  // Interview tasks are done in the full-screen runner, not the submit drawer.
  const isInterview = (task.roadmapTask?.type || task.type) === "interview";
  const openInterview = () => router.push(`/mentee/interviews/${task.id}`);
  // Quiz tasks run in the quiz runner (start/resume/retake/view) — never the submit drawer.
  const isQuiz = (task.roadmapTask?.type || task.type) === "quiz";
  const openQuiz = () => router.push(`/mentee/quizzes/${task.id}`);
  const isTalk = (task.roadmapTask?.type || task.type) === "talk" || (task.talks && task.talks.length > 0);
  // Course tasks are studied on Buildment and complete themselves from its progress.
  const isCourse = (task.roadmapTask?.type || task.type) === "course";
  // Handed in as a recording or a link to one; the submit drawer says how.
  const videoPresentation = isVideoPresentation({ type: task.roadmapTask?.type || task.type, isCustomTask: task.isCustomTask });
  // A Group Discussion task is taken part in from its chat, then submitted.
  const discussion = participateHref({ type: task.roadmapTask?.type || task.type, discussionGroupId: task.discussionGroupId });

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back button */}
      <PageHeader backHref="/mentee/tasks" backLabel="Back to Tasks" />

      {/* Task Header */}
      <div className="bg-card rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h1 className="text-2xl text-slate-900">{taskTitle}</h1>
              {task.isCustomTask ? (
                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Custom
                </span>
              ) : (
                <span className="px-2 py-1 bg-brand-100 text-brand-700 rounded text-xs font-medium flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> Roadmap
                </span>
              )}
              {isTalk && (
                <span className="px-2 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 rounded text-xs font-medium flex items-center gap-1">
                  <Video className="w-3 h-3" /> Talk / Podcast
                </span>
              )}
              {videoPresentation && (
                <span className="px-2 py-1 bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 rounded text-xs font-medium flex items-center gap-1">
                  <Video className="w-3 h-3" /> Video Presentation
                </span>
              )}
            </div>
            {task.mentorNote && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 px-3 py-2">
                <StickyNote className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                    Note from your mentor
                  </p>
                  <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap">
                    {task.mentorNote}
                  </p>
                </div>
              </div>
            )}
          </div>
          <StatusBadge status={task.status} />
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100">
          {task.dueDate && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Due Date</p>
              <p className="text-sm text-slate-900 flex items-center gap-1">
                <Calendar className="w-4 h-4 text-slate-400" />
                {new Date(task.dueDate).toLocaleDateString()}
              </p>
            </div>
          )}
          {task.completedAt && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Completed</p>
              <p className="text-sm text-slate-900 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                {new Date(task.completedAt).toLocaleDateString()}
              </p>
            </div>
          )}
          {task.roadmapTask?.estimatedHours && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Estimated</p>
              <p className="text-sm text-slate-900 flex items-center gap-1">
                <Clock className="w-4 h-4 text-slate-400" />
                {task.roadmapTask.estimatedHours}h
              </p>
            </div>
          )}
          {(task.points ?? task.pointsBase ?? task.roadmapTask?.pointsBase) !=
            null && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Points</p>
              <p className="text-sm text-slate-900 flex items-center gap-1">
                <Award className="w-4 h-4 text-brand-500" />
                {task.status === "completed" && task.pointsAwarded != null
                  ? `${task.pointsAwarded} / ${task.points ?? task.pointsBase ?? task.roadmapTask?.pointsBase}`
                  : `Worth ${task.points ?? task.pointsBase ?? task.roadmapTask?.pointsBase}`}
              </p>
            </div>
          )}
        </div>

        {/* Rating & Points (completed tasks) */}
        {task.status === "completed" &&
          (task.finalRating || task.pointsAwarded) && (
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-6">
              {task.finalRating && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-5 h-5 ${
                          star <= parseFloat(task.finalRating)
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-slate-200"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-sm text-slate-600">
                    {parseFloat(task.finalRating).toFixed(1)} / 5
                  </span>
                </div>
              )}
              {task.pointsAwarded != null && (
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-brand-500" />
                  <span className="text-sm font-semibold text-brand-700">
                    {task.pointsAwarded} points earned
                  </span>
                </div>
              )}
            </div>
          )}

        {/* Cancellation reason */}
        {task.status === "cancelled" && task.cancellationReason && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-900">Task Cancelled</p>
              <p className="text-sm text-red-700 mt-1">
                {task.cancellationReason}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Action: interview tasks launch the runner; everything else uses the drawer */}
      {isInterview ? (
        task.status === "completed" ? (
          <div className="flex justify-end">
            <button
              onClick={() => setInterviewResultsOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium transition-colors"
            >
              <Mic className="w-4 h-4" /> View interview &amp; feedback
            </button>
          </div>
        ) : (
          task.status !== "cancelled" && (
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={
                  task.status === "submitted"
                    ? () => setInterviewResultsOpen(true)
                    : openInterview
                }
                disabled={historical && task.status !== "submitted"}
                title={historical && task.status !== "submitted" ? HISTORICAL_TITLE : undefined}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                <Mic className="w-4 h-4" />
                {task.status === "submitted"
                  ? "View your answers"
                  : task.status === "in_progress"
                    ? "Resume interview"
                    : task.status === "revision_needed"
                      ? "Redo questions"
                      : "Start interview"}
              </button>
              {task.status === "submitted" && (
                <p className="text-xs text-slate-400">
                  Your mentor will review your answers.
                </p>
              )}
              {task.status === "revision_needed" && (
                <p className="text-xs text-amber-600">
                  Your mentor asked you to redo a few questions.
                </p>
              )}
            </div>
          )
        )
      ) : isQuiz ? (
        task.status === "completed" || task.status === "submitted" ? (
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={openQuiz}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium transition-colors"
            >
              <ListChecks className="w-4 h-4" /> View quiz result
            </button>
            {task.status === "submitted" && (
              <p className="text-xs text-slate-400">
                Your mentor will confirm your score.
              </p>
            )}
          </div>
        ) : (
          task.status !== "cancelled" && (
            <div className="flex justify-end">
              <button
                onClick={openQuiz}
                disabled={historical}
                title={historical ? HISTORICAL_TITLE : undefined}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                <ListChecks className="w-4 h-4" />
                {task.status === "in_progress" ? "Resume quiz" : "Start quiz"}
              </button>
            </div>
          )
        )
      ) : isCourse ? (
        <CourseProgressCard taskId={task.id} viewer="mentee" onTaskStatusChange={refetch} />
      ) : discussion && task.status === "assigned" ? (
        <div className="flex flex-col items-end gap-1">
          {historical ? (
            <button disabled title={HISTORICAL_TITLE} className="px-6 py-2.5 bg-brand-600 text-white rounded-xl font-medium opacity-50">
              Participate
            </button>
          ) : (
            <Link href={discussion} className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium transition-colors">
              Participate
            </Link>
          )}
          <p className="text-xs text-slate-400">Join the group chat; you can submit once you have taken part.</p>
        </div>
      ) : (
        canSubmit && (
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={() => setSubmitOpen(true)}
              disabled={historical}
              title={historical ? HISTORICAL_TITLE : undefined}
              className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              {task.status === "submitted"
                ? "Update submission"
                : task.status === "revision_needed"
                  ? "Re-submit Work"
                  : "Submit Work"}
            </button>
            {task.status === "submitted" && (
              <p className="text-xs text-slate-400">
                You can update your work until your mentor reviews it.
              </p>
            )}
          </div>
        )
      )}

      <nav
        aria-label="Task sections"
        className="flex gap-2 overflow-x-auto rounded-2xl border border-border bg-card p-2"
      >
        {[
          { id: "brief", label: "Task brief" },
          { id: "work", label: "Submission & feedback" },
          { id: "progress", label: "Progress & support" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={activeSection === item.id}
            onClick={() => setSection(item.id as "brief" | "work" | "progress")}
            className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium ${activeSection === item.id ? "bg-brand-600 text-white" : "text-muted-foreground hover:bg-muted"}`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {activeSection === "brief" && (
        <section aria-label="Task brief" className="space-y-5">
          {/* A group discussion's scenario is its brief, shown with the group below. */}
          {!(task.discussionGroup && isMissingDescription(taskDescription, taskTitle)) && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-semibold mb-4">What you’ll work on</h2>{" "}
              {isMissingDescription(taskDescription, taskTitle) ? (
                <p className="text-sm text-slate-400">No description provided.</p>
              ) : descriptionIsHtml ? (
                <div
                  className="prose prose-sm max-w-none dark:prose-invert text-slate-600 dark:text-slate-300"
                  dangerouslySetInnerHTML={{ __html: taskDescription }}
                />
              ) : (
                <p className="text-slate-600 whitespace-pre-wrap">
                  {taskDescription}
                </p>
              )}
            </div>
          )}
          {/* Task Requirements */}
          <div className="bg-card rounded-2xl border border-slate-200 p-6 space-y-5">
            <h2 className="text-lg font-semibold text-slate-900">
              Task Requirements
            </h2>

            {/* Open Source Organizations */}
            {Array.isArray(task.openSourceOrgs) &&
              task.openSourceOrgs.length > 0 && (
                <div className="p-4 bg-brand-50/60 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/20 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-brand-900 dark:text-brand-200">
                    <Code2 className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    Open Source Organization
                    {task.openSourceOrgs.length > 1 ? "s" : ""}
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {task.openSourceOrgs.map((org: any) => (
                      <a
                        key={org.id || org.name}
                        href={org.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-brand-200 dark:border-brand-500/30 bg-white dark:bg-slate-900 hover:bg-brand-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-900 dark:text-slate-100 shadow-xs transition-colors group"
                      >
                        <OpenSourceOrgAvatar
                          name={org.name}
                          url={org.url}
                          avatar={org.avatar}
                          className="w-4 h-4 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                        />
                        <span>{org.name}</span>
                        <ExternalLink className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400 group-hover:underline" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

            {task?.talks && task.talks.length > 0 && (
              <TalkReviewSection talks={task.talks} />
            )}

            {task?.discussionGroup && (
              <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-500/20 dark:bg-brand-500/5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {task.discussionGroup.scenario?.title || task.discussionGroup.name}
                    <span className="ml-2 font-normal text-slate-500">{task.discussionGroup.name}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push(`/mentee/discussions/${task.discussionGroup.id}`)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    <MessageSquare className="h-4 w-4" /> Open discussion
                  </button>
                </div>
                {task.discussionGroup.scenario?.prompt && (
                  <RichContent html={task.discussionGroup.scenario.prompt} className="mt-2 text-slate-700 dark:text-slate-300" />
                )}
              </div>
            )}

            {taskDeliverable && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  Deliverable
                </p>
                <p className="text-sm text-blue-800">{taskDeliverable}</p>
              </div>
            )}

            {acceptanceCriteria.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-3">
                  Acceptance Criteria
                </h3>
                <ul className="space-y-2">
                  {acceptanceCriteria.map(
                    (criterion: string, index: number) => (
                      <li
                        key={index}
                        className="flex items-start gap-2 text-slate-700"
                      >
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                        <span className="text-sm">{criterion}</span>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}

            {resources.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-3">
                  Learning Resources
                </h3>
                <ul className="space-y-2">
                  {resources.map((resource: any, index: number) => (
                    <ResourceLink
                      key={resource.id || resource.url || index}
                      url={resource.url}
                      title={resource.title}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}
      {activeSection === "work" && (
        <section aria-label="Submission and feedback" className="space-y-5">
          {!latestSubmission && (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <FileText className="h-8 w-8 mx-auto mb-3 text-brand-600" />
              <h2 className="font-semibold">
                {isCourse
                  ? "Your course"
                  : isQuiz || isInterview
                  ? "Your assessment"
                  : "Your work will appear here"}
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                {isCourse
                  ? "There is nothing to hand in — this task completes automatically when you finish the course on Buildment."
                  : isQuiz || isInterview
                  ? "Use the assessment button above to open your work or view your results."
                  : videoPresentation
                  ? "Record your presentation, then submit the video file or a link to it (YouTube unlisted, Loom or Google Drive). Your mentor’s feedback will appear here."
                  : "Submit your work when it’s ready. Your files and mentor’s feedback will stay together here."}
              </p>
            </div>
          )}
          {/* Submission(s) */}
          {latestSubmission && (
            <div className="bg-card rounded-2xl border border-slate-200 p-6 space-y-5">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-500" />
                Your Submission
                {workSubmissionsList.length > 1 && (
                  <span className="text-xs text-slate-500 font-normal ml-1">
                    (v{latestSubmission?.version})
                  </span>
                )}
              </h2>

              {latestSubmission && (
                <div className="space-y-4">
                  {/* Status badge */}
                  {latestSubmission.status && (
                    <StatusBadge status={latestSubmission.status} />
                  )}

                  {/* Submission text */}
                  {latestSubmission.submissionText && (
                    <div>
                      <p className="text-xs text-slate-500 mb-2">
                        Submission Description
                      </p>
                      <div
                        className="prose prose-sm max-w-none text-slate-700 bg-slate-50 rounded-lg p-4 border border-slate-100"
                        dangerouslySetInnerHTML={{
                          __html: latestSubmission.submissionText,
                        }}
                      />
                    </div>
                  )}

                  {/* Submission URLs */}
                  {latestSubmission.submissionUrls &&
                    latestSubmission.submissionUrls.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-500 mb-2">
                          Project Links
                        </p>
                        <ul className="space-y-1.5">
                          {latestSubmission.submissionUrls.map(
                            (url: string, i: number) => (
                              <li key={i}>
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-brand-600 hover:underline flex items-center gap-2"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                  {url}
                                </a>
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}

                  {/* Submission files */}
                  {latestSubmission.files &&
                    latestSubmission.files.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-500 mb-2">
                          Attachments
                        </p>
                        <SubmissionFileList files={latestSubmission.files} />
                      </div>
                    )}

                  {/* Submitted at */}
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Submitted on{" "}
                    {new Date(latestSubmission.submittedAt).toLocaleString()}
                    {latestSubmission.reviewedAt && (
                      <>
                        {" "}
                        · Reviewed on{" "}
                        {new Date(latestSubmission.reviewedAt).toLocaleString()}
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Mentor Feedback */}
          {feedback.length > 0 && (
            <div className="bg-card rounded-2xl border border-slate-200 p-6 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-brand-500" />
                Mentor Feedback
              </h2>
              {feedback.map((fb: any, index: number) => {
                // eslint-disable-line @typescript-eslint/no-explicit-any
                // Map the real TaskFeedback shape (feedbackText / revisionNotes /
                // inlineFeedback / decision), not the old comments/strengths fields.
                const decision: string =
                  fb.decision || (fb.isApproved ? "approved" : "changes");
                const isChanges =
                  decision === "changes" || decision === "rejected";
                const ratingNum = Number(fb.rating);
                const mentorName = [
                  fb.mentor?.firstName || task.mentor?.firstName,
                  fb.mentor?.lastName || task.mentor?.lastName,
                ]
                  .filter(Boolean)
                  .join(" ");
                const DECISION_META: Record<
                  string,
                  { label: string; cls: string }
                > = {
                  approved: {
                    label: "Approved",
                    cls: "bg-emerald-100 text-emerald-700",
                  },
                  approved_notes: {
                    label: "Approved with notes",
                    cls: "bg-emerald-100 text-emerald-700",
                  },
                  changes: {
                    label: "Changes requested",
                    cls: "bg-amber-100 text-amber-700",
                  },
                  rejected: {
                    label: "Not accepted",
                    cls: "bg-rose-100 text-rose-700",
                  },
                };
                const meta = DECISION_META[decision] || DECISION_META.changes;
                // feedbackText and revisionNotes are often identical for a "changes"
                // decision — only show the notes block when it adds something.
                const showNotes =
                  fb.revisionNotes &&
                  fb.revisionNotes.trim() &&
                  fb.revisionNotes.trim() !== (fb.feedbackText || "").trim();
                const cardCls = isChanges
                  ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20"
                  : "bg-brand-50 dark:bg-brand-500/10 border-brand-200 dark:border-brand-500/20";
                return (
                  <div
                    key={fb.id || index}
                    className={`p-4 border rounded-lg space-y-3 ${cardCls}`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-medium text-slate-900">
                          {mentorName || "Your mentor"}
                        </span>
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${meta.cls}`}
                        >
                          {meta.label}
                        </span>
                        {fb.version != null && (
                          <span className="text-[11px] text-slate-400">
                            on v{fb.version}
                          </span>
                        )}
                      </div>
                      {Number.isFinite(ratingNum) && ratingNum > 0 && (
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-4 h-4 ${star <= Math.round(ratingNum) ? "fill-yellow-400 text-yellow-400" : "text-slate-200"}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {fb.feedbackText && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-1">
                          {isChanges ? "What the mentor asked for" : "Feedback"}
                        </p>
                        <div
                          className="text-sm text-slate-800 whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{ __html: fb.feedbackText }}
                        />
                      </div>
                    )}

                    {showNotes && (
                      <div>
                        <p className="text-xs font-medium text-amber-700 mb-1">
                          Changes to make
                        </p>
                        <p className="text-sm text-amber-900 whitespace-pre-wrap">
                          {fb.revisionNotes}
                        </p>
                      </div>
                    )}

                    {Array.isArray(fb.inlineFeedback) &&
                      fb.inlineFeedback.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 mb-1">
                            Inline notes
                          </p>
                          <ul className="space-y-1">
                            {fb.inlineFeedback.map((line: any, i: number) => (
                              // eslint-disable-line @typescript-eslint/no-explicit-any
                              <li key={i} className="text-sm text-slate-700">
                                •{" "}
                                {typeof line === "string"
                                  ? line
                                  : line?.text ||
                                    line?.note ||
                                    JSON.stringify(line)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                    {fb.createdAt && (
                      <p className="text-xs text-slate-400">
                        {new Date(fb.createdAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
      {activeSection === "progress" && (
        <section aria-label="Progress and support" className="space-y-5">
          {/* Extension Requests History */}
          {sortedExtensions.length > 0 && (
            <div className="bg-card rounded-2xl border border-slate-200 p-6 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-brand-500" />
                Extension Requests History
              </h2>
              <div className="divide-y divide-slate-100">
                {sortedExtensions.map((ext: any) => (
                  <div
                    key={ext.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        Requested {ext.extensionDays} extra days
                      </p>
                      {ext.extensionReason && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          Reason: &ldquo;{ext.extensionReason}&rdquo;
                        </p>
                      )}
                      <p className="text-[11px] text-slate-400 mt-1">
                        Requested on{" "}
                        {new Date(ext.submittedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="self-start sm:self-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          ext.extensionStatus === "approved"
                            ? "bg-emerald-100 text-emerald-800"
                            : ext.extensionStatus === "rejected"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {ext.extensionStatus === "approved"
                          ? "Approved"
                          : ext.extensionStatus === "rejected"
                            ? "Rejected"
                            : "Pending Review"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Day by day progress. Sits above the friction panel because "here's what
          I did" is the everyday act and "here's what stopped me" is the exception.
          Interview and quiz tasks are one sitting, so there is no day three. */}
          {!["completed", "cancelled"].includes(task.status) &&
            !isInterview &&
            !isQuiz && <TaskProgressTimeline taskId={task.id} mode="mentee" readOnly={historical} />}

          {/* What's getting in the way - log roadblock / delay / request extension */}
          {!["completed", "cancelled"].includes(task.status) && (
            <FrictionPanel
              taskId={task.id}
              hasPendingExtension={hasPendingExtension}
              readOnly={historical}
            />
          )}
        </section>
      )}
      {!isInterview && !isQuiz && !isCourse && (
        <SubmitTaskDrawer
          open={submitOpen}
          task={{
            id: task.id,
            title: taskTitle,
            status: task.status,
            deliverable: taskDeliverable,
            acceptanceCriteria,
            type: task.roadmapTask?.type || task.type,
            isCustomTask: task.isCustomTask,
          }}
          onClose={() => setSubmitOpen(false)}
          onSubmitted={refetch}
          readOnly={historical}
        />
      )}

      {isInterview && interviewResultsOpen && (
        <InterviewReviewDrawer
          taskId={task.id}
          onClose={() => setInterviewResultsOpen(false)}
        />
      )}
    </div>
  );
}
