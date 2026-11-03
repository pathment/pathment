'use client';

import { useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronRight, Pin } from 'lucide-react';
import { ScenarioDrawer } from './ScenarioDrawer';

/**
 * The scenario, pinned to the top of a group chat like a pinned message: one
 * short line with its title, opening in the scenario drawer when tapped, so
 * the chat keeps its height. Where the chat shares a page with a list on a phone
 * (`onBack`), this bar also holds the way back, so it stays without a scenario.
 * `trailing` sits at the end of the bar (the members button).
 */
export function PinnedScenario({ title, prompt, onBack, trailing }: {
  title: string;
  prompt?: string | null;
  onBack?: () => void;
  trailing?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!prompt && !onBack && !trailing) return null;

  return (
    <div className={`border-b border-border bg-card/90 ${prompt || trailing ? '' : 'xl:hidden'}`}>
      <div className="flex items-center gap-1 px-2 py-1.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="xl:hidden p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors shrink-0"
            aria-label="Back to discussions"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        {prompt ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <Pin className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
            {/* Just the title: the scenario itself is read in the drawer. */}
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              The scenario <span className="font-normal text-muted-foreground">· {title}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 transition-colors group-hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300">
              Read <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate px-2 text-sm font-semibold text-foreground">{title}</span>
        )}
        {trailing}
      </div>
      {prompt && <ScenarioDrawer open={open} onClose={() => setOpen(false)} title={title} prompt={prompt} />}
    </div>
  );
}
