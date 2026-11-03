'use client';

import { CalendarDays, Check, Repeat, X } from 'lucide-react';
import { Dropdown } from '@/components/shared/Dropdown';
import type { TaskScheduleDraft } from './TaskScheduleFields';

/**
 * When a task is due, and whether it comes back — two menus, the way a to-do
 * list does it.
 *
 * Assigning used to ask the timing question twice. A three-way segmented
 * control ("Assign now · Schedule once · Repeat weekly") decided which KIND of
 * assignment it was and, underneath it, a separate "Due" block with its own
 * presets and date input decided the deadline — but only in one of the three
 * modes, so half the form appeared and disappeared as you clicked around it.
 * The mode was a question about the system; the mentor's question is "when is
 * this due, and does it happen again".
 *
 * So: a task is a one-off, assigned now, unless you say otherwise. One icon
 * sets the deadline, the other sets the repeat, and a line underneath says in
 * words what the two of them currently mean. There is no reminder icon — the
 * product already notifies, and a third control for it would be a setting
 * nobody asked for.
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAYS = [1, 2, 3, 4, 5];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/** 'YYYY-MM-DD' in the viewer's zone — an ISO instant is a day off west of UTC. */
export const dayKey = (d: Date) => d.toLocaleDateString('en-CA');
export const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
/** The coming Monday — what "next week" means when you are planning work. */
const comingMonday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d;
};
const sameDays = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

export const niceDate = (key: string) => {
  if (!key) return '';
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  if (key === dayKey(new Date())) return 'today';
  if (key === dayKey(inDays(1))) return 'tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

export interface TaskDueDraft {
  /** Days from now. Ignored when `exact` is set. */
  days: number;
  /** An explicit 'YYYY-MM-DD'. Wins over `days`. */
  exact: string;
}

/** How a repeat reads in a sentence. */
export function describeRepeat(schedule: TaskScheduleDraft): string {
  if (schedule.mode !== 'weekly' || !schedule.daysOfWeek.length) return '';
  if (sameDays(schedule.daysOfWeek, EVERY_DAY)) return 'every day';
  if (sameDays(schedule.daysOfWeek, WEEKDAYS)) return 'every weekday';
  if (schedule.daysOfWeek.length === 1) return `every ${DAY_NAMES[schedule.daysOfWeek[0]]}`;
  return `${schedule.daysOfWeek.map((d) => DAY_NAMES[d].slice(0, 3)).join(', ')} each week`;
}

const item = (on: boolean) =>
  `flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
    on ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
      : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`;

const trigger = (label: string, active: boolean) =>
  `inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300'
      : 'border-border text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:text-slate-300'}`
  + ` ${label}`;

export function TaskTimingRow({
  due,
  onDueChange,
  schedule,
  onScheduleChange,
  repeat = true,
  minDate,
  dueUnset = false,
  assigning = true,
}: {
  due: TaskDueDraft;
  onDueChange: (next: TaskDueDraft) => void;
  schedule: TaskScheduleDraft;
  onScheduleChange: (next: TaskScheduleDraft) => void;
  /** Hide the repeat menu where repeating is not on offer (e.g. a task already submitted). */
  repeat?: boolean;
  /** Earliest pickable date. Defaults to today; pass '' to allow a date in the past. */
  minDate?: string;
  /** The task has no deadline at all, and none has been chosen yet. */
  dueUnset?: boolean;
  /** Assigning now (the default) vs editing something already handed over. */
  assigning?: boolean;
}) {
  const repeating = schedule.mode === 'weekly' && schedule.daysOfWeek.length > 0;
  const dueLabel = due.exact ? niceDate(due.exact) : `in ${due.days} day${due.days === 1 ? '' : 's'}`;
  const repeatLabel = repeating ? describeRepeat(schedule) : 'Does not repeat';

  const setDays = (days: number) => onDueChange({ days, exact: '' });
  const setExact = (exact: string) => onDueChange({ ...due, exact });

  const setRepeat = (daysOfWeek: number[]) => onScheduleChange({
    ...schedule,
    mode: daysOfWeek.length ? 'weekly' : 'now',
    daysOfWeek,
    // A repeat starts from the first matching day on or after today, which is
    // what the server's materializer already does with `startsOn`.
    startsOn: schedule.startsOn || dayKey(new Date()),
    // The deadline of each occurrence follows the same answer the due menu
    // gave, so the two controls cannot disagree.
    dueOffsetDays: due.exact ? schedule.dueOffsetDays : Math.max(1, due.days),
  });

  const toggleDay = (index: number) => {
    const next = schedule.daysOfWeek.includes(index)
      ? schedule.daysOfWeek.filter((d) => d !== index)
      : [...schedule.daysOfWeek, index].sort((a, b) => a - b);
    setRepeat(next);
  };

  return (
    <section aria-label="Task timing" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Due date */}
        <Dropdown
          width="w-64"
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} className={trigger('', !dueUnset)} aria-label={dueUnset ? 'Set a deadline' : `Due ${dueLabel}`}>
              <CalendarDays className="h-4 w-4" aria-hidden />
              <span>{dueUnset ? 'Set a deadline' : `Due ${dueLabel}`}</span>
            </button>
          )}
        >
          {(close) => (
            <div className="p-1.5">
              <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Due</p>
              {[
                { label: 'Today', days: 0 },
                { label: 'Tomorrow', days: 1 },
                { label: 'In 3 days', days: 3 },
                { label: 'In a week', days: 7 },
                { label: 'In two weeks', days: 14 },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => { setDays(option.days); close(); }}
                  className={item(!due.exact && due.days === option.days)}
                >
                  {option.label}
                  {!due.exact && due.days === option.days && <Check className="h-4 w-4" aria-hidden />}
                </button>
              ))}
              <label className="mt-1 block border-t border-border px-3 pb-1.5 pt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                Pick a date
                <input
                  type="date"
                  value={due.exact}
                  min={minDate ?? dayKey(new Date())}
                  onChange={(e) => setExact(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </label>
            </div>
          )}
        </Dropdown>

        {/* Repeat */}
        {repeat && (<Dropdown
          width="w-64"
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} className={trigger('', repeating)} aria-label={repeating ? `Repeats ${repeatLabel}` : 'Does not repeat'}>
              <Repeat className="h-4 w-4" aria-hidden />
              <span>{repeating ? `Repeats ${repeatLabel}` : 'Repeat'}</span>
            </button>
          )}
        >
          {(close) => (
            <div className="p-1.5">
              <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Repeat</p>
              {[
                { label: 'Does not repeat', days: [] as number[] },
                { label: 'Daily', days: EVERY_DAY },
                { label: 'Every weekday', days: WEEKDAYS },
                { label: `Weekly on ${DAY_NAMES[new Date().getDay()]}`, days: [new Date().getDay()] },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => { setRepeat(option.days); close(); }}
                  className={item(
                    option.days.length
                      ? repeating && sameDays(schedule.daysOfWeek, option.days)
                      : !repeating,
                  )}
                >
                  {option.label}
                  {(option.days.length ? repeating && sameDays(schedule.daysOfWeek, option.days) : !repeating) && (
                    <Check className="h-4 w-4" aria-hidden />
                  )}
                </button>
              ))}
              <div className="mt-1 border-t border-border px-3 pb-1.5 pt-2">
                <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">Or pick the days</p>
                <div className="flex flex-wrap gap-1">
                  {DAY_INITIALS.map((initial, index) => {
                    const on = repeating && schedule.daysOfWeek.includes(index);
                    return (
                      <button
                        key={DAY_NAMES[index]}
                        type="button"
                        aria-pressed={on}
                        aria-label={DAY_NAMES[index]}
                        title={DAY_NAMES[index]}
                        onClick={() => toggleDay(index)}
                        className={`h-8 w-8 rounded-full text-xs font-semibold transition-colors ${
                          on ? 'bg-brand-600 text-white'
                            : 'border border-border bg-card text-muted-foreground hover:border-brand-300'}`}
                      >
                        {initial}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Dropdown>)}

        {repeat && repeating && (
          <button
            type="button"
            onClick={() => setRepeat([])}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" aria-hidden />Stop repeating
          </button>
        )}
      </div>

      {/* The two controls, read back as one sentence. A mentor should not have
          to hold the combination in their head. Editing an existing task, the
          buttons already say it, so the sentence only appears when it adds
          something the buttons do not. */}
      {(() => {
        const line = repeat && repeating
          ? assigning
            ? `Assigned ${describeRepeat(schedule)}, each one due ${schedule.dueOffsetDays} day${schedule.dueOffsetDays === 1 ? '' : 's'} later.`
            : `Future assignments ${describeRepeat(schedule)}, each one due ${schedule.dueOffsetDays} day${schedule.dueOffsetDays === 1 ? '' : 's'} later. This one keeps the deadline above.`
          : dueUnset
            ? 'No deadline yet — pick one, or leave it open.'
            : assigning
              ? `Assigned now, due ${dueLabel}.`
              : '';
        return line ? <p className="text-xs text-muted-foreground">{line}</p> : null;
      })()}
    </section>
  );
}

export default TaskTimingRow;
