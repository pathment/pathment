import { useState } from 'react';
import {
  Sunrise,
  Sun,
  Moon,
  Clock,
  GitBranch,
  Repeat,
  Play,
  Pencil,
  Check,
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  Plus,
  Trash2,
  SlidersHorizontal,
} from 'lucide-react';
import { Card, Badge, Button, SectionLabel, cx, TASK_TYPE_LABEL } from '@/lib/ui';
import { Modal, Field, TextInput, SelectInput, Segmented } from '@/components/overlays';
import { TrackManager } from '@/components/TrackManager';
import { useStore } from '@/store/AppStore';
import type {
  Mentee,
  SlotConfig,
  SlotKind,
  TaskType,
  Recurrence,
} from '@/lib/types';

/* slots no longer have fixed names — pick an icon by position so a day reads
   sunrise → midday → evening → flexible, then cycles. */
const SLOT_ICONS = [Sunrise, Sun, Moon, Clock];
const iconFor = (i: number) => SLOT_ICONS[i % SLOT_ICONS.length];

const TYPES: TaskType[] = ['reading', 'discussion', 'video', 'quiz', 'assignment', 'project'];

/* The schedule = a mentee's day as an ordered list of slots. Each slot is a
   "track": a roadmap chain (auto-advancing) or a recurring task. Built from the
   schedule you assigned; edit each slot per person. */
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
    toggleSlotBookable,
  } = useStore();
  const schedule = getSchedule(mentee.id);
  const [editSlotId, setEditSlotId] = useState<string | null>(null);
  const [manageSlotId, setManageSlotId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const manageSlot = schedule.find((s) => s.id === manageSlotId) ?? null;

  const editSlot = schedule.find((s) => s.id === editSlotId) ?? null;

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center justify-between">
        <SectionLabel>Schedule &amp; tracks</SectionLabel>
        <span className="font-mono text-[10px] text-ink-faint tnum">{schedule.length} slots</span>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-ink-faint">
        Assign a roadmap or recurring task into each slot. Different per mentee. Use{' '}
        <span className="font-medium text-ink-mute">Assign / Change</span> on any slot, or add a new one.
      </p>

      <div className="space-y-2.5">
        {schedule.map((cfg, i) => {
          const Icon = iconFor(i);

          // roadmap-chain progress for this slot
          const chain = cfg.roadmapChain ?? [];
          const activeProg = roadmapProgress.find(
            (p) => p.menteeId === mentee.id && p.slot === cfg.id && !p.completed,
          );
          const activeRm = activeProg ? roadmaps.find((r) => r.id === activeProg.roadmapId) : undefined;

          return (
            <div key={cfg.id} className="rounded-r border border-hairline">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center border border-hairline text-ink-mute">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{cfg.label}</span>
                    {cfg.time && (
                      <span className="font-mono text-[10px] text-ink-faint">{cfg.time}</span>
                    )}
                    {cfg.kind === 'roadmap' && (
                      <Badge tone="brand">
                        <GitBranch className="h-3 w-3" /> Roadmap
                      </Badge>
                    )}
                    {cfg.kind === 'recurring' && (
                      <Badge tone="violet">
                        <Repeat className="h-3 w-3" /> Recurring
                      </Badge>
                    )}
                    {cfg.bookable && (
                      <Badge tone="emerald">
                        <CalendarClock className="h-3 w-3" /> 1:1 bookable
                      </Badge>
                    )}
                  </div>
                  {/* what's in this slot */}
                  {cfg.kind === 'roadmap' ? (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-ink-mute">
                      {chain.map((rid, idx) => {
                        const rm = roadmaps.find((r) => r.id === rid);
                        const isActive = activeProg?.roadmapId === rid;
                        return (
                          <span key={rid} className="flex items-center gap-1">
                            {idx > 0 && <ChevronRight className="h-3 w-3 text-ink-faint" />}
                            <span className={cx(isActive && 'font-medium text-brand-700')}>
                              {rm?.name ?? 'Roadmap'}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  ) : cfg.kind === 'recurring' ? (
                    <div className="mt-0.5 text-xs text-ink-mute">
                      {cfg.recurring?.title}{' '}
                      <span className="text-ink-faint">
                        · {cfg.recurring && TASK_TYPE_LABEL[cfg.recurring.type]} ·{' '}
                        {cfg.recurring?.recurrence}
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditSlotId(cfg.id)}
                      className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                    >
                      <Plus className="h-3 w-3" /> Assign a roadmap or recurring task
                    </button>
                  )}
                  {activeRm && activeProg && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {/* fast step control — move them up/down the roadmap */}
                      <div className="rounded-r inline-flex items-center border border-hairline">
                        <button
                          onClick={() => nudgeRoadmapStep(mentee.id, cfg.id, -1)}
                          title="Back a step"
                          className="grid h-7 w-7 place-items-center text-ink-mute transition-colors hover:bg-neutral-100 hover:text-ink"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <span className="border-x border-hairline px-2 font-mono text-[10px] text-ink-soft tnum">
                          {Math.min(activeProg.currentStep + 1, activeRm.steps.length)}/{activeRm.steps.length}
                        </span>
                        <button
                          onClick={() => nudgeRoadmapStep(mentee.id, cfg.id, 1)}
                          title="Forward a step"
                          className="grid h-7 w-7 place-items-center text-ink-mute transition-colors hover:bg-neutral-100 hover:text-ink"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-ink-mute">
                        {activeRm.steps[activeProg.currentStep]?.title}
                      </span>
                      <button
                        onClick={() => setManageSlotId(cfg.id)}
                        className="rounded-r inline-flex items-center gap-1 px-1.5 py-1 text-[11px] font-medium text-brand-600 transition-colors hover:underline"
                        title="Manage this track — jump steps, switch roadmap"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" /> Manage
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {cfg.kind === 'roadmap' && chain.length > 0 && !activeProg && (
                    <Button variant="soft" size="sm" onClick={() => startSlotRoadmap(mentee.id, cfg.id)}>
                      <Play className="h-3.5 w-3.5" /> Start
                    </Button>
                  )}
                  <button
                    onClick={() => toggleSlotBookable(mentee.id, cfg.id)}
                    title={cfg.bookable ? 'Mentee can book a 1:1 here — click to disable' : 'Allow 1:1 booking in this slot'}
                    className={cx(
                      'rounded-r grid h-8 w-8 place-items-center transition-colors',
                      cfg.bookable
                        ? 'text-emerald-600 hover:bg-emerald-50'
                        : 'text-ink-faint hover:bg-neutral-100 hover:text-ink',
                    )}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                  </button>
                  {/* explicit assign/change — so it's obvious you set the task per slot per mentee */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditSlotId(cfg.id)}
                    title="Assign or change what runs in this slot"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {cfg.kind === 'empty' ? 'Assign' : 'Change'}
                  </Button>
                  <button
                    onClick={() => removeSlot(mentee.id, cfg.id)}
                    title="Remove this slot"
                    className="rounded-r grid h-8 w-8 place-items-center text-ink-faint hover:bg-neutral-100 hover:text-[#FF3B30]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {schedule.length === 0 && (
          <p className="rounded-r border border-dashed border-hairline px-3 py-4 text-center text-xs text-ink-faint">
            No slots yet. Assign a schedule from the Schedules page, or add a slot below.
          </p>
        )}
      </div>

      {/* add a one-off slot to just this mentee */}
      <button
        onClick={() => setAdding(true)}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add a slot
      </button>

      {editSlot && (
        <SlotEditor
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

      {manageSlot && (
        <TrackManager menteeId={mentee.id} slot={manageSlot} onClose={() => setManageSlotId(null)} />
      )}
    </Card>
  );
}

/* edit one slot: choose roadmap-chain or recurring task */
function SlotEditor({
  config,
  onClose,
  onSave,
}: {
  config: SlotConfig;
  onClose: () => void;
  onSave: (patch: Partial<SlotConfig>) => void;
}) {
  const { roadmaps } = useStore();
  const orgAndLocal = roadmaps; // any roadmap can be chained
  const [kind, setKind] = useState<SlotKind>(config.kind === 'empty' ? 'roadmap' : config.kind);
  const [chain, setChain] = useState<number[]>(config.roadmapChain ?? []);
  const [rTitle, setRTitle] = useState(config.recurring?.title ?? '');
  const [rType, setRType] = useState<TaskType>(config.recurring?.type ?? 'reading');
  const [rRec, setRRec] = useState<Recurrence>(config.recurring?.recurrence ?? 'daily');

  const toggleRoadmap = (id: number) =>
    setChain((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = () => {
    if (kind === 'roadmap') {
      onSave({ kind: chain.length ? 'roadmap' : 'empty', roadmapChain: chain, recurring: undefined });
    } else {
      onSave({
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
      subtitle="Roadmaps are templates that auto-assign tasks. Pick a roadmap chain or a recurring task for this slot."
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
      <div className="space-y-4">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'roadmap', label: 'Roadmap chain' },
            { value: 'recurring', label: 'Recurring task' },
          ]}
        />

        {kind === 'roadmap' ? (
          <Field label="Roadmap chain" hint="Pick roadmaps in order — finishing one prompts the next.">
            <div className="space-y-1.5">
              {/* chosen order */}
              {chain.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 rounded-r border border-hairline bg-neutral-50/60 p-2">
                  {chain.map((id, i) => {
                    const rm = orgAndLocal.find((r) => r.id === id);
                    return (
                      <span key={id} className="flex items-center gap-1 text-xs text-ink-soft">
                        {i > 0 && <ChevronRight className="h-3 w-3 text-ink-faint" />}
                        <span className="rounded-r border border-hairline bg-white px-2 py-0.5">
                          {i + 1}. {rm?.name}
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="max-h-56 space-y-1 overflow-y-auto scrollbar-thin">
                {orgAndLocal.map((r) => {
                  const on = chain.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggleRoadmap(r.id)}
                      className={cx(
                        'rounded-r flex w-full items-center gap-2.5 border px-2.5 py-2 text-left transition-colors',
                        on ? 'border-ink' : 'border-hairline hover:border-ink',
                      )}
                    >
                      <span
                        className={cx(
                          'rounded-r grid h-5 w-5 shrink-0 place-items-center border',
                          on ? 'border-ink bg-ink text-white' : 'border-hairline text-transparent',
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.name}</span>
                      <span className="font-mono text-[10px] text-ink-faint">{r.steps.length} steps</span>
                      {r.source === 'org' && <Badge tone="brand">Org</Badge>}
                    </button>
                  );
                })}
              </div>
            </div>
          </Field>
        ) : (
          <>
            <Field label="Recurring task">
              <TextInput
                value={rTitle}
                onChange={(e) => setRTitle(e.target.value)}
                placeholder="e.g. Morning reading (20 min)"
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
          </>
        )}
      </div>
    </Modal>
  );
}

/* add a brand-new slot (label + time) to just this mentee's schedule */
function AddSlotModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (block: { label: string; time?: string; bookable?: boolean }) => void;
}) {
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('');
  const [bookable, setBookable] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a slot"
      subtitle="A new part of the day for this mentee. Fill it with a roadmap or recurring task after."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onAdd({ label: label.trim() || 'New slot', time: time.trim() || undefined, bookable })} disabled={!label.trim()}>
            <Plus className="h-4 w-4" /> Add slot
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Standup, Deep work, Pairing" autoFocus />
        </Field>
        <Field label="Time" hint="Optional — e.g. 9:00 AM or Flexible.">
          <TextInput value={time} onChange={(e) => setTime(e.target.value)} placeholder="9:00 AM" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={bookable} onChange={(e) => setBookable(e.target.checked)} />
          Allow 1:1 booking in this slot
        </label>
      </div>
    </Modal>
  );
}
