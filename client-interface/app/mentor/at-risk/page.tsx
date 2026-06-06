'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Bell, MessageSquare, ArrowUpRight, Clock, TrendingUp, TrendingDown, Minus, Loader2,
} from 'lucide-react';
import { useMentorCohort, type CohortMentee, type CohortMomentum } from '@/lib/hooks/mentor';
import { mentorApi } from '@/lib/services/mentor-api';
import { DualProgress } from '@/components/mentor/DualProgress';

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

function RiskCard({ m, onNudge, onOpen, nudging }: {
  m: CohortMentee; onNudge: () => void; onOpen: () => void; nudging: boolean;
}) {
  const router = useRouter();
  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start gap-3">
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

      <div className="my-4">
        <DualProgress absolute={m.absoluteProgress} relative={m.relativeProgress} compact />
      </div>

      {m.riskReason && (
        <p className="flex items-start gap-1.5 text-sm leading-relaxed text-slate-600 border-t border-slate-100 pt-3">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />{m.riskReason}
        </p>
      )}

      {/* Concrete signal chips - the "why", computed from real stats (no AI). */}
      {(m.signals?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {m.signals!.map((s, i) => (
            <span key={i} className="px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-[11px] text-slate-600 font-mono">{s}</span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={onNudge}
          disabled={nudging}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-50 text-brand-700 text-xs font-medium hover:bg-brand-100 disabled:opacity-50"
        >
          {nudging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}Nudge
        </button>
        <button
          onClick={() => router.push(`/mentor/messages?participantId=${m.id}`)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:border-brand-300"
        >
          <MessageSquare className="w-3.5 h-3.5" />Message
        </button>
        <button
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
  const [nudging, setNudging] = useState<string | null>(null);

  const groups = useMemo(() => {
    const out: Record<GroupKey, CohortMentee[]> = { struggling: [], disengaged: [], watch: [] };
    cohort.forEach((m) => {
      const g = classify(m);
      if (g) out[g].push(m);
    });
    return out;
  }, [cohort]);

  const totalAtRisk = groups.struggling.length + groups.disengaged.length + groups.watch.length;

  const onNudge = async (m: CohortMentee) => {
    try {
      setNudging(m.id);
      await mentorApi.nudge(m.id);
      toast.success(`Nudge sent to ${m.name.split(' ')[0]}`);
    } catch {
      toast.error('Could not send the nudge');
    } finally {
      setNudging(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-slate-900 mb-2">At risk</h1>
        <p className="text-slate-600">
          {loading ? 'Loading…' : `${totalAtRisk} mentee${totalAtRisk === 1 ? '' : 's'} need a closer look - separated by whether real constraints explain it.`}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : totalAtRisk === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600">Nobody&apos;s at risk right now - the whole cohort is on track.</p>
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
                    nudging={nudging === m.id}
                    onNudge={() => onNudge(m)}
                    onOpen={() => router.push(`/mentor/mentees/${m.id}`)}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
