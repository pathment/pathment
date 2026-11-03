'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { groupDiscussionsApi, type DiscussionSchedule } from '@/lib/services/group-discussions-api';
import { announceGroupTasks } from './announceGroupTasks';
import { MenteePicker, type MenteeOption } from './MenteePicker';

const FIELD = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const LABEL = 'mb-1 block text-sm font-medium text-slate-700';

/**
 * Create a group under a scenario. Everybody in the clan starts selected: it is
 * `excluded` that is stored, so that stays true however late the roster loads.
 */
export function NewGroupDrawer({ scenarioId, scenarioTitle, mentees, onClose, onCreated }: {
  scenarioId: string;
  scenarioTitle: string;
  mentees: MenteeOption[];
  onClose: () => void;
  onCreated: () => void | Promise<unknown>;
}) {
  const [name, setName] = useState('');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => new Set(mentees.map((m) => m.id).filter((id) => !excluded.has(id))),
    [mentees, excluded],
  );

  // Both ends are required: every group closes, and its tasks are due then.
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  const dateError = !start || !end
    ? null
    : end <= start ? 'The end must be after the start.'
      : end <= new Date() ? 'The end must be in the future.'
        : null;
  const datesReady = !!start && !!end && !dateError;

  const schedule = (): DiscussionSchedule => ({
    repeat: 'none',
    startsAt: startsAt ? new Date(startsAt).toISOString() : null,
    endsAt: endsAt ? new Date(endsAt).toISOString() : null,
  });

  const submit = async () => {
    setSaving(true);
    try {
      const group = await groupDiscussionsApi.createGroup({
        scenarioId, name: name.trim(), menteeIds: [...selected], schedule: schedule(),
      });
      toast.success('Group discussion created');
      announceGroupTasks(group.tasks);
      await onCreated();
      onClose();
    } catch (error) {
      toast.error((error as { message?: string })?.message || 'Could not create the group');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title="New group discussion"
      subtitle={scenarioTitle}
      footer={(
        <button
          type="button"
          onClick={submit}
          disabled={saving || !name.trim() || selected.size === 0 || !datesReady}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Create with {selected.size} mentee{selected.size === 1 ? '' : 's'}
        </button>
      )}
    >
      <div className="space-y-5">
        <div>
          <label htmlFor="group-name" className={LABEL}>Group name</label>
          <input id="group-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder="e.g. Team Alpha" className={FIELD} />
        </div>

        <div>
          <span className={LABEL}>Mentees</span>
          <MenteePicker
            mentees={mentees}
            selected={selected}
            onChange={(next) => setExcluded(new Set(mentees.map((m) => m.id).filter((id) => !next.has(id))))}
          />
        </div>

        <div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="group-start" className={LABEL}>Starts <span className="text-red-500">*</span></label>
              <input id="group-start" type="datetime-local" required value={startsAt} max={endsAt || undefined} onChange={(e) => setStartsAt(e.target.value)} className={FIELD} />
            </div>
            <div>
              <label htmlFor="group-end" className={LABEL}>Ends <span className="text-red-500">*</span></label>
              <input id="group-end" type="datetime-local" required value={endsAt} min={startsAt || undefined} onChange={(e) => setEndsAt(e.target.value)} className={FIELD} />
            </div>
          </div>
          {dateError ? (
            <p className="mt-1.5 text-xs text-red-600" role="alert">{dateError}</p>
          ) : (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Mentees can post between these times. Each mentee&apos;s task is due the day it ends.
            </p>
          )}
        </div>
      </div>
    </Drawer>
  );
}
