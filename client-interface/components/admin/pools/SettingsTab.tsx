'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { BellRing, Info, Loader2, Save, Scale, SlidersHorizontal, UsersRound, Workflow } from 'lucide-react';
import { useApiQuery, qk } from '@/lib/query';
import { EntityAvatarEditor } from '@/components/shared/EntityAvatarEditor';
import { poolApi, type DifficultyPoints, type PoolDashboard } from '@/lib/services/pool-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { DIFFICULTIES, DIFFICULTY_BLURB, DIFFICULTY_POINTS_FALLBACK, PanelHeader, field, fromLocalInput, label, panel, primaryBtn, toLocalInput } from './poolUi';

const body = 'space-y-4 border-t border-border p-5 sm:px-6';
const footer = 'flex flex-wrap items-center justify-end gap-3 border-t border-border bg-muted/40 px-5 py-3 sm:px-6';
const check = 'flex items-start gap-2.5 rounded-xl border border-border px-3 py-2.5 text-sm text-slate-700 has-checked:border-brand-300 has-checked:bg-brand-50/50';


export function SettingsTab({ data, onChange, canManage }: { data: PoolDashboard; onChange: () => void; canManage: boolean }) {
  const { pool } = data;
  const locked = !canManage || pool.status === 'closed';
  const { data: options } = useApiQuery({ queryKey: ['pools', 'options', pool.programId], queryFn: () => poolApi.options(pool.programId) });

  const [basics, setBasics] = useState({
    name: pool.name, description: pool.description || '', selectionQuota: String(pool.selectionQuota), capacity: pool.capacity ? String(pool.capacity) : '',
    opensAt: toLocalInput(pool.opensAt), closesAt: toLocalInput(pool.closesAt), qualificationDueAt: toLocalInput(pool.qualificationDueAt),
  });
  const [curve, setCurve] = useState<DifficultyPoints>({
    ...DIFFICULTY_POINTS_FALLBACK,
    ...(pool.scoringPolicy?.difficultyPoints || {}),
  });
  const [photo, setPhoto] = useState<string | null>(pool.avatarUrl ?? null);
  const [reminders, setReminders] = useState(pool.reminderPolicy);
  const [settings, setSettings] = useState(pool.settings);
  const [saving, setSaving] = useState<string | null>(null);

  const save = async (section: string, body: Record<string, unknown>) => {
    setSaving(section);
    try {
      await poolApi.update(pool.id, body);
      toast.success('Saved');
      onChange();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save'));
    } finally {
      setSaving(null);
    }
  };
  const SaveBtn = ({ section, onClick, disabled = false }: { section: string; onClick: () => void; disabled?: boolean }) => (
    locked ? null : (
      <button onClick={onClick} disabled={disabled || saving === section} className={primaryBtn}>
        {saving === section ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
      </button>
    )
  );

  return (
    <div className="space-y-6">
      {locked && (
        <p className="flex items-center gap-2 rounded-2xl border border-border bg-muted/60 px-4 py-3 text-sm text-slate-600">
          <Info className="h-4 w-4 shrink-0" /> {pool.status === 'closed' ? 'This pool is closed, so its settings are read-only.' : 'You can view these settings, but only pool managers can change them.'}
        </p>
      )}
      <section className={panel}>
        <PanelHeader icon={UsersRound} title="The pool" subtitle="Name, size and the dates of the round." />
        <div className={body}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={label}>Name</label><input disabled={locked} value={basics.name} onChange={(e) => setBasics({ ...basics, name: e.target.value })} className={field} /></div>
          <div className="sm:col-span-2"><label className={label}>Description</label><textarea disabled={locked} rows={2} value={basics.description} onChange={(e) => setBasics({ ...basics, description: e.target.value })} className={field} /></div>
          <div><label className={label}>Select how many</label><input disabled={locked} type="number" min={1} value={basics.selectionQuota} onChange={(e) => setBasics({ ...basics, selectionQuota: e.target.value })} className={field} /></div>
          <div><label className={label}>Capacity</label><input disabled={locked} type="number" min={1} placeholder="No limit" value={basics.capacity} onChange={(e) => setBasics({ ...basics, capacity: e.target.value })} className={field} /></div>
          <div><label className={label}>Opens</label><input disabled={locked} type="datetime-local" value={basics.opensAt} onChange={(e) => setBasics({ ...basics, opensAt: e.target.value })} className={field} /></div>
          <div><label className={label}>Closes</label><input disabled={locked} type="datetime-local" value={basics.closesAt} onChange={(e) => setBasics({ ...basics, closesAt: e.target.value })} className={field} /></div>
          <div><label className={label}>Qualification deadline</label><input disabled={locked} type="datetime-local" value={basics.qualificationDueAt} onChange={(e) => setBasics({ ...basics, qualificationDueAt: e.target.value })} className={field} /></div>
        </div>
        {/*
          * The photo saves on its own, as a clan's does — an upload is not a
          * draft, so it does not wait behind the Save button for the fields.
          */}
        {canManage && pool.status !== 'closed' && (
          <EntityAvatarEditor
            basePath={`/pools/${pool.id}`}
            name={pool.name}
            avatarUrl={photo}
            label="Pool photo"
            fileName="pool-avatar.jpg"
            invalidateKeys={[qk.pool.all, ['candidate', 'pools']]}
            onChanged={(url) => { setPhoto(url); onChange(); }}
          />
        )}
        </div>
        {!locked && <div className={footer}>
          <SaveBtn section="basics" onClick={() => save('basics', {
            name: basics.name, description: basics.description || null,
            selectionQuota: Number(basics.selectionQuota), capacity: basics.capacity ? Number(basics.capacity) : null,
            opensAt: fromLocalInput(basics.opensAt), closesAt: fromLocalInput(basics.closesAt), qualificationDueAt: fromLocalInput(basics.qualificationDueAt),
          })} />
        </div>}
      </section>

      <section className={panel}>
        <PanelHeader
          icon={Scale}
          title="What work is worth"
          subtitle="A piece of work earns points, and a candidate's score is the points they earned. These are the defaults a new piece of work takes from its difficulty, and you can change any one of them when you add it."
        />
        <div className={body}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {DIFFICULTIES.map((d) => (
              <div key={d} className="rounded-xl border border-border p-3">
                <label className={`${label} capitalize`} htmlFor={`pool-points-${d}`}>{d}</label>
                <div className="flex items-center gap-2">
                  <input
                    id={`pool-points-${d}`}
                    disabled={locked}
                    type="number"
                    min={0}
                    max={1000}
                    value={curve[d]}
                    onChange={(e) => setCurve({ ...curve, [d]: Math.max(0, Number(e.target.value) || 0) })}
                    className={field}
                  />
                  <span className="shrink-0 text-sm text-muted-foreground">pts</span>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{DIFFICULTY_BLURB[d]}</p>
              </div>
            ))}
          </div>
          <p className="rounded-xl bg-muted/60 px-4 py-3 text-xs text-slate-600">
            A review&apos;s rating decides how much of a piece of work is earned: five stars earns all of its points,
            three earns three fifths. Work that is never approved earns nothing. There are no weights to add up,
            a score is the points on the work itself.
          </p>
        </div>
        {!locked && <div className={footer}>
          <SaveBtn
            section="scoring"
            disabled={!Object.values(curve).some((n) => n > 0)}
            onClick={() => save('scoring', { scoringPolicy: { difficultyPoints: curve } })}
          />
        </div>}
      </section>

      <section className={panel}>
        <PanelHeader icon={BellRing} title="Reminders" subtitle="In-app and email. They stop by themselves once the work is handed in, the candidate leaves or is decided, or the pool closes." />
        <div className={body}>
        <label className={`${check} w-fit`}><input disabled={locked} type="checkbox" checked={reminders.enabled} onChange={(e) => setReminders({ ...reminders, enabled: e.target.checked })} /> Send reminders</label>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className={label}>Resend an unaccepted invitation every (days)</label><input disabled={locked} type="number" min={0} value={reminders.inviteAfterDays} onChange={(e) => setReminders({ ...reminders, inviteAfterDays: Number(e.target.value) })} className={field} /></div>
          <div><label className={label}>…at most (times)</label><input disabled={locked} type="number" min={0} value={reminders.inviteMaxCount} onChange={(e) => setReminders({ ...reminders, inviteMaxCount: Number(e.target.value) })} className={field} /></div>
          <div><label className={label}>Remind before a due date (hours)</label><input disabled={locked} type="number" min={0} value={reminders.dueSoonHours} onChange={(e) => setReminders({ ...reminders, dueSoonHours: Number(e.target.value) })} className={field} /></div>
          <div><label className={label}>Nudge after no activity for (days)</label><input disabled={locked} type="number" min={0} value={reminders.inactivityDays} onChange={(e) => setReminders({ ...reminders, inactivityDays: Number(e.target.value) })} className={field} /></div>
          <div><label className={label}>…at most (times)</label><input disabled={locked} type="number" min={0} value={reminders.inactivityMaxCount} onChange={(e) => setReminders({ ...reminders, inactivityMaxCount: Number(e.target.value) })} className={field} /></div>
        </div>
        </div>
        {!locked && <div className={footer}><SaveBtn section="reminders" onClick={() => save('reminders', { reminderPolicy: reminders })} /></div>}
      </section>

      <section className={panel}>
        <PanelHeader icon={Workflow} title="Automation" subtitle="Run the round by itself: applicants come in, Edorax progress selects them, and you place them with one click." />
        <div className={body}>
          <div>
            <label className={label}>Add applicants automatically from these intakes <span className="font-normal text-slate-400">(everyone who has applied joins now, and everyone who applies later)</span></label>
            <div className="flex flex-wrap gap-2">
              {(options?.cohorts || []).map((c) => {
                const ids = settings.autoAddFromCohortIds || [];
                const on = ids.includes(c.id);
                return (
                  <button key={c.id} disabled={locked} onClick={() => setSettings({ ...settings, autoAddFromCohortIds: on ? ids.filter((x) => x !== c.id) : [...ids, c.id] })}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${on ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-border text-slate-600 hover:bg-muted'}`}>
                    {c.name}
                  </button>
                );
              })}
              {!(options?.cohorts || []).length && <span className="text-sm text-slate-500">This programme has no intakes yet.</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className={`${check} w-fit`}>
              <input disabled={locked} type="checkbox" className="mt-0.5" checked={settings.autoSelectAtProgress != null}
                onChange={(e) => setSettings({ ...settings, autoSelectAtProgress: e.target.checked ? 80 : null })} />
              Select candidates automatically when their Edorax progress reaches
            </label>
            <div className="flex items-center gap-1.5">
              <input disabled={locked || settings.autoSelectAtProgress == null} type="number" min={1} max={100}
                value={settings.autoSelectAtProgress ?? 80} aria-label="Auto-select threshold (%)"
                onChange={(e) => setSettings({ ...settings, autoSelectAtProgress: e.target.value === '' ? null : Number(e.target.value) })}
                className={`${field} w-20`} />
              <span className="text-sm text-slate-500">%</span>
            </div>
          </div>
          <p className="text-xs text-slate-500">Progress is read from Edorax every 15 minutes. Selected candidates and the pool&apos;s admins are notified, and each one gets a clan suggestion on the Selection tab. You can still change any decision.</p>
        </div>
        {!locked && <div className={footer}><SaveBtn section="automation" onClick={() => save('automation', { settings })} /></div>}
      </section>

      <section className={panel}>
        <PanelHeader icon={SlidersHorizontal} title="Options" subtitle="How work is handed out, the waitlist, and where selected candidates go." />
        <div className={body}>
        <label className={`${check} w-fit`}><input disabled={locked} type="checkbox" className="mt-0.5" checked={settings.autoAssignOnActivation} onChange={(e) => setSettings({ ...settings, autoAssignOnActivation: e.target.checked })} /> Give the pool&apos;s work to candidates automatically when they activate</label>
        <div className="max-w-xs">
          <label className={label}>Waitlist size</label>
          <input disabled={locked} type="number" min={0} placeholder={`Same as quota (${pool.selectionQuota})`} value={settings.waitlistSize ?? ''} onChange={(e) => setSettings({ ...settings, waitlistSize: e.target.value === '' ? null : Number(e.target.value) })} className={field} />
        </div>
        <div>
          <label className={label}>Place into these clans <span className="font-normal text-slate-400">(none chosen = every open clan in the programme)</span></label>
          <div className="flex flex-wrap gap-2">
            {(options?.clans || []).map((c) => {
              const on = settings.targetClanIds.includes(c.id);
              return (
                <button key={c.id} disabled={locked} onClick={() => setSettings({ ...settings, targetClanIds: on ? settings.targetClanIds.filter((x) => x !== c.id) : [...settings.targetClanIds, c.id] })}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${on ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-border text-slate-600 hover:bg-muted'}`}>
                  {c.name}
                </button>
              );
            })}
            {!(options?.clans || []).length && <span className="text-sm text-slate-500">This programme has no clans yet.</span>}
          </div>
        </div>
        </div>
        {!locked && <div className={footer}><SaveBtn section="settings" onClick={() => save('settings', { settings })} /></div>}
      </section>
    </div>
  );
}
