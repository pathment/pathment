'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, ChevronLeft, ChevronRight, Star, ExternalLink, Loader2, Clock, ShieldCheck } from 'lucide-react';
import { submissionService } from '@/lib/services/submissionService';
import { Drawer } from '@/components/shared/Drawer';
import { Avatar } from '@/components/shared/Avatar';
import { FeedbackAssist } from '@/components/mentor/FeedbackAssist';
import { looksLikeHtml } from '@/lib/utils/html';
import { toExternalHref } from '@/lib/utils/url';
import { RichContent } from '@/components/shared/RichContent';
import { SubmissionFileList } from '@/components/shared/SubmissionFileList';
import { VideoLinks, nonVideoLinks } from '@/components/shared/VideoPlayerModal';
import { DiscussionParticipation } from '@/components/mentor/discussions/DiscussionParticipation';
import { TaskProgressTimeline } from '@/components/shared/TaskProgressTimeline';
import type { ApprovalItem } from '@/lib/hooks/mentor';
import { groupDiscussionsApi } from '@/lib/services/group-discussions-api';
import { useApiQuery, qk } from '@/lib/query';

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

/** A suggested rating as words read it: "4", or "3.5" for a half. */
const starsText = (stars: number) => (Number.isInteger(stars) ? String(stars) : stars.toFixed(1));

// Shared look of the Back / Next buttons in the header (padding differs per side).
const STEP_BUTTON =
  'inline-flex items-center gap-0.5 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-700';

export function ReviewDrawer({
  item,
  onClose,
  onReviewed,
  readOnly = false,
  showMentee = false,
  next,
  prev,
}: {
  item: ApprovalItem;
  onClose: () => void;
  onReviewed: () => void;
  readOnly?: boolean;
  /** Show the mentee's photo beside the title (links to their profile). */
  showMentee?: boolean;
  /**
   * Step to the next submission in the caller's queue without closing. Pass it
   * only when there is more than one; `disabled` marks the last one.
   */
  next?: { onClick: () => void; disabled: boolean; position?: string };
  /** Step back to the previous submission; `disabled` marks the first one. */
  prev?: { onClick: () => void; disabled: boolean };
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

  // A group discussion's rating starts at the average of its feedback (the
  // stars on the participation section) and follows it as the mentor rates,
  // until the mentor picks a rating of their own.
  const isDiscussion = item.type === 'group_discussion';
  const [ratingTouched, setRatingTouched] = useState(false);
  const { data: participation } = useApiQuery({
    queryKey: qk.mentor.discussionParticipation(item.taskId),
    queryFn: () => groupDiscussionsApi.participation(item.taskId),
    enabled: isDiscussion,
  });
  const discussionStars = isDiscussion ? (participation?.rating?.stars ?? null) : null;
  useEffect(() => {
    // 0 is a real suggestion here (no feedback and no activity), so no floor of 1.
    if (discussionStars != null && !ratingTouched) setRating(Math.round(discussionStars));
  }, [discussionStars, ratingTouched]);

  // Stepping to another submission keeps the drawer open, so the form has to
  // start over — one mentee's ticks, points and notes must never carry across.
  const [formFor, setFormFor] = useState(item.submissionId);
  if (formFor !== item.submissionId) {
    setFormFor(item.submissionId);
    setChecked(new Set());
    setPoints(total - latePenalty);
    setRating(isLate ? 4 : 5);
    setRatingTouched(false);
    setNotes(isLate ? 'Submitted late — points and rating reduced accordingly.' : '');
  }
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.parentElement?.scrollTo({ top: 0 });
  }, [item.submissionId]);

  // → / ← step to the next / previous submission. Read through refs so the
  // listener is bound once per drawer rather than on every render.
  const nextRef = useRef(next);
  const prevRef = useRef(prev);
  const busyRef = useRef(busy);
  useEffect(() => {
    nextRef.current = next;
    prevRef.current = prev;
    busyRef.current = busy;
  });
  const hasStep = !!next || !!prev;
  useEffect(() => {
    if (!hasStep) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      // Arrow keys belong to text fields, the points slider and open menus.
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.closest('input, textarea, select, [role="slider"], [role="listbox"], [role="menu"]'))) return;
      // Only the top-most dialog reacts — never a sheet stacked above this one.
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== bodyRef.current?.closest('[role="dialog"]')) return;
      const step = e.key === 'ArrowRight' ? nextRef.current : prevRef.current;
      if (!step || step.disabled || busyRef.current) return;
      e.preventDefault();
      step.onClick();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hasStep]);

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
    if (readOnly) {
      toast.error('This clan is historical. Reviews are view-only.');
      return;
    }
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
      // With the mentee row below, the heading is just the task — the first
      // thing a mentor reads — and who it belongs to sits right under it.
      title={showMentee ? item.title : `Review · ${item.title}`}
      subtitle={showMentee ? undefined : `${item.mentee?.name ?? 'Mentee'} · v${item.version}`}
      width="lg"
      headerMeta={showMentee ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar
              name={item.mentee?.name}
              src={item.mentee?.profilePictureUrl}
              initials={item.mentee?.avatar}
              size="sm"
              href={item.mentee?.id ? `/mentor/mentees/${item.mentee.id}` : undefined}
              title={item.mentee?.name ? `View ${item.mentee.name}'s profile` : undefined}
            />
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {item.mentee?.id ? (
                <Link href={`/mentor/mentees/${item.mentee.id}`} className="truncate text-sm font-medium text-slate-800 hover:text-brand-700 hover:underline">
                  {item.mentee.name}
                </Link>
              ) : (
                <span className="truncate text-sm font-medium text-slate-800">{item.mentee?.name ?? 'Mentee'}</span>
              )}
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 tabular-nums dark:bg-slate-800">v{item.version}</span>
              {item.isLate && (
                <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950/30 dark:text-red-400">
                  <Clock className="h-3 w-3" aria-hidden="true" />Late
                </span>
              )}
            </div>
          </div>
          {(next || prev) && (
            <div className="flex shrink-0 items-center gap-2">
              {prev && (
                <button
                  onClick={prev.onClick}
                  disabled={prev.disabled || !!busy}
                  title={prev.disabled ? 'This is the first submission' : 'Previous submission (← Left arrow key)'}
                  aria-keyshortcuts="ArrowLeft"
                  className={`${STEP_BUTTON} pl-1.5 pr-2.5`}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />Back
                </button>
              )}
              {next?.position && <span className="hidden text-xs text-slate-400 tabular-nums sm:inline">{next.position}</span>}
              {next && (
                <button
                  onClick={next.onClick}
                  disabled={next.disabled || !!busy}
                  title={next.disabled ? 'This is the last submission to review' : 'Next submission (→ Right arrow key)'}
                  aria-keyshortcuts="ArrowRight"
                  className={`${STEP_BUTTON} pl-2.5 pr-1.5`}
                >
                  Next<ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>
      ) : undefined}
      footer={
        readOnly ? (
          <p className="w-full text-sm text-slate-500">This clan is completed — grading is unavailable.</p>
        ) : (
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
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-300 dark:border-amber-900/50 text-amber-700 dark:text-amber-400 text-sm font-medium disabled:opacity-50">
            {busy === 'changes' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Request changes
          </button>
          <button onClick={() => submit('rejected')} disabled={!!busy}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-card hover:bg-red-50 dark:hover:bg-red-950/30 border border-red-300 dark:border-red-900/50 text-red-700 dark:text-red-400 text-sm font-medium disabled:opacity-50">
            {busy === 'rejected' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Reject
          </button>
        </div>
        )
      }
    >
      <div ref={bodyRef} className="space-y-6">
        {/* A Group Discussion task is judged on how they took part: that, and the
            feedback that rates it, come before everything else. */}
        {isDiscussion && (
          <DiscussionParticipation
            taskId={item.taskId}
            menteeId={item.mentee?.id}
            menteeName={item.mentee?.name}
            canRate={!readOnly}
          />
        )}

        {item.isLate && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs"><Clock className="w-3 h-3" />Submitted late</span>
        )}

        {/* The task being reviewed */}
        {(item.brief || item.deliverable) && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            {item.brief && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-0.5">The task</p>
                {looksLikeHtml(item.brief)
                  ? <div className="prose prose-sm max-w-none dark:prose-invert text-slate-700" dangerouslySetInnerHTML={{ __html: item.brief }} />
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

        {/* How they got here, BEFORE the submission itself. Somebody who worked
            four days and produced something rough deserves a different review
            from somebody who started at 11pm the night it was due, and the
            mentor should see that before forming a judgement rather than after. */}
        <TaskProgressTimeline taskId={item.taskId} mode="mentor" />

        {/* Submission */}
        <div>
          <h3 className="text-sm font-medium text-slate-700 mb-2">Submission</h3>
          <RichContent
            html={item.submissionText}
            className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700"
          />
          {item.files.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-slate-500 mb-1.5">Attachments</p>
              <SubmissionFileList files={item.files} />
            </div>
          )}
          {item.submissionUrls.length > 0 && (
            <div className="mt-3">
              <VideoLinks urls={item.submissionUrls} />
            </div>
          )}
          {nonVideoLinks(item.submissionUrls).length > 0 && (
            <div className="mt-2 space-y-1">
              {nonVideoLinks(item.submissionUrls).map((u, i) => (
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
              <button key={n} onClick={() => { setRating(n); setRatingTouched(true); }} className="p-0.5" aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={n === rating}>
                <Star className={`w-6 h-6 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
              </button>
            ))}
          </div>
          {isDiscussion && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {discussionStars == null
                ? 'Give your feedback above and a rating is suggested from it. You can also pick one yourself.'
                : ratingTouched
                  ? <>
                    You picked <span className="font-semibold text-slate-700 dark:text-slate-300">{rating} out of 5</span>.
                    {' '}The suggested rating is {starsText(discussionStars)} out of 5.{' '}
                    <button type="button" onClick={() => { setRating(Math.round(discussionStars)); setRatingTouched(false); }} className="font-medium text-brand-600 hover:underline">Use the suggested rating</button>
                  </>
                  : <>
                    Suggested rating: <span className="font-semibold text-slate-700 dark:text-slate-300">{starsText(discussionStars)} out of 5</span>
                    {participation?.rating?.basis === 'both'
                      ? ', based on your feedback (70%) and their activity in the group (30%)'
                      : participation?.rating?.basis === 'activity'
                        ? ', based on their activity in the group only (no feedback yet)'
                        : ', based on your feedback'}.
                    {' '}Click a star to choose a different rating.
                  </>}
            </p>
          )}
        </div>

        {/* Points — full by default; the mentor can award less if work fell short. */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
              XP &amp; Coins awarded
              {isLate && latePenalty > 0 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-[11px] font-medium"><Clock className="w-3 h-3" />Late −{latePenalty}</span>
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
              className="w-20 bg-transparent border border-slate-300 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500"
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
              ? `Late submission — pre-set to ${total - latePenalty}/${total} (−${latePenalty}). Adjust if needed; can't exceed ${total}. Counts as XP & Coins.`
              : `Defaults to full (${total}). Lower if work fell short. Awarded once as XP (levels) and Coins (gifts).`}
          </p>
        </div>

        {/* Notes + feedback assist (AI draft, templates, saved snippets) */}
        <div>
          <h3 className="text-sm font-medium text-slate-700 mb-2">
            Notes to the mentee
            {isLate && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-rose-500 font-semibold">reason required</span>}
          </h3>
          <FeedbackAssist
            key={item.submissionId}
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
            className="mt-2 w-full bg-transparent border border-slate-300 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
        </div>
      </div>
    </Drawer>
  );
}

