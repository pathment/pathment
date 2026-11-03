'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarClock, Check, ChevronDown, EyeOff, LayoutTemplate, Loader2, Lock, MoreHorizontal,
  Plus, Repeat, Route, Settings2, Trash2, Unlock,
} from 'lucide-react';

import {
  scheduleApi,
  type ChainRoadmapDetail, type PlanBoard, type PlanItem, type PlanSlot,
  type RepeatRule, type SelectableTemplate,
} from '@/lib/services/schedule-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { Dropdown } from '@/components/shared/Dropdown';
import { TaskDrawer } from '@/components/mentee/TaskDrawer';
import { SubmitTaskDrawer, type SubmitTaskTarget } from '@/components/mentee/SubmitTaskDrawer';
import { TaskDrawerById } from '@/components/mentor/TaskDrawerById';
import { AssignTaskDrawer } from '@/components/mentor/AssignTaskDrawer';
import { taskApi } from '@/lib/services/task-api';

/**
 * A day as blocks you can put things in.
 *
 * Built around how few actions it takes to use, because a planner people have
 * to fight is a planner they stop opening:
 *
 *   add an item   type in the block and press Enter — the field is always
 *                 there, so it is one action, not "click +, fill a modal, save"
 *   move an item  drag it, or pick it up with the keyboard and drop it in
 *   finish it     one click on the box
 *
 * Nothing here asks "are you sure". Every action is reversible, and a
 * confirmation on a reversible action is just a second click.
 *
 * One component serves the mentee and the mentor. The server decides what each
 * of them may do and sends it down per block as `rights`, so this never has to
 * guess from a role — and the two views cannot drift apart, because there is
 * only one.
 */
export function DayPlanner({
  menteeId = 'me',
  menteeName,
  clanId = null,
  onChanged,
}: {
  /** 'me' for a mentee's own day; a real id when a mentor is planning with them. */
  menteeId?: string;
  /** Only needed on the mentor's side, for the assign drawer. */
  menteeName?: string;
  clanId?: string | null;
  onChanged?: () => void;
}) {
  const [board, setBoard] = useState<PlanBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [addingBlock, setAddingBlock] = useState(false);
  const [templates, setTemplates] = useState<SelectableTemplate[] | null>(null);
  const [pickingTemplate, setPickingTemplate] = useState(false);
  /**
   * The item being read, in a drawer over the plan.
   *
   * A block used to be a list of titles you could tick and nothing else — the
   * brief, the acceptance criteria and the mentor's feedback all lived a page
   * away, and clicking an item did nothing at all. Both sides open the drawer
   * they already have elsewhere, so a task reads and reviews identically
   * wherever it is met.
   */
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [submitTarget, setSubmitTarget] = useState<SubmitTaskTarget | null>(null);
  /**
   * The block a mentor is assigning a full task into.
   *
   * Typing a title in a block makes a one-line custom task, which is right for
   * "read chapter 3" and useless for real work — no brief, no criteria, no
   * points, no type. The proper assign drawer is the same one used everywhere
   * else; opening it from a block just means the task is stamped with that
   * block as it is created, instead of being assigned and then dragged.
   */
  const [assignInto, setAssignInto] = useState<{ id: string; label: string } | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await scheduleApi.getBoard(menteeId, clanId);
      setBoard(res.data ?? null);
      setError(null);
    } catch (e) {
      setError(extractApiErrorMessage(e, 'Could not load this plan'));
    } finally {
      setLoading(false);
    }
  }, [menteeId, clanId]);

  useEffect(() => { void load(); }, [load]);

  // What this workspace offers a mentee to choose from. Quiet on failure: a
  // missing list just means no button, never an error on their day.
  useEffect(() => {
    let live = true;
    scheduleApi.listSelectableTemplates(menteeId, clanId)
      .then((r) => { if (live) setTemplates(r.data?.templates ?? []); })
      .catch(() => { if (live) setTemplates([]); });
    return () => { live = false; };
  }, [menteeId, clanId]);

  const mark = (id: string, on: boolean) => setBusy((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  /**
   * Run a change, show the result immediately, and put it back if the server
   * disagrees. The optimistic copy is what makes ticking feel like ticking
   * rather than like submitting a form.
   */
  const optimistic = async (id: string, apply: (b: PlanBoard) => PlanBoard, call: () => Promise<unknown>) => {
    const before = board;
    if (before) setBoard(apply(before));
    mark(id, true);
    try {
      await call();
      await load(true);
      onChanged?.();
    } catch (e) {
      if (before) setBoard(before);
      toast.error(extractApiErrorMessage(e, 'That did not save'));
    } finally {
      mark(id, false);
    }
  };

  const moveItem = (taskId: string, toSlot: string | null) => {
    setDropTarget(null);
    void optimistic(taskId, (b) => {
      let moved: PlanItem | undefined;
      const slots = b.slots.map((s) => {
        const found = s.items.find((i) => i.id === taskId);
        if (found) moved = found;
        return { ...s, items: s.items.filter((i) => i.id !== taskId) };
      });
      const fromTray = b.unplanned.find((i) => i.id === taskId);
      if (fromTray) moved = fromTray;
      const unplanned = b.unplanned.filter((i) => i.id !== taskId);
      if (!moved) return b;
      if (toSlot === null) return { ...b, slots, unplanned: [...unplanned, moved] };
      return {
        ...b, unplanned,
        slots: slots.map((s) => (s.id === toSlot ? { ...s, items: [...s.items, moved as PlanItem] } : s)),
      };
    }, () => scheduleApi.movePlanItem(taskId, toSlot, clanId));
  };

  const toggleDone = (item: PlanItem) => {
    if (item.kind === 'review') {
      /**
       * Work that goes to a mentor cannot be finished by a checkbox — it has
       * to go through a submission, which is where the feedback and the
       * points come from. But ticking it already SAYS something, and both
       * sides mean it: a mentee means "I'm done with this", a mentor means
       * "let me look at this". So the tick opens the thing that does it.
       *
       * This used to answer with a toast telling you where to go and do it
       * yourself — a dead end on the one gesture everybody tries first.
       */
      setOpenTaskId(item.id);
      return;
    }
    const done = item.status !== 'completed';
    void optimistic(item.id, (b) => ({
      ...b,
      slots: b.slots.map((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === item.id ? { ...i, status: done ? 'completed' : 'assigned' } : i)),
        done: s.items.filter((i) => (i.id === item.id ? done : i.status === 'completed')).length,
      })),
    }), async () => {
      const res = await scheduleApi.setPlanItemDone(item.id, done, clanId);
      // A repeating item reappears dated forward; say so, or finishing one
      // looks like it simply came back.
      const next = res.data?.nextOccurrence;
      if (next) {
        toast.success('Done — back again on ' + new Date(`${next}T00:00:00`).toLocaleDateString(undefined, {
          weekday: 'short', day: 'numeric', month: 'short',
        }));
      }
      return res;
    });
  };

  /**
   * The presets people actually choose, named the way they say them.
   *
   * A full recurrence editor is a form; this is four options and "doesn't
   * repeat", which covers nearly every real case and costs one click. Anything
   * more elaborate can come later without changing the rule that is stored.
   */
  const setRepeat = (item: PlanItem, repeat: Partial<RepeatRule> | null) =>
    optimistic(item.id, (b) => b, () => scheduleApi.setPlanItemRepeat(item.id, repeat, clanId));

  const addItem = async (
    slotId: string,
    title: string,
    opts: { dueDate?: string | null; repeat?: Partial<RepeatRule> | null } = {},
  ) => {
    const text = title.trim();
    if (!text) return;
    mark(slotId, true);
    try {
      /**
       * What gets created depends on who is typing.
       *
       * This always sent `personal`, so a mentor adding "Ship the auth PR" to a
       * mentee's block created a tick-box the mentee could close themselves —
       * no submission, no review, no points. A mentor setting work means work,
       * and a mentee adding to their own day means a personal item. The server
       * refuses a mentee who asks for `review`, so this is a default, not a
       * permission.
       */
      const kind = mine ? 'personal' : 'review';
      await scheduleApi.addPlanItem(menteeId, slotId, {
        title: text, kind, clanId, dueDate: opts.dueDate ?? null, repeat: opts.repeat ?? null,
      });
      await load(true);
      onChanged?.();
      /**
       * Say what was actually created, because the two differ in a way that
       * matters: a mentor's item has to be submitted and reviewed, a mentee's
       * finishes on a tick. Naming the repeat here is the only confirmation
       * that it took.
       */
      const repeatWord = opts.repeat ? REPEAT_PRESETS.find(
        (r) => r.rule.freq === opts.repeat?.freq
          && JSON.stringify(r.rule.days ?? null) === JSON.stringify(opts.repeat?.days ?? null),
      )?.label.toLowerCase() : null;
      toast.success(mine
        ? `Added${repeatWord ? `, ${repeatWord}` : ''}`
        : `Set for review${repeatWord ? `, ${repeatWord}` : ''}`);
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not add that'));
    } finally {
      mark(slotId, false);
    }
  };

  /**
   * Whose day this is, from the server rather than from a prop.
   *
   * Every piece of copy below turns on it. The planner used to be written
   * entirely in the mentee's voice and handed unchanged to mentors, who were
   * shown "From your mentor" on blocks they had set themselves.
   */
  const mine = board?.viewer.isOwnerMentee ?? true;

  /** Every block, as somewhere an item can be sent. */
  const blockChoices = useMemo(
    () => (board?.slots ?? []).map((s) => ({ id: s.id, label: s.label, time: s.time })),
    [board],
  );

  const totals = useMemo(() => {
    const all = (board?.slots ?? []).flatMap((s) => s.items);
    return { total: all.length, done: all.filter((i) => i.status === 'completed').length };
  }, [board]);

  if (loading) {
    return (
      <div className="flex justify-center py-12" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-label="Loading plan" />
      </div>
    );
  }
  if (error || !board) {
    return <p className="py-8 text-sm text-muted-foreground">{error || 'No plan to show.'}</p>;
  }

  const pct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/*
        It has to say what it is.
        
        This opened as a bare "Today" above three empty boxes, dropped into the
        middle of the mentee's dashboard with nothing to explain it — so the
        first thing a mentee met was three identical prompts and no idea what
        they were for. The heading names the thing, and the line under it says
        what to do, which is the only job an empty state has.
      */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-card px-4 py-3 dark:border-slate-800">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <CalendarClock className="h-4 w-4 text-brand-600" aria-hidden />
            {mine ? 'Your day' : 'Their day'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {/*
                The empty state names the next action on THIS screen, and when
                there is work sitting unplanned it says so — "nothing in their
                blocks yet" was true and useless while two tasks waited just
                below it for someone to give them a time.
            */}
            {totals.total > 0
              ? `${totals.done} of ${totals.total} done today`
              : board.unplanned.length > 0
                ? `${board.unplanned.length} ${board.unplanned.length === 1 ? 'thing is' : 'things are'} waiting for a block — put ${board.unplanned.length === 1 ? 'it' : 'them'} in one below.`
                : (mine
                  ? 'Blocks are the shape of your day. Type in one and press Enter to put work there.'
                  : 'Nothing in their blocks yet. Type in a block to set work there.')}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
        </div>
      </div>

      <ul className="space-y-3">
        {board.slots.map((slot) => (
          <SlotCard
            key={slot.id}
            slot={slot}
            busy={busy.has(slot.id)}
            isDropTarget={dropTarget === slot.id}
            onDropTarget={setDropTarget}
            onDropItem={(taskId) => moveItem(taskId, slot.id)}
            onToggleDone={toggleDone}
            onAddItem={(title, opts) => addItem(slot.id, title, opts)}
            onRetime={(patch) => optimistic(slot.id, (b) => b,
              () => scheduleApi.updatePlanSlot(menteeId, slot.id, { ...patch, clanId }))}
            onRemove={() => optimistic(slot.id, (b) => ({ ...b, slots: b.slots.filter((s) => s.id !== slot.id) }),
              () => scheduleApi.removePlanSlot(menteeId, slot.id, clanId))}
            onHide={() => optimistic(slot.id, (b) => ({ ...b, slots: b.slots.filter((s) => s.id !== slot.id) }),
              () => scheduleApi.hidePlanSlot(menteeId, slot.id, true, clanId))}
            mine={mine}
            blockChoices={blockChoices}
            onMoveTo={moveItem}
            onSetRepeat={setRepeat}
            onOpen={setOpenTaskId}
            onAssignInto={() => setAssignInto({ id: slot.id, label: slot.label })}
            itemBusy={busy}
          />
        ))}
      </ul>

      {board.slots.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-muted-foreground dark:border-slate-700">
          No blocks yet. Add one and your day has somewhere to live.
        </p>
      )}

      {addingBlock ? (
        <NewBlock
          onCancel={() => setAddingBlock(false)}
          onSave={async (label, time) => {
            try {
              await scheduleApi.addPlanSlot(menteeId, { label, time, clanId });
              setAddingBlock(false);
              await load(true);
              onChanged?.();
            } catch (e) {
              toast.error(extractApiErrorMessage(e, 'Could not add that block'));
            }
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAddingBlock(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {board.viewer.isOwnerMentee ? 'Add your own block' : 'Add a block'}
          </button>

          {/* Only shown once we know something is on offer, so a workspace that
              publishes no templates never grows a button that leads nowhere. */}
          {board.viewer.isOwnerMentee && templates !== null && templates.length > 0 && (
            <button
              type="button"
              onClick={() => setPickingTemplate((v) => !v)}
              aria-expanded={pickingTemplate}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300"
            >
              <LayoutTemplate className="h-4 w-4" aria-hidden />
              Start from a template
            </button>
          )}
        </div>
      )}

      {pickingTemplate && templates && templates.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await scheduleApi.applySelectableTemplate(menteeId, t.id, clanId);
                    const added = res.data?.added ?? 0;
                    toast.success(added
                      ? `Added ${added} block${added === 1 ? '' : 's'} to your day`
                      : 'Your day already has those blocks');
                    setPickingTemplate(false);
                    await load(true);
                    onChanged?.();
                  } catch (e) {
                    toast.error(extractApiErrorMessage(e, 'Could not add that template'));
                  }
                }}
                className="w-full rounded-2xl border border-slate-200 bg-card p-3.5 text-left transition-colors hover:border-brand-300 dark:border-slate-800"
              >
                <p className="text-sm font-semibold text-foreground">{t.name}</p>
                {t.description && <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>}
                <p className="mt-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {t.blocks.map((b) => `${b.time} ${b.label}`).join(' · ')}
                </p>
              </button>
            </li>
          ))}
          {/* Says plainly what taking one does, because "apply template" reads
              like it might replace the day. It never does. */}
          <li className="sm:col-span-2 text-[11px] text-muted-foreground">
            Blocks are added to your day. Nothing you or your mentor already set is changed.
          </li>
        </ul>
      )}

      {/* Work that exists but is not on the day yet. Hidden when there is none,
          so the common case shows no extra chrome. */}
      {board.unplanned.length > 0 && (
        <section
          onDragOver={(e) => { e.preventDefault(); setDropTarget('__tray__'); }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) moveItem(id, null); }}
          className={`rounded-2xl border bg-card p-4 transition-colors dark:bg-slate-900/40 ${
            dropTarget === '__tray__' ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          {/*
            This read "NOT ON THE DAY YET · 2" and sat directly above the
            dashboard's own work queue showing the same two tasks, so a mentee
            met the same work twice on one screen with no hint that these two
            lists did different jobs. Saying what to DO with them is what tells
            them apart: the queue is for reading, this is for planning.
          */}
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {mine ? 'Work to plan' : 'Not in a block yet'} · {board.unplanned.length}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {mine
              ? 'Pick a block for each so it has a time in your day. Dragging works too.'
              : 'Pick a block for each so it has a time in their day. Dragging works too.'}
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {board.unplanned.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                busy={busy.has(item.id)}
                onToggleDone={toggleDone}
                blocks={blockChoices}
                currentSlotId={null}
                unplanned
                onMoveTo={(slotId) => moveItem(item.id, slotId)}
                onSetRepeat={(repeat) => setRepeat(item, repeat)}
                onOpen={setOpenTaskId}
                mine={mine}
              />
            ))}
          </ul>
        </section>
      )}

      {/*
          Two drawers, because the two sides are doing different jobs on the
          same object: the mentee reads the brief and submits, the mentor reads
          the submission and decides. Both are the drawers those people already
          use on their own screens — the planner opens them rather than growing
          a third, worse copy.
      */}
      {mine ? (
        <>
          <TaskDrawer
            taskId={openTaskId}
            open={!!openTaskId}
            onClose={() => setOpenTaskId(null)}
            onStart={async (id) => {
              try {
                await taskApi.updateTaskStatus(id, 'in_progress');
                toast.success('Started');
                await load(true);
              } catch (e) {
                toast.error(extractApiErrorMessage(e, 'Could not start that'));
              }
            }}
            onSubmit={(task) => {
              // One drawer at a time: hand off rather than stack a second panel.
              setOpenTaskId(null);
              setSubmitTarget({
                id: task.id,
                title: task.roadmapTask?.title || task.title || 'Task',
                status: task.status,
                deliverable: task.roadmapTask?.deliverable,
                acceptanceCriteria: task.roadmapTask?.acceptanceCriteria || [],
                type: task.roadmapTask?.type || task.type,
                isCustomTask: task.isCustomTask,
              });
            }}
          />
          <SubmitTaskDrawer
            open={!!submitTarget}
            task={submitTarget}
            onClose={() => setSubmitTarget(null)}
            onSubmitted={() => { void load(true); onChanged?.(); }}
          />
        </>
      ) : openTaskId ? (
        <TaskDrawerById
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
          onChanged={() => { void load(true); onChanged?.(); }}
        />
      ) : null}

      {assignInto && (
        <AssignTaskDrawer
          mode="single"
          mentee={{ id: menteeId, name: menteeName || 'this mentee' }}
          scheduleSlotId={assignInto.id}
          slotLabel={assignInto.label}
          onClose={() => setAssignInto(null)}
          onAssigned={() => { setAssignInto(null); void load(true); onChanged?.(); }}
        />
      )}
    </div>
  );
}

/* ── one block ───────────────────────────────────────────────────────────── */

function SlotCard({
  slot, busy, isDropTarget, onDropTarget, onDropItem,
  onToggleDone, onAddItem, onRetime, onRemove, onHide, itemBusy, mine, blockChoices, onMoveTo,
  onSetRepeat, onOpen, onAssignInto,
}: {
  slot: PlanSlot;
  busy: boolean;
  isDropTarget: boolean;
  onDropTarget: (id: string | null) => void;
  onDropItem: (taskId: string) => void;
  onToggleDone: (item: PlanItem) => void;
  onAddItem: (title: string, opts?: { dueDate?: string | null; repeat?: Partial<RepeatRule> | null }) => void;
  onRetime: (patch: { time?: string; label?: string; locked?: boolean }) => void;
  onRemove: () => void;
  onHide: () => void;
  itemBusy: Set<string>;
  /** True when the viewer IS the mentee. Decides whose voice the block speaks in. */
  mine: boolean;
  blockChoices: { id: string; label: string; time: string }[];
  onMoveTo: (taskId: string, slotId: string | null) => void;
  onSetRepeat: (item: PlanItem, repeat: Partial<RepeatRule> | null) => void;
  onOpen: (taskId: string) => void;
  onAssignInto: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /** What the composer has collected so far, beyond the title. */
  const [due, setDue] = useState<string>('');
  const [repeat, setRepeat] = useState<Partial<RepeatRule> | null>(null);
  const [showDone, setShowDone] = useState(false);

  /** What is still to do, and what has been finished today. */
  const open = slot.items.filter((i) => i.status !== 'completed');
  const finished = slot.items.filter((i) => i.status === 'completed');

  const submitDraft = () => {
    if (!draft.trim()) return;
    onAddItem(draft, { dueDate: due || null, repeat });
    setDraft('');
    setDue('');
    setRepeat(null);
  };

  const ownerChip = slot.owner === 'mentee'
    ? {
      text: mine ? 'Your block' : 'Theirs',
      cls: 'bg-brand-500/10 text-brand-700 dark:text-brand-300',
    }
    : slot.locked
      ? { text: 'Locked', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' }
      : {
        text: mine ? 'From your mentor' : 'You set this',
        cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
      };

  return (
    <li
      onDragOver={(e) => { e.preventDefault(); onDropTarget(slot.id); }}
      onDragLeave={() => onDropTarget(null)}
      onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) onDropItem(id); }}
      className={`rounded-2xl border bg-card transition-colors dark:bg-slate-900/40 ${
        isDropTarget ? 'border-brand-400 bg-brand-50/60 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-start gap-3 px-4 pt-3.5">
        <span className="pt-0.5 font-mono text-[13px] tabular-nums text-foreground">{slot.time}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <input
                defaultValue={slot.label}
                aria-label="Block name"
                autoFocus
                onBlur={(e) => { setEditing(false); if (e.target.value.trim() !== slot.label) onRetime({ label: e.target.value.trim() }); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }}
                className="rounded-lg border border-slate-200 bg-card px-2 py-0.5 text-sm font-semibold dark:border-slate-700"
              />
            ) : (
              <button
                type="button"
                disabled={!slot.rights.canRetime}
                onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                className="text-sm font-semibold text-foreground disabled:cursor-default"
                title={slot.rights.canRetime ? 'Rename this block' : 'Your mentor locked this block'}
              >
                {slot.label}
              </button>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ownerChip.cls}`}>
              {ownerChip.text}
            </span>
            {slot.editedByMentee && slot.owner === 'mentor' && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                Changed
              </span>
            )}
          </div>
          {slot.items.length > 0 && (
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{slot.done} of {slot.items.length} done</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />}
          {/* The same Assign task button as everywhere else — it just already
              knows which block the work is going into. */}
          {!mine && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAssignInto(); }}
              title={`Assign a task into ${slot.label}`}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300"
            >
              <Plus className="h-3 w-3" aria-hidden />Assign task
            </button>
          )}
          {slot.rights.canLock && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRetime({ locked: !slot.locked }); }}
              title={slot.locked ? 'Let them move this block' : 'Lock this block so it cannot be moved'}
              aria-label={slot.locked ? 'Unlock block' : 'Lock block'}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              {slot.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            </button>
          )}
          {slot.rights.canRemove && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              aria-label={`Remove ${slot.label}`}
              title={mine
                ? 'Remove this block — anything in it goes back to your list'
                : 'Remove this block — anything in it goes back to their list'}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {/* A block you were given is not yours to delete — but one bad day is
              not a reason to carry it either. It comes back tomorrow by itself. */}
          {slot.rights.canHide && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onHide(); }}
              aria-label={`Skip ${slot.label} today`}
              title="Skip this one today — it comes back tomorrow"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* A roadmap block is governed by its chain, so the chain is what it has
          to show. Without this it rendered as an empty block with a label,
          which is worse than showing nothing: it looked like work had been
          lost. */}
      {slot.chainDetails && slot.chainDetails.length > 0 && (
        <ul className="mt-2.5 space-y-1.5 px-4">
          {slot.chainDetails.map((chain, i) => (
            <ChainRow key={chain.id || `chain-${i}`} chain={chain} index={i} total={slot.chainDetails!.length} />
          ))}
        </ul>
      )}

      <ul className="mt-2.5 space-y-1.5 px-4">
        {open.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            busy={itemBusy.has(item.id)}
            onToggleDone={onToggleDone}
            blocks={blockChoices}
            currentSlotId={slot.id}
            onMoveTo={(toSlot) => onMoveTo(item.id, toSlot)}
            onSetRepeat={(repeat) => onSetRepeat(item, repeat)}
            onOpen={onOpen}
            mine={mine}
          />
        ))}
      </ul>

      {/*
          Finished work settles to the bottom, folded away.

          It has to stay on the day — a block that empties as you work it makes
          "2 of 3 done" unreachable and the ring never fills. But it has
          stopped being something to do, so it stops sitting among the things
          that are. It drops off by itself tomorrow.
      */}
      {finished.length > 0 && (
        <div className="mt-2 px-4">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="inline-flex items-center gap-1.5 rounded-lg py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showDone ? '' : '-rotate-90'}`} aria-hidden />
            Done · {finished.length}
          </button>
          {showDone && (
            <ul className="mt-1.5 space-y-1.5 opacity-70">
              {finished.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  busy={itemBusy.has(item.id)}
                  onToggleDone={onToggleDone}
                  blocks={blockChoices}
                  currentSlotId={slot.id}
                  onMoveTo={(toSlot) => onMoveTo(item.id, toSlot)}
                  onSetRepeat={(repeat) => onSetRepeat(item, repeat)}
                  onOpen={onOpen}
                  mine={mine}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/*
          Always present, never behind a button: adding something is one action.

          The deadline and the repeat appear only once there is a title, so the
          resting state stays a single quiet field and the fast path — type,
          Enter — never grows a form in front of it. A mentor setting real work
          needs both without leaving the block; that was the missing half of
          "assign a task here".
      */}
      <div className="px-4 pb-3.5 pt-2">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Plus className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              ref={inputRef}
              value={draft}
              id={`plan-add-${slot.id}`}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitDraft();
                if (e.key === 'Escape') { setDraft(''); setDue(''); setRepeat(null); }
              }}
              placeholder={slot.items.length
                ? (mine ? 'Add another…' : 'Add another for them…')
                : (mine ? 'What goes in this block?' : `Set work in ${slot.label}…`)}
              aria-label={mine ? `Add an item to ${slot.label}` : `Set work in ${slot.label}`}
              className="w-full rounded-xl border border-transparent bg-slate-50 py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-slate-400 hover:border-slate-200 focus:border-brand-300 focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:bg-slate-800/60 dark:hover:border-slate-700"
            />
          </div>
          {draft.trim() && (
            <button
              type="button"
              onClick={submitDraft}
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {mine ? 'Add' : 'Assign'}
            </button>
          )}
        </div>

        {draft.trim() && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-1">
            <DueMenu value={due} onChange={setDue} />
            <RepeatMenu value={repeat} onChange={setRepeat} />
            {/* Says what will happen, in the voice of whoever is typing. */}
            <span className="text-[11px] text-muted-foreground">
              {mine
                ? (repeat ? 'comes back after you tick it' : 'finishes when you tick it')
                : (repeat ? 'they submit it each time' : 'they submit it for review')}
            </span>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * The repeats people actually pick, in their own words.
 *
 * A full RRULE editor is a form nobody wants in a to-do row. These four plus
 * "doesn't repeat" cover almost every case at one click, and they produce the
 * same rule shape a richer editor would, so adding one later changes nothing
 * that is already stored.
 */
const REPEAT_PRESETS: { label: string; rule: Partial<RepeatRule> }[] = [
  { label: 'Daily', rule: { freq: 'daily' } },
  { label: 'Weekdays', rule: { freq: 'weekly', days: [1, 2, 3, 4, 5] } },
  { label: 'Weekly', rule: { freq: 'weekly' } },
  { label: 'Monthly', rule: { freq: 'monthly' } },
  { label: 'Yearly', rule: { freq: 'yearly' } },
];

/** Does this rule match a preset exactly? Used to tick the right row. */
const presetOf = (rule?: Partial<RepeatRule> | null) => {
  if (!rule) return null;
  return REPEAT_PRESETS.find((p) => p.rule.freq === rule.freq
    && JSON.stringify(p.rule.days ?? null) === JSON.stringify(rule.days ?? null)
    && (rule.interval ?? 1) === 1) ?? null;
};

/** 'YYYY-MM-DD' in the viewer's own zone — never an ISO instant, which is a day off west of UTC. */
const dayKey = (d: Date) => d.toLocaleDateString('en-CA');
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
/** The coming Monday, which is what "next week" means on a planner. */
const nextMonday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d;
};
const shortDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short' });

/**
 * When something is due, named the way a person says it.
 *
 * A bare date input asks you to know today's date and then type it. These
 * three cover almost every deadline anyone sets on a planner, and "Pick a date"
 * is still there for the rest.
 */
function DueMenu({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const today = dayKey(new Date());
  const tomorrow = dayKey(addDays(1));
  const monday = dayKey(nextMonday());
  const label = !value ? 'Due'
    : value === today ? 'Today'
      : value === tomorrow ? 'Tomorrow'
        : new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const choices = [
    { key: today, label: 'Today', hint: shortDay(new Date()) },
    { key: tomorrow, label: 'Tomorrow', hint: shortDay(addDays(1)) },
    { key: monday, label: 'Next week', hint: shortDay(nextMonday()) },
  ];

  return (
    <Dropdown
      align="start"
      width="w-56"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
            value
              ? 'border-brand-300 bg-brand-50/70 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300'
              : 'border-slate-200 text-muted-foreground hover:border-brand-300 dark:border-slate-700'
          }`}
        >
          <CalendarClock className="h-3 w-3" aria-hidden />{label}
        </button>
      )}
    >
      {(close) => (
        <div onClick={(e) => e.stopPropagation()}>
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Due</p>
          {choices.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => { onChange(c.key); close(); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <CalendarClock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <span className="min-w-0 flex-1">{c.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{c.hint}</span>
              {value === c.key && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />}
            </button>
          ))}
          <label className="mt-1 flex w-full cursor-pointer items-center gap-2 border-t border-slate-100 px-3 py-1.5 text-sm text-foreground hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            Pick a date
            <input
              type="date"
              value={value}
              onChange={(e) => { onChange(e.target.value); if (e.target.value) close(); }}
              className="ml-auto w-28 bg-transparent text-xs text-muted-foreground focus:outline-none"
            />
          </label>
          {value && (
            <button
              type="button"
              onClick={() => { onChange(''); close(); }}
              className="w-full px-3 py-1.5 pb-2 text-left text-sm text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              No deadline
            </button>
          )}
        </div>
      )}
    </Dropdown>
  );
}

/**
 * How often it comes back. The five everyone names, plus Custom for the rest.
 *
 * Custom is "every N days / weeks / months", and for weeks, which days — which
 * is the whole of the stored rule, so nothing here can express something the
 * server would refuse.
 */
function RepeatMenu({ value, onChange, compact = false }: {
  value: Partial<RepeatRule> | null;
  onChange: (rule: Partial<RepeatRule> | null) => void;
  compact?: boolean;
}) {
  const [custom, setCustom] = useState(false);
  const [freq, setFreq] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>(value?.freq ?? 'weekly');
  const [interval, setIntervalValue] = useState(String(value?.interval ?? 1));
  const [days, setDays] = useState<number[]>(value?.days ?? []);

  const preset = presetOf(value);
  const label = !value ? 'Once' : (preset?.label ?? 'Custom');

  return (
    <Dropdown
      align="start"
      width="w-60"
      onClosed={() => {
        // Back to the list, seeded from whatever the rule is NOW — so reopening
        // never shows the half-finished custom rule from last time.
        setCustom(false);
        setFreq(value?.freq ?? 'weekly');
        setIntervalValue(String(value?.interval ?? 1));
        setDays(value?.days ?? []);
      }}
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          title={value ? 'Change how this repeats' : 'Make this repeat'}
          className={compact
            ? `mt-0.5 shrink-0 rounded p-0.5 transition-colors ${value ? 'text-brand-500' : 'text-slate-400 hover:text-brand-600'}`
            : `inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
              value
                ? 'border-brand-300 bg-brand-50/70 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300'
                : 'border-slate-200 text-muted-foreground hover:border-brand-300 dark:border-slate-700'
            }`}
        >
          <Repeat className="h-3 w-3" aria-hidden />{!compact && label}
        </button>
      )}
    >
      {(close) => (
        <div onClick={(e) => e.stopPropagation()}>
          {custom ? (
            <div className="p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Repeats every</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={interval}
                  onChange={(e) => setIntervalValue(e.target.value)}
                  className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-brand-300 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                />
                <select
                  value={freq}
                  onChange={(e) => setFreq(e.target.value as typeof freq)}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-brand-300 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="daily">days</option>
                  <option value="weekly">weeks</option>
                  <option value="monthly">months</option>
                  <option value="yearly">years</option>
                </select>
              </div>
              {freq === 'weekly' && (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setDays((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i].sort()))}
                      className={`h-7 w-7 rounded-full text-xs font-medium transition-colors ${
                        days.includes(i)
                          ? 'bg-brand-600 text-white'
                          : 'border border-slate-200 text-slate-600 hover:border-brand-300 dark:border-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const n = Math.min(52, Math.max(1, Number(interval) || 1));
                    onChange({ freq, interval: n, ...(freq === 'weekly' && days.length ? { days } : {}) });
                    close();
                  }}
                  className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  Save
                </button>
                <button type="button" onClick={() => setCustom(false)} className="text-xs text-muted-foreground hover:text-foreground">
                  Back
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Repeat</p>
              {REPEAT_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { onChange(p.rule); close(); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Repeat className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0 flex-1">{p.label}</span>
                  {preset?.label === p.label && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustom(true)}
                className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-1.5 text-left text-sm text-foreground hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
              >
                <Settings2 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                <span className="min-w-0 flex-1">Custom</span>
                {value && !preset && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />}
              </button>
              {value && (
                <button
                  type="button"
                  onClick={() => { onChange(null); close(); }}
                  className="w-full px-3 py-1.5 pb-2 text-left text-sm text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Doesn&rsquo;t repeat
                </button>
              )}
            </>
          )}
        </div>
      )}
    </Dropdown>
  );
}

/* ── one item ────────────────────────────────────────────────────────────── */

function ItemRow({
  item, busy, onToggleDone, blocks, currentSlotId, onMoveTo, onSetRepeat, onOpen,
  mine, unplanned = false,
}: {
  item: PlanItem;
  busy: boolean;
  /** True when the viewer IS the mentee — decides what ticking is called. */
  mine: boolean;
  onToggleDone: (item: PlanItem) => void;
  /** Every block this item could go to, for the move menu. */
  blocks: { id: string; label: string; time: string }[];
  currentSlotId: string | null;
  onMoveTo: (slotId: string | null) => void;
  onSetRepeat: (repeat: Partial<RepeatRule> | null) => void;
  onOpen: (taskId: string) => void;
  /**
   * This item is not in a block yet, so putting it in one is the entire point
   * of the row — it gets a button with words on it rather than an icon someone
   * has to go looking for.
   */
  unplanned?: boolean;
}) {
  const done = item.status === 'completed';
  const waiting = item.status === 'submitted';
  /**
   * Work for review does not finish on a tick, so the box must not claim it
   * will. It opens the submission on the mentee's side and the review on the
   * mentor's, and says so to a screen reader and on hover.
   */
  const tickLabel = item.kind === 'review'
    ? (mine ? `Submit ${item.title}` : `Review ${item.title}`)
    : done ? `Reopen ${item.title}` : `Finish ${item.title}`;
  return (
    <li
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move'; }}
      className="group flex items-start gap-2.5 rounded-xl border border-slate-200 bg-card px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900/60"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleDone(item); }}
        disabled={busy}
        aria-label={tickLabel}
        title={tickLabel}
        aria-pressed={done}
        className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border transition-colors ${
          done ? 'border-emerald-600 bg-emerald-600 text-white'
            : waiting ? 'border-sky-500 bg-sky-500 text-white'
              : 'border-slate-300 bg-card hover:border-brand-500 dark:border-slate-600'
        }`}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : (done || waiting) && <Check className="h-3 w-3" />}
      </button>

      {/*
          The title opens the task. Clicking an item did nothing at all before,
          which made a block look like a list of labels rather than a list of
          work — the brief, the criteria and the mentor's feedback were all a
          page away with no way to reach them from here.
      */}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpen(item.id); }}
          className={`block w-full truncate text-left text-[13.5px] hover:underline ${
            done ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
        >
          {item.title}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full border px-1.5 py-px text-[10px] font-medium ${
            item.kind === 'review'
              ? 'border-sky-200 text-sky-700 dark:border-sky-500/30 dark:text-sky-300'
              : 'border-brand-200 text-brand-700 dark:border-brand-500/30 dark:text-brand-300'
          }`}>
            {item.kind === 'review' ? 'For review' : 'Personal'}
          </span>
          {waiting && <span className="text-[10px] font-medium text-sky-600">Awaiting your mentor</span>}
          {item.fromRoadmapSlot && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title="Here because this block runs its roadmap">
              <Route className="h-3 w-3" aria-hidden />roadmap
            </span>
          )}
          {/* The repeat reads as part of the item, like a due date — it is a
              property of the thing, not an action you take on it. */}
          {item.repeatLabel && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-700 dark:text-brand-300" title={`Repeats: ${item.repeatLabel}`}>
              <Repeat className="h-3 w-3" aria-hidden />{item.repeatLabel}
            </span>
          )}
          {/*
              A deadline only earns space when it changes what you do about it:
              today means do it today, past means it is late. A date months out
              on every row is noise.
          */}
          {item.dueDate && !done && (() => {
            const dayMs = 86400000;
            const todayKey = new Date().toLocaleDateString('en-CA');
            const dueKey = new Date(item.dueDate).toLocaleDateString('en-CA');
            if (dueKey < todayKey) {
              return <span className="text-[10px] font-medium text-rose-600 dark:text-rose-400">overdue</span>;
            }
            if (dueKey === todayKey) {
              return <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">due today</span>;
            }
            const days = Math.round((new Date(`${dueKey}T00:00:00`).getTime() - new Date(`${todayKey}T00:00:00`).getTime()) / dayMs);
            if (days === 1) return <span className="text-[10px] text-muted-foreground">due tomorrow</span>;
            return <span className="text-[10px] text-muted-foreground">due {new Date(item.dueDate).toLocaleDateString()}</span>;
          })()}
        </div>
      </div>

      {/*
          One menu, always on the row.

          Where it goes and whether it comes back are the only two things anyone
          does to an item besides finishing it, so they live together instead of
          as three separate icon buttons.

          They used to be `opacity-0` until the row was hovered, which is how
          this could ship and still be reported as missing: there is no hover on
          a touch screen, and nobody goes hunting for a grey handle inside a
          drawer. A control you cannot see is a control that does not exist.
      */}
      <Dropdown
        align="end"
        width="w-60"
        trigger={({ toggle }) => (unplanned ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            aria-label={`Put ${item.title} in a block`}
            className="mt-px inline-flex shrink-0 items-center gap-1 rounded-lg border border-brand-200 bg-brand-50/70 px-2 py-1 text-[11px] font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300"
          >
            Put in a block
            <ChevronDown className="h-3 w-3" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            aria-label={`Move or repeat ${item.title}`}
            title="Move to another block, or repeat"
            className="mt-0.5 shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
        ))}
      >
        {(close) => (
          <div onClick={(e) => e.stopPropagation()}>
            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Move to</p>
            {blocks.length === 0 && (
              <p className="px-3 pb-2 text-xs text-muted-foreground">No blocks yet — add one first.</p>
            )}
            {blocks.map((b) => (
              <button
                key={b.id}
                type="button"
                disabled={b.id === currentSlotId}
                onClick={() => { onMoveTo(b.id); close(); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-slate-50 disabled:opacity-40 dark:hover:bg-slate-800"
              >
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{b.time}</span>
                <span className="min-w-0 flex-1 truncate">{b.label}</span>
                {b.id === currentSlotId && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />}
              </button>
            ))}
            {currentSlotId && (
              <button
                type="button"
                onClick={() => { onMoveTo(null); close(); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Take off the day
              </button>
            )}

          </div>
        )}
      </Dropdown>

      {/* Repeat is its own control, because it is the one property of a row you
          can see from across the list — the icon is lit when it repeats. It
          opens the same menu the composer uses, Custom included. */}
      <RepeatMenu value={item.repeat ?? null} onChange={onSetRepeat} compact />
    </li>
  );
}

/* ── one roadmap in a chain ──────────────────────────────────────────────── */

function ChainRow({ chain, index, total }: { chain: ChainRoadmapDetail; index: number; total: number }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex items-center gap-2">
        <Route className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {total > 1 && <span className="text-muted-foreground">{index + 1}. </span>}{chain.name}
        </span>
        {chain.completed ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            <Check className="h-3 w-3" aria-hidden />Done
          </span>
        ) : chain.started ? (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {chain.currentStep}/{chain.totalSteps}
          </span>
        ) : (
          <span className="shrink-0 text-[11px] text-muted-foreground">Not started</span>
        )}
      </div>
      {chain.totalSteps > 0 && (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className={`h-full rounded-full ${chain.completed ? 'bg-emerald-500' : 'bg-brand-500'}`}
            style={{ width: `${chain.percent}%` }}
          />
        </div>
      )}
    </li>
  );
}

/* ── new block ───────────────────────────────────────────────────────────── */

function NewBlock({ onSave, onCancel }: { onSave: (label: string, time: string) => void; onCancel: () => void }) {
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('19:00');
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
      <input
        type="time"
        value={time}
        id="plan-new-time"
        aria-label="Block time"
        onChange={(e) => setTime(e.target.value)}
        className="rounded-xl border border-slate-200 bg-card px-2.5 py-2 font-mono text-sm dark:border-slate-700"
      />
      <input
        value={label}
        autoFocus
        id="plan-new-label"
        aria-label="Block name"
        placeholder="Name this block"
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && label.trim()) onSave(label.trim(), time); if (e.key === 'Escape') onCancel(); }}
        className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-card px-3 py-2 text-sm dark:border-slate-700"
      />
      <button
        type="button"
        onClick={() => label.trim() && onSave(label.trim(), time)}
        disabled={!label.trim()}
        className="rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        Add
      </button>
      <button type="button" onClick={onCancel} className="rounded-xl px-2.5 py-2 text-sm text-muted-foreground hover:text-foreground">
        Cancel
      </button>
    </div>
  );
}

export default DayPlanner;
