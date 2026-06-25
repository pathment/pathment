'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Plus, X, Trash2, Loader2, GripVertical, Sparkles, ChevronDown, ArrowUp, ArrowDown, CornerDownRight,
  FileJson, Copy, Download, Upload,
} from 'lucide-react';
import { roadmapAiApi, type RoadmapStepInput } from '@/lib/services/roadmap-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { pointsForDifficulty } from '@/lib/config/points';

const STEP_TYPES = ['project', 'assignment', 'reading', 'video', 'quiz', 'discussion'];
const EFFORTS = ['xs', 's', 'm', 'l', 'xl'];
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];
const TITLE_MAX = 255;
// Common non-standard type names → our 6 types (so imports don't all become "project").
const TYPE_ALIAS: Record<string, string> = { task: 'assignment', course: 'video', exercise: 'assignment', practical: 'project', assessment: 'quiz', lecture: 'video' };

interface DraftResource { label: string; url: string }

const uid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

// A copy-paste starter for the JSON import. type ∈ project|assignment|reading|
// video|quiz|discussion · effort ∈ xs|s|m|l · difficulty ∈ easy|medium|hard|expert.
const JSON_TEMPLATE = `{
  "name": "My Roadmap",
  "description": "What this roadmap covers.",
  "skillTags": ["javascript", "react"],
  "steps": [
    {
      "title": "JS Fundamentals",
      "type": "video",
      "effort": "m",
      "difficulty": "medium",
      "points": 10,
      "dueOffsetDays": 7,
      "description": "Watch the fundamentals and take notes.",
      "criteria": ["Can explain closures", "Built 2 small demos"],
      "deliverable": "Link to your notes repo",
      "resources": [
        { "label": "JS Tutorial (Urdu/Hindi)", "url": "https://youtu.be/..." },
        { "label": "MDN JavaScript Guide", "url": "https://developer.mozilla.org/..." }
      ]
    },
    {
      "title": "React Basics",
      "type": "project",
      "effort": "l",
      "difficulty": "medium",
      "points": 20,
      "dueOffsetDays": 14,
      "description": "Build a small app from scratch.",
      "criteria": ["Components + props", "useState / useEffect"],
      "deliverable": "Deployed demo URL"
    }
  ]
}`;

interface DraftStep {
  key: string; id?: string; title: string; type: string; description: string; criteria: string;
  effort: string; dueOffsetDays: string; difficulty: string; deliverable: string; points: string;
  resources: DraftResource[];
}
const emptyStep = (): DraftStep => ({
  key: uid(), title: '', type: 'project', description: '', criteria: '',
  effort: 'm', dueOffsetDays: '', difficulty: 'medium', deliverable: '', points: '10', resources: [],
});

// The roadmap shape this editor accepts (covers both mentor "local" and admin "org").
export interface EditableRoadmap {
  id: string;
  name: string;
  programId: string;
  description?: string | null;
  skillTags?: string[];
  published?: boolean;
  steps: {
    id: string; title: string; type: string; description?: string; acceptanceCriteria?: string[];
    effort?: string | null; dueOffsetDays?: number | null; difficulty?: string | null;
    deliverable?: string | null; pointsBase?: number | null;
    resources?: { id?: string; title: string; url: string; resourceType?: string | null }[];
  }[];
}

export interface RoadmapEditorApi {
  create: (data: { name: string; programId: string; description?: string; skillTags?: string[]; steps: RoadmapStepInput[]; published?: boolean }) => Promise<unknown>;
  updateMeta: (id: string, data: { name?: string; description?: string; skillTags?: string[]; published?: boolean }) => Promise<unknown>;
  replaceSteps: (id: string, steps: RoadmapStepInput[]) => Promise<unknown>;
}

/**
 * Shared roadmap-authoring drawer used by BOTH the mentor (`/mentor/roadmaps`)
 * and the admin org library (`/admin/roadmaps`) so they never drift apart.
 * The parent injects the right API (mentor vs org) and program list; admin also
 * sets `showPublished`. Everything else — rich descriptions, drag-reorder,
 * insert/move, points/difficulty/deliverable, validation, draft autosave, AI —
 * is identical for both.
 */
export function RoadmapEditorDrawer({
  roadmap, programs, programsLoading, showPublished, draftScope = 'roadmap', api, onClose, onSaved,
}: {
  roadmap?: EditableRoadmap | null;
  programs: { id: string; name: string }[];
  programsLoading?: boolean;
  showPublished?: boolean;
  draftScope?: string;
  api: RoadmapEditorApi;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!roadmap;
  const draftKey = `pathment:roadmap-draft:${draftScope}:${roadmap?.id || 'new'}`;
  const loadDraft = (): Record<string, unknown> | null => {
    if (typeof window === 'undefined') return null;
    try { const r = window.localStorage.getItem(draftKey); return r ? JSON.parse(r) : null; } catch { return null; }
  };
  const draft = loadDraft();

  const [name, setName] = useState<string>((draft?.name as string) ?? roadmap?.name ?? '');
  const [programId, setProgramId] = useState<string>((draft?.programId as string) ?? roadmap?.programId ?? '');
  const [description, setDescription] = useState<string>((draft?.description as string) ?? roadmap?.description ?? '');
  const [tags, setTags] = useState<string>((draft?.tags as string) ?? (roadmap?.skillTags || []).join(', '));
  const [published, setPublished] = useState<boolean>((draft?.published as boolean) ?? roadmap?.published ?? true);
  const [steps, setSteps] = useState<DraftStep[]>(() => {
    if (Array.isArray(draft?.steps) && (draft!.steps as DraftStep[]).length) {
      return (draft!.steps as DraftStep[]).map((s) => ({ ...s, key: s.key || uid(), resources: s.resources || [] }));
    }
    if (editing && roadmap!.steps.length) {
      return roadmap!.steps.map((s) => ({
        key: s.id, id: s.id, title: s.title, type: s.type || 'project',
        description: s.description || '',
        effort: s.effort || 'm', dueOffsetDays: s.dueOffsetDays != null ? String(s.dueOffsetDays) : '',
        criteria: (s.acceptanceCriteria || []).join('\n'),
        difficulty: s.difficulty || 'medium',
        deliverable: s.deliverable || '',
        points: s.pointsBase != null ? String(s.pointsBase) : '10',
        resources: (s.resources || []).map((r) => ({ label: r.title, url: r.url })),
      }));
    }
    return [emptyStep()];
  });
  const [restored] = useState<boolean>(!!draft);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [openDetails, setOpenDetails] = useState<Set<string>>(new Set());

  const [genOpen, setGenOpen] = useState(false);
  const [genMode, setGenMode] = useState<'tasks' | 'weeks'>('tasks');
  const [genCount, setGenCount] = useState('8');
  const [genWeeks, setGenWeeks] = useState('6');
  const [genInstructions, setGenInstructions] = useState('');

  // ── JSON import / export ─────────────────────────────────────────────────
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const loadFromJson = () => {
    setJsonError(null);
    let parsed: unknown;
    try { parsed = JSON.parse(jsonText); } catch { setJsonError("That isn't valid JSON — check for missing commas or quotes."); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = parsed as any;
    const rawSteps = Array.isArray(p) ? p : (Array.isArray(p?.steps) ? p.steps : null);
    if (!rawSteps) { setJsonError('Expected an object with a "steps" array (or an array of steps).'); return; }
    if (!Array.isArray(p)) {
      if (typeof p.name === 'string') setName(p.name);
      if (typeof p.description === 'string') setDescription(p.description);
      if (Array.isArray(p.skillTags)) setTags(p.skillTags.join(', '));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drafts: DraftStep[] = rawSteps.filter((s: any) => s && s.title != null).map((s: any) => {
      const rawType = String(s.type || '').toLowerCase();
      const mappedType = TYPE_ALIAS[rawType] || rawType;
      return {
        key: uid(),
        title: String(s.title || '').slice(0, TITLE_MAX),
        type: STEP_TYPES.includes(mappedType) ? mappedType : 'project',
        effort: EFFORTS.includes(String(s.effort)) ? String(s.effort) : 'm',
        difficulty: DIFFICULTIES.includes(String(s.difficulty)) ? String(s.difficulty) : 'medium',
        points: s.points != null ? String(s.points) : (s.pointsBase != null ? String(s.pointsBase) : '10'),
        dueOffsetDays: s.dueOffsetDays != null && s.dueOffsetDays !== '' ? String(s.dueOffsetDays) : '',
        description: typeof s.description === 'string' ? s.description : '',
        criteria: Array.isArray(s.criteria) ? s.criteria.join('\n')
          : Array.isArray(s.acceptanceCriteria) ? s.acceptanceCriteria.join('\n')
            : (typeof s.criteria === 'string' ? s.criteria : ''),
        deliverable: String(s.deliverable || ''),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resources: Array.isArray(s.resources) ? s.resources.filter((r: any) => r && r.url).map((r: any) => ({ label: String(r.label || r.title || ''), url: String(r.url) })) : [],
      };
    });
    if (drafts.length === 0) { setJsonError('No steps with a "title" were found.'); return; }
    setSteps(drafts);
    setJsonOpen(false);
    toast.success(`Loaded ${drafts.length} step${drafts.length === 1 ? '' : 's'} from JSON — review & save`);
  };

  const currentAsJson = () => JSON.stringify({
    name: name.trim() || 'Untitled roadmap',
    description: description.trim() || undefined,
    skillTags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    steps: steps.filter((s) => s.title.trim()).map((s) => ({
      title: s.title.trim(),
      type: s.type,
      effort: s.effort,
      difficulty: s.difficulty,
      points: s.points.trim() ? Number(s.points) : undefined,
      dueOffsetDays: s.dueOffsetDays.trim() ? Number(s.dueOffsetDays) : undefined,
      description: s.description || undefined,
      criteria: s.criteria.split('\n').map((c) => c.trim()).filter(Boolean),
      deliverable: s.deliverable.trim() || undefined,
      resources: s.resources.filter((r) => r.url.trim()).map((r) => ({ label: r.label.trim() || undefined, url: r.url.trim() })),
    })),
  }, null, 2);

  const copyJson = async () => {
    try { await navigator.clipboard.writeText(currentAsJson()); toast.success('Roadmap JSON copied'); }
    catch { setJsonText(currentAsJson()); setJsonOpen(true); toast.message('Copied into the box below — select & copy'); }
  };
  const downloadJson = () => {
    if (typeof window === 'undefined') return;
    const blob = new Blob([currentAsJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(name.trim() || 'roadmap').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const onUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setJsonText(String(reader.result || '')); setJsonError(null); setJsonOpen(true); };
    reader.readAsText(file);
    e.target.value = '';
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(draftKey, JSON.stringify({ name, programId, description, tags, published, steps })); } catch { /* quota */ }
  }, [name, programId, description, tags, published, steps, draftKey]);
  const clearDraft = () => { try { if (typeof window !== 'undefined') window.localStorage.removeItem(draftKey); } catch { /* noop */ } };

  const setStep = (key: string, patch: Partial<DraftStep>) =>
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const addStep = () => setSteps((prev) => [...prev, emptyStep()]);
  const insertAfter = (key: string) => setSteps((prev) => {
    const i = prev.findIndex((s) => s.key === key);
    const n = [...prev]; n.splice(i + 1, 0, emptyStep()); return n;
  });
  const removeStep = (key: string) => setSteps((prev) => (prev.length > 1 ? prev.filter((s) => s.key !== key) : prev));
  const move = (key: string, dir: -1 | 1) => setSteps((prev) => {
    const i = prev.findIndex((s) => s.key === key);
    const to = i + dir;
    if (i < 0 || to < 0 || to >= prev.length) return prev;
    const n = [...prev]; const [m] = n.splice(i, 1); n.splice(to, 0, m); return n;
  });
  const toggleDetails = (key: string) => setOpenDetails((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const [dragKey, setDragKey] = useState<string | null>(null);
  const dropOn = (targetKey: string) => {
    setSteps((prev) => {
      if (!dragKey || dragKey === targetKey) return prev;
      const from = prev.findIndex((s) => s.key === dragKey);
      const to = prev.findIndex((s) => s.key === targetKey);
      if (from < 0 || to < 0) return prev;
      const n = [...prev]; const [m] = n.splice(from, 1); n.splice(to, 0, m); return n;
    });
    setDragKey(null);
  };

  const tooLong = steps.some((s) => s.title.trim().length > TITLE_MAX);

  const generate = async () => {
    if (!name.trim() && !description.trim()) { toast.error('Add a name or description first'); return; }
    try {
      setGenerating(true);
      const res = await roadmapAiApi.generate({
        name: name.trim(),
        description: description.trim() || undefined,
        skillTags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        mode: genMode,
        count: Number(genCount) || undefined,
        durationWeeks: genMode === 'weeks' ? (Number(genWeeks) || undefined) : undefined,
        additionalInstructions: genInstructions.trim() || undefined,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aiSteps: DraftStep[] = ((res as any)?.data?.steps || []).map((s: any) => ({
        key: uid(),
        title: String(s.title || '').slice(0, TITLE_MAX),
        type: s.type || 'project',
        description: s.description || '',
        effort: s.effort || 'm',
        dueOffsetDays: s.dueOffsetDays != null ? String(s.dueOffsetDays) : '',
        criteria: Array.isArray(s.criteria) ? s.criteria.join('\n') : (s.criteria || ''),
        difficulty: 'medium', deliverable: '', points: '10', resources: [],
      }));
      if (aiSteps.length === 0) { toast.error('AI returned no steps — try richer instructions'); return; }
      setSteps(aiSteps);
      setGenOpen(false);
      toast.success(`Drafted ${aiSteps.length} step${aiSteps.length === 1 ? '' : 's'} — review & tweak`);
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not generate. Set a Roadmap model in Settings → AI Connections.'));
    } finally { setGenerating(false); }
  };

  const save = async () => {
    const cleanSteps = steps.filter((s) => s.title.trim());
    if (!name.trim() || !programId || cleanSteps.length === 0) {
      toast.error('Add a name, a program, and at least one step');
      return;
    }
    if (tooLong) { toast.error('A step title is too long — shorten it and move the detail into the step description.'); return; }
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    const stepPayload: RoadmapStepInput[] = cleanSteps.map((s) => ({
      id: s.id,
      title: s.title.trim(),
      type: s.type,
      description: s.description,
      effort: s.effort,
      dueOffsetDays: s.dueOffsetDays.trim() ? Number(s.dueOffsetDays) : undefined,
      criteria: s.criteria.split('\n').map((c) => c.trim()).filter(Boolean),
      difficulty: s.difficulty,
      deliverable: s.deliverable.trim() || undefined,
      pointsBase: s.points.trim() ? Number(s.points) : undefined,
      resources: s.resources.filter((r) => r.url.trim()).map((r) => ({ label: r.label.trim(), url: r.url.trim() })),
    }));
    try {
      setSaving(true);
      if (editing) {
        await api.updateMeta(roadmap!.id, { name: name.trim(), description: description.trim() || undefined, skillTags: tagList, ...(showPublished ? { published } : {}) });
        await api.replaceSteps(roadmap!.id, stepPayload);
        toast.success('Roadmap saved');
      } else {
        await api.create({ name: name.trim(), programId, description: description.trim() || undefined, skillTags: tagList, steps: stepPayload, ...(showPublished ? { published } : {}) });
        toast.success('Roadmap created');
      }
      clearDraft();
      onSaved();
      onClose();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, editing ? 'Could not save the roadmap' : 'Could not create the roadmap'));
    } finally {
      setSaving(false);
    }
  };

  const fld = 'w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-card border-l border-slate-200 dark:border-slate-700 shadow-2xl dark:shadow-[-8px_0_30px_rgba(0,0,0,0.6)] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">{editing ? 'Edit roadmap' : (showPublished ? 'New org roadmap' : 'New roadmap')}</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {restored && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              Restored your unsaved draft. <button onClick={() => { clearDraft(); window.location.reload(); }} className="underline font-medium">Discard</button>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Backend Foundations" className={fld} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Program <span className="text-red-500">*</span></label>
            <select value={programId} onChange={(e) => setProgramId(e.target.value)} disabled={editing} className={`${fld} bg-card disabled:opacity-60`}>
              <option value="">{programsLoading ? 'Loading…' : 'Select a program'}</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {editing && <p className="text-xs text-slate-400 mt-1">A roadmap stays in its program.</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${fld} resize-none`} placeholder="What this roadmap covers…" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Skill tags <span className="text-slate-400 font-normal">(comma-separated)</span></label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="node, express, sql" className={fld} />
          </div>

          {/* AI generation */}
          <div className="rounded-xl border border-brand-200 dark:border-brand-500/30 bg-brand-50/50 dark:bg-brand-500/10">
            <button type="button" onClick={() => setGenOpen((v) => !v)} className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium text-brand-700">
              <span className="inline-flex items-center gap-1.5"><Sparkles className="w-4 h-4" />Generate steps with AI</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${genOpen ? 'rotate-180' : ''}`} />
            </button>
            {genOpen && (
              <div className="px-3.5 pb-3.5 space-y-3 border-t border-brand-200 dark:border-brand-500/30 pt-3">
                <div className="flex gap-2">
                  <button type="button" onClick={() => setGenMode('tasks')} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${genMode === 'tasks' ? 'border-brand-400 bg-brand-100 text-brand-800' : 'border-slate-200 text-slate-600'}`}>Flat task list</button>
                  <button type="button" onClick={() => setGenMode('weeks')} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${genMode === 'weeks' ? 'border-brand-400 bg-brand-100 text-brand-800' : 'border-slate-200 text-slate-600'}`}>Paced by weeks</button>
                </div>
                <div className="flex gap-2">
                  <label className="flex-1 text-xs text-slate-500">Steps
                    <input type="number" min={1} max={40} value={genCount} onChange={(e) => setGenCount(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
                  {genMode === 'weeks' && (
                    <label className="flex-1 text-xs text-slate-500">Weeks
                      <input type="number" min={1} max={52} value={genWeeks} onChange={(e) => setGenWeeks(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
                  )}
                </div>
                <textarea value={genInstructions} onChange={(e) => setGenInstructions(e.target.value)} rows={3} placeholder="What to include, prerequisites, specific topics or resources… (optional)" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <button type="button" onClick={generate} disabled={generating} className="w-full rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 inline-flex items-center justify-center gap-2 disabled:opacity-50">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{generating ? 'Generating…' : 'Generate'}
                </button>
                <p className="text-[11px] text-slate-400">Generating replaces the steps below. Review &amp; tweak before saving.</p>
              </div>
            )}
          </div>

          {/* Import / export JSON */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700">
            <button type="button" onClick={() => setJsonOpen((v) => !v)} className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium text-slate-700">
              <span className="inline-flex items-center gap-1.5"><FileJson className="w-4 h-4" />Import / export JSON</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${jsonOpen ? 'rotate-180' : ''}`} />
            </button>
            {jsonOpen && (
              <div className="px-3.5 pb-3.5 space-y-2 border-t border-slate-200 dark:border-slate-700 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => { setJsonText(JSON_TEMPLATE); setJsonError(null); }} className="text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50">Insert template</button>
                  <label className="text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />Upload .json
                    <input type="file" accept="application/json,.json" onChange={onUploadFile} className="hidden" />
                  </label>
                  <button type="button" onClick={copyJson} className="ml-auto text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 inline-flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" />Copy current</button>
                  <button type="button" onClick={downloadJson} className="text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 inline-flex items-center gap-1.5"><Download className="w-3.5 h-3.5" />Download</button>
                </div>
                <textarea value={jsonText} onChange={(e) => { setJsonText(e.target.value); setJsonError(null); }} rows={6}
                  placeholder='Paste roadmap JSON here, or click "Insert template" / "Upload .json"…'
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-brand-500" />
                {jsonError && <p className="text-xs text-red-500">{jsonError}</p>}
                <button type="button" onClick={loadFromJson} disabled={!jsonText.trim()} className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium py-2 disabled:opacity-50">Load into editor</button>
                <p className="text-[11px] text-slate-400">Loading replaces the fields above. Review, then Save to create the roadmap.</p>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 gap-2">
              <label className="text-sm font-medium text-slate-700">Steps (in order) <span className="text-red-500">*</span></label>
              <button onClick={addStep} className="text-brand-600 hover:text-brand-700 text-sm inline-flex items-center gap-1"><Plus className="w-4 h-4" />Add step</button>
            </div>
            <div className="space-y-3">
              {steps.map((s, i) => {
                const over = s.title.trim().length > TITLE_MAX;
                const detailsOpen = openDetails.has(s.key) || !!s.description;
                return (
                  <div key={s.key} onDragOver={(e) => { if (dragKey) e.preventDefault(); }} onDrop={() => dropOn(s.key)}
                    className={`rounded-xl border p-3 ${dragKey === s.key ? 'border-brand-400 opacity-60' : 'border-slate-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span draggable onDragStart={() => setDragKey(s.key)} onDragEnd={() => setDragKey(null)} title="Drag to reorder" className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500"><GripVertical className="w-4 h-4" /></span>
                      <span className="text-xs font-medium text-slate-400">Step {i + 1}</span>
                      <div className="ml-auto flex items-center gap-1">
                        <button onClick={() => move(s.key, -1)} disabled={i === 0} title="Move up" className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                        <button onClick={() => move(s.key, 1)} disabled={i === steps.length - 1} title="Move down" className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                        {steps.length > 1 && <button onClick={() => removeStep(s.key)} title="Remove step" className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                      </div>
                    </div>
                    <input value={s.title} maxLength={TITLE_MAX + 50} onChange={(e) => setStep(s.key, { title: e.target.value })} placeholder="Step title (keep it short)"
                      className={`w-full border rounded-lg px-3 py-1.5 text-sm mb-1 focus:outline-none focus:ring-2 ${over ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-brand-500'}`} />
                    {over && <p className="text-[11px] text-red-500 mb-1">Title is too long ({s.title.trim().length}/{TITLE_MAX}). Move the detail into the description below.</p>}
                    <div className="flex flex-wrap gap-2">
                      <select value={s.type} onChange={(e) => setStep(s.key, { type: e.target.value })} title="Type" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-card capitalize focus:outline-none focus:ring-2 focus:ring-brand-500">
                        {STEP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <select value={s.effort} onChange={(e) => setStep(s.key, { effort: e.target.value })} title="Effort" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-card uppercase focus:outline-none focus:ring-2 focus:ring-brand-500">
                        {EFFORTS.map((ef) => <option key={ef} value={ef}>{ef}</option>)}
                      </select>
                      <select value={s.difficulty} onChange={(e) => setStep(s.key, { difficulty: e.target.value })} title="Difficulty" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-card capitalize focus:outline-none focus:ring-2 focus:ring-brand-500">
                        {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <span title="Points (set by difficulty)" className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium tabular-nums">{pointsForDifficulty(s.difficulty)} pts</span>
                      <input type="number" min={1} value={s.dueOffsetDays} onChange={(e) => setStep(s.key, { dueOffsetDays: e.target.value })} title="Due (+days)" placeholder="due +days" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>

                    {detailsOpen ? (
                      <div className="mt-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Step details</label>
                        <RichTextEditor content={s.description} onChange={(html) => setStep(s.key, { description: html })} placeholder="Instructions, resources, links the mentee needs for this step…" minHeight="120px" />
                      </div>
                    ) : (
                      <button type="button" onClick={() => toggleDetails(s.key)} className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add details &amp; resources</button>
                    )}

                    <textarea value={s.criteria} onChange={(e) => setStep(s.key, { criteria: e.target.value })} rows={2} placeholder="Acceptance criteria, one per line" className="mt-2 w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    <input value={s.deliverable} onChange={(e) => setStep(s.key, { deliverable: e.target.value })} placeholder="Deliverable — what the mentee submits (optional)" className="mt-2 w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />

                    {/* Resources — the links the mentee watches/reads for this step */}
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-500">Resources <span className="text-slate-400 font-normal">(links)</span></span>
                        <button type="button" onClick={() => setStep(s.key, { resources: [...s.resources, { label: '', url: '' }] })} className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"><Plus className="w-3 h-3" />Add link</button>
                      </div>
                      {s.resources.length > 0 && (
                        <div className="space-y-1.5">
                          {s.resources.map((r, ri) => (
                            <div key={ri} className="flex items-center gap-1.5">
                              <input value={r.label} onChange={(e) => setStep(s.key, { resources: s.resources.map((x, idx) => idx === ri ? { ...x, label: e.target.value } : x) })}
                                placeholder="Label" className="w-2/5 border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" />
                              <input value={r.url} onChange={(e) => setStep(s.key, { resources: s.resources.map((x, idx) => idx === ri ? { ...x, url: e.target.value } : x) })}
                                placeholder="https://…" className="flex-1 min-w-0 border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
                              <button type="button" onClick={() => setStep(s.key, { resources: s.resources.filter((_, idx) => idx !== ri) })} className="shrink-0 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <button type="button" onClick={() => insertAfter(s.key)} className="mt-2 text-[11px] font-medium text-slate-400 hover:text-brand-600 inline-flex items-center gap-1"><CornerDownRight className="w-3 h-3" /> Insert step below</button>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={addStep} className="mt-3 w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-700 py-2 text-xs font-medium text-slate-500 hover:border-brand-300 hover:text-brand-700 inline-flex items-center justify-center gap-1"><Plus className="w-3.5 h-3.5" /> Add step</button>
          </div>

          {showPublished && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
              Publish immediately (mentors can import it)
            </label>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving || tooLong} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{editing ? 'Save roadmap' : 'Create roadmap'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RoadmapEditorDrawer;
