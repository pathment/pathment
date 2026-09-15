'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Star, Loader2, MessageSquareWarning } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { FeedbackAssist } from '@/components/mentor/FeedbackAssist';
import type { ApprovalItem, BulkReviewPayload } from '@/lib/hooks/mentor';

const BULK_TEMPLATES = [
  'Solid work across the board - meets the bar.',
  'Good effort. A couple of things to tighten before this is done.',
  'Please address the points below and resubmit.',
];

type Mode = 'approve' | 'changes';

/**
 * BulkReviewDrawer — apply ONE review decision (approve / request changes) to a
 * batch of selected submissions. Shares feedback text across all of them; on
 * approve it also carries a rating + a single points value (defaults to the
 * common maxPoints, noting when the selection has mixed maxima — the server
 * clamps each submission to its own max).
 */
export function BulkReviewDrawer({
  items,
  onClose,
  onReviewed,
  onSubmit,
}: {
  items: ApprovalItem[];
  onClose: () => void;
  onReviewed: (count: number) => void;
  onSubmit: (submissionIds: string[], payload: BulkReviewPayload) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>('approve');
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  // The selection may span tasks of different difficulty → different maxima.
  const maxima = useMemo(() => [...new Set(items.map((i) => i.maxPoints ?? 10))], [items]);
  const mixedMax = maxima.length > 1;
  const singleMax = mixedMax ? 0 : (maxima[0] ?? 10);

  // Editable points: an absolute value when all tasks share one max, or a
  // percentage of each task's own max when the selection is mixed.
  const [points, setPoints] = useState<number>(maxima[0] ?? 10);
  const [pointsPct, setPointsPct] = useState<number>(100);

  // How many distinct tasks the selection spans (peer-group key, title fallback).
  const taskCount = useMemo(
    () => new Set(items.map((i) => i.roadmapTaskId ?? i.title)).size,
    [items]
  );

  const count = items.length;

  const submit = async () => {
    if (mode === 'changes' && !feedback.trim()) {
      toast.error('Add feedback before requesting changes');
      return;
    }
    const isApprove = mode === 'approve';
    const payload: BulkReviewPayload = {
      decision: isApprove ? 'approved' : 'changes',
      feedbackText: feedback.trim() || (isApprove ? 'Approved.' : 'Changes requested.'),
      ...(isApprove
        ? { rating, ...(mixedMax ? { pointsPercent: pointsPct } : { pointsAwarded: points }) }
        : { revisionNotes: feedback.trim() }),
    };
    try {
      setBusy(true);
      await onSubmit(items.map((i) => i.submissionId), payload);
      onReviewed(count);
      onClose();
    } catch {
      toast.error('Bulk review failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Review ${count} submission${count === 1 ? '' : 's'}`}
      subtitle={taskCount > 1 ? `Across ${taskCount} tasks` : items[0]?.title}
      width="md"
      footer={
        <div className="flex w-full justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || (mode === 'changes' && !feedback.trim())}
            className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-colors ${
              mode === 'approve' ? 'bg-brand-600 hover:bg-brand-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'approve' ? (
              <Check className="w-4 h-4" />
            ) : (
              <MessageSquareWarning className="w-4 h-4" />
            )}
            {mode === 'approve' ? `Approve ${count}` : `Request changes on ${count}`}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {taskCount > 1 && (
          <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
            Applies the same feedback to {count} submission{count === 1 ? '' : 's'} across {taskCount} tasks.
          </p>
        )}

        {/* Decision — segmented control */}
        <div>
          <h3 className="text-sm font-medium text-slate-700 mb-2">Decision</h3>
          <div className="inline-flex rounded-xl border border-slate-200 p-1 bg-slate-50">
            {(['approve', 'changes'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  mode === m
                    ? m === 'approve'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m === 'approve' ? 'Approve' : 'Request changes'}
              </button>
            ))}
          </div>
        </div>

        {/* Rating + points (approve only) */}
        {mode === 'approve' && (
          <>
            <div>
              <h3 className="text-sm font-medium text-slate-700 mb-2">Quality rating</h3>
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Quality rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setRating(n)} className="p-0.5" aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={n === rating}>
                    <Star className={`w-6 h-6 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-slate-700">Points</h3>
                {!mixedMax
                  ? <button onClick={() => setPoints(singleMax)} className="text-xs font-medium text-brand-600 hover:text-brand-700">Full ({singleMax})</button>
                  : <button onClick={() => setPointsPct(100)} className="text-xs font-medium text-brand-600 hover:text-brand-700">Full (100%)</button>}
              </div>

              {!mixedMax ? (
                <>
                  <div className="flex items-center gap-3">
                    <input type="range" min={0} max={singleMax} value={points} onChange={(e) => setPoints(Number(e.target.value))} className="flex-1 accent-brand-600" />
                    <input type="number" min={0} max={singleMax} value={points}
                      onChange={(e) => setPoints(Math.max(0, Math.min(singleMax, Number(e.target.value) || 0)))}
                      className="w-16 bg-transparent border border-slate-200 text-slate-900 rounded-lg px-2 py-1 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    <span className="text-sm text-slate-400">/ {singleMax}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Awarded to every selected task. Defaults to full; lower it if the work fell short.</p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <input type="range" min={0} max={100} step={5} value={pointsPct} onChange={(e) => setPointsPct(Number(e.target.value))} className="flex-1 accent-brand-600" />
                    <span className="w-12 text-sm text-right tabular-nums text-slate-700">{pointsPct}%</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {pointsPct}% of each task&apos;s full points → {Math.round(Math.min(...maxima) * pointsPct / 100)}–{Math.round(Math.max(...maxima) * pointsPct / 100)} pts (clamped to each task&apos;s max).
                  </p>
                </>
              )}
            </div>
          </>
        )}

        {/* Shared feedback */}
        <div>
          <h3 className="text-sm font-medium text-slate-700 mb-2">
            Feedback {mode === 'changes' && <span className="text-rose-500">*</span>}
          </h3>
          <FeedbackAssist
            templates={BULK_TEMPLATES}
            getCurrentText={() => feedback}
            getDraftContext={() => ({
              // Use the shared task context (first item); count = the selection size, so the
              // draft is phrased for the group when reviewing more than one submission.
              taskTitle: taskCount > 1 ? `${taskCount} tasks` : (items[0]?.title ?? 'Submitted task'),
              brief: taskCount > 1 ? undefined : items[0]?.brief,
              criteria: taskCount > 1 ? undefined : items[0]?.criteria,
              decision: mode === 'approve' ? 'approved' : 'changes',
              count: items.length,
            })}
            onInsert={(t) => setFeedback((prev) => (prev.trim() ? `${prev}\n${t}` : t))}
            onApplyDraft={(t) => setFeedback((prev) => (prev.trim() ? `${prev}\n${t}` : t))}
          />
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            placeholder={mode === 'approve' ? 'Optional note sent to every mentee…' : 'What needs to change (required)…'}
            className="mt-2 w-full bg-transparent border border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
          <p className="mt-1 text-xs text-slate-400">
            This same note goes to all {count} selected mentee{count === 1 ? '' : 's'}.
          </p>
        </div>
      </div>
    </Drawer>
  );
}
