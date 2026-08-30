'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell, MessageSquare, ArrowUpRight, Clock, TrendingUp, TrendingDown, Minus, Loader2,
} from 'lucide-react';
import { useMentorCohort, type CohortMentee, type CohortMomentum } from '@/lib/hooks/mentor';
import { DualProgress } from '@/components/mentor/DualProgress';
import { BulkNudgeDrawer } from '@/components/mentor/BulkNudgeDrawer';

const GAP_THRESHOLD = 15; // relative−absolute gap that signals "real constraints"

type GroupKey = 'struggling' | 'disengaged' | 'watch';

const GROUPS: Record<GroupKey, { title: string; blurb: string; accent: string; ring: string }> = {
  struggling: {
    title: 'Struggling despite effort',
    blurb: 'Behind the plan, but logging real constraints and still showing up. Support, don’t push.',
    accent: 'text-amber-700', ring: 'border-amber-200',
  },
  disengaged: {
    title: 'Disengaged',
    blurb: 'Behind with little logged reason - effort looks like it’s dropping. Reach out early.',
    accent: 'text-red-700', ring: 'border-red-200',
  },
  watch: {
    title: 'Worth a watch',
    blurb: 'Drifting a little but still active. A light touch now keeps them on track.',
    accent: 'text-slate-700', ring: 'border-slate-200',
  },
};

function classify(m: CohortMentee): GroupKey | null {
  if (m.risk === 'low') return null;
  const gap = m.relativeProgress - m.absoluteProgress;
  if (gap >= GAP_THRESHOLD) return 'struggling';
  if (m.risk === 'high') return 'disengaged';
  return 'watch';
}

function MomentumIcon({ momentum }: { momentum: CohortMomentum }) {
  if (momentum === 'up') return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  if (momentum === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-slate-400" />;
}

function RiskCard({ m, selected, onToggle, onNudge, onOpen }: {
  m: CohortMentee;
  selected: boolean;
  onToggle: () => void;
  onNudge: () => void;
  onOpen: () => void;
}) {
  const router = useRouter();
  return (
    <div className={`bg-card rounded-2xl border p-5 transition-colors ${selected ? 'border-brand-300 ring-1 ring-brand-200' : 'border-slate-200'}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${m.name}`}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <div className="w-11 h-11 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
          <span className="text-brand-700 font-medium text-sm">{m.avatar}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-slate-900">{m.name}</p>
            <MomentumIcon momentum={m.momentum} />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
            <span>{m.level}</span><span className="text-slate-300">·</span>
            <Clock className="w-3 h-3" /><span>{m.lastActive}</span>
          </div>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold uppercase tracking-wide ${m.risk === 'high' ? 'border-red-200 bg-red-50 text-red-600' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
          <span className={`w-1.5 h-1.5 rounded-sm ${m.risk === 'high' ? 'bg-red-500' : 'bg-amber-500'}`} />{m.risk === 'high' ? 'At risk' : 'Watch'}
        </span>
      </div>

      <div className="my-4 ml-7">
        <DualProgress absolute={m.absoluteProgress} relative={m.relativeProgress} compact />
      </div>

      {m.riskReason && (
        <p className="ml-7 flex items-start gap-1.5 text-sm leading-relaxed text-slate-600 border-t border-slate-100 pt-3">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />{m.riskReason}
        </p>
      )}

      {(m.signals?.length ?? 0) > 0 && (
        <div className="mt-2 ml-7 flex flex-wrap gap-1.5">
          {m.signals!.map((s, i) => (
            <span key={i} className="px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-[11px] text-slate-600 font-mono">{s}</span>
          ))}
        </div>
      )}

      <div className="mt-3 ml-7 flex items-center gap-2">
        <button
          type="button"
          onClick={onNudge}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-50 text-brand-700 text-xs font-medium hover:bg-brand-100"
        >
          <Bell className="w-3.5 h-3.5" />Nudge
        </button>
        <button
          type="button"
          onClick={() => router.push(`/mentor/messages?participantId=${m.id}`)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:border-brand-300"
        >
          <MessageSquare className="w-3.5 h-3.5" />Message
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          Open profile <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function MentorAtRisk() {
  const router = useRouter();
  const { cohort, loading, error, refetch } = useMentorCohort();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nudgeTargets, setNudgeTargets] = useState<CohortMentee[] | null>(null);

  const groups = useMemo(() => {
    const out: Record<GroupKey, CohortMentee[]> = { struggling: [], disengaged: [], watch: [] };
    cohort.forEach((m) => {
      const g = classify(m);
      if (g) out[g].push(m);
    });
    return out;
  }, [cohort]);

  const allAtRisk = useMemo(
    () => [...groups.disengaged, ...groups.struggling, ...groups.watch],
    [groups],
  );

  const totalAtRisk = allAtRisk.length;
  const allSelected = totalAtRisk > 0 && allAtRisk.every((m) => selected.has(m.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) allAtRisk.forEach((m) => next.delete(m.id));
      else allAtRisk.forEach((m) => next.add(m.id));
      return next;
    });
  };

  const openNudge = (mentees: CohortMentee[]) => setNudgeTargets(mentees);

  const selectedMentees = useMemo(
    () => allAtRisk.filter((m) => selected.has(m.id)),
    [allAtRisk, selected],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">At risk</h1>
          <p className="text-slate-600">
            {loading ? 'Loading…' : `${totalAtRisk} mentee${totalAtRisk === 1 ? '' : 's'} need a closer look - separated by whether real constraints explain it.`}
          </p>
        </div>
        {!loading && totalAtRisk > 0 && (
          <button
            type="button"
            onClick={() => openNudge(selectedMentees)}
            disabled={selected.size === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-40 disabled:pointer-events-none"
          >
            <Bell className="w-4 h-4" />
            Nudge{selected.size > 0 ? ` ${selected.size}` : ''} selected
          </button>
        )}
      </div>

      {!loading && totalAtRisk > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
          <button type="button" onClick={selectAll} className="inline-flex items-center gap-2 hover:text-slate-700">
            <input
              type="checkbox"
              readOnly
              checked={allSelected}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 pointer-events-none"
              aria-hidden
            />
            {allSelected ? 'Deselect all' : `Select all (${totalAtRisk})`}
          </button>
          {selected.size > 0 && (
            <button type="button" onClick={() => setSelected(new Set())} className="hover:text-slate-700">
              Clear selection ({selected.size})
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button type="button" onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : totalAtRisk === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600">Nobody&apos;s at risk right now. Everyone is on track.</p>
        </div>
      ) : (
        (['disengaged', 'struggling', 'watch'] as GroupKey[]).map((key) => {
          const members = groups[key];
          if (!members.length) return null;
          const meta = GROUPS[key];
          return (
            <section key={key} className={`rounded-2xl border ${meta.ring} bg-card/60 p-5`}>
              <div className="mb-4">
                <h2 className={`font-semibold ${meta.accent}`}>{meta.title} <span className="text-slate-400 font-normal">· {members.length}</span></h2>
                <p className="text-sm text-slate-500 mt-1">{meta.blurb}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {members.map((m) => (
                  <RiskCard
                    key={m.id}
                    m={m}
                    selected={selected.has(m.id)}
                    onToggle={() => toggle(m.id)}
                    onNudge={() => openNudge([m])}
                    onOpen={() => router.push(`/mentor/mentees/${m.id}`)}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}

      {nudgeTargets && nudgeTargets.length > 0 && (
        <BulkNudgeDrawer
          mentees={nudgeTargets.map((m) => ({ id: m.id, name: m.name }))}
          onClose={() => setNudgeTargets(null)}
          onSent={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}
