import { Info } from 'lucide-react';
import { ProgressBar } from '@/lib/ui';

/**
 * The relative-vs-absolute lens (brief §6.4).
 * Absolute = raw output against plan (neutral ink bar). Relative = progress
 * given the person's real circumstances (blue accent bar). Numbers are set in
 * JetBrains Mono so the comparison reads cleanly.
 */
export function DualProgress({
  absolute,
  relative,
  compact = false,
  self = false,
}: {
  absolute: number;
  relative: number;
  compact?: boolean;
  /** second-person copy for a mentee viewing their own progress */
  self?: boolean;
}) {
  const gap = relative - absolute;

  if (compact) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between text-[11px] text-ink-mute">
            <span>Absolute</span>
            <span className="font-mono font-medium text-ink-soft tnum">{absolute}%</span>
          </div>
          <ProgressBar value={absolute} tone="neutral" />
        </div>
        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between text-[11px] text-ink-mute">
            <span>Relative</span>
            <span className="font-mono font-medium text-brand-700 tnum">{relative}%</span>
          </div>
          <ProgressBar value={relative} tone="brand" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm text-ink-soft">Absolute progress</span>
          <span className="font-mono text-sm font-semibold text-ink tnum">{absolute}%</span>
        </div>
        <ProgressBar value={absolute} tone="neutral" height="h-2" />
        <p className="mt-1 text-xs text-ink-faint">Raw output against the plan.</p>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm text-ink-soft">Relative progress</span>
          <span className="font-mono text-sm font-semibold text-brand-700 tnum">{relative}%</span>
        </div>
        <ProgressBar value={relative} tone="brand" height="h-2" />
        <p className="mt-1 text-xs text-ink-faint">
          {self ? 'Given the circumstances you have logged.' : 'Given their logged circumstances.'}
        </p>
      </div>
      {Math.abs(gap) >= 8 && (
        <div className="rounded-r flex items-start gap-2 bg-neutral-50 px-3 py-2 text-xs text-ink-mute ring-1 ring-hairline">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
          {gap > 0 ? (
            <span>
              {self ? 'You are excelling' : 'Excelling'} against real constraints - {gap} pts above
              plan once friction is accounted for.{self ? ' Be proud of that.' : ' Do not over-push.'}
            </span>
          ) : (
            <span>
              Ahead on raw output but {Math.abs(gap)} pts lower relative -{' '}
              {self ? 'a stretch goal could keep things challenging.' : 'may be coasting on easy ground. Consider a stretch.'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
