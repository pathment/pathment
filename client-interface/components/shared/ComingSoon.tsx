'use client';

import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';

/**
 * ComingSoon — the ONE reusable "this feature is on the way" teaser.
 *
 * Use it anywhere a feature is gated off in an environment (typically prod,
 * behind a flag) but we still want to tease it so users get excited instead of
 * seeing nothing. Keep new-feature teasers consistent by always reaching for
 * this instead of hand-rolling a card.
 *
 *   <ComingSoon
 *     title="Live review calls"
 *     description="Run your cohort review over live video, right inside Pathment."
 *     features={[{ icon: <Radio/>, label: 'One-click start' }, ...]}
 *     cta="Start meeting"
 *   />
 *
 * Presentational only — the caller decides WHEN to show it (e.g. when a server
 * flag reports the feature disabled + comingSoon).
 */
export interface ComingSoonFeature {
  /** Small leading icon (e.g. a lucide icon sized h-3 w-3). Optional. */
  icon?: ReactNode;
  label: string;
}

export function ComingSoon({
  title,
  description,
  features = [],
  icon,
  cta,
  compact = false,
}: {
  title: string;
  description: string;
  /** Short capability chips shown under the description. */
  features?: ComingSoonFeature[];
  /** Header icon; defaults to a sparkle. */
  icon?: ReactNode;
  /** Optional disabled call-to-action button label (looks real, does nothing). */
  cta?: string;
  /** Tighter padding / no CTA emphasis for inline spots. */
  compact?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 via-card to-card ${compact ? 'p-4' : 'p-5'}`}
    >
      <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
        <Sparkles className="h-3 w-3" /> Coming soon
      </span>

      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
          {icon ?? <Sparkles className="h-5 w-5" />}
        </div>
        <div className="min-w-0 pr-20">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
          {features.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {features.map((f, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600"
                >
                  {f.icon}
                  {f.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {cta && !compact && (
        <button
          type="button"
          disabled
          title="This feature is launching soon"
          className="mt-4 inline-flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-lg bg-brand-600/60 px-3 py-2 text-xs font-semibold text-white"
        >
          {cta}
        </button>
      )}
    </div>
  );
}
