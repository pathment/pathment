import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '@/lib/ui';

/**
 * The per-mentee AI summary (brief §7.5). Deliberately understated — a quiet
 * white card with a thin blue ledger rule (via `.ai-panel`), not a tinted
 * glowing box. Always shows the signals it used so it's explainable, and never
 * the sole gate on a decision.
 */
export function AISummary({
  summary,
  signals,
  defaultOpen = true,
}: {
  summary: string;
  signals: string[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="ai-panel p-4 pl-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-600">
            Pathment AI
          </span>
          <span className="text-[11px] text-ink-faint">· state of this mentee</span>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-xs text-ink-mute hover:text-ink"
        >
          Signals
          <ChevronDown className={cx('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{summary}</p>

      {open && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-hairline pt-3">
          {signals.map((s) => (
            <span
              key={s}
              className="rounded-md bg-neutral-50 px-2 py-1 font-mono text-[11px] text-ink-mute ring-1 ring-hairline"
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
