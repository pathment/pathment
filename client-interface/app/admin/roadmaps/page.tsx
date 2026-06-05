'use client';

import { useEffect, useState, type Dispatch, type SetStateAction, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Route, Plus, Trash2, X, Loader2, Eye, EyeOff, Pencil } from 'lucide-react';
import { useOrgRoadmaps, type OrgRoadmap, type OrgRoadmapStep } from '@/lib/hooks/admin/useOrgRoadmaps';
import { programManagementApi } from '@/lib/services/program-api';
import type { RoadmapStepInput } from '@/lib/services/roadmap-api';

const TYPES = ['assignment', 'project', 'quiz', 'reading', 'video', 'discussion'];
const TYPE_LABEL: Record<string, string> = { assignment: 'Assignment', project: 'Project', quiz: 'Quiz', reading: 'Reading', video: 'Video', discussion: 'Discussion', custom: 'Custom', practical: 'Practical', assessment: 'Assessment' };
const EFFORTS: { key: string; label: string; hint: string }[] = [
  { key: 'xs', label: 'XS', hint: '~30 min' },
  { key: 's', label: 'S', hint: '~2 hrs' },
  { key: 'm', label: 'M', hint: 'half-day' },
  { key: 'l', label: 'L', hint: 'multi-day' },
];

interface ProgramOpt { id: string; name: string }

const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

/* A draft step in the editor (no id yet). */
interface DraftStep { title: string; type: string; effort: string; dueOffsetDays?: number; description?: string; criteria?: string }
const blankStep = (): DraftStep => ({ title: '', type: 'project', effort: 'm', dueOffsetDays: undefined, description: '', criteria: '' });
const toStepInput = (s: DraftStep): RoadmapStepInput => ({
  title: s.title.trim(),
  type: s.type,
  effort: s.effort,
  dueOffsetDays: s.dueOffsetDays,
  description: s.description?.trim() || undefined,
  criteria: (s.criteria || '').split('\n').map((c) => c.trim()).filter(Boolean),
});

/* ── shared rich step editor row ────────────────────────────────────────── */
function StepEditorRow({ index, step, onChange, onRemove, removable }: {
  index: number; step: DraftStep; onChange: (s: DraftStep) => void; onRemove: () => void; removable: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold flex items-center justify-center shrink-0">{index + 1}</span>
        <input value={step.title} onChange={(e) => onChange({ ...step, title: e.target.value })} placeholder={`Step ${index + 1} title`} className={field} />
        {removable && <button onClick={onRemove} aria-label="Remove step" className="p-1.5 text-slate-400 hover:text-red-600 shrink-0"><Trash2 className="w-4 h-4" /></button>}
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-8">
        <select value={step.type} onChange={(e) => onChange({ ...step, type: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-brand-500">
          {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        {/* segmented effort */}
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          {EFFORTS.map((ef) => (
            <button key={ef.key} type="button" title={ef.hint} onClick={() => onChange({ ...step, effort: ef.key })}
              className={`px-2.5 py-1.5 text-xs font-medium ${step.effort === ef.key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{ef.label}</button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1 text-sm">
          <span className="text-slate-400 text-xs">Due +</span>
          <input type="number" min={0} value={step.dueOffsetDays ?? ''} onChange={(e) => onChange({ ...step, dueOffsetDays: e.target.value === '' ? undefined : Number(e.target.value) })}
            className="w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <span className="text-slate-400 text-xs">days</span>
        </div>
      </div>
      <div className="pl-8 grid sm:grid-cols-2 gap-2">
        <textarea value={step.description} onChange={(e) => onChange({ ...step, description: e.target.value })} rows={2} placeholder="Brief / what to do" className={`${field} resize-none`} />
        <textarea value={step.criteria} onChange={(e) => onChange({ ...step, criteria: e.target.value })} rows={2} placeholder="Acceptance criteria (one per line)" className={`${field} resize-none`} />
      </div>
    </div>
  );
}

/* ── read-only step chip row (card display) ─────────────────────────────── */
function StepLine({ step, n }: { step: OrgRoadmapStep; n: number }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-semibold flex items-center justify-center shrink-0">{n}</span>
      <span className="text-sm text-slate-700 truncate flex-1">{step.title}</span>
      <span className="text-[11px] text-slate-500 shrink-0">{TYPE_LABEL[step.type] || step.type}</span>
      {step.effort && <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase shrink-0">{step.effort}</span>}
      {step.dueOffsetDays != null && <span className="text-[11px] text-slate-400 shrink-0">+{step.dueOffsetDays}d</span>}
    </div>
  );
}

export default function AdminRoadmapsPage() {
  const hub = useOrgRoadmaps();
  const { roadmaps, loading, create, setPublished, remove } = hub;
  const [programs, setPrograms] = useState<ProgramOpt[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<OrgRoadmap | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    programManagementApi.programs.getAll().then((res: any) => {
      const list = res?.data?.programs ?? res?.programs ?? res?.data ?? [];
      setPrograms((Array.isArray(list) ? list : []).map((p: any) => ({ id: p.id, name: p.name })));
    }).catch(() => setPrograms([]));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-1 flex items-center gap-2"><Route className="w-5 h-5 text-brand-600" /> Org Roadmaps</h1>
          <p className="text-slate-600 text-sm">Author the shared roadmap library. Mentors import published roadmaps and assign them to mentees.</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 shrink-0">
          <Plus className="w-4 h-4" /> New roadmap
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : roadmaps.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 p-12 text-center">
          <Route className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 mb-1">No org roadmaps yet</p>
          <p className="text-slate-500 text-sm">Create one to seed the shared library mentors can import.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {roadmaps.map((r) => (
            <div key={r.id} className="bg-card rounded-2xl border border-slate-200 p-5 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-slate-900 font-semibold truncate">{r.name}</h3>
                  {r.description && <p className="text-slate-500 text-sm mt-0.5 line-clamp-2">{r.description}</p>}
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${r.published ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                  {r.published ? 'Published' : 'Draft'}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="tabular-nums">{r.steps.length} step{r.steps.length === 1 ? '' : 's'}</span>
                {r.skillTags?.slice(0, 3).map((t) => <span key={t} className="px-2 py-0.5 bg-brand-50 text-brand-700 rounded">{t}</span>)}
              </div>

              {/* full step list */}
              <div className="mt-3 border-t border-slate-100 pt-2 flex-1">
                {r.steps.length === 0 ? (
                  <p className="text-sm text-slate-400 py-2">No steps yet — edit to add some.</p>
                ) : (
                  [...r.steps].sort((a, b) => a.taskOrder - b.taskOrder).map((s, i) => <StepLine key={s.id} step={s} n={i + 1} />)
                )}
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button onClick={() => setEditing(r)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={async () => { setBusy(r.id); try { await setPublished(r.id, !r.published); } catch { toast.error('Could not update'); } finally { setBusy(null); } }}
                  disabled={busy === r.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {r.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {r.published ? 'Unpublish' : 'Publish'}
                </button>
                <button onClick={async () => { if (!confirm(`Delete "${r.name}"? Imported mentor copies are unaffected.`)) return; setBusy(r.id); try { await remove(r.id); toast.success('Deleted'); } catch { toast.error('Could not delete'); } finally { setBusy(null); } }}
                  disabled={busy === r.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:text-red-600 hover:border-red-200 disabled:opacity-50 ml-auto">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && <CreateDrawer programs={programs} onClose={() => setCreating(false)} onCreate={create} />}
      {editing && <EditDrawer roadmap={editing} hub={hub} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ── Create drawer ──────────────────────────────────────────────────────── */
function CreateDrawer({ programs, onClose, onCreate }: {
  programs: ProgramOpt[];
  onClose: () => void;
  onCreate: (data: { name: string; programId: string; description?: string; skillTags?: string[]; steps: RoadmapStepInput[]; published?: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [programId, setProgramId] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [published, setPublishedFlag] = useState(true);
  const [steps, setSteps] = useState<DraftStep[]>([blankStep()]);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const clean = steps.map(toStepInput).filter((s) => s.title);
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (!programId) { toast.error('Pick a program'); return; }
    if (clean.length === 0) { toast.error('Add at least one step'); return; }
    try {
      setSaving(true);
      await onCreate({ name: name.trim(), programId, description: description.trim() || undefined, skillTags: tags.split(',').map((t) => t.trim()).filter(Boolean), steps: clean, published });
      toast.success('Roadmap created');
      onClose();
    } catch { toast.error('Could not create roadmap'); } finally { setSaving(false); }
  };

  return (
    <DrawerShell title="New org roadmap" onClose={onClose} onSave={submit} saving={saving} saveLabel="Create roadmap">
      <Field label="Name" required><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Frontend Foundations" className={field} /></Field>
      <Field label="Program" required>
        <select value={programId} onChange={(e) => setProgramId(e.target.value)} className={field}>
          <option value="">Select a program…</option>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${field} resize-none`} /></Field>
      <Field label="Skill tags" hint="(comma-separated)"><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="react, css, testing" className={field} /></Field>

      <StepsSection steps={steps} setSteps={setSteps} />

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={published} onChange={(e) => setPublishedFlag(e.target.checked)} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
        Publish immediately (mentors can import it)
      </label>
    </DrawerShell>
  );
}

/* ── Edit drawer: meta + add/remove steps (backend supports add/remove, not in-place step edit) ── */
function EditDrawer({ roadmap, hub, onClose }: { roadmap: OrgRoadmap; hub: ReturnType<typeof useOrgRoadmaps>; onClose: () => void }) {
  const [name, setName] = useState(roadmap.name);
  const [description, setDescription] = useState(roadmap.description || '');
  const [tags, setTags] = useState((roadmap.skillTags || []).join(', '));
  const [published, setPublishedFlag] = useState(roadmap.published);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [newSteps, setNewSteps] = useState<DraftStep[]>([]);
  const [saving, setSaving] = useState(false);

  const existing = [...roadmap.steps].sort((a, b) => a.taskOrder - b.taskOrder).filter((s) => !removedIds.includes(s.id));

  const submit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    try {
      setSaving(true);
      await hub.update(roadmap.id, { name: name.trim(), description: description.trim(), skillTags: tags.split(',').map((t) => t.trim()).filter(Boolean), published });
      for (const id of removedIds) await hub.removeStep(roadmap.id, id);
      for (const s of newSteps.map(toStepInput).filter((s) => s.title)) await hub.addStep(roadmap.id, s);
      toast.success('Roadmap updated');
      onClose();
    } catch { toast.error('Could not update roadmap'); } finally { setSaving(false); }
  };

  return (
    <DrawerShell title="Edit roadmap" onClose={onClose} onSave={submit} saving={saving} saveLabel="Save changes">
      <Field label="Name" required><input value={name} onChange={(e) => setName(e.target.value)} className={field} /></Field>
      <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${field} resize-none`} /></Field>
      <Field label="Skill tags" hint="(comma-separated)"><input value={tags} onChange={(e) => setTags(e.target.value)} className={field} /></Field>

      <div>
        <span className="text-sm font-medium text-slate-700">Steps</span>
        <div className="mt-2 space-y-1.5">
          {existing.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
              <span className="text-sm text-slate-700 truncate flex-1">{s.title}</span>
              <span className="text-[11px] text-slate-500">{TYPE_LABEL[s.type] || s.type}</span>
              {s.effort && <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">{s.effort}</span>}
              <button onClick={() => setRemovedIds((prev) => [...prev, s.id])} aria-label="Remove step" className="p-1 text-slate-400 hover:text-red-600 shrink-0"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          {existing.length === 0 && newSteps.length === 0 && <p className="text-sm text-slate-400">No steps — add one below.</p>}
        </div>

        {newSteps.length > 0 && (
          <div className="mt-2 space-y-2">
            <p className="text-xs font-medium text-slate-500">New steps</p>
            {newSteps.map((s, i) => (
              <StepEditorRow key={i} index={existing.length + i} step={s} removable
                onChange={(ns) => setNewSteps((prev) => prev.map((x, j) => (j === i ? ns : x)))}
                onRemove={() => setNewSteps((prev) => prev.filter((_, j) => j !== i))} />
            ))}
          </div>
        )}
        <button onClick={() => setNewSteps((prev) => [...prev, blankStep()])}
          className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add step</button>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={published} onChange={(e) => setPublishedFlag(e.target.checked)} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
        Published (mentors can import it)
      </label>
    </DrawerShell>
  );
}

/* ── small shared bits ──────────────────────────────────────────────────── */
function StepsSection({ steps, setSteps }: { steps: DraftStep[]; setSteps: Dispatch<SetStateAction<DraftStep[]>> }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">Steps</span>
        <button onClick={() => setSteps((s) => [...s, blankStep()])} className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add step</button>
      </div>
      <div className="space-y-2">
        {steps.map((s, i) => (
          <StepEditorRow key={i} index={i} step={s} removable={steps.length > 1}
            onChange={(ns) => setSteps((prev) => prev.map((x, j) => (j === i ? ns : x)))}
            onRemove={() => setSteps((prev) => prev.filter((_, j) => j !== i))} />
        ))}
      </div>
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}{required && <span className="text-red-500"> *</span>}{hint && <span className="text-slate-400 font-normal"> {hint}</span>}</label>
      {children}
    </div>
  );
}

function DrawerShell({ title, onClose, onSave, saving, saveLabel, children }: {
  title: string; onClose: () => void; onSave: () => void; saving: boolean; saveLabel: string; children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/70" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative w-full max-w-xl h-full bg-card border-l border-slate-200 dark:border-slate-700 shadow-2xl dark:shadow-[-8px_0_30px_rgba(0,0,0,0.6)] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">{children}</div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={onSave} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
