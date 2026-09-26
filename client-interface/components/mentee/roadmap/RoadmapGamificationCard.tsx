'use client';

import { useEffect, useState } from 'react';
import { Trophy, Flame, Target, ArrowRight, Award } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import {
  gamificationApi,
  type GamificationStats,
  type Badge,
} from '@/lib/services/gamification-api';
import { useRouter } from 'next/navigation';
import { BadgeEmblem } from '@/components/shared/BadgeEmblem';

import type { MenteeRoadmapStep } from '@/lib/services/roadmap-api';

interface RoadmapGamificationCardProps {
  steps?: MenteeRoadmapStep[];
  earnedRoadmapPoints?: number;
  totalRoadmapPoints?: number;
}

export function RoadmapGamificationCard({
  steps = [],
  earnedRoadmapPoints: propEarnedPoints,
  totalRoadmapPoints: propTotalPoints,
}: RoadmapGamificationCardProps) {
  const { user } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        const [statsRes, badgesRes] = await Promise.all([
          gamificationApi.getUserStats(user.id).catch(() => null),
          gamificationApi.getUserBadges(user.id).catch(() => []),
        ]);

        if (!mounted) return;
        if (statsRes) setStats(statsRes);
        if (badgesRes) setBadges(badgesRes);
      } catch {
        // Fallback silently if gamification endpoint has error
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  // Calculate Roadmap-Specific Points Earned & Task Metrics (or use SSOT props)
  const roadmapEarnedPoints =
    propEarnedPoints ??
    steps.reduce((sum, s) => {
      if (s.done || s.status === 'completed') {
        return sum + (s.assignedTask?.pointsAwarded ?? s.pointsBase ?? 0);
      }
      return sum;
    }, 0);

  const roadmapTotalPoints =
    propTotalPoints ??
    steps.reduce((sum, s) => sum + (s.pointsBase ?? 0), 0);

  const currentLevel = stats?.currentLevel ?? 1;
  const streak = stats?.currentStreak ?? 0;
  const rankDisplay = stats?.leaderboardRank ? `#${stats.leaderboardRank}` : null;
  const recentBadges = badges.slice(0, 3);

  if (loading && !stats) {
    return (
      <div className="bg-card rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3 animate-pulse">
        <div className="h-4 bg-slate-100 rounded w-1/3" />
        <div className="h-16 bg-slate-100 rounded-xl" />
        <div className="h-12 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Trophy className="w-4 h-4 text-amber-500" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">Points & Achievements</h3>
        </div>
        <button
          onClick={() => router.push('/mentee/gamification')}
          className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-0.5"
        >
          View All
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Real Roadmap & Gamification Stats Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl">
          <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5 text-amber-500" />
            Total Points
          </div>
          <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
            {stats?.totalPoints ?? 0} <span className="text-xs font-normal text-slate-500">pts</span>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl">
          <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-brand-500" />
            Roadmap XP
          </div>
          <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
            {roadmapEarnedPoints}
            {roadmapTotalPoints > 0 && (
              <span className="text-xs font-normal text-slate-500"> / {roadmapTotalPoints}</span>
            )}
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl">
          <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-rose-500" />
            Streak
          </div>
          <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
            {streak} <span className="text-xs font-normal text-slate-500">days</span>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl">
          <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
            <Target className="w-3.5 h-3.5 text-emerald-500" />
            Rank & Level
          </div>
          <div className="text-xs font-bold text-slate-900 mt-1 tabular-nums truncate">
            Lvl {rankDisplay ? ` ${rankDisplay}` : ''}
          </div>
        </div>
      </div>

      {/* Purely Dynamic Unlocked Badges */}
      {recentBadges.length > 0 && (
        <div className="pt-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Recent Badges
            </span>
            <span className="text-[11px] font-semibold text-slate-500">
              {recentBadges.length} unlocked
            </span>
          </div>
          <div className="space-y-2">
            {recentBadges.map((badge) => (
              <div
                key={badge.id}
                className="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl hover:bg-slate-100/60 transition-colors"
              >
                <BadgeEmblem
                  name={badge.name}
                  category={badge.category}
                  criteriaType={badge.criteriaType}
                  iconUrl={badge.iconUrl}
                  size="sm"
                  className="!h-7 !w-7 !rounded-lg !ring-2 shadow-2xs"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 truncate">{badge.name}</div>
                  {badge.description && (
                    <div className="text-[11px] font-medium text-slate-600 truncate">{badge.description}</div>
                  )}
                </div>
                {badge.pointsReward ? (
                  <span className="text-[11px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md shrink-0">
                    +{badge.pointsReward} XP
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
