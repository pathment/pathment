import { useMemo } from 'react';
import { TrendingDown, Flag, CalendarClock } from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { PROGRAMS } from '@/data/mock';
import { useStore } from '@/store/AppStore';
import {
  Badge,
  Button,
  Card,
  ProgressBar,
  AiTag,
  SectionLabel,
  cx,
} from '@/lib/ui';
import type { ProgramHealth as Program } from '@/lib/types';

/* ----------------------------------------------------------------
   status → tone / accent, matching ProgramHealth's RAG mapping
----------------------------------------------------------------- */
type StatusKey = Program['status'];

const STATUS_META: Record<
  StatusKey,
  { label: string; tone: 'emerald' | 'amber' | 'rose'; rank: number }
> = {
  red: { label: 'Needs attention', tone: 'rose', rank: 0 },
  amber: { label: 'Watch', tone: 'amber', rank: 1 },
  green: { label: 'Healthy', tone: 'emerald', rank: 2 },
};

function avg(nums: number[]) {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function OrgInsights() {
  const { mentees } = useStore();

  // cohort comparison - worst first (red → amber → green, then by drop-off)
  const cohorts = useMemo(
    () =>
      [...PROGRAMS].sort((a, b) => {
        const r = STATUS_META[a.status].rank - STATUS_META[b.status].rank;
        return r !== 0 ? r : b.dropoff - a.dropoff;
      }),
    [],
  );

  // org-wide extension / blocker aggregates (from PROGRAMS fixtures)
  const totalExtensions = useMemo(
    () => PROGRAMS.reduce((s, p) => s + p.extensions, 0),
    [],
  );
  const totalBlockers = useMemo(
    () => PROGRAMS.reduce((s, p) => s + p.blockers, 0),
    [],
  );
  const programsRed = useMemo(
    () => PROGRAMS.filter((p) => p.status === 'red'),
    [],
  );

  // the fairness story at org scale - live cohort avg absolute vs relative
  const avgAbsolute = useMemo(
    () => avg(mentees.map((m) => m.absoluteProgress)),
    [mentees],
  );
  const avgRelative = useMemo(
    () => avg(mentees.map((m) => m.relativeProgress)),
    [mentees],
  );
  const fairnessGap = avgRelative - avgAbsolute;

  // live distribution rows, biggest relative-vs-absolute gap first
  const distribution = useMemo(
    () =>
      [...mentees].sort(
        (a, b) =>
          b.relativeProgress - b.absoluteProgress -
          (a.relativeProgress - a.absoluteProgress),
      ),
    [mentees],
  );

  const healthy = PROGRAMS.filter((p) => p.status === 'green').length;

  return (
    <Page>
      <PageHeader
        title="Insights"
        subtitle="Outcomes, trends and clan comparisons across the org"
        actions={<Button variant="outline">Export</Button>}
      />

      {/* AI org digest */}
      <Card className="ai-panel flex flex-wrap items-start gap-3 p-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center border border-brand-200 text-brand-600">
          <TrendingDown className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <AiTag>Org digest</AiTag>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            <span className="font-semibold text-ink">{healthy} clans healthy</span>,{' '}
            {programsRed.length > 0 ? (
              <>
                {programsRed.map((p) => p.name).join(' & ')} needs intervention
              </>
            ) : (
              <>no clan is in the red</>
            )}
            . Org relative-progress runs{' '}
            <span className="font-mono font-semibold text-brand-700 tnum">
              {fairnessGap >= 0 ? `${fairnessGap} pts above` : `${Math.abs(fairnessGap)} pts below`}
            </span>{' '}
            absolute - friction is real and being logged, not papered over.
          </p>
        </div>
      </Card>

      {/* aggregate KPI strip */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Avg completion', value: `${avg(PROGRAMS.map((p) => p.completion))}%`, accent: 'bg-sky-500' },
          { label: 'Extensions logged', value: String(totalExtensions), accent: 'bg-amber-500' },
          { label: 'Open blockers', value: String(totalBlockers), accent: 'bg-[#FF3B30]' },
          { label: 'Clans in red', value: String(programsRed.length), accent: 'bg-[#FF3B30]' },
        ].map((s) => (
          <Card key={s.label} className="relative overflow-hidden p-5">
            <span className={cx('absolute left-0 top-0 h-full w-0.5', s.accent)} />
            <div className="eyebrow">{s.label}</div>
            <div className="mt-2 font-mono text-2xl font-semibold tracking-tight text-ink tnum">
              {s.value}
            </div>
          </Card>
        ))}
      </div>

      {/* cohort comparison */}
      <section className="mt-10">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <SectionLabel>Clan comparison</SectionLabel>
            <p className="-mt-2 text-xs text-ink-mute">
              All {PROGRAMS.length} clans, worst first.
            </p>
          </div>
        </div>

        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left">
                {['Clan', 'Completion', 'On-time', 'Drop-off', 'Extensions', 'Blockers', 'At-risk'].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={cx(
                        'px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint',
                        i === 0 ? 'text-left' : 'text-right',
                      )}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {cohorts.map((p) => {
                const meta = STATUS_META[p.status];
                return (
                  <tr key={p.id} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={cx(
                            'h-2.5 w-2.5 rounded-full',
                            p.status === 'red'
                              ? 'bg-[#FF3B30]'
                              : p.status === 'amber'
                                ? 'bg-amber-500'
                                : 'bg-emerald-500',
                          )}
                        />
                        <span className="font-medium text-ink">{p.name}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-ink tnum">{p.completion}%</td>
                    <td
                      className={cx(
                        'px-4 py-3 text-right font-mono tnum',
                        p.onTime < 60 ? 'text-[#FF3B30]' : 'text-ink',
                      )}
                    >
                      {p.onTime}%
                    </td>
                    <td
                      className={cx(
                        'px-4 py-3 text-right font-mono tnum',
                        p.dropoff >= 12 ? 'text-[#FF3B30]' : 'text-ink',
                      )}
                    >
                      {p.dropoff}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-ink tnum">{p.extensions}</td>
                    <td
                      className={cx(
                        'px-4 py-3 text-right font-mono tnum',
                        p.blockers >= 12 ? 'text-[#FF3B30]' : 'text-ink',
                      )}
                    >
                      {p.blockers}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tnum">
                      <span className={cx(p.atRisk > 0 ? 'text-[#FF3B30]' : 'text-ink-faint')}>
                        {p.atRisk}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </section>

      {/* relative-vs-absolute distribution */}
      <section className="mt-10">
        <SectionLabel>Absolute vs relative - the fairness lens</SectionLabel>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* aggregate callout */}
          <Card className="p-5 lg:col-span-1">
            <div className="eyebrow">Org cohort average</div>
            <div className="mt-3 space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-ink-mute">
                  <span>Absolute</span>
                  <span className="font-mono font-medium text-ink-soft tnum">{avgAbsolute}%</span>
                </div>
                <ProgressBar value={avgAbsolute} tone="neutral" height="h-2" />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-ink-mute">
                  <span>Relative</span>
                  <span className="font-mono font-medium text-brand-700 tnum">{avgRelative}%</span>
                </div>
                <ProgressBar value={avgRelative} tone="brand" height="h-2" />
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-mute">
              The cohort runs{' '}
              <span className="font-mono font-semibold text-brand-700 tnum">
                {Math.abs(fairnessGap)} pts
              </span>{' '}
              {fairnessGap >= 0 ? 'higher' : 'lower'} on relative progress - the friction layer is
              doing visible work.
            </p>
          </Card>

          {/* per-mentee mini-viz */}
          <Card className="p-5 lg:col-span-2">
            <div className="eyebrow mb-3">By mentee - widest gap first</div>
            <div className="space-y-3.5">
              {distribution.map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <div className="w-28 shrink-0 truncate text-xs font-medium text-ink">{m.name}</div>
                  <div className="min-w-0 flex-1">
                    <DistributionBars
                      absolute={m.absoluteProgress}
                      relative={m.relativeProgress}
                    />
                  </div>
                  <div className="w-12 shrink-0 text-right font-mono text-[11px] tnum text-ink-mute">
                    {m.relativeProgress - m.absoluteProgress >= 0 ? '+' : ''}
                    {m.relativeProgress - m.absoluteProgress}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      {/* extension / blocker trend summary */}
      <section className="mt-10">
        <SectionLabel>Extension &amp; blocker trends</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-amber-500" />
              <div className="eyebrow">Extensions logged</div>
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink tnum">
              {totalExtensions}
            </div>
            <p className="mt-1 text-xs text-ink-mute">
              Across {PROGRAMS.length} programs this cycle.
            </p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-[#FF3B30]" />
              <div className="eyebrow">Open blockers</div>
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink tnum">
              {totalBlockers}
            </div>
            <p className="mt-1 text-xs text-ink-mute">
              Densest in {[...PROGRAMS].sort((a, b) => b.blockers - a.blockers)[0].name}.
            </p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-[#FF3B30]" />
              <div className="eyebrow">Trending red</div>
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink tnum">
              {programsRed.length}
            </div>
            <p className="mt-1 text-xs text-ink-mute">
              {programsRed.length > 0
                ? programsRed.map((p) => p.name).join(', ')
                : 'No cohort in the red.'}
            </p>
          </Card>
        </div>
      </section>
    </Page>
  );
}

/* ----------------------------------------------------------------
   compact two-bar absolute/relative viz (pure CSS)
----------------------------------------------------------------- */
function DistributionBars({ absolute, relative }: { absolute: number; relative: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="w-3 shrink-0 text-[9px] uppercase tracking-wide text-ink-faint">A</span>
        <ProgressBar value={absolute} tone="neutral" height="h-1.5" />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-3 shrink-0 text-[9px] uppercase tracking-wide text-ink-faint">R</span>
        <ProgressBar value={relative} tone="brand" height="h-1.5" />
      </div>
    </div>
  );
}
