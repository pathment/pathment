'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Info, Loader2, Save } from 'lucide-react';
import { useApiQuery } from '@/lib/query';
import { poolApi } from '@/lib/services/pool-api';
import { roundApi, type RoundDetail } from '@/lib/services/round-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import {
  DIFFICULTIES, DIFFICULTY_BLURB, DIFFICULTY_POINTS_FALLBACK,
  field, fromLocalInput, label as labelCls, primaryBtn, toLocalInput,
} from '@/components/admin/pools/poolUi';

/**
 * The terms of the round: how many places, how work is priced, and which
 * intake feeds it.
 *
 * The points curve is the only way work is priced here. A step's difficulty
 * decides what it is worth, so changing one number re-prices every piece of
 * work in the round at once — which is the whole reason a round has a curve
 * rather than a number typed per piece.
 */
export function RoundSettings({ data, onChange, canManage }: {
  data: RoundDetail; onChange: () => void; canManage: boolean;
}) {
  const { round } = data;
  const options = useApiQuery({
    queryKey: ['pools', 'options', round.programId],
    queryFn: () => poolApi.options(round.programId),
  });

  const [form, setForm] = useState({
    quota: String(round.settings.quota),
    waitlistSize: String(round.settings.waitlistSize),
    qualificationDueAt: toLocalInput(round.settings.qualificationDueAt),
  });
  const [curve, setCurve] = useState<Record<string, string>>(
    () => Object.fromEntries(DIFFICULTIES.map((d) => [
      d, String(round.settings.scoringPolicy?.difficultyPoints?.[d] ?? DIFFICULTY_POINTS_FALLBACK[d]),
    ])),
  );
  const [targets, setTargets] = useState<string[]>(round.settings.targetClanIds || []);
  const [cohortId, setCohortId] = useState(round.cohort?.id || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await roundApi.setSettings(round.id, {
        quota: Number(form.quota),
        waitlistSize: Number(form.waitlistSize),
        qualificationDueAt: fromLocalInput(form.qualificationDueAt),
        scoringPolicy: { difficultyPoints: Object.fromEntries(DIFFICULTIES.map((d) => [d, Number(curve[d])])) },
        targetClanIds: targets,
      });
      if ((round.cohort?.id || '') !== cohortId) await roundApi.attachIntake(round.id, cohortId || null);
      toast.success('Saved');
      onChange();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save the round'));
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Places</h3>
        <div className="mt-2 grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="quota">How many are selected</label>
            <input id="quota" type="number" min={1} value={form.quota} onChange={set('quota')} disabled={!canManage} className={field} />
          </div>
          <div>
            <label className={labelCls} htmlFor="waitlist">Waitlist places</label>
            <input id="waitlist" type="number" min={0} value={form.waitlistSize} onChange={set('waitlistSize')} disabled={!canManage} className={field} />
            <p className="mt-1 text-xs text-muted-foreground">Ranked after the quota. None means everybody else is simply not selected.</p>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="due">Qualification deadline</label>
            <input id="due" type="datetime-local" value={form.qualificationDueAt} onChange={set('qualificationDueAt')} disabled={!canManage} className={field} />
            <p className="mt-1 text-xs text-muted-foreground">
              A shortlist drawn before this date warns, and never blocks — each piece of work has its own deadline.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">What work is worth</h3>
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span>A step is worth its difficulty&apos;s points, and a candidate earns them in proportion to its review (rating out of 5). Change a number here and every piece of work at that difficulty is re-priced.</span>
        </p>
        <div className="mt-2 grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2">
          {DIFFICULTIES.map((d) => (
            <div key={d}>
              <label className={labelCls} htmlFor={`curve-${d}`}>{d[0].toUpperCase()}{d.slice(1)}</label>
              <input
                id={`curve-${d}`} type="number" min={0} value={curve[d]} disabled={!canManage}
                onChange={(e) => setCurve((prev) => ({ ...prev, [d]: e.target.value }))}
                className={field}
              />
              <p className="mt-1 text-xs text-muted-foreground">{DIFFICULTY_BLURB[d]}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Where selected candidates go</h3>
        <div className="mt-2 rounded-xl border border-border p-4">
          <label className={labelCls} htmlFor="intake">The intake that feeds this round</label>
          <select id="intake" value={cohortId} onChange={(e) => setCohortId(e.target.value)} disabled={!canManage} className={field}>
            <option value="">Not attached — candidates are added by hand</option>
            {(options.data?.cohorts || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Applicants arrive here once their level is confirmed, at that level. One intake feeds one round.
          </p>

          <p className={`${labelCls} mt-4`}>Clans to place into</p>
          <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-border p-3">
            {(options.data?.clans || []).length === 0 ? (
              <p className="text-xs text-muted-foreground">This programme has no clans to place into yet.</p>
            ) : (options.data?.clans || []).map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={targets.includes(c.id)}
                  disabled={!canManage}
                  onChange={(e) => setTargets((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)))}
                  className="rounded border-border text-brand-600 focus:ring-brand-500"
                />
                {c.name}{c.maxMentees ? <span className="text-xs text-muted-foreground">up to {c.maxMentees}</span> : null}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Leave them all unticked to place into any of the programme&apos;s live clans.
          </p>
        </div>
      </section>

      {canManage && (
        <div className="flex justify-end">
          <button onClick={save} disabled={saving} className={primaryBtn}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save the round
          </button>
        </div>
      )}
    </div>
  );
}
