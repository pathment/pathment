"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Activity, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { initialTaskSchedule, type TaskScheduleDraft } from "./TaskScheduleFields";
import { TaskTimingRow, type TaskDueDraft } from "./TaskTimingRow";
import { TaskProgressTimeline } from "./TaskProgressTimeline";
import { TaskSubmissionHistory } from "./TaskSubmissionHistory";
import { Drawer } from "@/components/shared/Drawer";
import RichTextEditor from "@/components/shared/RichTextEditor";
import taskApi from "@/lib/services/task-api";
import { extractApiErrorMessage } from "@/lib/utils/api-error";
import { cleanHtml } from "@/lib/utils/html";
import { pointsForDifficulty } from "@/lib/config/points";
import { useFormDraft, clearFormDraft } from "@/lib/hooks/shared/useFormDraft";

interface ResourceItem {
  title: string;
  url: string;
  resourceType?: string;
}

/**
 * The types the server will swap one assignment to. Quizzes, interviews,
 * open-source work and courses each carry their own setup (a kit, an
 * organization, an enrollment), so they are never in this list — a task that
 * already is one shows its type as a locked chip instead.
 */
const EDITABLE_TYPES = [
  "assignment", "project", "reading", "video", "discussion",
  "practical", "exercise", "assessment", "custom",
] as const;
const TYPE_LABEL: Record<string, string> = {
  assignment: "Assignment", project: "Project", reading: "Reading", video: "Video",
  discussion: "Discussion", practical: "Practical", exercise: "Exercise",
  assessment: "Assessment", custom: "Custom", quiz: "Quiz", interview: "Interview",
  open_source: "Open Source", course: "Course", talk: "Talk / Podcast",
};
const STATUS_META: Record<string, { label: string; cls: string }> = {
  assigned: { label: "Assigned", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  not_started: { label: "Not started", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  in_progress: { label: "In progress", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  submitted: { label: "Submitted", cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  revision_needed: { label: "Changes requested", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500" },
};
/** Before anything has been handed in — the window where timing can still move. */
const OPEN_STATUSES = ["assigned", "not_started", "in_progress"];

/** 'YYYY-MM-DD' in the viewer's zone — an ISO instant is a day off west of UTC. */
const dayKey = (d: Date) => d.toLocaleDateString("en-CA");
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const niceDay = (value: string | Date | null | undefined) => {
  if (!value) return null;
  // A bare 'YYYY-MM-DD' is a calendar day, not an instant: parse it at local
  // noon so it cannot slide a day either way.
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/**
 * Mentor edits ONE mentee's assigned task.
 *
 * Same form as assigning one, carrying what is already there: the mentor is
 * answering the same questions in the same order, so the two screens are the
 * same screen. Only the fields actually changed are sent — untouched ones keep
 * tracking the roadmap step, touched ones become a per-mentee override, and
 * clearing a field resets it to the roadmap default.
 *
 * A task in flight opens with the mentee's progress above the form. Clan Review
 * drops straight into this drawer rather than the read-only one, so without it
 * the mentor edits the work without ever seeing how it is going.
 */
export function TaskEditDrawer({
  task,
  onClose,
  onSaved,
}: {
  task: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  onClose: () => void;
  onSaved: () => void;
}) {
  const rt = task.roadmapTask || {};
  const initialPoints =
    Number(task.pointsBase ?? rt.pointsBase ?? pointsForDifficulty(rt.difficulty || task.difficulty)) ||
    pointsForDifficulty("medium");
  const initial = {
    type: rt.type || "custom",
    title: rt.title || "",
    description: rt.description || "",
    deliverable: rt.deliverable || "",
    criteria: ((rt.acceptanceCriteria || []) as string[]).filter(Boolean),
    note: task.mentorNote || "",
    pointsBase: initialPoints,
  };
  const [type, setType] = useState(initial.type);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [deliverable, setDeliverable] = useState(initial.deliverable);
  const [criteria, setCriteria] = useState<string[]>(initial.criteria);
  const [note, setNote] = useState(initial.note);
  const [pointsBase, setPointsBase] = useState(initial.pointsBase);
  const [resources, setResources] = useState<ResourceItem[]>(
    (rt.resources || []).map((r: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      title: r.title || "",
      url: r.url || "",
      resourceType: r.resourceType || "reading",
    })),
  );
  const [resourcesTouched, setResourcesTouched] = useState(false);
  // Read inside the fetch callback below, which closes over the first render.
  const resourcesTouchedRef = useRef(false);
  const markResourcesTouched = () => { resourcesTouchedRef.current = true; setResourcesTouched(true); };

  const typeLocked = !EDITABLE_TYPES.includes(initial.type as typeof EDITABLE_TYPES[number]);
  const canSchedule = OPEN_STATUSES.includes(task.status);
  const canChangeType = canSchedule && !typeLocked;

  const initialDue = task.dueDate ? String(task.dueDate).slice(0, 10) : "";
  const [due, setDue] = useState<TaskDueDraft>({ days: 7, exact: initialDue });
  const [dueTouched, setDueTouched] = useState(false);
  const dueValue = due.exact || dayKey(inDays(due.days));

  const [schedule, setSchedule] = useState<TaskScheduleDraft>({
    ...initialTaskSchedule(),
    ...task.schedule,
    endsOn: task.schedule?.endsOn || "",
  });
  const [scheduleTouched, setScheduleTouched] = useState(false);
  const [scheduleReady, setScheduleReady] = useState(false);
  const [scheduleError, setScheduleError] = useState(false);
  // The full record: the list payload this drawer opens with carries neither
  // the step's resources nor the submission history.
  const [detail, setDetail] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  useEffect(() => {
    let active = true;
    taskApi.getTaskById(task.id).then(response => {
      if (!active) return;
      const full = response.data.task;
      setDetail(full);
      const saved = full.schedule;
      setSchedule({ ...initialTaskSchedule(), ...saved, endsOn: saved?.endsOn || '' });
      if (full.interviewAssignment?.totalSeconds) {
        setInterviewMinutes(Math.round(full.interviewAssignment.totalSeconds / 60));
      }
      setScheduleReady(true);
      // Without this the resources box reads empty on a task that has some, and
      // adding one would quietly replace the real list with just that one.
      const full_resources = full.roadmapTask?.resources;
      if (Array.isArray(full_resources) && full_resources.length) {
        setResources(prev => (resourcesTouchedRef.current || prev.length ? prev : full_resources.map((r: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
          title: r.title || '',
          url: r.url || '',
          resourceType: r.resourceType || 'reading',
        }))));
      }
    }).catch(() => { if (active) setScheduleError(true); });
    return () => { active = false; };
  }, [task.id]);

  const [interviewMinutes, setInterviewMinutes] = useState<number | "">("");
  const [interviewMinutesTouched, setInterviewMinutesTouched] = useState(false);
  const isInterview = initial.type === "interview" || task.typeOverride === "interview" || rt.type === "interview";
  const [saving, setSaving] = useState(false);
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const draftKey = `pathment:edit-task:${task.id}`;

  type EditDraft = {
    type?: string;
    title: string;
    description: string;
    deliverable: string;
    criteria: string[];
    note: string;
    resources: ResourceItem[];
    resourcesTouched: boolean;
  };

  const { flush: flushDraft } = useFormDraft<EditDraft>(
    draftKey,
    { type, title, description, deliverable, criteria, note, resources, resourcesTouched },
    (d) => {
      if (!d || typeof d !== "object") return;
      if (typeof d.type === "string") setType(d.type);
      if (typeof d.title === "string") setTitle(d.title);
      if (typeof d.description === "string") setDescription(d.description);
      if (typeof d.deliverable === "string") setDeliverable(d.deliverable);
      // Criteria used to be saved as one newline-joined string.
      if (Array.isArray(d.criteria)) setCriteria(d.criteria);
      else if (typeof d.criteria === "string") setCriteria((d.criteria as string).split("\n").filter(Boolean));
      if (typeof d.note === "string") setNote(d.note);
      if (Array.isArray(d.resources)) setResources(d.resources);
      if (typeof d.resourcesTouched === "boolean") {
        resourcesTouchedRef.current = d.resourcesTouched;
        setResourcesTouched(d.resourcesTouched);
      }
    },
  );

  const closeKeepingDraft = () => {
    flushDraft();
    onClose();
  };

  // Deliverable, checks and resources live behind a fold on the assign form.
  // Opened on a task that already has some, the fold would hide the very thing
  // the mentor came to change, so it opens itself once when there is something
  // in there.
  const [extrasOpen, setExtrasOpen] = useState(false);
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current) return;
    if (deliverable || criteria.length || resources.length) {
      autoOpened.current = true;
      setExtrasOpen(true);
    }
  }, [deliverable, criteria.length, resources.length]);

  const setRes = (i: number, patch: Partial<ResourceItem>) => {
    markResourcesTouched();
    setResources((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const addRes = () => {
    markResourcesTouched();
    setResources((p) => [...p, { title: "", url: "", resourceType: "reading" }]);
  };
  const removeRes = (i: number) => {
    markResourcesTouched();
    setResources((p) => p.filter((_, idx) => idx !== i));
  };

  /**
   * The server refuses a repeat that starts in the past, which an existing
   * weekly rule eventually always does. Nudge it to tomorrow rather than hand
   * the mentor an error they have no control to fix.
   */
  const scheduleForSave = (): TaskScheduleDraft => {
    if (schedule.mode === "now") return schedule;
    const startsAt = new Date(`${schedule.startsOn}T${schedule.timeLocal || "09:00"}`);
    if (!Number.isNaN(startsAt.getTime()) && startsAt > new Date()) return schedule;
    return { ...schedule, startsOn: dayKey(inDays(1)) };
  };

  const save = async () => {
    const payload: Record<string, unknown> = {};
    if (saving) return;
    if (scheduleTouched) payload.schedule = scheduleForSave();
    if (dueTouched && dueValue && dueValue !== initialDue) payload.dueDate = dueValue;
    if (type !== initial.type) payload.typeOverride = type;
    if (title !== initial.title) payload.titleOverride = title.trim() || null;
    if (cleanHtml(description) !== cleanHtml(initial.description))
      payload.descriptionOverride = cleanHtml(description) || null;
    if (deliverable !== initial.deliverable)
      payload.deliverableOverride = deliverable.trim() || null;
    const cleanCriteria = criteria.map((c) => c.trim()).filter(Boolean);
    if (cleanCriteria.join("\n") !== initial.criteria.join("\n")) {
      payload.acceptanceCriteriaOverride = cleanCriteria.length ? cleanCriteria : null;
    }
    if (note !== initial.note) payload.mentorNote = note.trim() || null;
    if (pointsBase !== initial.pointsBase) {
      payload.pointsBase = Math.max(1, Math.min(200, Math.round(Number(pointsBase) || initial.pointsBase)));
    }
    if (interviewMinutesTouched && interviewMinutes !== "") {
      payload.interview = {
        totalSeconds: Math.max(1, Number(interviewMinutes)) * 60,
      };
    }
    if (resourcesTouched) {
      const arr = resources
        .filter((r) => r.url.trim())
        .map((r) => ({
          title: r.title.trim() || r.url.trim(),
          url: r.url.trim(),
          resourceType: r.resourceType || "reading",
        }));
      payload.resourcesOverride = arr.length ? arr : null;
    }
    if (!Object.keys(payload).length) {
      toast.info("Nothing changed");
      clearFormDraft(draftKey);
      onClose();
      return;
    }
    setSaving(true);
    try {
      await taskApi.updateTask(task.id, payload as never);
      toast.success("Task updated for this mentee");
      clearFormDraft(draftKey);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Could not update the task"));
    } finally {
      setSaving(false);
    }
  };
  saveRef.current = save;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const field =
    "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500";
  const label = "block text-sm font-medium text-slate-700 mb-1";
  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
      active
        ? "border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400"
        : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900"
    }`;

  const status = STATUS_META[task.status] || STATUS_META.assigned;
  const source = task.isCustomTask
    ? "Custom task"
    : `Roadmap${task.roadmapName || rt.roadmap?.name ? ` · ${task.roadmapName || rt.roadmap?.name}` : ""}`;
  const chip = "px-2 py-0.5 rounded-full text-[11px] font-medium";

  const submissions: any[] = detail?.submissions || []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showSubmissions, setShowSubmissions] = useState(false);
  // Everything the mentee has actually done. Shown whenever they have started,
  // because "what has changed since I assigned this" is the first thing a
  // mentor wants and the only thing this drawer used to leave out.
  const started = ["in_progress", "revision_needed", "submitted"].includes(task.status)
    || !!task.startedAt || submissions.length > 0;
  const dueAt = task.dueDate ? new Date(task.dueDate) : null;
  const overdueDays = dueAt && task.status !== "completed"
    ? Math.floor((Date.now() - dueAt.getTime()) / 86400000)
    : 0;

  return (
    <Drawer
      open
      onClose={closeKeepingDraft}
      title="Edit task"
      subtitle={
        task.isCustomTask
          ? "This mentee's task — nobody else sees the change"
          : "Changes apply to this mentee only — the roadmap step is untouched"
      }
      headerMeta={
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`${chip} ${status.cls}`}>{status.label}</span>
          <span className={`${chip} bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300`}>
            {TYPE_LABEL[initial.type] || initial.type}
          </span>
          <span className={`${chip} bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300`}>{source}</span>
          {rt.difficulty && (
            <span className={`${chip} bg-slate-100 text-slate-600 capitalize dark:bg-slate-800 dark:text-slate-300`}>
              {rt.difficulty}
            </span>
          )}
          {task.hasOverrides && (
            <span className={`${chip} bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300`}>
              Customized
            </span>
          )}
        </div>
      }
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={closeKeepingDraft}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            title="Ctrl+Enter"
            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}Save changes
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {started && (
          <section aria-label="Progress so far" className="rounded-2xl border border-border bg-muted/40 p-4 space-y-3">
            <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <Activity className="w-4 h-4 text-brand-600" aria-hidden />
              How it is going
            </h3>
            <p className="text-xs text-muted-foreground">
              {[
                task.startedAt ? `Started ${niceDay(task.startedAt)}` : "Not opened yet",
                // The same string the deadline control shows, so the two
                // cannot read a day apart.
                initialDue ? `due ${niceDay(initialDue)}` : null,
                submissions.length ? `${submissions.length} submission${submissions.length === 1 ? "" : "s"}` : null,
              ].filter(Boolean).join(" · ")}
              {overdueDays > 0 && (
                <span className="ml-1.5 font-medium text-red-600">
                  · {overdueDays} day{overdueDays === 1 ? "" : "s"} overdue
                </span>
              )}
            </p>

            <TaskProgressTimeline taskId={task.id} />

            {submissions.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowSubmissions((v) => !v)}
                  aria-expanded={showSubmissions}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  {showSubmissions ? "Hide" : "Read"} what they handed in
                  {niceDay(submissions[0]?.submittedAt) ? ` · latest ${niceDay(submissions[0].submittedAt)}` : ""}
                </button>
                {showSubmissions && (
                  <div className="mt-3">
                    <TaskSubmissionHistory taskId={task.id} />
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <div>
          <label htmlFor="edit-task-title" className={label}>Title</label>
          <input
            id="edit-task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={initial.title || "e.g. Build a responsive navbar"}
            className={field}
          />
        </div>

        <div>
          <span className="block text-sm font-medium text-slate-700 mb-1.5">Type</span>
          {canChangeType ? (
            <>
              <div className="flex flex-wrap gap-2">
                {EDITABLE_TYPES.map((t) => (
                  <button key={t} type="button" onClick={() => setType(t)} className={pill(type === t)} aria-pressed={type === t}>
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">Applies to this mentee only.</p>
            </>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground">
              <Lock className="w-3.5 h-3.5" aria-hidden />
              {TYPE_LABEL[initial.type] || initial.type}
              <span className="text-xs">
                {typeLocked
                  ? "— this kind of task carries its own setup"
                  : "— the type is fixed once work has been handed in"}
              </span>
            </div>
          )}
        </div>

        {isInterview && (
          <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="edit-task-interview-duration" className={label}>
                Interview duration
              </label>
              <span className="text-xs text-muted-foreground">Configured limit</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="edit-task-interview-duration"
                type="number"
                min={1}
                max={180}
                disabled={!canSchedule}
                value={interviewMinutes}
                onChange={(e) => {
                  setInterviewMinutesTouched(true);
                  const v = e.target.value;
                  setInterviewMinutes(v === "" ? "" : Math.max(1, parseInt(v, 10) || 1));
                }}
                placeholder="e.g. 30"
                className={field}
              />
              <span className="text-sm text-slate-500 whitespace-nowrap">min total</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Adjust the total time limit allowed for this candidate&apos;s interview session.
            </p>
          </div>
        )}

        <TaskTimingRow
          due={due}
          onDueChange={(next) => { setDue(next); setDueTouched(true); }}
          schedule={schedule}
          onScheduleChange={(next) => { setSchedule(next); setScheduleTouched(true); }}
          repeat={canSchedule && scheduleReady}
          assigning={false}
          dueUnset={!initialDue && !dueTouched}
          minDate=""
        />
        {canSchedule && !scheduleReady && (
          <p className="-mt-3 text-xs text-muted-foreground">
            {scheduleError
              ? "Could not load the repeat setting. Close and reopen this task to retry."
              : "Loading the repeat setting…"}
          </p>
        )}
        {scheduleTouched && schedule.mode !== "now" && (
          <details className="-mt-3 text-xs">
            <summary className="cursor-pointer font-medium text-brand-700">Repeat details</summary>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <label className="font-medium text-slate-700">
                Due after (days)
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={schedule.dueOffsetDays}
                  onChange={(e) => { setSchedule({ ...schedule, dueOffsetDays: Number(e.target.value) }); setScheduleTouched(true); }}
                  className={`${field} mt-1`}
                />
              </label>
              <label className="font-medium text-slate-700">
                Stop repeating on
                <input
                  type="date"
                  min={schedule.startsOn}
                  value={schedule.endsOn}
                  onChange={(e) => { setSchedule({ ...schedule, endsOn: e.target.value }); setScheduleTouched(true); }}
                  className={`${field} mt-1`}
                />
              </label>
            </div>
            <p className="mt-2 text-muted-foreground">
              This task and any occurrence already created stay as they are.
            </p>
          </details>
        )}

        <div>
          <label className={label}>Brief</label>
          <RichTextEditor
            content={description}
            onChange={setDescription}
            placeholder="Describe the task for this mentee…"
            minHeight="120px"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="edit-task-points" className={label}>Task value (XP &amp; Coins)</label>
            <input
              id="edit-task-points"
              type="number"
              min={1}
              max={200}
              value={pointsBase}
              onChange={(e) => {
                const v = Math.round(Number(e.target.value));
                setPointsBase(Number.isFinite(v) ? Math.max(1, Math.min(200, v)) : initial.pointsBase);
              }}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500 tabular-nums"
            />
            <p className="mt-1 text-xs text-slate-400">Most this mentee can earn on approval.</p>
          </div>
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-1">Difficulty</span>
            <p className="px-2.5 py-1.5 text-sm capitalize text-slate-600 dark:text-slate-300">
              {rt.difficulty || "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Set on the {task.isCustomTask ? "task when it was assigned" : "roadmap step"}.
            </p>
          </div>
        </div>

        <details
          open={extrasOpen}
          onToggle={(e) => setExtrasOpen((e.target as HTMLDetailsElement).open)}
          className="rounded-xl border border-border p-4"
        >
          <summary className="cursor-pointer text-sm font-medium">
            Deliverable, checks &amp; resources <span className="text-muted-foreground font-normal">(optional)</span>
          </summary>
          <div className="space-y-4 mt-4">
            <div>
              <label htmlFor="edit-task-deliverable" className={label}>Deliverable</label>
              <input
                id="edit-task-deliverable"
                value={deliverable}
                onChange={(e) => setDeliverable(e.target.value)}
                placeholder="What should they submit?"
                className={field}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-slate-700">Acceptance criteria</span>
                <button
                  type="button"
                  onClick={() => setCriteria((c) => [...c, ""])}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add check
                </button>
              </div>
              <div className="space-y-2">
                {criteria.length === 0 && (
                  <p className="text-xs text-slate-400">No criteria yet. Add checks the mentee must meet.</p>
                )}
                {criteria.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={c}
                      onChange={(e) => setCriteria((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                      placeholder={`Check ${i + 1}`}
                      aria-label={`Acceptance criterion ${i + 1}`}
                      className={field}
                    />
                    <button
                      type="button"
                      onClick={() => setCriteria((prev) => prev.filter((_, j) => j !== i))}
                      aria-label="Remove criterion"
                      className="p-2 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-slate-700">Resources</span>
                <button
                  type="button"
                  onClick={addRes}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add resource
                </button>
              </div>
              <div className="space-y-2">
                {resources.length === 0 && (
                  <p className="text-xs text-slate-400">No resources yet — add helpful links (docs, videos, repos).</p>
                )}
                {resources.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={r.title}
                      onChange={(e) => setRes(i, { title: e.target.value })}
                      placeholder="Label"
                      aria-label={`Resource ${i + 1} label`}
                      className={`${field} flex-1`}
                    />
                    <input
                      value={r.url}
                      onChange={(e) => setRes(i, { url: e.target.value })}
                      placeholder="https://…"
                      aria-label={`Resource ${i + 1} URL`}
                      className={`${field} flex-[2]`}
                    />
                    <button
                      type="button"
                      onClick={() => removeRes(i)}
                      aria-label="Remove resource"
                      className="p-2 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </details>

        <div>
          <label htmlFor="edit-task-note" className={label}>
            Mentor note <span className="text-slate-400 font-normal">(shown to this mentee)</span>
          </label>
          <textarea
            id="edit-task-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. Use this resource instead of the original link."
            className={field}
          />
        </div>
      </div>
    </Drawer>
  );
}
