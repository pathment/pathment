import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Mail,
  MapPin,
  CalendarDays,
  Flag,
  CheckCircle2,
  MessageSquare,
  Plus,
  ClipboardCheck,
  Check,
  Send,
  CalendarRange,
} from 'lucide-react';
import { Page } from '@/components/Page';
import { Modal, Field, TextInput, SelectInput } from '@/components/overlays';
import { useStore } from '@/store/AppStore';
import { AISummary } from '@/components/AISummary';
import { DualProgress } from '@/components/DualProgress';
import { ReviewDrawer } from '@/components/ReviewDrawer';
import { OneOnOneDrawer } from '@/components/OneOnOneDrawer';
import { MessageDrawer } from '@/components/MessageDrawer';
import { ScheduleDrawer } from '@/components/ScheduleDrawer';
import { TracksPanel } from '@/components/TracksPanel';
import { SchedulePanel } from '@/components/SchedulePanel';
import { InsightsPanel } from '@/components/InsightsPanel';
import { useAppActions } from '@/components/AppShell';
import { DELAY_CATEGORY_META } from '@/lib/ai';
import {
  Avatar,
  Badge,
  Button,
  Card,
  MomentumIcon,
  ProgressBar,
  RISK_META,
  RiskDot,
  SectionLabel,
  SENTIMENT_META,
  STATUS_META,
  TASK_TYPE_LABEL,
  FRICTION_META,
  cx,
} from '@/lib/ui';
import { SLOT_META } from '@/lib/ai';
import type { Mentee, Task } from '@/lib/types';

/* Mentor's read of the mentee's daily logs — what they did each day. */
function DailyLogCard({ menteeId }: { menteeId: number }) {
  const { getDailyLogs, getMentee } = useStore();
  const logs = getDailyLogs(menteeId).slice(0, 5);
  const mentee = getMentee(menteeId);
  return (
    <Card className="p-5">
      <SectionLabel>Daily log</SectionLabel>
      {logs.length === 0 ? (
        <p className="text-sm text-ink-faint">No days logged yet.</p>
      ) : (
        <div className="space-y-4">
          {logs.map((l) => {
            // each completed item, with its per-item note if the mentee left one
            const items: { key: string; label: string; note?: string; kind: 'slot' | 'task' }[] = [
              ...l.slotsDone.map((s) => ({
                key: s,
                label: SLOT_META[s].label,
                note: l.itemNotes?.[s],
                kind: 'slot' as const,
              })),
              ...l.tasksDone.map((tid) => ({
                key: `t${tid}`,
                label: mentee?.tasks.find((x) => x.id === tid)?.title ?? 'Task',
                note: l.itemNotes?.[`t${tid}`],
                kind: 'task' as const,
              })),
            ];
            return (
              <div key={l.id} className="border-l-2 border-hairline pl-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-ink">{l.date}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                    {l.loggedAt}
                  </span>
                </div>

                {items.length > 0 ? (
                  <div className="mt-1.5 space-y-1.5">
                    {items.map((it) => (
                      <div key={it.key} className="flex items-start gap-2">
                        <CheckCircle2
                          className={cx(
                            'mt-0.5 h-3.5 w-3.5 shrink-0',
                            it.kind === 'slot' ? 'text-emerald-600' : 'text-brand-500',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <span className="block text-xs font-medium text-ink-soft">{it.label}</span>
                          {it.note && (
                            <span className="block text-[11px] leading-relaxed text-ink-mute">
                              &ldquo;{it.note}&rdquo;
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-ink-faint">Note-only day.</p>
                )}

                {l.note && <p className="mt-1.5 text-xs italic leading-relaxed text-ink-mute">{l.note}</p>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* Collaborators — invite specialists (e.g. a psychologist) to work with this
   mentee and log attributed data. */
function CollaboratorsCard({ menteeId }: { menteeId: number }) {
  const { getCollaborators, inviteCollaborator } = useStore();
  const collabs = getCollaborators(menteeId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('Psychologist');
  const ROLES = ['Psychologist', 'Career coach', 'Guest mentor', 'Domain expert'];

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel>Collaborators</SectionLabel>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Invite
        </Button>
      </div>
      {collabs.length === 0 ? (
        <p className="text-sm text-ink-faint">
          No collaborators yet. Invite a specialist (e.g. a psychologist) to work with this mentee.
        </p>
      ) : (
        <div className="space-y-2">
          {collabs.map((c) => (
            <div key={c.id} className="flex items-center gap-2.5">
              <Avatar initials={c.avatar} name={c.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{c.name}</div>
                <div className="text-xs text-ink-mute">{c.role}</div>
              </div>
              <Badge tone={c.status === 'active' ? 'emerald' : 'amber'}>{c.status}</Badge>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        Anything a collaborator logs is attributed to them — so you always know who saw what, and why.
      </p>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Invite a collaborator"
        subtitle="They can run sessions and log attributed notes for this mentee"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                inviteCollaborator(menteeId, name.trim(), role);
                setName('');
                setOpen(false);
              }}
              disabled={!name.trim()}
            >
              <Plus className="h-4 w-4" /> Invite
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dr. Maya Brooks" autoFocus />
          </Field>
          <Field label="Role">
            <SelectInput value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

function PersonalityBars({ p }: { p: Mentee['personality'] }) {
  const rows = [
    { label: 'Consistency', value: p.consistency },
    { label: 'Communication', value: p.communication },
    { label: 'Resilience', value: p.resilience },
    { label: 'Independence', value: p.independence },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-ink-soft">{r.label}</span>
            <span className="font-mono font-medium text-ink-mute tnum">{r.value}</span>
          </div>
          <ProgressBar value={r.value} tone="brand" />
        </div>
      ))}
    </div>
  );
}

export function MenteeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getMentee, acceptDelay, resolveBlocker, sendNudge } = useStore();
  const { assign } = useAppActions();
  const m = getMentee(Number(id));

  const [reviewTask, setReviewTask] = useState<Task | null>(null);
  const [oneOnOne, setOneOnOne] = useState(false);
  const [message, setMessage] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [nudged, setNudged] = useState(0);

  if (!m) {
    return (
      <Page>
        <p className="text-sm text-ink-mute">Mentee not found.</p>
        <Link to="/mentor/cockpit" className="text-sm text-brand-600">
          ← Back to cockpit
        </Link>
      </Page>
    );
  }

  const risk = RISK_META[m.risk];
  const sentiment = SENTIMENT_META[m.sentiment];
  const pending = m.tasks.filter((t) => t.status === 'submitted');

  return (
    <Page>
      <button
        onClick={() => navigate(-1)}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-mute hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Identity header */}
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <Avatar initials={m.avatar} name={m.name} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{m.name}</h1>
            <MomentumIcon momentum={m.momentum} />
            <Badge tone={risk.tone}>
              <RiskDot risk={m.risk} />
              {risk.label}
            </Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-mute">
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" /> {m.email}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {m.location}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" /> Joined {m.joined}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{m.program}</Badge>
            <Badge tone="neutral">{m.level}</Badge>
            <Badge tone="neutral">
              Week {m.week}/{m.totalWeeks}
            </Badge>
            <Badge tone={sentiment.tone}>Sentiment: {sentiment.label}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {m.risk !== 'low' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNudged(sendNudge(m.id))}
            >
              {nudged > 0 ? (
                <>
                  <Check className="h-4 w-4" /> Nudge sent
                </>
              ) : (
                'Send nudge'
              )}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setMessage(true)}>
            <Send className="h-4 w-4" /> Message
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSchedule(true)}>
            <CalendarRange className="h-4 w-4" /> Schedule
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOneOnOne(true)}>
            <MessageSquare className="h-4 w-4" /> Log 1:1
          </Button>
          <Button size="sm" onClick={() => assign(m.id)}>
            <Plus className="h-4 w-4" /> Assign task
          </Button>
        </div>
      </div>

      {/* AI summary — top of the story */}
      <div className="mb-6">
        <AISummary summary={m.aiSummary} signals={m.aiSignals} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT — progress + work */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <SectionLabel>Progress snapshot</SectionLabel>
            <DualProgress absolute={m.absoluteProgress} relative={m.relativeProgress} />
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-hairline pt-4 text-center">
              <div>
                <div className="font-mono text-lg font-semibold text-ink tnum">{m.onTimeRate}%</div>
                <div className="text-[11px] text-ink-mute">On-time</div>
              </div>
              <div>
                <div className="font-mono text-lg font-semibold text-ink tnum">
                  {m.tasks.filter((t) => t.status === 'completed').length}/{m.tasks.length}
                </div>
                <div className="text-[11px] text-ink-mute">Tasks done</div>
              </div>
              <div>
                <div className="text-lg font-semibold capitalize text-ink">{m.momentum}</div>
                <div className="text-[11px] text-ink-mute">Momentum</div>
              </div>
            </div>
          </Card>

          {/* Pending approvals — inline review */}
          {pending.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <SectionLabel>Awaiting your review</SectionLabel>
                <Badge tone="brand">{pending.length}</Badge>
              </div>
              <div className="space-y-2">
                {pending.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 rounded-xl border border-hairline p-3"
                  >
                    <ClipboardCheck className="h-4 w-4 shrink-0 text-brand-500" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{t.title}</div>
                      <div className="text-xs text-ink-mute">
                        {TASK_TYPE_LABEL[t.type]} · submitted {t.submittedAt}
                        {t.late && <span className="text-[#FF3B30]"> · late</span>}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => setReviewTask(t)}>
                      Review
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Work history */}
          <Card className="p-5">
            <SectionLabel>Work history</SectionLabel>
            <div className="divide-y divide-hairline">
              {m.tasks.map((t) => {
                const s = STATUS_META[t.status];
                return (
                  <div key={t.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{t.title}</div>
                      <div className="text-xs text-ink-mute">
                        {TASK_TYPE_LABEL[t.type]}
                        {t.track && <> · {t.track}</>} · due {t.due}
                        {t.review?.notes && <> · &ldquo;{t.review.notes}&rdquo;</>}
                      </div>
                    </div>
                    {typeof t.score === 'number' && (
                      <span className="font-mono text-xs font-semibold text-emerald-600 tnum">
                        {t.score}%
                      </span>
                    )}
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Delays & reasons — with the AI fairness lens + accept */}
          {m.delays.length > 0 && (
            <Card className="p-5">
              <SectionLabel>Delays &amp; reasons</SectionLabel>
              <div className="space-y-2">
                {m.delays.map((d) => {
                  const f = FRICTION_META[d.kind];
                  const cat = DELAY_CATEGORY_META[d.category];
                  return (
                    <div key={d.id} className="rounded-xl bg-neutral-50 p-3">
                      <div className="flex items-start gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-ink-mute shadow-soft">
                          <f.icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-ink-soft">{d.reason}</div>
                          <div className="text-xs text-ink-mute">
                            {d.task} · {d.days}d late · {d.date}
                          </div>
                        </div>
                        <Badge tone={cat.tone}>{cat.label}</Badge>
                      </div>
                      {d.aiRationale && (
                        <p className="mt-2 border-t border-hairline pt-2 text-xs leading-relaxed text-ink-mute">
                          {d.aiRationale}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-end">
                        {d.accepted ? (
                          <Badge tone="emerald">
                            <CheckCircle2 className="h-3 w-3" /> Accepted
                          </Badge>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => acceptDelay(m.id, d.id)}>
                            Accept reason
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT — personality, blockers, 1:1 */}
        <div className="space-y-6">
          <SchedulePanel mentee={m} />
          <CollaboratorsCard menteeId={m.id} />
          <DailyLogCard menteeId={m.id} />
          <TracksPanel menteeId={m.id} />

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <SectionLabel>Working style</SectionLabel>
              <Button variant="ghost" size="sm" onClick={() => setOneOnOne(true)}>
                Recalibrate
              </Button>
            </div>
            <PersonalityBars p={m.personality} />
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              Built from submission patterns, delay reasons and 1:1 notes — refine it in a 1:1.
            </p>
          </Card>

          <InsightsPanel menteeId={m.id} />

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <SectionLabel>Blockers</SectionLabel>
              {m.blockers.filter((b) => !b.resolved).length > 0 && (
                <Badge tone="rose">{m.blockers.filter((b) => !b.resolved).length} open</Badge>
              )}
            </div>
            {m.blockers.length === 0 ? (
              <p className="text-sm text-ink-faint">No open blockers.</p>
            ) : (
              <div className="space-y-2">
                {m.blockers.map((b) => (
                  <div key={b.id} className="rounded-xl border border-hairline p-3">
                    <div className="flex items-start gap-2">
                      <Flag
                        className={cx(
                          'mt-0.5 h-4 w-4 shrink-0',
                          b.resolved
                            ? 'text-emerald-500'
                            : b.severity === 'high'
                              ? 'text-[#FF3B30]'
                              : b.severity === 'medium'
                                ? 'text-amber-500'
                                : 'text-ink-faint',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className={cx('text-sm', b.resolved ? 'text-ink-faint line-through' : 'text-ink-soft')}>
                          {b.title}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge tone="neutral">{b.category}</Badge>
                          <span className="text-xs text-ink-faint">{b.daysOpen}d open</span>
                          {b.taskTitle && (
                            <span className="truncate text-[11px] text-brand-700">· on {b.taskTitle}</span>
                          )}
                        </div>
                      </div>
                      {!b.resolved && (
                        <button
                          onClick={() => resolveBlocker(m.id, b.id)}
                          className="text-xs font-medium text-brand-600 hover:underline"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <SectionLabel>1:1 notes</SectionLabel>
              <Button variant="ghost" size="sm" onClick={() => setOneOnOne(true)}>
                <Plus className="h-3.5 w-3.5" /> Log
              </Button>
            </div>
            {m.notes.length === 0 ? (
              <p className="text-sm text-ink-faint">No meeting notes yet.</p>
            ) : (
              <div className="space-y-3">
                {m.notes.map((n) => {
                  const s = SENTIMENT_META[n.sentiment];
                  return (
                    <div key={n.id} className="border-l-2 border-brand-200 pl-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-ink">{n.date}</span>
                        {n.kind && n.kind !== '1:1' && <Badge tone="violet">{n.kind}</Badge>}
                        <Badge tone={s.tone}>{s.label}</Badge>
                        {n.by && (
                          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                            by {n.by}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{n.summary}</p>
                      {n.personalityRead && (
                        <p className="mt-1 text-xs italic text-ink-mute">
                          Read: {n.personalityRead}
                        </p>
                      )}
                      {n.issues && n.issues.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {n.issues.map((iss) => (
                            <span
                              key={iss}
                              className="rounded-md bg-neutral-50 px-2 py-0.5 text-[11px] text-ink-mute ring-1 ring-hairline"
                            >
                              {iss}
                            </span>
                          ))}
                        </div>
                      )}
                      {n.nextSteps && n.nextSteps.length > 0 && (
                        <ul className="mt-1.5 space-y-1">
                          {n.nextSteps.map((step) => (
                            <li
                              key={step}
                              className="flex items-center gap-1.5 text-xs text-ink-mute"
                            >
                              <CheckCircle2 className="h-3 w-3 text-brand-400" />
                              {step}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Drawers */}
      <ReviewDrawer
        open={reviewTask !== null}
        onClose={() => setReviewTask(null)}
        mentee={m}
        task={reviewTask}
      />
      <OneOnOneDrawer open={oneOnOne} onClose={() => setOneOnOne(false)} mentee={m} />
      <MessageDrawer open={message} onClose={() => setMessage(false)} mentee={m} />
      <ScheduleDrawer open={schedule} onClose={() => setSchedule(false)} mentee={m} />
    </Page>
  );
}
