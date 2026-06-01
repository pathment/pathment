import type { ReactNode } from 'react';
import { Clock, CheckCircle2, Flag, ShieldCheck } from 'lucide-react';
import {
  Card,
  Badge,
  ProgressBar,
  SectionLabel,
  MomentumIcon,
  FRICTION_META,
  cx,
} from '@/lib/ui';
import { Page, PageHeader } from '@/components/Page';
import { DualProgress } from '@/components/DualProgress';
import { AISummary } from '@/components/AISummary';
import { useStore } from '@/store/AppStore';
import type { Mentee } from '@/lib/types';

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-xs font-medium text-ink-faint">
        {icon}
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2 font-mono text-2xl font-semibold text-ink tnum">
        {value}
      </div>
      {hint && <p className="mt-1 text-xs text-ink-mute">{hint}</p>}
    </Card>
  );
}

const PERSONALITY_LABELS: { key: keyof Mentee['personality']; label: string }[] = [
  { key: 'consistency', label: 'Consistency' },
  { key: 'communication', label: 'Communication' },
  { key: 'resilience', label: 'Resilience' },
  { key: 'independence', label: 'Independence' },
];

export function MyProgress() {
  const { currentMenteeId, getMentee } = useStore();
  const me = getMentee(currentMenteeId)!;

  const completed = me.tasks.filter((t) => t.status === 'completed').length;
  const total = me.tasks.length;

  const openBlockers = me.blockers.filter((b) => !b.resolved);
  const hasFriction = me.delays.length > 0 || openBlockers.length > 0;

  // Encouraging closing read based on momentum + risk.
  const encouragement =
    me.risk === 'high'
      ? "It's been a tough stretch — reaching out to your mentor now is the best next step. You're not behind on effort."
      : me.momentum === 'up'
        ? "You're on track and building real momentum. Keep going — your mentor can see the effort you're putting in."
        : "You're holding steady. Measured fairly against your circumstances, you're doing well.";

  return (
    <Page>
      <PageHeader title="My progress" subtitle="Where you are — measured fairly" />

      {/* Self-facing AI read — full width so it reads cleanly */}
      <div className="mb-6">
        <AISummary
          summary="You're keeping steady momentum even through a busy week. A couple of submissions are with your mentor, and the blocker you flagged early shows good instincts. Measured against your real circumstances, you're ahead of plan — be proud of that."
          signals={me.aiSignals}
          defaultOpen={false}
        />
      </div>

      {/* Dual progress */}
      <Card>
        <SectionLabel>Your progress, two ways</SectionLabel>
        <DualProgress absolute={me.absoluteProgress} relative={me.relativeProgress} />
        <p className="mt-4 text-xs leading-relaxed text-ink-mute">
          <span className="font-medium text-ink-soft">Absolute</span> is your raw output against
          the plan. <span className="font-medium text-brand-700">Relative</span> accounts for the
          circumstances you&apos;ve logged. Both matter &mdash; relative is how your mentor
          understands the real you.
        </p>
      </Card>

      {/* Stat cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat
          label="On-time rate"
          value={<>{me.onTimeRate}%</>}
          hint="Submissions in by their date"
          icon={<Clock className="h-3.5 w-3.5" />}
        />
        <Stat
          label="Tasks completed"
          value={
            <>
              {completed}
              <span className="text-base font-normal text-ink-faint">/ {total}</span>
            </>
          }
          hint="This program so far"
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
        />
        <Stat
          label="Momentum"
          value={
            <span className="flex items-center gap-2 font-sans text-xl capitalize">
              <MomentumIcon momentum={me.momentum} />
              {me.momentum === 'flat' ? 'Steady' : me.momentum}
            </span>
          }
          hint="Trend over recent weeks"
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
        />
      </div>

      {/* What's slowing you down */}
      {hasFriction && (
        <div className="mt-6">
          <SectionLabel>What&apos;s slowing you down</SectionLabel>
          <Card>
            <p className="mb-4 text-xs leading-relaxed text-ink-mute">
              Your mentor can see all of these &mdash; logging them means your progress is judged
              with the full picture in mind.
            </p>
            <div className="space-y-3">
              {me.delays.map((d) => {
                const meta = FRICTION_META[d.kind];
                const Icon = meta.icon;
                return (
                  <div key={`delay-${d.id}`} className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center border border-hairline text-ink-mute">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">{d.reason}</div>
                      <div className="mt-0.5 text-xs text-ink-mute">
                        {d.task} &middot; {d.days} day{d.days === 1 ? '' : 's'} &middot; {d.date}
                      </div>
                    </div>
                    {d.accepted && <Badge tone="emerald">Accounted for</Badge>}
                  </div>
                );
              })}
              {openBlockers.map((b) => (
                <div key={`blocker-${b.id}`} className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center border border-amber-200 text-amber-600">
                    <Flag className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink">{b.title}</div>
                    <div className="mt-0.5 text-xs text-ink-mute capitalize">
                      {b.category} &middot; open {b.daysOpen} day{b.daysOpen === 1 ? '' : 's'}
                    </div>
                  </div>
                  <Badge
                    tone={
                      b.severity === 'high'
                        ? 'rose'
                        : b.severity === 'medium'
                          ? 'amber'
                          : 'neutral'
                    }
                  >
                    <span className="capitalize">{b.severity}</span>
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Working style */}
      <div className="mt-6">
        <SectionLabel>Your working style</SectionLabel>
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            {PERSONALITY_LABELS.map(({ key, label }) => {
              const value = me.personality[key];
              return (
                <div key={key}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-ink-soft">{label}</span>
                    <span className="font-mono font-medium text-ink tnum">{value}</span>
                  </div>
                  <ProgressBar
                    value={value}
                    tone={value >= 80 ? 'emerald' : value >= 55 ? 'brand' : 'amber'}
                  />
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-ink-mute">
            A gentle read of how you tend to work &mdash; not a grade. It helps your mentor
            support you in the way that suits you best.
          </p>
        </Card>
      </div>

      {/* Encouraging close */}
      <Card
        className={cx(
          'mt-6',
          me.risk === 'high' ? 'border-amber-200' : 'border-emerald-200',
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cx(
              'grid h-9 w-9 shrink-0 place-items-center border',
              me.risk === 'high' ? 'border-amber-200 text-amber-600' : 'border-emerald-200 text-emerald-600',
            )}
          >
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold text-ink">
              {me.risk === 'high' ? "Let's reset together" : "You're on track"}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-ink-mute">{encouragement}</p>
          </div>
        </div>
      </Card>
    </Page>
  );
}
