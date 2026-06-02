import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Paperclip,
  Link as LinkIcon,
  CalendarClock,
  Flag,
  Send,
  Heart,
} from 'lucide-react';
import {
  Badge,
  Card,
  Button,
  SectionLabel,
  TASK_TYPE_LABEL,
  STATUS_META,
  FRICTION_META,
  cx,
} from '@/lib/ui';
import { Page } from '@/components/Page';
import { useStore } from '@/store/AppStore';
import { slotLabel } from '@/lib/ai';
import type { FrictionKind } from '@/lib/types';

type Panel = 'submit' | 'extension' | 'blocker';
type Severity = 'low' | 'medium' | 'high';

const PANELS: { key: Panel; label: string; icon: typeof Send }[] = [
  { key: 'submit', label: 'Submit work', icon: Send },
  { key: 'extension', label: 'Request extension', icon: CalendarClock },
  { key: 'blocker', label: 'Log a blocker', icon: Flag },
];

function Confirmation({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-emerald-50/70 px-6 py-10 text-center animate-scale-in">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-white shadow-soft">
        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
      </span>
      <div className="text-base font-semibold text-ink">{title}</div>
      <p className="max-w-sm text-sm leading-relaxed text-ink-mute">{body}</p>
    </div>
  );
}

export function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentMenteeId, getMentee, getSchedule, submitTask, requestExtension, logFriction } = useStore();
  const me = getMentee(currentMenteeId)!;
  const task = me.tasks.find((t) => String(t.id) === id);

  const [panel, setPanel] = useState<Panel>('submit');

  // Submit-work form state
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');
  // Local flag only drives the confirmation animation; the real status lives in the store.
  const [justSubmitted, setJustSubmitted] = useState(false);

  // Extension state
  const [extReason, setExtReason] = useState('');
  const [extDate, setExtDate] = useState('');
  const [extKind, setExtKind] = useState<FrictionKind | null>(null);
  const [extDone, setExtDone] = useState(false);

  // Blocker state
  const [blockKind, setBlockKind] = useState<FrictionKind | null>(null);
  const [blockDesc, setBlockDesc] = useState('');
  const [blockSeverity, setBlockSeverity] = useState<Severity>('medium');
  const [blockDone, setBlockDone] = useState(false);

  if (!task) {
    return (
      <Page>
        <Card className="mx-auto mt-10 max-w-md text-center">
          <div className="text-base font-semibold text-ink">Task not found</div>
          <p className="mt-2 text-sm text-ink-mute">
            We couldn&apos;t find that task. It may have moved or been completed.
          </p>
          <Link to="/mentee/this-week" className="mt-4 inline-block">
            <Button variant="soft" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Back to This Week
            </Button>
          </Link>
        </Card>
      </Page>
    );
  }

  const status = STATUS_META[task.status];
  const frictionKinds = Object.entries(FRICTION_META) as [
    FrictionKind,
    (typeof FRICTION_META)[FrictionKind],
  ][];

  return (
    <Page>
      <Link
        to="/mentee/this-week"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-mute transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        This week
      </Link>

      {/* Header */}
      <div className="mb-6 animate-slide-in">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{TASK_TYPE_LABEL[task.type]}</Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
          {task.recurrence && task.recurrence !== 'once' && (
            <Badge tone="brand">{task.recurrence === 'daily' ? 'Daily' : 'Weekly'}</Badge>
          )}
          {task.late && <Badge tone="amber">Late</Badge>}
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{task.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-mute">
          <span>Due {task.due}</span>
          {task.slot && task.slot !== 'anytime' && (
            <>
              <span className="text-ink-faint">&middot;</span>
              <span>{slotLabel(task.slot, getSchedule(me.id))} slot</span>
            </>
          )}
          {task.track && (
            <>
              <span className="text-ink-faint">&middot;</span>
              <span>{task.track} track</span>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Brief + criteria */}
        <div className="space-y-6 lg:col-span-1">
          {task.brief && (
            <Card>
              <SectionLabel>Brief</SectionLabel>
              <p className="text-sm leading-relaxed text-ink-soft">{task.brief}</p>
            </Card>
          )}
          {task.criteria && task.criteria.length > 0 && (
            <Card>
              <SectionLabel>What passes</SectionLabel>
              <ul className="space-y-2.5">
                {task.criteria.map((c) => (
                  <li key={c} className="flex items-start gap-2.5 text-sm text-ink-soft">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-faint">
                This is the bar - no surprises. Hit these and you&apos;re good.
              </p>
            </Card>
          )}
        </div>

        {/* Action panel */}
        <div className="lg:col-span-2">
          <Card className="p-0">
            {/* Segmented switcher */}
            <div className="flex gap-1 border-b border-neutral-100 p-1.5">
              {PANELS.map((p) => {
                const Icon = p.icon;
                const active = panel === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => setPanel(p.key)}
                    className={cx(
                      'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:text-sm',
                      active
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-ink-mute hover:bg-neutral-50 hover:text-ink',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{p.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="p-5">
              {/* SUBMIT */}
              {panel === 'submit' &&
                (justSubmitted || task.status === 'submitted' ? (
                  <Confirmation
                    title="Submitted - nicely done"
                    body="Your mentor will review this and get back to you. No need to do anything else right now."
                  />
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink">
                        Link to your work
                      </label>
                      <div className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 focus-within:border-brand-300">
                        <LinkIcon className="h-4 w-4 text-ink-faint" />
                        <input
                          value={link}
                          onChange={(e) => setLink(e.target.value)}
                          placeholder="https://github.com/you/repo"
                          className="h-9 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink">
                        Notes for your mentor{' '}
                        <span className="font-normal text-ink-faint">(optional)</span>
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={4}
                        placeholder="Anything you'd like them to know about this submission…"
                        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand-300"
                      />
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-sm text-ink-mute transition-colors hover:border-brand-300 hover:text-ink"
                    >
                      <Paperclip className="h-4 w-4" />
                      Attach a file
                    </button>
                    <div className="flex items-center justify-end gap-3 pt-1">
                      <Button
                        variant="success"
                        onClick={() => {
                          submitTask(task.id, link.trim(), notes.trim() || undefined);
                          setJustSubmitted(true);
                        }}
                        disabled={!link.trim()}
                      >
                        <Send className="h-4 w-4" />
                        Submit for review
                      </Button>
                    </div>
                  </div>
                ))}

              {/* EXTENSION */}
              {panel === 'extension' &&
                (extDone ? (
                  <Confirmation
                    title="Extension requested"
                    body="Requests with a logged reason are looked at fairly. Your mentor will confirm the new date soon."
                  />
                ) : (
                  <div className="space-y-4">
                    <p className="rounded-xl bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-ink-mute">
                      Asking for more time is completely fine. Extensions with a logged reason
                      are looked at fairly - this isn&apos;t held against you.
                    </p>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink">
                        Why do you need more time?
                      </label>
                      <textarea
                        value={extReason}
                        onChange={(e) => setExtReason(e.target.value)}
                        rows={3}
                        placeholder="A short, honest reason helps your mentor understand."
                        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand-300"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink">
                        What kind of friction is this?
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {frictionKinds.map(([kind, meta]) => {
                          const Icon = meta.icon;
                          const active = extKind === kind;
                          return (
                            <button
                              key={kind}
                              onClick={() => setExtKind(kind)}
                              className={cx(
                                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                                active
                                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                                  : 'border-neutral-200 text-ink-mute hover:bg-neutral-50',
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {meta.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink">
                        New date you&apos;re aiming for
                      </label>
                      <input
                        type="date"
                        value={extDate}
                        onChange={(e) => setExtDate(e.target.value)}
                        className="h-9 rounded-lg border border-neutral-200 px-3 text-sm text-ink outline-none transition-colors focus:border-brand-300"
                      />
                    </div>
                    <div className="flex items-center justify-end pt-1">
                      <Button
                        onClick={() => {
                          if (!extKind) return;
                          requestExtension(task.id, extReason.trim(), extKind, extDate);
                          setExtDone(true);
                        }}
                        disabled={!extReason.trim() || !extDate || !extKind}
                      >
                        <CalendarClock className="h-4 w-4" />
                        Request extension
                      </Button>
                    </div>
                  </div>
                ))}

              {/* BLOCKER */}
              {panel === 'blocker' &&
                (blockDone ? (
                  <Confirmation
                    title="Logged - thank you"
                    body="Your mentor can now see what you're up against. Logging this counts in your favor and helps them support you."
                  />
                ) : (
                  <div className="space-y-4">
                    <p className="ai-panel flex items-start gap-2 p-3 text-xs leading-relaxed text-ink-soft">
                      <Heart className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
                      <span>
                        Logging this helps your mentor see your real circumstances - it
                        counts in your favor, not against you.
                      </span>
                    </p>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink">
                        What&apos;s getting in the way?
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {frictionKinds.map(([kind, meta]) => {
                          const Icon = meta.icon;
                          const active = blockKind === kind;
                          return (
                            <button
                              key={kind}
                              onClick={() => setBlockKind(kind)}
                              className={cx(
                                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                                active
                                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                                  : 'border-neutral-200 text-ink-mute hover:bg-neutral-50',
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {meta.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink">
                        Tell us a little more
                      </label>
                      <textarea
                        value={blockDesc}
                        onChange={(e) => setBlockDesc(e.target.value)}
                        rows={3}
                        placeholder="A sentence or two is plenty."
                        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand-300"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-ink">
                        How much is it slowing you down?
                      </label>
                      <div className="flex gap-2">
                        {(['low', 'medium', 'high'] as Severity[]).map((s) => {
                          const active = blockSeverity === s;
                          return (
                            <button
                              key={s}
                              onClick={() => setBlockSeverity(s)}
                              className={cx(
                                'flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                                active
                                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                                  : 'border-neutral-200 text-ink-mute hover:bg-neutral-50',
                              )}
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center justify-end pt-1">
                      <Button
                        onClick={() => {
                          if (!blockKind) return;
                          logFriction(task.id, blockDesc.trim(), blockKind, blockSeverity);
                          setBlockDone(true);
                        }}
                        disabled={!blockKind || !blockDesc.trim()}
                      >
                        <Flag className="h-4 w-4" />
                        Log it
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </Card>

          <button
            onClick={() => navigate('/mentee/progress')}
            className="mt-4 text-xs text-ink-mute transition-colors hover:text-ink"
          >
            See how this fits into your overall progress &rarr;
          </button>
        </div>
      </div>
    </Page>
  );
}
