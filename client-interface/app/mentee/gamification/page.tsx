"use client";

import { type ComponentType, useEffect, useMemo, useState } from "react";
import {
  Award,
  Flame,
  Loader2,
  Star,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/context/AuthContext";
import { extractApiErrorMessage } from "@/lib/utils/api-error";
import {
  gamificationApi,
  type BadgeCatalogResponse,
  type GamificationStats,
  type LeaderboardEntry,
  type PointsHistoryEntry,
} from "@/lib/services/gamification-api";
import { communityApi } from "@/lib/services/community-api";
import { BadgeCatalog } from "@/components/shared/BadgeCatalog";

interface CommunityStanding {
  rank: number | null;
  points: number;
  tier: string;
}

export default function MenteeGamificationPage() {
  const { user } = useAuth();

  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [catalog, setCatalog] = useState<BadgeCatalogResponse | null>(null);
  const [history, setHistory] = useState<PointsHistoryEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [community, setCommunity] = useState<CommunityStanding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    let mounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [statsRes, catalogRes, historyRes, leaderboardRes, communityRes] =
          await Promise.all([
            gamificationApi.getUserStats(user.id),
            gamificationApi.getBadgeCatalog(user.id, 'mentee'),
            gamificationApi.getUserPointsHistory(user.id, 12),
            gamificationApi.getLeaderboard(10),
            communityApi.leaderboard("global", null, "all").catch(() => null),
          ]);

        if (!mounted) return;
        setStats(statsRes);
        setCatalog(catalogRes);
        setHistory(historyRes);
        setLeaderboard(leaderboardRes);
        setCommunity(
          (communityRes as { data?: { me?: CommunityStanding } } | null)?.data
            ?.me ?? null,
        );
      } catch (e: unknown) {
        if (!mounted) return;

        setError(extractApiErrorMessage(e, "Could not load gamification data"));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const levelProgress = useMemo(() => {
    const points = stats?.totalPoints || 0;
    const currentLevel = stats?.currentLevel || 1;

    const thresholds = [0, 500, 2000, 5000, 10000];
    const currentFloor =
      thresholds[Math.min(currentLevel - 1, thresholds.length - 1)] || 0;
    const nextThreshold =
      thresholds[Math.min(currentLevel, thresholds.length - 1)] || currentFloor;

    if (nextThreshold === currentFloor) {
      return { percent: 100, pointsToNext: 0, atMaxLevel: true };
    }

    const progress =
      ((points - currentFloor) / (nextThreshold - currentFloor)) * 100;
    return {
      percent: Math.max(0, Math.min(100, Math.round(progress))),
      pointsToNext: Math.max(0, nextThreshold - points),
      atMaxLevel: false,
    };
  }, [stats]);

  if (!user?.id) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
        {error || "Could not load gamification data"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-brand-200 bg-linear-to-r from-brand-50 dark:from-brand-500/10 to-cyan-50 dark:to-transparent p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-slate-900 mb-2">XP and badges</h1>
            <p className="text-slate-600">
              XP builds your level. Reward credits come from approved tasks and are spent separately.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-xl bg-card px-4 py-3 border border-brand-200 min-w-[110px]">
              <div className="text-xs text-slate-500">Learning rank</div>
              <div className="text-2xl font-semibold text-brand-700">
                {stats.leaderboardRank
                  ? `#${stats.leaderboardRank}`
                  : "Unranked"}
              </div>
              <div className="text-[11px] text-slate-400">
                from completed work
              </div>
            </div>
            <div className="rounded-xl bg-card px-4 py-3 border border-brand-200 min-w-[120px]">
              <div className="text-xs text-slate-500">Community standing</div>
              <div className="text-lg font-semibold text-slate-900">
                {community ? community.tier : "Newcomer"}
              </div>
              <div className="text-[11px] text-slate-400">
                {community && community.points > 0
                  ? `${community.points} pts${community.rank ? ` · #${community.rank}` : ""}`
                  : "helping others"}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
            <span>Level {stats.currentLevel}</span>
            <span>
              {levelProgress.atMaxLevel
                ? "Highest level reached"
                : `${levelProgress.pointsToNext} XP to next level`}
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-card/80 border border-brand-100 overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-brand-600 to-cyan-500 transition-all"
              style={{ width: `${levelProgress.percent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={Trophy}
          label="Total XP"
          value={stats.totalPoints}
          accent="text-amber-600"
        />
        <StatCard icon={Award} label="Reward Credits" value={stats.rewardCredits ?? 0} accent="text-brand-600" />
        <StatCard
          icon={Flame}
          label="Current Streak"
          value={`${stats.currentStreak} days`}
          accent="text-orange-600"
        />
        <StatCard
          icon={Target}
          label="Tasks Completed"
          value={stats.totalTasksCompleted}
          accent="text-emerald-600"
        />
        <StatCard
          icon={Star}
          label="Average Rating"
          value={Number(stats.avgTaskRating || 0).toFixed(2)}
          accent="text-brand-600"
        />
      </div>

      <div className="grid gap-6">
        <section className="rounded-2xl border border-slate-200 bg-card p-5">
          {/* No period tabs: the progress score is a current standing, not points
              banked over a window, so "this week's score" would be the same
              number wearing a different label. */}
          <div className="mb-4">
            <h2 className="text-slate-900">Top Leaderboard</h2>
            <p className="text-slate-500 text-xs mt-0.5">
              Ranked by progress score — the same measure your mentor sees under
              Teaching. Badges and streaks are earned separately.
            </p>
          </div>

          <div className="space-y-2">
            {leaderboard.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
                Leaderboard is empty right now.
              </div>
            )}
            {leaderboard.map((entry) => {
              const name =
                [entry.user?.firstName, entry.user?.lastName]
                  .filter(Boolean)
                  .join(" ")
                  .trim() ||
                entry.user?.email ||
                "User";
              const isCurrentUser = entry.userId === user.id;

              return (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between rounded-xl border p-3 ${
                    isCurrentUser
                      ? "border-brand-300 bg-brand-50 dark:bg-brand-500/10"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center text-sm font-semibold">
                      {entry.rank}
                    </div>
                    <div className="min-w-0">
                      <p className="text-slate-900 truncate">{name}</p>
                      {isCurrentUser && (
                        <p className="text-brand-700 text-xs">You</p>
                      )}
                    </div>
                  </div>
                  {/* The task count makes the score checkable: "462 pts from 52
                      tasks" is a sentence somebody can verify against their own
                      work, where a bare number is one they can only accept. */}
                  <div className="text-right shrink-0">
                    <div className="text-slate-700 font-medium">
                      {entry.score}
                      {entry.band && (
                        <span className="text-slate-500 text-xs font-normal">
                          {" "}
                          · {entry.band}
                        </span>
                      )}
                    </div>
                    {entry.tasksCompleted !== undefined && (
                      <div className="text-slate-500 text-xs">
                        {entry.tasksCompleted} task
                        {entry.tasksCompleted === 1 ? "" : "s"}
                        {entry.onTimeRate != null &&
                          ` · ${entry.onTimeRate}% on time`}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-card p-5 sm:p-6">
        {catalog ? (
          <BadgeCatalog catalog={catalog} userId={user?.id} />
        ) : (
          <p className="text-sm text-slate-500">Loading badges…</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-brand-600" />
          <h2 className="text-slate-900">XP History</h2>
        </div>

        <div className="space-y-2">
          {history.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
              No XP awarded yet.
            </div>
          )}

          {history.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 p-3"
            >
              <div className="min-w-0">
                <p className="text-slate-900 truncate">
                  {item.reason || item.sourceType}
                </p>
                <p className="text-slate-500 text-xs">
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              <div
                className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${Number(item.pointsChange) >= 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"}`}
              >
                {Number(item.pointsChange) > 0 ? "+" : ""}
                {item.pointsChange} XP
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-sm">{label}</p>
          <p className="text-foreground text-3xl font-semibold tracking-tight tabular-nums mt-3">
            {value}
          </p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
          <Icon className={`w-5 h-5 ${accent}`} />
        </div>
      </div>
    </div>
  );
}
