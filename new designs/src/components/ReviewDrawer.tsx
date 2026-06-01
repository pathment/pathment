import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  MessageSquarePlus,
  RotateCcw,
  XCircle,
  ExternalLink,
  Lock,
  Circle,
  Plus,
  Eye,
  EyeOff,
  Trash2,
  Settings2,
} from 'lucide-react';
import { Drawer, TextArea, TextInput } from './overlays';
import { Badge, Button, TASK_TYPE_LABEL, cx } from '@/lib/ui';
import { buildChecklist, DELAY_CATEGORY_META } from '@/lib/ai';
import { FRICTION_META } from '@/lib/ui';
import { useStore } from '@/store/AppStore';
import type { Mentee, Task, ReviewDecision } from '@/lib/types';

export function ReviewDrawer({
  open,
  onClose,
  mentee,
  task,
}: {
  open: boolean;
  onClose: () => void;
  mentee: Mentee | null;
  task: Task | null;
}) {
  const {
    reviewTask,
    feedbackTemplates,
    addFeedbackTemplate,
    toggleFeedbackTemplate,
    removeFeedbackTemplate,
  } = useStore();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState<ReviewDecision | null>(null);
  const [manageTpl, setManageTpl] = useState(false);
  const [newTpl, setNewTpl] = useState('');

  const visibleTemplates = feedbackTemplates.filter((t) => !t.hidden);

  const applyTemplate = (text: string) =>
    setNotes((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));

  const checklist = useMemo(() => buildChecklist(task?.criteria), [task]);
  const requiredIds = checklist.filter((c) => c.required).map((c) => c.id);
  const allRequiredTicked = requiredIds.every((id) => checked.has(id));

  // The matching delay (if late OR an extension was requested) — the reason
  // behind the request, with the fairness lens (§6.4/§7.1)
  const delay = useMemo(() => {
    if (!mentee || !task || (!task.late && !task.extensionRequested)) return undefined;
    return mentee.delays.find((d) => task.title.toLowerCase().includes(d.task.toLowerCase().split(' ')[0]))
      ?? mentee.delays[0];
  }, [mentee, task]);

  if (!mentee || !task) return null;

  const reset = () => {
    setChecked(new Set());
    setNotes('');
    setDone(null);
  };

  const submit = (decision: ReviewDecision) => {
    reviewTask(mentee.id, task.id, {
      decision,
      notes: notes.trim() || undefined,
      checks: checklist.filter((c) => checked.has(c.id)).map((c) => c.label),
    });
    setDone(decision);
  };

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={close}
      width="max-w-xl"
      title={`Review · ${task.title}`}
      subtitle={`${mentee.name} · ${TASK_TYPE_LABEL[task.type]}${task.submittedAt ? ` · submitted ${task.submittedAt}` : ''}`}
    >
      {done ? (
        <div className="grid place-items-center py-16 text-center">
          <div
            className={cx(
              'grid h-12 w-12 place-items-center rounded-full',
              done === 'rejected' ? 'bg-rose-50 text-[#FF3B30]' : 'bg-emerald-50 text-emerald-600',
            )}
          >
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-medium text-ink">
            {done === 'approved' && 'Approved.'}
            {done === 'approved_notes' && 'Approved with notes.'}
            {done === 'changes' && 'Sent back for changes.'}
            {done === 'rejected' && 'Rejected.'}
          </p>
          <p className="mt-1 text-xs text-ink-mute">
            Recorded against {mentee.name.split(' ')[0]}&apos;s work history — who, when, which
            checks, and your note.
          </p>
          <Button className="mt-4" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Brief */}
          {task.brief && (
            <div>
              <div className="mb-1 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                Brief
              </div>
              <p className="text-sm leading-relaxed text-ink-soft">{task.brief}</p>
            </div>
          )}

          {/* Submission artifact */}
          {task.artifact && (
            <div className="flex items-center justify-between rounded-xl border border-hairline bg-neutral-50 px-3 py-2.5">
              <span className="truncate font-mono text-xs text-brand-700">{task.artifact}</span>
              <ExternalLink className="h-4 w-4 shrink-0 text-ink-faint" />
            </div>
          )}

          {/* AI delay / extension lens — when late or an extension was asked */}
          {(task.late || task.extensionRequested) && delay && (
            <div className="ai-panel p-4 pl-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-brand-600">
                  Pathment AI · {task.extensionRequested ? 'extension lens' : 'delay lens'}
                </span>
                <Badge tone={DELAY_CATEGORY_META[delay.category].tone}>
                  {DELAY_CATEGORY_META[delay.category].label}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-ink-soft">
                {task.extensionRequested ? 'Asked for more time:' : 'Late, with a logged reason:'}{' '}
                <span className="text-ink">&ldquo;{delay.reason}&rdquo;</span>
              </p>
              {delay.aiRationale && (
                <p className="mt-1.5 text-xs leading-relaxed text-ink-mute">{delay.aiRationale}</p>
              )}
              <p className="mt-2 text-[11px] text-ink-faint">
                The lens informs you — it doesn&apos;t decide. You still hold the call.
              </p>
            </div>
          )}

          {/* Checklist with hard/soft gates */}
          {checklist.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                  Approval checklist
                </span>
                {!allRequiredTicked && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-ink-faint">
                    <Lock className="h-3 w-3" /> required checks gate approval
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {checklist.map((c) => {
                  const on = checked.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(c.id)}
                      className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-neutral-50"
                    >
                      {on ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                      )}
                      <span className={cx('flex-1 text-sm', on ? 'text-ink-mute line-through' : 'text-ink-soft')}>
                        {c.label}
                      </span>
                      {c.required ? (
                        <span className="font-mono text-[9px] uppercase tracking-wider text-[#FF3B30]">
                          Required
                        </span>
                      ) : (
                        <span className="font-mono text-[9px] uppercase tracking-wider text-ink-faint">
                          Soft
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Feedback */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                Feedback / coaching note
              </span>
              <button
                onClick={() => setManageTpl((m) => !m)}
                className="inline-flex items-center gap-1 text-[11px] text-ink-mute hover:text-ink"
              >
                <Settings2 className="h-3 w-3" />
                {manageTpl ? 'Done' : 'Manage templates'}
              </button>
            </div>

            {/* one-click template chips — no dropdown, just tap to insert */}
            {!manageTpl && visibleTemplates.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {visibleTemplates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t.text)}
                    title={t.text}
                    className="rounded-r max-w-[15rem] truncate border border-hairline bg-white px-2.5 py-1 text-left text-[11px] text-ink-soft transition-colors hover:border-ink"
                  >
                    {t.text}
                  </button>
                ))}
              </div>
            )}

            {/* manage panel: show/hide each, remove, or add a new one */}
            {manageTpl && (
              <div className="mb-2 space-y-1.5 rounded-r border border-hairline bg-neutral-50/60 p-2.5">
                {feedbackTemplates.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <button
                      onClick={() => toggleFeedbackTemplate(t.id)}
                      title={t.hidden ? 'Show' : 'Hide'}
                      className="grid h-7 w-7 shrink-0 place-items-center text-ink-mute hover:text-ink"
                    >
                      {t.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <span
                      className={cx(
                        'min-w-0 flex-1 truncate text-xs',
                        t.hidden ? 'text-ink-faint line-through' : 'text-ink-soft',
                      )}
                    >
                      {t.text}
                    </span>
                    <button
                      onClick={() => removeFeedbackTemplate(t.id)}
                      title="Remove"
                      className="grid h-7 w-7 shrink-0 place-items-center text-ink-faint hover:text-[#FF3B30]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 border-t border-hairline pt-2">
                  <TextInput
                    value={newTpl}
                    onChange={(e) => setNewTpl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTpl.trim()) {
                        addFeedbackTemplate(newTpl);
                        setNewTpl('');
                      }
                    }}
                    placeholder="Add a template + Enter"
                    className="text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!newTpl.trim()}
                    onClick={() => {
                      addFeedbackTemplate(newTpl);
                      setNewTpl('');
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            <TextArea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={`A note for ${mentee.name.split(' ')[0]}…`}
            />
          </div>

          {/* Outcomes */}
          <div className="space-y-2 border-t border-hairline pt-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="success"
                disabled={!allRequiredTicked}
                onClick={() => submit('approved')}
              >
                <CheckCircle2 className="h-4 w-4" /> Approve
              </Button>
              <Button
                variant="primary"
                disabled={!allRequiredTicked || !notes.trim()}
                onClick={() => submit('approved_notes')}
              >
                <MessageSquarePlus className="h-4 w-4" /> Approve + notes
              </Button>
              <Button variant="outline" onClick={() => submit('changes')}>
                <RotateCcw className="h-4 w-4" /> Request changes
              </Button>
              <Button
                variant="danger"
                disabled={!notes.trim()}
                onClick={() => submit('rejected')}
              >
                <XCircle className="h-4 w-4" /> Reject
              </Button>
            </div>
            {!allRequiredTicked && (
              <p className="text-[11px] text-ink-faint">
                Tick the required checks to enable approval. Reject needs a reason in the note.
              </p>
            )}
          </div>

          {/* tiny friction legend so the icons read */}
          {task.late && delay && (
            <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
              {(() => {
                const Icon = FRICTION_META[delay.kind].icon;
                return <Icon className="h-3.5 w-3.5" />;
              })()}
              {FRICTION_META[delay.kind].label} · {delay.days}d · {delay.date}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
