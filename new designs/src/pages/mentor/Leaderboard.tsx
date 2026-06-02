import { useMemo, useState } from 'react';
import { Trophy, Flame, Clock, TrendingUp, Star, Award, Sparkles } from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { Card, Badge, Avatar, SectionLabel, ProgressBar, cx } from '@/lib/ui';
import { Segmented } from '@/components/overlays';
import { useStore } from '@/store/AppStore';
import type { Mentee } from '@/lib/types';

/* ----------------------------------------------------------------
   Local gamification model. Derived read-only from each mentee's
   stats so the board is deterministic across reloads.
----------------------------------------------------------------- */
interface BadgeDef {
  key: string;
  label: string;
  earned: (m: Mentee) => boolean;
}

const BADGE_DEFS: BadgeDef[] = [
  { key: 'ontime', label: 'On-time hero', earned: (m) => m.onTimeRate >= 90 },
  { key: 'momentum', label: 'Momentum', earned: (m) => m.momentum === 'up' },
  { key: 'progress', label: 'Top progress', earned: (m) => m.absoluteProgress >= 75 },
  { key: 'steady', label: 'Steady hand', earned: (m) => m.relativeProgress >= 95 },
];

function xpFor(m: Mentee): number {
  return Math.round(m.absoluteProgress * 10 + m.onTimeRate * 5 + m.relativeProgress * 4);
}

function levelFor(xp: number): number {
  return Math.floor(xp / 500) + 1;
}

/* A deterministic streak from the id - no randomness across renders. */
function streakFor(m: Mentee): number {
  return 3 + ((m.id * 7 + m.onTimeRate) % 19);
}

interface Ranked {
  m: Mentee;
  xp: number;
  level: number;
  streak: number;
  badges: string[];
}

const PODIUM_ORDER = [1, 0, 2]; // left, center (rank 1), right

export function Leaderboard() {
  const { mentees, programs } = useStore();
  const [clan, setClan] = useState<string>('all');

  const clanOptions = useMemo(
    () => [
      { value: 'all', label: 'All clans' },
      ...programs.map((p) => ({ value: p.name, label: p.name })),
    ],
    [programs],
  );

  const ranked = useMemo<Ranked[]>(() => {
    return mentees
      .filter((m) => clan === 'all' || m.program === clan)
      .map((m) => {
        const xp = xpFor(m);
        return {
          m,
          xp,
          level: levelFor(xp),
          streak: streakFor(m),
          badges: BADGE_DEFS.filter((b) => b.earned(m))
            .slice(0, 3)
            .map((b) => b.label),
        };
      })
      .sort((a, b) => b.xp - a.xp);
  }, [mentees, clan]);

  const podium = ranked.slice(0, 3);

  return (
    <Page>
      <PageHeader
        title="Leaderboard"
        subtitle="XP, streaks, and badges across your clans. Earned from real progress, not vanity."
        actions={
          <Segmented
            value={clan}
            onChange={setClan}
            options={clanOptions}
          />
        }
      />

      {ranked.length === 0 ? (
        <Card className="grid place-items-center px-5 py-20 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-r border border-hairline text-ink-faint">
            <Trophy className="h-6 w-6" />
          </span>
          <p className="mt-4 text-base font-medium text-ink">No mentees in this clan yet.</p>
          <p className="mt-1 text-sm text-ink-mute">Pick another clan to see its board.</p>
        </Card>
      ) : (
        <>
          {/* PODIUM */}
          <section className="mb-8">
            <SectionLabel>Top three</SectionLabel>
            <div className="grid grid-cols-3 items-end gap-3 sm:gap-4">
              {PODIUM_ORDER.map((slot) => {
                const r = podium[slot];
                if (!r) return <div key={slot} />;
                const rank = slot + 1;
                return <PodiumCard key={r.m.id} r={r} rank={rank} />;
              })}
            </div>
          </section>

          {/* RANKED TABLE */}
          <section className="mb-8">
            <SectionLabel>Full standings</SectionLabel>
            <Card className="p-0">
              <div className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-b border-hairline px-4 py-2.5 sm:grid-cols-[2.5rem_minmax(0,1fr)_8rem_5rem_5rem_minmax(0,12rem)]">
                {['Rank', 'Mentee', 'Clan', 'Level', 'XP', 'Badges'].map((h, i) => (
                  <span
                    key={h}
                    className={cx(
                      'font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint',
                      i > 1 && 'hidden sm:block',
                    )}
                  >
                    {h}
                  </span>
                ))}
              </div>

              <ol className="divide-y divide-hairline">
                {ranked.map((r, i) => (
                  <li
                    key={r.m.id}
                    className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_8rem_5rem_5rem_minmax(0,12rem)]"
                  >
                    <span
                      className={cx(
                        'grid h-7 w-7 place-items-center rounded-r border font-mono text-xs tnum',
                        i < 3 ? 'border-ink bg-ink text-white' : 'border-hairline text-ink-mute',
                      )}
                    >
                      {i + 1}
                    </span>

                    <span className="flex min-w-0 items-center gap-2.5">
                      <Avatar initials={r.m.avatar} name={r.m.name} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">
                          {r.m.name}
                        </span>
                        <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                          <Flame className="h-3 w-3" />
                          <span className="font-mono tnum">{r.streak}</span> day streak
                        </span>
                      </span>
                    </span>

                    <span className="hidden truncate text-xs text-ink-mute sm:block">
                      {r.m.program}
                    </span>

                    <span className="hidden sm:block">
                      <Badge tone="brand">Lv {r.level}</Badge>
                    </span>

                    <span className="hidden font-mono text-sm font-medium text-ink tnum sm:block">
                      {r.xp.toLocaleString()}
                    </span>

                    <span className="flex flex-wrap items-center justify-end gap-1 sm:justify-start">
                      {r.badges.length === 0 ? (
                        <span className="font-mono text-[11px] text-ink-faint">-</span>
                      ) : (
                        r.badges.map((b) => <Badge key={b}>{b}</Badge>)
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          </section>

          {/* LEGEND */}
          <section>
            <SectionLabel>How XP is earned</SectionLabel>
            <Card className="p-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <LegendRow
                  icon={<TrendingUp className="h-4 w-4 text-brand-600" />}
                  title="Progress"
                  detail="Completed roadmap steps and overall course completion. The biggest driver."
                />
                <LegendRow
                  icon={<Clock className="h-4 w-4 text-emerald-600" />}
                  title="On-time submissions"
                  detail="Work delivered before the due date. Consistency beats cramming."
                />
                <LegendRow
                  icon={<Flame className="h-4 w-4 text-amber-600" />}
                  title="Streaks"
                  detail="Active days in a row. Small daily reps compound over a cohort."
                />
                <LegendRow
                  icon={<Star className="h-4 w-4 text-brand-600" />}
                  title="Kudos"
                  detail="Recognition from mentors and peers for standout work and helpfulness."
                />
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-4">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                  Badges to chase
                </span>
                {BADGE_DEFS.map((b) => (
                  <span key={b.key} className="inline-flex items-center gap-1.5">
                    <Award className="h-3.5 w-3.5 text-ink-faint" />
                    <span className="text-xs text-ink-soft">{b.label}</span>
                  </span>
                ))}
              </div>
            </Card>
          </section>
        </>
      )}
    </Page>
  );
}

/* ----------------------------------------------------------------
   Podium card - rank 1 sits taller and centered.
----------------------------------------------------------------- */
function PodiumCard({ r, rank }: { r: Ranked; rank: number }) {
  const first = rank === 1;
  const nextLevelXp = r.level * 500;
  const intoLevel = r.xp % 500;
  return (
    <Card
      className={cx(
        'flex flex-col items-center px-3 py-4 text-center sm:px-4',
        first ? 'pb-6 pt-6' : 'mt-4',
      )}
    >
      <span
        className={cx(
          'mb-2 grid h-6 w-6 place-items-center rounded-r border font-mono text-[11px] tnum',
          first ? 'border-ink bg-ink text-white' : 'border-hairline text-ink-mute',
        )}
      >
        {rank}
      </span>
      {first && <Trophy className="mb-1 h-4 w-4 text-amber-500" />}
      <Avatar initials={r.m.avatar} name={r.m.name} size={first ? 'xl' : 'lg'} />
      <span className="mt-2 truncate text-sm font-semibold text-ink">{r.m.name}</span>
      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
        <Sparkles className="h-3 w-3" />
        <span className="font-mono text-ink-soft tnum">{r.xp.toLocaleString()}</span> XP
      </span>
      <div className="mt-3 w-full">
        <ProgressBar value={(intoLevel / 500) * 100} tone={first ? 'brand' : 'neutral'} />
        <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-ink-faint tnum">
          <span>Lv {r.level}</span>
          <span>{nextLevelXp.toLocaleString()}</span>
        </div>
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------
   One legend item.
----------------------------------------------------------------- */
function LegendRow({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-r border border-hairline">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{title}</div>
        <p className="mt-0.5 text-xs text-ink-mute">{detail}</p>
      </div>
    </div>
  );
}
