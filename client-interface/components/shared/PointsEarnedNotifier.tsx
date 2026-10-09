"use client";

import React, { useEffect, useState } from "react";
import { X, Sparkles, ArrowRight, Flame } from "lucide-react";
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

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center px-3 pt-4 sm:pt-5">
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
        className={[
          "pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border shadow-lg",
          "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-3 motion-safe:duration-300",
          dailyLogin
            ? "border-brand-200 bg-linear-to-br from-brand-50 via-card to-cyan-50/80 dark:from-brand-500/15 dark:via-card dark:to-transparent"
            : "border-border bg-card",
        ].join(" ")}
      >
        {dailyLogin && (
          <div className="h-1 w-full bg-linear-to-r from-brand-500 via-brand-600 to-cyan-500" />
        )}

        <div className="flex items-start gap-3 p-4">
          <span
            className={[
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
              dailyLogin
                ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
            ].join(" ")}
          >
            {dailyLogin ? (
              <Flame className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700/80 dark:text-brand-300">
              {dailyLogin ? "Daily check-in" : "XP earned"}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-50">
              {dailyLogin
                ? "Welcome back +1 XP"
                : formatReason(primaryItem)}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {dailyLogin ? (
                <>
                  Nice habit. Keep showing up. Streaks and levels grow from
                  small check-ins like this.
                </>
              ) : (
                <>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    +{totalPoints} XP
                  </span>{" "}
                  added to your progress.
                </>
              )}
            </p>
            {rewardsHref && (
              <Link
                href={workspacePath(rewardsHref)}
                onClick={handleDismiss}
                className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300"
              >
                View progress
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/70 hover:text-slate-700 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-brand-500"
            aria-label="Dismiss reward notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </div>
  );
}
