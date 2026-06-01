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
  ChevronRight,
  CalendarClock,
  Plus,
} from 'lucide-react';
import { Card, Badge, Button, SectionLabel, cx, TASK_TYPE_LABEL } from '@/lib/ui';
import { Modal, Field, TextInput, SelectInput, Segmented } from '@/components/overlays';
import { SLOT_META, SLOT_ORDER } from '@/lib/ai';
import { useStore } from '@/store/AppStore';
import type {
  Mentee,
  ScheduleSlot,
  SlotKind,
  SlotConfig,
  TaskType,
  Recurrence,
} from '@/lib/types';

const SLOT_ICON: Record<ScheduleSlot, typeof Sun> = {
  morning: Sunrise,
  lunch: Sun,
  dinner: Moon,
  anytime: Clock,
};

const TYPES: TaskType[] = ['reading', 'discussion', 'video', 'quiz', 'assignment', 'project'];

/* The schedule = a mentee's day in 4 slots. Each slot is a "track": a roadmap
   chain (auto-advancing) or a recurring task. Edit per person; the org default
   is the starting point. */
export function SchedulePanel({ mentee }: { mentee: Mentee }) {
  const { getSchedule, setSlot, roadmaps, roadmapProgress, startSlotRoadmap, toggleSlotBookable } = useStore();
  const schedule = getSchedule(mentee.id);
  const [editSlot, setEditSlot] = useState<ScheduleSlot | null>(null);

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center justify-between">
        <SectionLabel>Schedule &amp; tracks</SectionLabel>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-ink-faint">
        Assign a roadmap or recurring task into each slot — different per mentee. Use{' '}
        <span className="font-medium text-ink-mute">Assign / Change</span> on any slot.
      </p>

      <div className="space-y-2.5">
        {SLOT_ORDER.map((slot) => {
          const cfg = schedule[slot];
          const Icon = SLOT_ICON[slot];
          const meta = SLOT_META[slot];

          // roadmap-chain progress for this slot
          const chain = cfg.roadmapChain ?? [];
          const activeProg = roadmapProgress.find(
            (p) => p.menteeId === mentee.id && p.slot === slot && !p.completed,
          );
          const activeRm = activeProg ? roadmaps.find((r) => r.id === activeProg.roadmapId) : undefined;

          return (
            <div key={slot} className="rounded-r border border-hairline">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center border border-hairline text-ink-mute">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{cfg.label ?? meta.label}</span>
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
                      {chain.map((rid, i) => {
                        const rm = roadmaps.find((r) => r.id === rid);
                        const isActive = activeProg?.roadmapId === rid;
                        return (
                          <span key={rid} className="flex items-center gap-1">
                            {i > 0 && <ChevronRight className="h-3 w-3 text-ink-faint" />}
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
                      onClick={() => setEditSlot(slot)}
                      className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                    >
                      <Plus className="h-3 w-3" /> Assign a roadmap or recurring task
                    </button>
                  )}
                  {activeRm && activeProg && (
                    <div className="mt-1 text-[11px] text-ink-faint">
                      On {activeRm.name} · step {Math.min(activeProg.currentStep + 1, activeRm.steps.length)}/
                      {activeRm.steps.length}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {cfg.kind === 'roadmap' && chain.length > 0 && !activeProg && (
                    <Button variant="soft" size="sm" onClick={() => startSlotRoadmap(mentee.id, slot)}>
                      <Play className="h-3.5 w-3.5" /> Start
                    </Button>
                  )}
                  <button
                    onClick={() => toggleSlotBookable(mentee.id, slot)}
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
                    onClick={() => setEditSlot(slot)}
                    title="Assign or change what runs in this slot"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {cfg.kind === 'empty' ? 'Assign' : 'Change'}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editSlot && (
        <SlotEditor
          slot={editSlot}
          config={schedule[editSlot]}
          onClose={() => setEditSlot(null)}
          onSave={(cfg) => {
            setSlot(mentee.id, editSlot, cfg);
            setEditSlot(null);
          }}
        />
      )}
    </Card>
  );
}

/* edit one slot: choose roadmap-chain or recurring task */
function SlotEditor({
  slot,
  config,
  onClose,
  onSave,
}: {
  slot: ScheduleSlot;
  config: SlotConfig;
  onClose: () => void;
  onSave: (cfg: SlotConfig) => void;
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
    // preserve the slot's name/time/bookable from the schedule structure
    const base = { label: config.label, time: config.time, bookable: config.bookable };
    if (kind === 'roadmap') {
      onSave({ ...base, kind: chain.length ? 'roadmap' : 'empty', roadmapChain: chain });
    } else {
      onSave({
        ...base,
        kind: rTitle.trim() ? 'recurring' : 'empty',
        recurring: rTitle.trim() ? { title: rTitle.trim(), type: rType, recurrence: rRec } : undefined,
      });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${config.label ?? SLOT_META[slot].label}${config.time ? ` · ${config.time}` : ''}`}
      subtitle="Link this part of the day to a roadmap chain or a recurring task"
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
