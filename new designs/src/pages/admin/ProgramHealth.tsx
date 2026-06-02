import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Users,
  Target,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  TrendingDown,
  Flag,
  CalendarClock,
} from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { useStore } from '@/store/AppStore';
import { Modal, Field, TextInput } from '@/components/overlays';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ProgressBar,
  RISK_META,
  AiTag,
  SectionLabel,
  cx,
} from '@/lib/ui';
import type { Mentee, ProgramHealth as Program } from '@/lib/types';

/* ----------------------------------------------------------------
   status → tone / label / accents
----------------------------------------------------------------- */
type StatusKey = Program['status'];

const STATUS_META: Record<
  StatusKey,
  {
    label: string;
    tone: 'emerald' | 'amber' | 'rose';
    dot: string;
    accent: string;
    rank: number;
  }
> = {
  red: { label: 'Needs attention', tone: 'rose', dot: 'bg-rose-500', accent: 'border-l-rose-400 bg-rose-50/40', rank: 0 },
  amber: { label: 'Watch', tone: 'amber', dot: 'bg-amber-500', accent: 'border-l-amber-400 bg-amber-50/30', rank: 1 },
  green: { label: 'Healthy', tone: 'emerald', dot: 'bg-emerald-500', accent: 'border-l-emerald-300 bg-white', rank: 2 },
};

type FilterKey = 'all' | StatusKey;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'green', label: 'Healthy' },
  { key: 'amber', label: 'Watch' },
  { key: 'red', label: 'Needs attention' },
];

function avg(nums: number[]) {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function ProgramHealth() {
  const navigate = useNavigate();
  const { mentees, programs, addProgram } = useStore();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [creating, setCreating] = useState(false);

  const totalMentees = useMemo(
    () => programs.reduce((sum, p) => sum + p.cohortSize, 0),
    [programs],
  );
  const avgCompletion = useMemo(() => avg(programs.map((p) => p.completion)), [programs]);
  const avgOnTime = useMemo(() => avg(programs.map((p) => p.onTime)), [programs]);

  // live at-risk roll-up - anyone not on track, worst first (high → watch)
  const atRiskMentees = useMemo(
    () =>
      mentees
        .filter((m) => m.risk !== 'low')
        .sort((a, b) => (a.risk === b.risk ? 0 : a.risk === 'high' ? -1 : 1)),
    [mentees],
  );

  // top KPI is the sum of each clan's at-risk count. The live Phoenix cohort's
  // at-risk mentees are already reflected in that clan's fixture, so we do NOT
  // add them again (that double-counted them against the roll-up below).
  const totalAtRisk = useMemo(
    () => programs.reduce((sum, p) => sum + p.atRisk, 0),
    [programs],
  );

  // sort red first, then amber, then green
  const sorted = useMemo(
    () =>
      [...programs].sort(
        (a, b) => STATUS_META[a.status].rank - STATUS_META[b.status].rank,
      ),
    [programs],
  );

  const visible = useMemo(
    () => (filter === 'all' ? sorted : sorted.filter((p) => p.status === filter)),
    [sorted, filter],
  );

  // worst program for the "at a glance" callout
  const worst = useMemo(
    () =>
      [...programs].sort((a, b) => {
        const r = STATUS_META[a.status].rank - STATUS_META[b.status].rank;
        if (r !== 0) return r;
        return b.dropoff - a.dropoff;
      })[0],
    [programs],
  );

  const stats: {
    label: string;
    value: string;
    icon: typeof Users;
    iconClass: string;
  }[] = [
    { label: 'Active mentees', value: String(totalMentees), icon: Users, iconClass: 'bg-brand-500' },
    { label: 'Avg completion', value: `${avgCompletion}%`, icon: Target, iconClass: 'bg-sky-500' },
    { label: 'Avg on-time', value: `${avgOnTime}%`, icon: Clock, iconClass: 'bg-emerald-600' },
    { label: 'At-risk mentees', value: String(totalAtRisk), icon: AlertTriangle, iconClass: 'bg-[#FF3B30]' },
  ];

  return (
    <Page>
      <PageHeader
        title="Clan health"
        subtitle={`Across the organization · ${programs.length} clans, ${totalMentees} members`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New clan
          </Button>
        }
      />

      {creating && (
        <CreateClanModal
          onClose={() => setCreating(false)}
          onCreate={(input) => {
            addProgram(input);
            setCreating(false);
          }}
        />
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="relative overflow-hidden p-5">
            <span className={cx('absolute left-0 top-0 h-full w-0.5', s.iconClass)} />
            <div className="flex items-start justify-between">
              <div className="eyebrow">{s.label}</div>
              <s.icon className="h-3.5 w-3.5 text-ink-faint" />
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold tracking-tight text-ink tnum">
              {s.value}
            </div>
          </Card>
        ))}
      </div>

      {/* worst-program callout */}
      <Card className="ai-panel mt-6 flex flex-wrap items-start gap-3 p-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center border border-rose-200 text-[#FF3B30]">
          <TrendingDown className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <AiTag>At a glance</AiTag>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            <span className="font-semibold text-ink">{worst.name}</span> needs intervention -{' '}
            {worst.dropoff}% drop-off, {worst.atRisk} at-risk mentees and {worst.blockers} open
            blockers. Its {worst.mentorLoad.toLowerCase()}.
          </p>
        </div>
        <Button variant="soft" size="sm" onClick={() => navigate('/admin/people')}>
          Review people <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      </Card>

      {/* filter chips */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count =
            f.key === 'all'
              ? programs.length
              : programs.filter((p) => p.status === f.key).length;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-ink text-white'
                  : 'bg-white text-ink-soft ring-1 ring-neutral-200/70 hover:bg-neutral-50',
              )}
            >
              {f.key !== 'all' && (
                <span className={cx('h-2 w-2 rounded-full', STATUS_META[f.key].dot)} />
              )}
              {f.label}
              <span className={cx('text-xs', active ? 'text-white/60' : 'text-ink-faint')}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* program list */}
      <div className="mt-5 space-y-4">
        {visible.length === 0 ? (
          <Card className="grid place-items-center py-16 text-center">
            <p className="text-sm text-ink-mute">No clans in this state.</p>
          </Card>
        ) : (
          visible.map((p) => (
            <ProgramRow key={p.id} p={p} onOpen={() => navigate('/admin/people')} />
          ))
        )}
      </div>

      {/* org-wide at-risk roll-up - from the live store (§7.4) */}
      <section className="mt-10">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <SectionLabel>At-risk across the org</SectionLabel>
            <p className="-mt-2 text-xs text-ink-mute">
              Live cohort - {atRiskMentees.length} need a closer look, worst first.
            </p>
          </div>
          <Badge tone="rose">{atRiskMentees.length} flagged</Badge>
        </div>

        {atRiskMentees.length === 0 ? (
          <Card className="grid place-items-center py-12 text-center">
            <p className="text-sm text-ink-mute">No one is at risk right now.</p>
          </Card>
        ) : (
          <Card className="divide-y divide-neutral-100 p-0">
            {atRiskMentees.map((m) => (
              <AtRiskRow
                key={m.id}
                m={m}
                onOpen={() => navigate(`/admin/people/${m.id}`)}
              />
            ))}
          </Card>
        )}
      </section>
    </Page>
  );
}

/* ----------------------------------------------------------------
   one at-risk mentee row (live store)
----------------------------------------------------------------- */
function AtRiskRow({ m, onOpen }: { m: Mentee; onOpen: () => void }) {
  const r = RISK_META[m.risk];
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <Avatar initials={m.avatar} name={m.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink">{m.name}</span>
          <Badge tone={r.tone}>{r.label}</Badge>
        </div>
        <div className="mt-0.5 truncate text-xs text-ink-mute">{m.program}</div>
      </div>
      {m.riskReason && (
        <div className="order-3 w-full min-w-0 sm:order-none sm:w-auto sm:max-w-xs">
          <AiTag>Signal</AiTag>
          <p className="mt-0.5 truncate text-xs text-ink-soft">{m.riskReason}</p>
        </div>
      )}
      <button
        onClick={onOpen}
        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
      >
        View <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------
   one program row
----------------------------------------------------------------- */
function ProgramRow({ p, onOpen }: { p: Program; onOpen: () => void }) {
  const meta = STATUS_META[p.status];

  const metrics: { label: string; value: string; danger?: boolean }[] = [
    { label: 'Members', value: `${p.cohortSize}` },
    { label: 'On-time', value: `${p.onTime}%`, danger: p.onTime < 60 },
    { label: 'Drop-off', value: `${p.dropoff}%`, danger: p.dropoff >= 12 },
    { label: 'Extensions', value: `${p.extensions}` },
    { label: 'Blockers', value: `${p.blockers}`, danger: p.blockers >= 12 },
  ];

  return (
    <Card
      hover
      onClick={onOpen}
      className={cx('animate-slide-in border-l-4 p-5', meta.accent)}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* identity + status */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cx('h-2.5 w-2.5 rounded-full', meta.dot)} />
            <h3 className="truncate font-semibold text-ink">{p.name}</h3>
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {p.atRisk > 0 && (
              <Badge tone="rose">
                <Flag className="h-3 w-3" />
                {p.atRisk} at risk
              </Badge>
            )}
          </div>
          {p.program && (
            <div className="mt-1 text-xs text-ink-mute">{p.program}</div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-mute">
            {p.leader && (
              <span className="inline-flex items-center gap-1.5">
                <Avatar initials={p.leaderAvatar ?? p.leader.slice(0, 2)} name={p.leader} size="xs" />
                <span>Led by {p.leader}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-ink-faint" />
              {p.mentorLoad}
            </span>
          </div>
        </div>

        <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-faint" />
      </div>

      {/* completion */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-ink-mute">Completion</span>
          <span className="font-semibold text-ink">{p.completion}%</span>
        </div>
        <ProgressBar value={p.completion} tone={meta.tone} height="h-2" />
      </div>

      {/* metric grid */}
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-neutral-100 pt-4 sm:grid-cols-5">
        {metrics.map((mt) => (
          <div key={mt.label}>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint">{mt.label}</div>
            <div className={cx('mt-0.5 text-sm font-semibold', mt.danger ? 'text-rose-600' : 'text-ink')}>
              {mt.value}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------
   create a new clan (program group)
----------------------------------------------------------------- */
function CreateClanModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { name: string; program: string; leader: string }) => void;
}) {
  const [name, setName] = useState('');
  const [program, setProgram] = useState('');
  const [leader, setLeader] = useState('');
  const valid = name.trim() && program.trim() && leader.trim();

  return (
    <Modal
      open
      onClose={onClose}
      title="New clan"
      subtitle="A group of mentees under a clan leader, running one program."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => onCreate({ name: name.trim(), program: program.trim(), leader: leader.trim() })}
          >
            <Plus className="h-4 w-4" /> Create clan
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Clan name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Orion Clan" autoFocus />
        </Field>
        <Field label="Program">
          <TextInput value={program} onChange={(e) => setProgram(e.target.value)} placeholder="e.g. Full-Stack Web Development" />
        </Field>
        <Field label="Clan leader (mentor)">
          <TextInput value={leader} onChange={(e) => setLeader(e.target.value)} placeholder="e.g. Sarah Chen" />
        </Field>
      </div>
    </Modal>
  );
}
