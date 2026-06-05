'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Plus, Trash2, X, Loader2, Pencil, Clock } from 'lucide-react';
import { scheduleApi, type ScheduleBlock } from '@/lib/services/schedule-api';

interface OrgTemplate { id: string; name: string; description?: string | null; blocks: ScheduleBlock[] }
interface DraftBlock { label: string; time: string; days: string; bookable: boolean }

const DAY_OPTS = ['everyday', 'weekdays', 'weekends'];
const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const blankBlock = (): DraftBlock => ({ label: '', time: '', days: 'weekdays', bookable: false });

export default function AdminSchedulesPage() {
  const [templates, setTemplates] = useState<OrgTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<OrgTemplate | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try { setLoading(true); const r: any = await scheduleApi.listOrgTemplates(); setTemplates(r?.data?.templates ?? []); }
    catch { toast.error('Failed to load templates'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const remove = async (id: string) => {
    if (!confirm('Delete this org template? Mentor copies already imported are unaffected.')) return;
    setBusy(id);
    try { await scheduleApi.deleteOrgTemplate(id); toast.success('Deleted'); await fetchAll(); }
    catch { toast.error('Could not delete'); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-1 flex items-center gap-2"><CalendarClock className="w-5 h-5 text-brand-600" /> Org Schedule Templates</h1>
          <p className="text-slate-600 text-sm">Author day-shape templates (standups, study blocks, rituals). Mentors import these and fill each slot with a roadmap or recurring task for their mentees.</p>
        </div>
        <button onClick={() => setEditing('new')} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 shrink-0">
          <Plus className="w-4 h-4" /> New template
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : templates.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 p-12 text-center">
          <CalendarClock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 mb-1">No org templates yet</p>
          <p className="text-slate-500 text-sm">Create one to seed the shared library mentors can import.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <div key={t.id} className="bg-card rounded-2xl border border-slate-200 p-5 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-slate-900 font-semibold truncate">{t.name}</h3>
                  {t.description && <p className="text-slate-500 text-sm mt-0.5 line-clamp-2">{t.description}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setEditing(t)} aria-label="Edit" className="p-1.5 text-slate-400 hover:text-brand-600"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(t.id)} disabled={busy === t.id} aria-label="Delete" className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-50"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="mt-3 border-t border-slate-100 pt-2 flex-1">
                {(t.blocks || []).length === 0 ? (
                  <p className="text-sm text-slate-400 py-1">No blocks yet.</p>
                ) : (
                  t.blocks.map((b) => (
                    <div key={b.id} className="flex items-center gap-2 py-1.5 text-sm">
                      <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      <span className="text-slate-700 truncate flex-1">{b.label}</span>
                      <span className="text-xs text-slate-400">{b.time || 'Flexible'}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 capitalize">{b.days}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <TemplateDrawer template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); fetchAll(); }} />}
    </div>
  );
}

function TemplateDrawer({ template, onClose, onSaved }: { template: OrgTemplate | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [blocks, setBlocks] = useState<DraftBlock[]>(
    template?.blocks?.length ? template.blocks.map((b) => ({ label: b.label, time: b.time, days: b.days, bookable: b.bookable })) : [blankBlock()]
  );
  const [saving, setSaving] = useState(false);

  const setBlock = (i: number, patch: Partial<DraftBlock>) => setBlocks((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const submit = async () => {
    const clean = blocks.map((b) => ({ ...b, label: b.label.trim() })).filter((b) => b.label);
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (clean.length === 0) { toast.error('Add at least one block'); return; }
    try {
      setSaving(true);
      const payload = { name: name.trim(), description: description.trim() || undefined, blocks: clean };
      if (template) await scheduleApi.updateOrgTemplate(template.id, payload);
      else await scheduleApi.createOrgTemplate(payload);
      toast.success(template ? 'Template updated' : 'Template created');
      onSaved();
    } catch { toast.error('Could not save template'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/70" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={template ? 'Edit template' : 'New template'} className="relative w-full max-w-lg h-full bg-card border-l border-slate-200 dark:border-slate-700 shadow-2xl dark:shadow-[-8px_0_30px_rgba(0,0,0,0.6)] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">{template ? 'Edit template' : 'New org template'}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daily fellowship rhythm" className={field} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${field} resize-none`} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Time blocks</span>
              <button onClick={() => setBlocks((b) => [...b, blankBlock()])} className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add block</button>
            </div>
            <div className="space-y-2">
              {blocks.map((b, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={b.label} onChange={(e) => setBlock(i, { label: e.target.value })} placeholder={`Block ${i + 1} label (e.g. Morning standup)`} className={field} />
                    {blocks.length > 1 && <button onClick={() => setBlocks((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove" className="p-1.5 text-slate-400 hover:text-red-600 shrink-0"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input value={b.time} onChange={(e) => setBlock(i, { time: e.target.value })} placeholder="Time (e.g. 9:00 AM)" className="flex-1 min-w-[120px] border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    <select value={b.days} onChange={(e) => setBlock(i, { days: e.target.value })} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-brand-500">
                      {DAY_OPTS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <label className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                      <input type="checkbox" checked={b.bookable} onChange={(e) => setBlock(i, { bookable: e.target.checked })} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                      Bookable
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{template ? 'Save' : 'Create template'}
          </button>
        </div>
      </div>
    </div>
  );
}
