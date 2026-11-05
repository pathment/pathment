'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  ClipboardCheck,
  AlertTriangle,
  Flag,
  Loader2,
  Plus,
  Inbox,
  ArrowRight,
} from 'lucide-react';
import { useMentorApprovalCounts } from '@/lib/hooks/shared/useNavBadges';
import { useClan, ALL_CLANS, isHistoricalMentorScope } from '@/lib/context/ClanContext';
import { useAuth } from '@/lib/context/AuthContext';
import { useMentorCohort, type CohortRisk } from '@/lib/hooks/mentor';
import { Avatar } from '@/components/shared/Avatar';
import {
  needsMentorAttention,
  mentorAttentionReason,
} from '@/lib/mentorAttention';
import dynamic from 'next/dynamic';
import { AnnouncementsCard } from '@/components/shared/AnnouncementsCard';
import { DiscussionMeetingBanner } from '@/components/shared/discussions/meeting/DiscussionMeetingBanner';
import { MentorFeedbackCard } from '@/components/mentor/MentorFeedbackCard';

const AssignTaskDrawer = dynamic(() =>
  import('@/components/mentor/AssignTaskDrawer').then(
    (module) => module.AssignTaskDrawer,
  ),
);

export default function MentorCockpit() {
  const router = useRouter();
  const { user } = useAuth();
  const { clans, activeClanId } = useClan();
  const historical = isHistoricalMentorScope(clans, activeClanId);
  const approvals = useMentorApprovalCounts(!!user?.id);
  const approvalCount = approvals.loading
    ? '…'
    : approvals.error || !approvals.data
      ? '—'
      : activeClanId === ALL_CLANS
        ? approvals.data.total
        : (approvals.data.byClan[activeClanId] ?? 0);
  const { cohort, totals, loading, error, refetch } = useMentorCohort();
  const [bulkAssign, setBulkAssign] = useState(false);

  const noTaskCount = useMemo(
    () => cohort.filter((m) => m.taskCount === 0).length,
    [cohort],
  );

  const list = useMemo(() => {
    const order: Record<CohortRisk, number> = { high: 0, watch: 1, low: 2 };
    return [...cohort]
      .filter(needsMentorAttention)
      .sort((a, b) =>
        order[a.risk] !== order[b.risk]
          ? order[a.risk] - order[b.risk]
          : b.pendingApprovals - a.pendingApprovals,
      );
  }, [cohort]);

  return (
    <div className="mentor-cockpit space-y-6">
      {/* A group discussion meeting two minutes out, or live: start it from here. */}
      <DiscussionMeetingBanner role="mentor" />
      {/* Header */}
      <div className="mentor-cockpit-header flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">
            Good to see you{user?.firstName ? `, ${user.firstName}` : ''}
          </h1>
          <p className="text-slate-600">
            {totals
              ? `${totals.mentees} mentee${totals.mentees === 1 ? '' : 's'} in your cohort`
              : 'Your cohort at a glance'}
          </p>
        </div>
        <div className="mentor-cockpit-actions flex flex-wrap items-center gap-2">
          <button
            onClick={() => setBulkAssign(true)}
            disabled={cohort.length === 0 || historical}
            title={historical ? 'Completed programs are read-only' : undefined}
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
          cohort={cohort.map((m) => ({
            id: m.id,
            name: m.name,
            level: m.level,
            risk: m.risk,
            // Already loaded for the roster above; the picker was simply
            // never given it, so it listed forty bare names.
            avatarUrl: m.profilePictureUrl,
            clanName: m.clan?.name ?? null,
            taskCount: m.taskCount,
            pendingApprovals: m.pendingApprovals,
            openBlockers: m.openBlockers,
          }))}
          onClose={() => setBulkAssign(false)}
          onAssigned={refetch}
        />
      )}

      {/*
          Order of the page, top to bottom: what is happening, what needs
          doing, then everything else.

          Announcements were a full card near the bottom and are a single
          strip at the top now — worth seeing, not worth a block of the page,
          which is exactly what the report asked for. The no-tasks nudge was
          BELOW the two main panels, so the one piece of unambiguous work on
          the screen was the last thing you reached; it sits under the numbers
          it belongs with.
      */}
      <AnnouncementsCard compact mentor href="/mentor/announcements" />

      <div className="mentor-cockpit-stats grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Awaiting review',
            value: approvalCount,
            icon: ClipboardCheck,
            href: '/mentor/approvals',
          },
          {
            label: 'Needs attention',
            value: totals ? list.length : undefined,
            icon: AlertTriangle,
            href: '/mentor/mentees?filter=attention',
          },
          {
            label: 'Open roadblocks',
            value: totals?.openBlockers,
            icon: Flag,
            href: '/mentor/mentees?filter=blockers',
          },
          {
            label: 'Cohort on-time',
            value: totals ? `${totals.onTimeRate}%` : undefined,
            icon: Users,
            href: '/mentor/reports',
          },
        ].map((stat, index) => (
          <Link
            key={stat.href}
            href={stat.href}
            className={`mentor-stat mentor-stat-${index} group relative isolate overflow-hidden flex min-h-44 flex-col justify-between rounded-2xl p-5 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-500`}
          >
            <div className="flex min-h-10 items-center justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </span>
              <span className="rounded-xl bg-muted p-2.5 text-brand-600 dark:text-brand-300">
                <stat.icon className="h-5 w-5" />
              </span>
            </div>
            <p className="mt-4 text-4xl font-semibold tracking-tight tabular-nums text-foreground">
              {loading ? '…' : error ? '—' : (stat.value ?? '—')}
            </p>
            <span className="mt-4 flex min-h-11 items-center justify-between border-t border-border pt-3 text-xs font-medium text-muted-foreground group-hover:text-brand-600">
              {stat.label === 'Awaiting review'
                ? 'Open review queue'
                : stat.label === 'Needs attention'
                  ? 'See who needs support'
                  : stat.label === 'Open roadblocks'
                    ? 'Help someone move forward'
                    : 'Explore cohort progress'}
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </div>

      {/* A mentee with no work at all is the clearest call to action a mentor
          gets, so it sits with the numbers rather than under everything.
          The amber is gone: this is a prompt, not a warning, and the product
          reserves that colour for something being wrong. */}
      {noTaskCount > 0 && (
        <Link
          href="/mentor/mentees?filter=no_tasks"
          className="flex items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-3 transition-colors hover:border-brand-300 dark:border-brand-500/30 dark:bg-brand-500/10"
        >
          <span className="inline-flex items-center gap-2 text-sm text-brand-900 dark:text-brand-100">
            <Inbox className="w-4 h-4 shrink-0 text-brand-600 dark:text-brand-300" />
            <strong className="font-semibold">{noTaskCount}</strong> mentee
            {noTaskCount === 1 ? ' has' : 's have'} no tasks yet — assign work
            to get them started.
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-700 dark:text-brand-300">
            Assign <ArrowRight className="w-4 h-4" />
          </span>
        </Link>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-3xl border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-semibold">Your next check-ins</h2>
              <p className="text-sm text-muted-foreground mt-1">
                A few people who could use your help today.
              </p>
            </div>
            <Link
              href="/mentor/mentees?filter=attention"
              className="shrink-0 text-sm font-medium text-brand-700"
            >
              View all →
            </Link>
          </div>
          {loading ? (
            <Loader2
              aria-label="Loading priorities"
              className="my-8 mx-auto animate-spin text-brand-600"
            />
          ) : error ? (
            <div role="alert">
              <p className="text-sm text-muted-foreground">{error}</p>
              <button onClick={refetch} className="mt-3 text-brand-700">
                Try again
              </button>
            </div>
          ) : list.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">
              {cohort.length
                ? 'Everyone is on track. A good moment to plan what comes next.'
                : 'Your mentees will appear here once assigned to your clan.'}
            </p>
          ) : (
            <div className="space-y-3">
              {list.slice(0, 3).map((m) => (
                <Link
                  key={m.id}
                  href={`/mentor/mentees/${m.id}`}
                  className="group flex items-center gap-4 p-4 rounded-2xl border border-border bg-muted/30 hover:border-brand-300 hover:bg-muted/60 transition-colors"
                >
                  <Avatar name={m.name} src={m.profilePictureUrl} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{m.name}</p>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                      {mentorAttentionReason(m)}
                    </p>
                    <p className="mt-2 text-xs font-medium text-brand-700 dark:text-brand-300">
                      {m.openBlockers
                        ? 'Help resolve a roadblock'
                        : m.pendingApprovals
                          ? 'Review their progress'
                          : 'Plan a check-in'}{' '}
                      →
                    </p>
                  </div>
                  <span className="hidden sm:block text-xs text-muted-foreground whitespace-nowrap">
                    {m.lastActive || 'No activity yet'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-1">
            Make time for what matters
          </h2>
          <p className="text-sm text-muted-foreground mb-5">
            Go straight to your next action.
          </p>
          {[
            {
              href: '/mentor/review',
              title: 'Run a clan review',
              description: 'Submissions, attendance and next steps together.',
            },
            {
              href: '/mentor/schedules',
              title: 'Plan your next session',
              description: 'Manage meetings and upcoming time with your clan.',
            },
            {
              href: '/mentor/roadmaps',
              title: 'Build the next learning step',
              description: 'Roadmaps, assignments, interviews and quizzes.',
            },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3 mb-2 hover:bg-brand-50 transition-colors"
            >
              <div>
                <p className="text-sm font-medium">{action.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {action.description}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-brand-600" />
            </Link>
          ))}
        </section>
      </div>

      {/* Your anonymous mentee feedback (gated until enough responses) */}
      <MentorFeedbackCard />
    </div>
  );
}
