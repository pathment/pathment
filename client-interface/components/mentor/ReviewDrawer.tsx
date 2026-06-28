'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Star, ExternalLink, Loader2, Clock, ShieldCheck } from 'lucide-react';
import { submissionService } from '@/lib/services/submissionService';
import { Drawer } from '@/components/shared/Drawer';
import { FeedbackAssist } from '@/components/mentor/FeedbackAssist';
import { looksLikeHtml } from '@/lib/utils/html';
import { toExternalHref } from '@/lib/utils/url';
import { RichContent } from '@/components/shared/RichContent';
import type { ApprovalItem } from '@/lib/hooks/mentor';

type Decision = 'approved' | 'approved_notes' | 'changes' | 'rejected';

const FEEDBACK_TEMPLATES = [
  'Solid work - meets the bar.',
  'Good effort. A couple of things to tighten before this is done.',
  'Nearly there - see the notes below.',
  'Please address the points below and resubmit.',
];

// Default penalty for a LATE submission: knock 20% off the points and drop the
// quality rating to 4/5. The mentor can override both, but must give a reason.
const LATE_PENALTY_PCT = 0.2;

export function ReviewDrawer({
  item,
  onClose,
  onReviewed,
}: {
  item: ApprovalItem;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // `total` is the task's max (set by difficulty). A late task is pre-penalized:
  // points drop by LATE_PENALTY_PCT and the rating defaults to 4 (vs 5 on time).
  // The mentor can change either, but a late approval requires a reason note.
  const total = Math.max(0, item.maxPoints ?? 10);
  const isLate = !!item.isLate;
  const latePenalty = isLate ? Math.min(total, Math.round(total * LATE_PENALTY_PCT)) : 0;
  const [points, setPoints] = useState(total - latePenalty);
  const [rating, setRating] = useState(isLate ? 4 : 5);
  const [notes, setNotes] = useState(isLate ? 'Submitted late — points and rating reduced accordingly.' : '');
  const [busy, setBusy] = useState<Decision | null>(null);

  // Split criteria into hard gates (~60%) + soft checks (the rest), like the
  // prototype: Approve is blocked until every REQUIRED criterion is ticked.
  const { required, optional } = useMemo(() => {
    const n = Math.ceil(item.criteria.length * 0.6);
    return { required: item.criteria.slice(0, n), optional: item.criteria.slice(n) };
  }, [item.criteria]);
  const allRequiredTicked = useMemo(() => required.every((c) => checked.has(c)), [required, checked]);

  const toggle = (c: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });

  const addTemplate = (t: string) => setNotes((prev) => (prev ? `${prev}\n${t}` : t));

  const submit = async (decision: Decision) => {
    if ((decision === 'approved_notes' || decision === 'changes' || decision === 'rejected') && !notes.trim()) {
      toast.error('Add a short note for this decision');
      return;
    }
    if ((decision === 'approved' || decision === 'approved_notes') && !allRequiredTicked) {
      toast.error('Tick the required criteria before approving');
      return;
    }
    // Late submissions are penalized by default — make the mentor justify it
    // (whether they keep the penalty, soften it, or waive it).
    if ((decision === 'approved' || decision === 'approved_notes') && isLate && !notes.trim()) {
      toast.error('This task was late — add a brief reason for the points/rating.');
      return;
    }
    const isApproved = decision === 'approved' || decision === 'approved_notes';
    try {
      setBusy(decision);
      await submissionService.reviewSubmission(item.submissionId, {
        rating,
        feedbackText: notes.trim() || (isApproved ? 'Approved.' : 'Changes requested.'),
        isApproved,
        revisionNotes: isApproved ? undefined : notes.trim(),
        decision,
        checkedCriteria: [...checked],
        // Mentor-awarded points (capped server-side at the task's max). Only
        // applied when the task is approved.
        pointsAwarded: points,
      });
      toast.success(isApproved ? 'Approved' : decision === 'changes' ? 'Changes requested' : 'Rejected');
      onReviewed();
      onClose();
    } catch {
      toast.error('Could not submit the review');
    } finally {
      setBusy(null);
    }
  };

  const Criterion = ({ c, required: req }: { c: string; required?: boolean }) => (
    <label className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
      <input type="checkbox" checked={checked.has(c)} onChange={() => toggle(c)}
        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
      <span className="text-sm text-slate-700">{c}{req && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-rose-500 font-semibold">required</span>}</span>
    </label>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Review · ${item.title}`}
      subtitle={`${item.mentee?.name ?? 'Mentee'} · v${item.version}`}
      width="lg"
      footer={
        <div className="grid grid-cols-2 gap-2 w-full">
          <button onClick={() => submit('approved')} disabled={!!busy || !allRequiredTicked} title={!allRequiredTicked ? 'Tick the required criteria first' : undefined}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">
            {busy === 'approved' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Approve
          </button>
          <button onClick={() => submit('approved_notes')} disabled={!!busy || !allRequiredTicked}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-50 dark:bg-brand-500/15 hover:bg-brand-100 border border-brand-300 dark:border-brand-500/30 text-brand-700 dark:text-brand-300 text-sm font-medium disabled:opacity-50">
            {busy === 'approved_notes' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Approve w/ notes
          </button>
          <button onClick={() => submit('changes')} disabled={!!busy}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-700 text-sm font-medium disabled:opacity-50">
            {busy === 'changes' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Request changes
          </button>
          <button onClick={() => submit('rejected')} disabled={!!busy}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-card hover:bg-red-50 border border-red-300 text-red-700 text-sm font-medium disabled:opacity-50">
            {busy === 'rejected' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Reject
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {item.isLate && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs"><Clock className="w-3 h-3" />Submitted late</span>
        )}

        {/* The task being reviewed */}
        {(item.brief || item.deliverable) && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            {item.brief && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-0.5">The task</p>
                {looksLikeHtml(item.brief)
                  ? <div className="prose prose-sm max-w-none dark:prose-invert text-slate-700 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: item.brief }} />
                  : <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.brief}</p>}
              </div>
            )}
            {item.deliverable && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-0.5">Deliverable</p>
                <p className="text-sm text-slate-700">{item.deliverable}</p>
              </div>
            )}
          </div>
        )}

        {/* Submission */}
        <div>
          <h3 className="text-sm font-medium text-slate-700 mb-2">Submission</h3>
          <RichContent
            html={item.submissionText}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-slate-700 dark:text-slate-300"
          />
          {item.submissionUrls.length > 0 && (
            <div className="mt-2 space-y-1">
              {item.submissionUrls.map((u, i) => (
                <a key={i} href={toExternalHref(u)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 break-all">
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />{u}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Acceptance checklist - required gates approval */}
        {item.criteria.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-brand-500" />What passes</h3>
              <span className="text-xs text-slate-400">{checked.size}/{item.criteria.length}</span>
            </div>
            {required.length > 0 && (
              <div className="space-y-1">
                {required.map((c) => <Criterion key={c} c={c} required />)}
              </div>
            )}
            {optional.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 px-2">Nice to have</p>
                {optional.map((c) => <Criterion key={c} c={c} />)}
              </div>
            )}
            {!allRequiredTicked && (
              <p className="mt-1.5 text-xs text-amber-600">Tick all required criteria to enable Approve.</p>
            )}
          </div>
        )}

        {/* Rating */}
        <div>
          <h3 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
            Quality rating
            {isLate && <span className="text-[11px] font-normal text-red-600">defaulted to 4/5 (late)</span>}
          </h3>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Quality rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} className="p-0.5" aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={n === rating}>
                <Star className={`w-6 h-6 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Points — full by default; the mentor can award less if work fell short. */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
              Points awarded
              {isLate && latePenalty > 0 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 text-[11px] font-medium"><Clock className="w-3 h-3" />Late −{latePenalty}</span>
              )}
            </h3>
            {points !== total && (
              <button type="button" onClick={() => setPoints(total)} className="text-xs font-medium text-brand-600 hover:text-brand-700">Award full</button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              max={total}
              value={points}
              onChange={(e) => {
                const v = Math.round(Number(e.target.value));
                setPoints(Number.isFinite(v) ? Math.max(0, Math.min(total, v)) : 0);
              }}
              className="w-20 border border-slate-300 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500"
              aria-label="Points awarded"
            />
            <span className="text-sm text-slate-500 tabular-nums">/ {total} pts</span>
            {total > 0 && (
              <input
                type="range"
                min={0}
                max={total}
                step={1}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                className="flex-1 accent-brand-600"
                aria-label="Points awarded slider"
              />
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {isLate
              ? `Late submission — pre-set to ${total - latePenalty}/${total} (−${latePenalty}). Adjust if needed; can't exceed ${total}.`
              : `Defaults to full (${total}). Lower it if the work fell short — e.g. ${Math.max(0, total - 2)}/${total}. Can't exceed ${total}.`}
          </p>
        </div>

        {/* Notes + feedback assist (AI draft, templates, saved snippets) */}
        <div>
          <h3 className="text-sm font-medium text-slate-700 mb-2">
            Notes to the mentee
            {isLate && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-rose-500 font-semibold">reason required</span>}
          </h3>
          <FeedbackAssist
            templates={FEEDBACK_TEMPLATES}
            getCurrentText={() => notes}
            getDraftContext={() => ({
              taskTitle: item.title,
              brief: item.brief,
              criteria: item.criteria,
              // The draft tone follows the likely decision: all required ticked → approving, else changes.
              decision: allRequiredTicked ? 'approved' : 'changes',
              count: 1,
            })}
            onInsert={(t) => addTemplate(t)}
            // Replace when empty, otherwise append on its own line.
            onApplyDraft={(t) => setNotes((prev) => (prev.trim() ? `${prev}\n${t}` : t))}
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="What's good, what to change…"
            className="mt-2 w-full border border-slate-300 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
        </div>
      </div>
    </Drawer>
  );
}
