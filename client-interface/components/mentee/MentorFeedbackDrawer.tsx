'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Star, ThumbsDown, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import { Drawer } from '@/components/shared/Drawer';
import { programReviewApi, type ReviewDimensions } from '@/lib/services/program-review-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

interface Props {
  open: boolean;
  enrollmentId: string | null;
  programName: string;
  onClose: () => void;
  onSubmitted?: (enrollmentId: string) => void;
}

const DIMENSIONS: { key: keyof ReviewDimensions; label: string; hint: string }[] = [
  { key: 'responsiveness', label: 'Responsiveness', hint: 'Replied and showed up when you needed them' },
  { key: 'helpfulness', label: 'Helpfulness', hint: 'Unblocked you and pushed your work forward' },
  { key: 'clarity', label: 'Clarity', hint: 'Explained things in a way that made sense' },
  { key: 'support', label: 'Support', hint: 'Was encouraging and invested in your growth' },
];

/**
 * Anonymous, structured mentee→mentor feedback collected at program completion.
 * Per-dimension 1–5 stars + optional note + a would-recommend toggle. The copy
 * makes the anonymity promise explicit so mentees answer honestly.
 */
export function MentorFeedbackDrawer({ open, enrollmentId, programName, onClose, onSubmitted }: Props) {
  const [scores, setScores] = useState<ReviewDimensions>({});
  const [reviewText, setReviewText] = useState('');
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);

  // Load any existing review when the drawer opens (lets them edit it).
  useEffect(() => {
    if (!open || !enrollmentId) return;
    let cancelled = false;
    setLoading(true);
    setScores({});
    setReviewText('');
    setWouldRecommend(null);
    setAlreadyReviewed(false);
    programReviewApi
      .getMyReview(enrollmentId)
      .then((res: any) => {
        if (cancelled) return;
        const data = res?.data ?? res;
        if (data?.review) {
          setScores(data.review.dimensions || {});
          setReviewText(data.review.reviewText || '');
          setWouldRecommend(typeof data.review.wouldRecommend === 'boolean' ? data.review.wouldRecommend : null);
          setAlreadyReviewed(Boolean(data.hasReviewed));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, enrollmentId]);

  const setScore = (key: keyof ReviewDimensions, value: number) =>
    setScores((prev) => ({ ...prev, [key]: prev[key] === value ? undefined : value }));

  const ratedCount = DIMENSIONS.filter((d) => scores[d.key]).length;
  const canSubmit = ratedCount > 0 && !submitting;

  const handleSubmit = async () => {
    if (!enrollmentId || !canSubmit) return;
    try {
      setSubmitting(true);
      await programReviewApi.submit(enrollmentId, {
        dimensions: scores,
        reviewText: reviewText.trim() || undefined,
        wouldRecommend,
      });
      toast.success('Thank you — your feedback is anonymous and helps the next mentee.');
      onSubmitted?.(enrollmentId);
      onClose();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not submit your feedback'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="How was your mentorship?"
      subtitle={programName}
      width="md"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Maybe later
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {alreadyReviewed ? 'Update feedback' : 'Submit feedback'}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-3">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-800">
              Your feedback is <strong>anonymous</strong>. Mentors only ever see combined averages
              across several mentees — never who said what.
            </p>
          </div>

          <div className="space-y-5">
            {DIMENSIONS.map((d) => (
              <div key={d.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{d.label}</p>
                  {scores[d.key] && <span className="text-xs text-slate-400">{scores[d.key]}/5</span>}
                </div>
                <p className="text-xs text-slate-500 mb-1.5">{d.hint}</p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setScore(d.key, n)}
                      aria-label={`${d.label}: ${n} of 5`}
                      className="p-1 rounded-lg hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors"
                    >
                      <Star
                        className={`w-6 h-6 ${
                          (scores[d.key] ?? 0) >= n ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div>
            <p className="text-sm font-medium text-slate-900 mb-2">
              Would you recommend this mentor? <span className="text-slate-400 font-normal">(optional)</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWouldRecommend((v) => (v === true ? null : true))}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors ${
                  wouldRecommend === true
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ThumbsUp className="w-4 h-4" /> Yes
              </button>
              <button
                type="button"
                onClick={() => setWouldRecommend((v) => (v === false ? null : false))}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors ${
                  wouldRecommend === false
                    ? 'bg-rose-50 border-rose-300 text-rose-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ThumbsDown className="w-4 h-4" /> Not really
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1.5">
              Anything else? <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="What worked well, what could be better…"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>
      )}
    </Drawer>
  );
}

export default MentorFeedbackDrawer;
