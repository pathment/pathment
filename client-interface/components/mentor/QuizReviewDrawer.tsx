'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Loader2, CheckCircle2, XCircle, Check, X, ListChecks, Type, ToggleLeft, MessageSquare, Video, Eye, AlertTriangle, Code2,
} from 'lucide-react';
import { CodeEditor } from '@/components/shared/CodeEditor';
import { Drawer } from '@/components/shared/Drawer';
import { quizApi, type QuizReview, type QuizReviewItem } from '@/lib/services/quiz-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { Avatar } from '@/components/shared/Avatar';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { ProctorSummary, SnapshotStrip } from '@/components/proctoring/ProctorSummary';

const KIND_ICON = {
  single: ListChecks,
  multi: ListChecks,
  boolean: ToggleLeft,
  short: Type,
  video: Video,
  code: Code2,
} as const;

const KIND_LABEL: Record<string, string> = {
  single: 'Single choice',
  multi: 'Multiple choice',
  boolean: 'True / false',
  short: 'Short answer',
  video: 'Video answer',
  code: 'Code',
};

/** Kinds the mentor scores by hand. */
const MENTOR_GRADED = new Set(['video', 'code']);
/** Is there something for the mentor to score? (a recording, or code) */
const gaveAnswer = (it: QuizReviewItem) =>
  it.kind === 'video' ? !!it.answer?.videoUrl : !!(it.answer?.answerText || '').trim();

/**
 * QuizReviewDrawer — the mentor's review of an already auto-graded quiz assigned
 * in "review" (evaluation) mode. The autograder has proposed per-question points;
 * the mentor confirms or adjusts each one (optionally with a note) and finalizes,
 * which posts the score through the normal points/completion path. Also serves the
 * owning mentee read-only (canReview=false) — graded results without editable inputs.
 */
export function QuizReviewDrawer({
  taskId,
  onClose,
  onReviewed,
  readOnly = false,
}: {
  taskId: string;
  onClose: () => void;
  onReviewed?: () => void;
  readOnly?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState<QuizReview | null>(null);
  const [scores, setScores] = useState<Record<string, { points: string; note: string }>>({});
  const [overallNote, setOverallNote] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const [deletingSnaps, setDeletingSnaps] = useState(false);
  const confirm = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    quizApi.getReview(taskId)
      .then((res: any) => {
        const r: QuizReview = res?.data;
        setReview(r);
        const seed: Record<string, { points: string; note: string }> = {};
        r.items.forEach((it) => {
          const awarded = it.answer?.pointsAwarded ?? it.answer?.autoPoints;
          seed[it.questionId] = {
            points: awarded != null ? String(awarded) : '',
            note: it.answer?.scoreNote || '',
          };
        });
        setScores(seed);
      })
      .catch((e: any) => { toast.error(extractApiErrorMessage(e, 'Could not load the quiz')); onClose(); })
      .finally(() => setLoading(false));
  }, [taskId, onClose]);

  useEffect(() => { load(); }, [load]);

  const canReview = !!review?.canReview && !readOnly;

  const saveScore = async (it: QuizReviewItem, patch: { points?: string; note?: string }) => {
    const cur = scores[it.questionId] || { points: '', note: '' };
    const next = { ...cur, ...patch };
    // Clamp to the question's max so the running total (and the input itself)
    // can never exceed what the question is worth — no more 105/15 (700%).
    if (patch.points !== undefined && patch.points !== '') {
      next.points = String(Math.max(0, Math.min(it.points, Number(patch.points) || 0)));
    }
    setScores((s) => ({ ...s, [it.questionId]: next }));
    if (!canReview) return;
    const pts = next.points === '' ? undefined : Math.max(0, Math.min(it.points, Number(next.points) || 0));
    try {
      await quizApi.gradeAnswer(taskId, it.questionId, { pointsAwarded: pts, scoreNote: next.note || null });
    } catch { /* best-effort autosave; finalize re-reads */ }
  };

  const finalize = async () => {
    if (finalizing) return;
    setFinalizing(true);
    try {
      const res: any = await quizApi.finalizeReview(taskId, overallNote || undefined);
      toast.success(`Quiz graded — ${res?.data?.scorePercent ?? res?.data?.pointsPercent ?? ''}%`);
      onReviewed?.();
      onClose();
    } catch (e: any) {
      toast.error(extractApiErrorMessage(e, 'Could not finalize the review'));
    } finally {
      setFinalizing(false);
    }
  };

  const deleteSnaps = async () => {
    const ok = await confirm({
      title: 'Delete proctoring images?',
      description: 'This permanently removes every webcam and screen snapshot for this quiz. Behaviour flags (tab switches, fullscreen exits, etc.) are kept.',
      confirmLabel: 'Delete images',
      variant: 'danger',
    });
    if (!ok) return;
    setDeletingSnaps(true);
    try {
      await quizApi.deleteSnapshots(taskId);
      toast.success('Images deleted');
      load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not delete the images'));
    } finally {
      setDeletingSnaps(false);
    }
  };

  // Video and code answers are the mentor's to score: finishing waits for every one.
  const unscoredVideos = review?.items.filter((it) => MENTOR_GRADED.has(it.kind) && gaveAnswer(it) && (scores[it.questionId]?.points ?? '') === '').length ?? 0;

  const session = review?.session ?? null;
  const totalAwarded = review?.items.reduce((s, it) => s + (Number(scores[it.questionId]?.points) || 0), 0) ?? 0;
  const totalPossible = review?.totals.totalPossible ?? 0;
  const livePercent = totalPossible > 0 ? Math.round((totalAwarded / totalPossible) * 100) : 0;

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={review?.kit.title ? `Quiz · ${review.kit.title}` : 'Quiz review'}
      subtitle={session?.mentee ? `${session.mentee.name} · attempt ${session.attemptNumber}` : undefined}
      footer={canReview ? (
        <>
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Close</button>
          <button onClick={finalize} disabled={finalizing || unscoredVideos > 0}
            title={unscoredVideos ? `Score the ${unscoredVideos === 1 ? 'video or code answer' : `${unscoredVideos} video and code answers`} first` : undefined}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {finalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Finalize · {totalAwarded}/{totalPossible} pts ({livePercent}%)
          </button>
        </>
      ) : (
        <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Close</button>
      )}
    >
      {loading || !review ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
      ) : (
        <div className="space-y-5">
          {/* Mentee + score summary */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
            {session?.mentee && (
              <div className="flex items-center gap-2.5">
                <Avatar name={session.mentee.name} src={session.mentee.avatarUrl} size="sm" />
                <div className="text-sm">
                  <div className="font-medium text-slate-900">{session.mentee.name}</div>
                  <div className="text-[11px] text-slate-500">
                    Attempt {session.attemptNumber}
                    {session.submittedAt && <span> · submitted {new Date(session.submittedAt).toLocaleString()}</span>}
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-2xl font-semibold text-slate-900 tabular-nums">
                  {livePercent}<span className="text-slate-400 text-lg">%</span>
                </div>
                <div className="text-[11px] text-slate-500">score</div>
              </div>
              <div className="text-sm text-slate-600">
                <div className="tabular-nums">
                  {totalAwarded}<span className="text-slate-400"> / {totalPossible} pts</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {review.totals.questionCount} question{review.totals.questionCount === 1 ? '' : 's'} · {review.items.some((it) => MENTOR_GRADED.has(it.kind)) ? 'video & code scored by you' : 'Auto-graded'}
                </div>
              </div>
              {session?.passed != null && (
                <span className={`ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${session.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {session.passed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {session.passed ? 'Passed' : 'Not passed'}
                </span>
              )}
              {review.task.status === 'completed' && (
                <span className="ml-auto text-emerald-600 font-medium text-sm">Graded</span>
              )}
            </div>
            {canReview && (
              <p className="text-[11px] text-slate-400">
                {unscoredVideos > 0
                  ? `Score the ${unscoredVideos === 1 ? 'video or code answer' : `${unscoredVideos} video and code answers`}; the rest was auto-graded. Then finalize to post the score.`
                  : 'This quiz was auto-graded. Confirm or adjust the points below, then finalize to post the score.'}
              </p>
            )}
          </div>

          {/* Proctoring (reviewer-only; the server sends nothing for the mentee) */}
          {review.proctor && (review.options.proctored || review.proctor.snapshots.length > 0 || Object.keys(review.proctor.flagCounts).length > 0) && (
            <ProctorSummary
              proctor={review.proctor}
              screenRequired={review.options.screenShareRequired}
              submitted={session?.status === 'submitted'}
              canDelete={canReview}
              deleting={deletingSnaps}
              onDelete={deleteSnaps}
            />
          )}

          {/* Per-question review */}
          {review.items.map((it, i) => {
            const KindIcon = KIND_ICON[it.kind] ?? Type;
            const a = it.answer;
            const sc = scores[it.questionId] || { points: '', note: '' };
            const isChoice = it.kind !== 'short' && !MENTOR_GRADED.has(it.kind);
            const needsScore = canReview && MENTOR_GRADED.has(it.kind) && gaveAnswer(it) && sc.points === '';
            const selected = a?.selectedOptionIds ?? [];
            const correctIds = it.correctOptionIds ?? [];
            return (
              <div key={it.questionId} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                  <KindIcon className="w-4 h-4 text-brand-600" /> Q{i + 1}
                  <span className="text-slate-400 font-normal">· {KIND_LABEL[it.kind] || it.kind} · {it.points} pts</span>
                  {a && (
                    a.isCorrect === true ? (
                      <span className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        <Check className="w-3 h-3" /> Correct
                      </span>
                    ) : a.isCorrect === false && !MENTOR_GRADED.has(it.kind) ? (
                      <span className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                        <X className="w-3 h-3" /> Incorrect
                      </span>
                    ) : needsScore ? (
                      <span className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                        <AlertTriangle className="w-3 h-3" /> Needs your score
                      </span>
                    ) : null
                  )}
                </div>
                <p className="text-sm text-slate-900 mb-3">{it.prompt}</p>

                {/* Mentee answer */}
                {it.kind === 'code' ? (
                  gaveAnswer(it) ? (
                    <div className="space-y-2">
                      <div className="rounded-lg overflow-hidden border border-slate-800">
                        <CodeEditor value={a?.answerText || ''} language={it.codeLanguage} readOnly minHeight="80px" maxHeight="360px" />
                      </div>
                      {it.referenceSolution && (
                        <details>
                          <summary className="text-xs font-medium text-brand-600 cursor-pointer">Model solution</summary>
                          <pre className="mt-1.5 max-h-64 overflow-auto rounded-lg bg-amber-50/60 p-3 text-xs text-slate-700 whitespace-pre">{it.referenceSolution}</pre>
                        </details>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 inline-flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" /> No code was written — scored 0.
                    </p>
                  )
                ) : it.kind === 'video' ? (
                  a?.videoUrl ? (
                    <div className="space-y-2">
                      <video controls playsInline preload="metadata" src={a.videoUrl} className="w-full max-h-80 rounded-lg bg-black">
                        <track kind="captions" />
                      </video>
                      {a.transcript && (
                        <details>
                          <summary className="text-xs font-medium text-slate-500 cursor-pointer">Live captions</summary>
                          <div className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 mt-1.5 whitespace-pre-wrap">{a.transcript}</div>
                        </details>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 inline-flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      No video was recorded{a?.transcript ? ' (live captions only)' : ''} — scored 0.
                    </p>
                  )
                ) : !a ? (
                  <p className="text-sm text-slate-400 italic">No answer given.</p>
                ) : isChoice ? (
                  <div className="space-y-1.5">
                    {it.options.map((opt) => {
                      const isSelected = selected.includes(opt.id);
                      const isCorrect = correctIds.includes(opt.id);
                      const wrongPick = isSelected && !isCorrect;
                      return (
                        <div
                          key={opt.id}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                            isCorrect ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : wrongPick ? 'border-red-200 bg-red-50 text-red-800'
                              : 'border-slate-200 text-slate-600'
                          }`}
                        >
                          <span className="shrink-0">
                            {isCorrect ? <Check className="w-4 h-4 text-emerald-600" />
                              : wrongPick ? <X className="w-4 h-4 text-red-600" />
                              : <span className="inline-block w-4 h-4" />}
                          </span>
                          <span className="flex-1">{opt.label}</span>
                          {isSelected && (
                            <span className={`text-[10px] font-medium uppercase tracking-wide ${wrongPick ? 'text-red-600' : 'text-emerald-600'}`}>
                              Chosen
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {a.answerText ? (
                      <div className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{a.answerText}</div>
                    ) : (
                      <p className="text-sm text-slate-400 italic">No answer text.</p>
                    )}
                    {it.acceptedAnswers && it.acceptedAnswers.length > 0 && (
                      <div className="text-xs text-slate-500">
                        <span className="font-medium text-slate-600">Accepted: </span>
                        {it.acceptedAnswers.join(', ')}
                      </div>
                    )}
                  </div>
                )}

                {/* Snapshots taken while this question was on screen (reviewer only). */}
                {canReview && it.snapshots && it.snapshots.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] text-slate-400 mb-1 inline-flex items-center gap-1">
                      <Eye className="w-3 h-3" /> Snapshots during this question · {it.snapshots.length}
                    </p>
                    <SnapshotStrip snapshots={it.snapshots} size="sm" />
                  </div>
                )}

                {/* Explanation */}
                {it.explanation && (
                  <details className="mt-3">
                    <summary className="text-xs font-medium text-brand-600 cursor-pointer">Explanation</summary>
                    <div className="text-sm text-slate-600 bg-amber-50/50 rounded-lg p-3 mt-1.5 whitespace-pre-wrap">{it.explanation}</div>
                  </details>
                )}

                {/* Scoring (mentor) or the awarded score (read-only) */}
                {canReview ? (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                        Points
                        <input type="number" min={0} max={it.points} value={sc.points}
                          onChange={(e) => saveScore(it, { points: e.target.value })}
                          className="w-16 border border-slate-300 rounded-lg px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        <span className="text-slate-400">/ {it.points}</span>
                      </label>
                      {a?.autoPoints != null && !MENTOR_GRADED.has(it.kind) && (
                        <span className="text-[11px] text-slate-400">Auto: {a.autoPoints}</span>
                      )}
                    </div>
                    <input value={sc.note} onChange={(e) => saveScore(it, { note: e.target.value })}
                      placeholder="Note on this answer (optional)"
                      className="mt-2 w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                ) : (
                  (a?.pointsAwarded != null || a?.scoreNote) && (
                    <div className="mt-3 pt-3 border-t border-slate-100 text-sm">
                      {a?.pointsAwarded != null && <span className="font-medium text-slate-900">{a.pointsAwarded} / {it.points} pts</span>}
                      {a?.scoreNote && <p className="text-slate-600 mt-1">{a.scoreNote}</p>}
                    </div>
                  )
                )}
              </div>
            );
          })}

          {/* Overall note + finalize hint */}
          {canReview ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 inline-flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-slate-400" /> Overall feedback
              </label>
              <textarea value={overallNote} onChange={(e) => setOverallNote(e.target.value)} rows={3}
                placeholder="Summary the mentee will see when you finalize…"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              {review.task.status === 'completed'
                ? 'This quiz has been graded — results are read-only.'
                : 'This review is read-only.'}
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
}

export default QuizReviewDrawer;
