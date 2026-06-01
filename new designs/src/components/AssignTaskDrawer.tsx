import { useState, useMemo } from 'react';
import { CheckCircle2, Library, Plus, Trash2, Users, Pencil, Sunrise, Sun, Moon, Clock } from 'lucide-react';
import { Drawer, Field, TextInput, TextArea, Segmented } from './overlays';
import { Avatar, Badge, Button, cx, TASK_TYPE_LABEL } from '@/lib/ui';
import { TASK_TYPE_PRESETS, DUE_PRESETS, EFFORT_META } from '@/lib/ai';
import { useStore } from '@/store/AppStore';
import type { TaskType, Effort, ScheduleSlot, Recurrence } from '@/lib/types';

const TYPES: TaskType[] = ['project', 'assignment', 'quiz', 'reading', 'video', 'discussion'];
const EFFORTS: Effort[] = ['xs', 's', 'm', 'l'];

const SLOTS: { value: ScheduleSlot; label: string; icon: typeof Sun }[] = [
  { value: 'anytime', label: 'Anytime', icon: Clock },
  { value: 'morning', label: 'Morning', icon: Sunrise },
  { value: 'lunch', label: 'Lunch', icon: Sun },
  { value: 'dinner', label: 'Dinner', icon: Moon },
];
const RECURRENCES: { value: Recurrence; label: string }[] = [
  { value: 'once', label: 'One-off' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

/* The fast Assign Task flow (§5). Two modes: inline-create | from-library.
   Picking a type auto-fills checklist + effort. A "multiple mentees" toggle
   turns it into bulk-assign with per-person due dates. No wizard. */
export function AssignTaskDrawer({
  open,
  onClose,
  menteeId,
}: {
  open: boolean;
  onClose: () => void;
  menteeId?: number; // when omitted, multi-select is forced on
}) {
  const { mentees, assignTask, bulkAssignTask, templates, saveTaskTemplate } = useStore();

  const [mode, setMode] = useState<'create' | 'library'>('create');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('project');
  const [brief, setBrief] = useState('');
  const [due, setDue] = useState('+3 days');
  const [effort, setEffort] = useState<Effort>('l');
  const [criteria, setCriteria] = useState<string[]>(TASK_TYPE_PRESETS.project.criteria);
  const [slot, setSlot] = useState<ScheduleSlot>('anytime');
  const [recurrence, setRecurrence] = useState<Recurrence>('once');
  const [bulk, setBulk] = useState(menteeId === undefined);
  const [targets, setTargets] = useState<Set<number>>(new Set(menteeId ? [menteeId] : []));
  const [perDue, setPerDue] = useState<Record<number, string>>({});
  const [done, setDone] = useState(false);

  const pickType = (t: TaskType) => {
    setType(t);
    setEffort(TASK_TYPE_PRESETS[t].effort);
    setCriteria(TASK_TYPE_PRESETS[t].criteria);
  };

  const reset = () => {
    setMode('create');
    setTitle('');
    setType('project');
    setBrief('');
    setDue('+3 days');
    setEffort('l');
    setCriteria(TASK_TYPE_PRESETS.project.criteria);
    setSlot('anytime');
    setRecurrence('once');
    setBulk(menteeId === undefined);
    setTargets(new Set(menteeId ? [menteeId] : []));
    setPerDue({});
    setDone(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const canSubmit = title.trim() && (bulk ? targets.size > 0 : !!menteeId);

  const submit = () => {
    const input = {
      title: title.trim(),
      type,
      brief: brief.trim() || undefined,
      due: recurrence === 'daily' ? 'Daily' : recurrence === 'weekly' ? 'Weekly' : due,
      effort,
      criteria,
      slot: slot === 'anytime' ? undefined : slot,
      recurrence: recurrence === 'once' ? undefined : recurrence,
    };
    if (bulk || menteeId === undefined) {
      bulkAssignTask(
        [...targets].map((id) => ({ menteeId: id, due: perDue[id] ?? due })),
        input,
      );
    } else {
      assignTask(menteeId, input);
    }
    setDone(true);
  };

  const toggleTarget = (id: number) =>
    setTargets((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const owner = menteeId ? mentees.find((m) => m.id === menteeId) : undefined;
  const filteredLib = useMemo(() => templates.tasks, [templates.tasks]);

  return (
    <Drawer
      open={open}
      onClose={close}
      width="max-w-xl"
      title="Assign task"
      subtitle={owner ? `to ${owner.name}` : 'to one or more mentees'}
      footer={
        !done ? (
          <div className="flex items-center justify-between">
            <button
              onClick={() => saveTaskTemplate({ title: title.trim() || 'Untitled', type, brief, due, effort, criteria })}
              disabled={!title.trim()}
              className="inline-flex items-center gap-1 text-xs text-ink-mute hover:text-ink disabled:opacity-40"
            >
              <Library className="h-3.5 w-3.5" /> Save to library
            </button>
            <Button onClick={submit} disabled={!canSubmit}>
              <Plus className="h-4 w-4" />
              {bulk ? `Assign to ${targets.size || 0}` : 'Assign'}
            </Button>
          </div>
        ) : undefined
      }
    >
      {done ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-12 w-12 place-items-center border border-emerald-200 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-medium text-ink">Task assigned.</p>
          <p className="mt-1 text-xs text-ink-mute">
            {bulk ? `${targets.size} mentees notified.` : `${owner?.name.split(' ')[0]} has a new task.`}
          </p>
          <Button className="mt-4" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* mode */}
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'create', label: 'Create' },
              { value: 'library', label: 'From library' },
            ]}
          />

          {mode === 'library' ? (
            <div className="space-y-2">
              {filteredLib.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => {
                    setTitle(tpl.title);
                    pickType(tpl.type);
                    setBrief(tpl.brief ?? '');
                    if (tpl.defaultEffort) setEffort(tpl.defaultEffort);
                    setCriteria(tpl.criteria);
                    setMode('create');
                  }}
                  className="rounded-r flex w-full items-center gap-3 border border-hairline p-3 text-left transition-colors hover:border-ink"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center border border-hairline">
                    <Pencil className="h-3.5 w-3.5 text-ink-mute" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{tpl.title}</span>
                    <span className="block text-xs text-ink-mute">
                      {TASK_TYPE_LABEL[tpl.type]} · {tpl.criteria.length} checks
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <Field label="Title">
                <TextInput
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Build a REST API"
                  autoFocus
                />
              </Field>

              <Field label="Type">
                <div className="flex flex-wrap gap-1.5">
                  {TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => pickType(t)}
                      className={cx(
                        'rounded-r border px-2.5 py-1 text-xs font-medium transition-colors',
                        type === t ? 'border-ink bg-ink text-white' : 'border-hairline text-ink-mute hover:border-ink',
                      )}
                    >
                      {TASK_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Brief">
                <TextArea rows={2} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="What should they build / do?" />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Due">
                  <div className="flex flex-wrap gap-1.5">
                    {DUE_PRESETS.map((d) => (
                      <button
                        key={d.label}
                        onClick={() => setDue(d.label)}
                        className={cx(
                          'rounded-r border px-2 py-1 text-xs transition-colors',
                          due === d.label ? 'border-ink bg-ink text-white' : 'border-hairline text-ink-mute hover:border-ink',
                        )}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Effort">
                  <div className="flex gap-1.5">
                    {EFFORTS.map((e) => (
                      <button
                        key={e}
                        onClick={() => setEffort(e)}
                        title={EFFORT_META[e].hint}
                        className={cx(
                          'rounded-r border px-2.5 py-1 font-mono text-xs transition-colors',
                          effort === e ? 'border-ink bg-ink text-white' : 'border-hairline text-ink-mute hover:border-ink',
                        )}
                      >
                        {EFFORT_META[e].label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              {/* schedule — slot + recurrence (mindset talk, morning reading…) */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Schedule slot">
                  <div className="flex flex-wrap gap-1.5">
                    {SLOTS.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => setSlot(s.value)}
                        className={cx(
                          'rounded-r inline-flex items-center gap-1 border px-2 py-1 text-xs transition-colors',
                          slot === s.value ? 'border-ink bg-ink text-white' : 'border-hairline text-ink-mute hover:border-ink',
                        )}
                      >
                        <s.icon className="h-3 w-3" />
                        {s.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Repeats" hint="Recurring tasks like a daily talk or morning reading.">
                  <div className="flex gap-1.5">
                    {RECURRENCES.map((r) => (
                      <button
                        key={r.value}
                        onClick={() => setRecurrence(r.value)}
                        className={cx(
                          'rounded-r border px-2.5 py-1 text-xs transition-colors',
                          recurrence === r.value ? 'border-ink bg-ink text-white' : 'border-hairline text-ink-mute hover:border-ink',
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              {/* approval checklist editor */}
              <Field label="Approval criteria">
                <div className="space-y-1.5">
                  {criteria.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <TextInput
                        value={c}
                        onChange={(e) => setCriteria(criteria.map((x, idx) => (idx === i ? e.target.value : x)))}
                        className="text-xs"
                      />
                      <button
                        onClick={() => setCriteria(criteria.filter((_, idx) => idx !== i))}
                        className="text-ink-faint hover:text-[#FF3B30]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setCriteria([...criteria, ''])}
                    className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                  >
                    <Plus className="h-3 w-3" /> Add check
                  </button>
                </div>
              </Field>
            </>
          )}

          {/* targets */}
          <div className="border-t border-hairline pt-4">
            <button
              onClick={() => setBulk((b) => !b)}
              disabled={menteeId === undefined}
              className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-ink disabled:opacity-100"
            >
              <Users className="h-4 w-4 text-ink-mute" />
              {bulk ? 'Assigning to multiple' : 'Assign to multiple'}
              {menteeId !== undefined && (
                <span className={cx('relative h-5 w-9 rounded-full transition-colors', bulk ? 'bg-ink' : 'bg-neutral-300')}>
                  <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', bulk ? 'left-[18px]' : 'left-0.5')} />
                </span>
              )}
            </button>

            {bulk && (
              <div className="space-y-1.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-ink-mute">{targets.size} selected</span>
                  <button
                    onClick={() => setTargets(targets.size === mentees.length ? new Set() : new Set(mentees.map((m) => m.id)))}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    {targets.size === mentees.length ? 'Clear all' : 'Select all'}
                  </button>
                </div>
                {mentees.map((m) => {
                  const on = targets.has(m.id);
                  return (
                    <div key={m.id} className={cx('flex items-center gap-2.5 rounded-r border p-2 transition-colors', on ? 'border-ink' : 'border-hairline')}>
                      <input type="checkbox" checked={on} onChange={() => toggleTarget(m.id)} className="h-4 w-4 accent-brand-500" />
                      <Avatar initials={m.avatar} name={m.name} size="xs" />
                      <span className="flex-1 truncate text-sm text-ink">{m.name}</span>
                      {on && (
                        <input
                          value={perDue[m.id] ?? due}
                          onChange={(e) => setPerDue({ ...perDue, [m.id]: e.target.value })}
                          className="rounded-r w-24 border border-hairline px-2 py-1 text-xs text-ink focus:border-brand-400"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!bulk && owner && (
              <div className="flex items-center gap-2 text-sm text-ink-mute">
                <Avatar initials={owner.avatar} name={owner.name} size="xs" />
                {owner.name}
                <Badge tone="neutral">{owner.level}</Badge>
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
