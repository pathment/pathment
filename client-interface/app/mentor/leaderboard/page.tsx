'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Trophy, Loader2, Award, TrendingUp, TrendingDown, Minus, Crown, Info } from 'lucide-react';
import { useMentorCohort, type CohortMentee, type CohortMomentum } from '@/lib/hooks/mentor';

// Real, honest signals only - no fabricated XP. Standings rank by EFFORT-WEIGHTED
// fair progress: relative progress (output credited for logged, accepted blockers)
// scaled by how much real work backs it, so a single custom task at 100% can't
// outrank a mentee who has actually completed many tasks. Tie-broken by volume
// then on-time reliability.
//
// VOLUME_TARGET = completed tasks needed for the score to count at full weight.
// Tunable: lower it to credit short roadmaps sooner; raise it to demand more
// proof of work before someone tops the board.
const VOLUME_TARGET = 4;
const effortWeight = (m: CohortMentee) => Math.min(1, (m.tasksCompleted ?? 0) / VOLUME_TARGET);
// The number shown on the board: fair progress, dampened until there's real
// output behind it (0 completed tasks → 0%, not a hollow 100%).
const fairScore = (m: CohortMentee) => Math.round(m.relativeProgress * effortWeight(m));
const scoreOf = (m: CohortMentee) =>
  fairScore(m) * 1000 + (m.tasksCompleted ?? 0) * 10 + (m.tasksCompleted > 0 ? m.onTimeRate : 0);

function badgesOf(m: CohortMentee): string[] {
  const b: string[] = [];
  // On-time / progress badges require real completed work, so an empty record
  // can't earn them off the 100%-by-default signals.
  const hasOutput = (m.tasksCompleted ?? 0) > 0;
  if (hasOutput && m.onTimeRate >= 90) b.push('On-time hero');
  if (m.momentum === 'up') b.push('Building momentum');
  if (hasOutput && m.absoluteProgress >= 75) b.push('Top progress');
  if (hasOutput && m.relativeProgress >= 95) b.push('Steady hand');
  return b;
}

function Momentum({ m }: { m: CohortMomentum }) {
  if (m === 'up') return <span className="inline-flex items-center gap-0.5 text-emerald-600 text-xs font-medium"><TrendingUp className="w-3.5 h-3.5" />Building</span>;
  if (m === 'down') return <span className="inline-flex items-center gap-0.5 text-red-600 text-xs font-medium"><TrendingDown className="w-3.5 h-3.5" />Slipping</span>;
  return <span className="inline-flex items-center gap-0.5 text-slate-400 text-xs font-medium"><Minus className="w-3.5 h-3.5" />Steady</span>;
}

// Medal tint for the top three ranks; plain slate otherwise.
const RANK_STYLE = [
  { ring: 'bg-amber-100 text-amber-700 ring-2 ring-amber-300', bar: 'bg-amber-400' },
  { ring: 'bg-slate-100 text-slate-600 ring-2 ring-slate-300', bar: 'bg-slate-400' },
  { ring: 'bg-orange-100 text-orange-700 ring-2 ring-orange-300', bar: 'bg-orange-400' },
];
const rankStyle = (i: number) => RANK_STYLE[i] || { ring: 'bg-slate-50 text-slate-400', bar: 'bg-brand-400' };

function Avatar({ m, size = 'md' }: { m: CohortMentee; size?: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'w-14 h-14 text-base' : 'w-9 h-9 text-xs';
  return m.profilePictureUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={m.profilePictureUrl} alt={m.name} className={`${dim} rounded-full object-cover shrink-0`} />
    : <div className={`${dim} bg-brand-100 rounded-full flex items-center justify-center shrink-0`}><span className="text-brand-700 font-semibold">{m.avatar}</span></div>;
}

export default function MentorLeaderboard() {
  const { cohort, loading, error, refetch } = useMentorCohort();
  const [program, setProgram] = useState('all');

  const programs = useMemo(() => Array.from(new Set(cohort.map((m) => m.program).filter(Boolean))), [cohort]);

  const ranked = useMemo(() => {
    return cohort
      .filter((m) => program === 'all' || m.program === program)
      .slice()
      .sort((a, b) => scoreOf(b) - scoreOf(a));
  }, [cohort, program]);

  const leader = ranked[0] || null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-slate-900 mb-1">Cohort standings</h1>
        <p className="text-slate-600">Ranked by fair progress - no vanity points.</p>
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 max-w-xl">
          <Info className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="font-medium text-slate-700">Fair progress</span> credits output for logged, accepted blockers, and is weighted by how many tasks a mentee has actually completed - so a single custom task can&apos;t put an empty record at the top.
          </p>
        </div>
      </div>

      {programs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          {['all', ...programs].map((p) => (
            <button key={p} onClick={() => setProgram(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${program === p ? 'bg-card text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {p === 'all' ? 'All clans' : p}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : ranked.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No mentees to rank yet.</p>
        </div>
      ) : (
        <>
          {/* Leader spotlight - one feature, not three floating cards */}
          {leader && (
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 dark:from-amber-500/10 to-card p-5 flex items-center gap-4">
              <div className="relative shrink-0">
                <Avatar m={leader} size="lg" />
                <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center ring-2 ring-white">
                  <Crown className="w-3.5 h-3.5 text-white" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Leading the cohort</p>
                <p className="text-lg font-semibold text-slate-900 truncate">{leader.name}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-xs text-slate-500">
                  <span><strong className="text-slate-700">{fairScore(leader)}%</strong> fair progress</span>
                  <span><strong className="text-slate-700">{leader.tasksCompleted > 0 ? `${leader.onTimeRate}%` : '—'}</strong> on-time</span>
                  <Momentum m={leader.momentum} />
                </div>
              </div>
            </div>
          )}

          {/* Standings - one scannable board, fair-progress bar per row */}
          <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {ranked.map((m, i) => {
              const rs = rankStyle(i);
              const fair = fairScore(m);
              return (
                <div key={m.id} className={`flex items-center gap-3 px-4 py-3 ${i < 3 ? 'bg-slate-50/40' : ''}`}>
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums shrink-0 ${rs.ring}`}>{i + 1}</span>
                  <Link href={`/mentor/mentees/${m.id}`} className="shrink-0 rounded-full transition-opacity hover:opacity-90"><Avatar m={m} /></Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                      <Momentum m={m.momentum} />
                    </div>
                    {/* Fair-progress bar makes the ranking legible at a glance */}
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${rs.bar}`} style={{ width: `${fair}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-slate-700 tabular-nums w-9 text-right">{fair}%</span>
                    </div>
                    {badgesOf(m).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {badgesOf(m).map((b) => (
                          <span key={b} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px]">
                            <Award className="w-2.5 h-2.5" />{b}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 hidden sm:block">
                    <p className="text-sm font-semibold text-slate-900 tabular-nums">{m.tasksCompleted > 0 ? `${m.onTimeRate}%` : '—'}</p>
                    <p className="text-[11px] text-slate-400">on-time</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
