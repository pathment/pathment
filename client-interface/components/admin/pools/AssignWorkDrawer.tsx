'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, Search, Send, Users } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { Avatar } from '@/components/shared/Avatar';
import { poolApi, type PoolAssignment, type PoolDashboard, type PoolMemberRow } from '@/lib/services/pool-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { bucketMeta, pts } from './poolUi';

/**
 * Handing work out to the people who should have it.
 *
 * The pool could only ever give a piece of work to EVERYBODY. That is the
 * common case and it stays one click, but it is not the only one: somebody
 * joins a round late and owes two of the five pieces, one candidate needs a
 * second interview, a reviewer wants to try an extra project on the two people
 * tied at the cutoff. All of that is "this work, these people".
 *
 * Two directions, one drawer:
 *   mode 'work'    one piece of work → chosen candidates
 *   mode 'member'  one candidate → chosen pieces of work
 */

const checkbox = 'h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500';
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const rowCls = (on: boolean, disabled: boolean) =>
  `flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/50'
  } ${on ? 'bg-brand-50/60 dark:bg-brand-500/10' : ''}`;

/** Who can be given work at all, and why not when they cannot. */
function blockedReason(m: PoolMemberRow): string | null {
  if (m.decision) return `Already ${m.decision.replace('_', ' ')}`;
  if (!m.userId) return 'Has not activated their account, so they get it automatically when they do';
  return null;
}

export function AssignWorkDrawer({
  data,
  assignment,
  member,
  onClose,
  onDone,
}: {
  data: PoolDashboard;
  /** mode 'work': the piece of work being handed out. */
  assignment?: PoolAssignment;
  /** mode 'member': the candidate being given work. */
  member?: PoolMemberRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { pool } = data;
  const byWork = Boolean(assignment);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // ── mode 'work': the candidates ──────────────────────────────────────────
  const alreadyHas = useMemo(() => {
    if (!assignment) return new Set<string>();
    return new Set(
      data.members
        .filter((m) => m.work.some((w) => w.assignmentId === assignment.id && w.status && w.status !== 'cancelled'))
        .map((m) => m.id),
    );
  }, [assignment, data.members]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? data.members.filter((m) => `${m.name} ${m.email}`.toLowerCase().includes(q))
      : data.members;
    // Those who can be given it first; those who already hold it last.
    return [...rows].sort((a, b) =>
      Number(Boolean(blockedReason(a)) || alreadyHas.has(a.id)) - Number(Boolean(blockedReason(b)) || alreadyHas.has(b.id))
      || a.name.localeCompare(b.name));
  }, [data.members, query, alreadyHas]);

  // ── mode 'member': the pieces of work ────────────────────────────────────
  const memberHas = useMemo(
    () => new Set((member?.work || []).filter((w) => w.status && w.status !== 'cancelled').map((w) => w.assignmentId)),
    [member],
  );
  const work = useMemo(() => {
    const live = data.assignments.filter((a) => !a.cancelledAt);
    const q = query.trim().toLowerCase();
    const rows = q ? live.filter((a) => a.title.toLowerCase().includes(q)) : live;
    return [...rows].sort((a, b) => Number(memberHas.has(a.id)) - Number(memberHas.has(b.id)));
  }, [data.assignments, query, memberHas]);

  const selectable = byWork
    ? candidates.filter((m) => !blockedReason(m) && !alreadyHas.has(m.id)).map((m) => m.id)
    : work.filter((a) => !memberHas.has(a.id)).map((a) => a.id);
  const allOn = selectable.length > 0 && selectable.every((id) => picked.includes(id));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const worth = byWork
    ? (assignment?.points ?? 0)
    : work.filter((a) => picked.includes(a.id)).reduce((sum, a) => sum + a.points, 0);

  const submit = async () => {
    if (!picked.length) {
      toast.error(byWork ? 'Choose at least one candidate' : 'Choose at least one piece of work');
      return;
    }
    setBusy(true);
    try {
      const out = byWork
        ? await poolApi.assign(pool.id, assignment!.id, picked)
        : await poolApi.assignToMember(pool.id, member!.id, picked);
      const { assigned = 0, skipped = 0, failed = 0 } = out.summary as Record<string, number>;
      const noun = byWork
        ? `candidate${assigned === 1 ? '' : 's'}`
        : `piece${assigned === 1 ? '' : 's'} of work`;
      if (assigned) toast.success(`Given to ${assigned} ${noun}${skipped ? ` · ${skipped} already had it` : ''}`);
      else toast.info(skipped ? 'Everybody chosen already had it' : 'Nothing was given');
      if (failed) {
        const first = out.results.find((r) => r.result === 'failed');
        toast.error(`${failed} could not be given${first?.reason ? `: ${first.reason}` : ''}`);
      }
      onDone();
      onClose();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not assign the work'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={byWork ? `Give “${assignment!.title}” to…` : `Give work to ${member!.name}`}
      subtitle={
        byWork
          ? `Worth ${pts(assignment!.points)} · ${pool.name}`
          : `${member!.email} · ${pool.name}`
      }
      width="md"
      footer={(dismiss) => (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {picked.length
              ? byWork
                ? `${picked.length} chosen`
                : `${picked.length} chosen · ${pts(worth)} on offer`
              : 'Nobody chosen yet'}
          </span>
          <div className="flex gap-2">
            <button onClick={dismiss} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
            <button
              onClick={submit}
              disabled={busy || !picked.length}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Give it
            </button>
          </div>
        </div>
      )}
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={byWork ? 'Search candidates…' : 'Search the pool’s work…'}
            aria-label={byWork ? 'Search candidates' : 'Search work'}
            className={`${inputCls} pl-9`}
          />
        </div>

        {selectable.length > 1 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setPicked(allOn ? picked.filter((id) => !selectable.includes(id)) : [...new Set([...picked, ...selectable])])}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              {allOn ? 'Clear all' : `Select all ${selectable.length}`}
            </button>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-border">
          {byWork ? (
            candidates.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nobody matches that search.</p>
            ) : (
              <ul className="divide-y divide-border">
                {candidates.map((m) => {
                  const reason = blockedReason(m);
                  const has = alreadyHas.has(m.id);
                  const bucket = bucketMeta(m.bucket);
                  return (
                    <li key={m.id}>
                      <label className={rowCls(picked.includes(m.id), Boolean(reason) || has)}>
                        <input
                          type="checkbox"
                          checked={picked.includes(m.id)}
                          disabled={Boolean(reason) || has}
                          onChange={() => toggle(m.id)}
                          className={checkbox}
                          aria-label={m.name}
                        />
                        <Avatar name={m.name} src={m.avatarUrl} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-800">{m.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {has ? 'Already has this work' : reason || m.email}
                          </span>
                        </span>
                        {!has && !reason && bucket && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">{bucket.label}</span>
                        )}
                        {has && <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )
          ) : work.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {data.assignments.length ? 'No work matches that search.' : 'This round has no work yet. Add some from Manage pool.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {work.map((a) => {
                const has = memberHas.has(a.id);
                return (
                  <li key={a.id}>
                    <label className={rowCls(picked.includes(a.id), has)}>
                      <input
                        type="checkbox"
                        checked={picked.includes(a.id)}
                        disabled={has}
                        onChange={() => toggle(a.id)}
                        className={checkbox}
                        aria-label={a.title}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{a.title}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          <span className="capitalize">{a.kind}</span> · {a.required ? 'Required' : 'Optional'}
                          {has ? ' · already has it' : ''}
                        </span>
                      </span>
                      <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-600">{pts(a.points)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Users className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          Nobody is given the same work twice, so this is safe to repeat. Candidates who have not activated their
          account yet receive the pool&apos;s work the moment they do.
        </p>
      </div>
    </Drawer>
  );
}
