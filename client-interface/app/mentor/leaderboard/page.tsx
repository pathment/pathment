'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Award, Crown, Info, Loader2, Trophy } from 'lucide-react';
import { useClanPerformance } from '@/lib/hooks/mentor';
import { useClan, ALL_CLANS } from '@/lib/context/ClanContext';
import type { RankedMentee, UnrankedMentee } from '@/lib/services/performance-api';

/**
 * Cohort standings.
 *
 * The score is NOT worked out here. It used to be: this page had a five factor
 * composite and /mentor/scores had a different three factor one, so the same
 * mentee had two different numbers depending on which page you opened, and a
 * third in the mobile app. Both browser formulas also weighted absolute and
 * relative progress separately, though relative already contains absolute, so
 * progress counted twice; and neither adjusted for how generously a mentor
 * grades, which is the fairness problem the score exists to solve.
 *
 * It now comes from /performance, where the peer relative dimensions can
 * actually be computed. A browser holding one page of a cohort cannot work out
 * a percentile.
 */

function rankStyle(i: number): { ring: string; bar: string } {
  if (i === 0) return { ring: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400' };
  if (i === 1) return { ring: 'bg-slate-200 text-slate-700', bar: 'bg-slate-400' };
  if (i === 2) return { ring: 'bg-orange-100 text-orange-700', bar: 'bg-orange-400' };
  return { ring: 'bg-slate-100 text-slate-500', bar: 'bg-brand-500' };
}

/** Named for what somebody actually did, straight off the server's evidence. */
function badgesOf(m: RankedMentee): string[] {
  const b: string[] = [];
  const part = (key: string) => m.parts.find((p) => p.key === key)?.score ?? null;

  if ((part('quality') ?? 0) >= 85) b.push('Quality');
  if ((part('reliability') ?? 0) >= 90 && m.evidence.tasksCompleted > 0) b.push('On-time hero');
  if ((part('effort') ?? 0) >= 85) b.push('Deep work');
  if ((part('consistency') ?? 0) >= 80) b.push('Steady hand');
  if ((part('attendance') ?? 0) >= 95) b.push('Always there');
  return b;
}

function Avatar({
  m,
  size = 'md',
}: {
  m: { name: string; avatar: string; profilePictureUrl: string | null };
  size?: 'md' | 'lg';
}) {
  const dim = size === 'lg' ? 'w-14 h-14 text-base' : 'w-9 h-9 text-xs';
  return m.profilePictureUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.profilePictureUrl} alt={m.name} className={`${dim} rounded-full object-cover shrink-0`} />
  ) : (
    <div className={`${dim} bg-brand-100 rounded-full flex items-center justify-center shrink-0`}>
      <span className="text-brand-700 font-semibold">{m.avatar}</span>
    </div>
  );
}

export default function MentorLeaderboard() {
  const { clans, activeClanId } = useClan();

  // Scores only compare people who train together, so a clan has to be chosen.
  // Merging two clans into one ranking would compare mentees who were never in
  // the same room, judged by different mentors.
  const [picked, setPicked] = useState<string | null>(null);
  const clanId = picked ?? (activeClanId !== ALL_CLANS ? activeClanId : clans[0]?.id ?? null);

  const { performance, loading, error, refetch } = useClanPerformance(clanId);

  const ranked = performance?.ranked ?? [];
  const notRanked = performance?.notRanked ?? [];
  const leader = ranked[0] ?? null;

  const weightLine = useMemo(() => {
    if (!performance) return '';
    return Object.entries(performance.weights)
      .sort((a, b) => b[1] - a[1])
      .map(([key, weight]) => `${Math.round(weight)}% ${key}`)
      .join(' · ');
  }, [performance]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-slate-900 mb-1">Cohort standings</h1>
        <p className="text-slate-600">
          One score, worked out on the server, so it matches everywhere it is shown.
        </p>
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 max-w-xl">
          <Info className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="font-medium text-slate-700">Score = </span>
            <span className="font-medium text-slate-600">{weightLine || 'loading'}</span>.
            Marks are compared against each mentor&apos;s own average, so grading strictly does not
            cost your mentees. Anything with no data yet is left out rather than counted as zero.
            {performance && performance.disabled.length > 0
              ? ` ${performance.disabled.join(' and ')} switched off for this clan.`
              : ''}
          </p>
        </div>
      </div>

      {clans.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
          {clans.map((c) => (
            <button
              key={c.id}
              onClick={() => setPicked(c.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                clanId === c.id ? 'bg-card text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">
            Try again
          </button>
        </div>
      ) : ranked.length === 0 && notRanked.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No mentees to rank yet.</p>
        </div>
      ) : (
        <>
          {leader && (
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 dark:from-amber-500/10 to-card p-5 flex items-center gap-4">
              <div className="relative shrink-0">
                <Avatar m={leader} size="lg" />
                <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center ring-2 ring-white">
                  <Crown className="w-3.5 h-3.5 text-white" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
                  Leading the clan
                </p>
                <p className="text-lg font-semibold text-slate-900 truncate">{leader.name}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-xs text-slate-500">
                  <span>
                    <strong className="text-slate-700">{leader.score}</strong> score
                  </span>
                  <span className="text-slate-400">{leader.band}</span>
                  <span>
                    <strong className="text-slate-700">{leader.evidence.tasksCompleted}</strong> reviewed
                  </span>
                  <span>
                    <strong className="text-slate-700">{leader.evidence.onTimeRate}%</strong> on-time
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {ranked.map((m, i) => {
              const rs = rankStyle(i);
              return (
                <div key={m.id} className={`flex items-center gap-3 px-4 py-3 ${i < 3 ? 'bg-slate-50/40' : ''}`}>
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums shrink-0 ${rs.ring}`}
                  >
                    {m.rank}
                  </span>
                  <Link
                    href={`/mentor/mentees/${m.id}`}
                    className="shrink-0 rounded-full transition-opacity hover:opacity-90"
                  >
                    <Avatar m={m} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                      <span className="text-[11px] text-slate-400">{m.band}</span>
                    </div>

                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${rs.bar}`} style={{ width: `${m.score}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-slate-700 tabular-nums w-9 text-right">
                        {m.score}
                      </span>
                    </div>

                    {/* The parts, so a rank is arguable rather than asserted. */}
                    <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1 text-[11px] text-slate-400">
                      {m.parts.map((p) => (
                        <span key={p.key}>
                          <span className="text-slate-600 font-medium">{p.score}</span> {p.label.toLowerCase()}
                        </span>
                      ))}
                    </div>

                    {badgesOf(m).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {badgesOf(m).map((b) => (
                          <span
                            key={b}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px]"
                          >
                            <Award className="w-2.5 h-2.5" />
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Everybody left out, and why. A mentee who silently vanishes off a
              board looks forgotten; one listed with a reason can be helped. */}
          {notRanked.length > 0 && (
            <div className="bg-card rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Not ranked yet
              </p>
              <div className="space-y-2">
                {notRanked.map((m: UnrankedMentee) => (
                  <div key={m.id} className="flex items-center gap-3">
                    <Avatar m={m} />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 truncate">{m.name}</p>
                      <p className="text-xs text-slate-500">
                        {m.notRankedBecause ?? 'Not enough reviewed work yet'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-3">
                Ranking needs enough reviewed work to compare fairly. This is about evidence, not
                about how well somebody is doing.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
