'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Info, Loader2, Waypoints } from 'lucide-react';
import { useApiQuery } from '@/lib/query';
import { poolApi } from '@/lib/services/pool-api';
import { roundApi, type RoundDetail } from '@/lib/services/round-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { DIFFICULTY_POINTS_FALLBACK, EmptyState, Spinner, field, label as labelCls, primaryBtn, pts } from '@/components/admin/pools/poolUi';

/**
 * What each level is set to do.
 *
 * One rule per level, and a level without one gets nothing — no work, and no
 * email. That is the point of asking the question this way round. The round
 * this replaces aimed work at a list of levels and read an empty list as
 * "everyone", which is how three levels' courses went to every candidate at
 * once.
 *
 * Deadlines are not set here on purpose. Each step carries its own "due N days
 * after it is handed out", and candidates arrive one at a time, so a date
 * fixed when the round was written would give a late arrival less time than an
 * early one for the same piece of work.
 */
export function RoundLevelWork({ data, onChange, canAssign }: {
  data: RoundDetail; onChange: () => void; canAssign: boolean;
}) {
  const { round } = data;
  const options = useApiQuery({
    queryKey: ['pools', 'options', round.programId],
    queryFn: () => poolApi.options(round.programId),
    errorMessage: 'Could not load the roadmaps',
  });

  /** Every level the round could set work for: the intake's, plus any already in a rule. */
  const levels = useMemo(() => {
    const fromIntake = (round.cohort?.levels || []).map((l) => ({ key: l.key, label: l.label || l.key }));
    const known = new Set(fromIntake.map((l) => l.key));
    const extra = [...new Set(round.levelRules.map((r) => r.level))]
      .filter((key) => !known.has(key))
      .map((key) => ({ key, label: key }));
    return [...fromIntake, ...extra];
  }, [round.cohort, round.levelRules]);

  const [chosen, setChosen] = useState<Record<string, string>>(
    () => Object.fromEntries(round.levelRules.map((r) => [r.level, r.roadmapId])),
  );
  const [saving, setSaving] = useState(false);

  const curve = { ...DIFFICULTY_POINTS_FALLBACK, ...(round.settings.scoringPolicy?.difficultyPoints || {}) };
  const roadmaps = options.data?.roadmaps || [];

  /** What a roadmap is worth here: every step's difficulty through this round's curve. */
  const worthOf = (roadmapId: string) => {
    const roadmap = roadmaps.find((r) => r.id === roadmapId);
    if (!roadmap) return null;
    const total = roadmap.steps.reduce(
      (sum, step) => sum + (curve[(step.difficulty || 'medium') as keyof typeof curve] ?? curve.medium), 0,
    );
    return { steps: roadmap.steps.length, points: total };
  };

  const dirty = useMemo(() => {
    const before = Object.fromEntries(round.levelRules.map((r) => [r.level, r.roadmapId]));
    const keys = new Set([...Object.keys(before), ...Object.keys(chosen)]);
    return [...keys].some((k) => (before[k] || '') !== (chosen[k] || ''));
  }, [chosen, round.levelRules]);

  const save = async () => {
    setSaving(true);
    try {
      const rules = Object.entries(chosen)
        .filter(([, roadmapId]) => roadmapId)
        .map(([level, roadmapId]) => ({ level, roadmapId }));
      await roundApi.setLevelRules(round.id, rules);
      toast.success(rules.length
        ? 'Saved. People joining at these levels are given this work from the moment they join.'
        : 'Saved. No level has work set, so nobody is given anything.');
      onChange();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save the work'));
    } finally {
      setSaving(false);
    }
  };

  if (options.loading && !options.data) return <Spinner />;

  if (!levels.length) {
    return (
      <EmptyState
        title="This round has no levels"
        text={round.cohort
          ? `${round.cohort.name} asks no level question, so there is nothing to set work for. Add levels to the intake first.`
          : 'Work is set per level, and levels come from the intake. Attach one from Manage round.'}
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <span>
          Somebody who joins at a level is given that level&apos;s work, and nothing else, from the moment they
          join — each step keeps its own &ldquo;due N days after it is handed out&rdquo;.
          A level left on <span className="font-medium">No work</span> gives its candidates nothing, and tells them nothing.
        </span>
      </p>

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {levels.map((level) => {
          const roadmapId = chosen[level.key] || '';
          const worth = roadmapId ? worthOf(roadmapId) : null;
          return (
            <li key={level.key} className="p-4 sm:px-5">
              <label className={labelCls} htmlFor={`rule-${level.key}`}>{level.label}</label>
              <select
                id={`rule-${level.key}`}
                value={roadmapId}
                disabled={!canAssign}
                onChange={(e) => setChosen((prev) => ({ ...prev, [level.key]: e.target.value }))}
                className={field}
              >
                <option value="">No work — nobody at this level is given anything</option>
                {roadmaps.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}{r.published ? '' : ' (draft)'} · {r.stepCount} step{r.stepCount === 1 ? '' : 's'}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {worth
                  ? <>{worth.steps} step{worth.steps === 1 ? '' : 's'}, worth {pts(worth.points)} in total.</>
                  : 'Nobody at this level is given anything, and nothing is sent to them.'}
              </p>
            </li>
          );
        })}
      </ul>

      {canAssign && (
        <div className="flex items-center justify-end gap-3">
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
          <button onClick={save} disabled={saving || !dirty} className={primaryBtn}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Waypoints className="h-4 w-4" />} Save the work
          </button>
        </div>
      )}
    </div>
  );
}
