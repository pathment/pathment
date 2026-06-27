'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarClock, Plus, Trash2, Loader2, Check, X, Clock, User, LayoutGrid, Users, Route, Repeat, Download, Search, Pencil, FileJson, Copy, CalendarRange,
} from 'lucide-react';
import { useMentorSchedule, useScheduleTemplates, useMentorCohort, useMentorRoadmaps, type ScheduleTemplate } from '@/lib/hooks/mentor';
import { meetingsApi, type AvailabilityRule } from '@/lib/services/meetings-api';
import { scheduleApi, type ScheduleSlot } from '@/lib/services/schedule-api';
import { mentorApi } from '@/lib/services/mentor-api';
import { Drawer } from '@/components/shared/Drawer';
import { ScheduleJsonPanel } from '@/components/shared/ScheduleJsonPanel';
import { downloadScheduleTemplateJson } from '@/lib/utils/schedule-json';
import { getBrowserTimeZone, formatMeeting } from '@/lib/utils/datetime';
import { useConfirm } from '@/lib/context/ConfirmContext';

const DURATIONS = [15, 30, 45, 60];
const SLOT_DAYS = ['everyday', 'weekdays', 'weekends'];
const TASK_TYPES = ['reading', 'discussion', 'video', 'quiz', 'assignment', 'project'];
const RECURRENCES = ['daily', 'weekly', 'once'];
const field = 'border border-slate-300 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500';

// ───────────────────────── Templates tab ─────────────────────────
interface DraftBlock { label: string; time: string; days: string; bookable: boolean }

// A sensible starting day-shape so "New schedule" is never blank (the mentor
// tweaks/removes from here instead of building from scratch).
const DEFAULT_BLOCKS: DraftBlock[] = [
  { label: 'Morning check-in', time: '09:00', days: 'weekdays', bookable: false },
  { label: 'Core work', time: '10:00', days: 'weekdays', bookable: false },
  { label: 'Mentor office hours', time: '16:00', days: 'weekdays', bookable: true },
  { label: 'Evening reflection', time: '18:00', days: 'weekdays', bookable: false },
  { label: 'Weekend catch-up', time: '11:00', days: 'weekends', bookable: false },
];

function TemplatesTab() {
  const { local, org, loading, refetch } = useScheduleTemplates();
  const { cohort } = useMentorCohort();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<ScheduleTemplate | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<ScheduleTemplate | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={() => setEditing('new')} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"><Plus className="w-4 h-4" />New schedule</button>
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div> : (
        <>
          <section>
            <h3 className="text-slate-900 font-medium mb-3">My schedules</h3>
            {local.length === 0 ? <p className="text-sm text-slate-500">No schedules yet - create one to assign to your mentees.</p> : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {local.map((t) => (
                  <div key={t.id} className="bg-card rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-slate-900">{t.name}</h4>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setEditing(t)} aria-label="Edit schedule" className="p-1.5 text-slate-400 hover:text-brand-600"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => downloadScheduleTemplateJson(t)} aria-label="Export as JSON" title="Export as JSON" className="p-1.5 text-slate-400 hover:text-brand-600"><FileJson className="w-4 h-4" /></button>
                        <button onClick={async () => { if (!(await confirm({ title: `Delete "${t.name}"?`, description: 'This schedule template will be permanently removed.', variant: 'danger', confirmLabel: 'Delete' }))) return; setBusy(t.id); try { await scheduleApi.deleteTemplate(t.id); refetch(); } finally { setBusy(null); } }} aria-label="Delete schedule" className="p-1.5 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{t.blocks.length} block{t.blocks.length === 1 ? '' : 's'}</p>
                    <ol className="mt-2 space-y-0.5">{t.blocks.slice(0, 5).map((b) => <li key={b.id} className="text-xs text-slate-500 truncate">{b.time || 'Flexible'} · {b.label}</li>)}</ol>
                    <button onClick={() => setAssignFor(t)} className="mt-3 w-full px-3 py-1.5 rounded-lg bg-brand-50 dark:bg-brand-500/15 text-brand-700 text-sm font-medium hover:bg-brand-100 inline-flex items-center justify-center gap-1.5"><Users className="w-4 h-4" />Assign</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {org.length > 0 && (
            <section>
              <h3 className="text-slate-900 font-medium mb-3">From your organization</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {org.map((t) => (
                  <div key={t.id} className="bg-card rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-slate-900">{t.name}</h4>
                      <button onClick={() => downloadScheduleTemplateJson(t)} aria-label="Export as JSON" title="Export as JSON" className="p-1 text-slate-400 hover:text-brand-600 shrink-0"><FileJson className="w-4 h-4" /></button>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{t.blocks.length} blocks</p>
                    <button onClick={async () => { setBusy(t.id); try { await scheduleApi.importTemplate(t.id); toast.success('Imported - now an editable copy under My schedules'); refetch(); } catch { toast.error('Failed'); } finally { setBusy(null); } }} disabled={busy === t.id}
                      className="mt-3 w-full px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:border-brand-300 inline-flex items-center justify-center gap-1.5">{busy === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Import &amp; edit</button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {assignFor && <AssignModal template={assignFor} cohort={cohort} onClose={() => setAssignFor(null)} />}
      {editing && <ScheduleDrawer template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refetch(); }} />}
    </div>
  );
}

/** Create OR edit a schedule template (rich time-block editor in a side drawer). */
function ScheduleDrawer({ template, onClose, onSaved }: { template: ScheduleTemplate | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(template?.name || '');
  const [desc, setDesc] = useState(template?.description || '');
  const [blocks, setBlocks] = useState<DraftBlock[]>(
    template?.blocks?.length
      ? template.blocks.map((b) => ({ label: b.label, time: b.time, days: b.days, bookable: !!b.bookable }))
      : DEFAULT_BLOCKS.map((b) => ({ ...b })) // new schedule starts from a ready day-shape
  );
  const [saving, setSaving] = useState(false);

  const setBlock = (i: number, p: Partial<DraftBlock>) => setBlocks((prev) => prev.map((b, idx) => idx === i ? { ...b, ...p } : b));
  const addBlock = () => setBlocks((prev) => [...prev, { label: '', time: '', days: 'weekdays', bookable: false }]);
  const removeBlock = (i: number) => setBlocks((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    const clean = blocks.map((b) => ({ ...b, label: b.label.trim() })).filter((b) => b.label);
    if (!name.trim()) { toast.error('Schedule name is required'); return; }
    if (clean.length === 0) { toast.error('Add at least one time block'); return; }
    try {
      setSaving(true);
      const payload = { name: name.trim(), description: desc.trim() || undefined, blocks: clean };
      if (template) await scheduleApi.updateTemplate(template.id, payload);
      else await scheduleApi.createTemplate(payload);
      toast.success(template ? 'Schedule updated' : 'Schedule created');
      onSaved();
    } catch { toast.error('Could not save the schedule'); } finally { setSaving(false); }
  };

  return (
    <Drawer open onClose={onClose} width="lg"
      title={template ? 'Edit schedule' : 'New schedule'}
      subtitle="Define the day's time blocks. Structure only - you fill each slot per mentee after assigning."
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{template ? 'Save changes' : 'Create schedule'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Schedule name <span className="text-red-500">*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bootcamp Day, Interview Prep" className={`${field} w-full`} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Description <span className="text-slate-400 font-normal">(optional)</span></label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="What this day-shape is for." className={`${field} w-full resize-none`} />
        </div>
        <ScheduleJsonPanel
          current={{ name, description: desc, blocks }}
          onLoad={(p) => { if (p.name != null) setName(p.name); if (p.description != null) setDesc(p.description); setBlocks(p.blocks); }}
        />
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-700">Time blocks <span className="text-red-500">*</span></label>
            <button type="button" onClick={addBlock} className="text-brand-600 hover:text-brand-700 text-sm inline-flex items-center gap-1"><Plus className="w-4 h-4" />Add block</button>
          </div>
          <div className="space-y-2">
            {blocks.map((b, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-slate-200">
                <input value={b.label} onChange={(e) => setBlock(i, { label: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addBlock(); } }}
                  autoFocus={i === blocks.length - 1 && blocks.length > 1}
                  placeholder="Label (e.g. Core work)" className={`${field} flex-1 min-w-36`} />
                <input value={b.time} onChange={(e) => setBlock(i, { time: e.target.value })} placeholder="Time / Flexible" className={`${field} w-32`} />
                <select value={b.days} onChange={(e) => setBlock(i, { days: e.target.value })} className={`${field} capitalize`}>{SLOT_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
                <label className="text-xs text-slate-500 inline-flex items-center gap-1" title="Mentees can book a 1:1 in this block"><input type="checkbox" checked={b.bookable} onChange={(e) => setBlock(i, { bookable: e.target.checked })} className="rounded border-slate-300 text-brand-600" />bookable</label>
                {blocks.length > 1 && <button onClick={() => removeBlock(i)} aria-label="Remove block" className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
              </div>
            ))}
            <button type="button" onClick={addBlock} className="w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-700 py-2 text-xs font-medium text-slate-500 hover:border-brand-300 hover:text-brand-700 inline-flex items-center justify-center gap-1"><Plus className="w-3.5 h-3.5" /> Add block</button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

function AssignModal({ template, cohort, onClose }: { template: ScheduleTemplate; cohort: any[]; onClose: () => void }) {
  // Default: assign to EVERYONE (one click). Uncheck / search to narrow.
  const [sel, setSel] = useState<Set<string>>(() => new Set(cohort.map((m: any) => m.id)));
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const filtered = cohort.filter((m: any) => m.name.toLowerCase().includes(q.trim().toLowerCase()));
  const allSelected = cohort.length > 0 && sel.size === cohort.length;
  const assign = async () => {
    if (!sel.size) { toast.error('Pick at least one mentee'); return; }
    try { setSaving(true); await scheduleApi.assign(template.id, [...sel]); toast.success(`Assigned to ${sel.size} mentee${sel.size === 1 ? '' : 's'}`); onClose(); }
    catch { toast.error('Could not assign'); } finally { setSaving(false); }
  };
  return (
    <Drawer
      open
      onClose={onClose}
      title={`Assign "${template.name}"`}
      subtitle="Everyone is selected by default - search or uncheck to pick specific mentees. Then fill the slots (and use Apply to all)."
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={assign} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Assign{sel.size ? ` (${sel.size})` : ''}</button>
        </>
      }
    >
      {cohort.length === 0 ? <p className="text-sm text-slate-500">No mentees.</p> : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mentees…" className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <button onClick={() => setSel(allSelected ? new Set() : new Set(cohort.map((m: any) => m.id)))} className="text-xs font-medium text-brand-600 hover:text-brand-700 shrink-0">{allSelected ? 'Clear' : 'Select all'}</button>
          </div>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {filtered.map((m: any) => (
              <label key={m.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"><input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} className="rounded border-slate-300 text-brand-600" /><span className="text-sm text-slate-700">{m.name}</span></label>
            ))}
          </div>
        </div>
      )}
    </Drawer>
  );
}

// ───────────────────────── Roadmap slot editor (progress-aware) ─────────────────────────
const STEP_DONE = ['completed'];
const STEP_ACTIVE = ['assigned', 'not_started', 'in_progress', 'revision_needed', 'submitted'];

/**
 * The roadmap part of a slot. Crucially, it loads THIS mentee's real progress on
 * the chain's first roadmap, so the mentor isn't picking a start step blind:
 *  - if the roadmap is already started for them, we say so (and that saving won't
 *    re-assign or reset it) instead of silently no-op'ing — the old confusion;
 *  - otherwise the step picker marks already-done steps and defaults to the first
 *    step they haven't done yet.
 */
function RoadmapSlotEditor({ slot, menteeId, roadmaps, onPatch, refreshTick }: {
  slot: ScheduleSlot; menteeId: string; roadmaps: any[]; onPatch: (p: Partial<ScheduleSlot>) => void; refreshTick: number; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const head = roadmaps.find((r) => r.id === (slot.roadmapChain || [])[0]);
  const steps: { id: string; title: string }[] = head?.steps || [];
  const headId: string | undefined = head?.id;
  const [stepStatus, setStepStatus] = useState<{ index: number; status: string | null }[]>([]);
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    if (!headId || !menteeId) { setStepStatus([]); return; }
    let active = true;
    setStatusLoading(true);
    mentorApi.getRoadmapMenteeSteps(headId, menteeId)
      .then((r: any) => { if (active) setStepStatus((r?.data?.steps ?? []).map((s: any) => ({ index: s.index, status: s.status }))); }) // eslint-disable-line @typescript-eslint/no-explicit-any
      .catch(() => { if (active) setStepStatus([]); })
      .finally(() => { if (active) setStatusLoading(false); });
    return () => { active = false; };
  }, [headId, menteeId, refreshTick]);

  const statusByIndex = new Map(stepStatus.map((s) => [s.index, s.status]));
  const isDone = (i: number) => STEP_DONE.includes(statusByIndex.get(i) || '');
  const assignedCount = stepStatus.filter((s) => s.status).length;
  const doneCount = stepStatus.filter((s) => STEP_DONE.includes(s.status || '')).length;
  const activeCount = stepStatus.filter((s) => STEP_ACTIVE.includes(s.status || '')).length;
  const started = assignedCount > 0;
  let firstUndone = 0;
  for (let i = 0; i < steps.length; i++) { if (!isDone(i)) { firstUndone = i; break; } }
  const nextTitle = steps[firstUndone]?.title;

  // Once progress loads, never leave the start step pointing at a finished step.
  useEffect(() => {
    if (!steps.length || !stepStatus.length) return;
    if (isDone(slot.startStep ?? 0)) onPatch({ startStep: firstUndone });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepStatus]);

  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
      <div className="flex items-center gap-2"><Route className="w-4 h-4 text-brand-500" /><span className="text-xs font-medium text-slate-600">Roadmap chain (in order)</span></div>
      <div className="flex flex-wrap gap-1.5">
        {(slot.roadmapChain || []).map((rid, i) => {
          const rm = roadmaps.find((r) => r.id === rid);
          return <span key={rid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 text-xs">{i + 1}. {rm?.name || 'Roadmap'}<button onClick={() => onPatch({ roadmapChain: slot.roadmapChain.filter((x) => x !== rid) })}><X className="w-3 h-3" /></button></span>;
        })}
      </div>
      <select value="" onChange={(e) => { if (e.target.value) onPatch({ roadmapChain: [...(slot.roadmapChain || []), e.target.value] }); }} className={`${field} w-full`}>
        <option value="">+ Add roadmap to chain</option>
        {roadmaps.filter((r) => !(slot.roadmapChain || []).includes(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>

      {/* Progress-aware: where to start the FIRST roadmap, given what they've done. */}
      {!headId ? null : statusLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" />Checking this mentee&apos;s progress…</div>
      ) : started ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          <p className="font-medium">Already started for this mentee</p>
          <p className="mt-0.5">
            {doneCount}/{steps.length} steps done{activeCount > 0 ? `, ${activeCount} in progress` : ''}
            {doneCount < steps.length && nextTitle ? ` · next: ${nextTitle}` : ''}.
            Saving this slot won&apos;t re-assign or reset it — manage progress from the mentee&apos;s roadmap.
          </p>
        </div>
      ) : steps.length > 1 ? (
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Start &ldquo;{head?.name}&rdquo; at step</label>
          <select value={String(slot.startStep ?? firstUndone)} onChange={(e) => onPatch({ startStep: Number(e.target.value) })} className={`${field} w-full`}>
            {steps.map((st, i) => <option key={st.id || i} value={i} disabled={isDone(i)}>{isDone(i) ? '✓ ' : ''}{i + 1}. {st.title}{isDone(i) ? ' (done)' : ''}</option>)}
          </select>
          <p className="text-xs text-slate-400 mt-1">Skip steps they already know — applies to the first roadmap in the chain. Saving starts it for this mentee.</p>
        </div>
      ) : (
        <p className="text-xs text-slate-400">Saving starts this roadmap for the mentee.</p>
      )}
    </div>
  );
}

// ───────────────────────── Fill schedules tab ─────────────────────────
function FillTab() {
  const { cohort } = useMentorCohort();
  const { local } = useMentorRoadmaps();
  const [menteeId, setMenteeId] = useState('');
  const [q, setQ] = useState('');
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Bumped after a slot save so each roadmap editor re-checks the mentee's
  // progress (e.g. shows "already started" once a save kicks the roadmap off).
  const [refreshTick, setRefreshTick] = useState(0);

  const selectedMentee = cohort.find((m: any) => m.id === menteeId);
  const filteredCohort = cohort.filter((m: any) => m.name.toLowerCase().includes(q.trim().toLowerCase()));

  // Push one slot's config to every mentee who has that slot (the 40-student shortcut).
  const applyAll = async (slot: ScheduleSlot) => {
    try {
      setBusy(slot.id + ':all');
      const r: any = await scheduleApi.applySlotToAll(slot.id, { kind: slot.kind, roadmapChain: slot.roadmapChain, startStep: slot.startStep, recurring: slot.recurring });
      toast.success(`Applied "${slot.label}" to ${r?.data?.applied ?? 0} mentee${(r?.data?.applied ?? 0) === 1 ? '' : 's'}`);
    } catch { toast.error('Could not apply to all'); } finally { setBusy(null); }
  };

  const load = async (id: string) => {
    if (!id) { setSlots([]); return; }
    setLoading(true);
    try { const r = await scheduleApi.getMenteeSchedule(id); setSlots(r?.data?.schedule?.schedule ?? []); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(menteeId); }, [menteeId]);

  const patchSlot = (slotId: string, p: Partial<ScheduleSlot>) => setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, ...p } : s));

  const save = async (slot: ScheduleSlot) => {
    try {
      setBusy(slot.id);
      const res: any = await scheduleApi.updateSlot(menteeId, slot.id, { kind: slot.kind, roadmapChain: slot.roadmapChain, startStep: slot.startStep, recurring: slot.recurring });
      const startedId = res?.data?.slot?.chainStarted;
      if (startedId) {
        const rm = local.find((r) => r.id === startedId);
        toast.success(`Slot saved - started "${rm?.name || 'roadmap'}" for this mentee`);
      } else {
        toast.success('Slot saved');
      }
      setRefreshTick((t) => t + 1); // re-check progress so the editor reflects the new state
    } catch { toast.error('Could not save'); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      {/* Searchable mentee picker (works for a 40-mentee cohort). */}
      {!menteeId ? (
        <div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Search a mentee to fill…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
            {filteredCohort.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">{cohort.length === 0 ? 'No mentees.' : 'No matches.'}</p>
            ) : filteredCohort.map((m: any) => (
              <button key={m.id} onClick={() => { setMenteeId(m.id); setQ(''); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm text-slate-800">{m.name}</button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">Tip: configure one mentee, then use <span className="font-medium">Apply to all</span> on a slot to push it to everyone - then tweak individuals.</p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-sm text-slate-700">Filling <span className="font-semibold">{selectedMentee?.name || 'mentee'}</span></span>
          <button onClick={() => setMenteeId('')} className="text-xs font-medium text-brand-600 hover:text-brand-700">Change mentee</button>
        </div>
      )}

      {!menteeId ? null
        : loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
        : slots.length === 0 ? <p className="text-sm text-slate-500">No schedule assigned yet - assign a template first.</p>
        : (
          <div className="space-y-3">
            {slots.map((s) => (
              <div key={s.id} className="bg-card rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div><p className="font-medium text-slate-900">{s.label}</p><p className="text-xs text-slate-500">{s.time} · {s.days}</p></div>
                  <select value={s.kind} onChange={(e) => patchSlot(s.id, { kind: e.target.value as any })} className={field}>
                    <option value="empty">Empty</option><option value="roadmap">Roadmap chain</option><option value="recurring">Recurring</option>
                  </select>
                </div>

                {s.kind === 'roadmap' && (
                  <RoadmapSlotEditor slot={s} menteeId={menteeId} roadmaps={local} onPatch={(p) => patchSlot(s.id, p)} refreshTick={refreshTick} />
                )}

                {s.kind === 'recurring' && (
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
                    <div className="flex items-center gap-2"><Repeat className="w-4 h-4 text-brand-500" /><span className="text-xs font-medium text-slate-600">Recurring ritual</span></div>
                    <input value={s.recurring?.title || ''} onChange={(e) => patchSlot(s.id, { recurring: { title: e.target.value, type: s.recurring?.type || 'discussion', recurrence: s.recurring?.recurrence || 'daily' } })} placeholder="Title (e.g. Mindset talk)" className={`${field} w-full`} />
                    <div className="flex gap-2">
                      <select value={s.recurring?.type || 'discussion'} onChange={(e) => patchSlot(s.id, { recurring: { title: s.recurring?.title || '', type: e.target.value, recurrence: s.recurring?.recurrence || 'daily' } })} className={`${field} capitalize`}>{TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                      <select value={s.recurring?.recurrence || 'daily'} onChange={(e) => patchSlot(s.id, { recurring: { title: s.recurring?.title || '', type: s.recurring?.type || 'discussion', recurrence: e.target.value } })} className={`${field} capitalize`}>{RECURRENCES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-3">
                  <button onClick={() => applyAll(s)} disabled={busy === s.id + ':all'} title="Push this slot's setup to every mentee"
                    className="px-3 py-1.5 rounded-lg border border-brand-200 bg-brand-50 dark:bg-brand-500/15 text-brand-700 text-sm font-medium hover:bg-brand-100 inline-flex items-center gap-1.5 disabled:opacity-50">
                    {busy === s.id + ':all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}Apply to all
                  </button>
                  <button onClick={() => save(s)} disabled={busy === s.id} className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm inline-flex items-center gap-1.5 disabled:opacity-50">{busy === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Save slot</button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// ───────────────────────── Weekly recurring availability ─────────────────────────
// Monday-first display order, mapped to JS weekday numbers (0=Sun … 6=Sat).
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABEL: Record<number, string> = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };
type TimeRange = { start: string; end: string };
type DayHours = { enabled: boolean; ranges: TimeRange[] };
const DEFAULT_RANGE = (): TimeRange => ({ start: '18:00', end: '21:00' });
const emptyWeek = (): Record<number, DayHours> => {
  const w: Record<number, DayHours> = {};
  DAY_ORDER.forEach((d) => { w[d] = { enabled: false, ranges: [DEFAULT_RANGE()] }; });
  return w;
};

function RecurringHoursEditor({ onSaved }: { onSaved: () => void }) {
  const [week, setWeek] = useState<Record<number, DayHours>>(emptyWeek);
  const [slotMins, setSlotMins] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    meetingsApi.getRules().then((r: any) => {
      const rules: AvailabilityRule[] = r?.data?.rules ?? [];
      const w = emptyWeek();
      DAY_ORDER.forEach((d) => { w[d] = { enabled: false, ranges: [] }; });
      rules.forEach((rule) => {
        if (!w[rule.weekday]) w[rule.weekday] = { enabled: false, ranges: [] };
        w[rule.weekday].enabled = true;
        w[rule.weekday].ranges.push({ start: rule.startTime, end: rule.endTime });
      });
      DAY_ORDER.forEach((d) => { if (w[d].ranges.length === 0) w[d].ranges = [DEFAULT_RANGE()]; });
      setWeek(w);
      if (rules.length) setSlotMins(rules[0].slotMins || 30);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggle = (d: number) => setWeek((w) => ({ ...w, [d]: { ...w[d], enabled: !w[d].enabled } }));
  const setRange = (d: number, i: number, key: keyof TimeRange, val: string) =>
    setWeek((w) => ({ ...w, [d]: { ...w[d], ranges: w[d].ranges.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)) } }));
  const addRange = (d: number) => setWeek((w) => ({ ...w, [d]: { ...w[d], ranges: [...w[d].ranges, DEFAULT_RANGE()] } }));
  const removeRange = (d: number, i: number) =>
    setWeek((w) => { const ranges = w[d].ranges.filter((_, idx) => idx !== i); return { ...w, [d]: { ...w[d], ranges: ranges.length ? ranges : [DEFAULT_RANGE()] } }; });
  const applyToAll = (d: number) =>
    setWeek((w) => { const src = w[d].ranges; const next = { ...w }; DAY_ORDER.forEach((k) => { next[k] = { enabled: true, ranges: src.map((r) => ({ ...r })) }; }); return next; });

  const save = async () => {
    const rules: AvailabilityRule[] = [];
    for (const d of DAY_ORDER) {
      if (!week[d].enabled) continue;
      for (const r of week[d].ranges) {
        if (!r.start || !r.end) { toast.error(`Set both times on ${DAY_LABEL[d]}`); return; }
        if (r.end <= r.start) { toast.error(`${DAY_LABEL[d]}: end time must be after start time`); return; }
        rules.push({ weekday: d, startTime: r.start, endTime: r.end, slotMins });
      }
    }
    try {
      setSaving(true);
      await meetingsApi.saveRules(rules, getBrowserTimeZone());
      toast.success(rules.length ? 'Weekly hours saved — mentees can book these every week' : 'Weekly hours cleared');
      onSaved();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not save your weekly hours'); }
    finally { setSaving(false); }
  };

  return (
    <section className="bg-card rounded-2xl border border-slate-200 p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-slate-900 font-medium flex items-center gap-2"><CalendarRange className="w-4 h-4 text-brand-500" />Weekly hours</h3>
          <p className="text-sm text-slate-500 mt-0.5">Set the hours you&apos;re free each week once — they recur, and mentees can book a slot any week.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Slot length</label>
          <select value={slotMins} onChange={(e) => setSlotMins(Number(e.target.value))} className={field}>
            {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
      ) : (
        <div className="divide-y divide-slate-100">
          {DAY_ORDER.map((d) => {
            const day = week[d];
            return (
              <div key={d} className="py-3 flex flex-col sm:flex-row sm:items-start gap-3">
                <label className="flex items-center gap-2.5 w-32 shrink-0 pt-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={day.enabled} onChange={() => toggle(d)} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  <span className={`text-sm font-medium ${day.enabled ? 'text-slate-900' : 'text-slate-400'}`}>{DAY_LABEL[d]}</span>
                </label>
                {!day.enabled ? (
                  <span className="text-sm text-slate-400 pt-1.5">Unavailable</span>
                ) : (
                  <div className="flex-1 space-y-2">
                    {day.ranges.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 flex-wrap">
                        <input type="time" value={r.start} onChange={(e) => setRange(d, i, 'start', e.target.value)} className={field} />
                        <span className="text-slate-400 text-sm">–</span>
                        <input type="time" value={r.end} onChange={(e) => setRange(d, i, 'end', e.target.value)} className={field} />
                        <button onClick={() => addRange(d)} title="Add another range" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:border-brand-300 hover:text-brand-600"><Plus className="w-4 h-4" /></button>
                        {day.ranges.length > 1 && (
                          <button onClick={() => removeRange(d, i)} title="Remove this range" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><X className="w-4 h-4" /></button>
                        )}
                        {i === 0 && (
                          <button onClick={() => applyToAll(d)} title="Copy these hours to every day" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-brand-600 hover:bg-brand-50"><Copy className="w-3.5 h-3.5" />Apply to all</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={save} disabled={saving || loading} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Save weekly hours
        </button>
      </div>
    </section>
  );
}

// ───────────────────────── Availability tab (existing 1:1) ─────────────────────────
function AvailabilityTab() {
  const { availability, meetings, loading, error, refetch } = useMentorSchedule();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('2:00 PM');
  const [duration, setDuration] = useState(30);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Cancelling a 1:1 opens a reason prompt (shown to the mentee).
  const [cancelFor, setCancelFor] = useState<{ id: string; who: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const publish = async () => {
    if (!date) { toast.error('Pick a date'); return; }
    if (!time.trim()) { toast.error('Enter a time'); return; }
    try { setAdding(true); await meetingsApi.publishSlot({ date, time: time.trim(), durationMins: duration, timezone: getBrowserTimeZone() }); toast.success('Slot published'); setDate(''); refetch(); }
    catch (e: any) { toast.error(e?.response?.data?.message || 'Could not publish'); } finally { setAdding(false); }
  };
  const removeSlot = async (id: string) => {
    try { setBusyId(id); await meetingsApi.deleteSlot(id); refetch(); } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not remove'); } finally { setBusyId(null); }
  };
  const markDone = async (id: string) => {
    try { setBusyId(id); await meetingsApi.updateStatus(id, 'done'); refetch(); } catch { toast.error('Could not update'); } finally { setBusyId(null); }
  };
  const confirmCancel = async () => {
    if (!cancelFor) return;
    try {
      setBusyId(cancelFor.id);
      await meetingsApi.updateStatus(cancelFor.id, 'cancelled', cancelReason.trim() || undefined);
      toast.success('1:1 cancelled - the mentee has been notified');
      setCancelFor(null); setCancelReason(''); refetch();
    } catch { toast.error('Could not cancel'); } finally { setBusyId(null); }
  };
  const upcoming = meetings.filter((m) => m.status === 'scheduled');

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>;
  if (error) return <div className="bg-card rounded-2xl border border-slate-200 py-12 text-center"><p className="text-slate-600 mb-3">{error}</p><button onClick={refetch} className="text-brand-600 text-sm font-medium">Try again</button></div>;

  return (
    <div className="space-y-6">
      {/* Recurring weekly hours — the primary way to set availability. */}
      <RecurringHoursEditor onSaved={refetch} />

      <section className="bg-card rounded-2xl border border-slate-200 p-6 space-y-4">
        <div>
          <h3 className="text-slate-900 font-medium flex items-center gap-2"><CalendarClock className="w-4 h-4 text-brand-500" />One-off slot</h3>
          <p className="text-sm text-slate-500 mt-0.5">Need a single extra time outside your weekly hours? Add it here.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="block text-xs text-slate-500 mb-1">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} /></div>
          <div><label className="block text-xs text-slate-500 mb-1">Time</label><input value={time} onChange={(e) => setTime(e.target.value)} className={`${field} w-28`} /></div>
          <div><label className="block text-xs text-slate-500 mb-1">Duration</label><select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={field}>{DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}</select></div>
          <button onClick={publish} disabled={adding} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">{adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Publish slot</button>
        </div>
        {availability.length === 0 ? <p className="text-sm text-slate-500">No slots published.</p> : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availability.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50">
                <div><p className="text-sm font-medium text-slate-900">{formatMeeting(s.startsAt, s.day, s.time)}</p><p className="text-xs text-slate-500">{s.durationMins} min</p></div>
                {s.taken ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs"><User className="w-3 h-3" />{s.bookedBy ? s.bookedBy.firstName : 'Booked'}</span>
                  : <button onClick={() => removeSlot(s.id)} disabled={busyId === s.id} className="text-slate-400 hover:text-red-500">{busyId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}</button>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-card rounded-2xl border border-slate-200">
        <div className="px-6 py-5 border-b border-slate-200"><h3 className="text-slate-900 font-medium">Upcoming 1:1s</h3></div>
        <div className="p-6">
          {upcoming.length === 0 ? <p className="text-sm text-slate-500">No upcoming 1:1s.</p> : (
            <div className="space-y-2">
              {upcoming.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200">
                  <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center shrink-0"><span className="text-brand-700 text-xs font-medium">{m.mentee?.firstName?.[0]}{m.mentee?.lastName?.[0]}</span></div>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-900">{m.mentee?.firstName} {m.mentee?.lastName}</p><div className="flex items-center gap-2 text-xs text-slate-500"><Clock className="w-3 h-3" />{formatMeeting(m.startsAt, m.day, m.time)} · {m.durationMins}m</div>{m.agenda && <p className="text-xs text-slate-500 mt-0.5 truncate">{m.agenda}</p>}</div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => markDone(m.id)} disabled={busyId === m.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50"><Check className="w-3.5 h-3.5" />Done</button>
                    <button onClick={() => { setCancelReason(''); setCancelFor({ id: m.id, who: `${m.mentee?.firstName ?? ''} ${m.mentee?.lastName ?? ''}`.trim() || 'your mentee' }); }} disabled={busyId === m.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:border-red-300 hover:text-red-600 disabled:opacity-50"><X className="w-3.5 h-3.5" />Cancel</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <Drawer
        open={!!cancelFor}
        onClose={() => setCancelFor(null)}
        title="Cancel this 1:1"
        subtitle={cancelFor ? `with ${cancelFor.who}` : undefined}
        footer={
          <>
            <button onClick={() => setCancelFor(null)} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Keep meeting</button>
            <button onClick={confirmCancel} disabled={busyId === cancelFor?.id} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {busyId === cancelFor?.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}Cancel 1:1
            </button>
          </>
        }
      >
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Reason <span className="text-slate-400 font-normal">(shared with the mentee)</span></label>
        <textarea
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="e.g. Something urgent came up - let's rebook for later this week."
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
        />
        <p className="mt-2 text-xs text-slate-400">A short reason helps your mentee understand and rebook. The slot is freed so they can book again.</p>
      </Drawer>
    </div>
  );
}

// ───────────────────────── Page ─────────────────────────
const TABS = [
  { key: 'templates', label: 'Templates', icon: LayoutGrid },
  { key: 'fill', label: 'Fill schedules', icon: Route },
  { key: 'availability', label: '1:1 Availability', icon: CalendarClock },
] as const;

export default function MentorSchedules() {
  const [tab, setTab] = useState<'templates' | 'fill' | 'availability'>('templates');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-slate-900 mb-2">Schedules</h1>
        <p className="text-slate-600">Shape the day with reusable templates, fill each mentee's slots, and publish your 1:1 times.</p>
      </div>
      <div className="flex flex-wrap items-center gap-0 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'fill' && <FillTab />}
      {tab === 'availability' && <AvailabilityTab />}
    </div>
  );
}
