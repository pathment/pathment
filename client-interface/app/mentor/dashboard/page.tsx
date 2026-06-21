'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, ClipboardCheck, AlertTriangle, Flag, Loader2, Plus,
} from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { useMentorCohort } from '@/lib/hooks/mentor';
import type { CohortMentee, CohortRisk } from '@/lib/types/cohort';
import { StatsCard } from '@/components/admin/ui';
import { MenteeCard } from '@/components/mentor/MenteeCard';
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
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-card px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Assign task
          </button>
          <button
            onClick={() => router.push('/mentor/review')}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
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
        <StatsCard icon={ClipboardCheck} label="Awaiting review" value={totals?.pendingApprovals ?? '…'} colorClass="text-brand-600 bg-brand-50" />
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
                ? 'border-brand-600 text-brand-700'
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
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : list.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">
            {cohort.length === 0
              ? "No mentees in your cohort yet - they'll appear here once assigned to a clan you mentor."
              : 'No mentees match this filter - nice and quiet.'}
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
