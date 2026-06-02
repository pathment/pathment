import { useMemo, useState } from 'react';
import {
  Sparkles,
  FileText,
  Mail,
  Send,
  CalendarClock,
  Check,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { Card, Badge, Button, Avatar, SectionLabel, AiTag, cx } from '@/lib/ui';
import { Segmented } from '@/components/overlays';
import { useStore } from '@/store/AppStore';
import type { Mentee, ProgramHealth } from '@/lib/types';

/* ----------------------------------------------------------------
   period toggle
----------------------------------------------------------------- */
type Period = 'weekly' | 'monthly';

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

/* ----------------------------------------------------------------
   past reports — local mock archive
----------------------------------------------------------------- */
interface PastReport {
  id: string;
  title: string;
  date: string;
  period: Period;
}

const PAST_REPORTS: PastReport[] = [
  { id: 'r-1', title: 'Cohort weekly review', date: 'May 26, 2026', period: 'weekly' },
  { id: 'r-2', title: 'Cohort weekly review', date: 'May 19, 2026', period: 'weekly' },
  { id: 'r-3', title: 'May monthly summary', date: 'May 01, 2026', period: 'monthly' },
  { id: 'r-4', title: 'Cohort weekly review', date: 'Apr 28, 2026', period: 'weekly' },
];

/* ----------------------------------------------------------------
   derive the top member of each clan for the period
----------------------------------------------------------------- */
interface ClanWinner {
  clan: ProgramHealth;
  top?: Mentee;
}

function scoreMentee(m: Mentee) {
  return m.onTimeRate * 0.6 + m.absoluteProgress * 0.4;
}

export function Reports() {
  const { mentees, mentor, programs } = useStore();

  const [period, setPeriod] = useState<Period>('weekly');
  const [generated, setGenerated] = useState(false);
  const [loadedReport, setLoadedReport] = useState<string | null>(null);
  const [emailState, setEmailState] = useState<'idle' | 'sent' | 'scheduled'>('idle');

  const periodLabel = period === 'weekly' ? 'this week' : 'this month';

  /* aggregate stats from the live store */
  const stats = useMemo(() => {
    const avgCompletion = programs.length
      ? Math.round(programs.reduce((s, p) => s + p.completion, 0) / programs.length)
      : 0;
    const avgOnTime = programs.length
      ? Math.round(programs.reduce((s, p) => s + p.onTime, 0) / programs.length)
      : 0;
    const atRisk = mentees.filter((m) => m.risk === 'high').length;
    return { avgCompletion, avgOnTime, atRisk };
  }, [programs, mentees]);

  /* top member per clan, derived from on-time rate + progress */
  const winners = useMemo<ClanWinner[]>(() => {
    return programs.map((clan) => {
      const roster = mentees.filter((m) => m.program === clan.program);
      const top = roster.length
        ? [...roster].sort((a, b) => scoreMentee(b) - scoreMentee(a))[0]
        : undefined;
      return { clan, top };
    });
  }, [programs, mentees]);

  const risks = useMemo(
    () => mentees.filter((m) => m.risk === 'high' || m.risk === 'watch').slice(0, 4),
    [mentees],
  );

  const recipients = winners.filter((w) => w.top);

  const generate = () => {
    setGenerated(true);
    setLoadedReport(null);
    setEmailState('idle');
  };

  return (
    <Page>
      <PageHeader
        title="AI Reports"
        subtitle="Composed summaries of cohort health and encouraging notes for your clans."
        actions={
          <div className="flex items-center gap-2">
            <Segmented value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
            <Button onClick={generate}>
              <Sparkles className="h-4 w-4" /> Generate report
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* MAIN COLUMN */}
        <div className="space-y-6">
          {/* COMPOSED REPORT */}
          {generated ? (
            <Card className="p-0">
              <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-ink-mute" />
                    <span className="text-sm font-semibold text-ink">
                      {period === 'weekly' ? 'Cohort weekly review' : 'Cohort monthly summary'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-ink-mute">
                    {mentor.name} · {mentor.program} · generated Jun 03, 2026
                  </div>
                </div>
                <AiTag>Pathment AI</AiTag>
              </div>

              <div className="space-y-6 px-5 py-5">
                {/* overview */}
                <p className="max-w-prose text-sm leading-relaxed text-ink-soft">
                  Across {programs.length} clans and {mentees.length} members, momentum held steady{' '}
                  {periodLabel}. Average completion sits at {stats.avgCompletion}% with {stats.avgOnTime}%
                  of work landing on time. {stats.atRisk} member{stats.atRisk === 1 ? '' : 's'} need
                  attention, and several leaders pulled ahead of pace. The notes below call out who to
                  celebrate and where to step in.
                </p>

                {/* stat row */}
                <div className="grid grid-cols-3 divide-x divide-hairline border-y border-hairline">
                  <Stat label="Avg completion" value={`${stats.avgCompletion}%`} />
                  <Stat label="On-time" value={`${stats.avgOnTime}%`} />
                  <Stat label="At risk" value={String(stats.atRisk)} accent={stats.atRisk > 0} />
                </div>

                {/* highlights */}
                <section>
                  <SectionLabel>Highlights</SectionLabel>
                  <ul className="space-y-2.5">
                    {winners.map((w) => (
                      <li key={w.clan.id} className="flex items-center gap-3 text-sm">
                        <TrendingUp className="h-4 w-4 shrink-0 text-emerald-600" />
                        {w.top ? (
                          <>
                            <Avatar initials={w.top.avatar} name={w.top.name} size="xs" />
                            <span className="text-ink">
                              <span className="font-medium">{w.top.name}</span> led{' '}
                              <span className="text-ink-soft">{w.clan.name}</span> with{' '}
                              {w.top.onTimeRate}% on-time and {w.top.absoluteProgress}% progress.
                            </span>
                          </>
                        ) : (
                          <span className="text-ink-mute">
                            {w.clan.name} had no active members {periodLabel}.
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>

                {/* risks */}
                <section>
                  <SectionLabel>Risks</SectionLabel>
                  {risks.length === 0 ? (
                    <p className="text-sm text-ink-mute">No flagged members this period.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {risks.map((m) => (
                        <li key={m.id} className="flex items-center gap-3 text-sm">
                          <AlertTriangle
                            className={cx(
                              'h-4 w-4 shrink-0',
                              m.risk === 'high' ? 'text-[#FF3B30]' : 'text-amber-500',
                            )}
                          />
                          <Avatar initials={m.avatar} name={m.name} size="xs" />
                          <span className="text-ink">
                            <span className="font-medium">{m.name}</span>{' '}
                            <span className="text-ink-soft">
                              {m.riskReason ?? `${m.onTimeRate}% on-time, momentum ${m.momentum}`}.
                            </span>
                          </span>
                          <Badge tone={m.risk === 'high' ? 'rose' : 'amber'} className="ml-auto">
                            {m.risk === 'high' ? 'At risk' : 'Watch'}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* recommended actions */}
                <section>
                  <SectionLabel>Recommended actions</SectionLabel>
                  <ul className="space-y-2 text-sm text-ink-soft">
                    {[
                      `Send the encouraging note below to your ${recipients.length} clan leaders.`,
                      stats.atRisk > 0
                        ? `Book a 1:1 with the ${stats.atRisk} at-risk member${stats.atRisk === 1 ? '' : 's'} before Friday.`
                        : 'Hold a short retro to lock in the gains this period.',
                      'Re-balance roadmap due dates where on-time dipped below 70%.',
                    ].map((action) => (
                      <li key={action} className="flex items-start gap-2">
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
                        {action}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </Card>
          ) : (
            <Card className="grid place-items-center px-5 py-16 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-r border border-hairline text-ink-faint">
                <Sparkles className="h-6 w-6" />
              </span>
              <p className="mt-4 text-base font-medium text-ink">No report composed yet.</p>
              <p className="mt-1 max-w-sm text-sm text-ink-mute">
                Pick a period and generate a {period} summary of cohort health, highlights, risks, and
                recommended actions.
              </p>
              <Button className="mt-4" onClick={generate}>
                <Sparkles className="h-4 w-4" /> Generate report
              </Button>
            </Card>
          )}

          {/* ENCOURAGING EMAILS */}
          <Card className="p-0">
            <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-ink-mute" />
                <span className="text-sm font-semibold text-ink">Weekly encouraging emails</span>
              </div>
              <AiTag>Auto-drafted</AiTag>
            </div>

            <div className="space-y-4 px-5 py-5">
              {/* recipient chips */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                  To
                </span>
                {recipients.length === 0 ? (
                  <span className="text-xs text-ink-mute">No clan leaders to celebrate yet.</span>
                ) : (
                  recipients.map((w) => (
                    <span
                      key={w.clan.id}
                      className="inline-flex items-center gap-1.5 rounded-r border border-hairline bg-white px-2 py-1"
                    >
                      <Avatar initials={w.top!.avatar} name={w.top!.name} size="xs" />
                      <span className="text-xs text-ink-soft">{w.top!.name}</span>
                    </span>
                  ))
                )}
              </div>

              {/* email preview */}
              <div className="rounded-r border border-hairline bg-neutral-50/60 px-4 py-4 text-sm leading-relaxed text-ink-soft">
                <p className="mb-2 font-medium text-ink">Subject: You set the pace {periodLabel}</p>
                <p className="mb-2">Hi {recipients[0]?.top?.name.split(' ')[0] ?? 'there'},</p>
                <p className="mb-2">
                  You were the standout in your clan {periodLabel}, staying on top of deadlines while
                  pushing your roadmap forward. That consistency lifts everyone around you, and it does
                  not go unnoticed.
                </p>
                <p>Keep the rhythm going. We are proud of the work. {mentor.name}</p>
              </div>

              {/* send / schedule */}
              <div className="flex items-center gap-2">
                {emailState === 'idle' ? (
                  <>
                    <Button
                      variant="primary"
                      disabled={recipients.length === 0}
                      onClick={() => setEmailState('sent')}
                    >
                      <Send className="h-4 w-4" /> Send now
                    </Button>
                    <Button
                      variant="outline"
                      disabled={recipients.length === 0}
                      onClick={() => setEmailState('scheduled')}
                    >
                      <CalendarClock className="h-4 w-4" /> Schedule
                    </Button>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-r border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700">
                    <Check className="h-3.5 w-3.5" />
                    {emailState === 'sent'
                      ? `Sent to ${recipients.length} leaders`
                      : `Scheduled for Monday 9:00am`}
                    <button
                      onClick={() => setEmailState('idle')}
                      className="ml-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-faint hover:text-ink"
                    >
                      Undo
                    </button>
                  </span>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* PAST REPORTS */}
        <aside>
          <SectionLabel>Past reports</SectionLabel>
          <div className="space-y-2">
            {PAST_REPORTS.map((r) => {
              const active = loadedReport === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    setLoadedReport(r.id);
                    setGenerated(true);
                    setPeriod(r.period);
                  }}
                  className={cx(
                    'flex w-full items-start gap-3 rounded-r border px-3 py-3 text-left transition-colors',
                    active
                      ? 'border-ink bg-neutral-50'
                      : 'border-hairline bg-white hover:border-ink',
                  )}
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-ink-faint tnum">
                      {r.date}
                    </span>
                  </span>
                  <Badge tone={r.period === 'weekly' ? 'neutral' : 'brand'}>
                    {r.period === 'weekly' ? 'Wk' : 'Mo'}
                  </Badge>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </Page>
  );
}

/* ----------------------------------------------------------------
   one stat cell
----------------------------------------------------------------- */
function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">{label}</div>
      <div
        className={cx(
          'mt-1 text-xl font-semibold tnum',
          accent ? 'text-[#FF3B30]' : 'text-ink',
        )}
      >
        {value}
      </div>
    </div>
  );
}
