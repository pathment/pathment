'use client';

import { Archive, CheckCircle2, Eye, LockKeyhole } from 'lucide-react';
import {
  useClan,
  resolveActiveMentorClan,
} from '@/lib/context/ClanContext';
import { StandingClanRequestCta } from '@/components/shared/StandingClanRequestCta';
import { cn } from '@/components/ui/utils';

/**
 * Banner on mentor/mentee screens when the active cohort clan is frozen
 * (program closed). Standing clans use the same screens with no extra banner.
 */
export function ClanWorkspaceNotice({ role }: { role: 'mentor' | 'mentee' }) {
  const { clans, activeClanId, menteeClans, menteeActiveClanId } = useClan();
  const clan =
    role === 'mentor'
      ? resolveActiveMentorClan(clans, activeClanId)
      : menteeClans.find((c) => c.id === menteeActiveClanId);

  // Standing clans stay fully open — no notice. Only frozen cohort history.
  if (!clan?.frozenAt || clan.kind === 'standing') return null;

  const showStandingRequest =
    role === 'mentor' && Boolean(clan.programId);

  return (
    <section
      aria-labelledby="completed-workspace-title"
      className={cn(
        'relative mb-6 overflow-hidden rounded-3xl border border-brand-200/70',
        'bg-gradient-to-br from-brand-50 via-card to-emerald-50/60 shadow-sm',
        'dark:border-brand-900 dark:from-brand-950/50 dark:via-card dark:to-emerald-950/30',
      )}
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-brand-600" aria-hidden />
      <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand-200 bg-card text-brand-700 shadow-sm dark:border-brand-800 dark:text-brand-300">
            <Archive className="h-5 w-5" aria-hidden />
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-card/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:border-brand-800 dark:text-brand-300">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Program completed
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/5 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                <LockKeyhole className="h-3.5 w-3.5" aria-hidden />
                Read-only history
              </span>
            </div>
            <h2 id="completed-workspace-title" className="mt-2 text-base font-semibold text-foreground sm:text-lg">
              {clan.name} is now a completed workspace
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {role === 'mentor'
                ? 'The final cohort record is preserved here. You can review past work, progress, and feedback, while actions that change this cohort stay locked.'
                : 'Your final program record is preserved here. You can revisit your work, progress, feedback, and recognition at any time.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-brand-600" aria-hidden />
                Past work stays visible
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                Final progress is preserved
              </span>
            </div>
          </div>
        </div>

        {showStandingRequest && clan.programId ? (
          <div className="shrink-0 border-t border-brand-200/70 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 dark:border-brand-900">
            <StandingClanRequestCta programId={clan.programId} sourceClanId={clan.id} programName={clan.name} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
