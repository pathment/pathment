import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Pause,
  Award,
  MessageSquare,
  Users,
} from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import {
  Card,
  Badge,
  Button,
  Avatar,
  SectionLabel,
  ProgressBar,
  cx,
} from '@/lib/ui';
import {
  Modal,
  Field,
  TextArea,
  SelectInput,
  Slider,
} from '@/components/overlays';
import { useStore } from '@/store/AppStore';

/* ----------------------------------------------------------------
   Promotion pipeline - strong mentees can become co-mentors. A
   candidate flows nominated -> interview -> approved -> promoted.
   All pipeline state is local; mentee data is read-only from store.
----------------------------------------------------------------- */
type Stage = 'nominated' | 'interview' | 'approved' | 'promoted';

const STAGES: { key: Stage; label: string }[] = [
  { key: 'nominated', label: 'Nominated' },
  { key: 'interview', label: 'Interview' },
  { key: 'approved', label: 'Approved' },
  { key: 'promoted', label: 'Promoted' },
];

const STAGE_ORDER: Stage[] = ['nominated', 'interview', 'approved', 'promoted'];

const AVAILABILITY = [
  'A few hours a week',
  'Most evenings',
  'Weekends only',
  'On demand',
];

/* Local interview record kept per candidate. */
interface Interview {
  willingness: number;
  motivation: string;
  availability: string;
  strengths: string;
}

/* A candidate is a store mentee plus local pipeline state. */
interface Candidate {
  id: number;
  stage: Stage;
  /* derived once at seed time, then editable in the interview */
  willingness: number;
  interview: Interview | null;
}

export function Promotions() {
  const { mentees } = useStore();

  /* Readiness blends real progress, reliability and resilience. It picks
     who is worth nominating, not the co-mentor score itself. */
  const ranked = useMemo(() => {
    return [...mentees]
      .map((m) => {
        const readiness = Math.round(
          m.absoluteProgress * 0.45 +
            m.onTimeRate * 0.35 +
            m.personality.resilience * 0.2,
        );
        /* Willingness to help leans on communication + a steady
           consistency signal (a proxy for showing up for others). */
        const willingness = Math.round(
          m.personality.communication * 0.65 + m.personality.consistency * 0.35,
        );
        return { mentee: m, readiness, willingness };
      })
      .sort((a, b) => b.readiness - a.readiness);
  }, [mentees]);

  /* Seed the top candidates across the early stages so the board reads
     like a live pipeline on first paint. */
  const [candidates, setCandidates] = useState<Candidate[]>(() => {
    const top = ranked.slice(0, 6);
    const seedStage: Stage[] = [
      'nominated',
      'nominated',
      'interview',
      'interview',
      'approved',
      'nominated',
    ];
    return top.map((r, i) => ({
      id: r.mentee.id,
      stage: seedStage[i] ?? 'nominated',
      willingness: r.willingness,
      interview: null,
    }));
  });

  const [filter, setFilter] = useState<Stage | 'all'>('all');
  const [interviewing, setInterviewing] = useState<number | null>(null);

  /* working copy of the interview form */
  const [form, setForm] = useState<Interview>({
    willingness: 70,
    motivation: '',
    availability: AVAILABILITY[0],
    strengths: '',
  });

  const menteeById = useMemo(() => {
    const map = new Map<number, (typeof ranked)[number]>();
    for (const r of ranked) map.set(r.mentee.id, r);
    return map;
  }, [ranked]);

  const counts = useMemo(() => {
    const c: Record<Stage, number> = {
      nominated: 0,
      interview: 0,
      approved: 0,
      promoted: 0,
    };
    for (const cand of candidates) c[cand.stage] += 1;
    return c;
  }, [candidates]);

  const moveTo = (id: number, stage: Stage) =>
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, stage } : c)),
    );

  const nextStage = (stage: Stage): Stage => {
    const idx = STAGE_ORDER.indexOf(stage);
    return STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.length - 1)];
  };

  const openInterview = (cand: Candidate) => {
    setForm(
      cand.interview ?? {
        willingness: cand.willingness,
        motivation: '',
        availability: AVAILABILITY[0],
        strengths: '',
      },
    );
    setInterviewing(cand.id);
  };

  const closeInterview = () => setInterviewing(null);

  const saveInterview = (decision: 'approve' | 'hold') => {
    if (interviewing == null) return;
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === interviewing
          ? {
              ...c,
              willingness: form.willingness,
              interview: { ...form },
              stage: decision === 'approve' ? 'approved' : 'interview',
            }
          : c,
      ),
    );
    setInterviewing(null);
  };

  const visible = candidates.filter(
    (c) => filter === 'all' || c.stage === filter,
  );

  const activeCand =
    interviewing != null
      ? candidates.find((c) => c.id === interviewing) ?? null
      : null;
  const activeMentee =
    activeCand != null ? menteeById.get(activeCand.id)?.mentee ?? null : null;

  return (
    <Page>
      <PageHeader
        title="Promotions"
        subtitle="Grow your strongest mentees into co-mentors"
      />

      {/* explainer */}
      <Card className="mb-6 p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-r border border-hairline text-ink-mute">
            <Award className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="eyebrow mb-1">The co-mentor pipeline</div>
            <p className="max-w-prose text-sm text-ink-soft">
              Mentees who lead by example can step up as co-mentors and help
              the people behind them. Promotion is deliberate: nominate a
              strong learner, run a brief interview to gauge willingness to
              help, then approve and promote.
            </p>
          </div>
        </div>
      </Card>

      {/* stage filter */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter('all')}
          className={cx(
            'rounded-r border px-3 py-1.5 text-sm font-medium transition-colors',
            filter === 'all'
              ? 'border-ink bg-ink text-white'
              : 'border-hairline bg-white text-ink-soft hover:border-ink hover:text-ink',
          )}
        >
          All
          <span className="ml-1.5 font-mono text-[11px] tnum opacity-70">
            {candidates.length}
          </span>
        </button>
        {STAGES.map((s) => {
          const active = filter === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setFilter(s.key)}
              className={cx(
                'rounded-r border px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'border-ink bg-ink text-white'
                  : 'border-hairline bg-white text-ink-soft hover:border-ink hover:text-ink',
              )}
            >
              {s.label}
              <span className="ml-1.5 font-mono text-[11px] tnum opacity-70">
                {counts[s.key]}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <Card className="grid place-items-center py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-r border border-hairline text-ink-faint">
            <Users className="h-6 w-6" />
          </span>
          <p className="mt-4 text-sm font-medium text-ink">
            No candidates in this stage.
          </p>
          <p className="mt-1 text-sm text-ink-mute">
            Move a candidate forward or switch the filter above.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((cand) => {
            const ranking = menteeById.get(cand.id);
            if (!ranking) return null;
            const m = ranking.mentee;
            return (
              <Card key={cand.id} className="animate-slide-in p-5">
                <div className="flex items-start gap-3">
                  <Avatar initials={m.avatar} name={m.name} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-ink">
                        {m.name}
                      </h3>
                      {cand.stage === 'promoted' && (
                        <Badge tone="emerald">
                          <Award className="h-3 w-3" />
                          Co-mentor
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-ink-mute">
                      {m.program} · {m.level}
                    </div>
                  </div>
                  <Badge tone={cand.stage === 'promoted' ? 'emerald' : 'brand'}>
                    {STAGES.find((s) => s.key === cand.stage)?.label}
                  </Badge>
                </div>

                {/* willingness to help */}
                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                      Willingness to help
                    </span>
                    <span className="font-mono font-medium text-ink tnum">
                      {cand.willingness}
                    </span>
                  </div>
                  <ProgressBar
                    value={cand.willingness}
                    tone={cand.willingness >= 70 ? 'emerald' : 'amber'}
                  />
                </div>

                {/* supporting signals */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-hairline pt-3 text-xs text-ink-mute">
                  <span>
                    Readiness{' '}
                    <span className="font-mono font-medium text-ink tnum">
                      {ranking.readiness}
                    </span>
                  </span>
                  <span>
                    On-time{' '}
                    <span className="font-mono font-medium text-ink tnum">
                      {m.onTimeRate}%
                    </span>
                  </span>
                  <span>
                    Progress{' '}
                    <span className="font-mono font-medium text-ink tnum">
                      {m.absoluteProgress}%
                    </span>
                  </span>
                </div>

                {/* stage actions */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {cand.stage === 'nominated' && (
                    <Button
                      variant="soft"
                      size="sm"
                      onClick={() => moveTo(cand.id, 'interview')}
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      Move to interview
                    </Button>
                  )}

                  {cand.stage === 'interview' && (
                    <Button
                      size="sm"
                      onClick={() => openInterview(cand)}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      {cand.interview ? 'Review interview' : 'Brief interview'}
                    </Button>
                  )}

                  {cand.stage === 'approved' && (
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => moveTo(cand.id, 'promoted')}
                    >
                      <Award className="h-3.5 w-3.5" />
                      Approve &amp; promote
                    </Button>
                  )}

                  {cand.stage === 'promoted' && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                      <Check className="h-3.5 w-3.5" />
                      Promoted to co-mentor
                    </span>
                  )}

                  {/* allow nudging forward by hand when not at the end */}
                  {cand.stage !== 'promoted' && cand.stage !== 'interview' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moveTo(cand.id, nextStage(cand.stage))}
                    >
                      Advance
                    </Button>
                  )}
                </div>

                {cand.interview && cand.stage !== 'promoted' && (
                  <p className="mt-3 line-clamp-2 border-t border-hairline pt-3 text-[11px] text-ink-faint">
                    Interview noted · {cand.interview.availability}
                    {cand.interview.strengths
                      ? ` · ${cand.interview.strengths}`
                      : ''}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* brief interview modal */}
      <Modal
        open={interviewing != null}
        onClose={closeInterview}
        title={
          activeMentee ? `Brief interview · ${activeMentee.name}` : 'Brief interview'
        }
        subtitle="A few questions to gauge fit as a co-mentor."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => saveInterview('hold')}>
              <Pause className="h-4 w-4" />
              Hold
            </Button>
            <Button variant="success" onClick={() => saveInterview('approve')}>
              <Check className="h-4 w-4" />
              Approve
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <Field label="Willingness to help others">
            <div className="pt-1">
              <Slider
                label="Score"
                value={form.willingness}
                onChange={(v) => setForm((f) => ({ ...f, willingness: v }))}
              />
            </div>
          </Field>

          <Field
            label="Why do they want to mentor?"
            hint="Their own words help, even paraphrased."
          >
            <TextArea
              rows={3}
              value={form.motivation}
              onChange={(e) =>
                setForm((f) => ({ ...f, motivation: e.target.value }))
              }
              placeholder="Wants to give back, enjoys explaining concepts, sees it as growth."
            />
          </Field>

          <Field label="Availability">
            <SelectInput
              value={form.availability}
              onChange={(e) =>
                setForm((f) => ({ ...f, availability: e.target.value }))
              }
            >
              {AVAILABILITY.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Strengths note" hint="What would they bring to a co-mentor seat?">
            <TextArea
              rows={2}
              value={form.strengths}
              onChange={(e) =>
                setForm((f) => ({ ...f, strengths: e.target.value }))
              }
              placeholder="Patient, clear communicator, reliable under pressure."
            />
          </Field>
        </div>
      </Modal>

      {/* footnote */}
      <div className="mt-6">
        <SectionLabel>How promotion works</SectionLabel>
        <p className="max-w-prose text-xs text-ink-mute">
          Nominated candidates are surfaced from your strongest mentees by a
          readiness score. A short interview confirms they want the role and
          can make the time. Approved candidates are one click from becoming
          co-mentors.
        </p>
      </div>
    </Page>
  );
}
