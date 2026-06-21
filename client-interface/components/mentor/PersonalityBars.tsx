'use client';

import { useState } from 'react';
import { Loader2, Pencil, Check } from 'lucide-react';
import type { Personality } from '@/lib/types/insights';

const DIMS: { key: keyof Personality; label: string }[] = [
  { key: 'consistency', label: 'Consistency' },
  { key: 'communication', label: 'Communication' },
  { key: 'resilience', label: 'Resilience' },
  { key: 'independence', label: 'Independence' },
];

/**
 * Working-style read (4 dims, 0-100). Read-only by default; pass onSave to make
 * it editable (mentor profile). Faithful to the prototype's Personality model.
 */
export function PersonalityBars({
  personality,
  onSave,
}: {
  personality: Personality | null;
  onSave?: (dims: Record<string, number>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, number>>({
    consistency: personality?.consistency ?? 50,
    communication: personality?.communication ?? 50,
    resilience: personality?.resilience ?? 50,
    independence: personality?.independence ?? 50,
  });

  const hasAny = personality && DIMS.some((d) => personality[d.key] != null);

  const save = async () => {
    if (!onSave) return;
    try { setSaving(true); await onSave(draft); setEditing(false); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Working style</h3>
        {onSave && !editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">
            <Pencil className="w-3.5 h-3.5" />{hasAny ? 'Edit' : 'Set'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          {DIMS.map((d) => (
            <div key={d.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-600">{d.label}</span>
                <span className="text-xs font-semibold text-slate-700 tabular-nums">{draft[d.key]}</span>
              </div>
              <input type="range" min={0} max={100} value={draft[d.key]}
                onChange={(e) => setDraft((p) => ({ ...p, [d.key]: Number(e.target.value) }))}
                className="w-full accent-brand-600" />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 border border-slate-200 text-slate-700 rounded-lg text-xs hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving} className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Save
            </button>
          </div>
        </div>
      ) : !hasAny ? (
        <p className="text-sm text-slate-500">Not assessed yet{onSave ? ' - set it from your 1:1s and observations.' : '.'}</p>
      ) : (
        <div className="space-y-3">
          {DIMS.map((d) => {
            const v = personality?.[d.key];
            return (
              <div key={d.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-600">{d.label}</span>
                  <span className="text-xs font-semibold text-slate-700 tabular-nums">{v ?? '-'}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${v ?? 0}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!editing && personality?.read && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">Read</p>
          <p className="text-sm text-slate-600">{personality.read}</p>
        </div>
      )}
    </div>
  );
}
