'use client';

import { useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Loader2, Mic, RotateCcw, Square, Video } from 'lucide-react';
import { fmtClock } from '@/lib/proctoring/media';
import type { UploadStatus } from '@/lib/proctoring/useAnswerUploads';

/** Class names for the dark interview studio and the light quiz page. */
const TONES = {
  dark: {
    box: 'border-slate-700 bg-slate-800/40', hint: 'text-slate-400', progress: 'text-slate-300', track: 'bg-slate-700',
    saved: 'text-emerald-400', failed: 'text-amber-300', captionsBox: 'border-slate-700/60 bg-slate-900/60 text-slate-300',
    unsupported: 'border-amber-500/40 bg-amber-500/10 text-amber-100', unsupportedIcon: 'text-amber-300',
  },
  light: {
    box: 'border-slate-200 bg-white', hint: 'text-slate-500', progress: 'text-slate-600', track: 'bg-slate-200',
    saved: 'text-emerald-600', failed: 'text-amber-700', captionsBox: 'border-slate-200 bg-slate-50 text-slate-600',
    unsupported: 'border-amber-200 bg-amber-50 text-amber-900', unsupportedIcon: 'text-amber-500',
  },
};

/**
 * Answering one interview question on camera.
 *
 * Shows the camera live (mirrored, like a mirror) while recording, with the
 * time left before the recording stops itself; afterwards it plays the take
 * back and says whether it reached the server. Recording again replaces it.
 * Holds no recording state of its own — the runner owns the recorder, so the
 * timer running out or the camera dying can stop it from outside.
 */
export function VideoAnswer({
  supported, recording, elapsed, maxSeconds, liveStream, cameraStream, takeBlob, savedUrl, upload,
  transcript, disabled, onStart, onStop, onRetry, tone = 'dark', audioOnly = false,
}: {
  supported: boolean;
  recording: boolean;
  /** Seconds recorded so far in this take. */
  elapsed: number;
  maxSeconds: number;
  /** The recorder's stream while recording. */
  liveStream: MediaStream | null;
  /** The proctoring camera, shown as the "ready" preview before a take. */
  cameraStream: MediaStream | null;
  /** This visit's take, kept in the page. */
  takeBlob: Blob | null;
  /** A take already stored on the server (after a resume). */
  savedUrl: string | null;
  upload?: UploadStatus;
  transcript: string;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
  onRetry: () => void;
  tone?: 'dark' | 'light';
  /** A voice-only answer: no camera, played back as audio. */
  audioOnly?: boolean;
}) {
  const t = TONES[tone];
  const liveRef = useRef<HTMLVideoElement | null>(null);
  const takeUrl = useMemo(() => (takeBlob ? URL.createObjectURL(takeBlob) : null), [takeBlob]);
  useEffect(() => () => { if (takeUrl) URL.revokeObjectURL(takeUrl); }, [takeUrl]);

  const showLive = recording || (!takeUrl && !savedUrl);
  const stream = recording ? liveStream : cameraStream;
  useEffect(() => {
    const v = liveRef.current;
    if (!v || !showLive) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    if (stream) v.play().catch(() => { });
  }, [stream, showLive]);

  const left = Math.max(0, maxSeconds - elapsed);
  const playback = takeUrl || savedUrl;
  const noun = audioOnly ? 'recording' : 'video';

  if (!supported) {
    return (
      <div className={`rounded-2xl border p-6 text-sm flex items-start gap-2 ${t.unsupported}`}>
        <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${t.unsupportedIcon}`} />
        This browser can&apos;t record {audioOnly ? 'audio' : 'video'}. Open this in Chrome, Edge or Firefox on a computer to answer this question.
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 sm:p-6 ${t.box}`}>
      {audioOnly ? (
        <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-xl border border-slate-700 bg-slate-950 px-4 py-6">
          {recording ? (
            <div className="flex items-center justify-between gap-3 text-white">
              <span className="inline-flex items-center gap-2 text-sm font-medium"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />Recording your answer · {fmtClock(elapsed)}</span>
              <span className={`rounded-md px-2 py-1 text-xs font-semibold tabular-nums ${left <= 15 ? 'bg-red-600 text-white' : 'bg-white/10 text-white'}`}>{fmtClock(left)} left</span>
            </div>
          ) : playback ? (
            <audio key={playback} src={playback} controls className="w-full" />
          ) : (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-400"><Mic className="h-4 w-4" />Answer out loud: voice only, no camera.</div>
          )}
          {recording && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
              <div className="h-full bg-red-500 transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (elapsed / maxSeconds) * 100)}%` }} />
            </div>
          )}
        </div>
      ) : (
      <div className="relative mx-auto aspect-video w-full max-w-xl overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
        {showLive ? (
          stream
            ? <video ref={liveRef} muted playsInline className="h-full w-full object-cover -scale-x-100" />
            : <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500"><Video className="h-4 w-4" />Waiting for your camera…</div>
        ) : (
          <video key={playback} src={playback || undefined} controls playsInline className="h-full w-full bg-black object-contain" />
        )}
        {recording && (
          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />REC {fmtClock(elapsed)}
          </div>
        )}
        {recording && (
          <div className={`absolute right-3 top-3 rounded-md px-2 py-1 text-xs font-semibold tabular-nums ${left <= 15 ? 'bg-red-600 text-white' : 'bg-black/60 text-white'}`}>
            {fmtClock(left)} left
          </div>
        )}
        {recording && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
            <div className="h-full bg-red-500 transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (elapsed / maxSeconds) * 100)}%` }} />
          </div>
        )}
      </div>
      )}

      <div className="mt-4 flex flex-col items-center gap-2">
        {recording ? (
          <button type="button" onClick={onStop}
            className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_0_6px_rgba(239,68,68,0.2)] hover:bg-red-600">
            <Square className="h-4 w-4 fill-current" />Stop recording
          </button>
        ) : (
          <button type="button" onClick={onStart} disabled={disabled}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {playback ? <RotateCcw className="h-4 w-4" /> : <Circle className="h-4 w-4 fill-red-500 text-red-500" />}
            {playback ? 'Record again' : 'Start recording'}
          </button>
        )}
        <p className={`text-xs text-center ${t.hint}`}>
          {recording
            ? (audioOnly ? 'Answer out loud. It stops by itself when the time is up.' : 'Look at the camera and answer out loud. It stops by itself when the time is up.')
            : playback
              ? 'Recording again replaces this one.'
              : audioOnly
                ? `You have up to ${fmtClock(maxSeconds)} to answer out loud. The reviewer hears the recording.`
                : `You have up to ${fmtClock(maxSeconds)} on camera. Your mentor sees and hears the recording.`}
        </p>

        {!recording && upload && (
          upload.state === 'uploading' ? (
            <div className="w-full max-w-xs">
              <div className={`flex items-center justify-between text-xs ${t.progress}`}>
                <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending your {noun}…</span>
                <span className="tabular-nums">{Math.round(upload.progress * 100)}%</span>
              </div>
              <div className={`mt-1 h-1.5 overflow-hidden rounded-full ${t.track}`}>
                <div className="h-full bg-brand-500 transition-[width]" style={{ width: `${Math.round(upload.progress * 100)}%` }} />
              </div>
            </div>
          ) : upload.state === 'saved' ? (
            <p className={`inline-flex items-center gap-1.5 text-xs ${t.saved}`}><CheckCircle2 className="h-3.5 w-3.5" />Saved</p>
          ) : (
            <p className={`inline-flex items-center gap-2 text-xs ${t.failed}`}>
              <AlertTriangle className="h-3.5 w-3.5" />Your {noun} didn&apos;t send.
              <button type="button" onClick={onRetry} className="rounded-md bg-amber-600 px-2 py-0.5 font-medium text-white hover:bg-amber-700">Try again</button>
            </p>
          )
        )}
        {!recording && !upload && savedUrl && (
          <p className={`inline-flex items-center gap-1.5 text-xs ${t.saved}`}><CheckCircle2 className="h-3.5 w-3.5" />Saved</p>
        )}
      </div>

      {transcript && (
        <details className="mt-4">
          <summary className={`cursor-pointer text-xs font-medium ${t.hint}`}>Live captions</summary>
          <p className={`mt-1.5 whitespace-pre-wrap rounded-lg border p-3 text-sm ${t.captionsBox}`}>{transcript}</p>
        </details>
      )}
    </div>
  );
}
