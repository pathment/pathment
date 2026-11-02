'use client';

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Users2, AlarmClock, Inbox, Hourglass } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui';
import { ProgramClanFilter } from '@/components/shared/ProgramClanFilter';
import { qk, useApiQuery, STALE, useInvalidate } from '@/lib/query';
import { handoverPoolApi, type PoolEntry } from '@/lib/services/handover-pool-api';
import { PoolEntryCard } from '@/components/shared/pool/PoolEntryCard';
import { ClaimDrawer } from '@/components/shared/pool/ClaimDrawer';
import { PoolMenteeProfileDrawer } from '@/components/shared/pool/PoolMenteeProfileDrawer';
import { useConfirm } from '@/lib/context/ConfirmContext';

/**
 * The handover pool, for an admin.
 *
 * A mentor opens the pool to find somebody to take. An admin opens it to find
 * out whether it is WORKING — so this page leads with the one number that says
 * it is not: how many mentees have been sitting in it with nobody picking them
 * up. An offer nobody takes is a mentee without a mentor, and the whole point
 * of an oversight view is that nobody has to notice that by accident.
 *
 * Hence the ordering: the alarm first, then the per-programme breakdown so the
 * problem can be attributed, then the queue itself oldest-first. An admin can
 * also place or withdraw directly, because when something has gone stale the
 * person looking at it should be able to resolve it rather than go and ask.
 */
export default function AdminPoolPage() {
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const [scope, setScope] = useState({ programId: '', clanId: '' });
  const [claiming, setClaiming] = useState<PoolEntry | null>(null);
  const [viewingProfile, setViewingProfile] = useState<PoolEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, loading, refetch } = useApiQuery({
    queryKey: qk.handoverPool.overview(scope.programId),
    queryFn: () => handoverPoolApi.overview(scope.programId || null),
    staleTime: STALE.short,
  });

  const { data: clans } = useApiQuery({
    queryKey: qk.handoverPool.claimableClans,
    queryFn: () => handoverPoolApi.claimableClans(),
    staleTime: STALE.medium,
  });

  const refresh = useCallback(() => {
    invalidate(qk.handoverPool.all);
    return refetch();
  }, [invalidate, refetch]);

  const place = async (toClanId: string) => {
    if (!claiming) return;
    setBusyId(claiming.id);
    try {
      const result = await handoverPoolApi.claim(claiming.id, toClanId);
      toast.success(result.freshStart
        ? `${claiming.mentee?.name || 'They'} placed — fresh start on that programme`
        : `${claiming.mentee?.name || 'They'} placed with ${result.carried?.tasks ?? 0} tasks`);
      setClaiming(null);
      await refresh();
    } catch (error) {
      toast.error((error as { message?: string })?.message || 'Could not place this mentee');
      setClaiming(null);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const withdraw = async (entry: PoolEntry) => {
    const ok = await confirm({
      title: 'Take this handover off the pool?',
      description: `${entry.mentee?.name || 'They'} will stay in ${entry.fromClan?.name || 'their clan'}. Their mentor can put them back on the pool later.`,
      confirmLabel: 'Withdraw',
    });
    if (!ok) return;
    setBusyId(entry.id);
    try {
      await handoverPoolApi.withdraw(entry.id);
      toast.success('Taken off the pool');
      await refresh();
    } catch (error) {
      toast.error((error as { message?: string })?.message || 'Could not withdraw');
    } finally {
      setBusyId(null);
    }
  };

  const stats = [
    { label: 'Waiting for a clan', value: data?.open ?? 0, icon: Inbox, tone: 'text-foreground' },
    {
      label: 'Waiting over a week',
      value: data?.waitingTooLong ?? 0,
      icon: AlarmClock,
      tone: (data?.waitingTooLong ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground',
    },
    { label: 'Longest wait', value: `${data?.oldestDays ?? 0}d`, icon: Hourglass, tone: 'text-foreground' },
  ];
  const entries = useMemo(() => (data?.entries ?? []).filter((entry) =>
    !scope.clanId || entry.fromClan?.id === scope.clanId), [data?.entries, scope.clanId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Handover pool"
        subtitle="Mentees whose mentor cannot carry on with them, waiting for another clan to pick them up."
        backHref="/admin/dashboard"
        backLabel="Back to Dashboard"
      />

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-border bg-card p-5">
        <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
          {stats.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
              </span>
              <span>
                <span className={`block text-2xl font-semibold tabular-nums ${tone}`}>{value}</span>
                <span className="block text-xs text-muted-foreground">{label}</span>
              </span>
            </div>
          ))}
        </div>
        <ProgramClanFilter value={scope} onChange={setScope} />
      </div>

      {/* Attribution: which programme is leaving people unclaimed. */}
      {!!data?.byProgram?.length && data.byProgram.length > 1 && (
        <div className="rounded-3xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            By programme
          </h2>
          <ul className="divide-y divide-border">
            {data.byProgram.map((row) => (
              <li key={row.programId || 'none'} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate text-sm text-foreground">{row.programName}</span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {row.open} waiting
                  <span className={row.oldestDays >= 7 ? ' text-red-600 dark:text-red-400' : ''}>
                    {' '}&middot; longest {row.oldestDays}d
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-muted/40" />
          ))}
        </div>
      ) : !entries.length ? (
        <div className="rounded-2xl border border-border bg-card py-14 text-center">
          <Users2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden />
          <p className="text-sm font-medium text-foreground">Nobody is waiting for a clan</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Mentors put mentees here when they cannot carry on with them &mdash; usually when a
            programme closes.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <PoolEntryCard
              key={entry.id}
              entry={entry}
              busy={busyId === entry.id}
              onViewProfile={setViewingProfile}
              onClaim={clans?.some((clan) => clan.available && !clan.full) ? setClaiming : undefined}
              onWithdraw={entry.canWithdraw ? withdraw : undefined}
            />
          ))}
        </ul>
      )}

      {!!data?.recentlyClaimed?.length && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recently picked up
          </h2>
          <ul className="space-y-3">
            {data.recentlyClaimed.slice(0, 10).map((entry) => (
              <PoolEntryCard key={entry.id} entry={entry} />
            ))}
          </ul>
        </section>
      )}

      <ClaimDrawer
        entry={claiming}
        clans={clans ?? []}
        busy={!!busyId}
        onClose={() => setClaiming(null)}
        onConfirm={place}
      />
      <PoolMenteeProfileDrawer entry={viewingProfile} onClose={() => setViewingProfile(null)} />
    </div>
  );
}
