'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Loader2, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, Play, RotateCcw,
  Clock, Sparkles, ClipboardCheck, XCircle, ListChecks,
} from 'lucide-react';
import {
  quizApi, type CandidateQuiz, type CandidateQuizQuestion, type QuizSubmitResult,
  type QuizResultItem,
} from '@/lib/services/quiz-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useConfirm } from '@/lib/context/ConfirmContext';

type Phase = 'loading' | 'intro' | 'active' | 'submitting' | 'done' | 'error';
interface Answer { selectedOptionIds: string[]; answerText: string }

const blank = (): Answer => ({ selectedOptionIds: [], answerText: '' });

function mmss(total: number): string {
  const s = Math.max(0, total);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export default function QuizRunnerPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = use(params);
  const router = useRouter();
  const confirm = useConfirm();

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [data, setData] = useState<CandidateQuiz | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [result, setResult] = useState<QuizSubmitResult | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockSkewRef = useRef(0);
  const answersRef = useRef<Record<string, Answer>>({});
  const idxRef = useRef(0);
  const submittingRef = useRef(false);

  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { idxRef.current = idx; }, [idx]);

  const questions = useMemo(() => data?.questions ?? [], [data]);
  const q: CandidateQuizQuestion | undefined = questions[idx];
  const opts = data?.options;

  const backToTask = () => router.push(`/mentee/tasks/${taskId}`);

  const isAnswered = useCallback((question: CandidateQuizQuestion): boolean => {
    const a = answersRef.current[question.id];
    if (!a) return false;
    if (question.kind === 'short') return !!a.answerText.trim();
    return a.selectedOptionIds.length > 0;
  }, []);

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    quizApi.getCandidateQuiz(taskId)
      .then((res: { data: CandidateQuiz }) => {
        if (!active) return;
        const d = res?.data;
        setData(d);
        if (d?.serverNow) clockSkewRef.current = Date.parse(d.serverNow) - Date.now();
        setSessionStartedAt(d?.state?.sessionStartedAt || null);
        const seed: Record<string, Answer> = {};
        d.questions.forEach((qq) => {
          const saved = d.state.savedAnswers.find((a) => a.questionId === qq.id);
          seed[qq.id] = {
            selectedOptionIds: saved?.selectedOptionIds ? [...saved.selectedOptionIds] : [],
            answerText: saved?.answerText || '',
          };
        });
        setAnswers(seed);
        answersRef.current = seed;
        setPhase('intro');
      })
      .catch((e: unknown) => {
        if (active) { setErrorMsg(extractApiErrorMessage(e, 'Could not load this quiz')); setPhase('error'); }
      });
    return () => { active = false; };
  }, [taskId]);

  // ── Autosave ─────────────────────────────────────────────────────────────────
  const persistAnswer = useCallback(async (questionId: string) => {
    if (!sessionId) return;
    const a = answersRef.current[questionId];
    if (!a) return;
    await quizApi.saveAnswer(sessionId, {
      questionId,
      selectedOptionIds: a.selectedOptionIds,
      answerText: a.answerText.trim() ? a.answerText : null,
    }).catch(() => { /* autosave is best-effort */ });
  }, [sessionId]);

  const setAnswer = useCallback((questionId: string, patch: Partial<Answer>) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: { ...(prev[questionId] ?? blank()), ...patch } };
      answersRef.current = next;
      return next;
    });
    if (!sessionId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void persistAnswer(questionId); }, 800);
  }, [sessionId, persistAnswer]);

  const flushCurrent = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const current = questions[idxRef.current];
    if (current) await persistAnswer(current.id);
  }, [questions, persistAnswer]);

  // ── Start / resume ───────────────────────────────────────────────────────────
  const startQuiz = async () => {
    try {
      const res: { data: { session?: { id: string; startedAt?: string } } } = await quizApi.startQuiz(taskId);
      const session = res?.data?.session;
      if (!session?.id) throw new Error('No session returned');
      setSessionId(session.id);
      const startedAt = session.startedAt || data?.state.sessionStartedAt || new Date().toISOString();
      setSessionStartedAt(startedAt);
      const resume = Math.min(Math.max(0, data?.state.currentPosition ?? 0), Math.max(0, questions.length - 1));
      setIdx(resume);
      idxRef.current = resume;
      submittingRef.current = false;
      setPhase('active');
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not start the quiz'));
    }
  };

  // ── Total countdown (one timer, wall-clock, server-skew corrected) ───────────
  useEffect(() => {
    if (phase !== 'active') return;
    const limit = opts?.timeLimitSeconds;
    if (!limit) { setRemaining(null); return; }
    const startMs = sessionStartedAt ? Date.parse(sessionStartedAt) : Date.now();
    const skew = clockSkewRef.current;
    const deadline = startMs + limit * 1000;
    const compute = () => Math.round((deadline - (Date.now() + skew)) / 1000);

    let left = compute();
    setRemaining(left);
    if (left <= 0) { void submit(true); return; }
    const tick = setInterval(() => {
      if (submittingRef.current) { clearInterval(tick); return; }
      left = compute();
      setRemaining(left);
      if (left <= 0) { clearInterval(tick); void submit(true); }
    }, 1000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sessionStartedAt]);

  // ── Navigation ───────────────────────────────────────────────────────────────
  const goTo = async (next: number) => {
    await flushCurrent();
    const clamped = Math.min(Math.max(0, next), questions.length - 1);
    setIdx(clamped);
    idxRef.current = clamped;
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const submit = async (auto = false) => {
    if (!sessionId || submittingRef.current) return;
    if (!auto) {
      const blanks = questions.filter((qq) => qq.required && !isAnswered(qq)).length;
      if (blanks > 0) {
        const ok = await confirm({
          title: 'Submit with unanswered questions?',
          description: `${blanks} required question${blanks === 1 ? '' : 's'} ${blanks === 1 ? 'is' : 'are'} still blank. Blank answers score zero. You can submit anyway.`,
          confirmLabel: 'Submit anyway',
          cancelLabel: 'Keep answering',
          variant: 'danger',
        });
        if (!ok) return;
      }
    }
    submittingRef.current = true;
    setPhase('submitting');
    try {
      await flushCurrent();
      const res: { data: QuizSubmitResult } = await quizApi.submitQuiz(sessionId);
      setResult(res.data);
      setPhase('done');
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not submit the quiz'));
      submittingRef.current = false;
      setPhase('active');
    }
  };

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // ── Loading / submitting / error ─────────────────────────────────────────────
  if (phase === 'loading') {
    return <Stage><Loader2 className="w-7 h-7 animate-spin text-slate-400" /></Stage>;
  }

  if (phase === 'submitting') {
    return (
      <Stage>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600 mx-auto mb-3" />
          <p className="text-slate-800 font-medium">Submitting your quiz…</p>
          <p className="text-slate-500 text-sm mt-1">Grading your answers.</p>
        </div>
      </Stage>
    );
  }

  if (phase === 'error') {
    return (
      <Stage>
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="text-slate-800 font-medium">{errorMsg}</p>
          <button onClick={backToTask} className="mt-5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm">Back to task</button>
        </div>
      </Stage>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  if (phase === 'done' && result) {
    return <ResultScreen result={result} onBack={backToTask} />;
  }

  // ── Intro ────────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    const resuming = !!data?.state.activeSessionId;
    const canStart = !!data?.state.canStart || resuming;
    const last = data?.state.lastResult;
    const auto = opts?.evaluationMode === 'auto';

    // Already completed and can't retake — show the previous result summary.
    if (!canStart && last) {
      return (
        <Stage>
          <div className="max-w-md w-full">
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4">
                <ClipboardCheck className="w-7 h-7 text-brand-600" />
              </div>
              <h1 className="text-lg font-semibold text-slate-900">{data?.kit.title}</h1>
              <p className="text-slate-500 text-sm mt-1">You&apos;ve already completed this quiz.</p>

              {last.scorePercent !== null ? (
                <div className="mt-6">
                  <div className="text-4xl font-bold text-slate-900 tabular-nums">{Math.round(last.scorePercent)}%</div>
                  {last.autoScore !== null && last.maxScore !== null && (
                    <div className="text-sm text-slate-500 mt-1 tabular-nums">{last.autoScore} / {last.maxScore} points</div>
                  )}
                  {last.passed !== null && <PassPill passed={last.passed} className="mt-3" />}
                </div>
              ) : (
                <p className="text-sm text-slate-500 mt-5">Your mentor is reviewing your submission.</p>
              )}

              <button onClick={backToTask} className="mt-7 px-5 py-2.5 border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50">Back to task</button>
            </div>
          </div>
        </Stage>
      );
    }

    return (
      <Stage>
        <div className="max-w-lg w-full">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mb-5">
              <ListChecks className="w-7 h-7 text-brand-600" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">{data?.kit.title}</h1>
            {data?.kit.description && <p className="text-slate-500 mt-1.5 text-sm">{data.kit.description}</p>}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-5 text-sm text-slate-600">
              <span>{questions.length} question{questions.length === 1 ? '' : 's'}</span>
              <span className="tabular-nums">{data?.kit.totalPoints} pts</span>
              {opts?.passScore != null && <span className="tabular-nums">Pass ≥ {opts.passScore}%</span>}
            </div>

            <div className="flex flex-wrap gap-2 mt-5">
              <Badge tone={auto ? 'emerald' : 'brand'} icon={auto ? Sparkles : ClipboardCheck}>
                {auto ? 'Auto-graded — you’ll see your score right away' : 'Your mentor will review and confirm your score'}
              </Badge>
              {opts?.timeLimitSeconds ? (
                <Badge tone="amber" icon={Clock}>Timed: {Math.round(opts.timeLimitSeconds / 60)} min</Badge>
              ) : null}
              {!opts?.allowRetake && <Badge tone="slate" icon={AlertTriangle}>One attempt</Badge>}
            </div>

            {opts?.timeLimitSeconds ? (
              <div className="mt-5 flex items-start gap-2 text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg p-3">
                <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                Once you start, the clock runs continuously — it won’t pause if you close or lose connection. The quiz auto-submits when time is up.
              </div>
            ) : null}

            <button onClick={startQuiz} className="mt-7 inline-flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium">
              {resuming ? <><RotateCcw className="w-4 h-4" /> Resume quiz</> : <><Play className="w-4 h-4" /> Start quiz</>}
            </button>
          </div>
        </div>
      </Stage>
    );
  }

  // ── Active ───────────────────────────────────────────────────────────────────
  if (phase === 'active' && q) {
    const a = answers[q.id] ?? blank();
    const isLast = idx === questions.length - 1;
    const answeredCount = questions.filter((qq) => isAnswered(qq)).length;
    const lowTime = remaining !== null && remaining <= 30;

    const toggleOption = (optionId: string) => {
      if (q.multiple) {
        const has = a.selectedOptionIds.includes(optionId);
        setAnswer(q.id, {
          selectedOptionIds: has ? a.selectedOptionIds.filter((id) => id !== optionId) : [...a.selectedOptionIds, optionId],
        });
      } else {
        setAnswer(q.id, { selectedOptionIds: [optionId] });
      }
    };

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Top bar */}
        <div className="border-b border-slate-200 bg-white">
          <div className="max-w-3xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="text-sm text-slate-500">
                Question <span className="text-slate-900 font-medium tabular-nums">{idx + 1}</span> of <span className="tabular-nums">{questions.length}</span>
                <span className="ml-2 text-slate-400">· {q.points} pt{q.points === 1 ? '' : 's'}</span>
              </div>
              {remaining !== null && (
                <div className={`inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-lg tabular-nums font-medium ${lowTime ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                  <Clock className="w-3.5 h-3.5" />{mmss(remaining)}
                </div>
              )}
            </div>
            {/* Segmented progress */}
            <div className="flex items-center gap-1.5">
              {questions.map((qq, i) => (
                <div
                  key={qq.id}
                  className={`h-1.5 flex-1 rounded-full ${i === idx ? 'bg-brand-500' : isAnswered(qq) ? 'bg-brand-300' : 'bg-slate-200'}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Question */}
        <div className="flex-1 overflow-y-auto">
          <div key={q.id} className="max-w-3xl mx-auto px-6 py-8">
            <div className="flex items-start gap-2">
              <h1 className="text-lg sm:text-xl font-medium text-slate-900 leading-relaxed">{q.prompt}</h1>
              {q.required && <span className="text-red-500 mt-1" title="Required">*</span>}
            </div>
            {q.kind === 'multi' && <p className="text-xs text-slate-500 mt-1">Select all that apply.</p>}

            <div className="mt-6 space-y-2.5">
              {(q.kind === 'single' || q.kind === 'boolean' || q.kind === 'multi') && q.options.map((opt) => {
                const selected = a.selectedOptionIds.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleOption(opt.id)}
                    className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-xl border transition-colors ${selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <span className={`w-5 h-5 shrink-0 flex items-center justify-center border-2 ${q.multiple ? 'rounded-md' : 'rounded-full'} ${selected ? 'border-brand-500 bg-brand-500' : 'border-slate-300'}`}>
                      {selected && (q.multiple
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        : <span className="w-2 h-2 rounded-full bg-white" />)}
                    </span>
                    <span className={`text-sm ${selected ? 'text-slate-900 font-medium' : 'text-slate-700'}`}>{opt.label}</span>
                  </button>
                );
              })}

              {q.kind === 'short' && (
                <textarea
                  value={a.answerText}
                  onChange={(e) => setAnswer(q.id, { answerText: e.target.value })}
                  rows={5}
                  placeholder="Type your answer…"
                  className="w-full bg-white border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-400"
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-white">
          <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
            <button
              onClick={() => goTo(idx - 1)}
              disabled={idx === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ArrowLeft className="w-4 h-4" /> Previous
            </button>

            <span className="text-xs text-slate-400 tabular-nums hidden sm:block">{answeredCount} of {questions.length} answered</span>

            {isLast ? (
              <button
                onClick={() => submit(false)}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium text-sm"
              >
                <CheckCircle2 className="w-4 h-4" /> Submit quiz
              </button>
            ) : (
              <button
                onClick={() => goTo(idx + 1)}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium text-sm"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <Stage><Loader2 className="w-7 h-7 animate-spin text-slate-400" /></Stage>;
}

// ── Result screen ─────────────────────────────────────────────────────────────
function ResultScreen({ result, onBack }: { result: QuizSubmitResult; onBack: () => void }) {
  const { finalized, scorePercent, autoScore, maxScore, passed, review } = result;

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-6">
      <div className="max-w-2xl mx-auto">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          {finalized ? (
            <>
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-emerald-500" />
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Quiz complete</h1>
              <div className="text-5xl font-bold text-slate-900 tabular-nums mt-5">{Math.round(scorePercent)}%</div>
              <div className="text-sm text-slate-500 mt-1 tabular-nums">{autoScore} / {maxScore} points</div>
              {passed !== null && <PassPill passed={passed} className="mt-4" />}
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4">
                <ClipboardCheck className="w-8 h-8 text-brand-600" />
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Submitted</h1>
              <p className="text-slate-500 mt-2 text-sm">Your mentor will review and confirm your score. You’ll see the result on your task page.</p>
            </>
          )}
          <button onClick={onBack} className="mt-7 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium">Back to task</button>
        </div>

        {review && review.length > 0 && (
          <div className="mt-6 space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 px-1">Answer breakdown</h2>
            {review.map((item, i) => <ReviewItem key={item.questionId} item={item} n={i + 1} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewItem({ item, n }: { item: QuizResultItem; n: number }) {
  const labelFor = (id: string) => item.options.find((o) => o.id === id)?.label ?? id;
  const correctText = item.kind === 'short'
    ? item.acceptedAnswers.join(', ')
    : item.correctOptionIds.map(labelFor).join(', ');
  const yourText = item.kind === 'short'
    ? (item.answerText || '—')
    : (item.selectedOptionIds.length ? item.selectedOptionIds.map(labelFor).join(', ') : '—');

  return (
    <div className={`rounded-xl border bg-white p-4 ${item.isCorrect ? 'border-emerald-200' : 'border-red-200'}`}>
      <div className="flex items-start gap-3">
        {item.isCorrect
          ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          : <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-slate-900">{n}. {item.prompt}</p>
            <span className="text-xs text-slate-400 tabular-nums shrink-0">{item.pointsAwarded}/{item.points} pt{item.points === 1 ? '' : 's'}</span>
          </div>
          <div className="mt-2 text-sm space-y-1">
            <p className={item.isCorrect ? 'text-slate-600' : 'text-red-600'}>
              <span className="text-slate-400">Your answer:</span> {yourText}
            </p>
            {!item.isCorrect && correctText && (
              <p className="text-emerald-700"><span className="text-slate-400">Correct:</span> {correctText}</p>
            )}
            {item.explanation && (
              <p className="text-slate-500 text-xs mt-2 bg-slate-50 rounded-lg p-2.5 border border-slate-100">{item.explanation}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small presentational helpers ──────────────────────────────────────────────
function PassPill({ passed, className = '' }: { passed: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'} ${className}`}>
      {passed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {passed ? 'Passed' : 'Not passed'}
    </span>
  );
}

function Badge({ tone, icon: Icon, children }: {
  tone: 'brand' | 'emerald' | 'amber' | 'slate';
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700 border-brand-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    slate: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${tones[tone]}`}>
      <Icon className="w-3.5 h-3.5" />{children}
    </span>
  );
}

/** Centered canvas for the transitional / card phases. */
function Stage({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">{children}</div>;
}
