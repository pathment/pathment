"use client";

import React, { useEffect, useState } from "react";
import { X, ArrowRight, Flame } from "lucide-react";
import { Kiko } from "@/components/shared/Kiko";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/context/AuthContext";
import { activeWorkspaceSlug, logicalPathname, workspacePath } from "@/lib/services/workspace-scope";
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
  const hasWorkspace = Boolean(activeWorkspaceSlug());
  const [items, setItems] = useState<PointsHistoryEntry[]>([]);
  const [itemsOwnerId, setItemsOwnerId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  /**
   * How many days in a row, for a check-in toast.
   *
   * The toast used to lead with "+1 XP", which is not a number anybody can
   * care about — it is the same every day and it buys nothing on its own. The
   * streak is the number that makes someone come back tomorrow, and it was the
   * one thing the card did not show. Null until it arrives, so the toast can
   * open immediately and fill in.
   */
  const [streak, setStreak] = useState<number | null>(null);
  const [dismissedOwnerId, setDismissedOwnerId] = useState<string | null>(null);

  const blocked = !hasWorkspace || isOnboardingPath(pathname, rawPath);
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
          if (toastItems[0].sourceType === 'daily_login') {
            // Secondary and optional: a missing streak costs the headline, not
            // the toast.
            gamificationApi.getUserStats(userId)
              .then((stats) => { if (!cancelled) setStreak(Number(stats?.currentStreak) || 0); })
              .catch(() => { /* headline falls back to the check-in itself */ });
          }
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

  /**
   * The streak is the headline, not the points.
   *
   * A check-in is +1 XP every single day, so leading with it shouted the one
   * number that can never change. "12 days" is what makes tomorrow matter, and
   * it is the whole reason a streak mechanic works.
   */
  const days = streak ?? 0;
  const headline = dailyLogin
    ? (days > 1 ? `${days} day streak` : "Checked in today")
    : formatReason(primaryItem);
  const sub = dailyLogin
    ? (days > 1 ? "Come back tomorrow to keep it alive" : "Come back tomorrow to start a streak")
    : "Your level progress just moved forward";

  /**
   * The run so far, one pip per day.
   *
   * Capped at fourteen: past that the row becomes a texture rather than a
   * count, and the number above it already says the total. Derived from the
   * streak, never invented.
   */
  const PIPS = 14;
  const pips = dailyLogin && streak !== null
    ? Array.from({ length: Math.min(Math.max(days, 7), PIPS) }, (_, i) => i < days)
    : null;

  return (
    // Top centre, like every other notice: one place to look for news.
    <div className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+1rem)] z-[80] flex justify-center">
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
        aria-label={`${headline}. You earned ${totalPoints} XP.`}
        /**
         * A clean card, not a dark gradient slab: the page's own surface, a
         * hairline border and a soft lift. The colour lives where it means
         * something: the warm streak flame, the lit days, the countdown.
         */
        className="pointer-events-auto relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-200/80 bg-card text-slate-900 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.35),0_2px_6px_-2px_rgba(15,23,42,0.08)] dark:border-slate-700/80 dark:text-slate-50 dark:shadow-[0_18px_40px_-12px_rgba(0,0,0,0.6)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:slide-in-from-top-3 motion-safe:duration-300"
      >
        <div className="relative flex items-center gap-4 p-4 pr-11">
          {/* Kiko on a warm disc, with the XP as a small badge on the mark. */}
          <div className="relative shrink-0">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 ring-1 ring-amber-200/70 dark:bg-amber-400/10 dark:ring-amber-300/20">
              <Kiko mood={dailyLogin ? "celebrate" : "wink"} size={54} animated />
            </div>
            {/* A few sparks around the mark; gone when motion is turned down. */}
            {[
              { c: "bg-amber-400", s: "h-1.5 w-1.5 rounded-full", t: "-top-1 left-2", d: "0ms" },
              { c: "bg-brand-400", s: "h-1 w-2.5 rounded-full rotate-12", t: "top-3 -right-2", d: "300ms" },
              { c: "bg-amber-300", s: "h-1 w-1 rounded-full", t: "-bottom-1 left-5", d: "600ms" },
            ].map((bit, i) => (
              <span
                key={i}
                aria-hidden="true"
                style={{ animationDelay: bit.d }}
                className={`pointer-events-none absolute ${bit.t} ${bit.s} ${bit.c} opacity-0 motion-safe:animate-pm-confetti`}
              />
            ))}
            <span className="absolute -bottom-1.5 -right-2 rounded-full bg-slate-900 px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums text-white shadow-sm ring-2 ring-white dark:bg-white dark:text-slate-900 dark:ring-slate-900">
              +{totalPoints} XP
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-600 dark:text-amber-300">
              {dailyLogin ? <Flame className="h-3 w-3" aria-hidden="true" /> : null}
              {dailyLogin ? "Daily streak" : "Progress unlocked"}
            </p>
            <p className="mt-0.5 truncate text-lg font-extrabold tracking-tight">{headline}</p>

            {pips ? (
              <div className="mt-2 flex items-center gap-1" aria-hidden="true">
                {pips.map((lit, i) => (
                  <span
                    key={i}
                    style={{ animationDelay: `${i * 45}ms` }}
                    className={`h-1.5 rounded-full motion-safe:animate-pm-pip ${
                      lit ? "w-4 bg-gradient-to-r from-amber-400 to-orange-500" : "w-2.5 bg-slate-200 dark:bg-slate-700"
                    }`}
                  />
                ))}
                {days > PIPS && (
                  <span className="ml-1 text-[11px] font-semibold text-amber-600 dark:text-amber-300">+{days - PIPS}</span>
                )}
              </div>
            ) : null}

            <p className="mt-1.5 truncate text-xs text-slate-500 dark:text-slate-400">{sub}</p>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-[background-color,color,transform] hover:bg-slate-100 hover:text-slate-700 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-slate-800 dark:hover:text-slate-200 [&>svg]:transition-transform hover:[&>svg]:rotate-90"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {rewardsHref && (
          <div className="relative flex justify-end border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
            <Link
              href={workspacePath(rewardsHref)}
              onClick={handleDismiss}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-400/10"
            >
              Keep going
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}

        {/* The countdown, drawn: it leaves after 6.5s, and hovering holds it. */}
        <span
          aria-hidden="true"
          className={`absolute bottom-0 left-0 h-0.5 origin-left bg-gradient-to-r from-amber-400 to-orange-500 ${
            paused ? "" : "animate-pm-toast-timer"
          }`}
          style={paused ? { width: "100%", opacity: 0.3 } : undefined}
        />
      </aside>
    </div>
  );
}
