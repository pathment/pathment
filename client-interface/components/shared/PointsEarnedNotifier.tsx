"use client";

import React, { useEffect, useState } from "react";
import { X, Sparkles, ArrowRight, Flame, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/context/AuthContext";
import { logicalPathname, workspacePath } from "@/lib/services/workspace-scope";
import {
  gamificationApi,
  type PointsHistoryEntry,
} from "@/lib/services/gamification-api";

/** Daily login is awarded on auth; keep enough window to finish onboarding. */
const DAILY_LOGIN_FRESH_MS = 15 * 60 * 1000;
/** Single live award (task approve, etc.) — not a seed backlog. */
const LIVE_AWARD_FRESH_MS = 90 * 1000;

function formatReason(item: PointsHistoryEntry): string {
  if (item.reason && item.reason.trim()) {
    return item.reason.trim();
  }
  const typeMap: Record<string, string> = {
    daily_login: "Daily Login Check-in",
    task_completion: "Task Completed",
    task_approved: "Task Approved",
    review_contribution: "Cohort Review Contribution",
    community_kudos: "Received Kudos",
    community_answer: "Accepted Answer",
    quiz_passed: "Quiz Passed",
    interview_completed: "Interview Completed",
    streak_bonus: "Streak Bonus",
    badge_reward: "Badge Unlocked",
  };
  return typeMap[item.sourceType] || "Activity Milestone";
}

function readSeenIds(cacheKey: string): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(cacheKey) || "[]");
    return Array.isArray(stored)
      ? stored.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function writeSeenIds(cacheKey: string, ids: string[]) {
  try {
    const existing = readSeenIds(cacheKey);
    const updated = Array.from(new Set([...existing, ...ids]));
    localStorage.setItem(cacheKey, JSON.stringify(updated.slice(-150)));
  } catch {
    // Ignore storage errors
  }
}

function ageMs(item: PointsHistoryEntry): number {
  const t = new Date(item.createdAt).getTime();
  return Number.isFinite(t) ? Date.now() - t : Number.POSITIVE_INFINITY;
}

/** Pick at most one toast-worthy row; never a backlog dump from demo seed. */
function pickToastItems(unseen: PointsHistoryEntry[]): PointsHistoryEntry[] {
  const daily = unseen
    .filter((i) => i.sourceType === "daily_login" && ageMs(i) <= DAILY_LOGIN_FRESH_MS)
    .sort((a, b) => ageMs(a) - ageMs(b));
  if (daily.length) return [daily[0]];

  const live = unseen
    .filter((i) => i.sourceType !== "daily_login" && ageMs(i) <= LIVE_AWARD_FRESH_MS)
    .sort((a, b) => ageMs(a) - ageMs(b));
  // One live award only — multiple “fresh” rows almost always means seed/backfill.
  if (live.length === 1) return live;
  return [];
}

/** Hide toast during profile setup only — do not treat /login as blocked or we
 *  mark the fresh daily-login XP as “seen” before the mentee reaches the app. */
function isOnboardingPath(logical: string, raw: string): boolean {
  return logical.startsWith("/onboarding") || raw.includes("/onboarding");
}

export function PointsEarnedNotifier() {
  const { user } = useAuth();
  const rawPath = usePathname() || "";
  const pathname = logicalPathname(rawPath);
  const [items, setItems] = useState<PointsHistoryEntry[]>([]);
  const [itemsOwnerId, setItemsOwnerId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [dismissedOwnerId, setDismissedOwnerId] = useState<string | null>(null);

  const blocked = isOnboardingPath(pathname, rawPath);
  const userId = user?.id || null;
  const dismissed = dismissedOwnerId === userId;
  const visible = !blocked && !dismissed && itemsOwnerId === userId && items.length > 0;

  // Hide toast on onboarding, but keep a fresh daily_login toastable for after setup.
  useEffect(() => {
    if (!blocked) return;
    if (!userId) return;
    const cacheKey = `pathment_seen_point_ids_${userId}`;
    let cancelled = false;
    (async () => {
      try {
        const history = await gamificationApi.getUserPointsHistory(userId, 20);
        if (cancelled) return;
        // Mark backlog only — never eat today’s fresh daily check-in.
        const ids = (history || [])
          .filter(
            (i) =>
              Number(i.pointsChange) > 0 &&
              !(i.sourceType === "daily_login" && ageMs(i) <= DAILY_LOGIN_FRESH_MS),
          )
          .map((i) => i.id);
        if (ids.length) writeSeenIds(cacheKey, ids);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blocked, userId]);

  useEffect(() => {
    if (!userId || dismissed || blocked) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const cacheKey = `pathment_seen_point_ids_${userId}`;
      const seenIds = new Set(readSeenIds(cacheKey));
      try {
        const history = await gamificationApi.getUserPointsHistory(userId, 15);
        if (cancelled) return;
        const unseen = (history || []).filter(
          (item) => Number(item.pointsChange) > 0 && !seenIds.has(item.id),
        );
        const toastItems = pickToastItems(unseen);
        const toastIds = new Set(toastItems.map((item) => item.id));
        const quietIds = unseen.filter((item) => !toastIds.has(item.id)).map((item) => item.id);
        if (quietIds.length) writeSeenIds(cacheKey, quietIds);
        if (toastItems.length) {
          setItems(toastItems);
          setItemsOwnerId(userId);
        }
      } catch {
        // A toast is optional; points history remains available on the page.
      }
    }, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userId, dismissed, blocked]);

  const handleDismiss = () => {
    if (!userId || items.length === 0) return;
    setDismissedOwnerId(userId);
    writeSeenIds(
      `pathment_seen_point_ids_${userId}`,
      items.map((i) => i.id),
    );
  };

  useEffect(() => {
    if (visible && !paused) {
      const timer = setTimeout(() => {
        if (!userId) return;
        setDismissedOwnerId(userId);
        writeSeenIds(
          `pathment_seen_point_ids_${userId}`,
          items.map((item) => item.id),
        );
      }, 6500);
      return () => clearTimeout(timer);
    }
  }, [visible, paused, userId, items]);

  if (blocked || !visible || items.length === 0) return null;

  const totalPoints = items.reduce(
    (sum, item) => sum + Number(item.pointsChange || 0),
    0,
  );
  const primaryItem = items[0];
  const dailyLogin = primaryItem.sourceType === "daily_login";
  const rewardsHref = pathname.startsWith("/mentee")
    ? "/mentee/gamification"
    : null;
  const title = dailyLogin ? "You showed up today" : formatReason(primaryItem);
  const supportingCopy = dailyLogin
    ? "Small steps build strong streaks. Come back tomorrow to keep yours moving."
    : "Nice work — your level progress just moved forward.";

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[80] flex justify-center sm:inset-auto sm:right-6 sm:top-6 sm:block">
      <aside
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setPaused(false);
        }}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`You earned ${totalPoints} XP. ${title}`}
        className="pointer-events-auto relative w-full max-w-[390px] overflow-hidden rounded-[1.4rem] border border-white/70 bg-white/95 text-slate-950 shadow-[0_20px_55px_-18px_rgba(15,118,110,0.45),0_8px_24px_-12px_rgba(15,23,42,0.25)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 dark:text-white motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 sm:motion-safe:slide-in-from-top-3 sm:motion-safe:duration-300"
      >
        <div
          aria-hidden="true"
          className={[
            "absolute inset-x-0 top-0 h-24 opacity-90",
            dailyLogin
              ? "bg-linear-to-br from-amber-100 via-orange-50 to-transparent dark:from-amber-500/20 dark:via-orange-500/10"
              : "bg-linear-to-br from-emerald-100 via-teal-50 to-transparent dark:from-emerald-500/20 dark:via-teal-500/10",
          ].join(" ")}
        />
        <span aria-hidden="true" className="absolute right-14 top-5 h-2 w-2 rounded-full bg-amber-300/80" />
        <span aria-hidden="true" className="absolute right-8 top-14 h-1.5 w-1.5 rounded-full bg-teal-400/70" />
        <Sparkles aria-hidden="true" className="absolute right-20 top-10 h-4 w-4 rotate-12 text-amber-400/80" />

        <div className="relative flex items-start gap-3.5 p-4.5 pr-12 sm:p-5 sm:pr-12">
          <div
            className={[
              "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border shadow-sm",
              dailyLogin
                ? "border-amber-200 bg-linear-to-br from-amber-300 to-orange-500 text-white shadow-orange-200/70 dark:border-amber-400/30 dark:shadow-none"
                : "border-emerald-200 bg-linear-to-br from-emerald-500 to-teal-700 text-white shadow-emerald-200/70 dark:border-emerald-400/30 dark:shadow-none",
            ].join(" ")}
          >
            <span aria-hidden="true" className="absolute inset-1 rounded-xl border border-white/30" />
            {dailyLogin ? (
              <Flame className="relative h-7 w-7 fill-white/20" aria-hidden="true" />
            ) : (
              <Trophy className="relative h-7 w-7" aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
              {dailyLogin ? "Daily streak" : "Progress unlocked"}
            </p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
                +{totalPoints} XP
              </p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{supportingCopy}</p>
            {rewardsHref && (
              <Link
                href={workspacePath(rewardsHref)}
                onClick={handleDismiss}
                className="mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-slate-950 px-3 text-xs font-bold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:bg-white dark:text-slate-950 dark:hover:bg-emerald-200"
              >
                See your progress
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-black/5 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-600 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label="Dismiss reward notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </div>
  );
}
