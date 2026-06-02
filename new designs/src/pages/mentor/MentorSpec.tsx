import { useState } from 'react';
import {
  Compass,
  Eye,
  MessageSquare,
  PenLine,
  ShieldCheck,
  TrendingUp,
  Check,
  Clock,
  Calendar,
  Users,
  ChevronDown,
  Wand2,
} from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { Card, Badge, Button, SectionLabel, cx } from '@/lib/ui';
import { useStore } from '@/store/AppStore';

/* ----------------------------------------------------------------
   The mentor spec — a reference page that complements the onboarding
   wizard. Mission, principles, responsibilities, conduct, FAQs.
----------------------------------------------------------------- */

type Principle = {
  icon: typeof Compass;
  title: string;
  body: string;
};

const PRINCIPLES: Principle[] = [
  {
    icon: Eye,
    title: 'Read the signal early',
    body: 'Watch momentum, not just completion. A quiet mentee one week before a deadline is worth a check-in today.',
  },
  {
    icon: TrendingUp,
    title: 'Coach relative, not absolute',
    body: 'Two mentees at the same week can be in very different places. Meet each one where they actually are.',
  },
  {
    icon: MessageSquare,
    title: 'Be specific in feedback',
    body: 'Point at the line, the commit, the decision. Vague praise and vague criticism both stall a learner.',
  },
  {
    icon: PenLine,
    title: 'Log what you learn',
    body: 'Every insight gets attribution and a date. The next reviewer should never have to rediscover what you already saw.',
  },
  {
    icon: ShieldCheck,
    title: 'Protect the person',
    body: 'Skills can wait, a person in distress cannot. Know when a problem is no longer yours to solve alone.',
  },
  {
    icon: Compass,
    title: 'Hold the standard',
    body: 'Kind and rigorous are not opposites. Ship-quality work is the most respectful thing you can ask for.',
  },
];

const RESPONSIBILITIES: string[] = [
  'Run a weekly review for every active mentee in your clan',
  'Keep at-risk flags current — raise, lower, and clear them as the week changes',
  'Hold scheduled 1:1s and log a short note after each one',
  'Record insights with attribution so the trail survives a handoff',
  'Respond to flagged blockers within the 24-hour SLA',
  'Score submissions on time, with a reason the mentee can act on',
];

type Stat = {
  icon: typeof Clock;
  value: string;
  label: string;
};

const STATS: Stat[] = [
  { icon: Clock, value: '~5 hrs', label: 'per week, on average' },
  { icon: Calendar, value: 'Weekly', label: 'clan review cadence' },
  { icon: Users, value: '1:1s', label: 'with every mentee, biweekly' },
];

const CONDUCT: string[] = [
  'Keep what a mentee shares in confidence, confidential.',
  'Give feedback on the work, never a verdict on the person.',
  'Declare a conflict of interest the moment you notice one.',
  'Escalate safety and wellbeing concerns the same day.',
  'Never share, sell, or reuse a mentee key or credential.',
];

type Faq = {
  q: string;
  a: string;
};

const FAQS: Faq[] = [
  {
    q: 'How does scoring actually work?',
    a: 'Each submission carries a base score from the rubric, then a speed factor for how close it landed to the deadline. Your mentor score is a third input. The three combine into the number the mentee sees, so a thoughtful late submission and a rushed early one can land in very different places.',
  },
  {
    q: 'What is the difference between relative and absolute progress?',
    a: 'Absolute progress is how far through the roadmap a mentee is. Relative progress is how they are pacing against where they should be by now. A mentee can be 40 percent through the course and still ahead of schedule, or behind it. You coach on the relative number.',
  },
  {
    q: 'How do roadmaps auto-assign tasks?',
    a: 'A roadmap is a track of templates with prerequisites. As a mentee clears a task, the next eligible ones unlock and land in their queue automatically. You can override the order or hand-assign a task when someone needs a different path.',
  },
  {
    q: 'When should I escalate to a psychologist?',
    a: 'Any sign of burnout, withdrawal, or distress that goes past a normal rough week. You are a mentor, not a clinician. Raise a wellbeing flag and the support team takes it from there. Do not wait for certainty.',
  },
  {
    q: 'How do I request a clan change?',
    a: 'Open the mentee profile, use the clan action, and leave a short reason. An admin reviews it. Capacity, timezone fit, and a clear rationale all help it move faster.',
  },
  {
    q: 'Can I bring my own AI keys?',
    a: 'Yes. Add your provider keys in Settings and route each AI feature to the key you want. The keys stay yours, scoped to your account, and you can swap or revoke them at any time.',
  },
  {
    q: 'What happens when a mentee misses the deadline?',
    a: 'The task stays open and the speed factor decays, so on-time work is rewarded without locking anyone out. Late work still counts. If misses pile up, that is your cue to raise an at-risk flag and book a 1:1.',
  },
  {
    q: 'How is the weekend grind structured?',
    a: 'Weekdays carry the structured rhythm — journaling, reading, three talks paired with meals, and core work. Weekends are the ten-hour deep-work grind, balanced with deliberate family time. The cadence is the methodology, not a suggestion.',
  },
];

export function MentorSpec() {
  const { mentor } = useStore();
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <Page>
      <PageHeader
        title="The mentor spec"
        subtitle="What we expect, what we measure, and the questions every mentor asks."
        actions={<Badge tone="brand">{mentor.role}</Badge>}
      />

      {/* HERO — mission + methodology */}
      <Card className="mb-6 p-6">
        <div className="eyebrow mb-3">Pathment · Mentoring</div>
        <p className="max-w-2xl text-lg font-medium leading-snug text-ink">
          Your job is to turn a roadmap into a person who can ship. You hold the
          standard, read the signal early, and make sure no one slips through a
          quiet week unseen.
        </p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft">
          The method is a weekday rhythm of journaling, reading, three talks
          paired with meals, and core work, set against a weekend of the
          ten-hour grind and deliberate family time. You keep the rhythm honest.
        </p>
      </Card>

      {/* PRINCIPLES */}
      <SectionLabel>What a great mentor does</SectionLabel>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRINCIPLES.map((p) => {
          const Icon = p.icon;
          return (
            <Card key={p.title} className="p-5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-r border border-hairline text-ink-soft">
                <Icon className="h-4 w-4" />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-ink">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-mute">
                {p.body}
              </p>
            </Card>
          );
        })}
      </div>

      {/* RESPONSIBILITIES + TIME, two columns on wide screens */}
      <div className="mb-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <SectionLabel>Responsibilities</SectionLabel>
          <Card className="p-0">
            <ul className="divide-y divide-hairline">
              {RESPONSIBILITIES.map((r, i) => {
                const on = checked.has(i);
                return (
                  <li key={r}>
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-neutral-50"
                    >
                      <span
                        className={cx(
                          'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-r border',
                          on
                            ? 'border-ink bg-ink text-white'
                            : 'border-hairline text-transparent',
                        )}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      <span
                        className={cx(
                          'text-sm leading-snug',
                          on ? 'text-ink-faint line-through' : 'text-ink-soft',
                        )}
                      >
                        {r}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div>
          <SectionLabel>Time commitment</SectionLabel>
          <Card className="p-0">
            <ul className="divide-y divide-hairline">
              {STATS.map((s) => {
                const Icon = s.icon;
                return (
                  <li key={s.label} className="flex items-center gap-3 px-5 py-4">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-r border border-hairline text-ink-soft">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-mono text-base font-semibold text-ink tnum">
                        {s.value}
                      </div>
                      <div className="text-xs text-ink-mute">{s.label}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>

      {/* CODE OF CONDUCT */}
      <SectionLabel>Code of conduct</SectionLabel>
      <Card className="mb-8 p-5">
        <ul className="space-y-2.5">
          {CONDUCT.map((c) => (
            <li key={c} className="flex items-start gap-2.5">
              <span className="mt-2 h-1 w-1 shrink-0 bg-ink" />
              <span className="text-sm leading-relaxed text-ink-soft">{c}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* FAQS — accordion */}
      <SectionLabel>FAQs</SectionLabel>
      <Card className="mb-8 p-0">
        <ul className="divide-y divide-hairline">
          {FAQS.map((f, i) => {
            const open = openFaq === i;
            return (
              <li key={f.q}>
                <button
                  type="button"
                  onClick={() => setOpenFaq(open ? null : i)}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left"
                >
                  <span className="font-mono text-[11px] text-ink-faint tnum">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="flex-1 text-sm font-medium text-ink">
                    {f.q}
                  </span>
                  <ChevronDown
                    className={cx(
                      'h-4 w-4 shrink-0 text-ink-faint transition-transform',
                      open && 'rotate-180',
                    )}
                  />
                </button>
                {open && (
                  <div className="px-5 pb-4 pl-[3.25rem]">
                    <p className="max-w-2xl text-sm leading-relaxed text-ink-mute">
                      {f.a}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {/* FOOTER CTA */}
      <Card className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-semibold text-ink">Ready to set up?</h3>
          <p className="mt-1 text-sm text-ink-mute">
            The wizard walks you through availability, capacity, and your AI
            keys in a few minutes.
          </p>
        </div>
        <Button>
          <Wand2 className="h-4 w-4" /> Run the setup wizard
        </Button>
      </Card>
    </Page>
  );
}
