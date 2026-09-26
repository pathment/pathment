'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { toast } from 'sonner';
import type { BadgeCatalogItem, BadgeCatalogResponse } from '@/lib/services/gamification-api';
import { EarnedBadgesGrid } from '@/components/shared/EarnedBadgesGrid';
import { BadgeEmblem } from '@/components/shared/BadgeEmblem';

function seenKey(userId: string) {
  return `pathment:badge-unlock-seen:${userId}`;
}

function readSeen(userId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(seenKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(userId: string, ids: Set<string>) {
  try {
    sessionStorage.setItem(seenKey(userId), JSON.stringify([...ids]));
  } catch {
    /* ignore quota / private mode */
  }
}

/** One-shot unlock toast per session for newly earned badges. */
export function useBadgeUnlockToast(userId: string | undefined, earned: BadgeCatalogItem[]) {
  const announced = useRef(false);
  useEffect(() => {
    if (!userId || !earned.length || announced.current) return;
    if (typeof window === 'undefined') return;
    const seen = readSeen(userId);
    const fresh = earned.filter((b) => !seen.has(b.id));
    if (fresh.length) {
      const newest = fresh[0];
      toast.success(fresh.length === 1
        ? `Badge unlocked: ${newest.name}`
        : `${fresh.length} badges unlocked`, {
        description: fresh.length === 1 ? newest.description : fresh.map((b) => b.name).join(', '),
        icon: (
          <BadgeEmblem
            name={newest.name}
            category={newest.category}
            criteriaType={newest.criteriaType}
            iconUrl={newest.iconUrl}
            size="sm"
            className="!ring-0 shadow-none"
          />
        ),
      });
    }
    for (const b of earned) seen.add(b.id);
    writeSeen(userId, seen);
    announced.current = true;
  }, [userId, earned]);
}

function LockedBadgeCard({ badge }: { badge: BadgeCatalogItem }) {
  const progress = badge.progress;

  return (
    <li>
      <article className="flex h-full items-stretch overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50/80">
        <div className="w-1.5 shrink-0 bg-slate-300" aria-hidden />
        <div className="flex min-w-0 flex-1 items-center gap-3 p-3.5 sm:gap-4 sm:p-4">
          <div className="relative shrink-0">
            <BadgeEmblem
              name={badge.name}
              category={badge.category}
              criteriaType={badge.criteriaType}
              iconUrl={badge.iconUrl}
              muted
            />
            <span
              className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-white bg-slate-700 text-white shadow-sm"
              aria-hidden
            >
              <Lock className="h-3 w-3" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-slate-800 sm:text-base">{badge.name}</h3>
            {badge.criteriaType === 'custom' ? (
              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Manual recognition</p>
            ) : badge.automatic !== false && badge.criteriaType?.startsWith('mentor_') ? (
              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-brand-700">Automatic</p>
            ) : null}
            <p className="mt-1 text-sm leading-snug text-slate-600">{badge.description}</p>
            {progress?.measurable && progress.label && progress.target != null ? (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-medium text-slate-600">{progress.label}</p>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{
                      width: `${Math.min(100, Math.round(((progress.current || 0) / progress.target) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Keep going — progress unlocks when the rule is met.</p>
            )}
            {badge.pointsReward > 0 && (
              <p className="mt-1 text-xs font-medium text-slate-600">+{badge.pointsReward} XP when earned</p>
            )}
          </div>
        </div>
      </article>
    </li>
  );
}

export function BadgeCatalog({
  catalog,
  userId,
  emptyEarned = 'No badges yet. Finish meaningful work to earn your first one.',
}: {
  catalog: BadgeCatalogResponse;
  userId?: string;
  emptyEarned?: string;
}) {
  const [showAvailable, setShowAvailable] = useState(false);
  useBadgeUnlockToast(userId, catalog.earned);

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-slate-900">Earned badges</h2>
            <p className="mt-1 text-sm text-slate-500">
              Recognition you have unlocked.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {catalog.earned.length}
          </span>
        </div>
        <EarnedBadgesGrid
          badges={catalog.earned.map((b) => ({
            id: b.id,
            name: b.name,
            description: b.description,
            category: b.category,
            criteriaType: b.criteriaType,
            pointsReward: b.pointsReward,
            isSecret: b.isSecret,
            iconUrl: b.iconUrl,
            unlockedAt: b.unlockedAt,
          }))}
          emptyText={emptyEarned}
        />
      </section>

      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-slate-900">Available to earn</h2>
            <p className="mt-1 text-sm text-slate-500">
              Published badges for you. Automatic badges show progress; manual recognition is awarded by your organization. Secret badges stay hidden until earned.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              {catalog.available.length}
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-card px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              aria-expanded={showAvailable}
              onClick={() => setShowAvailable((open) => !open)}
            >
              {showAvailable ? (
                <>
                  Hide available
                  <ChevronUp className="h-4 w-4" aria-hidden />
                </>
              ) : (
                <>
                  Show available
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </>
              )}
            </button>
          </div>
        </div>
        {showAvailable && (
          <div className="mt-4">
            {!catalog.available.length ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                {catalog.earned.length
                  ? 'You have unlocked every published badge currently available.'
                  : 'No published badges to chase yet.'}
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {catalog.available.map((badge) => (
                  <LockedBadgeCard key={badge.id} badge={badge} />
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
