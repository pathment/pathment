"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { TaskScheduleFields, initialTaskSchedule, type TaskScheduleDraft } from "./TaskScheduleFields";
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
 * Mentor edits ONE mentee's assigned task. Pre-fills the effective content
 * (override-or-roadmap) and only sends fields the mentor actually changed — so
 * untouched fields keep tracking the roadmap step; touched ones become a
 * per-mentee override. Clearing a field resets it to the roadmap default.
 */
export function TaskEditDrawer({
  task,
  onClose,
  onSaved,
}: {
  task: any;
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
    criteria: (rt.acceptanceCriteria || []).join("\n"),
    note: task.mentorNote || "",
    pointsBase: initialPoints,
  };
  const [type, setType] = useState(initial.type);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [deliverable, setDeliverable] = useState(initial.deliverable);
  const [criteria, setCriteria] = useState(initial.criteria);
  const [note, setNote] = useState(initial.note);
  const [pointsBase, setPointsBase] = useState(initial.pointsBase);
  const [resources, setResources] = useState<ResourceItem[]>(
    (rt.resources || []).map((r: any) => ({
      title: r.title || "",
      url: r.url || "",
      resourceType: r.resourceType || "reading",
    })),
  );
  const [resourcesTouched, setResourcesTouched] = useState(false);
  const [schedule, setSchedule] = useState<TaskScheduleDraft>({ ...initialTaskSchedule(), ...task.schedule, endsOn: task.schedule?.endsOn || '' });
  const [scheduleTouched, setScheduleTouched] = useState(false);
  const [scheduleReady, setScheduleReady] = useState(false);
  const [scheduleError, setScheduleError] = useState(false);
  useEffect(() => {
    let active = true;
    taskApi.getTaskById(task.id).then(response => {
      if (!active) return;
      const saved = response.data.task.schedule;
      setSchedule({ ...initialTaskSchedule(), ...saved, endsOn: saved?.endsOn || '' });
      setScheduleReady(true);
    }).catch(() => { if (active) setScheduleError(true); });
    return () => { active = false; };
  }, [task.id]);
  const initialDue = task.dueDate ? String(task.dueDate).slice(0, 10) : '';
  const [dueDate, setDueDate] = useState(initialDue);
  const [saving, setSaving] = useState(false);
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const draftKey = `pathment:edit-task:${task.id}`;

  type EditDraft = {
    type?: string;
    title: string;
    description: string;
    deliverable: string;
    criteria: string;
    note: string;
    resources: ResourceItem[];
    resourcesTouched: boolean;
  };

  const { flush: flushDraft } = useFormDraft<EditDraft>(
    draftKey,
    {
      type,
      title,
      description,
      deliverable,
      criteria,
      note,
      resources,
      resourcesTouched,
    },
    (d) => {
      if (!d || typeof d !== "object") return;
      if (typeof d.type === "string") setType(d.type);
      if (typeof d.title === "string") setTitle(d.title);
      if (typeof d.description === "string") setDescription(d.description);
      if (typeof d.deliverable === "string") setDeliverable(d.deliverable);
      if (typeof d.criteria === "string") setCriteria(d.criteria);
      if (typeof d.note === "string") setNote(d.note);
      if (Array.isArray(d.resources)) setResources(d.resources);
      if (typeof d.resourcesTouched === "boolean")
        setResourcesTouched(d.resourcesTouched);
    },
  );

  const closeKeepingDraft = () => {
    flushDraft();
    onClose();
  };

  const setRes = (i: number, patch: Partial<ResourceItem>) => {
    setResourcesTouched(true);
    setResources((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    );
  };
  const addRes = () => {
    setResourcesTouched(true);
    setResources((p) => [
      ...p,
      { title: "", url: "", resourceType: "reading" },
    ]);
  };
  const removeRes = (i: number) => {
    setResourcesTouched(true);
    setResources((p) => p.filter((_, idx) => idx !== i));
  };

  const save = async () => {
    const payload: Record<string, unknown> = {};
    if (saving) return;
    if (scheduleTouched) payload.schedule = schedule;
    if (dueDate !== initialDue && dueDate) payload.dueDate = dueDate;
    if (type !== initial.type) payload.typeOverride = type;
    if (title !== initial.title) payload.titleOverride = title.trim() || null;
    if (cleanHtml(description) !== cleanHtml(initial.description))
      payload.descriptionOverride = cleanHtml(description) || null;
    if (deliverable !== initial.deliverable)
      payload.deliverableOverride = deliverable.trim() || null;
    if (criteria !== initial.criteria) {
      const arr = criteria
        .split("\n")
        .map((s: string) => s.trim())
        .filter(Boolean);
      payload.acceptanceCriteriaOverride = arr.length ? arr : null;
    }
    if (note !== initial.note) payload.mentorNote = note.trim() || null;
    if (pointsBase !== initial.pointsBase) {
      payload.pointsBase = Math.max(1, Math.min(200, Math.round(Number(pointsBase) || initial.pointsBase)));
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

  return (
    <Drawer
      open
      onClose={closeKeepingDraft}
      title="Edit task for this mentee"
      subtitle="Changes apply to this mentee only — the roadmap step is untouched"
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
      <div className="space-y-4">
        <div>
          <label htmlFor="edit-task-due" className={label}>Due date for this task</label>
          <input id="edit-task-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={field} />
        </div>
        {['assigned', 'not_started', 'in_progress'].includes(task.status) && <details className="rounded-xl border border-border p-4" open={scheduleTouched || undefined}>
          <summary className="cursor-pointer text-sm font-medium">Schedule future assignments{task.schedule ? ' · configured' : ' · optional'}</summary>
          <p className="my-3 text-xs text-muted-foreground">This task and already-created occurrences stay unchanged. Timing changes apply to future assignments for this mentee. No future assignments stops future repetition; use the due date above for this task.</p>
          {scheduleReady ? <TaskScheduleFields editing value={schedule} onChange={next => { setSchedule(next); setScheduleTouched(true); }} /> : <p className="text-sm text-muted-foreground">{scheduleError ? 'Could not load scheduling. Close and reopen this task to retry.' : 'Loading schedule…'}</p>}
        </details>}
        <div>
          <label htmlFor="assigned-task-type" className={label}>
            Task type
          </label>
          <select
            id="assigned-task-type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            className={field}
            disabled={
              !["assigned", "not_started", "in_progress"].includes(
                task.status,
              ) || ["quiz", "interview", "open_source"].includes(initial.type)
            }
          >
            {Array.from(
              new Set([
                initial.type,
                "assignment",
                "project",
                "practical",
                "exercise",
                "reading",
                "video",
                "discussion",
                "assessment",
                "custom",
              ]),
            ).map((value) => (
              <option key={value} value={value}>
                {value
                  .replace("_", " ")
                  .replace(/^./, (letter: string) => letter.toUpperCase())}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Applies to this mentee only. Quizzes, interviews and open-source
            tasks use their own assignment setup.
          </p>
        </div>
        <div>
          <label className={label}>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className={label}>Description</label>
          <RichTextEditor
            content={description}
            onChange={setDescription}
            placeholder="Describe the task for this mentee…"
            minHeight="140px"
          />
        </div>
        <div>
          <label className={label}>Deliverable</label>
          <textarea
            value={deliverable}
            onChange={(e) => setDeliverable(e.target.value)}
            rows={2}
            className={field}
          />
        </div>
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
            className={field}
          />
          <p className="mt-1 text-xs text-slate-400">
            Max awarded on approval for this mentee. Defaults from difficulty
            {rt.difficulty ? ` (${rt.difficulty})` : ""}.
          </p>
        </div>
        <div>
          <label className={label}>
            Acceptance criteria{" "}
            <span className="text-slate-400 font-normal">(one per line)</span>
          </label>
          <textarea
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            rows={3}
            className={field}
          />
        </div>
        <div>
          <label className={label}>Resources</label>
          <div className="space-y-2">
            {resources.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={r.title}
                  onChange={(e) => setRes(i, { title: e.target.value })}
                  placeholder="Label"
                  className={`${field} flex-1`}
                />
                <input
                  value={r.url}
                  onChange={(e) => setRes(i, { url: e.target.value })}
                  placeholder="https://…"
                  className={`${field} flex-[2]`}
                />
                <button
                  onClick={() => removeRes(i)}
                  className="p-2 rounded-md hover:bg-slate-100 text-slate-400 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              onClick={addRes}
              className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
            >
              <Plus className="w-4 h-4" />
              Add resource
            </button>
          </div>
        </div>
        <div>
          <label className={label}>
            Mentor note{" "}
            <span className="text-slate-400 font-normal">
              (shown to this mentee)
            </span>
          </label>
          <textarea
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
