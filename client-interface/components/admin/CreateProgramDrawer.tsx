'use client';

import { useEffect, useRef, useCallback } from 'react';
import { X, Loader2, Plus, Check } from 'lucide-react';
import { useProgramCreate } from '@/lib/hooks/admin';

const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

/**
 * CreateProgramDrawer — right-side slide-over to create a program, matching the
 * app's other create drawers (indigo/slate, accessible). On success it routes to
 * the new program where curriculum is authored as roadmaps.
 */
export function CreateProgramDrawer({ onClose }: { onClose: () => void }) {
  const {
    loading,
    programData, setProgramData,
    tagInput, setTagInput, addTag, removeTag,
    outcomeInput, setOutcomeInput, addOutcome, removeOutcome,
    prerequisiteInput, setPrerequisiteInput, addPrerequisite, removePrerequisite,
    handleCreateProgram,
  } = useProgramCreate();

  const drawerRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const root = drawerRef.current;
    if (!root) return;
    const f = root.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, [onClose]);

  const Chips = ({ items, onRemove }: { items: string[]; onRemove: (v: string) => void }) => (
    items.length > 0 ? (
      <div className="flex flex-wrap gap-2 mt-2">
        {items.map((it) => (
          <span key={it} className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-50 text-brand-700 rounded-lg text-xs">
            {it}
            <button type="button" onClick={() => onRemove(it)} className="text-brand-500 hover:text-brand-700" aria-label={`Remove ${it}`}><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
    ) : null
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-black/40 dark:bg-black/70" onClick={onClose} aria-hidden="true" />
      <div ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="create-program-title" className="relative w-full max-w-lg h-full bg-card border-l border-slate-200 dark:border-slate-700 shadow-2xl dark:shadow-[-8px_0_30px_rgba(0,0,0,0.6)] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 id="create-program-title" className="font-semibold text-slate-900">Create program</h2>
            <p className="text-sm text-slate-500">Set up the program — then author its roadmaps.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label htmlFor="cp-name" className={labelCls}>Program name <span className="text-red-500">*</span></label>
            <input id="cp-name" ref={firstRef} value={programData.name} onChange={(e) => setProgramData({ ...programData, name: e.target.value })} placeholder="e.g. Full-Stack Web Development" className={field} />
          </div>

          <div>
            <label htmlFor="cp-desc" className={labelCls}>Description <span className="text-red-500">*</span></label>
            <textarea id="cp-desc" value={programData.description} onChange={(e) => setProgramData({ ...programData, description: e.target.value })} rows={3} placeholder="Objectives, outcomes, key focus areas…" className={`${field} resize-none`} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="cp-type" className={labelCls}>Type <span className="text-red-500">*</span></label>
              <select id="cp-type" value={programData.type} onChange={(e) => setProgramData({ ...programData, type: e.target.value })} className={field}>
                <option value="">Select type…</option>
                <option value="internship">Internship</option>
                <option value="mentorship">Mentorship</option>
                <option value="training">Training</option>
                <option value="onboarding">Onboarding</option>
              </select>
            </div>
            <div>
              <label htmlFor="cp-status" className={labelCls}>Status</label>
              <select id="cp-status" value={programData.status} onChange={(e) => setProgramData({ ...programData, status: e.target.value })} className={field}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="cp-visibility" className={labelCls}>Visibility</label>
            <select id="cp-visibility" value={programData.visibility} onChange={(e) => setProgramData({ ...programData, visibility: e.target.value })} className={field}>
              <option value="private">Private — invite-only, never browsed</option>
              <option value="public">Public — discoverable by mentees</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Private programs are reached only through invites or admin placement. Keep private unless you want a public catalog.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="cp-weeks" className={labelCls}>Duration (weeks)</label>
              <input id="cp-weeks" type="number" min={1} max={104} value={programData.totalDurationWeeks} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setProgramData({ ...programData, totalDurationWeeks: v }); }} className={field} />
            </div>
            <div>
              <label htmlFor="cp-hours" className={labelCls}>Hours / week</label>
              <input id="cp-hours" type="number" min={1} max={40} value={programData.estimatedHoursPerWeek} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setProgramData({ ...programData, estimatedHoursPerWeek: v }); }} className={field} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="cp-start" className={labelCls}>Start date</label>
              <input id="cp-start" type="date" value={programData.startDate} onChange={(e) => setProgramData({ ...programData, startDate: e.target.value })} className={field} />
            </div>
            <div>
              <label htmlFor="cp-end" className={labelCls}>End date</label>
              <input id="cp-end" type="date" value={programData.endDate} onChange={(e) => setProgramData({ ...programData, endDate: e.target.value })} className={field} />
            </div>
          </div>

          <div>
            <label htmlFor="cp-max" className={labelCls}>Max enrollments <span className="text-slate-400 font-normal">(optional)</span></label>
            <input id="cp-max" type="number" min={1} placeholder="Leave empty for unlimited" value={programData.maxEnrollments} onChange={(e) => { const v = parseInt(e.target.value, 10); setProgramData({ ...programData, maxEnrollments: e.target.value === '' ? '' : isNaN(v) || v < 1 ? programData.maxEnrollments : v }); }} className={field} />
          </div>

          {/* Tags */}
          <div>
            <label htmlFor="cp-tag" className={labelCls}>Tags</label>
            <div className="flex gap-2">
              <input id="cp-tag" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder="Add a tag…" className={field} />
              <button type="button" onClick={addTag} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm shrink-0"><Plus className="w-4 h-4" /></button>
            </div>
            <Chips items={programData.tags} onRemove={removeTag} />
          </div>

          {/* Learning outcomes */}
          <div>
            <label htmlFor="cp-out" className={labelCls}>Learning outcomes</label>
            <div className="flex gap-2">
              <input id="cp-out" value={outcomeInput} onChange={(e) => setOutcomeInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOutcome(); } }} placeholder="Add an outcome…" className={field} />
              <button type="button" onClick={addOutcome} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm shrink-0"><Plus className="w-4 h-4" /></button>
            </div>
            <Chips items={programData.learningOutcomes} onRemove={removeOutcome} />
          </div>

          {/* Prerequisites */}
          <div>
            <label htmlFor="cp-pre" className={labelCls}>Prerequisites</label>
            <div className="flex gap-2">
              <input id="cp-pre" value={prerequisiteInput} onChange={(e) => setPrerequisiteInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPrerequisite(); } }} placeholder="Add a prerequisite…" className={field} />
              <button type="button" onClick={addPrerequisite} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm shrink-0"><Plus className="w-4 h-4" /></button>
            </div>
            <Chips items={programData.prerequisites} onRemove={removePrerequisite} />
          </div>

          <div>
            <label htmlFor="cp-aud" className={labelCls}>Target audience</label>
            <input id="cp-aud" value={programData.targetAudience} onChange={(e) => setProgramData({ ...programData, targetAudience: e.target.value })} placeholder="Who is this program for?" className={field} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={handleCreateProgram} disabled={loading} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Create program
          </button>
        </div>
      </div>
    </div>
  );
}
