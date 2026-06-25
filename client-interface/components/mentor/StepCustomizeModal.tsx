'use client';

import { useEffect, useState } from 'react';
import { X, Plus, CheckCircle2, Clock, Award, RotateCcw } from 'lucide-react';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { ResourceLink } from '@/components/shared/ResourceLink';
import { cleanHtml } from '@/lib/utils/html';
import type { RoadmapStep } from '@/lib/hooks/mentor';
import { pointsForDifficulty } from '@/lib/config/points';

interface ResourceItem { title: string; url: string; resourceType?: string }
type Override = Record<string, unknown>;

const DIFF_CLS: Record<string, string> = {
  easy: 'bg-emerald-50 text-emerald-700', medium: 'bg-amber-50 text-amber-700',
  hard: 'bg-orange-50 text-orange-700', expert: 'bg-red-50 text-red-700',
};

/**
 * Per-step "zoom in": view a roadmap step's full detail and (when editable)
 * customize it for one mentee at assign time. Returns only the fields that
 * differ from the roadmap default as an override map — empty diff → null (no
 * override). Used inside the assign drawers; renders above them (z-[60]).
 */
export function StepCustomizeModal({
  step, index, editable, menteeLabel, initialOverride, onClose, onSave,
}: {
  step: RoadmapStep;
  index: number;
  editable: boolean;
  menteeLabel?: string;
  initialOverride?: Override | null;
  onClose: () => void;
  onSave: (override: Override | null) => void;
}) {
  const baseCriteria = (step.acceptanceCriteria || []).join('\n');
  const baseResources: ResourceItem[] = (step.resources || []).map((r) => ({ title: r.title || '', url: r.url || '', resourceType: r.resourceType || 'reading' }));
  const ovTitle = (initialOverride?.titleOverride as string) ?? null;
  const ovDesc = (initialOverride?.descriptionOverride as string) ?? null;
  const ovDeliv = (initialOverride?.deliverableOverride as string) ?? null;
  const ovCrit = (initialOverride?.acceptanceCriteriaOverride as string[]) ?? null;
  const ovRes = (initialOverride?.resourcesOverride as ResourceItem[]) ?? null;

  const [mode, setMode] = useState<'view' | 'edit'>(editable && initialOverride ? 'edit' : 'view');
  const [title, setTitle] = useState(ovTitle ?? step.title ?? '');
  const [description, setDescription] = useState(ovDesc ?? step.description ?? '');
  const [deliverable, setDeliverable] = useState(ovDeliv ?? step.deliverable ?? '');
  const [criteria, setCriteria] = useState((ovCrit ? ovCrit.join('\n') : baseCriteria));
  const [note, setNote] = useState((initialOverride?.mentorNote as string) ?? '');
  const [resources, setResources] = useState<ResourceItem[]>(ovRes ? ovRes.map((r) => ({ title: r.title || '', url: r.url || '', resourceType: r.resourceType || 'reading' })) : baseResources);
  const [resourcesTouched, setResourcesTouched] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setRes = (i: number, patch: Partial<ResourceItem>) => { setResourcesTouched(true); setResources((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r))); };
  const addRes = () => { setResourcesTouched(true); setResources((p) => [...p, { title: '', url: '', resourceType: 'reading' }]); };
  const removeRes = (i: number) => { setResourcesTouched(true); setResources((p) => p.filter((_, idx) => idx !== i)); };

  const resetToDefault = () => {
    setTitle(step.title ?? ''); setDescription(step.description ?? ''); setDeliverable(step.deliverable ?? '');
    setCriteria(baseCriteria); setNote(''); setResources(baseResources); setResourcesTouched(true);
  };

  const save = () => {
    const ov: Override = {};
    if (title.trim() !== (step.title ?? '').trim()) ov.titleOverride = title.trim() || null;
    if (cleanHtml(description) !== cleanHtml(step.description)) ov.descriptionOverride = cleanHtml(description) || null;
    if (deliverable.trim() !== (step.deliverable ?? '').trim()) ov.deliverableOverride = deliverable.trim() || null;
    const critArr = criteria.split('\n').map((s) => s.trim()).filter(Boolean);
    if (criteria.trim() !== baseCriteria.trim()) ov.acceptanceCriteriaOverride = critArr.length ? critArr : null;
    if (note.trim()) ov.mentorNote = note.trim();
    if (resourcesTouched) {
      const arr = resources.filter((r) => r.url.trim()).map((r) => ({ title: r.title.trim() || r.url.trim(), url: r.url.trim(), resourceType: r.resourceType || 'reading' }));
      const baseJson = JSON.stringify(baseResources.map((r) => ({ title: r.title, url: r.url, resourceType: r.resourceType })));
      if (JSON.stringify(arr) !== baseJson) ov.resourcesOverride = arr.length ? arr : null;
    }
    const meaningful = Object.values(ov).some((v) => v != null);
    onSave(meaningful ? ov : null);
    onClose();
  };

  const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500';
  const label = 'block text-xs font-medium text-slate-700 mb-1';
  const isHtml = description ? /<[a-z][\s\S]*>/i.test(description) : false;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[88vh] bg-card rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Step {index + 1}</p>
            <h2 className="font-semibold text-slate-900 truncate">{mode === 'edit' ? title || step.title : step.title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg shrink-0"><X className="w-5 h-5" /></button>
        </div>

        {editable && (
          <div className="px-5 pt-3 shrink-0">
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
              <button onClick={() => setMode('view')} className={`px-3 py-1 rounded-md font-medium ${mode === 'view' ? 'bg-brand-600 text-white' : 'text-slate-600'}`}>View</button>
              <button onClick={() => setMode('edit')} className={`px-3 py-1 rounded-md font-medium ${mode === 'edit' ? 'bg-brand-600 text-white' : 'text-slate-600'}`}>Customize{menteeLabel ? ` for ${menteeLabel}` : ''}</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {mode === 'view' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {step.type && <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 text-[11px] font-medium capitalize">{step.type}</span>}
                {step.difficulty && <span className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize ${DIFF_CLS[step.difficulty] || 'bg-slate-100 text-slate-600'}`}>{step.difficulty}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                {step.effort && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />effort {step.effort}</span>}
                {step.dueOffsetDays != null && <span>due +{step.dueOffsetDays}d</span>}
                <span className="inline-flex items-center gap-1"><Award className="w-3.5 h-3.5" />{pointsForDifficulty(step.difficulty)} pts</span>
              </div>
              {step.description && (isHtml
                ? <div className="prose prose-sm max-w-none dark:prose-invert text-slate-600 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: step.description }} />
                : <p className="text-sm text-slate-600 whitespace-pre-wrap">{step.description}</p>)}
              {step.deliverable && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
                  <p className="text-[11px] font-medium text-blue-900">Deliverable</p>
                  <p className="text-sm text-blue-800">{step.deliverable}</p>
                </div>
              )}
              {!!step.acceptanceCriteria?.length && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1">Acceptance criteria</p>
                  <ul className="space-y-1">{step.acceptanceCriteria.map((c, i) => <li key={i} className="flex items-start gap-2 text-sm text-slate-700"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />{c}</li>)}</ul>
                </div>
              )}
              {!!step.resources?.length && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1">Resources</p>
                  <ul className="space-y-1">{step.resources.map((r, i) => (
                    <ResourceLink key={r.id || r.url || i} url={r.url} title={r.title} />
                  ))}</ul>
                </div>
              )}
              {!editable && <p className="text-xs text-slate-400 pt-1">To tailor this step for a specific mentee, assign it from <span className="font-medium">Cohort Review → Assign task</span>, or edit it after assigning.</p>}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">These changes apply to {menteeLabel || 'this mentee'} only — the roadmap step stays unchanged.</p>
              <div><label className={label}>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} className={field} /></div>
              <div><label className={label}>Description</label><RichTextEditor content={description} onChange={setDescription} placeholder="Describe this step for the mentee…" minHeight="140px" /></div>
              <div><label className={label}>Deliverable</label><textarea value={deliverable} onChange={(e) => setDeliverable(e.target.value)} rows={2} className={field} /></div>
              <div><label className={label}>Acceptance criteria <span className="text-slate-400 font-normal">(one per line)</span></label><textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={3} className={field} /></div>
              <div>
                <label className={label}>Resources</label>
                <div className="space-y-2">
                  {resources.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={r.title} onChange={(e) => setRes(i, { title: e.target.value })} placeholder="Label" className={`${field} flex-1`} />
                      <input value={r.url} onChange={(e) => setRes(i, { url: e.target.value })} placeholder="https://…" className={`${field} flex-[2]`} />
                      <button onClick={() => removeRes(i)} className="p-2 rounded-md hover:bg-slate-100 text-slate-400 shrink-0"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                  <button onClick={addRes} className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"><Plus className="w-4 h-4" />Add resource</button>
                </div>
              </div>
              <div><label className={label}>Mentor note <span className="text-slate-400 font-normal">(shown to the mentee)</span></label><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Use this resource instead of the original." className={field} /></div>
              <button onClick={resetToDefault} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"><RotateCcw className="w-3.5 h-3.5" />Reset to roadmap default</button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-200 dark:border-slate-700 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm">{editable ? 'Cancel' : 'Close'}</button>
          {editable && mode === 'edit' && (
            <button onClick={save} className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium">Save customization</button>
          )}
        </div>
      </div>
    </div>
  );
}
