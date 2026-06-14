'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Route, Plus, X, Download, Users, Loader2, Tag, GitBranch, Check, Pencil, Search, CheckCheck, FileJson, Eye,
} from 'lucide-react';
import { downloadRoadmapJson } from '@/lib/utils/roadmap-json';
import { useMentorRoadmaps, useMentorPrograms, useMentorCohort, type LinearRoadmap } from '@/lib/hooks/mentor';
import { mentorApi } from '@/lib/services/mentor-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { Drawer } from '@/components/shared/Drawer';
import { RoadmapEditorDrawer } from '@/components/mentor/RoadmapEditorDrawer';
import { RoadmapStepsDrawer } from '@/components/mentor/RoadmapStepsDrawer';
import { StepCustomizeModal } from '@/components/mentor/StepCustomizeModal';

// Deadline quick-picks for assignment. `null` days = "Default" (use each step's
// own timing). Shared shape with the custom-task drawer for consistency.
const DUE_PRESETS: { label: string; days: number | null }[] = [
  { label: 'Default', days: null }, { label: '+3 days', days: 3 }, { label: '+1 week', days: 7 }, { label: '+2 weeks', days: 14 },
];
const presetDate = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0]; };

// ── Assign drawer ─────────────────────────────────────────────────────────────
function AssignDrawer({ roadmap, onClose, onAssigned }: { roadmap: LinearRoadmap; onClose: () => void; onAssigned: () => void }) {
  const { cohort, loading } = useMentorCohort();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [startStep, setStartStep] = useState(0);
  const [dueDate, setDueDate] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewSteps, setViewSteps] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  // Per-step customizations (keyed by stepId) applied to the steps assigned now.
  const [stepOverrides, setStepOverrides] = useState<Record<string, any>>({}); // eslint-disable-line @typescript-eslint/no-explicit-any

  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const q = search.trim().toLowerCase();
  const filtered = q ? cohort.filter((m) => m.name.toLowerCase().includes(q)) : cohort;
  const allFilteredSelected = filtered.length > 0 && filtered.every((m) => selected.has(m.id));
  const toggleAllFiltered = () => setSelected((p) => {
    const n = new Set(p);
    if (allFilteredSelected) filtered.forEach((m) => n.delete(m.id));
    else filtered.forEach((m) => n.add(m.id));
    return n;
  });

  const assign = async () => {
    if (selected.size === 0) { toast.error('Pick at least one mentee'); return; }
    try {
      setSaving(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await mentorApi.assignRoadmap(roadmap.id, { menteeIds: [...selected], startStep, dueDate: dueDate || undefined, stepOverrides: Object.keys(stepOverrides).length ? stepOverrides : undefined });
      const assigned = res?.data?.assigned ?? selected.size;
      const failed = res?.data?.failed ?? 0;
      if (assigned === 0) {
        const reason = res?.data?.results?.find((r: { ok: boolean; error?: string }) => !r.ok)?.error;
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
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">Start at step</label>
              {roadmap.steps.length > 0 && (
                <button type="button" onClick={() => setViewSteps(true)}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" />View step details</button>
              )}
            </div>
            <select value={startStep} onChange={(e) => setStartStep(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
              {roadmap.steps.map((s, i) => <option key={s.id} value={i}>{i + 1}. {s.title}</option>)}
            </select>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-slate-400">Skip steps they already know.</p>
              {roadmap.steps[startStep] && (
                <button type="button" onClick={() => setCustomizing(true)}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">
                  <Pencil className="w-3 h-3" />{stepOverrides[roadmap.steps[startStep].id] ? 'Customized' : 'Customize this step'}
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Deadline <span className="text-slate-400 font-normal">(optional)</span></label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {DUE_PRESETS.map((p) => {
                const val = p.days == null ? '' : presetDate(p.days);
                const active = dueDate === val;
                return (
                  <button key={p.label} type="button" onClick={() => setDueDate(val)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${active ? 'border-brand-400 bg-brand-100 text-brand-800' : 'border-slate-200 text-slate-600 hover:border-brand-300'}`}>
                    {p.label}
                  </button>
                );
              })}
            </div>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <p className="text-xs text-slate-400 mt-1">Pick a preset or an exact date. &ldquo;Default&rdquo; uses each step&apos;s own timing (+7 days).</p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">Mentees</label>
              {selected.size > 0 && <span className="text-xs font-medium text-brand-600">{selected.size} selected</span>}
            </div>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : cohort.length === 0 ? (
              <p className="text-sm text-slate-500">No mentees in your cohort yet.</p>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search mentees…"
                    className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>}
                </div>
                <div className="flex items-center justify-between px-1 pb-1.5">
                  <button type="button" onClick={toggleAllFiltered} disabled={filtered.length === 0}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-40">
                    <CheckCheck className="w-3.5 h-3.5" />
                    {allFilteredSelected ? 'Clear' : `Select all${q ? ' matching' : ''}`} ({filtered.length})
                  </button>
                  {q && <span className="text-[11px] text-slate-400">{filtered.length} of {cohort.length}</span>}
                </div>
                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">No mentees match &ldquo;{search}&rdquo;.</p>
                  ) : filtered.map((m) => (
                    <label key={m.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)}
                        className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                      <span className="text-sm text-slate-700 truncate">{m.name}</span>
                    </label>
                  ))}
                </div>
              </>
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
      {viewSteps && <RoadmapStepsDrawer roadmap={roadmap} onClose={() => setViewSteps(false)} />}
      {customizing && roadmap.steps[startStep] && (
        <StepCustomizeModal
          step={roadmap.steps[startStep]}
          index={startStep}
          editable
          menteeLabel={selected.size === 1 ? 'this mentee' : 'the selected mentees'}
          initialOverride={stepOverrides[roadmap.steps[startStep].id] || null}
          onClose={() => setCustomizing(false)}
          onSave={(ov) => setStepOverrides((prev) => {
            const next = { ...prev };
            const id = roadmap.steps[startStep].id;
            if (ov) next[id] = ov; else delete next[id];
            return next;
          })}
        />
      )}
    </div>
  );
}

// ── Chain drawer: define "what comes next" (reusable graph) ──────────────────
function ChainDrawer({ roadmap, candidates, onClose, onSaved }: { roadmap: LinearRoadmap; candidates: LinearRoadmap[]; onClose: () => void; onSaved: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    mentorApi.getRoadmapLinks(roadmap.id)
      .then((r: { data?: { links?: { toRoadmapId: string }[] } }) => setSelected(new Set((r.data?.links || []).map((l) => l.toRoadmapId))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [roadmap.id]);

  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const save = async () => {
    setSaving(true);
    try {
      await mentorApi.setRoadmapLinks(roadmap.id, [...selected]);
      toast.success('Next roadmap(s) saved');
      onSaved(); onClose();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not save the chain')); }
    finally { setSaving(false); }
  };

  return (
    <Drawer open onClose={onClose} width="md" title="What comes next" subtitle={`After "${roadmap.name}" completes`}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Save
          </button>
        </>
      }>
      <div className="space-y-3">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs text-slate-500">
          {selected.size <= 1
            ? 'Pick one — it auto-assigns the moment a mentee finishes this roadmap.'
            : `Pick several to branch — when a mentee finishes, you'll choose which of the ${selected.size} they go to next.`}
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No other roadmaps to chain to yet.</p>
        ) : candidates.map((c) => {
          const on = selected.has(c.id);
          return (
            <button key={c.id} type="button" onClick={() => toggle(c.id)}
              className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${on ? 'border-brand-300 bg-brand-50 dark:bg-brand-500/15' : 'border-slate-200 dark:border-slate-700 hover:border-brand-300'}`}>
              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-300'}`}>{on && <Check className="w-3 h-3" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900 truncate">{c.name}</span>
                <span className="block text-xs text-slate-400">{c.steps.length} step{c.steps.length === 1 ? '' : 's'}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Drawer>
  );
}

// ── Roadmap card ──────────────────────────────────────────────────────────────
function RoadmapCard({ r, action }: { r: LinearRoadmap; action: React.ReactNode }) {
  const [viewing, setViewing] = useState(false);
  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-5">
      {/* Title gets its own full-width row so it never gets squeezed by the
          action buttons; the actions sit in a wrapping row below (responsive). */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-medium text-slate-900 truncate">{r.name}</h3>
          {r.isOwner === false && (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-medium px-1.5 py-0.5" title="Owned by a clan teammate — you can assign it">
              <Users className="w-2.5 h-2.5" />Shared
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-0.5">{r.steps.length} step{r.steps.length === 1 ? '' : 's'}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        {r.steps.length > 0 && (
          <button onClick={() => setViewing(true)} title="View steps"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-brand-600 hover:border-brand-300"><Eye className="w-3.5 h-3.5" /></button>
        )}
        <button onClick={() => downloadRoadmapJson(r)} title="Export as JSON"
          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-brand-600 hover:border-brand-300"><FileJson className="w-3.5 h-3.5" /></button>
        {action}
      </div>
      {viewing && <RoadmapStepsDrawer roadmap={r} onClose={() => setViewing(false)} />}
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
        <ol className="mt-3 space-y-0.5 border-t border-slate-100 pt-3">
          {r.steps.slice(0, 4).map((s, i) => (
            <li key={s.id}>
              <button onClick={() => setViewing(true)} title="View step details"
                className="w-full text-left text-xs text-slate-500 hover:text-brand-600 hover:underline truncate py-0.5">
                {i + 1}. {s.title}
              </button>
            </li>
          ))}
          <li>
            <button onClick={() => setViewing(true)} className="text-xs text-brand-600 hover:text-brand-700 hover:underline py-0.5">
              {r.steps.length > 4 ? `+${r.steps.length - 4} more — view all step details` : 'View step details'}
            </button>
          </li>
        </ol>
      )}
    </div>
  );
}

export default function MentorRoadmaps() {
  const { local, org, loading, error, refetch } = useMentorRoadmaps();
  const { programs } = useMentorPrograms();
  // Mentor wiring for the shared roadmap editor (org/admin pass their own).
  const editorApi = {
    create: (data: Parameters<typeof mentorApi.createRoadmap>[0]) => mentorApi.createRoadmap(data),
    updateMeta: (id: string, data: { name?: string; description?: string; skillTags?: string[] }) => mentorApi.updateRoadmapMeta(id, data),
    replaceSteps: (id: string, steps: unknown[]) => mentorApi.replaceRoadmapSteps(id, steps),
  };
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LinearRoadmap | null>(null);
  const [assigning, setAssigning] = useState<LinearRoadmap | null>(null);
  const [chaining, setChaining] = useState<LinearRoadmap | null>(null);
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
          <p className="text-slate-600">Build a sequence of steps, then assign it - approving a step advances the mentee automatically.</p>
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
                <p className="text-slate-600 text-sm">No roadmaps yet - create one or import from your organization below.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {local.map((r) => (
                  <RoadmapCard key={r.id} r={r} action={
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Edit/Next are owner-only; a shared (teammate's) roadmap
                          can still be assigned by the whole clan team. */}
                      {r.isOwner !== false && (
                        <>
                          <button onClick={() => setEditing(r)} title="Edit this roadmap"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:border-brand-300">
                            <Pencil className="w-3.5 h-3.5" />Edit
                          </button>
                          <button onClick={() => setChaining(r)} title="Set what comes next"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:border-brand-300">
                            <GitBranch className="w-3.5 h-3.5" />Next
                          </button>
                        </>
                      )}
                      <button onClick={() => setAssigning(r)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-50 text-brand-700 text-xs font-medium hover:bg-brand-100">
                        <Users className="w-3.5 h-3.5" />Assign
                      </button>
                    </div>
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

      {creating && <RoadmapEditorDrawer programs={programs} draftScope="mentor" api={editorApi} onClose={() => setCreating(false)} onSaved={refetch} />}
      {editing && <RoadmapEditorDrawer roadmap={editing} programs={programs} draftScope="mentor" api={editorApi} onClose={() => setEditing(null)} onSaved={refetch} />}
      {assigning && <AssignDrawer roadmap={assigning} onClose={() => setAssigning(null)} onAssigned={refetch} />}
      {chaining && <ChainDrawer roadmap={chaining} candidates={[...local, ...org].filter((c) => c.id !== chaining.id)} onClose={() => setChaining(null)} onSaved={refetch} />}
    </div>
  );
}
