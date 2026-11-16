'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, ChevronLeft, ChevronRight, Clock, Coins, ExternalLink, History, Loader2, RotateCcw, ShieldCheck, Star } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { Avatar } from '@/components/shared/Avatar';
import { RichContent } from '@/components/shared/RichContent';
import { SubmissionFileList } from '@/components/shared/SubmissionFileList';
import { useApiQuery } from '@/lib/query';
import { toExternalHref } from '@/lib/utils/url';
import { poolApi, type ReviewQueueItem } from '@/lib/services/pool-api';
import { pts } from './poolUi';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

const FEEDBACK_TEMPLATES = [
  'Solid work - meets the bar.',
  'Good effort. A couple of things to tighten.',
  'Nearly there - see the notes below.',
  'Please address the points below and resubmit.',
];

const RATING_WORDS: Record<number, string> = { 0: 'No credit', 1: 'Poor', 2: 'Below the bar', 3: 'Meets the bar', 4: 'Strong', 5: 'Outstanding' };
const ratingWord = (r: number) => RATING_WORDS[Math.floor(r)] ?? '';

// Same look as the mentor review drawer's Back / Next buttons.
const STEP_BUTTON =
  'inline-flex items-center gap-0.5 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-700';

/**
 * Five stars in half steps, plus an explicit 0. Nothing is picked to start
 * with: the rating is the number the pool score is built from, so it has to be
 * the reviewer's own choice, never a default.
 */
function HalfStarRating({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((n) => {
          const fill = shown >= n ? 'full' : shown >= n - 0.5 ? 'half' : 'empty';
          return (
            <span key={n} className="relative h-8 w-8">
              <Star className="absolute inset-0.5 h-7 w-7 text-slate-300" aria-hidden="true" />
              {fill !== 'empty' && (
                <span className="absolute inset-0 overflow-hidden" style={{ width: fill === 'half' ? '50%' : '100%' }}>
                  <Star className="absolute left-0.5 top-0.5 h-7 w-7 fill-amber-400 text-amber-400" aria-hidden="true" />
                </span>
              )}
              {[n - 0.5, n].map((v, i) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={value === v}
                  aria-label={`${v} out of 5`}
                  onClick={() => onChange(v)}
                  onMouseEnter={() => setHover(v)}
                  onFocus={() => setHover(v)}
                  onBlur={() => setHover(null)}
                  className={`absolute top-0 h-full w-1/2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${i === 0 ? 'left-0' : 'right-0'}`}
                />
              ))}
            </span>
          );
        })}
      </div>
      <button
        type="button"
        role="radio"
        aria-checked={value === 0}
        onClick={() => onChange(0)}
        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${value === 0 ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
      >
        0 · no credit
      </button>
      <span className="text-sm tabular-nums text-slate-600" aria-live="polite">
        {hover !== null || value !== null
          ? <><span className="font-semibold text-slate-900">{shown}</span>/5 · {ratingWord(shown)}</>
          : <span className="text-slate-400">Not rated yet</span>}
      </span>
    </div>
  );
}

export function ReviewDrawer({ poolId, item, onClose, onDone, onReviewed, next, prev }: {
  poolId: string;
  item: ReviewQueueItem;
  onClose: () => void;
  onDone: () => void;
  /**
   * Queue mode: where to go once this one is decided.
   *
   * Without it, deciding closes the drawer, which is right when you opened one
   * person's work on purpose. Clearing three hundred submissions that way is
   * three hundred round trips through a list, so the queue passes this and the
   * next submission simply takes the screen.
   */
  onReviewed?: () => void;
  next?: { onClick: () => void; disabled: boolean; position: string };
  prev?: { onClick: () => void; disabled: boolean };
}) {
  const { data, loading, error } = useApiQuery({ queryKey: ['pools', poolId, 'submission', item.submissionId], queryFn: () => poolApi.submission(poolId, item.submissionId) });
  const [rating, setRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [checked, setChecked] = useState<string[]>([]);
  const [busy, setBusy] = useState<'approved' | 'changes' | null>(null);
  // The detail answer is authoritative (it re-reads the pool); the queue row
  // carries the same number so the drawer is never blank while it loads.
  const worth = data?.task?.points ?? item.points ?? 0;
  const criteria: string[] = data?.task?.acceptanceCriteria || [];

  // Stepping to another submission keeps the drawer open: start the form over,
  // so one candidate's rating and notes never carry across to the next.
  const [formFor, setFormFor] = useState(item.submissionId);
  if (formFor !== item.submissionId) {
    setFormFor(item.submissionId);
    setRating(null);
    setFeedback('');
    setChecked([]);
  }
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.parentElement?.scrollTo({ top: 0 }); }, [item.submissionId]);

  /**
   * Hands stay on the keyboard.
   *
   * Rating then deciding is two clicks across opposite corners of the screen,
   * and in a round of four hundred that is the whole job. Typing is left
   * alone: the shortcuts only fire when the focus is not in a field, so
   * writing "approve the rest" in the feedback box does not approve anything.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key >= '1' && e.key <= '5') { setRating(Number(e.key)); e.preventDefault(); return; }
      const k = e.key.toLowerCase();
      if (k === 'a') { e.preventDefault(); void send('approved'); }
      else if (k === 'r') { e.preventDefault(); void send('changes'); }
      else if ((k === 'n' || e.key === 'ArrowRight') && next && !next.disabled) { e.preventDefault(); next.onClick(); }
      else if ((k === 'p' || e.key === 'ArrowLeft') && prev && !prev.disabled) { e.preventDefault(); prev.onClick(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const versions = data?.versions || [];
  const current = versions.find((v) => v.id === item.submissionId) || versions[0];
  const earlier = versions.filter((v) => v !== current);
  const addTemplate = (t: string) => setFeedback((p) => (p.trim() ? `${p}\n${t}` : t));

  const send = async (decision: 'approved' | 'changes') => {
    if (rating === null) return toast.error('Give a rating. It is what the score is built from');
    if (decision === 'changes' && !feedback.trim()) return toast.error('Say what needs to change');
    setBusy(decision);
    try {
      await poolApi.review(poolId, item.submissionId, { rating, decision, feedbackText: feedback.trim(), checkedCriteria: checked });
      toast.success(decision === 'approved' ? 'Approved' : 'Changes requested');
      onDone();
      if (onReviewed) onReviewed(); else onClose();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save the review'));
    } finally {
      setBusy(null);
    }
  };

  const who = item.member.name || item.member.email;
  return (
    <Drawer
      open
      onClose={onClose}
      title={item.title}
      width="lg"
      headerMeta={(
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar name={who} src={item.member.avatarUrl} size="sm" />
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-sm font-medium text-slate-800">{who}</span>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium capitalize text-slate-500 dark:bg-slate-800">{item.kind}</span>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-slate-500 dark:bg-slate-800">v{item.version}</span>
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
                <button onClick={prev.onClick} disabled={prev.disabled || !!busy} className={`${STEP_BUTTON} pl-1.5 pr-2.5`}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />Back
                </button>
              )}
              {next && <span className="hidden text-xs tabular-nums text-slate-400 sm:inline">{next.position}</span>}
              {next && (
                <button onClick={next.onClick} disabled={next.disabled || !!busy} className={`${STEP_BUTTON} pl-2.5 pr-1.5`}>
                  Next<ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <button onClick={() => send('changes')} disabled={!!busy || !data}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400">
            {busy === 'changes' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}Request changes
          </button>
          <button onClick={() => send('approved')} disabled={!!busy || !data || rating === null} title={rating === null ? 'Give a rating first' : undefined}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {busy === 'approved' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Approve{rating !== null ? ` · ${rating}/5` : ''}
          </button>
        </div>
      }
    >
      <div ref={bodyRef} className="space-y-6">
        {loading && <Loader2 className="h-5 w-5 animate-spin text-brand-600" />}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {data && (
          <>
            {/* What was asked, and what it counts towards. */}
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              {data.task?.description && (
                <div>
                  <p className="mb-0.5 text-xs font-medium text-slate-500">The task</p>
                  <RichContent html={data.task.description} className="text-slate-700" />
                </div>
              )}
              {data.task?.deliverable && (
                <div>
                  <p className="mb-0.5 text-xs font-medium text-slate-500">Asked for</p>
                  <p className="text-sm text-slate-700">{data.task.deliverable}</p>
                </div>
              )}
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                {worth > 0
                  ? <>Worth up to <span className="font-medium text-slate-700">{pts(worth)}</span> of this candidate&apos;s score{item.required === false ? ', and optional' : ''}</>
                  : 'Worth no points, so this one is practice'}
              </p>
            </div>

            {item.kind !== 'task' && (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
                This is a {item.kind}. Below is what was handed in; your rating becomes its score.
              </p>
            )}

            {/* The submission under review. */}
            {current && (
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium text-slate-700">Submission</h3>
                  <span className="text-xs text-slate-400">Version {current.version} · {new Date(current.submittedAt).toLocaleString()}</span>
                </div>
                <RichContent html={current.submissionText} emptyText="No written answer." className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700" />
                {current.files.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-xs font-medium text-slate-500">Attachments</p>
                    <SubmissionFileList files={current.files} />
                  </div>
                )}
                {(current.submissionUrls || []).length > 0 && (
                  <div className="mt-2 space-y-1">
                    {(current.submissionUrls || []).map((u) => (
                      <a key={u} href={toExternalHref(u)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 break-all text-sm text-brand-600 hover:text-brand-700">
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />{u}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Earlier attempts, folded away, with what was said about them. */}
            {earlier.length > 0 && (
              <details className="group rounded-xl border border-slate-200">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-slate-700">
                  <span className="inline-flex items-center gap-1.5"><History className="h-4 w-4 text-slate-400" />Earlier versions ({earlier.length})</span>
                  <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-90" />
                </summary>
                <div className="space-y-3 border-t border-slate-200 p-4">
                  {earlier.map((v) => (
                    <div key={v.id} className="space-y-2">
                      <p className="text-xs text-slate-400">Version {v.version} · {new Date(v.submittedAt).toLocaleString()}</p>
                      <RichContent html={v.submissionText} emptyText="No written answer." className="text-sm text-slate-600" />
                      {(v.submissionUrls || []).map((u) => (
                        <a key={u} href={toExternalHref(u)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 break-all text-xs text-brand-600"><ExternalLink className="h-3 w-3 shrink-0" />{u}</a>
                      ))}
                      {(v.feedback || []).map((f) => (
                        <p key={f.id} className={`rounded-lg px-3 py-1.5 text-xs ${f.isApproved ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                          {f.isApproved ? 'Approved' : 'Changes requested'}{f.rating != null ? ` · ${f.rating}/5` : ''}{f.feedbackText ? `: ${f.feedbackText}` : ''}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {criteria.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-sm font-medium text-slate-700"><ShieldCheck className="h-4 w-4 text-brand-500" />What passes</h3>
                  <span className="text-xs tabular-nums text-slate-400">{checked.length}/{criteria.length}</span>
                </div>
                <div className="space-y-1">
                  {criteria.map((c) => (
                    <label key={c} className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={checked.includes(c)}
                        onChange={(e) => setChecked((p) => (e.target.checked ? [...p, c] : p.filter((x) => x !== c)))}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-sm text-slate-700">{c}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-700">Rating <span className="text-red-500">*</span></h3>
              <HalfStarRating value={rating} onChange={setRating} />
              <p className="mt-1.5 text-xs text-slate-400">
                {rating !== null
                  ? worth > 0
                    ? <>Earns <span className="font-medium text-slate-600">{pts(Math.round((worth * rating / 5) * 100) / 100)}</span> of the {pts(worth)} this work is worth.</>
                    : <>This work is worth no points, so the rating is feedback only.</>
                  : worth > 0
                    ? `Five stars earns all ${pts(worth)}; three earns three fifths. Half stars allowed.`
                    : 'This work is worth no points, so the rating is feedback only.'}
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-700">Feedback for the candidate</h3>
              <div className="flex flex-wrap gap-1.5">
                {FEEDBACK_TEMPLATES.map((t) => (
                  <button key={t} type="button" onClick={() => addTemplate(t)} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-brand-300 hover:text-brand-700">
                    {t}
                  </button>
                ))}
              </div>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={4}
                placeholder="What's good, what to change… (required to request changes)"
                className="mt-2 w-full resize-none rounded-xl border border-slate-300 bg-transparent p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
