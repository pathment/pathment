'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Lightbulb } from 'lucide-react';
import type { ProfileInsight } from '@/lib/types/insights';

const KINDS = ['general', 'personality', 'analytical', 'issue', 'strength'];
const SOURCES = ['1:1', 'text', 'observation'];

const KIND_CLASS: Record<string, string> = {
  personality: 'bg-purple-100 text-purple-700',
  analytical: 'bg-blue-100 text-blue-700',
  issue: 'bg-red-100 text-red-700',
  strength: 'bg-emerald-100 text-emerald-700',
  general: 'bg-slate-100 text-slate-600',
};

/**
 * Mentor insight capture + timeline (prototype InsightsPanel). Quick-log a
 * structured observation; see the running history.
 */
export function InsightsPanel({
  insights,
  onAdd,
}: {
  insights: ProfileInsight[];
  onAdd: (data: { kind: string; note: string; source: string }) => Promise<void>;
}) {
  const [kind, setKind] = useState('general');
  const [source, setSource] = useState('observation');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!note.trim()) { toast.error('Write a short note'); return; }
    try {
      setSaving(true);
      await onAdd({ kind, note: note.trim(), source });
      setNote('');
      toast.success('Insight logged');
    } catch { toast.error('Could not log the insight'); }
    finally { setSaving(false); }
  };

  const field = 'border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-card capitalize focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="bg-card rounded-2xl border border-slate-200">
      <div className="px-6 py-5 border-b border-slate-200 flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <h2 className="text-slate-900">Insights</h2>
      </div>
      <div className="p-6 space-y-5">
        {/* Capture */}
        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value)} className={field}>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="What did you notice?"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <div className="flex justify-end">
            <button onClick={submit} disabled={saving} className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Log insight
            </button>
          </div>
        </div>

        {/* Timeline */}
        {insights.length === 0 ? (
          <p className="text-sm text-slate-500">No insights logged yet.</p>
        ) : (
          <div className="space-y-2">
            {insights.map((i) => (
              <div key={i.id} className="p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium capitalize ${KIND_CLASS[i.kind] || KIND_CLASS.general}`}>{i.kind}</span>
                  {i.source && <span className="text-xs text-slate-400">{i.source}</span>}
                </div>
                <p className="text-sm text-slate-700">{i.note}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {i.by ? `${i.by} · ` : ''}{i.at ? new Date(i.at).toLocaleDateString() : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
