import { useMemo, useState } from 'react';
import {
  Sunrise,
  Sun,
  Moon,
  Clock,
  Check,
  CheckCircle2,
  Circle,
  CalendarDays,
  PenLine,
  Layers,
} from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { Card, Badge, Button, SectionLabel, cx, TASK_TYPE_LABEL } from '@/lib/ui';
import { Field, TextArea } from '@/components/overlays';
import { useStore } from '@/store/AppStore';
import { slotLabel } from '@/lib/ai';
import type { ScheduleSlot } from '@/lib/types';

/* slots are dynamic now — pick an icon by position (sunrise → midday → evening
   → flexible, then cycle). */
const SLOT_ICONS = [Sunrise, Sun, Moon, Clock];
const iconFor = (i: number) => SLOT_ICONS[i % SLOT_ICONS.length];

/* Build the last N day options (today first) for the picker, so a mentee can
   log today or backfill a missed day in one tap. */
function recentDays(n: number) {
  const out: { label: string; key: string; short: string }[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const short = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'short' });
    out.push({ label, key, short });
  }
  return out;
}

export function DailyLog() {
  const { currentMenteeId, getMentee, getSchedule, getDailyLogs, saveDailyLog } = useStore();
  const me = getMentee(currentMenteeId)!;
  const schedule = getSchedule(me.id);
  const logs = getDailyLogs(me.id);

  const days = useMemo(() => recentDays(10), []);
  const [activeKey, setActiveKey] = useState(days[0].key);
  const activeDay = days.find((d) => d.key === activeKey)!;
  const existing = logs.find((l) => l.dateKey === activeKey);

  // tasks the mentee can tick for the day — their open/active assigned tasks
  const dayTasks = useMemo(
    () => me.tasks.filter((t) => t.status !== 'rejected'),
    [me.tasks],
  );

  // working state for the day being edited (seeded from any existing log)
  const [slotsDone, setSlotsDone] = useState<Set<ScheduleSlot>>(new Set(existing?.slotsDone ?? []));
  const [tasksDone, setTasksDone] = useState<Set<number>>(new Set(existing?.tasksDone ?? []));
  const [note, setNote] = useState(existing?.note ?? '');
  const [itemNotes, setItemNotes] = useState<Record<string, string>>(existing?.itemNotes ?? {});
  // re-seed when the selected day changes
  const [seededKey, setSeededKey] = useState(activeKey);
  if (seededKey !== activeKey) {
    setSeededKey(activeKey);
    setSlotsDone(new Set(existing?.slotsDone ?? []));
    setTasksDone(new Set(existing?.tasksDone ?? []));
    setNote(existing?.note ?? '');
    setItemNotes(existing?.itemNotes ?? {});
  }
  const setItemNote = (key: string, v: string) => setItemNotes((p) => ({ ...p, [key]: v }));

  const toggleSlot = (s: ScheduleSlot) =>
    setSlotsDone((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  const toggleTask = (id: number) =>
    setTasksDone((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const save = () => {
    // keep only notes for items actually ticked
    const keptNotes: Record<string, string> = {};
    [...slotsDone].forEach((s) => itemNotes[s]?.trim() && (keptNotes[s] = itemNotes[s].trim()));
    [...tasksDone].forEach((id) => itemNotes[`t${id}`]?.trim() && (keptNotes[`t${id}`] = itemNotes[`t${id}`].trim()));
    saveDailyLog(me.id, {
      date: activeDay.label,
      dateKey: activeKey,
      slotsDone: [...slotsDone],
      tasksDone: [...tasksDone],
      itemNotes: Object.keys(keptNotes).length ? keptNotes : undefined,
      note: note.trim() || undefined,
    });
  };

  const isBackfill = activeKey !== days[0].key;
  const scheduledSlots = schedule.filter((s) => s.kind !== 'empty');

  return (
    <Page>
      <PageHeader
        title="Daily log"
        subtitle="Tick off your day, jot a note, and backfill anything you missed"
      />

      {/* DAY PICKER — today + backfill */}
      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        {days.map((d) => {
          const logged = logs.some((l) => l.dateKey === d.key);
          const active = d.key === activeKey;
          return (
            <button
              key={d.key}
              onClick={() => setActiveKey(d.key)}
              className={cx(
                'rounded-r flex shrink-0 flex-col items-center gap-0.5 border px-3 py-2 text-center transition-colors',
                active ? 'border-ink bg-ink text-white' : 'border-hairline hover:border-ink',
              )}
            >
              <span className="text-[11px] font-medium">{d.short}</span>
              <span className={cx('font-mono text-[10px] tnum', active ? 'text-white/60' : 'text-ink-faint')}>
                {d.label.split(', ')[1] ?? d.label}
              </span>
              {logged ? (
                <Check className={cx('h-3 w-3', active ? 'text-emerald-300' : 'text-emerald-600')} />
              ) : (
                <Circle className={cx('h-3 w-3', active ? 'text-white/30' : 'text-ink-faint')} />
              )}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* LOG FORM */}
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <SectionLabel>{isBackfill ? `Logging · ${activeDay.label}` : 'Today'}</SectionLabel>
              {isBackfill && <Badge tone="amber">Backfilling a missed day</Badge>}
              {existing && <Badge tone="emerald">Already logged · editing</Badge>}
            </div>

            {/* schedule slots (the talks) */}
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
              <CalendarDays className="h-3 w-3" /> Your schedule
            </div>
            <div className="space-y-1.5">
              {scheduledSlots.map((cfg, i) => {
                const Icon = iconFor(i);
                const slot = cfg.id;
                const label = cfg.kind === 'recurring' ? cfg.recurring?.title ?? cfg.label : cfg.label;
                const on = slotsDone.has(slot);
                return (
                  <div
                    key={slot}
                    className={cx(
                      'rounded-r border transition-colors',
                      on ? 'border-emerald-300 bg-emerald-50/50' : 'border-hairline',
                    )}
                  >
                    <button onClick={() => toggleSlot(slot)} className="flex w-full items-center gap-3 p-3 text-left">
                      {on ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                      ) : (
                        <Circle className="h-5 w-5 shrink-0 text-ink-faint" />
                      )}
                      <Icon className="h-4 w-4 shrink-0 text-ink-mute" />
                      <span className="min-w-0 flex-1">
                        <span className={cx('block truncate text-sm', on ? 'font-medium text-ink' : 'text-ink-soft')}>
                          {label}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                          {cfg.label}{cfg.time ? ` · ${cfg.time}` : ''}
                        </span>
                      </span>
                    </button>
                    {on && (
                      <input
                        value={itemNotes[slot] ?? ''}
                        onChange={(e) => setItemNote(slot, e.target.value)}
                        placeholder={`What did you do for the ${(label ?? '').toLowerCase()}?`}
                        className="w-full border-t border-emerald-200 bg-transparent px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* assigned tasks */}
            {dayTasks.length > 0 && (
              <>
                <div className="mb-2 mt-4 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                  <Layers className="h-3 w-3" /> Tasks
                </div>
                <div className="space-y-1.5">
                  {dayTasks.map((t) => {
                    const on = tasksDone.has(t.id);
                    const key = `t${t.id}`;
                    return (
                      <div
                        key={t.id}
                        className={cx(
                          'rounded-r border transition-colors',
                          on ? 'border-emerald-300 bg-emerald-50/50' : 'border-hairline',
                        )}
                      >
                        <button onClick={() => toggleTask(t.id)} className="flex w-full items-center gap-3 p-3 text-left">
                          {on ? (
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                          ) : (
                            <Circle className="h-5 w-5 shrink-0 text-ink-faint" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className={cx('block truncate text-sm', on ? 'font-medium text-ink' : 'text-ink-soft')}>
                              {t.title}
                            </span>
                            <span className="text-xs text-ink-mute">
                              {TASK_TYPE_LABEL[t.type]}
                              {t.track && <> · {t.track}</>}
                            </span>
                          </span>
                        </button>
                        {on && (
                          <input
                            value={itemNotes[key] ?? ''}
                            onChange={(e) => setItemNote(key, e.target.value)}
                            placeholder="What did you complete on this?"
                            className="w-full border-t border-emerald-200 bg-transparent px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* quick note */}
            <div className="mt-4">
              <Field label="Quick note for the day">
                <TextArea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="How did the day go? Anything worth remembering?"
                />
              </Field>
            </div>

            <Button className="mt-4 w-full" onClick={save}>
              <PenLine className="h-4 w-4" /> {existing ? 'Update log' : isBackfill ? 'Log this day' : 'Log today'}
            </Button>
          </Card>
        </div>

        {/* COMBINED TIMELINE — what was done on each day */}
        <div className="lg:col-span-1">
          <SectionLabel>Your week, day by day</SectionLabel>
          {logs.length === 0 ? (
            <Card className="py-8 text-center text-sm text-ink-mute">
              Nothing logged yet — tick off today and it&apos;ll show here.
            </Card>
          ) : (
            <div className="space-y-3">
              {logs.map((l) => (
                <Card key={l.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">{l.date}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                      {l.loggedAt}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {l.slotsDone.map((s) => (
                      <Badge key={s} tone="emerald">
                        {slotLabel(s, schedule)}
                      </Badge>
                    ))}
                    {l.tasksDone.map((tid) => {
                      const t = me.tasks.find((x) => x.id === tid);
                      return t ? (
                        <Badge key={tid} tone="brand">
                          {t.title.length > 22 ? `${t.title.slice(0, 22)}…` : t.title}
                        </Badge>
                      ) : null;
                    })}
                    {l.slotsDone.length === 0 && l.tasksDone.length === 0 && (
                      <span className="text-xs text-ink-faint">Note-only</span>
                    )}
                  </div>
                  {l.note && <p className="mt-2 text-xs leading-relaxed text-ink-mute">{l.note}</p>}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
