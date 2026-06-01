import { useState, useEffect } from 'react';
import { GitBranch, ArrowRight, X } from 'lucide-react';
import { Modal, Field, SelectInput } from './overlays';
import { Avatar, Button, TASK_TYPE_LABEL } from '@/lib/ui';
import { SLOT_META } from '@/lib/ai';
import { useStore } from '@/store/AppStore';

/* When a mentee finishes a roadmap inside a slot's chain, the mentor is asked
   to confirm starting the next roadmap (and can pick a start step). */
export function ChainAdvanceModal() {
  const { pendingChainAdvance, confirmChainAdvance, dismissChainAdvance, roadmaps, getMentee } =
    useStore();
  const [startStep, setStartStep] = useState(0);

  useEffect(() => {
    setStartStep(0);
  }, [pendingChainAdvance?.menteeId, pendingChainAdvance?.nextRoadmapId]);

  if (!pendingChainAdvance) return null;
  const { menteeId, slot, nextRoadmapId } = pendingChainAdvance;
  const mentee = getMentee(menteeId);
  const rm = roadmaps.find((r) => r.id === nextRoadmapId);
  if (!mentee || !rm) return null;

  return (
    <Modal
      open
      onClose={dismissChainAdvance}
      title="Roadmap complete — start the next?"
      subtitle={`${mentee.name} finished their ${SLOT_META[slot].label.toLowerCase()} roadmap`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={dismissChainAdvance}>
            <X className="h-4 w-4" /> Not yet
          </Button>
          <Button onClick={() => confirmChainAdvance(startStep)}>
            <ArrowRight className="h-4 w-4" /> Start &ldquo;{rm.name}&rdquo;
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-r border border-hairline bg-neutral-50/60 p-3">
          <Avatar initials={mentee.avatar} name={mentee.name} size="sm" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink">{mentee.name}</div>
            <div className="text-xs text-ink-mute">{SLOT_META[slot].label} track</div>
          </div>
        </div>

        <div className="rounded-r border border-brand-200 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <GitBranch className="h-4 w-4 text-brand-600" /> {rm.name}
          </div>
          <p className="mt-1 text-xs text-ink-mute">{rm.description}</p>
        </div>

        <Field label="Start them at" hint="If they already know the early material, skip ahead.">
          <SelectInput value={startStep} onChange={(e) => setStartStep(Number(e.target.value))}>
            {rm.steps.map((s, idx) => (
              <option key={s.id} value={idx}>
                Step {idx + 1}: {s.title} ({TASK_TYPE_LABEL[s.type]})
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>
    </Modal>
  );
}
