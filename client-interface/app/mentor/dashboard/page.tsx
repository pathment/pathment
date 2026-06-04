'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, ClipboardCheck, AlertTriangle, Flag, Clock,
  TrendingUp, TrendingDown, Minus, Loader2, ArrowUpRight, Plus,
} from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { useMentorCohort, type CohortMentee, type CohortRisk, type CohortMomentum } from '@/lib/hooks/mentor';
import { StatsCard } from '@/components/admin/ui';
import { DualProgress } from '@/components/mentor/DualProgress';
import { AssignTaskDrawer } from '@/components/mentor/AssignTaskDrawer';
import { AnnouncementsCard } from '@/components/shared/AnnouncementsCard';
import { MentorFeedbackCard } from '@/components/mentor/MentorFeedbackCard';

type Filter = 'all' | 'attention' | 'review' | 'risk' | 'going_well';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'review', label: 'Awaiting my review' },
  { key: 'risk', label: 'At risk' },
  { key: 'going_well', label: 'Going well' },
];

function matches(m: CohortMentee, f: Filter): boolean {
  switch (f) {
    case 'attention': return m.risk !== 'low' || m.openBlockers > 0 || m.pendingApprovals > 0;
    case 'review': return m.pendingApprovals > 0;
    case 'risk': return m.risk !== 'low';
    case 'going_well': return m.risk === 'low' && m.momentum !== 'down';
    default: return true;
  }
}

const RISK_BADGE: Record<CohortRisk, { label: string; className: string; dot: string }> = {
  high:  { label: 'At risk',     className: 'bg-red-50 text-red-700 border-red-200',         dot: 'bg-red-500' },
  watch: { label: 'Watch',       className: 'bg-amber-50 text-amber-700 border-amber-200',   dot: 'bg-amber-500' },
  low:   { label: 'On track',    className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
};

function MomentumIcon({ momentum }: { momentum: CohortMomentum }) {
  if (momentum === 'up') return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  if (momentum === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-slate-400" />;
}

function MenteeCard({ m, onOpen }: { m: CohortMentee; onOpen: () => void }) {
  const risk = RISK_BADGE[m.risk];
  return (
    <button
      onClick={onOpen}
      className="group text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
          <span className="text-indigo-700 font-medium text-sm">{m.avatar}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-slate-900">{m.name}</p>
            <MomentumIcon momentum={m.momentum} />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
            <span>{m.level}</span>
            <span className="text-slate-300">·</span>
            <span>Wk {m.week}/{m.totalWeeks || '—'}</span>
            <span className="text-slate-300">·</span>
            <Clock className="w-3 h-3" />
            <span>{m.lastActive}</span>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${risk.className}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${risk.dot}`} />
          {risk.label}
        </span>
      </div>

      <div className="my-4">
        <DualProgress absolute={m.absoluteProgress} relative={m.relativeProgress} compact />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {m.pendingApprovals > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium">
            <ClipboardCheck className="w-3 h-3" />{m.pendingApprovals} to review
          </span>
        )}
        {m.openBlockers > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs font-medium">
            <Flag className="w-3 h-3" />{m.openBlockers} blocker{m.openBlockers > 1 ? 's' : ''}
          </span>
        )}
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
          {m.onTimeRate}% on-time
        </span>
      </div>

      {m.riskReason && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <span className="text-xs leading-relaxed text-slate-500">{m.riskReason}</span>
        </div>
      )}

      <div className="mt-3 flex items-center justify-end text-xs font-medium text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
        Open full story <ArrowUpRight className="ml-0.5 w-3.5 h-3.5" />
      </div>
    </button>
  );
}

export default function MentorCockpit() {
  const router = useRouter();
  const { user } = useAuth();
  const { cohort, totals, loading, error, refetch } = useMentorCohort();
  const [filter, setFilter] = useState<Filter>('all');
  const [bulkAssign, setBulkAssign] = useState(false);

  const list = useMemo(() => {
    const order: Record<CohortRisk, number> = { high: 0, watch: 1, low: 2 };
    return [...cohort]
      .filter((m) => matches(m, filter))
      .sort((a, b) =>
        order[a.risk] !== order[b.risk]
          ? order[a.risk] - order[b.risk]
          : b.pendingApprovals - a.pendingApprovals
      );
  }, [cohort, filter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">
            Good to see you{user?.firstName ? `, ${user.firstName}` : ''}
          </h1>
          <p className="text-slate-600">
            {totals ? `${totals.mentees} mentee${totals.mentees === 1 ? '' : 's'} in your cohort` : 'Your cohort at a glance'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setBulkAssign(true)}
            disabled={cohort.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Assign task
          </button>
          <button
            onClick={() => router.push('/mentor/review')}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <ClipboardCheck className="w-4 h-4" />
            Start weekly review
          </button>
        </div>
      </div>

      {bulkAssign && (
        <AssignTaskDrawer
          mode="bulk"
          cohort={cohort.map((m) => ({ id: m.id, name: m.name, level: m.level, risk: m.risk }))}
          onClose={() => setBulkAssign(false)}
          onAssigned={refetch}
        />
      )}

      {/* Stat chips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <StatsCard icon={ClipboardCheck} label="Awaiting review" value={totals?.pendingApprovals ?? '…'} colorClass="text-indigo-600 bg-indigo-50" />
        <StatsCard icon={AlertTriangle} label="Need attention" value={totals?.atRisk ?? '…'} colorClass="text-red-600 bg-red-50" />
        <StatsCard icon={Flag} label="Open blockers" value={totals?.openBlockers ?? '…'} colorClass="text-amber-600 bg-amber-50" />
        <StatsCard icon={Users} label="Cohort on-time" value={totals ? `${totals.onTimeRate}%` : '…'} colorClass="text-emerald-600 bg-emerald-50" />
      </div>

      {/* Latest announcements */}
      <AnnouncementsCard href="/mentor/announcements" />

      {/* Your anonymous mentee feedback (gated until enough responses) */}
      <MentorFeedbackCard />

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-0 border-b border-slate-200">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${
              filter === f.key
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">Try again</button>
        </div>
      ) : list.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">
            {cohort.length === 0
              ? "No mentees in your cohort yet — they'll appear here once assigned to a clan you mentor."
              : 'No mentees match this filter — nice and quiet.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((m) => (
            <MenteeCard key={m.id} m={m} onOpen={() => router.push(`/mentor/mentees/${m.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
