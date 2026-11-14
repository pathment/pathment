"use client";

import React, { useEffect, useState } from "react";
import { X, ArrowRight } from "lucide-react";
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
        aria-label={`${headline}. You earned ${totalPoints} XP.`}
        /**
         * Dark in both themes, on purpose.
         *
         * This is the one moment in the product that is a celebration rather
         * than a piece of furniture, and a card that matches every other card
         * cannot say so. A deep brand surface separates it from the page
         * underneath without needing an outline to do it.
         */
        className="pointer-events-auto relative w-full max-w-[400px] overflow-hidden rounded-[1.25rem] bg-linear-to-br from-brand-800 via-brand-900 to-slate-950 text-white shadow-[0_20px_50px_-16px_rgba(6,78,59,0.65)] ring-1 ring-white/10 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-2 sm:motion-safe:slide-in-from-top-2 sm:motion-safe:duration-300"
      >
        {/* A few pieces of confetti behind the mark. Placed by hand rather than
            at random so they never collide with the close button, and gone
            entirely when motion is turned down. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-32 overflow-hidden">
          {[
            { c: "bg-amber-300", s: "h-1.5 w-1.5 rounded-full", t: "top-5 left-6", d: "0ms" },
            { c: "bg-emerald-300", s: "h-1 w-3 rounded-full rotate-12", t: "top-9 left-20", d: "260ms" },
            { c: "bg-amber-400", s: "h-1 w-2.5 rounded-full -rotate-12", t: "bottom-7 left-7", d: "520ms" },
            { c: "bg-white/70", s: "h-1 w-1 rounded-full", t: "bottom-5 left-24", d: "140ms" },
            { c: "bg-emerald-200", s: "h-1.5 w-1.5 rounded-full", t: "top-4 left-28", d: "400ms" },
          ].map((bit, i) => (
            <span
              key={i}
              style={{ animationDelay: bit.d }}
              className={`absolute ${bit.t} ${bit.s} ${bit.c} opacity-80 motion-safe:animate-pm-confetti`}
            />
          ))}
        </div>

        <div className="relative flex items-center gap-4 p-4 pr-10">
          {/*
              One mark carrying both facts: what happened, and what it was
              worth. The XP rides on Kiko instead of competing with the
              streak for the headline.
          */}
          <div className="relative -my-1 shrink-0">
            {/* Kiko shows up for it: a cheer for showing up today, a wink for progress. */}
            <Kiko mood={dailyLogin ? "celebrate" : "wink"} size={60} animated className="drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]" />
            <span className="absolute -bottom-1.5 -right-1.5 rounded-full bg-white px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums text-slate-900 shadow-md">
              +{totalPoints}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300/90">
              {dailyLogin ? "Daily streak" : "Progress unlocked"}
            </p>
            <p className="mt-0.5 truncate text-xl font-extrabold tracking-tight">{headline}</p>

            {pips ? (
              <div className="mt-2 flex items-center gap-1" aria-hidden="true">
                {pips.map((lit, i) => (
                  <span
                    key={i}
                    style={{ animationDelay: `${i * 45}ms` }}
                    className={`h-1.5 rounded-full motion-safe:animate-pm-pip ${
                      lit ? "w-4 bg-amber-400" : "w-2.5 bg-white/20"
                    }`}
                  />
                ))}
                {days > PIPS && (
                  <span className="ml-1 text-[11px] font-semibold text-amber-300/90">+{days - PIPS}</span>
                )}
              </div>
            ) : null}

            <p className="mt-1.5 truncate text-xs text-white/60">{sub}</p>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {rewardsHref && (
          <div className="relative px-4 pb-4">
            <Link
              href={workspacePath(rewardsHref)}
              onClick={handleDismiss}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white ring-1 ring-white/15 transition-colors hover:bg-white/20"
            >
              Keep going
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}

        {/*
            The countdown, drawn.

            It always left after 6.5s and hovering always held it; neither was
            visible, so the card read as something to deal with rather than
            something passing through.
        */}
        <span
          aria-hidden="true"
          className={`absolute bottom-0 left-0 h-0.5 origin-left bg-amber-400/80 ${
            paused ? "" : "animate-pm-toast-timer"
          }`}
          style={paused ? { width: "100%", opacity: 0.3 } : undefined}
        />
      </aside>
    </div>
  );
}
