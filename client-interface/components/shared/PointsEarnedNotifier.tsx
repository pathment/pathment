'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { gamificationApi, type PointsHistoryEntry } from '@/lib/services/gamification-api';

interface SprinkleParticle {
  id: number;
  tx: number;
  ty: number;
  rot: number;
  color: string;
  size: number;
  delay: number;
  isSquare: boolean;
}

function createSprinkleParticles(): SprinkleParticle[] {
  const colors = ['#F59E0B', '#3B82F6', '#10B981', '#EC4899', '#8B5CF6', '#FACC15', '#06B6D4', '#F43F5E'];
  const list: SprinkleParticle[] = [];
  const count = 22;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI + (Math.random() * 0.4 - 0.2);
    const dist = 45 + Math.random() * 65; // 45px to 110px burst distance
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const rot = Math.random() * 720 - 360;
    const color = colors[i % colors.length];
    const size = 3 + Math.floor(Math.random() * 4); // 3px to 7px
    const delay = Math.random() * 0.1;
    const isSquare = i % 3 === 0;

    list.push({ id: i, tx, ty, rot, color, size, delay, isSquare });
  }
  return list;
}

function formatReason(item: PointsHistoryEntry): string {
  if (item.reason && item.reason.trim()) {
    return item.reason.trim();
  }
  const typeMap: Record<string, string> = {
    daily_login: 'Daily Login Check-in',
    task_completion: 'Task Completed',
    task_approved: 'Task Approved',
    review_contribution: 'Cohort Review Contribution',
    community_kudos: 'Received Kudos',
    community_answer: 'Accepted Answer',
    quiz_passed: 'Quiz Passed',
    interview_completed: 'Interview Completed',
    streak_bonus: 'Streak Bonus',
    badge_reward: 'Badge Unlocked',
  };
  return typeMap[item.sourceType] || 'Activity Milestone';
}

export function PointsEarnedNotifier() {
  const { user } = useAuth();
  const [items, setItems] = useState<PointsHistoryEntry[]>([]);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [particles, setParticles] = useState<SprinkleParticle[]>([]);

  const checkUnseenPoints = useCallback(async () => {
    if (!user || !user.id || dismissed) return;

    const cacheKey = `pathment_seen_point_ids_${user.id}`;
    let seenIds: string[] = [];
    try {
      seenIds = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    } catch {
      seenIds = [];
    }

    try {
      const history = await gamificationApi.getUserPointsHistory(user.id, 10);
      const unseen = (history || []).filter(
        (item) => Number(item.pointsChange) > 0 && !seenIds.includes(item.id)
      );

      if (unseen.length > 0) {
        setItems(unseen);
        setParticles(createSprinkleParticles());
        setVisible(true);
      }
    } catch {
      // Silently ignore points fetch errors
    }
  }, [user, dismissed]);

  useEffect(() => {
    if (user?.id) {
      const timer = setTimeout(() => {
        checkUnseenPoints();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [user?.id, checkUnseenPoints]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setDismissed(true);

    if (!user?.id || items.length === 0) return;

    const cacheKey = `pathment_seen_point_ids_${user.id}`;
    try {
      const existing: string[] = JSON.parse(localStorage.getItem(cacheKey) || '[]');
      const newIds = items.map((i) => i.id);
      const updated = Array.from(new Set([...existing, ...newIds]));
      localStorage.setItem(cacheKey, JSON.stringify(updated.slice(-100)));
    } catch {
      // Ignore storage errors
    }
  }, [user?.id, items]);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [visible, handleDismiss]);

  if (!visible || items.length === 0) return null;

  const totalPoints = items.reduce((sum, item) => sum + Number(item.pointsChange || 0), 0);
  const primaryItem = items[0];

  return (
    <>
      <style>{`
        @keyframes sprinklePop {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(0.2) rotate(0deg);
          }
          65% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(1.1) rotate(var(--rot));
          }
        }
      `}</style>

      {/* Centered Top Floating Notification */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto flex flex-col items-center">
        {/* Sprinkles / Cracker Explosion Container */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none w-1 h-1">
          {particles.map((p) => (
            <span
              key={p.id}
              className={`absolute pointer-events-none ${p.isSquare ? 'rounded-xs' : 'rounded-full'}`}
              style={{
                width: `${p.size}px`,
                height: `${p.size}px`,
                backgroundColor: p.color,
                left: '0px',
                top: '0px',
                animation: `sprinklePop 1.0s cubic-bezier(0.15, 0.85, 0.35, 1.2) forwards ${p.delay}s`,
                ['--tx' as any]: `${p.tx}px`,
                ['--ty' as any]: `${p.ty}px`,
                ['--rot' as any]: `${p.rot}deg`,
                boxShadow: `0 0 6px ${p.color}`,
              }}
            />
          ))}
        </div>

        {/* Ultra-Clean Professional Floating Pill */}
        <div className="relative flex items-center gap-3 px-4 py-2.5 rounded-full bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100 border border-slate-200/90 dark:border-slate-800 shadow-xl shadow-slate-900/10 backdrop-blur-md transition-all duration-300 animate-in zoom-in-75 slide-in-from-top-6 ease-out max-w-md">
          {/* Points Pill Badge */}
          <span className="px-2.5 py-1 rounded-full text-xs font-black tracking-wide bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 tabular-nums shrink-0">
            +{totalPoints} PTS
          </span>

          {/* Reason / Title */}
          <div className="min-w-0 flex-1 pr-1">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
              {formatReason(primaryItem)}
            </p>
            {items.length > 1 && (
              <p className="text-[10px] text-slate-400 font-normal">
                +{items.length - 1} more reward{items.length > 2 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Close Button */}
          <button
            onClick={handleDismiss}
            className="shrink-0 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}
