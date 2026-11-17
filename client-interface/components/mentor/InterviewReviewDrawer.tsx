'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Mic, Code2, Type, Volume2, Sparkles, Eye, AlertTriangle, CheckCircle2, Clock, Flag, Trash2, X,
  ChevronLeft, ChevronRight, RotateCcw, Video,
} from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { CodeEditor } from '@/components/shared/CodeEditor';
import { interviewApi, type InterviewReview, type ReviewItem } from '@/lib/services/interview-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { fmtClock } from '@/lib/utils/interviewMedia';
import { FLAG_LABEL, SourceBadge } from '@/components/mentor/ProctorSummary';

/** The icon for a question's kind. */
const kindIcon = (kind: string) => (kind === 'code' ? Code2 : kind === 'text' ? Type : kind === 'video' ? Video : Mic);
const recordedKind = (kind: string) => kind === 'voice' || kind === 'video';

/**
 * InterviewReviewDrawer — the mentor's review of a completed interview: each
 * question with the candidate's audio/transcript/code, the reference answer, a
 * per-answer score (+ optional AI draft), the proctor log & snapshots, and an
 * overall note that finalizes the task through the normal points/completion path.
 * Also serves the owning mentee read-only (canReview=false, no reference/AI).
 */
export function InterviewReviewDrawer({
  taskId,
  onClose,
  onFinalized,
  readOnly = false,
}: {
  taskId: string;
  onClose: () => void;
  onFinalized?: () => void;
  readOnly?: boolean;
}) {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState<InterviewReview | null>(null);
  const [scores, setScores] = useState<Record<string, { points: string; note: string }>>({});
  const [overallNote, setOverallNote] = useState('');
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [aiAllBusy, setAiAllBusy] = useState(false);
  const [aiAllProgress, setAiAllProgress] = useState<{ done: number; total: number } | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [deletingSnaps, setDeletingSnaps] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null); // index into proctor.snapshots
  const [redoSel, setRedoSel] = useState<Set<string>>(new Set()); // question ids to send back
  const [redoBusy, setRedoBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    interviewApi.getReview(taskId)
      .then((res: any) => {
        const r: InterviewReview = res?.data;
        setReview(r);
        setFlagged(!!r.flag?.flagged);
        setFlagReason(r.flag?.reason || '');
        const seed: Record<string, { points: string; note: string }> = {};
        r.items.forEach((it) => {
          seed[it.questionId] = {
            points: it.answer?.pointsAwarded != null ? String(it.answer.pointsAwarded) : '',
            note: it.answer?.scoreNote || '',
          };
        });
        setScores(seed);
      })
      .catch((e: any) => { toast.error(extractApiErrorMessage(e, 'Could not load the interview')); onClose(); })
      .finally(() => setLoading(false));
  }, [taskId, onClose]);

  useEffect(() => { load(); }, [load]);

  // Snapshot carousel keyboard nav: Escape closes, ←/→ move between images.
  useEffect(() => {
    if (zoom === null) return;
    const n = review?.proctor.snapshots.length ?? 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoom(null);
      else if (e.key === 'ArrowLeft' && n) setZoom((z) => (z === null ? z : (z - 1 + n) % n));
      else if (e.key === 'ArrowRight' && n) setZoom((z) => (z === null ? z : (z + 1) % n));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom, review]);

  const canReview = !!review?.canReview && !readOnly;

  const saveScore = async (it: ReviewItem, patch: { points?: string; note?: string }) => {
    const cur = scores[it.questionId] || { points: '', note: '' };
    const next = { ...cur, ...patch };
    setScores((s) => ({ ...s, [it.questionId]: next }));
    if (!canReview) return;
    const pts = next.points === '' ? undefined : Math.max(0, Math.min(it.points, Number(next.points) || 0));
    try {
      await interviewApi.gradeAnswer(taskId, it.questionId, { pointsAwarded: pts, scoreNote: next.note || null });
    } catch { /* best-effort autosave; finalize re-reads */ }
  };

  const runAiDraft = async (it: ReviewItem) => {
    setAiBusy(it.questionId);
    try {
      const res: any = await interviewApi.aiDraftAnswer(taskId, it.questionId);
      const draft = res?.data?.aiDraft;
      if (draft) {
        await saveScore(it, { points: String(draft.suggestedPoints), note: draft.note });
        toast.success('AI draft applied — adjust if needed');
      }
    } catch (e: any) {
      toast.error(extractApiErrorMessage(e, 'AI draft failed'));
    } finally {
      setAiBusy(null);
    }
  };

  // Grade every ANSWERED question, applying each AI suggestion as the working
  // score (persisted) so the mentor only tweaks the ones they disagree with.
  // Runs in small chunks so a long interview never exceeds the request timeout
  // (transcribing + grading dozens of voice answers in one call would); each
  // chunk shows progress and a failure only loses that batch, not the whole run.
  const runAiAll = async () => {
    if (aiAllBusy || !review) return;
    const targets = review.items.filter((it) => {
      const a = it.answer;
      return !!(a && (a.audioUrl || a.videoUrl || a.transcript || a.code || a.answerText));
    });
    if (targets.length === 0) { toast.message('No answers to grade yet.'); return; }

    const CHUNK = 4;
    setAiAllBusy(true);
    setAiAllProgress({ done: 0, total: targets.length });
    let graded = 0;
    let failed = 0;
    try {
      for (let i = 0; i < targets.length; i += CHUNK) {
        const slice = targets.slice(i, i + CHUNK);
        try {
          const res: any = await interviewApi.aiDraftAll(taskId, slice.map((it) => it.questionId));
          const drafts: { questionId: string; suggestedPoints: number; note: string | null }[] = res?.data?.drafts || [];
          const byQ = new Map(drafts.map((d) => [d.questionId, d]));
          for (const it of slice) {
            const d = byQ.get(it.questionId);
            if (!d) continue;
            await saveScore(it, { points: String(d.suggestedPoints), ...(d.note ? { note: d.note } : {}) });
            graded += 1;
          }
        } catch {
          failed += 1; // keep going; the mentor can re-run to fill the gaps
        }
        setAiAllProgress({ done: Math.min(i + CHUNK, targets.length), total: targets.length });
      }
      if (graded > 0) {
        toast.success(`AI graded ${graded} answer${graded === 1 ? '' : 's'}${failed ? ` · ${failed} batch${failed === 1 ? '' : 'es'} timed out — click again to finish` : ''} — adjust any you disagree with`);
      } else {
        toast.error('AI grade all failed — check your AI key in Settings → AI Connections');
      }
      load(); // refresh Whisper transcripts + persisted scores
    } finally {
      setAiAllBusy(false);
      setAiAllProgress(null);
    }
  };

  const scrollToQ = (qid: string) =>
    document.getElementById(`q-card-${qid}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const toggleFlag = async () => {
    const next = !flagged;
    setFlagged(next);
    try {
      await interviewApi.flagInterview(taskId, next, next ? (flagReason || undefined) : undefined);
      toast.success(next ? 'Interview flagged' : 'Flag removed');
    } catch (e: any) {
      setFlagged(!next);
      toast.error(extractApiErrorMessage(e, 'Could not update the flag'));
    }
  };

  const saveFlagReason = async () => {
    if (!flagged) return;
    try { await interviewApi.flagInterview(taskId, true, flagReason || undefined); } catch { /* best-effort */ }
  };

  const deleteSnaps = async () => {
    const ok = await confirm({
      title: 'Delete proctor images?',
      description: 'This permanently removes every webcam and screen snapshot for this interview. Behavior flags (tab switches, fullscreen exits, etc.) are kept.',
      confirmLabel: 'Delete images',
      variant: 'danger',
    });
    if (!ok) return;
    setDeletingSnaps(true);
    try {
      const res: any = await interviewApi.deleteSnapshots(taskId);
      toast.success(`Deleted ${res?.data?.deleted ?? ''} image${res?.data?.deleted === 1 ? '' : 's'}`);
      load();
    } catch (e: any) {
      toast.error(extractApiErrorMessage(e, 'Could not delete the images'));
    } finally {
      setDeletingSnaps(false);
    }
  };

  const finalize = async () => {
    if (finalizing) return;
    setFinalizing(true);
    try {
      const res: any = await interviewApi.finalizeReview(taskId, overallNote || undefined);
      toast.success(`Interview graded — ${res?.data?.pointsPercent ?? ''}%`);
      onFinalized?.();
      onClose();
    } catch (e: any) {
      toast.error(extractApiErrorMessage(e, 'Could not finalize the review'));
    } finally {
      setFinalizing(false);
    }
  };

  const toggleRedo = (qid: string) => setRedoSel((s) => {
    const n = new Set(s); if (n.has(qid)) n.delete(qid); else n.add(qid); return n;
  });

  const sendRedo = async () => {
    if (redoBusy || redoSel.size === 0) return;
    setRedoBusy(true);
    try {
      await interviewApi.requestRedo(taskId, [...redoSel], overallNote || undefined);
      toast.success(`Sent back — the mentee will redo ${redoSel.size} question${redoSel.size === 1 ? '' : 's'}`);
      onFinalized?.();
      onClose();
    } catch (e: any) {
      toast.error(extractApiErrorMessage(e, 'Could not send back for redo'));
    } finally {
      setRedoBusy(false);
    }
  };

  const totalAwarded = review?.items.reduce((s, it) => s + (Number(scores[it.questionId]?.points) || 0), 0) ?? 0;
  const totalPossible = review?.totals.totalPossible ?? 0;

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={review?.kit.title ? `Interview · ${review.kit.title}` : 'Interview review'}
      subtitle={review?.session?.mentee ? `${review.session.mentee.name} · attempt ${review.session.attemptNumber}` : undefined}
      footer={canReview ? (
        <>
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Close</button>
          {redoSel.size > 0 ? (
            <button onClick={sendRedo} disabled={redoBusy} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {redoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Send back to redo · {redoSel.size}
            </button>
          ) : (
            <button onClick={finalize} disabled={finalizing} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {finalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Finalize · {totalAwarded}/{totalPossible} pts
            </button>
          )}
        </>
      ) : (
        <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Close</button>
      )}
    >
      {loading || !review ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
      ) : (
        <div className="space-y-5">
          {/* Score summary */}
          <div className="flex items-center gap-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
            <div className="text-center">
              <div className="text-2xl font-semibold text-slate-900 tabular-nums">{totalAwarded}<span className="text-slate-400 text-lg">/{totalPossible}</span></div>
              <div className="text-[11px] text-slate-500">points</div>
            </div>
            <div className="text-sm text-slate-600">
              {review.totals.questionCount} question{review.totals.questionCount === 1 ? '' : 's'}
              {review.session?.submittedAt && <span className="text-slate-400"> · submitted {new Date(review.session.submittedAt).toLocaleDateString()}</span>}
              {review.task.status === 'completed' && <span className="ml-2 text-emerald-600 font-medium">Graded</span>}
            </div>
          </div>

          {/* Review-all summary — score every question in one place, one-click AI
              grade-all, and jump into a card for the detail. */}
          {canReview && review.items.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                <span className="text-sm font-medium text-slate-700">All answers · quick score</span>
                <button onClick={runAiAll} disabled={aiAllBusy}
                  title="Transcribe voice answers with Whisper and score every question against its rubric — uses your AI key (Settings → AI Connections)"
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
                  {aiAllBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {aiAllBusy
                    ? (aiAllProgress ? `Grading ${aiAllProgress.done}/${aiAllProgress.total}…` : 'Grading…')
                    : 'AI grade all'}
                </button>
              </div>
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {review.items.map((it, i) => {
                  const a = it.answer;
                  const sc = scores[it.questionId] || { points: '', note: '' };
                  const KindIcon = kindIcon(it.kind);
                  const preview = a?.aiDraft?.transcript || a?.transcript || a?.answerText || (a?.code ? '‹code answer›' : '') || 'No answer';
                  return (
                    <div key={it.questionId} className="flex items-center gap-2 px-3 py-2">
                      <button onClick={() => scrollToQ(it.questionId)} title="Jump to this question"
                        className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-600 w-9">
                        <KindIcon className="w-3.5 h-3.5" />{i + 1}
                      </button>
                      <p className="flex-1 min-w-0 truncate text-xs text-slate-500">{preview}</p>
                      {a?.aiDraft && (
                        <span title={a.aiDraft.note || 'AI suggestion'}
                          className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-brand-600">
                          <Sparkles className="w-3 h-3" />{a.aiDraft.suggestedPoints}
                        </span>
                      )}
                      <input type="number" min={0} max={it.points} value={sc.points}
                        onChange={(e) => saveScore(it, { points: e.target.value })}
                        className="shrink-0 w-14 bg-transparent border border-slate-300 rounded-lg px-2 py-1 text-sm tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-brand-500" />
                      <span className="shrink-0 text-xs text-slate-400 w-7">/{it.points}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Flag for follow-up (mentor only) */}
          {canReview && (
            <div className={`rounded-xl border p-3 ${flagged ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <button onClick={toggleFlag}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium shrink-0 ${flagged ? 'bg-red-600 text-white hover:bg-red-700' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                  <Flag className="w-4 h-4" />{flagged ? 'Flagged' : 'Flag interview'}
                </button>
                {flagged
                  ? <input value={flagReason} onChange={(e) => setFlagReason(e.target.value)} onBlur={saveFlagReason}
                      placeholder="Reason (optional) — e.g. suspicious behavior"
                      className="flex-1 border border-red-200 rounded-lg px-3 py-1.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-red-400" />
                  : <span className="text-xs text-slate-400">Mark this interview for follow-up.</span>}
              </div>
            </div>
          )}

          {/* Proctor summary */}
          {(review.proctor.snapshots.length > 0 || review.proctor.flags.length > 0) && (
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Eye className="w-4 h-4 text-slate-500" /> Proctoring
                </div>
                {canReview && review.proctor.snapshots.length > 0 && (
                  <button onClick={deleteSnaps} disabled={deletingSnaps}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 disabled:opacity-50">
                    {deletingSnaps ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Delete images
                  </button>
                )}
              </div>
              {Object.keys(review.proctor.flagCounts).length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {Object.entries(review.proctor.flagCounts).map(([type, count]) => (
                    <span key={type} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                      <AlertTriangle className="w-3 h-3" />{FLAG_LABEL[type] || type} · {count}
                    </span>
                  ))}
                </div>
              ) : <p className="text-xs text-slate-400 mb-3">No flags raised.</p>}
              {review.options.screenShareRequired && review.session?.status === 'submitted'
                && !review.proctor.snapshots.some((s) => s.source === 'screen') && (
                <p className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  This interview required screen sharing, but no screen snapshot came through.
                </p>
              )}
              {review.proctor.snapshots.length > 0 && (
                <>
                  <p className="mb-1 text-[11px] text-slate-400">
                    {review.proctor.snapshots.filter((s) => s.source !== 'screen').length} webcam · {review.proctor.snapshots.filter((s) => s.source === 'screen').length} screen
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {review.proctor.snapshots.map((s, i) => (
                      <button key={i} type="button" onClick={() => setZoom(i)} title={`${s.source === 'screen' ? 'Screen' : 'Webcam'} · ${new Date(s.at).toLocaleTimeString()} — click to enlarge`}
                        className="relative shrink-0 rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.url} alt={`Snapshot ${i + 1}`} className="w-20 h-14 object-cover cursor-zoom-in" />
                        <SourceBadge source={s.source} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* AI grading hint — where the key lives + what "AI grade" does. */}
          {canReview && (
            <div className="rounded-xl border border-brand-100 dark:border-brand-900 bg-brand-50/50 dark:bg-brand-950/50 p-3 text-xs text-slate-600 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
              <span>
                Hit <span className="font-medium text-slate-800">AI grade</span> on any question to score it against your rubric. Voice answers are re-transcribed with Whisper — more accurate than the live transcript when pronunciation trips it up. It runs on your own AI key: add or manage it in{' '}
                <a href="/mentor/settings" className="text-brand-700 font-medium hover:underline">Settings → AI Connections</a>.
              </span>
            </div>
          )}

          {/* Per-question review */}
          {review.items.map((it, i) => {
            const KindIcon = kindIcon(it.kind);
            const a = it.answer;
            const sc = scores[it.questionId] || { points: '', note: '' };
            return (
              <div key={it.questionId} id={`q-card-${it.questionId}`} className="rounded-xl border border-slate-200 p-4 scroll-mt-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <KindIcon className="w-4 h-4 text-brand-600" /> Q{i + 1}
                    <span className="text-slate-400 font-normal">· {it.points} pts</span>
                    {a?.timeSpentSeconds ? <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Clock className="w-3 h-3" />{fmtClock(a.timeSpentSeconds)}</span> : null}
                  </div>
                  {canReview && (
                    <label className={`inline-flex items-center gap-1.5 text-xs cursor-pointer shrink-0 ${redoSel.has(it.questionId) ? 'text-amber-700 font-medium' : 'text-slate-500 hover:text-slate-700'}`}
                      title="Ask the mentee to re-answer this question">
                      <input type="checkbox" checked={redoSel.has(it.questionId)} onChange={() => toggleRedo(it.questionId)}
                        className="rounded border-slate-300 text-amber-500 focus:ring-amber-400" />
                      <RotateCcw className="w-3.5 h-3.5" /> Redo
                    </label>
                  )}
                </div>
                <p className="text-sm text-slate-900 mb-3">{it.prompt}</p>

                {/* Candidate answer */}
                {(() => {
                  const hasContent = !!(a && (a.audioUrl || a.videoUrl || a.transcript || a.code || a.answerText));
                  if (!a) return <p className="text-sm text-slate-400 italic">No answer given.</p>;
                  if (!hasContent) {
                    // The mentee reached this question but nothing landed — say so
                    // explicitly (esp. voice: audio may have failed to upload).
                    return (
                      <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 inline-flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        {it.kind === 'voice'
                          ? 'Voice answer — no audio uploaded and no transcript was captured.'
                          : it.kind === 'video'
                            ? 'Video answer — no video uploaded and no captions were captured.'
                            : 'No response was recorded for this question.'}
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      {a.videoUrl && (
                        <video controls playsInline preload="metadata" src={a.videoUrl} className="w-full max-h-80 rounded-lg bg-black">
                          <track kind="captions" />
                        </video>
                      )}
                      {it.kind === 'video' && !a.videoUrl && a.transcript && (
                        <p className="text-[11px] text-amber-600 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Video didn’t upload — live captions only.</p>
                      )}
                      {a.audioUrl && (
                        <audio controls src={a.audioUrl} className="w-full h-9">
                          <track kind="captions" />
                        </audio>
                      )}
                      {it.kind === 'voice' && !a.audioUrl && a.transcript && (
                        <p className="text-[11px] text-amber-600 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Audio didn’t upload — transcript only.</p>
                      )}
                      {a.transcript && (
                        <div className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{a.transcript}</div>
                      )}
                      {a.code && (
                        <div className="rounded-lg overflow-hidden border border-slate-800">
                          <CodeEditor value={a.code} language={it.codeLanguage} readOnly minHeight="80px" maxHeight="360px" />
                        </div>
                      )}
                      {a.answerText && (
                        <div className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{a.answerText}</div>
                      )}
                    </div>
                  );
                })()}

                {/* Whisper transcript from the audio — more accurate than the
                    browser's live STT, shown once AI grading has run. */}
                {a?.aiDraft?.transcript && (
                  <details className="mt-2" open>
                    <summary className="text-xs font-medium text-emerald-700 dark:text-emerald-500 cursor-pointer inline-flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> AI transcript (from audio)
                    </summary>
                    <div className="text-sm text-slate-700 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 rounded-lg p-3 mt-1.5 whitespace-pre-wrap">{a.aiDraft.transcript}</div>
                  </details>
                )}

                {/* Webcam snapshots taken while this question was on screen. */}
                {canReview && it.snapshots && it.snapshots.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] text-slate-400 mb-1 inline-flex items-center gap-1">
                      <Eye className="w-3 h-3" /> Snapshots during this question · {it.snapshots.length}
                    </p>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {it.snapshots.map((s, si) => {
                        const gi = review.proctor.snapshots.findIndex((x) => x.url === s.url);
                        return (
                          <button key={si} type="button" onClick={() => { if (gi >= 0) setZoom(gi); }}
                            title={`${new Date(s.at).toLocaleTimeString()} — click to enlarge`}
                            className="relative shrink-0 rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={s.url} alt="" className="w-16 h-11 object-cover cursor-zoom-in" />
                            <SourceBadge source={s.source} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Reference answer (mentor only) */}
                {it.referenceAnswer && (
                  <details className="mt-3">
                    <summary className="text-xs font-medium text-brand-600 dark:text-brand-400 cursor-pointer">Reference answer</summary>
                    <div className="text-sm text-slate-600 bg-amber-50/50 dark:bg-amber-950/30 rounded-lg p-3 mt-1.5 whitespace-pre-wrap">{it.referenceAnswer}</div>
                  </details>
                )}

                {/* Scoring (mentor) or the awarded score (read-only) */}
                {canReview ? (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                        Score
                        <input type="number" min={0} max={it.points} value={sc.points}
                          onChange={(e) => saveScore(it, { points: e.target.value })}
                          className="w-16 bg-transparent border border-slate-300 rounded-lg px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        <span className="text-slate-400">/ {it.points}</span>
                      </label>
                      <button onClick={() => runAiDraft(it)} disabled={aiBusy === it.questionId}
                        title={recordedKind(it.kind)
                          ? 'Transcribes the recording with Whisper and scores it against the rubric — uses your AI key (Settings → AI Connections)'
                          : 'Scores this answer against the rubric — uses your AI key (Settings → AI Connections)'}
                        className="ml-auto inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/50 disabled:opacity-50">
                        {aiBusy === it.questionId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {(it.kind === 'voice' && a?.audioUrl) || (it.kind === 'video' && a?.videoUrl) ? 'AI grade (from recording)' : 'AI draft'}
                      </button>
                    </div>
                    <input value={sc.note} onChange={(e) => saveScore(it, { note: e.target.value })}
                      placeholder="Note on this answer (optional)"
                      className="mt-2 w-full bg-transparent border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
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

          {/* Overall note */}
          {canReview && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 inline-flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-slate-400" /> Overall feedback
              </label>
              <textarea value={overallNote} onChange={(e) => setOverallNote(e.target.value)} rows={3}
                placeholder="Summary the mentee will see when you finalize…"
                className="w-full bg-transparent border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          )}

          {/* Snapshot carousel — page through all proctor images with ←/→, the
              thumbnail strip, or the arrows. Collapses cleanly for a single image. */}
          {zoom !== null && review.proctor.snapshots[zoom] && (() => {
            const snaps = review.proctor.snapshots;
            const cur = snaps[zoom];
            const many = snaps.length > 1;
            const go = (d: number) => setZoom((z) => (z === null ? z : (z + d + snaps.length) % snaps.length));
            return (
              <div className="fixed inset-0 z-[70] bg-black/85 flex flex-col items-center justify-center p-6" onClick={() => setZoom(null)}>
                <button onClick={() => setZoom(null)} aria-label="Close"
                  className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm">
                  <X className="w-4 h-4" /> Close
                </button>
                <div className="flex items-center gap-3 w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
                  {many && (
                    <button onClick={() => go(-1)} aria-label="Previous snapshot"
                      className="shrink-0 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronLeft className="w-6 h-6" /></button>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cur.url} alt={`Proctor snapshot ${zoom + 1}`} className="flex-1 min-w-0 max-h-[78vh] rounded-lg object-contain shadow-2xl" />
                  {many && (
                    <button onClick={() => go(1)} aria-label="Next snapshot"
                      className="shrink-0 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"><ChevronRight className="w-6 h-6" /></button>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-4 text-white/80 text-sm" onClick={(e) => e.stopPropagation()}>
                  {many && <span className="tabular-nums font-medium">{zoom + 1} / {snaps.length}</span>}
                  <span>{new Date(cur.at).toLocaleString()}</span>
                </div>
                {many && (
                  <div className="mt-3 flex gap-1.5 overflow-x-auto max-w-full pb-1" onClick={(e) => e.stopPropagation()}>
                    {snaps.map((s, i) => (
                      <button key={i} onClick={() => setZoom(i)} aria-label={`Snapshot ${i + 1}`}
                        className={`shrink-0 rounded overflow-hidden border-2 transition-opacity ${i === zoom ? 'border-brand-400' : 'border-transparent opacity-50 hover:opacity-100'}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.url} alt="" className="w-14 h-10 object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </Drawer>
  );
}

export default InterviewReviewDrawer;
