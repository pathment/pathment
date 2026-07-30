'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Save, Layers, Info } from 'lucide-react';
import { toast } from 'sonner';
import { applicationApi } from '@/lib/services/intake-api';
import { RubricField } from '@/components/admin/RubricField';

interface Criterion { key: string; label: string; how: string; soloQualifies: boolean }
interface LevelRule { levelKey: string; minMet: number; criteria: Criterion[] }
interface Rules {
  levels: LevelRule[];
  baseLevelKey: string | null;
  cohortLevels: { key: string; label: string }[];
  seeded?: boolean;
}

const newKey = () => `c_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Edit what qualifies an applicant for each level. The AI checks these criteria
 * against the applicant's own answers and reports evidence; a fixed rule then
 * decides the level — so changing a criterion here changes every future
 * placement, consistently and auditably.
 */
export function LevelCriteriaEditor({ cohortId }: { cohortId: string }) {
  const [rules, setRules] = useState<Rules | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    applicationApi.getLevelRules(cohortId)
      .then((r: any) => setRules(r?.data || null)) // eslint-disable-line @typescript-eslint/no-explicit-any
      .catch(() => toast.error('Could not load level criteria'))
      .finally(() => setLoading(false));
  }, [cohortId]);
  useEffect(() => { load(); }, [load]);

  const labelOf = (key: string) => rules?.cohortLevels.find((l) => l.key === key)?.label || key;

  const patchRule = (levelKey: string, patch: Partial<LevelRule>) => {
    setRules((prev) => prev && ({ ...prev, levels: prev.levels.map((r) => (r.levelKey === levelKey ? { ...r, ...patch } : r)) }));
    setDirty(true);
  };
  const patchCriterion = (levelKey: string, ckey: string, patch: Partial<Criterion>) => {
    setRules((prev) => prev && ({
      ...prev,
      levels: prev.levels.map((r) => (r.levelKey === levelKey
        ? { ...r, criteria: r.criteria.map((c) => (c.key === ckey ? { ...c, ...patch } : c)) }
        : r)),
    }));
    setDirty(true);
  };
  const addCriterion = (levelKey: string) =>
    patchRule(levelKey, { criteria: [...(rules?.levels.find((r) => r.levelKey === levelKey)?.criteria || []), { key: newKey(), label: '', how: '', soloQualifies: false }] });
  const removeCriterion = (levelKey: string, ckey: string) => {
    const rule = rules?.levels.find((r) => r.levelKey === levelKey);
    patchRule(levelKey, { criteria: (rule?.criteria || []).filter((c) => c.key !== ckey) });
  };

  const save = async () => {
    if (!rules) return;
    for (const r of rules.levels) {
      for (const c of r.criteria) {
        if (!c.label.trim()) { toast.error('Every criterion needs a name'); return; }
      }
    }
    setSaving(true);
    try {
      await applicationApi.setLevelRules(cohortId, { levels: rules.levels, baseLevelKey: rules.baseLevelKey });
      toast.success('Level criteria saved');
      setDirty(false);
      load();
    } catch { toast.error('Could not save the criteria'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>;
  if (!rules) return null;

  if (!rules.cohortLevels.length) {
    return <p className="text-xs text-slate-500">Add levels to this cohort first — then you can set what qualifies someone for each one.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600">
          The AI checks each criterion against the applicant&apos;s own answers and quotes the evidence; these rules then decide the level.
          Levels are checked top-down — the first one whose bar is cleared wins, otherwise they land at{' '}
          <strong>{labelOf(rules.baseLevelKey || '')}</strong>.
          {rules.seeded && <span className="text-slate-500"> These are the starting defaults — edit them to match how you actually judge people.</span>}
        </p>
      </div>

      {rules.levels.map((rule) => (
        <div key={rule.levelKey} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Layers className="w-4 h-4 text-brand-600" />
            <p className="text-sm font-medium text-slate-900">{labelOf(rule.levelKey)}</p>
            <span className="text-xs text-slate-500">qualifies when they meet</span>
            <input
              type="number"
              min={1}
              value={rule.minMet}
              onChange={(e) => patchRule(rule.levelKey, { minMet: Math.max(1, Number(e.target.value) || 1) })}
              className="w-14 rounded-lg border border-slate-200 px-2 py-1 text-sm text-center bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <span className="text-xs text-slate-500">of these — or any one marked &ldquo;on its own&rdquo;</span>
          </div>

          <div className="mt-3 space-y-3">
            {rule.criteria.length === 0 && (
              <p className="text-xs text-slate-500">No criteria — nobody will reach this level.</p>
            )}
            {rule.criteria.map((c) => (
              <div key={c.key} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <input
                    value={c.label}
                    onChange={(e) => patchCriterion(rule.levelKey, c.key, { label: e.target.value })}
                    placeholder="Criterion name, e.g. 1+ year of real experience"
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    onClick={() => removeCriterion(rule.levelKey, c.key)}
                    aria-label="Remove criterion"
                    className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-2">
                  <RubricField
                    label="How to judge it"
                    value={c.how}
                    onChange={(v) => patchCriterion(rule.levelKey, c.key, { how: v })}
                    placeholder="What counts as proof, and what doesn't. e.g. Only when the answers show 12+ months of paid work with a role and dates. Course projects don't count."
                    rows={2}
                    tone="slate"
                  />
                </div>

                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={c.soloQualifies}
                    onChange={(e) => patchCriterion(rule.levelKey, c.key, { soloQualifies: e.target.checked })}
                  />
                  Meeting this <strong>on its own</strong> qualifies them for {labelOf(rule.levelKey)}
                </label>
              </div>
            ))}
          </div>

          <button
            onClick={() => addCriterion(rule.levelKey)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700"
          >
            <Plus className="w-3.5 h-3.5" /> Add criterion
          </button>
        </div>
      ))}

      <div className="flex items-center justify-end gap-2">
        {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save criteria
        </button>
      </div>
    </div>
  );
}
