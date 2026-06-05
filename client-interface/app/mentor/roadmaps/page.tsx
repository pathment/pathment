'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Route, Plus, X, Trash2, Download, Users, Loader2, GripVertical, Tag,
} from 'lucide-react';
import { useMentorRoadmaps, useMentorPrograms, useMentorCohort, type LinearRoadmap } from '@/lib/hooks/mentor';
import { mentorApi } from '@/lib/services/mentor-api';

const STEP_TYPES = ['project', 'assignment', 'reading', 'video', 'quiz', 'discussion'];
const EFFORTS = ['xs', 's', 'm', 'l'];

interface DraftStep { title: string; type: string; criteria: string; effort: string; dueOffsetDays: string }

// ── Create drawer ───────────────────────────────────────────────────────────
function CreateDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { programs, loading: progLoading } = useMentorPrograms();
  const [name, setName] = useState('');
  const [programId, setProgramId] = useState('');
  const [tags, setTags] = useState('');
  const [steps, setSteps] = useState<DraftStep[]>([{ title: '', type: 'project', criteria: '', effort: 'm', dueOffsetDays: '' }]);
  const [saving, setSaving] = useState(false);

  const setStep = (i: number, patch: Partial<DraftStep>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStep = () => setSteps((prev) => [...prev, { title: '', type: 'project', criteria: '', effort: 'm', dueOffsetDays: '' }]);
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    const cleanSteps = steps.filter((s) => s.title.trim());
    if (!name.trim() || !programId || cleanSteps.length === 0) {
      toast.error('Add a name, a program, and at least one step');
      return;
    }
    try {
      setSaving(true);
      await mentorApi.createRoadmap({
        name: name.trim(),
        programId,
        skillTags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        steps: cleanSteps.map((s) => ({
          title: s.title.trim(),
          type: s.type,
          effort: s.effort,
          dueOffsetDays: s.dueOffsetDays.trim() ? Number(s.dueOffsetDays) : undefined,
          criteria: s.criteria.split('\n').map((c) => c.trim()).filter(Boolean),
        })),
      });
      toast.success('Roadmap created');
      onCreated();
      onClose();
    } catch {
      toast.error('Could not create the roadmap');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-card border-l border-slate-200 dark:border-slate-700 shadow-2xl dark:shadow-[-8px_0_30px_rgba(0,0,0,0.6)] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">New roadmap</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Backend Foundations"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Program</label>
            <select value={programId} onChange={(e) => setProgramId(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card">
              <option value="">{progLoading ? 'Loading…' : 'Select a program'}</option>
              {programs.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Skill tags <span className="text-slate-400 font-normal">(comma-separated)</span></label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="node, express, sql"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Steps (in order)</label>
              <button onClick={addStep} className="text-brand-600 hover:text-brand-700 text-sm inline-flex items-center gap-1"><Plus className="w-4 h-4" />Add step</button>
            </div>
            <div className="space-y-3">
              {steps.map((s, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <GripVertical className="w-4 h-4 text-slate-300" />
                    <span className="text-xs font-medium text-slate-400">Step {i + 1}</span>
                    {steps.length > 1 && (
                      <button onClick={() => removeStep(i)} className="ml-auto text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                  <input value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} placeholder="Step title"
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <div className="flex flex-wrap gap-2">
                    <select value={s.type} onChange={(e) => setStep(i, { type: e.target.value })}
                      className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-card capitalize focus:outline-none focus:ring-2 focus:ring-brand-500">
                      {STEP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select value={s.effort} onChange={(e) => setStep(i, { effort: e.target.value })}
                      title="Effort"
                      className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-card uppercase focus:outline-none focus:ring-2 focus:ring-brand-500">
                      {EFFORTS.map((ef) => <option key={ef} value={ef}>{ef}</option>)}
                    </select>
                    <input type="number" min={1} value={s.dueOffsetDays}
                      onChange={(e) => setStep(i, { dueOffsetDays: e.target.value })}
                      placeholder="due +days"
                      className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <textarea value={s.criteria} onChange={(e) => setStep(i, { criteria: e.target.value })} rows={2}
                    placeholder="Acceptance criteria, one per line"
                    className="mt-2 w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Create roadmap
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assign drawer ─────────────────────────────────────────────────────────────
function AssignDrawer({ roadmap, onClose, onAssigned }: { roadmap: LinearRoadmap; onClose: () => void; onAssigned: () => void }) {
  const { cohort, loading } = useMentorCohort();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [startStep, setStartStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const assign = async () => {
    if (selected.size === 0) { toast.error('Pick at least one mentee'); return; }
    try {
      setSaving(true);
      const res: any = await mentorApi.assignRoadmap(roadmap.id, { menteeIds: [...selected], startStep });
      const assigned = res?.data?.assigned ?? selected.size;
      const failed = res?.data?.failed ?? 0;
      if (assigned === 0) {
        const reason = res?.data?.results?.find((r: any) => !r.ok)?.error;
        toast.error(reason || 'Could not assign the roadmap');
        setSaving(false);
        return;
      }
      toast.success(`Assigned "${roadmap.name}" to ${assigned} mentee${assigned > 1 ? 's' : ''}${failed ? ` (${failed} failed)` : ''}`);
      onAssigned();
      onClose();
    } catch {
      toast.error('Could not assign the roadmap');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-card border-l border-slate-200 dark:border-slate-700 shadow-2xl dark:shadow-[-8px_0_30px_rgba(0,0,0,0.6)] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Assign roadmap</h2>
            <p className="text-sm text-slate-500 mt-0.5">{roadmap.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start at step</label>
            <select value={startStep} onChange={(e) => setStartStep(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
              {roadmap.steps.map((s, i) => <option key={s.id} value={i}>{i + 1}. {s.title}</option>)}
            </select>
            <p className="text-xs text-slate-400 mt-1">Skip steps they already know.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Mentees</label>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : cohort.length === 0 ? (
              <p className="text-sm text-slate-500">No mentees in your cohort yet.</p>
            ) : (
              <div className="space-y-1">
                {cohort.map((m) => (
                  <label key={m.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)}
                      className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                    <span className="text-sm text-slate-700">{m.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={assign} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Assign{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Roadmap card ──────────────────────────────────────────────────────────────
function RoadmapCard({ r, action }: { r: LinearRoadmap; action: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium text-slate-900 truncate">{r.name}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{r.steps.length} step{r.steps.length === 1 ? '' : 's'}</p>
        </div>
        {action}
      </div>
      {r.description && <p className="text-sm text-slate-500 mt-2 line-clamp-2">{r.description}</p>}
      {r.skillTags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {r.skillTags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">
              <Tag className="w-3 h-3" />{t}
            </span>
          ))}
        </div>
      )}
      {r.steps.length > 0 && (
        <ol className="mt-3 space-y-1 border-t border-slate-100 pt-3">
          {r.steps.slice(0, 4).map((s, i) => (
            <li key={s.id} className="text-xs text-slate-500 truncate">{i + 1}. {s.title}</li>
          ))}
          {r.steps.length > 4 && <li className="text-xs text-slate-400">+{r.steps.length - 4} more</li>}
        </ol>
      )}
    </div>
  );
}

export default function MentorRoadmaps() {
  const { local, org, loading, error, refetch } = useMentorRoadmaps();
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<LinearRoadmap | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  const onImport = async (id: string) => {
    try {
      setImportingId(id);
      await mentorApi.importRoadmap(id);
      toast.success('Imported to your roadmaps');
      refetch();
    } catch {
      toast.error('Could not import the roadmap');
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">Roadmaps</h1>
          <p className="text-slate-600">Build a sequence of steps, then assign it — approving a step advances the mentee automatically.</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 shrink-0">
          <Plus className="w-4 h-4" />New roadmap
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : (
        <>
          {/* My roadmaps */}
          <section>
            <h2 className="text-slate-900 mb-4 flex items-center gap-2"><Route className="w-4 h-4 text-brand-500" />My roadmaps</h2>
            {local.length === 0 ? (
              <div className="bg-card rounded-2xl border border-slate-200 py-10 text-center">
                <p className="text-slate-600 text-sm">No roadmaps yet — create one or import from your organization below.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {local.map((r) => (
                  <RoadmapCard key={r.id} r={r} action={
                    <button onClick={() => setAssigning(r)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-50 text-brand-700 text-xs font-medium hover:bg-brand-100 shrink-0">
                      <Users className="w-3.5 h-3.5" />Assign
                    </button>
                  } />
                ))}
              </div>
            )}
          </section>

          {/* Org library */}
          {org.length > 0 && (
            <section>
              <h2 className="text-slate-900 mb-4">From your organization</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {org.map((r) => (
                  <RoadmapCard key={r.id} r={r} action={
                    <button onClick={() => onImport(r.id)} disabled={importingId === r.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:border-brand-300 disabled:opacity-50 shrink-0">
                      {importingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}Import
                    </button>
                  } />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {creating && <CreateDrawer onClose={() => setCreating(false)} onCreated={refetch} />}
      {assigning && <AssignDrawer roadmap={assigning} onClose={() => setAssigning(null)} onAssigned={refetch} />}
    </div>
  );
}
