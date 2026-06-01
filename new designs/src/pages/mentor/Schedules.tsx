import { useState } from 'react';
import {
  Download,
  Users,
  Clock,
  CalendarClock,
  Check,
  Plus,
  X,
} from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { Card, Badge, Button, Avatar, SectionLabel, cx } from '@/lib/ui';
import { Drawer, SelectInput } from '@/components/overlays';
import { useStore } from '@/store/AppStore';
import type { ScheduleTemplate } from '@/lib/types';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const TIMES = ['9:00 AM', '10:00 AM', '11:00 AM', '12:30 PM', '2:00 PM', '3:30 PM', '5:00 PM'];
const DURATIONS = [15, 20, 30, 45, 60];

export function Schedules() {
  const {
    scheduleTemplates,
    inheritOrgTemplate,
    assignTemplateToMentees,
    mentees,
    availabilitySlots,
    addAvailabilitySlot,
    removeAvailabilitySlot,
    getMentee,
  } = useStore();

  const orgTemplates = scheduleTemplates.filter((t) => t.source === 'org');
  const myTemplates = scheduleTemplates.filter((t) => t.source === 'mentor');
  const [assignFor, setAssignFor] = useState<ScheduleTemplate | null>(null);

  // new-availability-slot form
  const [aDay, setADay] = useState('Tue');
  const [aTime, setATime] = useState('10:00 AM');
  const [aDur, setADur] = useState(30);
  const addSlot = () => addAvailabilitySlot({ day: aDay, time: aTime, durationMins: aDur });

  return (
    <Page>
      <PageHeader
        title="Schedules"
        subtitle="Build a day-shape once, assign it to mentees — same structure, their own tasks"
        actions={
          <Button onClick={() => setAssignFor(myTemplates[0] ?? scheduleTemplates[0] ?? null)} disabled={scheduleTemplates.length === 0}>
            <Users className="h-4 w-4" /> Assign a schedule
          </Button>
        }
      />

      {/* MY 1:1 AVAILABILITY — Calendly-style: publish concrete bookable times */}
      <section className="mb-8">
        <SectionLabel>My 1:1 availability</SectionLabel>
        <Card className="p-5">
          <p className="mb-4 text-xs text-ink-mute">
            Publish the exact times you&apos;re free. Mentees book one of these and it becomes a 1:1.
          </p>

          {/* add a slot */}
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-r border border-hairline bg-neutral-50/60 p-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">Day</span>
              <SelectInput value={aDay} onChange={(e) => setADay(e.target.value)} className="h-8 w-24 py-1 text-xs">
                {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </SelectInput>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">Time</span>
              <SelectInput value={aTime} onChange={(e) => setATime(e.target.value)} className="h-8 w-28 py-1 text-xs">
                {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </SelectInput>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">Length</span>
              <SelectInput value={aDur} onChange={(e) => setADur(Number(e.target.value))} className="h-8 w-24 py-1 text-xs">
                {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
              </SelectInput>
            </label>
            <Button size="sm" onClick={addSlot}>
              <Plus className="h-4 w-4" /> Add slot
            </Button>
          </div>

          {/* published slots */}
          {availabilitySlots.length === 0 ? (
            <p className="text-sm text-ink-faint">No times published yet — add a few above.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availabilitySlots.map((s) => {
                const taker = s.taken && s.takenBy ? getMentee(s.takenBy) : undefined;
                return (
                  <div
                    key={s.id}
                    className={cx(
                      'rounded-r flex items-center gap-2 border px-3 py-2 text-sm',
                      s.taken ? 'border-hairline bg-neutral-50 text-ink-mute' : 'border-emerald-300 text-ink',
                    )}
                  >
                    <CalendarClock className={cx('h-3.5 w-3.5', s.taken ? 'text-ink-faint' : 'text-emerald-600')} />
                    <span className="font-medium">{s.day} {s.time}</span>
                    <span className="font-mono text-[11px] text-ink-faint">{s.durationMins}m</span>
                    {s.taken ? (
                      <Badge tone="neutral">Booked{taker ? ` · ${taker.name.split(' ')[0]}` : ''}</Badge>
                    ) : (
                      <button
                        onClick={() => removeAvailabilitySlot(s.id)}
                        title="Remove"
                        className="text-ink-faint hover:text-[#FF3B30]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </section>

      {/* MY SCHEDULES */}
      <section className="mb-8">
        <SectionLabel>My schedules</SectionLabel>
        {myTemplates.length === 0 ? (
          <Card className="px-5 py-10 text-center text-sm text-ink-mute">
            No schedules yet. Inherit one published by your organization below, or build your own.
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {myTemplates.map((t) => (
              <TemplateCard key={t.id} tpl={t} onAssign={() => setAssignFor(t)} />
            ))}
          </div>
        )}
      </section>

      {/* ORG SCHEDULES (inheritable) */}
      <section>
        <SectionLabel>From your organization</SectionLabel>
        {orgTemplates.length === 0 ? (
          <Card className="px-5 py-10 text-center text-sm text-ink-mute">
            Your organization hasn&apos;t published any schedules yet.
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {orgTemplates.map((t) => (
              <TemplateCard
                key={t.id}
                tpl={t}
                org
                onInherit={() => inheritOrgTemplate(t.id)}
                onAssign={() => setAssignFor(t)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ASSIGN DRAWER */}
      <AssignScheduleDrawer
        tpl={assignFor}
        mentees={mentees}
        onClose={() => setAssignFor(null)}
        onAssign={(ids) => {
          if (assignFor) assignTemplateToMentees(assignFor.id, ids);
          setAssignFor(null);
        }}
      />
    </Page>
  );
}

function TemplateCard({
  tpl,
  org = false,
  onInherit,
  onAssign,
}: {
  tpl: ScheduleTemplate;
  org?: boolean;
  onInherit?: () => void;
  onAssign?: () => void;
}) {
  return (
    <Card className="flex flex-col p-0">
      <div className="border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-2">
          {org && <Badge tone="brand">Org</Badge>}
          <span className="text-sm font-semibold text-ink">{tpl.name}</span>
          <span className="font-mono text-[11px] text-ink-faint tnum">{tpl.blocks.length} slots</span>
        </div>
        {tpl.description && <p className="mt-1 text-xs text-ink-mute">{tpl.description}</p>}
      </div>

      {/* pure time structure — no tasks/roadmaps live in a schedule */}
      <div className="flex-1 divide-y divide-hairline">
        {tpl.blocks.map((b) => (
          <div key={b.id} className="flex items-center gap-3 px-5 py-2.5">
            <Clock className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
            <span className="w-20 shrink-0 font-mono text-[10px] text-ink-mute tnum">{b.time}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{b.label}</span>
            {b.bookable && (
              <span title="Mentees can book a 1:1 here">
                <CalendarClock className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-hairline bg-neutral-50/60 px-5 py-3">
        <span className="text-[11px] text-ink-faint">Structure only — fill slots per mentee after assigning</span>
        <div className="flex items-center gap-2">
          {org && onInherit && (
            <Button variant="outline" size="sm" onClick={onInherit}>
              <Download className="h-3.5 w-3.5" /> Inherit
            </Button>
          )}
          {onAssign && (
            <Button variant="soft" size="sm" onClick={onAssign}>
              <Users className="h-3.5 w-3.5" /> Assign
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function AssignScheduleDrawer({
  tpl,
  mentees,
  onClose,
  onAssign,
}: {
  tpl: ScheduleTemplate | null;
  mentees: { id: number; name: string; avatar: string; level: string; program: string }[];
  onClose: () => void;
  onAssign: (ids: number[]) => void;
}) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  if (!tpl) return null;

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const all = picked.size === mentees.length;

  return (
    <Drawer
      open={!!tpl}
      onClose={() => {
        setPicked(new Set());
        onClose();
      }}
      width="max-w-lg"
      title={`Assign "${tpl.name}"`}
      subtitle="Everyone shares the day-shape; tasks accrue per person"
      footer={
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] text-ink-faint tnum">{picked.size} selected</span>
          <Button onClick={() => onAssign([...picked])} disabled={picked.size === 0}>
            <Check className="h-4 w-4" /> Assign to {picked.size || 0}
          </Button>
        </div>
      }
    >
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => setPicked(all ? new Set() : new Set(mentees.map((m) => m.id)))}
          className="text-xs text-brand-600 hover:underline"
        >
          {all ? 'Clear all' : `Select all ${mentees.length}`}
        </button>
      </div>
      <div className="space-y-1.5">
        {mentees.map((m) => {
          const on = picked.has(m.id);
          return (
            <button
              key={m.id}
              onClick={() => toggle(m.id)}
              className={cx(
                'rounded-r flex w-full items-center gap-3 border px-3 py-2 text-left transition-colors',
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
              <Avatar initials={m.avatar} name={m.name} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{m.name}</span>
                <span className="block text-xs text-ink-mute">
                  {m.level} · {m.program}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Drawer>
  );
}
