import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, Flag, CheckCircle2 } from 'lucide-react';
import {
  Badge,
  Card,
  Button,
  SectionLabel,
  TASK_TYPE_LABEL,
  STATUS_META,
  cx,
} from '@/lib/ui';
import { Page } from '@/components/Page';
import { DualProgress } from '@/components/DualProgress';
import { useStore } from '@/store/AppStore';
import type { Task, ScheduleSlot, Recurrence } from '@/lib/types';

const SLOT_LABEL: Record<ScheduleSlot, string> = {
  morning: 'Morning',
  lunch: 'Lunch',
  dinner: 'Dinner',
  anytime: 'Anytime',
};
const RECUR_LABEL: Record<Recurrence, string> = {
  once: '',
  daily: 'Daily',
  weekly: 'Weekly',
};

/* Pick the single most important next action: prefer in-progress, then the
   first task that still needs the mentee's attention (not completed). */
function pickHeroTask(tasks: Task[]): Task | undefined {
  const open = tasks.filter((t) => t.status !== 'completed');
  return (
    open.find((t) => t.late) ??
    open.find((t) => t.status === 'in_progress') ??
    open.find((t) => t.status === 'changes_requested') ??
    open[0] ??
    tasks[0]
  );
}

export function ThisWeek() {
  const navigate = useNavigate();
  const { currentMenteeId, getMentee } = useStore();
  const me = getMentee(currentMenteeId)!;
  const firstName = me.name.split(' ')[0];

  const hero = pickHeroTask(me.tasks);
  const heroStatus = hero ? STATUS_META[hero.status] : null;

  // Group remaining tasks by track for a calm, scannable list.
  const rest = me.tasks.filter((t) => t.id !== hero?.id);
  const tracks = Array.from(new Set(rest.map((t) => t.track ?? 'This week')));

  return (
    <Page>
      {/* Friendly greeting */}
      <div className="mb-6 animate-slide-in">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Good morning, {firstName}
        </h1>
        <p className="mt-1 text-sm text-ink-mute">
          {me.level} &middot; Week {me.week} of {me.totalWeeks}
        </p>
      </div>

      {/* Hero — single most important next action */}
      {hero && (
        <Card className="mb-6 overflow-hidden border-transparent p-0 animate-scale-in">
          <div className="gradient-brand px-6 py-6 text-white sm:px-7">
            <div className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-white/60">
              <span className="h-1 w-4 bg-white/50" />
              Your next focus
            </div>
            <h2 className="mt-2 text-xl font-semibold leading-snug">{hero.title}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium">
                {TASK_TYPE_LABEL[hero.type]}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium">
                <Clock className="h-3 w-3" />
                Due {hero.due}
              </span>
              {hero.late && (
                <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-xs font-medium">
                  Running late &mdash; that&apos;s okay
                </span>
              )}
            </div>
            {hero.brief && (
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/85">
                {hero.brief}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => navigate(`/mentee/task/${hero.id}`)}
                className="!bg-white !text-brand-700 hover:!bg-white/90"
              >
                Open task
                <ArrowRight className="h-4 w-4" />
              </Button>
              {heroStatus && (
                <span className="text-xs text-white/80">{heroStatus.label}</span>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tasks list */}
        <div className="lg:col-span-2">
          <SectionLabel>This week</SectionLabel>
          <div className="space-y-5">
            {tracks.map((track) => {
              const items = rest.filter((t) => (t.track ?? 'This week') === track);
              if (items.length === 0) return null;
              return (
                <div key={track}>
                  <div className="mb-2 text-xs font-medium text-ink-faint">{track}</div>
                  <Card className="divide-y divide-neutral-100 p-0">
                    {items.map((task) => {
                      const status = STATUS_META[task.status];
                      const done = task.status === 'completed';
                      return (
                        <button
                          key={task.id}
                          onClick={() => navigate(`/mentee/task/${task.id}`)}
                          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-neutral-50"
                        >
                          <span
                            className={cx(
                              'grid h-8 w-8 shrink-0 place-items-center border',
                              done
                                ? 'border-emerald-200 text-emerald-600'
                                : 'border-hairline text-ink-mute',
                            )}
                          >
                            {done ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <Clock className="h-4 w-4" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-ink">
                              {task.title}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-mute">
                              <span>{TASK_TYPE_LABEL[task.type]}</span>
                              <span className="text-ink-faint">&middot;</span>
                              <span>Due {task.due}</span>
                              {task.slot && task.slot !== 'anytime' && (
                                <>
                                  <span className="text-ink-faint">&middot;</span>
                                  <span>{SLOT_LABEL[task.slot]}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {task.recurrence && task.recurrence !== 'once' && (
                              <Badge tone="brand">{RECUR_LABEL[task.recurrence]}</Badge>
                            )}
                            {task.late && <Badge tone="amber">Late</Badge>}
                            <Badge tone={status.tone}>{status.label}</Badge>
                          </div>
                        </button>
                      );
                    })}
                  </Card>
                </div>
              );
            })}
          </div>
        </div>

        {/* Side column: progress + flag affordance */}
        <div className="space-y-6">
          <Card>
            <SectionLabel>Your progress</SectionLabel>
            <DualProgress
              absolute={me.absoluteProgress}
              relative={me.relativeProgress}
              compact
            />
            <p className="mt-3 text-xs leading-relaxed text-ink-mute">
              You&apos;re holding up well given a busy week &mdash; your relative progress
              reflects the real circumstances you&apos;ve logged.
            </p>
          </Card>

          <Card className="border-brand-100 bg-brand-50/40">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-white shadow-soft">
                <Flag className="h-3.5 w-3.5 text-brand-600" />
              </span>
              <span className="text-sm font-semibold text-ink">Need to flag something?</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-mute">
              Life happens. If something&apos;s slowing you down, log it &mdash; it helps your
              mentor see the full picture and counts in your favor.
            </p>
            {hero && (
              <Button
                variant="soft"
                size="sm"
                className="mt-3"
                onClick={() => navigate(`/mentee/task/${hero.id}`)}
              >
                Log a blocker or extension
              </Button>
            )}
          </Card>
        </div>
      </div>
    </Page>
  );
}
