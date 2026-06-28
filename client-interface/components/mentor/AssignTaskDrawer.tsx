'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { X, Loader2, Check, Plus, Trash2, Search, Route, FileText, Eye } from 'lucide-react';
import { taskApi } from '@/lib/services/task-api';
import { tracksApi, type Track } from '@/lib/services/tracks-api';
import { mentorApi } from '@/lib/services/mentor-api';
import { useMentorRoadmaps } from '@/lib/hooks/mentor';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { RoadmapStepsDrawer } from '@/components/mentor/RoadmapStepsDrawer';
import { StepCustomizeModal } from '@/components/mentor/StepCustomizeModal';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { cleanHtml } from '@/lib/utils/html';
import { pointsForDifficulty } from '@/lib/config/points';

type AssignSource = 'custom' | 'roadmap';

const TYPES = ['assignment', 'project', 'quiz', 'reading', 'video', 'discussion'] as const;
const TYPE_LABEL: Record<string, string> = {
  assignment: 'Assignment', project: 'Project', quiz: 'Quiz', reading: 'Reading', video: 'Video', discussion: 'Discussion',
};
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
const DUE_PRESETS: { label: string; days: number }[] = [
  { label: 'Today', days: 0 }, { label: '+3 days', days: 3 }, { label: '+1 week', days: 7 }, { label: '+2 weeks', days: 14 },
];
// Roadmap assignment deadline is optional — `null` = "Default" (use step timing).
const ROADMAP_DUE_PRESETS: { label: string; days: number | null }[] = [
  { label: 'Default', days: null }, { label: '+3 days', days: 3 }, { label: '+1 week', days: 7 }, { label: '+2 weeks', days: 14 },
];
const presetDateStr = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0]; };

export interface AssignDrawerMentee { id: string; name: string; level?: string; risk?: string }

/**
 * AssignTaskDrawer - accessible right-side drawer to assign a custom task to one
 * mentee (single) or many (bulk). Replaces the old broken /mentor/tasks?tab=create
 * navigation. Full fields + focus trap + Escape + ARIA, re-skinned indigo/slate.
 */
export function AssignTaskDrawer({
  mode,
  mentee,
  cohort = [],
  onClose,
  onAssigned,
}: {
  mode: 'single' | 'bulk';
  mentee?: AssignDrawerMentee;
  cohort?: AssignDrawerMentee[];
  onClose: () => void;
  onAssigned?: () => void;
}) {
  const [source, setSource] = useState<AssignSource>('custom');

  // roadmap mode
  const { local: localRoadmaps, loading: roadmapsLoading } = useMentorRoadmaps();
  const [roadmapId, setRoadmapId] = useState('');
  const selectedRoadmap = localRoadmaps.find((r) => r.id === roadmapId) || null;
  // Mentees who already have the selected roadmap - can't be assigned it again.
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  // Multi-step batch assign: which steps to hand over now + per-mentee status.
  const [selectedSteps, setSelectedSteps] = useState<Set<number>>(new Set());
  const [viewSteps, setViewSteps] = useState(false);
  // Per-step, per-mentee customizations made at assign time, keyed by stepId.
  const [stepOverrides, setStepOverrides] = useState<Record<string, any>>({}); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [customizeStep, setCustomizeStep] = useState<{ step: any; index: number } | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [stepStatus, setStepStatus] = useState<{ index: number; stepId: string; title: string; status: string | null }[]>([]);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const toggleStep = (i: number) => setSelectedSteps((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const ACTIVE_TASK = ['assigned', 'not_started', 'in_progress', 'revision_needed', 'submitted'];

  const [title, setTitle] = useState('');
  const [type, setType] = useState<string>('assignment');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<string>('medium');
  // Points are derived from difficulty (standard) — no manual entry.
  const [dueDays, setDueDays] = useState<number>(7);
  // An exact date (free picker) overrides the preset when set; presets clear it.
  const [dueExact, setDueExact] = useState<string>('');
  const [deliverable, setDeliverable] = useState('');
  const [criteria, setCriteria] = useState<string[]>([]);
  const [resources, setResources] = useState<{ title: string; url: string }[]>([]);
  const [trackId, setTrackId] = useState<string>('');
  const [tracks, setTracks] = useState<Track[]>([]);

  // bulk targeting
  const [selected, setSelected] = useState<Set<string>>(new Set(mentee ? [mentee.id] : []));
  const [search, setSearch] = useState('');

  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const drawerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const titleId = 'assign-task-title';

  // Load this mentee's lanes for the track picker (single mode only).
  useEffect(() => {
    if (mode !== 'single' || !mentee?.id) return;
    let active = true;
    tracksApi.listForMentee(mentee.id).then((res: any) => {
      if (active) setTracks(res?.data?.tracks ?? []);
    }).catch(() => { /* lanes are optional */ });
    return () => { active = false; };
  }, [mode, mentee?.id]);

  // When a roadmap is picked, load who already has it so we can disable them.
  useEffect(() => {
    if (source !== 'roadmap' || !roadmapId) { setAssignedIds(new Set()); return; }
    let active = true;
    setAssigneesLoading(true);
    mentorApi.getRoadmapAssignees(roadmapId)
      .then((res: any) => { if (active) setAssignedIds(new Set<string>(res?.data?.menteeIds ?? res?.menteeIds ?? [])); })
      .catch(() => { if (active) setAssignedIds(new Set()); })
      .finally(() => { if (active) setAssigneesLoading(false); });
    return () => { active = false; };
  }, [source, roadmapId]);

  // Load this mentee's per-step status so the mentor can batch-assign without
  // double-giving steps, and see how many are already active. Single mode only.
  useEffect(() => {
    setSelectedSteps(new Set());
    setStepOverrides({});
    if (source !== 'roadmap' || !roadmapId) { setStepStatus([]); setActiveCount(0); return; }
    let active = true;
    if (mode === 'single' && mentee) {
      setStepsLoading(true);
      mentorApi.getRoadmapMenteeSteps(roadmapId, mentee.id)
        .then((res: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          if (!active) return;
          const steps = res?.data?.steps ?? [];
          setStepStatus(steps);
          setActiveCount(res?.data?.activeCount ?? 0);
          const firstFree = steps.find((s: { status: string | null }) => !s.status);
          setSelectedSteps(firstFree ? new Set([firstFree.index]) : new Set());
        })
        .catch(() => { if (active) { setStepStatus([]); setActiveCount(0); } })
        .finally(() => { if (active) setStepsLoading(false); });
    } else {
      // Bulk: no per-mentee status — default to the first step.
      setStepStatus([]); setActiveCount(0); setSelectedSteps(new Set([0]));
    }
    return () => { active = false; };
  }, [source, roadmapId, mode, mentee?.id]);

  // Focus first field on open.
  useEffect(() => { titleRef.current?.focus(); }, []);

  // Escape to close + focus trap (keep Tab within the drawer).
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const root = drawerRef.current;
    if (!root) return;
    const focusable = root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, [onClose]);

  const toggleMentee = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const filteredCohort = cohort.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));
  const dueISO = () => {
    if (dueExact) return new Date(`${dueExact}T23:59:59`).toISOString();
    const d = new Date(); d.setDate(d.getDate() + dueDays); return d.toISOString();
  };
  const cleanCriteria = criteria.map((c) => c.trim()).filter(Boolean);

  const rawTargetIds = mode === 'bulk' ? [...selected] : (mentee ? [mentee.id] : []);
  // Re-assigning a roadmap a mentee already has is allowed: the server updates
  // their progress (moves them to the chosen start step) idempotently rather than
  // duplicating. We surface it as a note, not a hard block.
  const blockSet = new Set<string>();
  const targetIds = rawTargetIds.filter((id) => !blockSet.has(id));
  const targetCount = targetIds.length;
  const blockedCount = rawTargetIds.length - targetCount;
  // Single-mode roadmap where the one mentee already has this roadmap.
  const canSubmit = targetCount > 0 && (source === 'custom' ? !!title.trim() : (!!roadmapId && selectedSteps.size > 0));

  const submit = async () => {
    if (!canSubmit || saving) return;
    try {
      setSaving(true);

      // ── Assign from a roadmap ────────────────────────────────────────────
      if (source === 'roadmap') {
        const res: any = await mentorApi.assignRoadmap(roadmapId, { menteeIds: targetIds, stepIndexes: [...selectedSteps], dueDate: dueExact || undefined, stepOverrides: Object.keys(stepOverrides).length ? stepOverrides : undefined });
        const assigned = res?.data?.assigned ?? targetIds.length;
        const failed = res?.data?.failed ?? 0;
        // Each ticked step becomes a task — report tasks, not "a roadmap".
        const taskCount = selectedSteps.size;
        const taskLabel = taskCount === 1 ? 'Task' : `${taskCount} tasks`;
        if (assigned === 0) {
          toast.error(res?.data?.results?.find((r: any) => !r.ok)?.error || (taskCount === 1 ? 'Could not assign the task' : 'Could not assign the tasks'));
          setSaving(false);
          return;
        }
        if (failed) toast.error(`${failed} mentee${failed > 1 ? 's' : ''} couldn't be assigned`);
        toast.success(mode === 'bulk' ? `${taskLabel} assigned to ${assigned} mentee${assigned > 1 ? 's' : ''}` : `${taskLabel} assigned to ${mentee?.name || 'the mentee'}`);
        setDone(assigned);
        onAssigned?.();
        return;
      }

      // ── Assign a custom task ─────────────────────────────────────────────
      const cleanResources = resources
        .map((r) => ({ title: r.title.trim(), url: r.url.trim() }))
        .filter((r) => r.url)
        .map((r) => ({ title: r.title || r.url, url: r.url }));
      const base = {
        title: title.trim(),
        description: cleanHtml(description) || title.trim(),
        type,
        difficulty,
        dueDate: dueISO(),
        // Points are standard by difficulty (derived server-side).
        deliverable: deliverable.trim() || undefined,
        acceptanceCriteria: cleanCriteria,
        resources: cleanResources.length ? cleanResources : undefined,
      };
      if (mode === 'bulk') {
        const res: any = await taskApi.bulkCreateCustomTasks({ ...base, menteeIds: [...selected] });
        const assigned = res?.data?.assigned ?? 0;
        const failed = (res?.data?.results || []).filter((r: any) => !r.ok);
        if (assigned === 0) {
          toast.error(failed[0]?.error || 'No tasks were assigned');
          setSaving(false);
          return;
        }
        if (failed.length) toast.error(`${failed.length} mentee${failed.length > 1 ? 's' : ''} couldn't be assigned`);
        toast.success(`Task assigned to ${assigned} mentee${assigned > 1 ? 's' : ''}`);
        setDone(assigned);
      } else {
        await taskApi.createCustomTask({ ...base, menteeId: mentee!.id, trackId: trackId || undefined });
        toast.success(`Task assigned to ${mentee?.name || 'the mentee'}`);
        setDone(1);
      }
      onAssigned?.();
    } catch (error: any) {
      toast.error(extractApiErrorMessage(error, 'Could not assign'));
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
      active ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-black/40 dark:bg-black/70" onClick={onClose} aria-hidden="true" />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg h-full bg-card border-l border-slate-200 dark:border-slate-700 shadow-2xl dark:shadow-[-8px_0_30px_rgba(0,0,0,0.6)] flex flex-col"
      >
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 id={titleId} className="font-semibold text-slate-900">Assign a task</h2>
            <p className="text-sm text-slate-500">
              {mode === 'bulk' ? `${selected.size} mentee${selected.size === 1 ? '' : 's'} selected` : `to ${mentee?.name ?? 'mentee'}`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        {done !== null ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <Check className="w-7 h-7 text-green-600" />
            </div>
            <p className="text-slate-900 font-semibold">Task assigned</p>
            <p className="text-slate-500 text-sm mt-1">
              {mode === 'bulk' ? `${done} mentee${done === 1 ? '' : 's'} notified.` : `${mentee?.name ?? 'Mentee'} has a new task.`}
            </p>
            <button onClick={onClose} className="mt-6 px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm">Done</button>
          </div>
        ) : (
          <>
            {/* Source tabs - custom task vs assign from a roadmap */}
            <div className="px-6 pt-4">
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
                {([['custom', 'Custom task', FileText], ['roadmap', 'From roadmap', Route]] as const).map(([key, label, Icon]) => (
                  <button key={key} type="button" onClick={() => setSource(key)} aria-pressed={source === key}
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${source === key ? 'bg-card text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                    <Icon className="w-4 h-4" />{label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {source === 'custom' && (<>
              <div>
                <label htmlFor="assign-task-title-input" className="block text-sm font-medium text-slate-700 mb-1">Title <span className="text-red-500">*</span></label>
                <input id="assign-task-title-input" ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Build a responsive navbar" className={field} />
              </div>

              <div>
                <span className="block text-sm font-medium text-slate-700 mb-1.5">Type</span>
                <div className="flex flex-wrap gap-2">
                  {TYPES.map((t) => (
                    <button key={t} type="button" onClick={() => setType(t)} className={pill(type === t)} aria-pressed={type === t}>{TYPE_LABEL[t]}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Brief</label>
                <RichTextEditor content={description} onChange={setDescription} placeholder="What should they do? (defaults to the title)" minHeight="120px" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-sm font-medium text-slate-700 mb-1.5">Due</span>
                  <div className="flex flex-wrap gap-1.5">
                    {DUE_PRESETS.map((d) => (
                      <button key={d.label} type="button" onClick={() => { setDueDays(d.days); setDueExact(''); }} className={pill(!dueExact && dueDays === d.days)} aria-pressed={!dueExact && dueDays === d.days}>{d.label}</button>
                    ))}
                  </div>
                  <input type="date" value={dueExact} onChange={(e) => setDueExact(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="mt-1.5 w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <p className="text-[11px] text-slate-400 mt-1">Pick a preset or an exact date.</p>
                </div>
                <div>
                  <span className="block text-sm font-medium text-slate-700 mb-1.5">Difficulty</span>
                  <div className="flex flex-wrap gap-1.5">
                    {DIFFICULTIES.map((d) => (
                      <button key={d} type="button" onClick={() => setDifficulty(d)} className={`${pill(difficulty === d)} capitalize`} aria-pressed={difficulty === d}>{d}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Points</label>
                  <div className="flex items-center h-[38px]">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-sm font-medium tabular-nums">
                      {pointsForDifficulty(difficulty)} pts
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Set by difficulty.</p>
                </div>
                {mode === 'single' && tracks.length > 0 && (
                  <div>
                    <label htmlFor="assign-task-track" className="block text-sm font-medium text-slate-700 mb-1">Track</label>
                    <select id="assign-task-track" value={trackId} onChange={(e) => setTrackId(e.target.value)} className={field}>
                      <option value="">No track</option>
                      {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="assign-task-deliverable" className="block text-sm font-medium text-slate-700 mb-1">Deliverable</label>
                <input id="assign-task-deliverable" value={deliverable} onChange={(e) => setDeliverable(e.target.value)} placeholder="What should they submit?" className={field} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-700">Acceptance criteria</span>
                  <button type="button" onClick={() => setCriteria((c) => [...c, ''])} className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add check</button>
                </div>
                <div className="space-y-2">
                  {criteria.length === 0 && <p className="text-xs text-slate-400">No criteria yet - add checks the mentee must meet.</p>}
                  {criteria.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={c}
                        onChange={(e) => setCriteria((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                        placeholder={`Check ${i + 1}`}
                        aria-label={`Acceptance criterion ${i + 1}`}
                        className={field}
                      />
                      <button type="button" onClick={() => setCriteria((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove criterion" className="p-2 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-700">Resources</span>
                  <button type="button" onClick={() => setResources((r) => [...r, { title: '', url: '' }])} className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add resource</button>
                </div>
                <div className="space-y-2">
                  {resources.length === 0 && <p className="text-xs text-slate-400">No resources yet — add helpful links (docs, videos, repos).</p>}
                  {resources.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={r.title} onChange={(e) => setResources((prev) => prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                        placeholder="Label" aria-label={`Resource ${i + 1} label`} className={`${field} flex-1`} />
                      <input value={r.url} onChange={(e) => setResources((prev) => prev.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                        placeholder="https://…" aria-label={`Resource ${i + 1} URL`} className={`${field} flex-[2]`} />
                      <button type="button" onClick={() => setResources((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove resource" className="p-2 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
              </>)}

              {source === 'roadmap' && (
                <div className="space-y-4">
                  <div>
                    <span className="block text-sm font-medium text-slate-700 mb-1.5">Pick a roadmap</span>
                    {roadmapsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-400 py-2"><Loader2 className="w-4 h-4 animate-spin" />Loading your roadmaps…</div>
                    ) : localRoadmaps.length === 0 ? (
                      <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 p-3">No roadmaps yet - create or import one on the Roadmaps page, then assign it here.</p>
                    ) : (
                      <div className="space-y-2">
                        {localRoadmaps.map((r) => (
                          <button key={r.id} type="button" onClick={() => { setRoadmapId(r.id); setSelectedSteps(new Set()); }}
                            className={`w-full text-left rounded-xl border p-3 transition-colors ${roadmapId === r.id ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 hover:border-slate-300'}`}>
                            <div className="flex items-center gap-2">
                              <Route className="w-4 h-4 text-brand-500 shrink-0" />
                              <span className="text-sm font-medium text-slate-900 truncate">{r.name}</span>
                              <span className="ml-auto text-xs text-slate-400 shrink-0">{r.steps.length} step{r.steps.length === 1 ? '' : 's'}</span>
                            </div>
                            {r.description && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{r.description}</p>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {roadmapId && assigneesLoading && (
                    <p className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" />Checking who already has this roadmap…</p>
                  )}

                  {selectedRoadmap && selectedRoadmap.steps.length > 0 && (() => {
                    // Per-mentee status when single; plain step list when bulk.
                    const rows = stepStatus.length
                      ? stepStatus
                      : selectedRoadmap.steps.map((s, i) => ({ index: i, stepId: s.id, title: s.title, status: null as string | null }));
                    return (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="block text-sm font-medium text-slate-700">Steps to assign <span className="text-red-500">*</span></span>
                          <div className="flex items-center gap-3">
                            {mode === 'single' && activeCount > 0 && (
                              <span className="text-xs text-amber-600">{mentee?.name?.split(' ')[0] ?? 'They'} has {activeCount} active task{activeCount === 1 ? '' : 's'}</span>
                            )}
                            <button type="button" onClick={() => setViewSteps(true)}
                              className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1 shrink-0"><Eye className="w-3.5 h-3.5" />View details</button>
                          </div>
                        </div>
                        <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 dark:divide-slate-700 dark:border-slate-700">
                          {stepsLoading ? (
                            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
                          ) : rows.map((s) => {
                            const isActive = !!s.status && ACTIVE_TASK.includes(s.status);
                            const isDone = s.status === 'completed';
                            const checked = selectedSteps.has(s.index) || isActive;
                            return (
                              <label key={s.stepId || s.index} className={`flex items-center gap-2.5 px-3 py-2 text-sm ${isActive ? 'opacity-60' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
                                <input type="checkbox" disabled={isActive} checked={checked} onChange={() => toggleStep(s.index)}
                                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                                <span className="flex-1 truncate text-slate-700">{s.index + 1}. {s.title}</span>
                                <span className="text-[10px] text-slate-400 shrink-0">{pointsForDifficulty(selectedRoadmap.steps[s.index]?.difficulty)} pts</span>

                                {!!stepOverrides[s.stepId] && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">customized</span>}
                                {isActive && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 shrink-0">assigned</span>}
                                {isDone && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">done</span>}
                                <button type="button" title="View / customize step"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCustomizeStep({ step: selectedRoadmap.steps[s.index], index: s.index }); }}
                                  className="p-1 rounded-md text-slate-400 hover:text-brand-600 hover:bg-slate-100 shrink-0"><Eye className="w-3.5 h-3.5" /></button>
                              </label>
                            );
                          })}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Tick the steps to hand over now — give several at once for the week. Already-assigned steps are locked.</p>
                      </div>
                    );
                  })()}
                  {selectedRoadmap && selectedRoadmap.steps.length > 0 && (
                    <div>
                      <span className="block text-sm font-medium text-slate-700 mb-1.5">Deadline <span className="text-slate-400 font-normal">(optional)</span></span>
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {ROADMAP_DUE_PRESETS.map((p) => {
                          const val = p.days == null ? '' : presetDateStr(p.days);
                          return (
                            <button key={p.label} type="button" onClick={() => setDueExact(val)} className={pill(dueExact === val)} aria-pressed={dueExact === val}>{p.label}</button>
                          );
                        })}
                      </div>
                      <input type="date" value={dueExact} onChange={(e) => setDueExact(e.target.value)}
                        min={new Date().toISOString().split('T')[0]} className={field} />
                      <p className="text-xs text-slate-400 mt-1">&ldquo;Default&rdquo; uses the step&apos;s own timing (+7 days).</p>
                    </div>
                  )}
                </div>
              )}

              {mode === 'bulk' && (
                <div className="border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700">
                      Assign to <span className="text-slate-400 font-normal">({targetCount})</span>
                      {blockedCount > 0 && <span className="ml-1 text-xs text-amber-600">· {blockedCount} already assigned</span>}
                    </span>
                    <div className="flex gap-3 text-xs">
                      <button type="button" onClick={() => setSelected(new Set(cohort.map((m) => m.id)))} className="text-brand-600 hover:text-brand-700">Select all</button>
                      <button type="button" onClick={() => setSelected(new Set())} className="text-slate-500 hover:text-slate-700">Clear</button>
                    </div>
                  </div>
                  <div className="relative mb-2">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search mentees…" aria-label="Search mentees" className={`${field} pl-9`} />
                  </div>
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                    {filteredCohort.length === 0 && <p className="text-xs text-slate-400 px-3 py-3">No mentees match.</p>}
                    {filteredCohort.map((m) => {
                      const blocked = blockSet.has(m.id);
                      return (
                        <label key={m.id} className={`flex items-center gap-3 px-3 py-2 ${blocked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'}`}>
                          <input type="checkbox" disabled={blocked} checked={!blocked && selected.has(m.id)} onChange={() => toggleMentee(m.id)} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:cursor-not-allowed" />
                          <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{m.name}</span>
                          {blocked
                            ? <span className="text-[11px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md shrink-0">Assigned</span>
                            : m.level && <span className="text-xs text-slate-400">{m.level}</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={submit} disabled={!canSubmit || saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {source === 'roadmap'
                  ? (mode === 'bulk' ? `Assign to ${targetCount}` : (selectedSteps.size > 1 ? `Assign ${selectedSteps.size} tasks` : 'Assign task'))
                  : (mode === 'bulk' ? `Assign to ${selected.size}` : 'Assign task')}
              </button>
            </div>
          </>
        )}
      </div>
      {viewSteps && selectedRoadmap && <RoadmapStepsDrawer roadmap={selectedRoadmap} onClose={() => setViewSteps(false)} />}
      {customizeStep && (
        <StepCustomizeModal
          step={customizeStep.step}
          index={customizeStep.index}
          editable
          menteeLabel={mode === 'single' ? (mentee?.name?.split(' ')[0]) : 'the selected mentees'}
          initialOverride={stepOverrides[customizeStep.step.id] || null}
          onClose={() => setCustomizeStep(null)}
          onSave={(ov) => setStepOverrides((prev) => {
            const next = { ...prev };
            if (ov) next[customizeStep.step.id] = ov; else delete next[customizeStep.step.id];
            return next;
          })}
        />
      )}
    </div>
  );
}
