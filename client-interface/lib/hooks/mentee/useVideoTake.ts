'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { VideoAnswerRecorder, createRecognizer, MAX_VIDEO_BYTES } from '@/lib/utils/interviewMedia';

interface Options {
  /** The proctoring camera's track; the recorder records a clone of it. */
  getCameraTrack: () => MediaStreamTrack | null;
  /** A finished take, pinned to the question it was recorded for. */
  onTake: (questionId: string, blob: Blob) => void;
  /** Live captions while recording (a new take's captions replace the old). */
  onCaptions?: (questionId: string, text: string) => void;
  /** Into the proctor log. */
  log?: (type: string, meta?: Record<string, unknown>) => void;
  /** Snapshot now — called as a take starts and ends. */
  captureNow?: (reason?: string) => void;
}

/**
 * Recording one video answer at a time.
 *
 * One way out of every take: the stop button, the recording cap, the
 * question's clock, a dead camera or mic, or submit. Concurrent callers share
 * one stop, so a take is never cut twice or handed over twice, and it's always
 * pinned to the question it was recorded for, even if the page has moved on.
 */
export function useVideoTake({ getCameraTrack, onTake, onCaptions, log, captureNow }: Options) {
  const [recording, setRecording] = useState(false);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const recRef = useRef<VideoAnswerRecorder | null>(null);
  const ownerRef = useRef<string | null>(null);
  const capRef = useRef(120);
  const stoppingRef = useRef<Promise<void> | null>(null);
  const recognizerRef = useRef<ReturnType<typeof createRecognizer>>(null);
  const cbs = useRef({ onTake, onCaptions, log, captureNow, getCameraTrack });
  useEffect(() => { cbs.current = { onTake, onCaptions, log, captureNow, getCameraTrack }; });

  const stop = useCallback((): Promise<void> => {
    if (stoppingRef.current) return stoppingRef.current;
    const rec = recRef.current;
    if (!rec) return Promise.resolve();
    const run = (async () => {
      const owner = ownerRef.current;
      recRef.current = null;
      ownerRef.current = null;
      recognizerRef.current?.stop();
      recognizerRef.current = null;
      const blob = await rec.stop();
      cbs.current.captureNow?.('video_end');
      setRecording(false);
      setQuestionId(null);
      setStream(null);
      if (!owner || !blob) return;
      if (blob.size > MAX_VIDEO_BYTES) {
        cbs.current.log?.('video_too_large', { bytes: blob.size, questionId: owner });
        toast.error('That recording is too large to send. Please record a shorter answer.');
        return;
      }
      cbs.current.onTake(owner, blob);
    })().finally(() => { stoppingRef.current = null; });
    stoppingRef.current = run;
    return run;
  }, []);

  /**
   * Start a take for `forQuestion`. Resolves false (with a toast) if it couldn't.
   * `audioOnly` records the voice alone, for an audio answer.
   */
  const start = useCallback(async (forQuestion: string, maxSeconds: number, { audioOnly = false }: { audioOnly?: boolean } = {}): Promise<boolean> => {
    if (recRef.current || stoppingRef.current) return false;
    const rec: VideoAnswerRecorder = new VideoAnswerRecorder((reason) => {
      if (recRef.current !== rec) return;
      cbs.current.log?.('video_interrupted', { reason, questionId: forQuestion });
      toast.error(`${reason === 'mic' ? 'Your microphone stopped' : reason === 'camera' ? 'Your camera turned off' : 'The recording failed'}, so the recording stopped. What was recorded is kept — you can record again.`);
      void stop();
    });
    const problem = await rec.start(audioOnly ? null : cbs.current.getCameraTrack(), { audioOnly });
    if (problem) {
      toast.error(problem === 'mic' ? `Microphone access is needed to answer ${audioOnly ? 'out loud' : 'on video'}.`
        : problem === 'camera' ? 'Camera access is needed to answer on video.'
          : `This browser can’t record ${audioOnly ? 'audio' : 'video'}. Use Chrome, Edge or Firefox on a computer.`);
      return false;
    }
    recRef.current = rec;
    ownerRef.current = forQuestion;
    capRef.current = maxSeconds || 120;
    setElapsed(0);
    setStream(rec.getStream());
    setQuestionId(forQuestion);
    setRecording(true);
    const recognizer = createRecognizer((text) => cbs.current.onCaptions?.(forQuestion, text));
    recognizerRef.current = recognizer;
    recognizer?.start();
    cbs.current.captureNow?.('video_start');
    return true;
  }, [stop]);

  // The take's clock, and its cap: it stops itself at the question's limit.
  useEffect(() => {
    const rec = recRef.current;
    if (!recording || !rec) return;
    const id = setInterval(() => {
      const secs = Math.floor((Date.now() - rec.startedAt) / 1000);
      setElapsed(Math.min(secs, capRef.current));
      if (secs >= capRef.current && recRef.current === rec) {
        clearInterval(id);
        toast.message('That’s the time for this recording — it has been saved.');
        void stop();
      }
    }, 250);
    return () => clearInterval(id);
  }, [recording, stop]);

  // Leaving the page mid-take: stop the camera and mic, keep nothing half-made.
  useEffect(() => () => {
    recognizerRef.current?.stop();
    void recRef.current?.stop();
  }, []);

  return { recording, questionId, elapsed, stream, start, stop };
}
