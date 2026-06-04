'use client';

import { useEffect, useState } from 'react';
import { Loader2, MessageSquareHeart, Lock, Quote, ThumbsUp } from 'lucide-react';
import { programReviewApi } from '@/lib/services/program-review-api';

interface PerDimension { average: number; responses: number }
interface Summary {
  revealed: boolean;
  total: number;
  minResponses?: number;
  overall?: number;
  perDimension?: Record<string, PerDimension | null>;
  recommendRate?: number | null;
  quotes?: string[];
  dimensions: string[];
}

const LABELS: Record<string, string> = {
  responsiveness: 'Responsiveness',
  helpfulness: 'Helpfulness',
  clarity: 'Clarity',
  support: 'Support',
};

/**
 * The mentor's own anonymous feedback, shown only once enough mentees have
 * responded (server-gated) so no single voice is identifiable. Aggregates are
 * trimmed-mean to soften outliers — protecting the mentor from one bad day.
 */
export function MentorFeedbackCard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    programReviewApi
      .getMySummary()
      .then((res: any) => {
        if (cancelled) return;
        const data = res?.data?.summary ?? res?.summary ?? res?.data ?? res;
        setSummary(data);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!summary) return null;

  const header = (
    <div className="flex items-center gap-2 mb-4">
      <MessageSquareHeart className="w-5 h-5 text-indigo-600" />
      <h2 className="text-slate-900">Your mentee feedback</h2>
    </div>
  );

  // Not enough responses yet — keep it private.
  if (!summary.revealed) {
    const need = (summary.minResponses ?? 3) - (summary.total ?? 0);
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        {header}
        <div className="flex items-start gap-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-sm text-slate-600">
            Feedback stays hidden until at least {summary.minResponses ?? 3} mentees have responded, so
            it&apos;s always anonymous. {summary.total > 0 ? `${need} more to go.` : 'None yet.'}
          </p>
        </div>
      </div>
    );
  }

  const dims = summary.dimensions || Object.keys(summary.perDimension || {});

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      {header}

      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 mb-5">
        <div>
          <p className="text-3xl font-semibold text-slate-900 leading-none">
            {summary.overall?.toFixed(1) ?? '—'}
            <span className="text-base font-normal text-slate-400"> / 5</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">Overall · {summary.total} responses</p>
        </div>
        {typeof summary.recommendRate === 'number' && (
          <div className="flex items-center gap-1.5">
            <ThumbsUp className="w-4 h-4 text-emerald-500" />
            <span className="text-sm text-slate-700"><strong>{summary.recommendRate}%</strong> would recommend</span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {dims.map((key) => {
          const d = summary.perDimension?.[key];
          const pct = d ? (d.average / 5) * 100 : 0;
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="w-28 text-sm text-slate-600 shrink-0">{LABELS[key] ?? key}</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-10 text-right text-sm text-slate-500 shrink-0">{d ? d.average.toFixed(1) : '—'}</span>
            </div>
          );
        })}
      </div>

      {summary.quotes && summary.quotes.length > 0 && (
        <div className="mt-5 pt-5 border-t border-slate-100 space-y-3">
          {summary.quotes.map((q, i) => (
            <div key={i} className="flex items-start gap-2">
              <Quote className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-600 italic">{q}</p>
            </div>
          ))}
          <p className="text-xs text-slate-400">Anonymous · most recent first</p>
        </div>
      )}
    </div>
  );
}

export default MentorFeedbackCard;
