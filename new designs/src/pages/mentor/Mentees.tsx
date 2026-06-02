import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowUpRight, MapPin, Clock, Flag, Users, ClipboardCheck } from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { useStore } from '@/store/AppStore';
import { DualProgress } from '@/components/DualProgress';
import { Avatar, Badge, Card, MomentumIcon, RISK_META, RiskDot, cx } from '@/lib/ui';
import { Segmented } from '@/components/overlays';
import type { Mentee, Risk } from '@/lib/types';

type RiskFilter = 'all' | Risk;
const RISK_FILTERS: { key: RiskFilter; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'low', label: 'On track' },
  { key: 'watch', label: 'Watch' },
  { key: 'high', label: 'At risk' },
];

type Sort = 'name' | 'risk' | 'progress' | 'review';
const RISK_RANK: Record<Risk, number> = { high: 0, watch: 1, low: 2 };

export function Mentees() {
  const navigate = useNavigate();
  const { mentees, mentor } = useStore();
  const [query, setQuery] = useState('');
  const [risk, setRisk] = useState<RiskFilter>('all');
  const [sort, setSort] = useState<Sort>('risk');

  const totals = useMemo(
    () => ({
      atRisk: mentees.filter((m) => m.risk !== 'low').length,
      pending: mentees.reduce((n, m) => n + m.pendingApprovals, 0),
      blockers: mentees.reduce((n, m) => n + m.openBlockers, 0),
    }),
    [mentees],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = mentees.filter((m) => {
      if (risk !== 'all' && m.risk !== risk) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.program.toLowerCase().includes(q) ||
        m.level.toLowerCase().includes(q) ||
        m.location.toLowerCase().includes(q)
      );
    });
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'progress') return a.absoluteProgress - b.absoluteProgress;
      if (sort === 'review') return b.pendingApprovals - a.pendingApprovals;
      // risk: most at-risk first, then lower on-time
      const r = RISK_RANK[a.risk] - RISK_RANK[b.risk];
      return r !== 0 ? r : a.onTimeRate - b.onTimeRate;
    });
    return sorted;
  }, [mentees, query, risk, sort]);

  return (
    <Page>
      <PageHeader
        title="My mentees"
        subtitle={`${mentees.length} mentees in ${mentor.program}`}
      />

      {/* quick stat strip */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatChip icon={Users} value={mentees.length} label="Total mentees" accent="bg-ink" />
        <StatChip icon={ClipboardCheck} value={totals.pending} label="Awaiting review" accent="bg-brand-500" />
        <StatChip icon={Flag} value={totals.atRisk} label="Need attention" accent="bg-[#FF3B30]" />
      </div>

      {/* search + filters + sort */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, level, location…"
            className="h-10 w-full rounded-r border border-neutral-200 bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-300"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {RISK_FILTERS.map((f) => {
            const active = risk === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setRisk(f.key)}
                className={cx(
                  'rounded-r inline-flex items-center gap-1.5 border px-3 py-1.5 text-sm font-medium transition-colors',
                  active ? 'border-ink bg-ink text-white' : 'border-hairline text-ink-soft hover:border-ink',
                )}
              >
                {f.key !== 'all' && <span className={cx('h-2 w-2 rounded-full', RISK_META[f.key].dot)} />}
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-ink-mute tnum">
          Showing {filtered.length} of {mentees.length}
        </span>
        <div className="w-64">
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              { value: 'risk', label: 'Risk' },
              { value: 'review', label: 'Review' },
              { value: 'progress', label: 'Progress' },
              { value: 'name', label: 'A-Z' },
            ]}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="mt-4 grid place-items-center py-20 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-r bg-neutral-100 text-ink-faint">
            <Users className="h-6 w-6" />
          </span>
          <p className="mt-4 text-base font-medium text-ink">No mentees match that.</p>
          <p className="mt-1 text-sm text-ink-mute">Try a different name, level, or filter.</p>
        </Card>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {filtered.map((m) => (
            <MenteeCard key={m.id} m={m} onOpen={() => navigate(`/mentor/mentee/${m.id}`)} />
          ))}
        </div>
      )}
    </Page>
  );
}

function StatChip({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: typeof Users;
  value: number;
  label: string;
  accent: string;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className={cx('grid h-9 w-9 shrink-0 place-items-center text-white', accent)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-lg font-semibold text-ink tnum">{value}</div>
        <div className="truncate text-[11px] uppercase tracking-wide text-ink-faint">{label}</div>
      </div>
    </Card>
  );
}

function MenteeCard({ m, onOpen }: { m: Mentee; onOpen: () => void }) {
  const r = RISK_META[m.risk];
  return (
    <Card hover onClick={onOpen} className="group p-5">
      <div className="flex items-start gap-3">
        <Avatar initials={m.avatar} name={m.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-ink">{m.name}</h3>
            <MomentumIcon momentum={m.momentum} />
          </div>
          <div className="mt-0.5 truncate text-xs text-ink-mute">
            {m.level} · Wk {m.week}/{m.totalWeeks}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-ink-faint">
            <MapPin className="h-3 w-3" />
            {m.location}
          </div>
        </div>
        <Badge tone={r.tone}>
          <RiskDot risk={m.risk} />
          {r.label}
        </Badge>
      </div>

      <div className="my-4">
        <DualProgress absolute={m.absoluteProgress} relative={m.relativeProgress} compact />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-neutral-100 pt-3 text-xs text-ink-mute">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5 text-ink-faint" />
          {m.onTimeRate}% on-time
        </span>
        {m.pendingApprovals > 0 && (
          <span className="inline-flex items-center gap-1 text-brand-600">
            <ClipboardCheck className="h-3.5 w-3.5" />
            {m.pendingApprovals} to review
          </span>
        )}
        {m.openBlockers > 0 && (
          <span className="inline-flex items-center gap-1 text-rose-600">
            <Flag className="h-3.5 w-3.5" />
            {m.openBlockers} blocker{m.openBlockers > 1 ? 's' : ''}
          </span>
        )}
        <span className="text-ink-faint">Active {m.lastActive}</span>
        <span className="ml-auto inline-flex items-center gap-1 font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
          Open profile <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Card>
  );
}
