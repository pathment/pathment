'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Route, Plus, Trash2, Loader2, Eye, EyeOff, Pencil, FileJson } from 'lucide-react';
import { useOrgRoadmaps, type OrgRoadmap, type OrgRoadmapStep } from '@/lib/hooks/admin/useOrgRoadmaps';
import { programManagementApi } from '@/lib/services/program-api';
import { RoadmapEditorDrawer } from '@/components/mentor/RoadmapEditorDrawer';
import { downloadRoadmapJson } from '@/lib/utils/roadmap-json';
import { useConfirm } from '@/lib/context/ConfirmContext';

import { OpenSourceOrgAvatar } from '@/components/shared/OpenSourceOrgAvatar';

const TYPE_LABEL: Record<string, string> = { assignment: 'Assignment', project: 'Project', quiz: 'Quiz', reading: 'Reading', video: 'Video', discussion: 'Discussion', custom: 'Custom', practical: 'Practical', assessment: 'Assessment', open_source: 'Open Source' };

interface ProgramOpt { id: string; name: string }

/* ── read-only step chip row (card display) ─────────────────────────────── */
function StepLine({ step, n }: { step: OrgRoadmapStep; n: number }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-semibold flex items-center justify-center shrink-0">{n}</span>
      <span className="text-sm text-slate-700 truncate flex-1">{step.title}</span>
      <span className="text-[11px] text-slate-500 shrink-0">{TYPE_LABEL[step.type] || step.type}</span>
      {step.effort && <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase shrink-0">{step.effort}</span>}
      {step.dueOffsetDays != null && <span className="text-[11px] text-slate-400 shrink-0">+{step.dueOffsetDays}d</span>}
      {step.type === 'open_source' && Array.isArray(step.openSourceOrgs) && step.openSourceOrgs.map((org) => (
        <a key={org.id} href={org.url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 shrink-0 hover:text-teal-900 truncate max-w-[130px]"
          title={org.name}>
          <OpenSourceOrgAvatar name={org.name} url={org.url} className="w-3.5 h-3.5 rounded-full object-cover shrink-0 border border-teal-300" />
          <span className="truncate">{org.name}</span>
        </a>
      ))}
    </div>
  );
}

export default function AdminRoadmapsPage() {
  const confirm = useConfirm();
  const hub = useOrgRoadmaps();
  const { roadmaps, loading, create, update, replaceSteps, setPublished, remove, refetch } = hub;
  const [programs, setPrograms] = useState<ProgramOpt[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<OrgRoadmap | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    programManagementApi.programs.getAll().then((res: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const list = res?.data?.programs ?? res?.programs ?? res?.data ?? [];
      setPrograms((Array.isArray(list) ? list : []).map((p: any) => ({ id: p.id, name: p.name }))); // eslint-disable-line @typescript-eslint/no-explicit-any
    }).catch(() => setPrograms([]));
  }, []);

  // Same shared editor the mentors use — admin variant adds the Publish toggle.
  const editorApi = {
    create: (data: Parameters<typeof create>[0]) => create(data),
    updateMeta: (id: string, data: { name?: string; description?: string; skillTags?: string[]; published?: boolean }) => update(id, data),
    replaceSteps: (id: string, steps: Parameters<typeof replaceSteps>[1]) => replaceSteps(id, steps),
  };

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

              <div className="mt-3 border-t border-slate-100 pt-2 flex-1">
                {r.steps.length === 0 ? (
                  <p className="text-sm text-slate-400 py-2">No steps yet. Edit this roadmap to add some.</p>
                ) : (
                  [...r.steps].sort((a, b) => a.taskOrder - b.taskOrder).map((s, i) => <StepLine key={s.id} step={s} n={i + 1} />)
                )}
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button onClick={() => setEditing(r)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => downloadRoadmapJson(r)} title="Export as JSON"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  <FileJson className="w-3.5 h-3.5" /> JSON
                </button>
                <button onClick={async () => { setBusy(r.id); try { await setPublished(r.id, !r.published); } catch { toast.error('Could not update'); } finally { setBusy(null); } }}
                  disabled={busy === r.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {r.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {r.published ? 'Unpublish' : 'Publish'}
                </button>
                <button onClick={async () => { if (!(await confirm({ title: `Delete "${r.name}"?`, description: 'Imported mentor copies are unaffected.', variant: 'danger', confirmLabel: 'Delete' }))) return; setBusy(r.id); try { await remove(r.id); toast.success('Deleted'); } catch { toast.error('Could not delete'); } finally { setBusy(null); } }}
                  disabled={busy === r.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:text-red-600 hover:border-red-200 disabled:opacity-50 ml-auto">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <RoadmapEditorDrawer programs={programs} showPublished draftScope="admin" api={editorApi}
          onClose={() => setCreating(false)} onSaved={refetch} />
      )}
      {editing && (
        <RoadmapEditorDrawer roadmap={editing} programs={programs} showPublished draftScope="admin" api={editorApi}
          onClose={() => setEditing(null)} onSaved={refetch} />
      )}
    </div>
  );
}
