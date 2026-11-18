'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock, Code2, Eye, FileUp, ListChecks, Loader2,
  Maximize2, Monitor, Pencil, Play, ShieldCheck, Timer, Upload, Video,
} from 'lucide-react';
import {
  publicApi, assessmentProctorApi, assessmentVideoEndpoints,
  type AssessmentAnswer, type PublicAssessmentQuestion,
} from '@/lib/services/public-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { videoRecordingSupported } from '@/lib/utils/interviewMedia';
import { useProctor } from '@/lib/hooks/mentee/useProctor';
import { useScreenShare } from '@/lib/hooks/mentee/useScreenShare';
import { useAnswerUploads } from '@/lib/hooks/mentee/useAnswerUploads';
import { useVideoTake } from '@/lib/hooks/mentee/useVideoTake';
import { VideoAnswer } from '@/components/mentee/VideoAnswer';
import { CodeEditor } from '@/components/shared/CodeEditor';
import {
  ScreenShareStep, DeviceProblemNotice, CameraOffOverlay, ScreenOffOverlay, UploadProblemDialog,
  browserCapabilities, deviceProblemFor,
} from '@/components/mentee/proctoring/ProctorUI';

export interface RunnerAssessment {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  timeLimitMins?: number | null;
  enforceTimeLimit?: boolean;
  proctored?: boolean;
  required: boolean;
  questions: PublicAssessmentQuestion[];
}

export interface RunnerSubmission {
  status: string;
  submittedAt?: string;
  submissionCount?: number;
  startedAt?: string | null;
  deadlineAt?: string | null;
  answers?: Record<string, AssessmentAnswer>;
}

type Phase = 'overview' | 'setup' | 'answering' | 'submitting' | 'done';

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
const mmss = (secs: number) => `${Math.floor(Math.max(0, secs) / 60)}:${String(Math.max(0, secs) % 60).padStart(2, '0')}`;
const input = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card';

/** Has this question been answered? (Code left as the starter isn't.) */
function answered(q: PublicAssessmentQuestion, a?: AssessmentAnswer, take?: Blob | null): boolean {
  if (!a && !take) return false;
  switch (q.type) {
    case 'mcq': case 'multi_select': case 'true_false': return !!a?.optionIds?.length;
    case 'file_upload': return !!a?.fileUrl;
    case 'external_link': return !!a?.link?.trim();
    case 'video': return !!(a?.videoUrl || take);
    case 'code': {
      const starter = String(q.config?.starterCode || '').trim();
      return !!a?.text?.trim() && a.text.trim() !== starter;
    }
    default: return !!a?.text?.trim();
  }
}

/**
 * An applicant taking their intake assessment, through their private link.
 *
 * One flow for every kind of assessment: an overview that says what it asks of
 * them (time, camera, screen, a computer), a setup step when it needs the
 * camera or the screen, then the questions — every type, with autosave — and a
 * submit that sends every video first. A timed one counts down from when they
 * started (the server's clock, so a refresh doesn't reset it) and submits by
 * itself at zero. A proctored one is watched the same way quizzes and
 * interviews are, through the same hooks and screens.
 */
export function AssessmentRunner({
  token, assessment, submission, canEdit, assessmentDeadline, serverNow, onChanged,
}: {
  token: string;
  assessment: RunnerAssessment;
  submission: RunnerSubmission | null;
  /** The server says they may (still) answer: open, not decided, not one-sitting-and-done. */
  canEdit: boolean;
  assessmentDeadline?: string | null;
  serverNow?: string;
  /** After a start / submit, so the page reloads its status. */
  onChanged: () => void;
}) {
  const questions = assessment.questions;
  const proctored = !!assessment.proctored;
  const timed = !!(assessment.enforceTimeLimit && assessment.timeLimitMins);
  const hasVideo = questions.some((q) => q.type === 'video');
  const cameraRequired = proctored || hasVideo;
  const oneSitting = proctored || timed;
  const deviceProblem = deviceProblemFor({ screenRequired: proctored, hasVideo });
  const submitted = !!submission && submission.status !== 'in_progress';
  const inProgress = submission?.status === 'in_progress' && !!submission.startedAt;

  const [phase, setPhase] = useState<Phase>(() => (inProgress && !cameraRequired ? 'answering' : 'overview'));
  const [answers, setAnswers] = useState<Record<string, AssessmentAnswer>>(submission?.answers || {});
  const answersRef = useRef(answers);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  const [takes, setTakes] = useState<Record<string, Blob>>({});
  const [deadlineAt, setDeadlineAt] = useState<string | null>(submission?.deadlineAt || null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [uploadProblem, setUploadProblem] = useState<number | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(questions[0]?.id ?? null);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const skewRef = useRef(serverNow ? Date.parse(serverNow) - Date.now() : 0);
  const submittingRef = useRef(false);

  // Setup and the session camera.
  const [setupStream, setSetupStream] = useState<MediaStream | null>(null);
  const setupRef = useRef<MediaStream | null>(null);
  const setupVideoRef = useRef<HTMLVideoElement | null>(null);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const camRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const proctorApi = useMemo(() => assessmentProctorApi(token), [token]);
  const uploadTargets = useMemo(() => ({ video: assessmentVideoEndpoints(token) }), [token]);
  const logRef = useRef<(type: string, meta?: Record<string, unknown>) => void>(() => { });
  const screen = useScreenShare((type, meta) => logRef.current(type, meta));
  const uploads = useAnswerUploads(uploadTargets);
  const answering = phase === 'answering';
  const proctor = useProctor({
    // The private link stands in for a session id: these endpoints are keyed on it.
    sessionId: answering ? token : null,
    active: answering && cameraRequired,
    videoRef,
    cameraRequired,
    cameraSnapshots: proctored,
    screenStream: proctored ? screen.stream : null,
    currentQuestionId: focusedId,
    api: proctorApi,
  });
  useEffect(() => { logRef.current = proctor.log; }, [proctor.log]);

  const setAnswer = useCallback((qId: string, patch: AssessmentAnswer) => {
    setAnswers((prev) => ({ ...prev, [qId]: { ...prev[qId], ...patch } }));
    setMissing((m) => { if (!m.has(qId)) return m; const n = new Set(m); n.delete(qId); return n; });
  }, []);

  const take = useVideoTake({
    getCameraTrack: () => camRef.current?.getVideoTracks()[0] ?? null,
    onTake: (qId, blob) => {
      setTakes((prev) => ({ ...prev, [qId]: blob }));
      void uploads.upload(token, qId, 'video', blob);
    },
    onCaptions: (qId, text) => setAnswer(qId, { transcript: text }),
    log: proctor.log,
    captureNow: proctor.captureNow,
  });
  // A finished upload is what the server holds: show it as saved.
  useEffect(() => {
    for (const [qId, st] of Object.entries(uploads.status)) {
      if (st.state === 'saved' && st.url && answersRef.current[qId]?.videoUrl !== st.url) setAnswer(qId, { videoUrl: st.url });
    }
  }, [uploads.status, setAnswer]);

  // ── Autosave (once started) ────────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!answering || submitted) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaveState('saving');
      publicApi.saveAssessmentDraft(token, answersRef.current)
        .then(() => setSaveState('saved'))
        .catch((e) => {
          setSaveState('idle');
          const msg = extractApiErrorMessage(e, '');
          if (/time is up/i.test(msg)) { toast.message(msg); onChanged(); }
        });
    }, 1500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [answers, answering, submitted, token, onChanged]);

  // ── The clock ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!answering || !deadlineAt) { setRemaining(null); return; }
    const end = Date.parse(deadlineAt);
    const tick = () => {
      const left = Math.round((end - (Date.now() + skewRef.current)) / 1000);
      setRemaining(left);
      if (left <= 0 && !submittingRef.current) {
        toast.message('Time is up — submitting what you have.');
        void submit({ auto: true });
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answering, deadlineAt]);

  // ── Setup ──────────────────────────────────────────────────────────────────
  const releaseSetup = () => { setupRef.current?.getTracks().forEach((t) => t.stop()); setupRef.current = null; setSetupStream(null); };
  const enterSetup = async () => {
    setPhase('setup');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: hasVideo });
      setupRef.current = stream;
      setSetupStream(stream);
    } catch {
      toast.error(hasVideo ? 'Camera and microphone access are needed. Allow them and try again.' : 'Camera access is needed. Allow it and try again.');
    }
  };
  useEffect(() => {
    if (phase === 'setup' && setupVideoRef.current && setupStream) {
      setupVideoRef.current.srcObject = setupStream;
      setupVideoRef.current.play().catch(() => { });
    }
  }, [phase, setupStream]);
  useEffect(() => {
    if (answering && videoRef.current && camStream) {
      videoRef.current.srcObject = camStream;
      videoRef.current.play().catch(() => { });
    }
  }, [answering, camStream]);

  /** Start (or resume): the server starts the clock and checks this browser can run it. True when answering. */
  const begin = async (): Promise<boolean> => {
    try {
      const res = await publicApi.startAssessment(token, browserCapabilities());
      if (res.serverNow) skewRef.current = Date.parse(res.serverNow) - Date.now();
      if (res.status !== 'in_progress') { toast.message('Time is up — your saved answers were submitted.'); onChanged(); return false; }
      setDeadlineAt(res.deadlineAt);
      setPhase('answering');
      return true;
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not start the assessment'));
      return false;
    }
  };

  const startFromSetup = async () => {
    if (proctored && !screen.live) { toast.error('Share your entire screen to start.'); return; }
    const video = setupRef.current?.getVideoTracks() ?? [];
    if (cameraRequired && !video.length) { toast.error('Turn your camera on to start.'); return; }
    // The session camera is the setup's own video track; the preview is only let
    // go once the start has worked, so a failed start leaves them ready to retry.
    camRef.current = new MediaStream(video);
    setCamStream(camRef.current);
    if (proctored) await proctor.requestFullscreen(); // must ride this click
    if (await begin()) {
      setupRef.current?.getAudioTracks().forEach((t) => t.stop());
      setupRef.current = null;
      setSetupStream(null);
    }
  };

  const recoverCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      camRef.current?.getTracks().forEach((t) => t.stop());
      camRef.current = stream;
      setCamStream(stream);
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => { }); }
    } catch {
      toast.error('Still no camera access — enable it for this site in your browser, then retry.');
    }
  };

  // Stopping the screen share mid-take stops the take (the overlay covers its button).
  useEffect(() => {
    if (proctored && !screen.live && answering && take.recording) void take.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.live]);

  useEffect(() => () => {
    camRef.current?.getTracks().forEach((t) => t.stop());
    setupRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // ── Answers ────────────────────────────────────────────────────────────────
  const toggleOption = (q: PublicAssessmentQuestion, optId: string) => {
    const current = answers[q.id]?.optionIds || [];
    if (q.type === 'multi_select') {
      setAnswer(q.id, { optionIds: current.includes(optId) ? current.filter((x) => x !== optId) : [...current, optId] });
    } else {
      setAnswer(q.id, { optionIds: [optId] });
    }
  };
  const handleUpload = async (qId: string, file: File) => {
    setUploadingId(qId);
    try {
      const res = await publicApi.uploadFile(token, file);
      setAnswer(qId, { fileUrl: res.url, fileName: res.fileName });
      toast.success('File uploaded');
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Upload failed')); } finally { setUploadingId(null); }
  };

  const answeredCount = questions.filter((q) => answered(q, answers[q.id], takes[q.id])).length;

  // ── Submit ─────────────────────────────────────────────────────────────────
  const submit = async ({ auto = false, force = false }: { auto?: boolean; force?: boolean } = {}) => {
    if (submittingRef.current) return;
    if (!auto && !force) {
      const gaps = questions.filter((q) => q.required && !answered(q, answers[q.id], takes[q.id])).map((q) => q.id);
      if (gaps.length) {
        setMissing(new Set(gaps));
        document.getElementById(`aq-${gaps[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast.error(`Answer the ${gaps.length === 1 ? 'question' : `${gaps.length} questions`} marked in red first.`);
        return;
      }
    }
    submittingRef.current = true;
    setUploadProblem(null);
    setPhase('submitting');
    try {
      await take.stop();
      const unsent = await uploads.flush(token);
      if (unsent.length && !auto && !force) {
        submittingRef.current = false;
        setUploadProblem(unsent.length);
        setPhase('answering');
        return;
      }
      await proctor.flush();
      await publicApi.submitAssessment(token, answersRef.current);
      camRef.current?.getTracks().forEach((t) => t.stop());
      screen.stop();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
      setPhase('done');
      toast.success('Assessment submitted');
      if (unsent.length) void uploads.flush(token);
      onChanged();
    } catch (e) {
      const msg = extractApiErrorMessage(e, 'Could not submit your assessment');
      submittingRef.current = false;
      if (/time is up|already submitted/i.test(msg)) { toast.message(msg); setPhase('done'); onChanged(); return; }
      toast.error(msg);
      setPhase('answering');
    }
  };

  // ── Header bits shared by every phase ──────────────────────────────────────
  const meta = (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
      {assessmentDeadline && <span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />Due {fmt(assessmentDeadline)}</span>}
      {assessment.timeLimitMins ? (
        <span className="inline-flex items-center gap-1"><Timer className="w-3.5 h-3.5" />{timed ? `${assessment.timeLimitMins} min once you start` : `About ${assessment.timeLimitMins} min`}</span>
      ) : null}
      <span className="inline-flex items-center gap-1"><ListChecks className="w-3.5 h-3.5" />{questions.length} question{questions.length === 1 ? '' : 's'}</span>
      {proctored && <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" />Proctored</span>}
    </div>
  );
  const title = (
    <div className="flex items-center gap-2">
      <Clock className="w-4 h-4 text-brand-600" />
      <h2 className="font-semibold text-slate-900">{assessment.title}</h2>
      {assessment.required && <span className="text-xs rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">Required</span>}
    </div>
  );

  // ── Done / closed / submitted ──────────────────────────────────────────────
  if (phase === 'done' || (submitted && phase === 'overview') || (!canEdit && phase === 'overview')) {
    return (
      <div className="mt-6 rounded-2xl border border-slate-200 bg-card p-6">
        {title}
        {meta}
        <div className="mt-4">
          {submitted || phase === 'done' ? (
            <p className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4" /> Submitted{submission?.submittedAt ? ` · ${fmt(submission.submittedAt)}` : ''}.
              {!oneSitting && (submission?.submissionCount || 1) > 1 ? ` We'll review your latest answers (updated ${submission!.submissionCount}×).` : ' We\'ll review it and be in touch by email.'}
            </p>
          ) : (
            <p className="text-sm text-slate-600">This assessment is closed.</p>
          )}
          {uploads.unsent > 0 && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <Loader2 className="w-4 h-4 animate-spin" />Still sending {uploads.unsent} video{uploads.unsent === 1 ? '' : 's'} — keep this page open a moment.
            </p>
          )}
          {canEdit && submitted && !oneSitting && phase !== 'done' && (
            <button onClick={() => setPhase('answering')} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:border-brand-300 hover:text-brand-700">
              <Pencil className="w-4 h-4" /> Update my answers
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Overview ───────────────────────────────────────────────────────────────
  if (phase === 'overview') {
    return (
      <div className="mt-6 rounded-2xl border border-slate-200 bg-card p-6">
        {title}
        {meta}
        {assessment.description && <p className="mt-3 text-sm text-slate-600 whitespace-pre-wrap">{assessment.description}</p>}
        {assessment.instructions && <p className="mt-2 text-sm text-slate-500 whitespace-pre-wrap rounded-lg bg-slate-50 dark:bg-white/5 p-3">{assessment.instructions}</p>}
        {(timed || proctored || hasVideo) && (
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            {timed && <li className="flex gap-2"><Timer className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />You have {assessment.timeLimitMins} minutes once you start. The clock keeps running if you close the page, and it submits by itself at zero.</li>}
            {proctored && <li className="flex gap-2"><Monitor className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />Proctored: your camera stays on and your entire screen is shared the whole time. Pictures of both are taken at random moments, and leaving the page is noted.</li>}
            {hasVideo && <li className="flex gap-2"><Video className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />Some questions are answered on camera — you record a short video.</li>}
            {oneSitting && <li className="flex gap-2"><AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />One sitting: once you submit, you can&apos;t change your answers.</li>}
          </ul>
        )}
        {deviceProblem ? (
          <div className="mt-5"><DeviceProblemNotice problem={deviceProblem} noun="assessment" tone="light" /></div>
        ) : (
          <button onClick={() => (cameraRequired ? void enterSetup() : void begin())}
            className="mt-6 inline-flex items-center gap-2 px-6 h-11 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium">
            <Play className="w-4 h-4" />{inProgress ? 'Continue my assessment' : cameraRequired ? 'Continue to setup' : 'Start assessment'}
          </button>
        )}
      </div>
    );
  }

  // ── Setup (camera / screen) ────────────────────────────────────────────────
  if (phase === 'setup') {
    const camReady = !!setupStream?.getVideoTracks().length;
    return (
      <div className="mt-6 rounded-2xl border border-slate-200 bg-card p-6">
        <h2 className="font-semibold text-slate-900">Set up for your assessment</h2>
        <p className="text-sm text-slate-500 mt-1">{proctored ? 'Turn on your camera and share your entire screen.' : 'Turn on your camera — some answers are recorded on video.'}</p>
        <div className="mt-4 rounded-xl overflow-hidden bg-slate-900 aspect-video flex items-center justify-center">
          {camReady
            ? <video ref={setupVideoRef} muted playsInline className="w-full h-full object-cover -scale-x-100" />
            : <span className="text-slate-400 text-sm inline-flex items-center gap-2"><Video className="w-4 h-4" />Waiting for your camera…</span>}
        </div>
        {!camReady && <button type="button" onClick={() => void enterSetup()} className="mt-2 text-xs text-brand-600 hover:text-brand-700">Ask for the camera again</button>}
        {proctored && <div className="mt-4"><ScreenShareStep screen={screen} tone="light" /></div>}
        <div className="mt-4 flex items-start gap-2 text-xs text-slate-500 bg-slate-50 dark:bg-white/5 rounded-lg p-3 border border-slate-200">
          <ShieldCheck className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
          {timed ? 'The clock starts when you press Start and keeps running if you leave. ' : ''}Turning the camera off{proctored ? ' or stopping the screen share' : ''} pauses you until it&apos;s back, and is noted for the reviewers.
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button onClick={() => { releaseSetup(); screen.stop(); setPhase('overview'); }} className="px-4 py-2 text-slate-600 text-sm hover:text-slate-900">Back</button>
          <button onClick={() => void startFromSetup()} disabled={!camReady || (proctored && !screen.live)}
            className="inline-flex items-center gap-2 px-6 h-11 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium disabled:opacity-50">
            {inProgress ? 'Continue' : 'Start'} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Answering / submitting ─────────────────────────────────────────────────
  const lowTime = remaining !== null && remaining <= 60;
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-card">
      {/* Sticky bar: the clock, proctoring, progress, autosave. */}
      <div className="sticky top-0 z-10 rounded-t-2xl border-b border-slate-200 bg-card/95 backdrop-blur px-6 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="font-semibold text-slate-900 min-w-0 truncate">{assessment.title}</h2>
          <span className="text-xs text-slate-500 tabular-nums">{answeredCount}/{questions.length} answered</span>
          <span className="text-xs text-slate-400">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}</span>
          <div className="ml-auto flex items-center gap-2">
            {proctored && (
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${proctor.focusLosses ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                <Eye className="w-3.5 h-3.5" />Proctored{proctor.focusLosses ? ` · ${proctor.focusLosses}` : ''}
              </span>
            )}
            {remaining !== null && (
              <span className={`inline-flex items-center gap-1 text-sm px-2.5 py-1 rounded-lg tabular-nums font-medium ${lowTime ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                <Clock className="w-3.5 h-3.5" />{mmss(remaining)}
              </span>
            )}
          </div>
        </div>
        {proctored && !proctor.isFullscreen && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            <span className="inline-flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />You left fullscreen. This is noted for the reviewers.</span>
            <button onClick={() => proctor.requestFullscreen()} className="inline-flex items-center gap-1 px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-medium">
              <Maximize2 className="w-3 h-3" />Fullscreen
            </button>
          </div>
        )}
      </div>

      <div className="p-6">
        {assessment.instructions && <p className="mb-6 text-sm text-slate-500 whitespace-pre-wrap rounded-lg bg-slate-50 dark:bg-white/5 p-3">{assessment.instructions}</p>}
        <div className="space-y-7">
          {questions.map((q, idx) => {
            const a = answers[q.id];
            const isMissing = missing.has(q.id);
            return (
              <div key={q.id} id={`aq-${q.id}`} onFocusCapture={() => setFocusedId(q.id)} onPointerDown={() => setFocusedId(q.id)}
                className={`rounded-xl ${isMissing ? 'ring-2 ring-rose-400 p-3 -m-3' : ''}`}>
                <p className="font-medium text-slate-800"><span className="text-slate-400 mr-1">{idx + 1}.</span>{q.prompt}{q.required && <span className="text-rose-500"> *</span>}</p>
                {q.type === 'multi_select' && <p className="text-xs text-slate-500 mt-0.5">Select all that apply.</p>}
                <div className="mt-2">
                  {(q.type === 'mcq' || q.type === 'multi_select' || q.type === 'true_false') && (
                    <div className={q.type === 'true_false' ? 'grid grid-cols-2 gap-2 max-w-sm' : 'space-y-2'}>
                      {(q.type === 'true_false' && !q.options?.length ? [{ id: 'true', label: 'True' }, { id: 'false', label: 'False' }] : q.options).map((opt) => {
                        const checked = (a?.optionIds || []).includes(opt.id);
                        return (
                          <label key={opt.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm ${checked ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/15' : 'border-slate-200 hover:bg-slate-50 dark:hover:bg-white/5'}`}>
                            <input type={q.type === 'multi_select' ? 'checkbox' : 'radio'} name={q.id} checked={checked} onChange={() => toggleOption(q, opt.id)} className="accent-brand-600" />{opt.label}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {q.type === 'short_text' && <input value={a?.text || ''} onChange={(e) => setAnswer(q.id, { text: e.target.value })} className={input} />}
                  {q.type === 'long_text' && <textarea rows={5} value={a?.text || ''} onChange={(e) => setAnswer(q.id, { text: e.target.value })} className={input} />}
                  {q.type === 'external_link' && <input type="url" placeholder="https://…" value={a?.link || ''} onChange={(e) => setAnswer(q.id, { link: e.target.value })} className={input} />}
                  {q.type === 'file_upload' && (
                    <div>
                      <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5">
                        {uploadingId === q.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{a?.fileName ? 'Replace file' : 'Upload file'}
                        <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(q.id, f); }} />
                      </label>
                      {a?.fileName && <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-600"><FileUp className="w-4 h-4 text-brand-600" /> {a.fileName}</p>}
                    </div>
                  )}
                  {q.type === 'code' && (
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 text-slate-300 text-xs">
                        <span className="inline-flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5" />{String(q.config?.codeLanguage || 'code')}</span>
                        <span className="text-slate-500">{proctored ? 'Paste disabled · ' : ''}reviewed by the team</span>
                      </div>
                      <CodeEditor
                        value={a?.text ?? String(q.config?.starterCode || '')}
                        language={String(q.config?.codeLanguage || 'javascript')}
                        onChange={(v) => setAnswer(q.id, { text: v })}
                        allowPaste={!proctored}
                        onPasteBlocked={() => { proctor.log('paste_blocked', { field: 'code' }); toast.message('Pasting is disabled in this assessment.'); }}
                        minHeight="260px"
                      />
                    </div>
                  )}
                  {q.type === 'video' && (
                    <VideoAnswer
                      tone="light"
                      supported={videoRecordingSupported()}
                      recording={take.recording && take.questionId === q.id}
                      elapsed={take.elapsed}
                      maxSeconds={Number(q.config?.maxRecordingSeconds) || 120}
                      liveStream={take.stream}
                      cameraStream={camStream}
                      takeBlob={takes[q.id] || null}
                      savedUrl={a?.videoUrl || null}
                      upload={uploads.status[q.id]}
                      transcript={a?.transcript || ''}
                      disabled={take.recording || (cameraRequired && !proctor.cameraLive)}
                      onStart={() => { setFocusedId(q.id); void take.start(q.id, Number(q.config?.maxRecordingSeconds) || 120); }}
                      onStop={() => void take.stop()}
                      onRetry={() => { const b = takes[q.id]; if (b) void uploads.upload(token, q.id, 'video', b); }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8">
          <button onClick={() => void submit()} disabled={phase === 'submitting' || take.recording}
            className="w-full h-11 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {phase === 'submitting' && <Loader2 className="w-4 h-4 animate-spin" />}
            {phase === 'submitting' ? (uploads.unsent ? `Sending ${uploads.unsent} video${uploads.unsent === 1 ? '' : 's'}…` : 'Submitting…') : submitted ? 'Save changes' : 'Submit assessment'}
          </button>
          <p className="mt-2 text-center text-xs text-slate-400">
            {take.recording ? 'Stop recording before you submit.'
              : oneSitting ? 'Once you submit, your answers are final.'
                : assessmentDeadline ? <>You can update your answers until <span className="font-medium">{fmt(assessmentDeadline)}</span>. We review your latest version.</> : 'Your answers save as you go. We review your latest version.'}
          </p>
        </div>
      </div>

      {/* Corner camera preview — the snapshots are taken from it. */}
      {cameraRequired && (
        <div className="fixed bottom-6 right-6 z-20">
          <video ref={videoRef} muted playsInline className="w-36 h-24 rounded-xl object-cover bg-slate-900 border border-slate-200 shadow-lg -scale-x-100" />
          <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />{proctored ? 'PROCTORED' : 'CAMERA'}
          </span>
        </div>
      )}

      {cameraRequired && !proctor.cameraLive && <CameraOffOverlay noun="assessment" onRetry={recoverCamera} />}
      {proctored && !screen.live && proctor.cameraLive && (
        <ScreenOffOverlay noun="assessment" screen={screen} onShared={() => { proctor.log('screen_share_restored'); void proctor.requestFullscreen(); }} />
      )}
      {uploadProblem !== null && (
        <UploadProblemDialog count={uploadProblem} onRetry={() => void submit({ force: false, auto: false })} onSubmitAnyway={() => void submit({ force: true })} />
      )}
    </div>
  );
}
