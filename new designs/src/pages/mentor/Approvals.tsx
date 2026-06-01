import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ClipboardCheck, Clock, Undo2 } from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { useStore } from '@/store/AppStore';
import { ReviewDrawer } from '@/components/ReviewDrawer';
import {
  Avatar,
  Badge,
  Button,
  Card,
  STATUS_META,
  TASK_TYPE_LABEL,
  cx,
} from '@/lib/ui';
import type { Mentee, Task } from '@/lib/types';

interface QueueItem {
  mentee: Mentee;
  task: Task;
}

export function Approvals() {
  const navigate = useNavigate();
  const { mentees, reviewTask, unreview } = useStore();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<QueueItem | null>(null);

  const queue = useMemo<QueueItem[]>(() => {
    const items: QueueItem[] = [];
    for (const m of mentees) {
      for (const t of m.tasks) {
        if (t.status === 'submitted') items.push({ mentee: m, task: t });
      }
    }
    return items;
  }, [mentees]);

  // recently reviewed (this session) — show as a calm trailing list
  const reviewed = useMemo(() => {
    const items: QueueItem[] = [];
    for (const m of mentees) {
      for (const t of m.tasks) {
        if (t.review && t.status !== 'submitted') items.push({ mentee: m, task: t });
      }
    }
    return items;
  }, [mentees]);

  const allSelected = queue.length > 0 && queue.every((q) => selected.has(q.task.id));

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectAll = () =>
    setSelected(allSelected ? new Set() : new Set(queue.map((q) => q.task.id)));

  const bulkApprove = () => {
    for (const q of queue) {
      if (selected.has(q.task.id) && !q.task.late) {
        reviewTask(q.mentee.id, q.task.id, {
          decision: 'approved',
          checks: q.task.criteria ?? [],
        });
      }
    }
    setSelected(new Set());
  };

  const selectedPassing = queue.filter((q) => selected.has(q.task.id) && !q.task.late).length;

  return (
    <Page>
      <PageHeader
        title="Approvals"
        subtitle={`${queue.length} submission${queue.length === 1 ? '' : 's'} awaiting review across the cohort`}
        actions={
          selectedPassing > 0 ? (
            <Button onClick={bulkApprove}>
              <Check className="h-4 w-4" /> Approve {selectedPassing} on-time
            </Button>
          ) : undefined
        }
      />

      {queue.length === 0 ? (
        <Card className="grid place-items-center py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <Check className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-medium text-ink">You&apos;re all caught up.</p>
          <p className="mt-1 text-xs text-ink-mute">No submissions are waiting on you.</p>
        </Card>
      ) : (
        <Card className="p-0">
          {/* select-all bar */}
          <div className="flex items-center gap-3 border-b border-hairline px-4 py-2.5">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={selectAll}
              className="h-4 w-4 accent-brand-500"
            />
            <span className="text-xs text-ink-mute">
              {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
            </span>
            <span className="ml-auto text-[11px] text-ink-faint">
              Bulk approve covers on-time work; late work opens the review.
            </span>
          </div>

          <div className="divide-y divide-hairline">
            {queue.map(({ mentee, task }) => {
              const isSel = selected.has(task.id);
              return (
                <div
                  key={task.id}
                  className={cx(
                    'flex items-center gap-3 px-4 py-3 transition-colors',
                    isSel && 'bg-brand-50/40',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggle(task.id)}
                    className="h-4 w-4 accent-brand-500"
                  />
                  <button
                    onClick={() => navigate(`/mentor/mentee/${mentee.id}`)}
                    className="shrink-0"
                    title={mentee.name}
                  >
                    <Avatar initials={mentee.avatar} name={mentee.name} size="sm" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{task.title}</div>
                    <div className="flex items-center gap-2 text-xs text-ink-mute">
                      <span>{mentee.name}</span>
                      <span className="text-ink-faint">·</span>
                      <span>{TASK_TYPE_LABEL[task.type]}</span>
                      <span className="text-ink-faint">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {task.submittedAt}
                      </span>
                    </div>
                  </div>
                  {task.late && <Badge tone="amber">Late</Badge>}
                  <Button size="sm" onClick={() => setActive({ mentee, task })}>
                    <ClipboardCheck className="h-4 w-4" /> Review
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Reviewed this session */}
      {reviewed.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">
            Reviewed this session
          </div>
          <Card className="divide-y divide-hairline p-0">
            {reviewed.map(({ mentee, task }) => {
              const s = STATUS_META[task.status];
              return (
                <div key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar initials={mentee.avatar} name={mentee.name} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                    {task.title}
                    <span className="text-ink-faint"> · {mentee.name}</span>
                  </span>
                  <Badge tone={s.tone}>{s.label}</Badge>
                  <button
                    onClick={() => unreview(mentee.id, task.id)}
                    title="Un-approve — send back to review"
                    className="rounded-r inline-flex items-center gap-1 px-1.5 py-1 text-[11px] text-ink-faint transition-colors hover:text-[#FF3B30]"
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Undo
                  </button>
                </div>
              );
            })}
          </Card>
        </div>
      )}

      <ReviewDrawer
        open={active !== null}
        onClose={() => setActive(null)}
        mentee={active?.mentee ?? null}
        task={active?.task ?? null}
      />
    </Page>
  );
}
