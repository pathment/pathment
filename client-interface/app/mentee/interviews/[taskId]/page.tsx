'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Mic, MicOff, Loader2, ArrowRight, CheckCircle2, Video, VideoOff, Volume2,
  Code2, Type, AlertTriangle, Play, RotateCcw, Maximize2, Eye, ShieldCheck,
} from 'lucide-react';
import {
  interviewApi, type CandidateInterview, type CandidateQuestion,
} from '@/lib/services/interview-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import {
  speak, stopSpeaking, createRecognizer, VoiceRecorder,
  recognitionSupported, recorderSupported,
} from '@/lib/utils/interviewMedia';
import { useProctor } from '@/lib/hooks/mentee/useProctor';
import { useAudioLevel } from '@/lib/hooks/mentee/useAudioLevel';
import { CodeEditor } from '@/components/shared/CodeEditor';
import { InterviewerOrb, Waveform, RingTimer, MicCheck } from '@/components/mentee/interviewStudio';
import {
  setActiveInterview,
  clearActiveInterview,
  isResumableInterview,
} from '@/lib/utils/activeInterview';

type Phase = 'loading' | 'intro' | 'lobby' | 'countdown' | 'active' | 'submitting' | 'done' | 'error';
interface Draft { transcript: string; code: string; answerText: string; seconds: number; audioBlob: Blob | null }

const DEFAULT_NAME = 'Aria';
const STUDIO = 'bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950';

export default function InterviewRunnerPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = use(params);
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [data, setData] = useState<CandidateInterview | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const [recording, setRecording] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [totalRemaining, setTotalRemaining] = useState<number | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // Green room / countdown / live meter.
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);
  const [micHeard, setMicHeard] = useState(false);
  const [countdownN, setCountdownN] = useState(3);

  const recorderRef = useRef<VoiceRecorder | null>(null);
  const recognizerRef = useRef<ReturnType<typeof createRecognizer>>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lobbyVideoRef = useRef<HTMLVideoElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockSkewRef = useRef(0);
  const pendingAudioRef = useRef<Map<string, Blob>>(new Map());
  const finishingRef = useRef(false);
  const promptAudioRef = useRef<HTMLAudioElement | null>(null);
  // Fresh mirrors of state for the debounced autosave and the timer-driven
  // auto-advance flush (their closures would otherwise be stale and save empty
  // answers over typed ones). recordingQuestionIdRef pins a clip to the question
  // it was recorded for, even if navigation moves on during the async stop.
  const draftsRef = useRef(drafts);
  const recordingRef = useRef(recording);
  const recordingQuestionIdRef = useRef<string | null>(null);

  // A mentor-requested redo re-presents ONLY the flagged questions.
  const redoQuestionIds = data?.state?.redoQuestionIds ?? [];
  const isRedo = redoQuestionIds.length > 0;
  const questions = useMemo(() => {
    const all = data?.questions ?? [];
    return isRedo ? all.filter((qq) => redoQuestionIds.includes(qq.id)) : all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isRedo]);
  const q: CandidateQuestion | undefined = questions[idx];
  const draft = q ? drafts[q.id] : undefined;
  const cameraRequired = !!data?.options.cameraRequired;
  const interviewerName = data?.interviewer?.name || DEFAULT_NAME;
  const ttsOpts = { pitch: data?.interviewer?.pitch, rate: data?.interviewer?.rate, voiceName: data?.interviewer?.voiceName };

  // Live mic level: the preview stream in the green room, the recorder stream while
  // answering by voice.
  const meterStream = phase === 'lobby' ? previewStream : (recording ? recordingStream : null);
  const level = useAudioLevel(meterStream);

  const proctor = useProctor({
    sessionId,
    active: phase === 'active',
    videoRef,
    cameraRequired,
    currentQuestionId: q?.id ?? null,
  });

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    interviewApi.getCandidateInterview(taskId)
      .then((res: any) => {
        if (!active) return;
        const d: CandidateInterview = res?.data;
        setData(d);
        if (d?.serverNow) clockSkewRef.current = Date.parse(d.serverNow) - Date.now();
        setSessionStartedAt(d?.state?.sessionStartedAt || null);
        if (!isResumableInterview(d)) clearActiveInterview();
        const seed: Record<string, Draft> = {};
        d.questions.forEach((qq) => {
          const saved = d.state.savedAnswers.find((a) => a.questionId === qq.id);
          seed[qq.id] = {
            transcript: saved?.transcript || '',
            code: saved?.code ?? qq.starterCode ?? '',
            answerText: saved?.answerText || '',
            seconds: saved?.timeSpentSeconds || 0,
            audioBlob: null,
          };
        });
        setDrafts(seed);
        setPhase('intro');
      })
      .catch((e: any) => {
        if (!active) return;
        if (e?.response?.status === 404) clearActiveInterview();
        setErrorMsg(extractApiErrorMessage(e, 'Could not load this interview'));
        setPhase('error');
      });
    return () => { active = false; };
  }, [taskId]);

  // Keep a ref of the preview stream so we can stop it on unmount.
  useEffect(() => { previewRef.current = previewStream; }, [previewStream]);
  useEffect(() => { draftsRef.current = drafts; }, [drafts]);
  useEffect(() => { recordingRef.current = recording; }, [recording]);

  // Attach the preview stream to the green-room <video>.
  useEffect(() => {
    if (phase === 'lobby' && lobbyVideoRef.current && previewStream) {
      lobbyVideoRef.current.srcObject = previewStream;
      lobbyVideoRef.current.play().catch(() => { });
    }
  }, [phase, previewStream]);

  // Register "mic works" once the level crosses a speech threshold in the lobby.
  useEffect(() => {
    if (phase === 'lobby' && level > 0.15) setMicHeard(true);
  }, [phase, level]);

  // Attach the session camera stream to the PiP <video> when active.
  useEffect(() => {
    if (phase === 'active' && videoRef.current && camStreamRef.current) {
      videoRef.current.srcObject = camStreamRef.current;
      videoRef.current.play().catch(() => { });
    }
  }, [phase]);

  // ── Per-question timer (wall-clock, server-authoritative) ────────────────────
  useEffect(() => {
    if (phase !== 'active' || !q || !sessionId) return;
    if (data?.options.timingMode !== 'per_question') { setRemaining(null); return; }
    const limit = q.timeLimitSeconds;
    if (!limit) { setRemaining(null); return; }

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    (async () => {
      let startedAtMs = Date.now();
      let skew = clockSkewRef.current;
      try {
        const res: any = await interviewApi.startQuestion(sessionId, q.id);
        if (res?.data?.startedAt) startedAtMs = Date.parse(res.data.startedAt);
        if (res?.data?.serverNow) { skew = Date.parse(res.data.serverNow) - Date.now(); clockSkewRef.current = skew; }
      } catch {
        const seeded = data?.state.savedAnswers.find((a) => a.questionId === q.id)?.startedAt;
        if (seeded) startedAtMs = Date.parse(seeded);
      }
      if (cancelled) return;

      const deadline = startedAtMs + limit * 1000;
      const compute = () => Math.round((deadline - (Date.now() + skew)) / 1000);
      const recordSpent = (left: number) =>
        setDrafts((prev) => (q ? { ...prev, [q.id]: { ...prev[q.id], seconds: Math.min(limit, Math.max(0, limit - left)) } } : prev));

      let left = compute();
      setRemaining(left);
      recordSpent(left);
      if (left <= 0) { advance(true); return; }
      interval = setInterval(() => {
        if (finishingRef.current) { if (interval) clearInterval(interval); return; }
        left = compute();
        setRemaining(left);
        recordSpent(left);
        if (left <= 0) { if (interval) clearInterval(interval); advance(true); }
      }, 1000);
    })();

    return () => { cancelled = true; if (interval) clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx, sessionId]);

  // ── Global total timer (only in 'total' timing mode) ─────────────────────────
  useEffect(() => {
    if (phase !== 'active' || data?.options.timingMode !== 'total') return;
    const total = data?.options.totalSeconds;
    if (!total) return;
    const startMs = sessionStartedAt ? Date.parse(sessionStartedAt) : Date.now();
    const skew = clockSkewRef.current;
    const deadline = startMs + total * 1000;
    const compute = () => Math.round((deadline - (Date.now() + skew)) / 1000);

    let left = compute();
    setTotalRemaining(left);
    if (left <= 0) { finish(); return; }
    const tick = setInterval(() => {
      if (finishingRef.current) { clearInterval(tick); return; }
      left = compute();
      setTotalRemaining(left);
      if (left <= 0) { clearInterval(tick); finish(); }
    }, 1000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sessionStartedAt]);

  // Stop any interviewer audio/TTS in flight.
  const stopAsking = () => {
    stopSpeaking();
    if (promptAudioRef.current) { try { promptAudioRef.current.pause(); } catch { /* noop */ } promptAudioRef.current = null; }
    setSpeaking(false);
  };

  // Ask a question: play the mentor's own recording if there is one, else read it
  // aloud with the kit's interviewer voice (name/pitch/speed/voice). Falls back to
  // TTS if the recording can't play.
  const askQuestion = (question: CandidateQuestion) => {
    stopSpeaking();
    if (promptAudioRef.current) { try { promptAudioRef.current.pause(); } catch { /* noop */ } promptAudioRef.current = null; }
    if (question.promptAudioUrl) {
      const el = new Audio(question.promptAudioUrl);
      promptAudioRef.current = el;
      setSpeaking(true);
      el.onended = () => setSpeaking(false);
      const fallback = () => { setSpeaking(false); speak(question.prompt, { ...ttsOpts, onEnd: () => setSpeaking(false) }); };
      el.onerror = fallback;
      el.play().catch(fallback);
    } else {
      setSpeaking(true);
      speak(question.prompt, { ...ttsOpts, onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) });
    }
  };

  // Ask the prompt when arriving at a question (animates the interviewer).
  useEffect(() => {
    if (phase === 'active' && q) askQuestion(q);
    return () => { stopAsking(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx]);

  // ── Autosave the current draft (debounced) ───────────────────────────────────
  const queueSave = useCallback((questionId: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [questionId]: { ...prev[questionId], ...patch } }));
    if (!sessionId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // Read the freshest draft from the ref, not a stale closure, so we never
      // autosave an out-of-date snapshot over newer text.
      const d = { ...draftsRef.current[questionId], ...patch };
      interviewApi.saveAnswer(sessionId, {
        questionId,
        transcript: d.transcript || null,
        code: d.code || null,
        answerText: d.answerText || null,
        timeSpentSeconds: d.seconds,
      }).catch(() => { /* autosave is best-effort */ });
    }, 1200);
  }, [sessionId]);

  // ── Background audio upload (never blocks the candidate) ──────────────────────
  const uploadAudioBg = useCallback(async (sid: string, questionId: string, blob: Blob) => {
    pendingAudioRef.current.set(questionId, blob);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await interviewApi.uploadAnswerAudio(sid, questionId, blob);
        pendingAudioRef.current.delete(questionId);
        return true;
      } catch {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    return false;
  }, []);

  const flushPendingAudio = useCallback(async (sid: string) => {
    for (const [questionId, blob] of Array.from(pendingAudioRef.current.entries())) {
      try {
        await interviewApi.uploadAnswerAudio(sid, questionId, blob);
        pendingAudioRef.current.delete(questionId);
      } catch { /* give up — the transcript is saved either way */ }
    }
    if (pendingAudioRef.current.size) toast.message('Some audio could not be uploaded — your transcripts were saved.');
  }, []);

  // ── Recording (voice questions) ──────────────────────────────────────────────
  const toggleRecording = async () => {
    if (!q) return;
    if (recording) {
      recognizerRef.current?.stop();
      const blob = await recorderRef.current?.stop();
      setRecording(false);
      setRecordingStream(null);
      // Attribute the clip to the question it was RECORDED for, not whatever
      // question is on screen now (navigation can move on during the async stop).
      const owner = recordingQuestionIdRef.current || q.id;
      recordingQuestionIdRef.current = null;
      if (blob) {
        setDrafts((prev) => ({ ...prev, [owner]: { ...prev[owner], audioBlob: blob } }));
        if (sessionId) uploadAudioBg(sessionId, owner, blob);
      }
      return;
    }
    const rec = new VoiceRecorder();
    const ok = await rec.start();
    if (!ok) { toast.error('Microphone access is needed to answer by voice.'); return; }
    recorderRef.current = rec;
    recordingQuestionIdRef.current = q.id;
    setRecordingStream(rec.getStream());
    // Preserve whatever is already typed for this question: the recognizer builds
    // from empty, so APPEND its output to the existing transcript instead of
    // replacing it (that replace was wiping typed answers).
    const owner = q.id;
    const base = (draftsRef.current[owner]?.transcript || '').trim();
    recognizerRef.current = createRecognizer((text) => {
      const merged = base ? `${base}\n${text}`.trim() : text;
      queueSave(owner, { transcript: merged });
    });
    recognizerRef.current?.start();
    setRecording(true);
  };

  // ── Green room → countdown → start ───────────────────────────────────────────
  const enterLobby = async () => {
    setPhase('lobby');
    setMicHeard(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setPreviewStream(stream);
    } catch {
      if (!cameraRequired) {
        try { setPreviewStream(await navigator.mediaDevices.getUserMedia({ audio: true })); }
        catch { setPreviewStream(null); }
      } else {
        toast.error('Camera + microphone access is required. Please allow them and retry.');
        setPreviewStream(null);
      }
    }
  };

  const testVoice = () => {
    setSpeaking(true);
    speak(`Hi, I'm ${interviewerName}, your interviewer. When you're ready, click I'm ready to begin.`, {
      ...ttsOpts, onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false),
    });
  };

  const startFromLobby = async () => {
    // Keep the camera video track for the session; drop preview audio (the recorder
    // reopens the mic per answer).
    if (previewStream) {
      const vids = previewStream.getVideoTracks();
      previewStream.getAudioTracks().forEach((t) => t.stop());
      if (vids.length && cameraRequired) camStreamRef.current = new MediaStream(vids);
      else vids.forEach((t) => t.stop());
    }
    setPreviewStream(null);
    await proctor.requestFullscreen(); // must ride this user gesture
    setCountdownN(3);
    setPhase('countdown');
  };

  // Re-acquire the camera after the candidate turned it off mid-interview. The
  // proctor monitor watches videoRef's stream, so rebinding here clears the block.
  const recoverCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      camStreamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => { }); }
    } catch {
      toast.error('Still no camera access — enable it for this site in your browser, then retry.');
    }
  };

  // Drive the 3-2-1 and then actually start the session.
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdownN <= 0) { begin(); return; }
    const t = setTimeout(() => setCountdownN((n) => n - 1), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdownN]);

  const begin = async () => {
    try {
      const res: any = await interviewApi.startInterview(taskId);
      const session = res?.data?.session;
      setSessionId(session?.id);
      const startedAt = session?.startedAt || sessionStartedAt;
      setSessionStartedAt(startedAt || null);
      finishingRef.current = false;
      // A redo always starts at the first flagged question (the saved resume
      // position refers to the original full attempt, not this short list).
      const resumeIdx = isRedo ? 0 : Math.min(Math.max(0, data?.state.currentPosition ?? 0), questions.length - 1);
      setIdx(resumeIdx);
      const deadlineTs = (data?.options.timingMode === 'total' && startedAt && data?.options.totalSeconds)
        ? Date.parse(startedAt) + data.options.totalSeconds * 1000 - clockSkewRef.current
        : null;
      setActiveInterview({
        taskId,
        title: data?.kit.title || 'Interview',
        timingMode: data?.options.timingMode || 'per_question',
        deadlineTs,
      });
      setPhase('active');
    } catch (e: any) {
      toast.error(extractApiErrorMessage(e, 'Could not start the interview'));
      setPhase('lobby');
    }
  };

  const persistCurrent = async () => {
    if (!q || !sessionId) return;
    const question = q;
    let blob = draftsRef.current[question.id]?.audioBlob || null;
    let audioOwner = question.id;
    if (recordingRef.current) {
      recognizerRef.current?.stop();
      const stopped = await recorderRef.current?.stop();
      if (stopped) { blob = stopped; audioOwner = recordingQuestionIdRef.current || question.id; }
      recordingQuestionIdRef.current = null;
      setRecording(false);
      setRecordingStream(null);
    }
    // Read the draft AFTER the async stop — the recognizer may have just finalised
    // the transcript — and from the ref so we never serialise a stale/empty snapshot.
    const d = draftsRef.current[question.id];
    await interviewApi.saveAnswer(sessionId, {
      questionId: question.id,
      transcript: d?.transcript || null,
      code: d?.code || null,
      answerText: d?.answerText || null,
      timeSpentSeconds: d?.seconds || 0,
    }).catch(() => { });
    if (blob) uploadAudioBg(sessionId, audioOwner, blob);
  };

  const advance = async (auto = false) => {
    if (advancing || finishingRef.current) return;
    setAdvancing(true);
    stopAsking();
    try {
      if (idx < questions.length - 1) {
        await persistCurrent();
        setIdx((i) => i + 1);
      } else {
        await finish();
      }
    } finally {
      setAdvancing(false);
    }
    if (auto) toast.message('Time up — moving to the next question.');
  };

  const finish = async () => {
    if (!sessionId || finishingRef.current) return;
    finishingRef.current = true;
    setPhase('submitting');
    stopAsking();
    try {
      await persistCurrent();
      await flushPendingAudio(sessionId);
      await proctor.flush();
      await interviewApi.submitInterview(sessionId);
      clearActiveInterview();
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
      setPhase('done');
    } catch (e: any) {
      toast.error(extractApiErrorMessage(e, 'Could not submit the interview'));
      finishingRef.current = false;
      setPhase('active');
    }
  };

  // Cleanup media on unmount.
  useEffect(() => () => {
    stopSpeaking();
    promptAudioRef.current?.pause();
    recognizerRef.current?.stop();
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    previewRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // ── Renders ──────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return <Stage><Loader2 className="w-7 h-7 animate-spin text-slate-500" /></Stage>;
  }

  if (phase === 'submitting') {
    return (
      <Stage>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-400 mx-auto mb-3" />
          <p className="text-slate-100 font-medium">Submitting your interview…</p>
          <p className="text-slate-400 text-sm mt-1">Saving your answers and recordings.</p>
        </div>
      </Stage>
    );
  }

  if (phase === 'error') {
    return (
      <Stage>
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="text-slate-100 font-medium">{errorMsg}</p>
          <button onClick={() => router.push(`/mentee/tasks/${taskId}`)} className="mt-5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm">Back to task</button>
        </div>
      </Stage>
    );
  }

  if (phase === 'done') {
    return (
      <Stage>
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-9 h-9 text-emerald-400" />
          </div>
          <h1 className="text-xl font-semibold text-slate-100">Interview submitted</h1>
          <p className="text-slate-400 mt-2">Nice work. {interviewerName}&apos;s done — your mentor will review your answers and share feedback on your task page.</p>
          <button onClick={() => router.push(`/mentee/tasks/${taskId}`)} className="mt-6 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium">Back to task</button>
        </div>
      </Stage>
    );
  }

  // ── Intro (overview) ─────────────────────────────────────────────────────────
  if (phase === 'intro') {
    const submittedBefore = (data?.state.submittedCount || 0) > 0;
    const resuming = !!data?.state.activeSessionId;
    const cannot = !data?.state.canStart && !resuming;
    return (
      <Stage>
        <div className="max-w-lg w-full">
          <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-8 text-center">
            <div className="flex justify-center mb-4"><InterviewerOrb speaking={false} size={64} name={interviewerName} /></div>
            <h1 className="text-xl font-semibold text-slate-100">{data?.kit.title}</h1>
            <p className="text-slate-400 mt-1.5 text-sm">Meet <span className="text-brand-300 font-medium">{interviewerName}</span>, your interviewer.{data?.kit.description ? ` ${data.kit.description}` : ''}</p>

            {isRedo && (
              <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-left text-sm text-amber-100 flex items-start gap-2">
                <RotateCcw className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <span>Your mentor asked you to redo {questions.length} question{questions.length === 1 ? '' : 's'}. Only {questions.length === 1 ? 'that one' : 'those'} will be asked again — the rest of your answers are kept.</span>
              </div>
            )}

            <div className="flex items-center justify-center gap-5 mt-5 text-sm text-slate-300">
              <span>{questions.length} question{questions.length === 1 ? '' : 's'}</span>
              <span className="tabular-nums">{data?.kit.totalPoints} pts</span>
              <span>{data?.options.timingMode === 'total' ? `${Math.round((data?.options.totalSeconds || 0) / 60)} min total` : 'Timed per question'}</span>
            </div>

            <ul className="text-left text-sm text-slate-300 mt-6 space-y-2 bg-slate-900/50 rounded-xl p-4 border border-slate-700/60">
              <li className="flex gap-2"><Volume2 className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />{interviewerName} reads each question aloud, like a real interviewer.</li>
              <li className="flex gap-2"><Mic className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />You answer by voice — we transcribe and keep your recording.</li>
              {cameraRequired && <li className="flex gap-2"><Video className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />Your camera stays on during the interview.</li>}
              <li className="flex gap-2"><ArrowRight className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />You can&apos;t go back to a question once you move on.</li>
              <li className="flex gap-2"><AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />The clock runs continuously once you start. Refreshing, closing, or losing power/internet will <strong>not</strong> pause it — make sure your power and connection are stable.</li>
              {!data?.options.allowRetake && <li className="flex gap-2"><AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />One attempt only — make it count.</li>}
            </ul>

            {cannot ? (
              <div className="mt-6">
                <p className="text-sm text-slate-400">{submittedBefore ? 'You’ve already completed this interview.' : 'This interview isn’t available.'}</p>
                <button onClick={() => router.push(`/mentee/tasks/${taskId}`)} className="mt-4 px-5 py-2.5 border border-slate-600 text-slate-200 rounded-xl text-sm">Back to task</button>
              </div>
            ) : (
              <button onClick={enterLobby} className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium">
                {resuming ? <><RotateCcw className="w-4 h-4" /> Resume interview</> : isRedo ? <><RotateCcw className="w-4 h-4" /> Continue to redo</> : <><Play className="w-4 h-4" /> Continue to setup</>}
              </button>
            )}
          </div>
        </div>
      </Stage>
    );
  }

  // ── Green room (device check) ────────────────────────────────────────────────
  if (phase === 'lobby') {
    const camReady = !cameraRequired || !!previewStream?.getVideoTracks().length;
    const hasVideo = !!previewStream?.getVideoTracks().length;
    return (
      <Stage>
        <div className="max-w-md w-full rounded-2xl border border-slate-700 bg-slate-800/50 p-6">
          <div className="flex items-center gap-3 mb-4">
            <InterviewerOrb speaking={speaking} level={0} size={56} name={interviewerName} />
            <div>
              <h1 className="text-slate-100 font-semibold">Let’s check your setup</h1>
              <p className="text-slate-400 text-sm">{interviewerName} will meet you on the other side.</p>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden bg-slate-900 aspect-video flex items-center justify-center border border-slate-700">
            {hasVideo
              ? <video ref={lobbyVideoRef} muted playsInline className="w-full h-full object-cover" />
              : <div className="text-slate-500 text-sm inline-flex items-center gap-2"><Video className="w-4 h-4" />{cameraRequired ? 'Waiting for camera…' : 'Camera off'}</div>}
          </div>

          <div className="mt-4 space-y-3">
            <MicCheck level={level} heard={micHeard} />
            <button onClick={testVoice} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-600 text-slate-200 text-sm hover:bg-slate-700/40">
              <Volume2 className="w-4 h-4" /> Test {interviewerName}’s voice
            </button>
          </div>

          <div className="mt-4 flex items-start gap-2 text-xs text-slate-400 bg-slate-900/50 rounded-lg p-3 border border-slate-700/60">
            <ShieldCheck className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
            Once you begin, the clock runs continuously — it won’t pause if you close or lose connection. You can’t return to a question after moving on.
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button onClick={() => { previewStream?.getTracks().forEach((t) => t.stop()); setPreviewStream(null); setPhase('intro'); }}
              className="px-4 py-2 text-slate-300 text-sm hover:text-white">Back</button>
            <button onClick={startFromLobby} disabled={!camReady}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium disabled:opacity-50">
              I’m ready <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          {!camReady && <p className="text-xs text-amber-400 mt-2 text-right">Camera access is required — allow it and it’ll appear above.</p>}
        </div>
      </Stage>
    );
  }

  // ── Countdown ────────────────────────────────────────────────────────────────
  if (phase === 'countdown') {
    return (
      <Stage>
        <div className="text-center">
          <InterviewerOrb speaking level={0} size={96} name={interviewerName} />
          <p className="text-slate-300 mt-6">Get ready…</p>
          <div key={countdownN} className="text-7xl font-bold text-white mt-1 tabular-nums" style={{ animation: 'intvPop .5s ease' }}>
            {countdownN > 0 ? countdownN : 'Go'}
          </div>
        </div>
        <StudioKeyframes />
      </Stage>
    );
  }

  // ── Active question (cinematic stage) ────────────────────────────────────────
  const KindIcon = q?.kind === 'code' ? Code2 : q?.kind === 'text' ? Type : Mic;
  const isLast = idx === questions.length - 1;
  const timerRemaining = data?.options.timingMode === 'total' ? totalRemaining : remaining;
  const timerTotal = data?.options.timingMode === 'total' ? (data?.options.totalSeconds || 0) : (q?.timeLimitSeconds || 0);

  return (
    <div className={`fixed inset-0 flex flex-col text-slate-100 ${STUDIO}`}>
      <StudioKeyframes />
      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-800">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
            <KindIcon className="w-4 h-4 text-brand-400" />
            Question {idx + 1} of {questions.length}
            <span className="ml-1 text-slate-500">· {q?.points} pts</span>
          </div>
          {/* Segmented progress */}
          <div className="flex items-center gap-1.5">
            {questions.map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${i < idx ? 'bg-brand-500' : i === idx ? 'bg-brand-400/70' : 'bg-slate-700'}`} />
            ))}
          </div>
        </div>
        {timerRemaining !== null && timerTotal > 0 && <RingTimer remaining={timerRemaining} total={timerTotal} />}
        <div
          title={`Proctored${proctor.focusLosses ? ` · left the tab ${proctor.focusLosses}×` : ''}`}
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg ${proctor.focusLosses ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-800 text-slate-400'}`}
        >
          <Eye className="w-3.5 h-3.5" />Proctored{proctor.focusLosses > 0 && <span className="tabular-nums">· {proctor.focusLosses}</span>}
        </div>
      </div>

      {/* Fullscreen nudge */}
      {!proctor.isFullscreen && (
        <div className="flex items-center justify-between gap-3 px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/30 text-sm text-amber-200">
          <span className="inline-flex items-center gap-2"><AlertTriangle className="w-4 h-4" />You left fullscreen. This is noted for your mentor.</span>
          <button onClick={() => proctor.requestFullscreen()} className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium">
            <Maximize2 className="w-3.5 h-3.5" />Return to fullscreen
          </button>
        </div>
      )}

      {/* Stage */}
      <div className="flex-1 overflow-y-auto">
        <div key={idx} className="max-w-3xl mx-auto px-6 py-8" style={{ animation: 'intvIn .35s ease' }}>
          {/* Interviewer asking */}
          <div className="flex items-start gap-4 mb-7">
            <InterviewerOrb speaking={speaking} level={recording ? level : 0} name={interviewerName} />
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide font-medium text-brand-300 mb-1">
                {speaking ? `${interviewerName} is asking…` : 'Your turn'}
              </div>
              <h1 className="text-lg sm:text-xl font-medium text-slate-50 leading-relaxed">{q?.prompt}</h1>
              <button onClick={() => { if (q) askQuestion(q); }}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-brand-300">
                <Volume2 className="w-3.5 h-3.5" /> Replay question
              </button>
            </div>
          </div>

          {/* Answer surface */}
          {q?.kind === 'voice' && (
            <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-6">
              <div className="flex flex-col items-center">
                <Waveform level={level} active={recording} />
                <button
                  onClick={toggleRecording}
                  className={`mt-4 w-20 h-20 rounded-full flex items-center justify-center transition-colors ${recording ? 'bg-red-500 text-white shadow-[0_0_0_6px_rgba(239,68,68,0.2)]' : 'bg-brand-600 hover:bg-brand-700 text-white'}`}
                >
                  {recording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                </button>
                <div className="mt-3 flex flex-col items-center">
                  <p className="text-sm font-medium text-slate-200 flex items-center gap-2">
                    {recording && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                    {recording ? 'Recording in progress… tap to stop' : draft?.audioBlob ? 'Recorded · tap to re-record' : 'Tap to answer by voice'}
                  </p>
                  {recording && (
                    <p className="text-xs text-slate-400 mt-2 bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-700/50 max-w-sm text-center">
                      Your voice recording and transcript will both be shared with your mentor.
                    </p>
                  )}
                </div>
                {!recorderSupported() && <p className="text-xs text-amber-400 mt-2">Recording isn&apos;t supported here — type your answer below.</p>}
              </div>
              <div className="mt-5">
                <label className="block text-xs font-medium text-slate-400 mb-1">Transcript {recognitionSupported() && <span className="text-slate-500">(auto — edit if needed)</span>}</label>
                <textarea
                  value={draft?.transcript || ''}
                  onChange={(e) => q && queueSave(q.id, { transcript: e.target.value })}
                  rows={5}
                  placeholder="Your spoken answer appears here…"
                  className="w-full bg-slate-900/60 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-500"
                />
              </div>
            </div>
          )}

          {q?.kind === 'code' && (
            <div className="rounded-2xl border border-slate-700 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-slate-950 text-slate-300 text-xs">
                <span className="inline-flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5" />{q.codeLanguage || 'code'}</span>
                <span className="text-slate-500">Autosaved · paste disabled</span>
              </div>
              <CodeEditor
                value={draft?.code || ''}
                language={q.codeLanguage}
                onChange={(v) => q && queueSave(q.id, { code: v })}
                onPasteBlocked={() => { proctor.log('paste_blocked', { field: 'code' }); toast.message('Pasting is disabled during the interview.'); }}
                minHeight="360px"
              />
            </div>
          )}

          {q?.kind === 'text' && (
            <textarea
              value={draft?.answerText || ''}
              onChange={(e) => q && queueSave(q.id, { answerText: e.target.value })}
              rows={10}
              placeholder="Type your answer…"
              className="w-full bg-slate-800/40 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder:text-slate-500"
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between">
        <p className="text-xs text-slate-500">{recording ? 'Stop recording before moving on.' : 'You can’t return to this question after moving on.'}</p>
        <button
          onClick={() => advance(false)}
          disabled={advancing || phase !== 'active' || recording}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-medium disabled:opacity-50"
        >
          {advancing ? <Loader2 className="w-4 h-4 animate-spin" /> : isLast ? <CheckCircle2 className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
          {isLast ? 'Finish interview' : 'Next question'}
        </button>
      </div>

      {/* Picture-in-picture self view */}
      {cameraRequired && (
        <div className="fixed bottom-24 right-6 z-10">
          <video ref={videoRef} muted playsInline className="w-40 h-28 rounded-xl object-cover bg-slate-950 border border-slate-700 shadow-xl" />
          <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />REC
          </span>
        </div>
      )}

      {/* Required-camera block: if the camera is turned off mid-interview, stop the
          candidate here until it's restored (the clock keeps running, and the gap
          is logged for the mentor). */}
      {cameraRequired && !proctor.cameraLive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-sm p-6">
          <div className="max-w-md w-full text-center rounded-2xl border border-red-500/40 bg-slate-900 p-8">
            <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <VideoOff className="w-9 h-9 text-red-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-100">Your camera is off</h2>
            <p className="text-slate-400 mt-2 text-sm">
              This interview requires your camera to stay on, and it looks like it was turned off or disconnected.
              Turn it back on to continue — <span className="text-amber-300 font-medium">the clock is still running</span> and this pause is recorded for your mentor.
            </p>
            <button onClick={recoverCamera} className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium">
              <RotateCcw className="w-4 h-4" /> Retry camera
            </button>
            <p className="text-xs text-slate-500 mt-3">Nothing happening? Re-enable camera access for this site from your browser&apos;s address bar, then retry.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Dark full-screen "studio" backdrop for the transitional phases. */
function Stage({ children }: { children: React.ReactNode }) {
  return <div className={`fixed inset-0 flex items-center justify-center p-6 ${STUDIO}`}>{children}</div>;
}

/** Local keyframes for question-enter + countdown-pop (avoids a global CSS edit). */
function StudioKeyframes() {
  return (
    <style>{`
      @keyframes intvIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
      @keyframes intvPop { 0% { opacity: 0; transform: scale(0.6); } 60% { opacity: 1; transform: scale(1.1); } 100% { transform: scale(1); } }
    `}</style>
  );
}
