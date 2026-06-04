'use client';

import { useEffect, useState } from 'react';
import { Loader2, MessageSquareHeart, Star, ThumbsUp } from 'lucide-react';
import { programReviewApi } from '@/lib/services/program-review-api';

interface AdminReview {
  id: string;
  program: { id: string; name: string } | null;
  rating: number;
  dimensions: Record<string, number>;
  reviewText: string | null;
  wouldRecommend: boolean | null;
  createdAt: string;
}
interface Data {
  summary: { total: number; overall?: number; recommendRate?: number | null; perDimension?: Record<string, { average: number; responses: number } | null> };
  reviews: AdminReview[];
}

const LABELS: Record<string, string> = {
  responsiveness: 'Responsiveness', helpfulness: 'Helpfulness', clarity: 'Clarity', support: 'Support',
};

/**
 * Admin moderation view of a mentor's anonymous feedback. Admins see the full
 * aggregate plus the raw reviews (reviewer identity withheld by default to keep
 * the anonymity promise) — for spotting patterns and handling abuse.
 */
export function MentorFeedbackAdminPanel({ mentorId }: { mentorId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mentorId) return;
    let cancelled = false;
    setLoading(true);
    programReviewApi
      .getMentorFeedbackForAdmin(mentorId)
      .then((res: any) => { if (!cancelled) setData(res?.data ?? res); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mentorId]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200">
      <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <MessageSquareHeart className="w-4 h-4 text-slate-400" />
          Mentee Feedback
        </h3>
        {data && (
          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
            {data.summary.total}
          </span>
        )}
      </div>

      {loading ? (
        <div className="px-6 py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-600" /></div>
      ) : !data || data.summary.total === 0 ? (
        <div className="px-6 py-10 text-center"><p className="text-sm text-slate-400">No feedback collected yet</p></div>
      ) : (
        <div className="px-6 py-5 space-y-5">
          {/* Aggregate */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="flex items-center gap-1.5">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span className="text-lg font-semibold text-slate-900">{data.summary.overall?.toFixed(1) ?? '—'}</span>
              <span className="text-sm text-slate-400">/ 5</span>
            </div>
            {typeof data.summary.recommendRate === 'number' && (
              <div className="flex items-center gap-1.5 text-sm text-slate-700">
                <ThumbsUp className="w-4 h-4 text-emerald-500" /><strong>{data.summary.recommendRate}%</strong> recommend
              </div>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {Object.entries(data.summary.perDimension || {}).map(([k, v]) => v && (
                <span key={k} className="text-xs text-slate-500">{LABELS[k] ?? k}: <strong className="text-slate-700">{v.average.toFixed(1)}</strong></span>
              ))}
            </div>
          </div>

          {/* Raw reviews (anonymous) */}
          <div className="divide-y divide-slate-100 -mx-6">
            {data.reviews.map((r) => (
              <div key={r.id} className="px-6 py-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs text-slate-400">{r.program?.name ?? 'Program'} · {new Date(r.createdAt).toLocaleDateString()}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />{r.rating.toFixed(1)}
                  </span>
                </div>
                {r.reviewText && <p className="text-sm text-slate-700">{r.reviewText}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default MentorFeedbackAdminPanel;
