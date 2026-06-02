import { useState } from 'react';
import {
  GitBranch,
  ChevronRight,
  Check,
  Circle,
  CircleDot,
  ArrowLeftRight,
  Trophy,
} from 'lucide-react';
import { Modal, SelectInput } from '@/components/overlays';
import { Badge, Button, cx, SectionLabel, TASK_TYPE_LABEL, STATUS_META } from '@/lib/ui';
import { useStore } from '@/store/AppStore';
import type { SlotConfig } from '@/lib/types';

/* Per-individual roadmap control for one slot. The roadmap is a TEMPLATE: its
   steps auto-assign real tasks, and the assigned task is what carries the score.
   Here the mentor can jump a mentee to any step, switch the active roadmap, or
   move along the chain — fast, no ceremony. */
export function TrackManager({
  menteeId,
  slot,
  onClose,
}: {
  menteeId: number;
  slot: SlotConfig;
  onClose: () => void;
}) {
  const { roadmaps, roadmapProgress, getMentee, setRoadmapStep, switchSlotRoadmap } = useStore();
  const mentee = getMentee(menteeId);

  const chainIds = slot.roadmapChain ?? [];
  const chain = chainIds.map((id) => roadmaps.find((r) => r.id === id)).filter(Boolean);
  const activeProg = roadmapProgress.find((p) => p.menteeId === menteeId && p.slot === slot.id && !p.completed);
  const activeRm = activeProg ? roadmaps.find((r) => r.id === activeProg.roadmapId) : undefined;

  // the live task this slot's roadmap is currently driving (carries the score)
  const activeTask = mentee?.tasks.find(
    (t) => t.slot === slot.id && t.roadmapId === activeProg?.roadmapId && t.status !== 'completed',
  );

  const [otherId, setOtherId] = useState<number | ''>('');
  const offChainRoadmaps = roadmaps.filter((r) => !chainIds.includes(r.id));

  return (
    <Modal
      open
      onClose={onClose}
      title={`${slot.label} track`}
      subtitle={`${mentee?.name ?? 'Mentee'} · move them along the roadmap or switch tracks`}
      footer={
        <div className="flex items-center justify-end">
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* CHAIN — switch which roadmap is active */}
        <div>
          <SectionLabel>Roadmap chain · template</SectionLabel>
          {chain.length === 0 ? (
            <p className="text-xs text-ink-faint">
              No roadmap chain on this slot yet. Add one with &ldquo;Change&rdquo; on the slot.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {chain.map((rm, i) => {
                if (!rm) return null;
                const isActive = activeProg?.roadmapId === rm.id;
                return (
                  <span key={rm.id} className="flex items-center gap-1.5">
                    {i > 0 && <ChevronRight className="h-3 w-3 text-ink-faint" />}
                    <button
                      onClick={() => !isActive && switchSlotRoadmap(menteeId, slot.id, rm.id, 0)}
                      className={cx(
                        'rounded-r inline-flex items-center gap-1 border px-2.5 py-1 text-xs transition-colors',
                        isActive
                          ? 'border-ink bg-ink text-white'
                          : 'border-hairline text-ink-mute hover:border-ink hover:text-ink',
                      )}
                      title={isActive ? 'Active roadmap' : `Switch to ${rm.name}`}
                    >
                      <GitBranch className="h-3 w-3" />
                      {rm.name}
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* switch to a roadmap outside the chain */}
          <div className="mt-2 flex items-center gap-2">
            <ArrowLeftRight className="h-3.5 w-3.5 text-ink-faint" />
            <SelectInput
              value={otherId}
              onChange={(e) => setOtherId(e.target.value ? Number(e.target.value) : '')}
              className="h-8 flex-1 py-1 text-xs"
            >
              <option value="">Move to a different roadmap…</option>
              {offChainRoadmaps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.steps.length} steps)
                </option>
              ))}
            </SelectInput>
            <Button
              size="sm"
              variant="outline"
              disabled={otherId === ''}
              onClick={() => {
                if (otherId !== '') {
                  switchSlotRoadmap(menteeId, slot.id, otherId, 0);
                  setOtherId('');
                }
              }}
            >
              Move
            </Button>
          </div>
        </div>

        {/* STEPS — jump to any step of the active roadmap */}
        {activeRm && activeProg ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <SectionLabel>Steps · {activeRm.name}</SectionLabel>
              <span className="font-mono text-[10px] text-ink-faint tnum">
                {Math.min(activeProg.currentStep + 1, activeRm.steps.length)}/{activeRm.steps.length}
              </span>
            </div>
            <div className="space-y-1">
              {activeRm.steps.map((step, idx) => {
                const done = idx < activeProg.currentStep;
                const current = idx === activeProg.currentStep;
                return (
                  <button
                    key={step.id}
                    onClick={() => !current && setRoadmapStep(menteeId, slot.id, idx)}
                    className={cx(
                      'rounded-r flex w-full items-center gap-2.5 border px-2.5 py-2 text-left transition-colors',
                      current ? 'border-ink bg-neutral-50' : 'border-hairline hover:border-ink',
                    )}
                    title={current ? 'Current step' : `Move to step ${idx + 1}`}
                  >
                    {done ? (
                      <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : current ? (
                      <CircleDot className="h-4 w-4 shrink-0 text-ink" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-ink-faint" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={cx('block truncate text-sm', current ? 'font-medium text-ink' : 'text-ink-soft')}>
                        {idx + 1}. {step.title}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                        {TASK_TYPE_LABEL[step.type]}
                      </span>
                    </span>
                    {current && <Badge tone="neutral">Current</Badge>}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="rounded-r border border-dashed border-hairline px-3 py-4 text-center text-xs text-ink-faint">
            No active roadmap in this slot. Pick one from the chain above, or start it from the slot.
          </p>
        )}

        {/* THE ASSIGNED TASK — this is what gets scored */}
        <div>
          <SectionLabel>Assigned task · scored here</SectionLabel>
          {activeTask ? (
            <div className="rounded-r border border-hairline p-3">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{activeTask.title}</span>
                <Badge tone={STATUS_META[activeTask.status].tone}>{STATUS_META[activeTask.status].label}</Badge>
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-xs text-ink-mute">
                <span>{TASK_TYPE_LABEL[activeTask.type]}</span>
                <span className="text-ink-faint">·</span>
                <span>Due {activeTask.due}</span>
                {typeof activeTask.scoreDetail?.speed === 'number' && (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <Trophy className="h-3 w-3" /> {activeTask.scoreDetail.speed}% speed
                  </span>
                )}
                {typeof activeTask.scoreDetail?.mentor === 'number' && (
                  <span className="text-ink-soft">{activeTask.scoreDetail.mentor}/5 mentor</span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-ink-faint">
              No open task yet. Moving to a step assigns its task automatically.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
