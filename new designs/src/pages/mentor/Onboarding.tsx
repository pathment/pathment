import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  CalendarClock,
  GitBranch,
  KeyRound,
  Rocket,
  Sparkles,
  User,
  Users,
  Plus,
  X,
  Clock,
} from 'lucide-react';
import { Button, Card, Avatar, SectionLabel, cx } from '@/lib/ui';
import { Field, TextInput, SelectInput } from '@/components/overlays';
import { PROVIDER_META } from '@/lib/ai';
import { useStore } from '@/store/AppStore';
import type { AIProvider } from '@/lib/types';

const STEP_LABELS = ['Welcome', 'Profile', 'AI assist', 'Schedule', 'Availability', 'All set'];
const AVAIL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const AVAIL_TIMES = ['9:00 AM', '10:00 AM', '11:00 AM', '12:30 PM', '2:00 PM', '3:30 PM', '5:00 PM'];
const AVAIL_DURATIONS = [15, 20, 30, 45, 60];

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'NA';

/* First-run mentor onboarding - a short, skippable wizard that wires straight
   into the live store: profile, an optional AI key, a methodology schedule to
   adopt, and a few 1:1 availability slots. */
export function MentorOnboarding() {
  const navigate = useNavigate();
  const {
    mentor,
    setMentorPref,
    addKey,
    scheduleTemplates,
    inheritOrgTemplate,
    addAvailabilitySlot,
    completeOnboarding,
  } = useStore();

  const orgTemplates = scheduleTemplates.filter((t) => t.source === 'org');

  const [step, setStep] = useState(0);

  // profile
  const [name, setName] = useState(mentor.name);
  const [role, setRole] = useState(mentor.role);
  const [program, setProgram] = useState(mentor.program);
  const [maxMentees, setMaxMentees] = useState(String(mentor.maxMentees));
  const [accepting, setAccepting] = useState(mentor.acceptingMentees);

  // ai (optional)
  const [provider, setProvider] = useState<AIProvider>('groq');
  const [keyLabel, setKeyLabel] = useState('');
  const [keyValue, setKeyValue] = useState('');

  // schedule
  const [scheduleId, setScheduleId] = useState<number | null>(orgTemplates[0]?.id ?? null);

  // availability (optional)
  const [aDay, setADay] = useState('Tue');
  const [aTime, setATime] = useState('10:00 AM');
  const [aDur, setADur] = useState(30);
  const [avail, setAvail] = useState<{ day: string; time: string; durationMins: number }[]>([]);

  const last = STEP_LABELS.length - 1;
  const go = (n: number) => setStep(Math.max(0, Math.min(n, last)));

  const finish = () => {
    setMentorPref({
      name: name.trim() || mentor.name,
      role: role.trim() || mentor.role,
      program: program.trim() || mentor.program,
      maxMentees: Number(maxMentees) || mentor.maxMentees,
      acceptingMentees: accepting,
      avatar: initials(name),
    });
    if (keyValue.trim()) {
      addKey({ provider, label: keyLabel.trim() || PROVIDER_META[provider].label, key: keyValue.trim() });
    }
    if (scheduleId != null) inheritOrgTemplate(scheduleId);
    avail.forEach((s) => addAvailabilitySlot(s));
    completeOnboarding();
    navigate('/mentor/cockpit');
  };

  const profileValid = name.trim().length > 0 && program.trim().length > 0;

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-ink">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-8">
        {/* header - wordmark + stepper */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-r bg-ink text-white">
                <span className="text-[13px] font-bold">P</span>
              </span>
              <span className="text-sm font-semibold tracking-tight">Pathment</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                Mentor setup
              </span>
            </div>
            <button
              onClick={() => {
                completeOnboarding();
                navigate('/mentor/cockpit');
              }}
              className="text-xs text-ink-faint transition-colors hover:text-ink"
            >
              Skip for now
            </button>
          </div>

          {/* step bars */}
          <div className="mt-5 flex items-center gap-1.5">
            {STEP_LABELS.map((lbl, i) => (
              <div key={lbl} className="flex-1">
                <div
                  className={cx(
                    'h-1 rounded-full transition-colors',
                    i < step ? 'bg-ink' : i === step ? 'bg-[#0066FF]' : 'bg-neutral-200',
                  )}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
              Step {step + 1} of {STEP_LABELS.length}
            </span>
            <span className="text-[11px] font-medium text-ink-mute">{STEP_LABELS[step]}</span>
          </div>
        </div>

        {/* step content */}
        <div className="flex-1">
          {step === 0 && <WelcomeStep />}
          {step === 1 && (
            <ProfileStep
              name={name}
              setName={setName}
              role={role}
              setRole={setRole}
              program={program}
              setProgram={setProgram}
              maxMentees={maxMentees}
              setMaxMentees={setMaxMentees}
              accepting={accepting}
              setAccepting={setAccepting}
            />
          )}
          {step === 2 && (
            <AiStep
              provider={provider}
              setProvider={setProvider}
              keyLabel={keyLabel}
              setKeyLabel={setKeyLabel}
              keyValue={keyValue}
              setKeyValue={setKeyValue}
            />
          )}
          {step === 3 && (
            <ScheduleStep templates={orgTemplates} selected={scheduleId} onSelect={setScheduleId} />
          )}
          {step === 4 && (
            <AvailabilityStep
              aDay={aDay}
              setADay={setADay}
              aTime={aTime}
              setATime={setATime}
              aDur={aDur}
              setADur={setADur}
              avail={avail}
              add={() => setAvail((p) => [...p, { day: aDay, time: aTime, durationMins: aDur }])}
              remove={(i) => setAvail((p) => p.filter((_, idx) => idx !== i))}
            />
          )}
          {step === 5 && (
            <DoneStep
              name={name}
              program={program}
              hasKey={!!keyValue.trim()}
              scheduleName={orgTemplates.find((t) => t.id === scheduleId)?.name}
              availCount={avail.length}
            />
          )}
        </div>

        {/* footer nav */}
        <div className="mt-8 flex items-center justify-between border-t border-hairline pt-5">
          <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 0}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            {(step === 2 || step === 4) && (
              <Button variant="outline" onClick={() => go(step + 1)}>
                Skip
              </Button>
            )}
            {step < last ? (
              <Button onClick={() => go(step + 1)} disabled={step === 1 && !profileValid}>
                {step === 0 ? 'Get started' : 'Continue'} <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={finish}>
                <Rocket className="h-4 w-4" /> Go to cockpit
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- steps ---------------- */

function WelcomeStep() {
  const points = [
    { icon: User, title: 'Set up your mentor profile', body: 'Your name, focus, and how many mentees you can take.' },
    { icon: Sparkles, title: 'Bring your own AI key', body: 'Route summaries, nudges, and delay analysis through your own provider.' },
    { icon: GitBranch, title: 'Adopt a schedule', body: 'Start from our methodology: a structured weekday and a weekend grind.' },
    { icon: CalendarClock, title: 'Open your 1:1 times', body: 'Publish concrete slots so mentees can book you directly.' },
  ];
  return (
    <Card className="p-8">
      <span className="grid h-12 w-12 place-items-center rounded-r border border-hairline text-ink">
        <Rocket className="h-6 w-6" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Welcome to Pathment</h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-mute">
        A few quick steps and you are ready to run your clan. Everything here is optional and editable
        later from Settings. It takes about two minutes.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {points.map((p) => (
          <div key={p.title} className="rounded-r flex items-start gap-3 border border-hairline p-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center border border-hairline text-ink-mute">
              <p.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">{p.title}</div>
              <div className="mt-0.5 text-xs text-ink-mute">{p.body}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProfileStep(props: {
  name: string;
  setName: (v: string) => void;
  role: string;
  setRole: (v: string) => void;
  program: string;
  setProgram: (v: string) => void;
  maxMentees: string;
  setMaxMentees: (v: string) => void;
  accepting: boolean;
  setAccepting: (v: boolean) => void;
}) {
  const { name, setName, role, setRole, program, setProgram, maxMentees, setMaxMentees, accepting, setAccepting } = props;
  return (
    <Card className="p-8">
      <SectionLabel>Your profile</SectionLabel>
      <div className="mb-5 flex items-center gap-3">
        <Avatar initials={initials(name)} name={name} size="lg" />
        <div className="text-xs text-ink-mute">This is how mentees and admins see you.</div>
      </div>
      <div className="space-y-4">
        <Field label="Full name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah Chen" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Title / role">
            <TextInput value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Senior Mentor" />
          </Field>
          <Field label="Program">
            <TextInput value={program} onChange={(e) => setProgram(e.target.value)} placeholder="e.g. Full-Stack Web Development" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Max mentees" hint="How many you can actively mentor.">
            <SelectInput value={maxMentees} onChange={(e) => setMaxMentees(e.target.value)}>
              {[4, 6, 8, 10, 12, 15].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Accepting mentees">
            <div className="flex gap-1.5">
              {[
                { v: true, l: 'Open' },
                { v: false, l: 'Paused' },
              ].map((o) => (
                <button
                  key={o.l}
                  onClick={() => setAccepting(o.v)}
                  className={cx(
                    'rounded-r flex-1 border px-3 py-2 text-sm transition-colors',
                    accepting === o.v ? 'border-ink bg-ink text-white' : 'border-hairline text-ink-mute hover:border-ink',
                  )}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </div>
    </Card>
  );
}

function AiStep(props: {
  provider: AIProvider;
  setProvider: (v: AIProvider) => void;
  keyLabel: string;
  setKeyLabel: (v: string) => void;
  keyValue: string;
  setKeyValue: (v: string) => void;
}) {
  const { provider, setProvider, keyLabel, setKeyLabel, keyValue, setKeyValue } = props;
  const meta = PROVIDER_META[provider];
  const providers = Object.keys(PROVIDER_META) as AIProvider[];
  return (
    <Card className="p-8">
      <span className="grid h-10 w-10 place-items-center rounded-r border border-hairline text-ink">
        <KeyRound className="h-5 w-5" />
      </span>
      <h2 className="mt-4 text-lg font-semibold tracking-tight">Bring your own AI key</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-mute">
        Pathment routes each AI feature through your key. Nothing leaves your account. Optional - you can
        add this later in Settings.
      </p>
      <div className="mt-5 space-y-4">
        <Field label="Provider">
          <div className="flex flex-wrap gap-1.5">
            {providers.map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={cx(
                  'rounded-r border px-3 py-1.5 text-xs transition-colors',
                  provider === p ? 'border-ink bg-ink text-white' : 'border-hairline text-ink-mute hover:border-ink',
                )}
              >
                {PROVIDER_META[p].label}
              </button>
            ))}
          </div>
        </Field>
        <p className="text-xs text-ink-faint">{meta.hint}</p>
        <Field label="Label">
          <TextInput value={keyLabel} onChange={(e) => setKeyLabel(e.target.value)} placeholder={`e.g. ${meta.label} - primary`} />
        </Field>
        <Field label="API key" hint={meta.keyPrefix ? `Usually starts with ${meta.keyPrefix}` : 'Any OpenAI-compatible key.'}>
          <TextInput
            type="password"
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            placeholder={`${meta.keyPrefix}••••••••`}
          />
        </Field>
      </div>
    </Card>
  );
}

function ScheduleStep({
  templates,
  selected,
  onSelect,
}: {
  templates: { id: number; name: string; description?: string; blocks: { id: number; days?: string }[] }[];
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <Card className="p-8">
      <SectionLabel>Adopt a schedule</SectionLabel>
      <p className="mb-4 max-w-prose text-sm text-ink-mute">
        Pick a published schedule to start from. It is pure structure - you fill each slot with a roadmap
        or recurring task per mentee after assigning. You can edit or switch it any time.
      </p>
      <div className="space-y-2">
        {templates.map((t) => {
          const on = selected === t.id;
          const weekend = t.blocks.filter((b) => (b.days ?? 'everyday') === 'weekends').length;
          const weekday = t.blocks.length - weekend;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={cx(
                'rounded-r flex w-full items-start gap-3 border px-4 py-3 text-left transition-colors',
                on ? 'border-ink' : 'border-hairline hover:border-ink',
              )}
            >
              <span
                className={cx(
                  'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                  on ? 'border-ink bg-ink text-white' : 'border-hairline text-transparent',
                )}
              >
                <Check className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">{t.name}</span>
                  <span className="font-mono text-[10px] text-ink-faint tnum">{t.blocks.length} slots</span>
                </span>
                {t.description && <span className="mt-0.5 block text-xs text-ink-mute">{t.description}</span>}
                <span className="mt-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                  <Clock className="h-3 w-3" /> {weekday} weekday
                  {weekend > 0 && <> · {weekend} weekend</>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function AvailabilityStep(props: {
  aDay: string;
  setADay: (v: string) => void;
  aTime: string;
  setATime: (v: string) => void;
  aDur: number;
  setADur: (v: number) => void;
  avail: { day: string; time: string; durationMins: number }[];
  add: () => void;
  remove: (i: number) => void;
}) {
  const { aDay, setADay, aTime, setATime, aDur, setADur, avail, add, remove } = props;
  return (
    <Card className="p-8">
      <SectionLabel>Your 1:1 availability</SectionLabel>
      <p className="mb-4 max-w-prose text-sm text-ink-mute">
        Publish a few concrete times you are free. Mentees book one and it becomes a 1:1. Optional - add
        more later from Schedules.
      </p>
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-r border border-hairline bg-neutral-50/60 p-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">Day</span>
          <SelectInput value={aDay} onChange={(e) => setADay(e.target.value)} className="h-8 w-24 py-1 text-xs">
            {AVAIL_DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </SelectInput>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">Time</span>
          <SelectInput value={aTime} onChange={(e) => setATime(e.target.value)} className="h-8 w-28 py-1 text-xs">
            {AVAIL_TIMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </SelectInput>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">Length</span>
          <SelectInput value={aDur} onChange={(e) => setADur(Number(e.target.value))} className="h-8 w-24 py-1 text-xs">
            {AVAIL_DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </SelectInput>
        </label>
        <Button size="sm" onClick={add}>
          <Plus className="h-4 w-4" /> Add slot
        </Button>
      </div>
      {avail.length === 0 ? (
        <p className="text-sm text-ink-faint">No times added yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {avail.map((s, i) => (
            <div key={i} className="rounded-r flex items-center gap-2 border border-emerald-300 px-3 py-2 text-sm">
              <CalendarClock className="h-3.5 w-3.5 text-emerald-600" />
              <span className="font-medium">
                {s.day} {s.time}
              </span>
              <span className="font-mono text-[11px] text-ink-faint">{s.durationMins}m</span>
              <button onClick={() => remove(i)} title="Remove" className="text-ink-faint hover:text-[#FF3B30]">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function DoneStep({
  name,
  program,
  hasKey,
  scheduleName,
  availCount,
}: {
  name: string;
  program: string;
  hasKey: boolean;
  scheduleName?: string;
  availCount: number;
}) {
  const rows = [
    { icon: User, label: 'Profile', value: `${name.trim() || 'Mentor'} · ${program.trim() || 'Program'}` },
    { icon: Sparkles, label: 'AI key', value: hasKey ? 'Connected' : 'Skipped - add later in Settings' },
    { icon: GitBranch, label: 'Schedule', value: scheduleName ? `Adopting ${scheduleName}` : 'None selected' },
    { icon: CalendarClock, label: '1:1 availability', value: availCount > 0 ? `${availCount} slot${availCount === 1 ? '' : 's'} published` : 'Skipped' },
  ];
  return (
    <Card className="p-8">
      <span className="grid h-12 w-12 place-items-center rounded-r bg-emerald-50 text-emerald-600">
        <CheckCircle2 className="h-6 w-6" />
      </span>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight">You are all set</h2>
      <p className="mt-2 max-w-prose text-sm text-ink-mute">
        Here is what we will apply. You can change any of it later from Settings and Schedules.
      </p>
      <div className="mt-6 divide-y divide-hairline border-y border-hairline">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 py-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center border border-hairline text-ink-mute">
              <r.icon className="h-4 w-4" />
            </span>
            <span className="w-32 shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
              {r.label}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{r.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-2 text-xs text-ink-mute">
        <Users className="h-3.5 w-3.5" /> Next: assign your schedule to mentees and drop roadmaps into each slot.
      </div>
    </Card>
  );
}
