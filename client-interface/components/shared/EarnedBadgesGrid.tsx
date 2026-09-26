'use client';

import type { Badge } from '@/lib/services/gamification-api';
import { BadgeEmblem, themeForCategory } from '@/components/shared/BadgeEmblem';

function formatUnlocked(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function EarnedBadgesGrid({
  badges,
  emptyText = 'No badges yet. Finish meaningful work to earn your first one.',
}: {
  badges: Badge[];
  emptyText?: string;
}) {
  if (!badges.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        {emptyText}
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {badges.map((badge) => {
        const theme = themeForCategory(badge.category);
        const unlocked = formatUnlocked(badge.unlockedAt);

        return (
          <li key={badge.id}>
            <article className="flex h-full items-stretch overflow-hidden rounded-2xl border border-slate-200 bg-card shadow-sm transition hover:border-slate-300 hover:shadow-md">
              <div className={`w-1.5 shrink-0 ${theme.bar}`} aria-hidden />
              <div className="flex min-w-0 flex-1 items-center gap-3 p-3.5 sm:gap-4 sm:p-4">
                <BadgeEmblem
                  name={badge.name}
                  category={badge.category}
                  criteriaType={badge.criteriaType}
                  iconUrl={badge.iconUrl}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="text-sm font-semibold text-slate-900 sm:text-base">{badge.name}</h3>
                    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${theme.chip}`}>
                      {theme.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-snug text-slate-600">{badge.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    {badge.pointsReward > 0 && (
                      <span className="font-medium text-slate-700">+{badge.pointsReward} XP</span>
                    )}
                    {unlocked && <span>Earned {unlocked}</span>}
                  </div>
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
