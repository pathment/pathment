import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  ClipboardCheck,
  AlertTriangle,
  Flag,
  ArrowUpRight,
  Clock,
} from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { useStore } from '@/store/AppStore';
import { DualProgress } from '@/components/DualProgress';
import {
  Avatar,
  Badge,
  Card,
  MomentumIcon,
  RISK_META,
  RiskDot,
  AiTag,
  cx,
} from '@/lib/ui';
import type { Mentee } from '@/lib/types';

type Filter = 'all' | 'attention' | 'review' | 'risk' | 'going_well';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'review', label: 'Awaiting my review' },
  { key: 'risk', label: 'At risk' },
  { key: 'going_well', label: 'Going well' },
];

function matches(m: Mentee, f: Filter) {
  switch (f) {
    case 'attention':
      return m.risk !== 'low' || m.openBlockers > 0 || m.pendingApprovals > 0;
    case 'review':
      return m.pendingApprovals > 0;
    case 'risk':
      return m.risk !== 'low';
    case 'going_well':
      return m.risk === 'low' && m.momentum !== 'down';
    default:
      return true;
  }
}

function StatChip({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: typeof Flag;
  value: number | string;
  label: string;
  accent: string;
}) {
  return (
    <Card className="relative overflow-hidden p-4">
      {/* thin colored ledger rule instead of a pastel bubble */}
      <span className={cx('absolute left-0 top-0 h-full w-0.5', accent)} />
      <div className="flex items-start justify-between">
        <div className="eyebrow">{label}</div>
        <Icon className="h-3.5 w-3.5 text-ink-faint" />
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold tracking-tight text-ink tnum">
        {value}
      </div>
    </Card>
  );
}

function MenteeCard({ m, onOpen }: { m: Mentee; onOpen: () => void }) {
  const risk = RISK_META[m.risk];
  return (
    <Card hover onClick={onOpen} className="group animate-slide-in p-5">
      <div className="flex items-start gap-3">
        <Avatar initials={m.avatar} name={m.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-ink">{m.name}</h3>
            <MomentumIcon momentum={m.momentum} />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-mute">
            <span>{m.level}</span>
            <span className="text-ink-faint">·</span>
            <span>
              Wk {m.week}/{m.totalWeeks}
            </span>
            <span className="text-ink-faint">·</span>
            <Clock className="h-3 w-3" />
            <span>{m.lastActive}</span>
          </div>
        </div>
        <Badge tone={risk.tone}>
          <RiskDot risk={m.risk} />
          {risk.label}
        </Badge>
      </div>

      <div className="my-4">
        <DualProgress absolute={m.absoluteProgress} relative={m.relativeProgress} compact />
      </div>

      {/* signal row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {m.pendingApprovals > 0 && (
          <Badge tone="brand">
            <ClipboardCheck className="h-3 w-3" />
            {m.pendingApprovals} to review
          </Badge>
        )}
        {m.openBlockers > 0 && (
          <Badge tone="rose">
            <Flag className="h-3 w-3" />
            {m.openBlockers} blocker{m.openBlockers > 1 ? 's' : ''}
          </Badge>
        )}
        <Badge tone="neutral">{m.onTimeRate}% on-time</Badge>
      </div>

      {m.riskReason && (
        <div className="mt-3 flex items-start gap-1.5 border-t border-neutral-100 pt-3">
          <AiTag>{''}</AiTag>
          <span className="text-xs leading-relaxed text-ink-mute">{m.riskReason}</span>
        </div>
      )}

      <div className="mt-3 flex items-center justify-end text-xs font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
        Open full story
        <ArrowUpRight className="ml-0.5 h-3.5 w-3.5" />
      </div>
    </Card>
  );
}

export function Cockpit() {
  const navigate = useNavigate();
  const { mentees, mentor } = useStore();
  const [filter, setFilter] = useState<Filter>('all');

  const list = useMemo(() => {
    return [...mentees]
      .filter((m) => matches(m, filter))
      .sort((a, b) => {
        const order = { high: 0, watch: 1, low: 2 } as const;
        if (order[a.risk] !== order[b.risk]) return order[a.risk] - order[b.risk];
        return b.pendingApprovals - a.pendingApprovals;
      });
  }, [filter, mentees]);

  const totals = useMemo(
    () => ({
      pending: mentees.reduce((n, m) => n + m.pendingApprovals, 0),
      blockers: mentees.reduce((n, m) => n + m.openBlockers, 0),
      atRisk: mentees.filter((m) => m.risk !== 'low').length,
    }),
    [mentees],
  );

  return (
    <Page>
      <PageHeader
        title={`Good morning, ${mentor.name.split(' ')[0]}`}
        subtitle={`${mentees.length} mentees · ${mentor.program} · Week 6`}
        actions={
          <button
            onClick={() => navigate('/mentor/review')}
            className="rounded-r inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            <Play className="h-4 w-4" />
            Start weekly review
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatChip icon={ClipboardCheck} value={totals.pending} label="Awaiting review" accent="bg-brand-500" />
        <StatChip icon={AlertTriangle} value={totals.atRisk} label="Need attention" accent="bg-[#FF3B30]" />
        <StatChip icon={Flag} value={totals.blockers} label="Open blockers" accent="bg-amber-500" />
        <StatChip icon={ClipboardCheck} value={`${Math.round(mentees.reduce((n, m) => n + m.onTimeRate, 0) / mentees.length)}%`} label="Cohort on-time" accent="bg-emerald-600" />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-0 border-b border-hairline">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cx(
              '-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors',
              filter === f.key
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-mute hover:text-ink',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((m) => (
          <MenteeCard key={m.id} m={m} onOpen={() => navigate(`/mentor/mentee/${m.id}`)} />
        ))}
      </div>

      {list.length === 0 && (
        <Card className="grid place-items-center py-16 text-center">
          <p className="text-sm text-ink-mute">No mentees match this filter — nice and quiet.</p>
        </Card>
      )}
    </Page>
  );
}
