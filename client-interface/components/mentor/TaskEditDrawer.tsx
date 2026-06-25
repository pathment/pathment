'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, X } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import RichTextEditor from '@/components/shared/RichTextEditor';
import taskApi from '@/lib/services/task-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { cleanHtml } from '@/lib/utils/html';
import { pointsForDifficulty } from '@/lib/config/points';

interface ResourceItem { title: string; url: string; resourceType?: string }

/**
 * Mentor edits ONE mentee's assigned task. Pre-fills the effective content
 * (override-or-roadmap) and only sends fields the mentor actually changed — so
 * untouched fields keep tracking the roadmap step; touched ones become a
 * per-mentee override. Clearing a field resets it to the roadmap default.
 */
export function TaskEditDrawer({
  task, onClose, onSaved,
}: {
  task: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const rt = task.roadmapTask || {};
  // Points are standard by difficulty (read-only here).
  const standardPoints = pointsForDifficulty(rt.difficulty);
  const initial = {
    title: rt.title || '',
    description: rt.description || '',
    deliverable: rt.deliverable || '',
    criteria: (rt.acceptanceCriteria || []).join('\n'),
    note: task.mentorNote || '',
  };
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [deliverable, setDeliverable] = useState(initial.deliverable);
  const [criteria, setCriteria] = useState(initial.criteria);
  const [note, setNote] = useState(initial.note);
  const [resources, setResources] = useState<ResourceItem[]>(
    (rt.resources || []).map((r: any) => ({ title: r.title || '', url: r.url || '', resourceType: r.resourceType || 'reading' }))
  );
  const [resourcesTouched, setResourcesTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const setRes = (i: number, patch: Partial<ResourceItem>) => {
    setResourcesTouched(true);
    setResources((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const addRes = () => { setResourcesTouched(true); setResources((p) => [...p, { title: '', url: '', resourceType: 'reading' }]); };
  const removeRes = (i: number) => { setResourcesTouched(true); setResources((p) => p.filter((_, idx) => idx !== i)); };

  const save = async () => {
    const payload: Record<string, unknown> = {};
    if (title !== initial.title) payload.titleOverride = title.trim() || null;
    if (cleanHtml(description) !== cleanHtml(initial.description)) payload.descriptionOverride = cleanHtml(description) || null;
    if (deliverable !== initial.deliverable) payload.deliverableOverride = deliverable.trim() || null;
    if (criteria !== initial.criteria) {
      const arr = criteria.split('\n').map((s: string) => s.trim()).filter(Boolean);
      payload.acceptanceCriteriaOverride = arr.length ? arr : null;
    }
    if (note !== initial.note) payload.mentorNote = note.trim() || null;
    if (resourcesTouched) {
      const arr = resources.filter((r) => r.url.trim()).map((r) => ({ title: r.title.trim() || r.url.trim(), url: r.url.trim(), resourceType: r.resourceType || 'reading' }));
      payload.resourcesOverride = arr.length ? arr : null;
    }
    if (!Object.keys(payload).length) { toast.info('Nothing changed'); onClose(); return; }
    setSaving(true);
    try {
      await taskApi.updateTask(task.id, payload as never);
      toast.success('Task updated for this mentee');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not update the task'));
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500';
  const label = 'block text-sm font-medium text-slate-700 mb-1';

  return (
    <Drawer open onClose={onClose} title="Edit task for this mentee" subtitle="Changes apply to this mentee only — the roadmap step is untouched"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}Save changes
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={label}>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        </div>
        <div>
          <label className={label}>Description</label>
          <RichTextEditor content={description} onChange={setDescription} placeholder="Describe the task for this mentee…" minHeight="140px" />
        </div>
        <div>
          <label className={label}>Deliverable</label>
          <textarea value={deliverable} onChange={(e) => setDeliverable(e.target.value)} rows={2} className={field} />
        </div>
        <div>
          <label className={label}>Points</label>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-sm font-medium tabular-nums">
            {standardPoints} pts
          </span>
          <p className="mt-1 text-xs text-slate-400">Set by task difficulty{rt.difficulty ? ` (${rt.difficulty})` : ''} — same for every mentee.</p>
        </div>
        <div>
          <label className={label}>Acceptance criteria <span className="text-slate-400 font-normal">(one per line)</span></label>
          <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={3} className={field} />
        </div>
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
        <div>
          <label className={label}>Mentor note <span className="text-slate-400 font-normal">(shown to this mentee)</span></label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Use this resource instead of the original link." className={field} />
        </div>
      </div>
    </Drawer>
  );
}
