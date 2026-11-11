'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Info, ListOrdered, Loader2, Lock,
  RotateCcw, Search, ShieldCheck, Sparkles, Target, Users, Waypoints,
} from 'lucide-react';
import { qk, useApiQuery } from '@/lib/query';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { AvatarWithInitials } from '@/components/admin/ui';
import { poolApi, type Blocker, type PoolDashboard, type ScoredWork } from '@/lib/services/pool-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { ClanStatusBadge } from '@/components/shared/ClanStatusBadge';
import {
  Chip, DECISION, EmptyState, Spinner, WORK_SCORE, card, field, nameParts, panel, primaryBtn, pts, secondaryBtn,
} from './poolUi';

/**
 * Selection: rank, decide, place. One screen.
 *
 * It used to be two, behind a step switcher, and the first of them opened on a
 * matrix with a column per piece of work. In a real round that is fifty
 * columns of "never given", with the only two numbers anybody came for (the
 * total, and what it makes them) pushed off the right-hand edge. A table that
 * has to be scrolled sideways to answer its own question is not a table.
 *
 * So there is one row per candidate and the breakdown is behind it. The row
 * carries the rank, the total against what a perfect round is worth, how much
 * of their work is actually done, and the outcome. The per-piece detail is one
 * click away for the handful of people where it decides something.
 *
 * The three stages are the same list with a different last column, because
 * they are the same question asked later: who is ahead, who is in, where do
 * they go. Placing is not a separate place to visit.
 */

type Stage = 'scoring' | 'deciding' | 'placing';

interface Row {
  memberId: string;
  name: string;
  email: string;
  rank: number;
  total: number;
  possible: number;
  adjustment: number;
  adjustmentNote?: string | null;
  complete: boolean;
  work: ScoredWork[];
  outcome: string | null;
  tied: boolean;
}

/** Everything blocking or worth knowing, folded into one line that opens. */
function Checks({ items }: { items: Blocker[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const blocking = items.filter((b) => b.severity === 'block').length;
  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm text-slate-600 transition-colors hover:bg-muted sm:px-6"
      >
        <Info className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="flex-1">
          {items.length} thing{items.length === 1 ? '' : 's'} to check
          {blocking > 0 && <span className="ml-1.5 font-medium text-rose-700">({blocking} blocking)</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="space-y-1.5 px-5 pb-4 sm:px-6">
          {items.map((b) => (
            <li key={`${b.code}-${b.message}`} className="flex items-start gap-2 text-sm">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${b.severity === 'block' ? 'bg-rose-500' : 'bg-slate-300'}`} aria-hidden="true" />
              <span className={b.severity === 'block' ? 'text-slate-800' : 'text-slate-600'}>{b.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** How much of this candidate's work is finished, without a column each. */
function WorkProgress({ work }: { work: ScoredWork[] }) {
  const done = work.filter((w) => w.status === 'scored').length;
  const waiting = work.filter((w) => w.status === 'pending_review').length;
  const open = work.length - done - waiting;
  return (
    <span className="inline-flex items-center gap-2 text-xs tabular-nums text-slate-500" title={`${done} approved, ${waiting} awaiting review, ${open} outstanding`}>
      <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{done}</span>
      {waiting > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{waiting}</span>}
      {open > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-300" />{open}</span>}
    </span>
  );
}

/** The score, as a number you can read and a bar you can compare at a glance. */
function Score({ total, possible }: { total: number; possible: number }) {
  const pct = possible > 0 ? Math.max(0, Math.min(100, (total / possible) * 100)) : 0;
  return (
    <div className="w-32 shrink-0">
      <p className="text-sm font-semibold text-slate-900 tabular-nums">
        {total}
        {possible > 0 && <span className="text-xs font-normal text-slate-400"> / {possible}</span>}
      </p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** The per-piece breakdown, which is what the old matrix spread across the page. */
function Breakdown({ row }: { row: Row }) {
  return (
    <div className="border-t border-border bg-muted/30 px-5 py-4 sm:px-6">
      <ul className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
        {row.work.map((w) => {
          const meta = WORK_SCORE[w.status];
          return (
            <li key={w.key} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-slate-700">
                {w.label}
                {!w.required && <span className="ml-1.5 text-xs text-slate-400">optional</span>}
              </span>
              <span className="shrink-0 tabular-nums">
                {w.status === 'scored'
                  ? <span className="font-medium text-slate-900">{w.earned}<span className="text-xs font-normal text-slate-400"> / {w.points}</span></span>
                  : <span className={`text-xs ${meta?.cls || 'text-slate-400'}`}>{meta?.label || w.status}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {row.adjustment !== 0 && (
        <p className="mt-3 border-t border-border pt-3 text-sm">
          <span className="text-slate-500">Adjusted by hand: </span>
          <span className={`font-medium tabular-nums ${row.adjustment > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {row.adjustment > 0 ? '+' : ''}{row.adjustment}
          </span>
          {row.adjustmentNote && <span className="text-slate-500"> ({row.adjustmentNote})</span>}
        </p>
      )}
    </div>
  );
}

export function SelectionTab({ data, onChange, canSelect, canPlace }: {
  data: PoolDashboard; onChange: () => void; canSelect: boolean; canPlace: boolean;
}) {
  const { pool, members } = data;
  const confirm = useConfirm();

  const scores = useApiQuery({ queryKey: qk.pool.scores(pool.id), queryFn: () => poolApi.scores(pool.id) });
  const lists = useApiQuery({ queryKey: [...qk.pool.detail(pool.id), 'shortlists'], queryFn: () => poolApi.shortlists(pool.id) });
  const current = (lists.data || []).find((s) => s.status !== 'superseded');
  const shortlist = useApiQuery({
    queryKey: [...qk.pool.detail(pool.id), 'shortlist', current?.id || 'none'],
    queryFn: () => poolApi.shortlist(pool.id, current!.id),
    enabled: Boolean(current),
  });
  const confirmed = (lists.data || []).some((s) => s.status === 'confirmed');
  const placement = useApiQuery({
    queryKey: ['pools', pool.id, 'placement'],
    queryFn: () => poolApi.placementPreview(pool.id),
    enabled: confirmed && canPlace,
  });

  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, { outcome: string; reason: string }>>({});
  const [plan, setPlan] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(50);
  const [onlyOutcome, setOnlyOutcome] = useState('all');

  useEffect(() => {
    if (!placement.data) return;
    setPlan(Object.fromEntries(placement.data.rows.map((r) => [r.memberId, r.proposedClanId || ''])));
  }, [placement.data]);

  const refresh = async () => {
    await Promise.all([scores.refetch(), lists.refetch(), shortlist.refetch(), placement.refetch()]);
    onChange();
  };

  const list = shortlist.data;
  const stage: Stage = confirmed ? 'placing' : list ? 'deciding' : 'scoring';
  const tie = list?.blockers.find((b) => b.code === 'tie_at_cutoff');
  const hardBlocks = (list?.blockers || []).filter((b) => b.severity === 'block' && b.code !== 'tie_at_cutoff');
  const editable = canSelect && !!list && ['draft', 'blocked'].includes(list.status) && !hardBlocks.length;

  /** One row shape for all three stages, so the list never changes under you. */
  const rows: Row[] = useMemo(() => {
    if (list?.entries?.length) {
      return list.entries.map((e) => {
        const name = e.member?.user
          ? `${e.member.user.firstName} ${e.member.user.lastName}`
          : [e.member?.firstName, e.member?.lastName].filter(Boolean).join(' ') || e.member?.email || '';
        return {
          memberId: e.poolMemberId,
          name,
          email: e.member?.email || '',
          rank: e.rank,
          total: Number(e.totalScore),
          possible: e.possible ?? list.possible ?? 0,
          adjustment: e.adjustment ?? 0,
          complete: e.complete,
          work: e.components || [],
          outcome: overrides[e.poolMemberId]?.outcome || e.finalOutcome || e.proposedOutcome,
          tied: Boolean(tie?.memberIds?.includes(e.poolMemberId)),
        };
      });
    }
    return (scores.data?.rows || []).map((r) => ({
      memberId: r.memberId,
      name: r.name,
      email: r.email,
      rank: r.rank,
      total: r.total,
      possible: r.possible,
      adjustment: r.adjustment,
      adjustmentNote: r.adjustmentNote,
      complete: r.complete,
      work: r.components,
      outcome: r.proposedOutcome,
      tied: false,
    }));
  }, [list, scores.data, overrides, tie]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { selected: 0, waitlisted: 0, not_selected: 0 };
    for (const r of rows) if (r.outcome && c[r.outcome] !== undefined) c[r.outcome] += 1;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (onlyOutcome === 'all' || r.outcome === onlyOutcome)
      && (!q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)));
  }, [rows, search, onlyOutcome]);

  const generate = async () => {
    setGenerating(true);
    try {
      const out = await poolApi.generateShortlist(pool.id);
      toast.success(out.reused ? 'Nothing has changed since the last shortlist' : `Shortlist v${out.shortlist.version} generated`);
      await refresh();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not generate the shortlist'));
    } finally {
      setGenerating(false);
    }
  };

  const doConfirm = async () => {
    if (!list) return;
    const changes = Object.entries(overrides).map(([memberId, o]) => ({ memberId, outcome: o.outcome, reason: o.reason.trim() }));
    const missing = changes.some((o) => {
      const e = list.entries?.find((x) => x.poolMemberId === o.memberId);
      return (o.outcome !== e?.proposedOutcome || tie?.memberIds?.includes(o.memberId)) && !o.reason;
    });
    if (missing) return toast.error('Every change, and every tied candidate, needs a reason');
    const ok = await confirm({
      title: `Confirm shortlist v${list.version}?`,
      description: `${counts.selected} selected, ${counts.waitlisted} waitlisted, ${counts.not_selected} not selected. Candidates are told their outcome. Decisions can be changed one at a time afterwards, always with a reason.`,
      confirmLabel: 'Confirm selection',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await poolApi.confirm(pool.id, list.id, changes);
      toast.success('Selection confirmed. You can place people in clans below.');
      setOverrides({});
      await refresh();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not confirm the selection'));
    } finally {
      setBusy(false);
    }
  };

  const dirtyPlan = placement.data?.rows.some((r) => (plan[r.memberId] || '') !== (r.currentClanId || ''));
  const failed = members.filter((m) => m.placementStatus === 'failed');

  const place = async (memberIds?: string[]) => {
    const n = memberIds ? memberIds.length : placement.data?.rows.length || 0;
    const ok = await confirm({
      title: `Place ${n} candidate${n === 1 ? '' : 's'}?`,
      description: 'Each gets an enrollment and a clan membership in the planned clan, and the clan mentors are told. A full clan, or one without a lead mentor, fails that person only, so you can fix it and retry.',
      confirmLabel: 'Place',
    });
    if (!ok) return;
    setPlacing(true);
    try {
      if (dirtyPlan) await poolApi.setTargets(pool.id, Object.entries(plan).map(([memberId, clanId]) => ({ memberId, clanId: clanId || null })));
      const out = await poolApi.place(pool.id, memberIds);
      if (out.summary.failed) toast.warning(`${out.summary.placed} placed, ${out.summary.failed} failed. The reason is on each row.`);
      else toast.success(`${out.summary.placed} placed`);
      await refresh();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not run the placement'));
    } finally {
      setPlacing(false);
    }
  };

  if (scores.loading && !scores.data) return <Spinner />;

  // Nothing to rank on is a different problem, fixed somewhere else entirely.
  if (!scores.data?.work.length) {
    return (
      <section className={panel}>
        <EmptyState
          icon={ClipboardList}
          title="No qualifying work yet"
          text="A score is the points a candidate earned, so there is nothing to rank until this round has work. Add it from Manage pool."
        />
      </section>
    );
  }

  const possible = scores.data?.possible ?? 0;
  const placedCount = members.filter((m) => m.placementStatus === 'placed').length;
  const toPlace = placement.data?.rows.length ?? 0;

  const checks: Blocker[] = [
    ...(list?.blockers || []),
    ...(!list ? (scores.data?.blockers || []).map((b) => ({ ...b, severity: 'block' as const })) : []),
    ...(!list ? (scores.data?.warnings || []).map((w) => ({ ...w, severity: 'warn' as const })) : []),
  ];

  return (
    <div className="space-y-4">
      {/* What this screen is for, what state it is in, and the one thing to do next. */}
      <section className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:px-6">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base text-slate-900">
              <ListOrdered className="h-4 w-4 text-slate-400" aria-hidden="true" />
              {stage === 'placing' ? 'Selected candidates' : stage === 'deciding' ? `Shortlist v${list!.version}` : 'Ranking'}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {stage === 'placing'
                ? `${placedCount} of ${counts.selected} placed in a clan.`
                : `Ranked on points earned from reviewed work${possible ? `. A perfect round is worth ${pts(possible)}` : ''}. Selecting ${pool.selectionQuota}.`}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Chip cls={DECISION.selected.cls}>{counts.selected} selected</Chip>
              <Chip cls={DECISION.waitlisted.cls}>{counts.waitlisted} waitlisted</Chip>
              <Chip cls={DECISION.not_selected.cls}>{counts.not_selected} not selected</Chip>
              {stage !== 'scoring' && <span className="text-xs text-slate-400">of a quota of {pool.selectionQuota}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {stage === 'scoring' && canSelect && pool.status !== 'closed' && (
              <button onClick={generate} disabled={generating} className={primaryBtn}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate shortlist
              </button>
            )}
            {stage === 'deciding' && (
              <>
                {canSelect && pool.status !== 'closed' && (
                  <button onClick={generate} disabled={generating} className={secondaryBtn}>
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Regenerate
                  </button>
                )}
                {editable && (
                  <button onClick={doConfirm} disabled={busy} className={primaryBtn}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirm selection
                  </button>
                )}
              </>
            )}
            {stage === 'placing' && canPlace && (
              <>
                {failed.length > 0 && (
                  <button onClick={() => place(failed.map((m) => m.id))} disabled={placing} className={secondaryBtn}>
                    <RotateCcw className="h-4 w-4" /> Retry {failed.length} failed
                  </button>
                )}
                {toPlace > 0 && (
                  <button onClick={() => place()} disabled={placing} className={primaryBtn}>
                    {placing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Waypoints className="h-4 w-4" />} Place {toPlace}
                  </button>
                )}
                {toPlace === 0 && counts.selected > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> Everyone placed
                  </span>
                )}
              </>
            )}
            {confirmed && stage !== 'placing' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
                <Lock className="h-4 w-4" /> Confirmed
              </span>
            )}
          </div>
        </div>
        <Checks items={checks} />
      </section>

      {/* Where the selected people are going. Only once there are selected people. */}
      {stage === 'placing' && canPlace && placement.data && placement.data.clans.length > 0 && (
        <section className={panel}>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm font-medium text-slate-800 transition-colors hover:bg-muted sm:px-6">
              <Users className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <span className="flex-1">Clan capacity</span>
              {placement.data.insufficientCapacity && <span className="text-xs font-medium text-rose-700">Not enough room</span>}
              <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-90" />
            </summary>
            <div className="grid gap-3 border-t border-border px-5 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
              {placement.data.clans.map((c) => {
                const total = c.fill + c.planned;
                return (
                  <div key={c.id} className={`${card} p-4`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex min-w-0 items-center gap-1.5 font-medium text-slate-900"><span className="truncate">{c.name}</span><ClanStatusBadge status={c.status} /></p>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-slate-600 tabular-nums">
                        {c.cap ? `${total}/${c.cap}` : `${total}, no limit`}
                      </span>
                    </div>
                    {c.cap && (
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="flex h-full">
                          <div className="bg-slate-400" style={{ width: `${Math.min(100, (c.fill / c.cap) * 100)}%` }} />
                          <div className="bg-brand-500" style={{ width: `${Math.min(100, (c.planned / c.cap) * 100)}%` }} />
                        </div>
                      </div>
                    )}
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                      <ShieldCheck className="h-3.5 w-3.5" /> {c.lead ? `Lead: ${c.lead.name}` : 'No lead mentor'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 tabular-nums">
                      {c.active} active{c.paused ? ` · ${c.paused} paused` : ''}
                      {c.inactive && <span className="text-amber-700"> · not suggested</span>}
                    </p>
                    {c.problem && <p className="mt-1 text-xs font-medium text-rose-700">{c.problem}</p>}
                  </div>
                );
              })}
            </div>
          </details>
        </section>
      )}

      {/* The list. One row per person, at any size of round. */}
      <section className={panel}>
        <div className="flex flex-wrap items-center gap-2 p-4 sm:px-6">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setLimit(50); }}
              placeholder="Find a candidate by name or email"
              aria-label="Find a candidate"
              className={`${field} pl-9`}
            />
          </div>
          <select value={onlyOutcome} onChange={(e) => { setOnlyOutcome(e.target.value); setLimit(50); }} aria-label="Filter by outcome" className={`${field} w-auto min-w-40`}>
            <option value="all">Everyone ({rows.length})</option>
            <option value="selected">Selected ({counts.selected})</option>
            <option value="waitlisted">Waitlisted ({counts.waitlisted})</option>
            <option value="not_selected">Not selected ({counts.not_selected})</option>
          </select>
        </div>

        {!shown.length ? (
          <div className="border-t border-border">
            <EmptyState icon={Target} title="Nobody matches" text="Try another search, or a different outcome." />
          </div>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {shown.slice(0, limit).map((r) => {
              const placementRow = placement.data?.rows.find((p) => p.memberId === r.memberId);
              const member = members.find((m) => m.id === r.memberId);
              const open = expanded === r.memberId;
              return (
                <li key={r.memberId} className={r.tied ? 'bg-amber-50/40 dark:bg-amber-500/5' : ''}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5 sm:px-6">
                    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${r.rank <= 3 ? 'bg-brand-600 text-white' : 'bg-muted text-slate-600'}`}>
                      {r.rank}
                    </span>
                    <button
                      onClick={() => setExpanded(open ? null : r.memberId)}
                      aria-expanded={open}
                      className="flex min-w-48 flex-1 items-center gap-2 text-left"
                    >
                      <AvatarWithInitials {...nameParts(r.name, r.email)} email={r.email} size="sm" colorClass="bg-brand-100 text-brand-700" />
                      <ChevronRight className={`h-4 w-4 shrink-0 text-slate-300 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
                    </button>

                    <Score total={r.total} possible={r.possible || possible} />
                    <WorkProgress work={r.work} />

                    {/* The last column is the only thing that changes by stage. */}
                    {stage === 'deciding' && editable ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <select
                          value={r.outcome || 'not_selected'}
                          onChange={(e) => setOverrides((prev) => ({ ...prev, [r.memberId]: { outcome: e.target.value, reason: prev[r.memberId]?.reason || '' } }))}
                          aria-label={`Outcome for ${r.name}`}
                          className={`${field} w-36`}
                        >
                          <option value="selected">Selected</option>
                          <option value="waitlisted">Waitlisted</option>
                          <option value="not_selected">Not selected</option>
                        </select>
                        {(overrides[r.memberId] || r.tied) && (
                          <input
                            value={overrides[r.memberId]?.reason || ''}
                            placeholder={r.tied ? 'Reason (tied)' : 'Reason'}
                            onChange={(e) => setOverrides((prev) => ({ ...prev, [r.memberId]: { outcome: prev[r.memberId]?.outcome || r.outcome || 'not_selected', reason: e.target.value } }))}
                            aria-label={`Reason for ${r.name}`}
                            className={`${field} w-40`}
                          />
                        )}
                      </div>
                    ) : stage === 'placing' && r.outcome === 'selected' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {member?.placementStatus === 'placed' ? (
                          <Chip cls="bg-emerald-50 text-emerald-700 border-emerald-200">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> {member.placedClan?.name || 'Placed'}
                          </Chip>
                        ) : canPlace && placementRow ? (
                          <select
                            value={plan[r.memberId] || ''}
                            onChange={(e) => setPlan((p) => ({ ...p, [r.memberId]: e.target.value }))}
                            aria-label={`Clan for ${r.name}`}
                            className={`${field} w-44`}
                          >
                            <option value="">Choose a clan</option>
                            {(placement.data?.clans || []).map((c) => (
                              <option key={c.id} value={c.id} disabled={Boolean(c.problem)}>{c.name}{c.inactive ? ' · inactive' : ''}{c.problem ? ` (${c.problem})` : ''}</option>
                            ))}
                          </select>
                        ) : (
                          <Chip cls={DECISION.selected.cls}>Selected</Chip>
                        )}
                        {member?.placementStatus === 'failed' && (
                          <span className="text-xs text-rose-600">{placementRow?.placementError || 'Placement failed'}</span>
                        )}
                      </div>
                    ) : (
                      <Chip cls={r.outcome ? DECISION[r.outcome]?.cls || '' : 'bg-muted text-slate-500 border-border'}>
                        {r.outcome ? DECISION[r.outcome]?.label : 'Not ranked'}
                      </Chip>
                    )}
                  </div>
                  {open && <Breakdown row={r} />}
                </li>
              );
            })}
          </ul>
        )}

        {shown.length > limit && (
          <button onClick={() => setLimit((n) => n + 100)} className="w-full border-t border-border px-5 py-3 text-sm font-medium text-brand-700 transition-colors hover:bg-muted sm:px-6">
            Show 100 more ({shown.length - limit} left)
          </button>
        )}
      </section>

      {!canSelect && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" /> Only people who can select candidates may generate and confirm a shortlist.
        </p>
      )}
    </div>
  );
}
