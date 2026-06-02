import { useMemo, useState, type ReactNode } from 'react';
import {
  Sunrise,
  Sun,
  Moon,
  Clock,
  GitBranch,
  Repeat,
  Play,
  Check,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  CalendarClock,
  Plus,
  Trash2,
  X,
  Pencil,
  Search,
} from 'lucide-react';
import { Card, Badge, Button, SectionLabel, cx, TASK_TYPE_LABEL } from '@/lib/ui';
import { Modal, Field, TextInput, SelectInput, Segmented } from '@/components/overlays';
import { SLOT_DAYS_META, SLOT_DAYS_ORDER } from '@/lib/ai';
import { useStore } from '@/store/AppStore';
import type { Mentee, SlotConfig, SlotKind, SlotDays, TaskType, Recurrence, Roadmap, RoadmapProgress } from '@/lib/types';

const TYPES: TaskType[] = ['reading', 'discussion', 'video', 'quiz', 'assignment', 'project'];

/* Icon by time of day so a slot reads meaningfully (sunrise / midday / evening),
   not a meaningless cycling glyph. */
function iconForTime(time?: string) {
  if (!time) return Clock;
  const t = time.toLowerCase();
  if (t.includes('flex') || t.includes('any')) return Clock;
  const m = t.match(/(\d{1,2})(?::\d{2})?\s*(am|pm)/);
  if (!m) return Clock;
  let h = parseInt(m[1], 10) % 12;
  if (m[2] === 'pm') h += 12;
  if (h < 11) return Sunrise;
  if (h < 17) return Sun;
  return Moon;
}

const firstName = (n: string) => n.split(' ')[0];

/* A mentee's day as an ordered list of slots. Each slot runs EITHER a roadmap
   chain (auto-assigns tasks step by step) OR a recurring task. One clean editor
   does it all: set the cadence, choose roadmap vs recurring, build the chain. */
export function SchedulePanel({ mentee }: { mentee: Mentee }) {
  const {
    getSchedule,
    setSlot,
    addSlot,
    removeSlot,
    roadmaps,
    roadmapProgress,
    startSlotRoadmap,
    nudgeRoadmapStep,
  } = useStore();
  const schedule = getSchedule(mentee.id);
  const [editSlotId, setEditSlotId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const editSlot = schedule.find((s) => s.id === editSlotId) ?? null;

  const dayBuckets = SLOT_DAYS_ORDER.map((d) => ({
    d,
    slots: schedule.filter((s) => (s.days ?? 'everyday') === d),
  })).filter((b) => b.slots.length > 0);
  const showDayHeaders = dayBuckets.length > 1;

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center justify-between">
        <SectionLabel>Schedule &amp; tracks</SectionLabel>
        <span className="font-mono text-[10px] text-ink-faint tnum">{schedule.length} slots</span>
      </div>
      <p className="mb-4 text-[11px] leading-relaxed text-ink-faint">
        Each slot runs a roadmap (auto-assigns tasks step by step) or a recurring task. Tap a slot to set it.
      </p>

      <div className="space-y-4">
        {dayBuckets.map((bucket) => (
          <div key={bucket.d} className="space-y-2">
            {showDayHeaders && (
              <div className="flex items-center gap-2 pt-0.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">
                  {SLOT_DAYS_META[bucket.d].label}
                </span>
                <span className="h-px flex-1 bg-hairline" />
              </div>
            )}
            {bucket.slots.map((cfg) => (
              <SlotRow
                key={cfg.id}
                mentee={mentee}
                cfg={cfg}
                Icon={iconForTime(cfg.time)}
                activeProg={roadmapProgress.find((p) => p.menteeId === mentee.id && p.slot === cfg.id && !p.completed)}
                roadmaps={roadmaps}
                onEdit={() => setEditSlotId(cfg.id)}
                onRemove={() => removeSlot(mentee.id, cfg.id)}
                onStart={() => startSlotRoadmap(mentee.id, cfg.id)}
                onStep={(d) => nudgeRoadmapStep(mentee.id, cfg.id, d)}
              />
            ))}
          </div>
        ))}

        {schedule.length === 0 && (
          <p className="rounded-r border border-dashed border-hairline px-3 py-4 text-center text-xs text-ink-faint">
            No slots yet. Assign a schedule from the Schedules page, or add one below.
          </p>
        )}
      </div>

      <button
        onClick={() => setAdding(true)}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add a slot
      </button>

      {editSlot && (
        <SlotEditor
          mentee={mentee}
          config={editSlot}
          onClose={() => setEditSlotId(null)}
          onSave={(patch) => {
            setSlot(mentee.id, editSlot.id, patch);
            setEditSlotId(null);
          }}
        />
      )}

      {adding && (
        <AddSlotModal
          onClose={() => setAdding(false)}
          onAdd={(block) => {
            addSlot(mentee.id, block);
            setAdding(false);
          }}
        />
      )}
    </Card>
  );
}

/* ---------------- one slot row ---------------- */
function SlotRow({
  mentee,
  cfg,
  Icon,
  activeProg,
  roadmaps,
  onEdit,
  onRemove,
  onStart,
  onStep,
}: {
  mentee: Mentee;
  cfg: SlotConfig;
  Icon: typeof Clock;
  activeProg: RoadmapProgress | undefined;
  roadmaps: Roadmap[];
  onEdit: () => void;
  onRemove: () => void;
  onStart: () => void;
  onStep: (delta: number) => void;
}) {
  const chain = cfg.roadmapChain ?? [];
  const activeRm = activeProg ? roadmaps.find((r) => r.id === activeProg.roadmapId) : undefined;

  return (
    <div className="rounded-r border border-hairline">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center border border-hairline text-ink-mute">
          <Icon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-ink">{cfg.label}</span>
            {cfg.time && <span className="font-mono text-[10px] text-ink-faint">{cfg.time}</span>}
            {cfg.kind === 'roadmap' && (
              <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-brand-600">
                <GitBranch className="h-3 w-3" /> Roadmap
              </span>
            )}
            {cfg.kind === 'recurring' && (
              <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-violet-600">
                <Repeat className="h-3 w-3" /> Recurring
              </span>
            )}
            {cfg.bookable && (
              <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-emerald-600">
                <CalendarClock className="h-3 w-3" /> 1:1
              </span>
            )}
          </div>

          {/* what runs here */}
          {cfg.kind === 'roadmap' ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-ink-mute">
              {chain.map((rid, idx) => {
                const rm = roadmaps.find((r) => r.id === rid);
                const on = activeProg?.roadmapId === rid;
                return (
                  <span key={rid} className="flex items-center gap-1">
                    {idx > 0 && <ChevronRight className="h-3 w-3 text-ink-faint" />}
                    <span className={cx(on && 'font-medium text-brand-700')}>{rm?.name ?? 'Roadmap'}</span>
                  </span>
                );
              })}
              {chain.length === 0 && <span className="text-ink-faint">No roadmap set</span>}
            </div>
          ) : cfg.kind === 'recurring' ? (
            <div className="mt-0.5 text-xs text-ink-mute">
              {cfg.recurring?.title}{' '}
              <span className="text-ink-faint">
                · {cfg.recurring && TASK_TYPE_LABEL[cfg.recurring.type]} · {cfg.recurring?.recurrence}
              </span>
            </div>
          ) : (
            <button
              onClick={onEdit}
              className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
            >
              <Plus className="h-3 w-3" /> Add a roadmap or recurring task
            </button>
          )}

          {/* active roadmap: quick step control inline */}
          {activeRm && activeProg && (
            <div className="mt-2 flex items-center gap-2 rounded-r border border-hairline bg-neutral-50/60 px-2 py-1.5">
              <div className="rounded-r inline-flex items-center border border-hairline bg-white">
                <button
                  onClick={() => onStep(-1)}
                  title="Back a step"
                  className="grid h-7 w-7 place-items-center text-ink-mute transition-colors hover:bg-neutral-100 hover:text-ink"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="border-x border-hairline px-2 font-mono text-[10px] text-ink-soft tnum">
                  {Math.min(activeProg.currentStep + 1, activeRm.steps.length)}/{activeRm.steps.length}
                </span>
                <button
                  onClick={() => onStep(1)}
                  title="Forward a step"
                  className="grid h-7 w-7 place-items-center text-ink-mute transition-colors hover:bg-neutral-100 hover:text-ink"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <span className="min-w-0 flex-1 truncate text-[11px] text-ink-soft">
                {activeRm.steps[activeProg.currentStep]?.title}
              </span>
            </div>
          )}

          {/* chain set but not started yet */}
          {cfg.kind === 'roadmap' && chain.length > 0 && !activeProg && (
            <button
              onClick={onStart}
              className="mt-2 inline-flex items-center gap-1 rounded-r border border-hairline px-2 py-1 text-[11px] font-medium text-brand-600 transition-colors hover:border-ink"
            >
              <Play className="h-3.5 w-3.5" /> Start for {firstName(mentee.name)}
            </button>
          )}
        </div>

        {/* one clear edit, plus remove */}
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" onClick={onEdit} title="Set what runs in this slot">
            <Pencil className="h-3.5 w-3.5" /> {cfg.kind === 'empty' ? 'Set' : 'Edit'}
          </Button>
          <button
            onClick={onRemove}
            title="Remove this slot"
            className="rounded-r grid h-8 w-8 place-items-center text-ink-faint hover:bg-neutral-100 hover:text-[#FF3B30]"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- the one slot editor ---------------- */
function SlotEditor({
  mentee,
  config,
  onClose,
  onSave,
}: {
  mentee: Mentee;
  config: SlotConfig;
  onClose: () => void;
  onSave: (patch: Partial<SlotConfig>) => void;
}) {
  const { roadmaps } = useStore();
  const [days, setDays] = useState<SlotDays>(config.days ?? 'everyday');
  const [kind, setKind] = useState<SlotKind>(config.kind === 'empty' ? 'roadmap' : config.kind);
  const [chain, setChain] = useState<number[]>(config.roadmapChain ?? []);
  const [bookable, setBookable] = useState(!!config.bookable);
  const [rTitle, setRTitle] = useState(config.recurring?.title ?? '');
  const [rType, setRType] = useState<TaskType>(config.recurring?.type ?? 'discussion');
  const [rRec, setRRec] = useState<Recurrence>(config.recurring?.recurrence ?? 'daily');
  const [q, setQ] = useState('');

  const available = useMemo(
    () => roadmaps.filter((r) => !chain.includes(r.id) && r.name.toLowerCase().includes(q.trim().toLowerCase())),
    [roadmaps, chain, q],
  );

  const moveChain = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= chain.length) return;
    setChain((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const save = () => {
    if (kind === 'roadmap') {
      onSave({ days, bookable, kind: chain.length ? 'roadmap' : 'empty', roadmapChain: chain, recurring: undefined });
    } else {
      onSave({
        days,
        bookable,
        kind: rTitle.trim() ? 'recurring' : 'empty',
        recurring: rTitle.trim() ? { title: rTitle.trim(), type: rType, recurrence: rRec } : undefined,
        roadmapChain: undefined,
      });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${config.label}${config.time ? ` · ${config.time}` : ''}`}
      subtitle={`What runs in this slot for ${firstName(mentee.name)}.`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>
            <Check className="h-4 w-4" /> Save slot
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* 1. kind choice as two clear cards */}
        <div className="grid grid-cols-2 gap-2">
          <KindCard
            active={kind === 'roadmap'}
            onClick={() => setKind('roadmap')}
            icon={<GitBranch className="h-4 w-4" />}
            title="Roadmap"
            body="Auto-assigns tasks, step by step."
          />
          <KindCard
            active={kind === 'recurring'}
            onClick={() => setKind('recurring')}
            icon={<Repeat className="h-4 w-4" />}
            title="Recurring task"
            body="Repeats, like a daily talk."
          />
        </div>

        {/* 2. the content */}
        {kind === 'roadmap' ? (
          <div className="space-y-3">
            <Field label="Roadmap chain" hint="Tasks come from these roadmaps in order. Finishing one prompts the next.">
              {chain.length === 0 ? (
                <p className="rounded-r border border-dashed border-hairline px-3 py-3 text-center text-xs text-ink-faint">
                  No roadmaps yet. Add one below.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {chain.map((id, i) => {
                    const rm = roadmaps.find((r) => r.id === id);
                    return (
                      <div key={id} className="rounded-r flex items-center gap-2 border border-hairline px-2.5 py-1.5">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-r bg-ink font-mono text-[10px] text-white tnum">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{rm?.name ?? 'Roadmap'}</span>
                        <span className="font-mono text-[10px] text-ink-faint tnum">{rm?.steps.length} steps</span>
                        <div className="flex items-center">
                          <button
                            disabled={i === 0}
                            onClick={() => moveChain(i, -1)}
                            className="grid h-6 w-6 place-items-center text-ink-faint hover:text-ink disabled:opacity-30"
                            title="Move up"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            disabled={i === chain.length - 1}
                            onClick={() => moveChain(i, 1)}
                            className="grid h-6 w-6 place-items-center text-ink-faint hover:text-ink disabled:opacity-30"
                            title="Move down"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setChain((prev) => prev.filter((x) => x !== id))}
                            className="grid h-6 w-6 place-items-center text-ink-faint hover:text-[#FF3B30]"
                            title="Remove"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Field>

            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">Add a roadmap</div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
                <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roadmaps" className="pl-8" />
              </div>
              <div className="mt-1.5 max-h-44 space-y-1 overflow-y-auto scrollbar-thin">
                {available.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-ink-faint">No roadmaps match.</p>
                ) : (
                  available.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setChain((prev) => [...prev, r.id])}
                      className="rounded-r flex w-full items-center gap-2.5 border border-hairline px-2.5 py-2 text-left transition-colors hover:border-ink"
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.name}</span>
                      <span className="font-mono text-[10px] text-ink-faint tnum">{r.steps.length} steps</span>
                      {r.source === 'org' && <Badge tone="brand">Org</Badge>}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Recurring task">
              <TextInput
                value={rTitle}
                onChange={(e) => setRTitle(e.target.value)}
                placeholder="e.g. Mindset talk, Morning reading"
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Type">
                <SelectInput value={rType} onChange={(e) => setRType(e.target.value as TaskType)}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TASK_TYPE_LABEL[t]}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Repeats">
                <div>
                  <Segmented
                    value={rRec}
                    onChange={setRRec}
                    options={[
                      { value: 'daily', label: 'Daily' },
                      { value: 'weekly', label: 'Weekly' },
                    ]}
                  />
                </div>
              </Field>
            </div>
          </div>
        )}

        {/* 3. cadence + booking, compact at the bottom */}
        <div className="space-y-3 border-t border-hairline pt-4">
          <Field label="Runs on">
            <Segmented
              value={days}
              onChange={setDays}
              options={[
                { value: 'everyday', label: 'Every day' },
                { value: 'weekdays', label: 'Weekdays' },
                { value: 'weekends', label: 'Weekend' },
              ]}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={bookable} onChange={(e) => setBookable(e.target.checked)} />
            <CalendarClock className="h-3.5 w-3.5 text-emerald-600" />
            Let {firstName(mentee.name)} book a 1:1 in this slot
          </label>
        </div>
      </div>
    </Modal>
  );
}

function KindCard({
  active,
  onClick,
  icon,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'rounded-r border px-3 py-2.5 text-left transition-colors',
        active ? 'border-ink bg-neutral-50' : 'border-hairline hover:border-ink',
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className={cx(active ? 'text-ink' : 'text-ink-mute')}>{icon}</span>
        {title}
      </span>
      <span className="mt-0.5 block text-[11px] leading-snug text-ink-mute">{body}</span>
    </button>
  );
}

/* ---------------- add a one-off slot ---------------- */
function AddSlotModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (block: { label: string; time?: string; days?: SlotDays; bookable?: boolean }) => void;
}) {
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('');
  const [days, setDays] = useState<SlotDays>('weekdays');

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a slot"
      subtitle="A new part of the day. Set what runs in it after."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onAdd({ label: label.trim() || 'New slot', time: time.trim() || undefined, days })} disabled={!label.trim()}>
            <Plus className="h-4 w-4" /> Add slot
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Standup, Deep work, Pairing" autoFocus />
        </Field>
        <Field label="Time" hint="Optional. e.g. 9:00 AM or Flexible.">
          <TextInput value={time} onChange={(e) => setTime(e.target.value)} placeholder="9:00 AM" />
        </Field>
        <Field label="Runs on">
          <Segmented
            value={days}
            onChange={setDays}
            options={[
              { value: 'everyday', label: 'Every day' },
              { value: 'weekdays', label: 'Weekdays' },
              { value: 'weekends', label: 'Weekend' },
            ]}
          />
        </Field>
      </div>
    </Modal>
  );
}
