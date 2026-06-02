import { useState } from 'react';
import { Flag, CheckCircle2, Plus, Link as LinkIcon } from 'lucide-react';
import { Card, Badge, Button, SectionLabel, FRICTION_META, cx } from '@/lib/ui';
import { Page, PageHeader } from '@/components/Page';
import { Modal, Field, TextArea, Segmented, SelectInput } from '@/components/overlays';
import { useStore } from '@/store/AppStore';
import type { Blocker, BlockerCategory } from '@/lib/types';

/* Severity colour mapping - high reads as the accent red, medium amber, low quiet. */
const SEVERITY_TONE: Record<Blocker['severity'], 'rose' | 'amber' | 'neutral'> = {
  high: 'rose',
  medium: 'amber',
  low: 'neutral',
};

const CATEGORIES: { value: BlockerCategory; label: string }[] = [
  { value: 'technical', label: 'Technical' },
  { value: 'knowledge', label: 'Knowledge' },
  { value: 'access', label: 'Access' },
  { value: 'personal', label: 'Personal' },
];
const SEVERITIES: { value: Blocker['severity']; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

function BlockerRow({
  blocker,
  onResolve,
}: {
  blocker: Blocker;
  onResolve?: () => void;
}) {
  const resolved = !!blocker.resolved;
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span
        className={cx(
          'grid h-8 w-8 shrink-0 place-items-center border',
          resolved ? 'border-emerald-200 text-emerald-600' : 'border-hairline text-ink-mute',
        )}
      >
        {resolved ? <CheckCircle2 className="h-4 w-4" /> : <Flag className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={cx(
            'text-sm font-medium',
            resolved ? 'text-ink-mute line-through' : 'text-ink',
          )}
        >
          {blocker.title}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-mute">
          <Badge tone="neutral">
            <span className="capitalize">{blocker.category}</span>
          </Badge>
          <Badge tone={SEVERITY_TONE[blocker.severity]}>
            <span className="capitalize">{blocker.severity}</span>
          </Badge>
          <span className="text-ink-faint">&middot;</span>
          <span>
            {resolved
              ? 'Cleared'
              : `Open ${blocker.daysOpen} day${blocker.daysOpen === 1 ? '' : 's'}`}
          </span>
        </div>
        {blocker.taskTitle && (
          <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand-700">
            <LinkIcon className="h-3 w-3" />
            <span className="truncate">On: {blocker.taskTitle}</span>
          </div>
        )}
      </div>
      {!resolved && onResolve && (
        <Button variant="outline" size="sm" onClick={onResolve}>
          Mark resolved
        </Button>
      )}
    </div>
  );
}

export function Blockers() {
  const { currentMenteeId, getMentee, resolveBlocker, addBlocker } = useStore();
  const me = getMentee(currentMenteeId)!;

  const open = me.blockers.filter((b) => !b.resolved);
  const resolved = me.blockers.filter((b) => b.resolved);
  const hasAny = me.blockers.length > 0;

  // active tasks this blocker could be about - keeps blockers relevant, not floating
  const activeTasks = me.tasks.filter((t) => t.status !== 'completed' && t.status !== 'rejected');

  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<BlockerCategory>('technical');
  const [severity, setSeverity] = useState<Blocker['severity']>('medium');
  const [taskId, setTaskId] = useState<string>('');

  const submit = () => {
    if (!title.trim()) return;
    const task = activeTasks.find((t) => String(t.id) === taskId);
    addBlocker(me.id, {
      title: title.trim(),
      category,
      severity,
      taskId: task?.id,
      taskTitle: task?.title,
    });
    setTitle('');
    setCategory('technical');
    setSeverity('medium');
    setTaskId('');
    setAddOpen(false);
  };

  return (
    <Page>
      <PageHeader
        title="Blockers"
        subtitle="What's slowing you down - your mentor can see these"
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add blocker
          </Button>
        }
      />

      {!hasAny ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <span className="grid h-10 w-10 place-items-center border border-emerald-200 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="text-sm font-medium text-ink">No blockers right now - clear runway.</div>
          <p className="max-w-sm text-xs leading-relaxed text-ink-mute">
            If anything starts to slow you down, log it here. Flagging early helps your mentor
            support you and keeps your progress measured fairly.
          </p>
          <Button variant="outline" size="sm" className="mt-1" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add a blocker
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Open blockers first */}
          <div>
            <SectionLabel>Open</SectionLabel>
            {open.length > 0 ? (
              <Card className="divide-y divide-neutral-100 p-0">
                {open.map((b) => (
                  <BlockerRow
                    key={b.id}
                    blocker={b}
                    onResolve={() => resolveBlocker(me.id, b.id)}
                  />
                ))}
              </Card>
            ) : (
              <Card>
                <p className="text-sm text-ink-mute">
                  Nothing open right now - anything you&apos;ve cleared is below.
                </p>
              </Card>
            )}
          </div>

          {/* Resolved */}
          {resolved.length > 0 && (
            <div>
              <SectionLabel>Resolved</SectionLabel>
              <Card className="divide-y divide-neutral-100 p-0">
                {resolved.map((b) => (
                  <BlockerRow key={b.id} blocker={b} />
                ))}
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Logged friction - circumstances counting in the mentee's favour */}
      {me.delays.length > 0 && (
        <div className="mt-6">
          <SectionLabel>Logged friction</SectionLabel>
          <Card className="p-0">
            <div className="border-b border-hairline px-4 py-3 text-xs leading-relaxed text-ink-mute">
              Circumstances you&apos;ve logged. These count in your favour - your mentor weighs them
              against your progress.
            </div>
            <div className="divide-y divide-neutral-100">
              {me.delays.map((d) => {
                const meta = FRICTION_META[d.kind];
                const Icon = meta.icon;
                return (
                  <div key={d.id} className="flex items-start gap-3 px-4 py-3.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center border border-hairline text-ink-mute">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">{d.reason}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-mute">
                        <span>{meta.label}</span>
                        <span className="text-ink-faint">&middot;</span>
                        <span>{d.date}</span>
                      </div>
                    </div>
                    {d.accepted && <Badge tone="emerald">Accounted for</Badge>}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Add blocker - mentee flags what's slowing them down */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a blocker"
        subtitle="Flagging early helps your mentor support you - and it counts in your favour."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!title.trim()}>
              <Plus className="h-4 w-4" /> Log blocker
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="What's blocking you?">
            <TextArea
              rows={2}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Stuck on the auth refresh-token flow"
              autoFocus
            />
          </Field>
          {activeTasks.length > 0 && (
            <Field label="Which task is this about?" hint="Linking it helps your mentor see exactly where you're stuck.">
              <SelectInput value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">General - not task-specific</option>
                {activeTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </SelectInput>
            </Field>
          )}
          <Field label="Type">
            <div>
              <Segmented value={category} onChange={setCategory} options={CATEGORIES} />
            </div>
          </Field>
          <Field label="How much is it slowing you?">
            <div>
              <Segmented value={severity} onChange={setSeverity} options={SEVERITIES} />
            </div>
          </Field>
        </div>
      </Modal>
    </Page>
  );
}
