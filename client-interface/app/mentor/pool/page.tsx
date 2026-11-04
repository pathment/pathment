'use client';

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Users2, Inbox, HandHeart, Search, Check } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { useClan, ALL_CLANS } from '@/lib/context/ClanContext';
import { qk, useApiQuery, STALE, useInvalidate } from '@/lib/query';
import { handoverPoolApi, type PoolEntry } from '@/lib/services/handover-pool-api';
import { useMentorCohort, type CohortMentee } from '@/lib/hooks/mentor';
import { PoolEntryCard } from '@/components/shared/pool/PoolEntryCard';
import { ClaimDrawer } from '@/components/shared/pool/ClaimDrawer';
import { PoolMenteeProfileDrawer } from '@/components/shared/pool/PoolMenteeProfileDrawer';
import { PushToPoolDrawer } from '@/components/shared/pool/PushToPoolDrawer';
import { Avatar } from '@/components/shared/Avatar';
import { useConfirm } from '@/lib/context/ConfirmContext';

/**
 * The handover pool, for a mentor: both directions, on one screen.
 *
 * This used to be one half of a two-way exchange. It listed the mentees other
 * mentors were offering and the ones this mentor had already offered - and
 * offered no way to hand anybody on, which lived on two other screens
 * entirely. With an empty pool, which is its ordinary state, the page was a
 * dead end: nothing to take, and no sign that handing somebody on was even a
 * thing you could do here.
 *
 * So: take on the left, hand on on the right. The right-hand side is not a
 * second pool list, it is this mentor's own mentees with their standing in the
 * pool shown on the row - offered or not - because "who have I offered" is a
 * fact about my mentees, not about the pool. That also means an empty pool
 * leaves half a working screen rather than a whole empty one.
 *
 * The two halves stay firmly apart. "Take them" and "Withdraw" mean opposite
 * things and must never sit on the same row.
 */

const RISK_CHIP: Record<string, string> = {
  high: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  watch: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
};

/** One of this mentor's mentees, as a row you can tick. */
function MenteeRow({ mentee, clanName, offeredEntry, selected, selectable, onToggle, onWithdraw, busy }: {
  mentee: CohortMentee;
  clanName: string | null;
  offeredEntry: PoolEntry | null;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
  onWithdraw: (entry: PoolEntry) => void;
  busy: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
        selected ? 'border-brand-300 bg-brand-50/60 dark:bg-brand-500/10' : 'border-border bg-card hover:bg-muted/50'
      }`}
    >
      {selectable ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${mentee.name}`}
          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
      ) : (
        <span className="w-4" aria-hidden />
      )}
      <Avatar name={mentee.name} src={mentee.profilePictureUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{mentee.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {clanName || 'No clan'} · {mentee.absoluteProgress}% through
          {mentee.openBlockers > 0 ? ` · ${mentee.openBlockers} roadblock${mentee.openBlockers === 1 ? '' : 's'}` : ''}
        </p>
      </div>
      {offeredEntry ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
            Offered
          </span>
          <button
            type="button"
            onClick={() => onWithdraw(offeredEntry)}
            disabled={busy}
            className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
          >
            Withdraw
          </button>
        </div>
      ) : (
        mentee.risk && (
          <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${RISK_CHIP[mentee.risk] || RISK_CHIP.low}`}>
            {mentee.risk === 'high' ? 'Needs attention' : mentee.risk === 'watch' ? 'Watch' : 'On track'}
          </span>
        )
      )}
    </li>
  );
}

export default function MentorPoolPage() {
  const { user } = useAuth();
  const { activeClanId, menteeClans } = useClan();
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const [claiming, setClaiming] = useState<PoolEntry | null>(null);
  const [viewingProfile, setViewingProfile] = useState<PoolEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [takeSearch, setTakeSearch] = useState('');
  const [giveSearch, setGiveSearch] = useState('');
  const [hideOffered, setHideOffered] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [handingOver, setHandingOver] = useState(false);

  const { data: entries, loading, refetch } = useApiQuery({
    queryKey: qk.handoverPool.list('open'),
    queryFn: () => handoverPoolApi.list({ status: 'open' }),
    staleTime: STALE.short,
  });

  const { data: clans } = useApiQuery({
    queryKey: qk.handoverPool.claimableClans,
    queryFn: () => handoverPoolApi.claimableClans(),
    staleTime: STALE.medium,
  });

  const { cohort, loading: cohortLoading, refetch: refetchCohort } = useMentorCohort();

  const refresh = useCallback(() => {
    invalidate(qk.handoverPool.all, qk.mentor.cohort);
    setPicked(new Set());
    return Promise.all([refetch(), refetchCohort()]);
  }, [invalidate, refetch, refetchCohort]);

  const { theirs, mine } = useMemo(() => {
    const all = entries ?? [];
    return {
      theirs: all.filter((e) => e.pushedBy !== user?.id),
      mine: all.filter((e) => e.pushedBy === user?.id),
    };
  }, [entries, user?.id]);

  /** Everything already offered, by anybody, so a row cannot be offered twice. */
  const offeredByMentee = useMemo(() => {
    const map = new Map<string, PoolEntry>();
    for (const entry of entries ?? []) if (entry.mentee?.id) map.set(entry.mentee.id, entry);
    return map;
  }, [entries]);

  const shownTake = useMemo(() => {
    const term = takeSearch.trim().toLowerCase();
    if (!term) return theirs;
    return theirs.filter((e) =>
      (e.mentee?.name || '').toLowerCase().includes(term)
      || (e.fromClan?.name || '').toLowerCase().includes(term)
      || (e.pushedByName || '').toLowerCase().includes(term));
  }, [theirs, takeSearch]);

  /**
   * The clan a mentee would be handed out of.
   *
   * With one clan selected it is that clan. On "All clans" the row carries its
   * own, because the server judges the offer per clan and a mentee in two of
   * them is a different offer from each.
   */
  const clanOf = useCallback((mentee: CohortMentee): { id: string; name: string | null } | null => {
    if (activeClanId && activeClanId !== ALL_CLANS) {
      const named = menteeClans.find((c) => c.id === activeClanId);
      return { id: activeClanId, name: named?.name ?? mentee.clan?.name ?? null };
    }
    if (mentee.clan?.id) return { id: mentee.clan.id, name: mentee.clan.name ?? null };
    const first = mentee.clans?.[0];
    return first?.id ? { id: first.id, name: first.name ?? null } : null;
  }, [activeClanId, menteeClans]);

  const shownGive = useMemo(() => {
    const term = giveSearch.trim().toLowerCase();
    return (cohort ?? []).filter((m) => {
      if (hideOffered && offeredByMentee.has(m.id)) return false;
      if (!term) return true;
      return m.name.toLowerCase().includes(term) || (m.clan?.name || '').toLowerCase().includes(term);
    });
  }, [cohort, giveSearch, hideOffered, offeredByMentee]);

  /** Only somebody not already offered, and with a clan to be offered out of. */
  const selectable = useCallback(
    (m: CohortMentee) => !offeredByMentee.has(m.id) && Boolean(clanOf(m)),
    [offeredByMentee, clanOf],
  );

  const selection = useMemo(
    () => shownGive
      .filter((m) => picked.has(m.id))
      .map((m) => {
        const clan = clanOf(m);
        return clan ? { menteeId: m.id, clanId: clan.id, name: m.name } : null;
      })
      .filter(Boolean) as { menteeId: string; clanId: string; name: string }[],
    [shownGive, picked, clanOf],
  );

  const eligible = shownGive.filter(selectable);
  const allPicked = eligible.length > 0 && eligible.every((m) => picked.has(m.id));

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const claim = async (toClanId: string) => {
    if (!claiming) return;
    setBusyId(claiming.id);
    try {
      const result = await handoverPoolApi.claim(claiming.id, toClanId);
      const carried = result.carried?.tasks ?? 0;
      toast.success(
        result.freshStart
          ? `${claiming.mentee?.name || 'They'} joined your clan — fresh start on this programme`
          : `${claiming.mentee?.name || 'They'} joined your clan with ${carried} task${carried === 1 ? '' : 's'}`,
      );
      setClaiming(null);
      await refresh();
    } catch (error) {
      /*
       * Losing a race is news, not a user error. Two mentors reaching for the
       * same person is the normal case when a cohort closes, so the message
       * says what happened and the list refreshes to drop the row — rather
       * than leaving a button that will keep failing.
       */
      const message = (error as { message?: string })?.message || 'Could not take this mentee';
      toast.error(message);
      setClaiming(null);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const withdraw = async (entry: PoolEntry) => {
    const ok = await confirm({
      title: 'Withdraw this handover?',
      description: `${entry.mentee?.name || 'They'} will stay in ${entry.fromClan?.name || 'your clan'} and come off the pool. Nothing about their work changes either way.`,
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

  const search = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Handover pool</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Take on a mentee whose mentor cannot carry on, or hand your own on. Their work travels
          with them either way — every task as it stands, with what they submitted and the feedback
          they were given. Nothing moves until somebody takes them.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Take someone in ─────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Inbox className="h-4 w-4" aria-hidden />
              Take someone in ({theirs.length})
            </h2>
          </div>
          {theirs.length > 3 && search(takeSearch, setTakeSearch, 'Search by name, clan or mentor')}

          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-muted/40" />
              ))}
            </div>
          ) : !shownTake.length ? (
            <div className="rounded-2xl border border-border bg-card py-12 text-center">
              <Users2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden />
              <p className="text-sm font-medium text-foreground">
                {takeSearch ? 'Nobody matches that' : 'Nobody is waiting'}
              </p>
              <p className="mt-1 px-6 text-sm text-muted-foreground">
                {takeSearch
                  ? 'Try a different name or clan.'
                  : 'When a mentor hands somebody on, they appear here for you to pick up.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {shownTake.map((entry) => (
                <PoolEntryCard
                  key={entry.id}
                  entry={entry}
                  busy={busyId === entry.id}
                  onViewProfile={setViewingProfile}
                  onClaim={clans?.some((clan) => clan.available && !clan.full) ? setClaiming : undefined}
                />
              ))}
            </ul>
          )}
        </section>

        {/* ── Hand someone on ─────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <HandHeart className="h-4 w-4" aria-hidden />
              Hand someone on ({mine.length ? `${mine.length} offered` : (cohort?.length ?? 0)})
            </h2>
            {eligible.length > 0 && (
              <button
                type="button"
                onClick={() => setPicked(allPicked ? new Set() : new Set(eligible.map((m) => m.id)))}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                {allPicked ? 'Clear' : `Select all ${eligible.length}`}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[12rem] flex-1">
              {search(giveSearch, setGiveSearch, 'Search your mentees')}
            </div>
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={hideOffered}
                onChange={(e) => setHideOffered(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Hide offered
            </label>
          </div>

          {cohortLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl border border-border bg-muted/40" />
              ))}
            </div>
          ) : !shownGive.length ? (
            <div className="rounded-2xl border border-border bg-card py-12 text-center">
              <Users2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden />
              <p className="text-sm font-medium text-foreground">
                {giveSearch || hideOffered ? 'Nobody matches that' : 'No mentees here'}
              </p>
              <p className="mt-1 px-6 text-sm text-muted-foreground">
                {giveSearch || hideOffered
                  ? 'Clear the filters to see everybody.'
                  : 'Pick a clan above to see who you could hand on.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {shownGive.map((mentee) => {
                const clan = clanOf(mentee);
                const offered = offeredByMentee.get(mentee.id) ?? null;
                return (
                  <MenteeRow
                    key={mentee.id}
                    mentee={mentee}
                    clanName={clan?.name ?? null}
                    /*
                     * Withdraw is offered for anyone on this list, not only
                     * for offers this mentor made: everybody here is in a
                     * clan they mentor, and a co-mentor taking back their
                     * lead's offer is exactly the case the server already
                     * allows. It refuses anyone else.
                     */
                    offeredEntry={offered}
                    selected={picked.has(mentee.id)}
                    selectable={selectable(mentee)}
                    onToggle={() => toggle(mentee.id)}
                    onWithdraw={withdraw}
                    busy={busyId === offered?.id}
                  />
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/*
        * The bulk bar only exists once something is ticked, and says exactly
        * what it will do. It sits above the fold of the page rather than at
        * the bottom of a long list, so a selection made at the top does not
        * require a scroll to act on.
        */}
      {selection.length > 0 && (
        <div className="sticky bottom-4 z-10 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-lg">
          <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
          <span className="min-w-0 flex-1 text-sm text-foreground">
            {selection.length} selected
          </span>
          <button
            type="button"
            onClick={() => setPicked(new Set())}
            className="shrink-0 text-xs font-medium text-muted-foreground hover:underline"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setHandingOver(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <HandHeart className="h-4 w-4" aria-hidden />
            Hand over {selection.length}
          </button>
        </div>
      )}

      <PushToPoolDrawer
        open={handingOver}
        onClose={() => setHandingOver(false)}
        onDone={refresh}
        clanId={selection[0]?.clanId || ''}
        selection={selection}
      />

      <ClaimDrawer
        entry={claiming}
        clans={clans ?? []}
        busy={!!busyId}
        onClose={() => setClaiming(null)}
        onConfirm={claim}
      />
      <PoolMenteeProfileDrawer entry={viewingProfile} onClose={() => setViewingProfile(null)} />
    </div>
  );
}
