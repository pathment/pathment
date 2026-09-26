'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import {
  gamificationApi,
  type BadgeCatalogResponse,
  type GamificationStats,
  type PointsHistoryEntry,
} from '@/lib/services/gamification-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { BadgeCatalog } from '@/components/shared/BadgeCatalog';

export default function MentorRecognition() {
  const { user } = useAuth();
  const [data, setData] = useState<{
    stats: GamificationStats;
    catalog: BadgeCatalogResponse;
    history: PointsHistoryEntry[];
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    if (user?.id) {
      Promise.all([
        gamificationApi.getUserStats(user.id),
        gamificationApi.getBadgeCatalog(user.id, 'mentor'),
        gamificationApi.getUserPointsHistory(user.id),
      ])
        .then(([stats, catalog, history]) => {
          if (current) setData({ stats, catalog, history });
        })
        .catch((e) => {
          if (current) setError(extractApiErrorMessage(e, 'Could not load recognition'));
        });
    }
    return () => {
      current = false;
    };
  }, [user?.id]);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-slate-900">My recognition</h1>
        <p className="mt-1 text-slate-600">
          Earn XP from answers accepted by others and recognition verified by your organization. Review
          counts alone do not earn XP.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Accepted answers: 25 XP each, up to 100 XP per UTC day. Your organization sets badge XP. Mentor
          XP is not spendable reward credit.
        </p>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p>Loading recognition…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-6 rounded-xl border border-slate-200 bg-card p-5">
            <span>
              Total XP: <strong>{data.stats.totalPoints}</strong>
            </span>
            <span>
              Level: <strong>{data.stats.currentLevel}</strong>
            </span>
            <span>
              Badges: <strong>{data.stats.totalBadges}</strong>
            </span>
          </div>
          <p className="text-sm text-slate-500">Level thresholds: 0, 500, 2,000, 5,000 and 10,000 XP.</p>
          <section className="rounded-2xl border border-slate-200 bg-card p-5">
            <BadgeCatalog
              catalog={data.catalog}
              userId={user?.id}
              emptyEarned="Your earned badges will appear here."
            />
          </section>
          <section className="rounded-2xl border border-slate-200 bg-card p-5">
            <h2 className="mb-3 text-slate-900">Recent XP</h2>
            {data.history.map((h) => (
              <div
                key={h.id}
                className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0"
              >
                <span>
                  {h.reason} · {new Date(h.createdAt).toLocaleDateString()}
                </span>
                <span className="font-medium">
                  {h.pointsChange > 0 ? '+' : ''}
                  {h.pointsChange} XP
                </span>
              </div>
            ))}
            {!data.history.length && <p className="text-sm text-slate-500">No XP history yet.</p>}
          </section>
        </>
      )}
    </div>
  );
}
