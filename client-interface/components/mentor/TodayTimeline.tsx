'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  CalendarClock, CheckCircle2, CheckSquare, ChevronDown, ChevronRight, ClipboardCheck, Loader2, Lock, Pencil, Plus, X,
} from 'lucide-react';
import { scheduleApi, type PlanBoard, type PlanItem, type PlanSlot } from '@/lib/services/schedule-api';
import { qk, useApiQuery } from '@/lib/query';
import { Drawer } from '@/components/shared/Drawer';
import { DayPlanner } from '@/components/mentee/DayPlanner';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { taskApi } from '@/lib/services/task-api';
import { useConfirm } from '@/lib/context/ConfirmContext';

type Filter = 'all' | 'review' | 'open' | 'done';
/* eslint-disable @typescript-eslint/no-explicit-any */
type Task = any;
type Pending = { taskId: string; submissionId: string };

/**
 * One mentee's day and their work, as one surface on the review screen.
 *
 * The plan used to be a row that opened a drawer, and the work was a separate
 * tabbed list below it — the same tasks twice, once with their time and once
 * with their status. A mentor reviewing a hundred people opened that drawer a
 * hundred times to put the two halves together. Now the work sits inside the
 * blocks of the day it belongs to, with its status and actions on the row, and
 * the drawer is only for reshaping the day itself (new block, lock, reorder).
 *
 * Reads the same board the planner uses, joins it to the review's own task
 * list by id, and keeps anything the board does not place (no plan, finished
 * on another day, outside today's occurrences) in plain groups so nothing the
 * old tabs showed goes missing.
 *
 * Mount it with `key={menteeId}` so each mentee starts on All, nothing
 * hand-expanded.
 */
export function TodayTimeline<P extends Pending>({
  menteeId, menteeName, clanId, readOnly, tasks, completedTasks, tasksLoading,
  pending, renderPending, renderTaskRow, onAssign, reloadKey, onProgress, onChanged,
}: {
  menteeId: string;
  menteeName: string;
  clanId: string | null;
  readOnly: boolean;
  /** Their open + finished work, excluding what waits for review. */
  tasks: Task[];
  completedTasks: Task[];
  tasksLoading: boolean;
  /** Submissions waiting for this mentor. */
  pending: P[];
  renderPending: (item: P, index: number) => ReactNode;
  renderTaskRow: (task: Task) => ReactNode;
  onAssign: () => void;
  /** Changes whenever their work does (the task list itself), so the board follows. */
  reloadKey: unknown;
  /** The day's progress as this card reads it, so the face in the row agrees. */
  onProgress?: (p: { hasPlan: boolean; total: number; done: number }) => void;
  /** After a bulk change, so the review reloads their work. */
  onChanged?: () => unknown;
}) {
  const [planOpen, setPlanOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: board, loading: boardLoading, refetch } = useApiQuery<PlanBoard>({
    queryKey: [...qk.mentee.planStrip(menteeId, clanId), 'board'],
    queryFn: async () => (await scheduleApi.getBoard(menteeId, clanId)).data,
    enabled: !!menteeId,
    // Context for the review, never a reason to replace it with an error.
    errorMessage: '',
  });

  useEffect(() => {
    if (!board) return;
    const all = board.slots.flatMap((sl) => sl.items);
    onProgress?.({ hasPlan: board.slots.length > 0, total: all.length, done: all.filter((i) => i.status === 'completed').length });
  }, [board]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    void refetch();
  }, [reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of [...tasks, ...completedTasks]) m.set(t.id, t);
    return m;
  }, [tasks, completedTasks]);
  const pendingByTask = useMemo(() => new Map(pending.map((p) => [p.taskId, p])), [pending]);

  const slots: PlanSlot[] = useMemo(
    () => [...(board?.slots ?? [])].sort((a, b) => String(a.time).localeCompare(String(b.time))),
    [board],
  );
  const placed = useMemo(() => {
    const s = new Set<string>();
    for (const slot of slots) for (const i of slot.items) s.add(i.id);
    return s;
  }, [slots]);

  const openTasks = useMemo(() => tasks.filter((t) => t.status !== 'completed'), [tasks]);
  const looseOpen = useMemo(() => openTasks.filter((t) => !placed.has(t.id)), [openTasks, placed]);
  const loosePending = useMemo(() => pending.filter((p) => !placed.has(p.taskId)), [pending, placed]);

  const plannedTotal = slots.reduce((n, s) => n + s.items.length, 0);
  const plannedDone = slots.reduce((n, s) => n + s.items.filter((i) => i.status === 'completed').length, 0);
  const pct = plannedTotal ? Math.round((plannedDone / plannedTotal) * 100) : 0;
  const hasPlan = slots.length > 0;
  const first_ = menteeName.split(' ')[0];

  const counts = { all: null, review: pending.length, open: openTasks.length, done: completedTasks.length };

  // ── Selecting several tasks at once ──────────────────────────────────────
  // Only open, mentor-given work can be picked: a submission waits for its
  // review, finished work is history, and their own to-dos are theirs.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const selectable = useMemo(
    () => (readOnly ? [] : openTasks.filter((t) => t.status !== 'cancelled' && !t.selfAssigned)),
    [openTasks, readOnly],
  );
  const selectableIds = useMemo(() => new Set(selectable.map((t) => t.id)), [selectable]);
  // What is picked AND still pickable (a task can finish or vanish under us).
  const chosen = useMemo(() => [...picked].filter((id) => selectableIds.has(id)), [picked, selectableIds]);
  const allChosen = selectable.length > 0 && chosen.length === selectable.length;
  const pick = (id: string) => setPicked((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()); };

  /** A task row, with a tick box in front of it while selecting. */
  const taskRow = (t: Task, className?: string) => {
    if (!selecting || !selectableIds.has(t.id)) return <div key={t.id} className={className}>{renderTaskRow(t)}</div>;
    const on = picked.has(t.id);
    return (
      <div key={t.id} className={`flex items-center gap-2 ${className ?? ''}`}>
        <input
          type="checkbox" checked={on} onChange={() => pick(t.id)}
          aria-label={`Select ${t.roadmapTask?.title || t.title || 'task'}`}
          className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-brand-600"
        />
        <div className={`min-w-0 flex-1 rounded-xl transition-shadow ${on ? 'ring-2 ring-brand-500' : ''}`}>{renderTaskRow(t)}</div>
      </div>
    );
  };

  /** One item of a block, as the richest row we have for it. */
  const renderItem = (item: PlanItem, index: number) => {
    const p = pendingByTask.get(item.id);
    if (p) return filter === 'open' || filter === 'done' ? null : <div key={item.id}>{renderPending(p, index)}</div>;
    if (filter === 'review') return null;
    const t = byId.get(item.id);
    const done = item.status === 'completed';
    if (filter === 'open' && done) return null;
    if (filter === 'done' && !done) return null;
    if (t) return taskRow(t, done ? 'opacity-70' : undefined);
    // A plan item the review list does not carry (a personal to-do, or work
    // from another clan): a quiet row, enough to talk about it.
    return (
      <div key={item.id} className="flex items-center gap-2.5 rounded-xl border border-dashed border-slate-200 px-3 py-2.5 dark:border-slate-700">
        {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <span className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-300" />}
        <span className={`min-w-0 flex-1 truncate text-sm ${done ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-200'}`}>{item.title}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{item.kind === 'personal' ? 'Their own to-do' : 'Plan item'}</span>
      </div>
    );
  };

  const toggle = (id: string) => setExpanded((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const loading = tasksLoading || (boardLoading && !board);

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-card dark:border-slate-800" aria-label={`${first_}’s day and work`}>
        {/* Header: the day at a glance, the filters, and the two ways to change it. */}
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <CalendarClock className="h-4 w-4 text-brand-600" aria-hidden /> Today
            </h3>
            {hasPlan && (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <span className="block h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${pct}%` }} />
                </span>
                <span className="tabular-nums">{plannedDone} of {plannedTotal} done</span>
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
              {selectable.length > 0 && (
                <button type="button" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
                  aria-pressed={selecting}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ${selecting
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-brand-700 dark:text-slate-300 dark:hover:bg-white/5'}`}
                  title="Pick several tasks to move, re-date, cancel or remove together">
                  <CheckSquare className="h-3.5 w-3.5" />{selecting ? 'Done' : 'Select'}
                </button>
              )}
              {!readOnly && (
                <button type="button" onClick={() => setPlanOpen(true)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-brand-700 dark:text-slate-300 dark:hover:bg-white/5"
                  title="Make, retime or lock blocks">
                  <Pencil className="h-3.5 w-3.5" />{hasPlan ? 'Edit day' : 'Plan day'}
                </button>
              )}
              <button type="button" onClick={onAssign} disabled={readOnly}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50 dark:hover:bg-brand-500/10">
                <Plus className="h-3.5 w-3.5" />Assign
              </button>
            </div>
          </div>
          <div role="tablist" aria-label="Show" className="mt-2.5 flex flex-wrap gap-1.5">
            {([
              { key: 'all', label: 'All' },
              { key: 'review', label: 'To review' },
              { key: 'open', label: 'Open' },
              { key: 'done', label: 'Completed' },
            ] as { key: Filter; label: string }[]).map((f) => {
              const active = filter === f.key;
              const n = counts[f.key];
              return (
                <button key={f.key} type="button" role="tab" aria-selected={active} onClick={() => setFilter(f.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'}`}>
                  {f.label}
                  {n != null && n > 0 && (
                    <span className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                      active ? 'bg-white/20 text-white'
                        : f.key === 'review' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {selecting && (
            <BulkBar
              count={chosen.length}
              total={selectable.length}
              allChosen={allChosen}
              onToggleAll={() => setPicked(allChosen ? new Set() : new Set(selectable.map((t) => t.id)))}
              ids={chosen}
              titleOf={(id) => { const t = byId.get(id); return t?.roadmapTask?.title || t?.title || 'Task'; }}
              slots={slots}
              clanId={clanId}
              menteeFirst={first_}
              onDone={async () => { stopSelecting(); await onChanged?.(); void refetch(); }}
              onClose={stopSelecting}
            />
          )}
        </div>

        <div className="space-y-4 p-4">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-brand-600" /></div>
          ) : filter === 'done' && !hasPlan ? (
            completedTasks.length
              ? <div className="space-y-1.5">{completedTasks.map((t) => taskRow(t, 'opacity-80'))}</div>
              : <Empty>Nothing finished in this clan yet.</Empty>
          ) : (
            <>
              {/* Waiting for review and not tied to a block: first, it is the job. */}
              {filter !== 'open' && filter !== 'done' && loosePending.length > 0 && (
                <Group title="Waiting for your review" icon={<ClipboardCheck className="h-3.5 w-3.5 text-brand-600" />}>
                  {loosePending.map((p, i) => <div key={p.submissionId}>{renderPending(p, i)}</div>)}
                </Group>
              )}

              {filter === 'review' && pending.length === 0 && (
                <Empty><CheckCircle2 className="h-4 w-4 text-emerald-400" />Nothing waiting. All clear.</Empty>
              )}

              {/* The day, block by block. */}
              {slots.map((slot) => {
                const rows = slot.items.map(renderItem).filter(Boolean);
                const total = slot.items.length;
                const done = slot.items.filter((i) => i.status === 'completed').length;
                const finished = total > 0 && done === total;
                // In a filtered view a block with nothing to show steps aside.
                if (filter !== 'all' && rows.length === 0) return null;
                // A finished block folds to one line unless asked for.
                const collapsed = filter === 'all' && finished && !expanded.has(slot.id);
                return (
                  <div key={slot.id}>
                    <BlockHeader
                      slot={slot} done={done} total={total} finished={finished}
                      collapsible={finished && filter === 'all'} collapsed={collapsed} onToggle={() => toggle(slot.id)}
                    />
                    {!collapsed && (
                      <div className="mt-1.5 space-y-1.5 border-l-2 border-slate-100 pl-3 dark:border-slate-800">
                        {rows.length ? rows : filter === 'all' && (
                          <p className="py-1 text-xs text-muted-foreground">Nothing in this block today.</p>
                        )}
                        {filter === 'all' && !readOnly && slot.rights?.canAddItems && (
                          <InlineAdd menteeId={menteeId} slotId={slot.id} clanId={clanId} onAdded={() => void refetch()} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Work the day does not place. */}
              {(filter === 'all' || filter === 'open') && looseOpen.length > 0 && (
                <Group title={hasPlan ? 'Not in a block' : 'Their work'}>
                  {looseOpen.map((t) => taskRow(t))}
                </Group>
              )}

              {filter === 'done' && (() => {
                const earlier = completedTasks.filter((t) => !placed.has(t.id));
                return earlier.length > 0 && (
                  <Group title={hasPlan ? 'Finished before today' : 'Finished'}>
                    {earlier.map((t) => taskRow(t, 'opacity-80'))}
                  </Group>
                );
              })()}

              {filter === 'open' && openTasks.length === 0 && (
                <Empty>Nothing on {first_}&rsquo;s plate — use Assign to give them their next task.</Empty>
              )}

              {/* No plan: say so, and make fixing it one click. */}
              {!hasPlan && filter === 'all' && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 dark:border-slate-700">
                  <CalendarClock className="h-4 w-4 shrink-0 text-slate-400" />
                  <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {first_} has no plan for today{openTasks.length ? ', so their work is not placed in the day.' : '.'}
                  </p>
                  {!readOnly && (
                    <button type="button" onClick={() => setPlanOpen(true)}
                      className="shrink-0 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700">
                      Set up their day
                    </button>
                  )}
                </div>
              )}

              {filter === 'all' && hasPlan && completedTasks.some((t) => !placed.has(t.id)) && (
                <button type="button" onClick={() => setFilter('done')}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-brand-700 hover:underline">
                  {completedTasks.filter((t) => !placed.has(t.id)).length} finished before today
                </button>
              )}
            </>
          )}
        </div>
      </section>

      <Drawer
        open={planOpen}
        onClose={() => { setPlanOpen(false); void refetch(); }}
        width="lg"
        title={`${menteeName}’s day`}
        subtitle="Make a block, retime one, or lock it so it stays put"
      >
        {planOpen && <DayPlanner menteeId={menteeId} menteeName={menteeName} clanId={clanId} onChanged={() => void refetch()} />}
      </Drawer>
    </>
  );
}

function BlockHeader({ slot, done, total, finished, collapsible, collapsed, onToggle }: {
  slot: PlanSlot; done: number; total: number; finished: boolean;
  collapsible: boolean; collapsed: boolean; onToggle: () => void;
}) {
  const body = (
    <>
      <span className="w-11 shrink-0 font-mono text-xs tabular-nums text-slate-500">{slot.time}</span>
      <span className="min-w-0 truncate text-sm font-medium text-slate-900 dark:text-slate-100">{slot.label}</span>
      {slot.locked && <Lock className="h-3 w-3 shrink-0 text-slate-400" aria-label="Locked" />}
      <span className={`ml-auto shrink-0 font-mono text-xs tabular-nums ${
        finished ? 'text-emerald-600' : total && !done ? 'text-amber-600' : 'text-slate-500'}`}>
        {total === 0 ? '—' : finished ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{done}/{total}</span> : `${done}/${total}`}
      </span>
      {collapsible && (collapsed
        ? <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />)}
    </>
  );
  return collapsible ? (
    <button type="button" onClick={onToggle} aria-expanded={!collapsed}
      className="flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-slate-50 dark:hover:bg-white/5">{body}</button>
  ) : <div className="flex items-center gap-2 px-1 py-0.5">{body}</div>;
}

function Group({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{icon}{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="flex items-center gap-2 px-1 py-2 text-sm text-slate-500">{children}</p>;
}

/** Runs one call per task, a few at a time, and says how many worked. */
async function eachTask(ids: string[], call: (id: string) => Promise<unknown>) {
  let ok = 0;
  const errors: string[] = [];
  const queue = [...ids];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try { await call(id); ok += 1; } catch (e) { errors.push(extractApiErrorMessage(e, 'failed')); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
  return { ok, failed: errors.length, firstError: errors[0] };
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/**
 * The actions for the picked tasks. Each goes through the same per-task
 * endpoint the row's own buttons use, so the rules (who may, which statuses)
 * stay the server's, and a task that refuses is counted, never hidden.
 */
function BulkBar({ count, total, allChosen, onToggleAll, ids, titleOf, slots, clanId, menteeFirst, onDone, onClose }: {
  count: number; total: number; allChosen: boolean; onToggleAll: () => void;
  ids: string[]; titleOf: (id: string) => string;
  slots: PlanSlot[]; clanId: string | null; menteeFirst: string;
  onDone: () => Promise<void>; onClose: () => void;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [date, setDate] = useState('');
  const none = count === 0;

  const run = async (key: string, verb: string, call: (id: string) => Promise<unknown>) => {
    setBusy(key);
    try {
      const { ok, failed, firstError } = await eachTask(ids, call);
      if (ok) toast.success(`${verb} ${plural(ok, 'task')}`);
      if (failed) toast.error(`${plural(failed, 'task')} could not be changed${firstError ? `: ${firstError}` : ''}`);
      await onDone();
    } finally { setBusy(null); setDateOpen(false); setDate(''); }
  };

  const names = () => {
    const list = ids.slice(0, 5).map((id) => `• ${titleOf(id)}`).join('\n');
    return ids.length > 5 ? `${list}\n…and ${ids.length - 5} more` : list;
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${plural(count, 'task')} from ${menteeFirst}?`,
      description: `${names()}\n\nThey come off ${menteeFirst}’s list for good. To keep a record instead, cancel them.`,
      variant: 'danger', confirmLabel: `Remove ${plural(count, 'task')}`, cancelLabel: 'Keep them',
    });
    if (ok) await run('remove', 'Removed', (id) => taskApi.unassignTask(id));
  };
  const cancel = async () => {
    const ok = await confirm({
      title: `Cancel ${plural(count, 'task')}?`,
      description: `${names()}\n\nThey stay in ${menteeFirst}’s history as cancelled, and you can reassign them later.`,
      variant: 'danger', confirmLabel: `Cancel ${plural(count, 'task')}`, cancelLabel: 'Keep them',
    });
    if (ok) await run('cancel', 'Cancelled', (id) => taskApi.cancelTask(id, 'Cancelled from clan review'));
  };

  const btn = 'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-40';
  const quiet = `${btn} border border-slate-200 bg-card text-slate-700 dark:border-slate-700 dark:text-slate-200`;

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2 dark:border-brand-500/30 dark:bg-brand-500/10">
      <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={allChosen} onChange={onToggleAll}
          ref={(el) => { if (el) el.indeterminate = !allChosen && count > 0; }}
          className="h-4 w-4 rounded border-slate-300 accent-brand-600" />
        {none ? `Select all ${total} open` : `${count} of ${total} selected`}
      </label>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {slots.length > 0 && (
          <select
            aria-label="Move the selected tasks to a block"
            disabled={none || !!busy}
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              const slotId = v === '__none' ? null : v;
              const label = slotId ? slots.find((x) => x.id === slotId)?.label ?? 'the block' : 'out of the day';
              void run('move', slotId ? `Moved to ${label}:` : 'Took out of the day:', (id) => scheduleApi.movePlanItem(id, slotId, clanId));
            }}
            className="rounded-lg border border-slate-200 bg-card px-2 py-1.5 text-xs text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
          >
            <option value="">{busy === 'move' ? 'Moving…' : 'Move to block…'}</option>
            {slots.map((sl) => <option key={sl.id} value={sl.id}>{sl.time} · {sl.label}</option>)}
            <option value="__none">Take out of the day</option>
          </select>
        )}

        {dateOpen ? (
          <form className="inline-flex items-center gap-1"
            onSubmit={(e) => { e.preventDefault(); if (date) void run('date', 'New deadline for', (id) => taskApi.updateTaskDueDate(id, date)); }}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus aria-label="New deadline"
              className="rounded-lg border border-slate-200 bg-card px-2 py-1 text-xs dark:border-slate-700" />
            <button type="submit" disabled={!date || !!busy} className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}>
              {busy === 'date' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Set'}
            </button>
            <button type="button" onClick={() => { setDateOpen(false); setDate(''); }} className="px-1 text-xs text-muted-foreground hover:text-slate-700">Back</button>
          </form>
        ) : (
          <button type="button" disabled={none || !!busy} onClick={() => setDateOpen(true)}
            className={`${quiet} hover:border-brand-300 hover:text-brand-700`}>
            <CalendarClock className="h-3.5 w-3.5" />Deadline
          </button>
        )}

        <button type="button" disabled={none || !!busy} onClick={cancel} className={`${quiet} hover:border-amber-300 hover:text-amber-700`}>
          {busy === 'cancel' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Cancel tasks
        </button>
        <button type="button" disabled={none || !!busy} onClick={remove} className={`${btn} bg-rose-600 text-white hover:bg-rose-700`}>
          {busy === 'remove' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Remove
        </button>
        <button type="button" onClick={onClose} aria-label="Stop selecting" title="Stop selecting"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-white/10">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Add one item straight into a block, without leaving the review. */
function InlineAdd({ menteeId, slotId, clanId, onAdded }: { menteeId: string; slotId: string; clanId: string | null; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const title = text.trim();
    if (!title) return;
    setSaving(true);
    try {
      await scheduleApi.addPlanItem(menteeId, slotId, { title, kind: 'review', clanId });
      setText('');
      onAdded();
      toast.success('Added to their day');
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not add that'));
    } finally { setSaving(false); }
  };
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-muted-foreground hover:bg-slate-50 hover:text-brand-700 dark:hover:bg-white/5">
        <Plus className="h-3.5 w-3.5" />Add for them
      </button>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex items-center gap-2">
      <input
        autoFocus value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); setText(''); } }}
        placeholder="What should they do in this block?"
        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-transparent px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-slate-700"
      />
      <button type="submit" disabled={saving || !text.trim()}
        className="shrink-0 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
      </button>
      <button type="button" onClick={() => { setOpen(false); setText(''); }} className="shrink-0 px-1 text-xs text-muted-foreground hover:text-slate-700">Cancel</button>
    </form>
  );
}
