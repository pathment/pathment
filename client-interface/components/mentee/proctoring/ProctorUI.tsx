'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Laptop, Loader2, Monitor, MonitorOff, RotateCcw, VideoOff } from 'lucide-react';
import type { ScreenShare, ScreenShareProblem } from '@/lib/hooks/mentee/useScreenShare';

/**
 * The proctoring screens a candidate meets, shared by interviews and quizzes:
 * sharing the screen in setup, being stopped when the camera or the share
 * drops, a device that can't take part, and a video that didn't send.
 *
 * `tone` follows the page: the interview studio is dark, quizzes are light.
 * The blocking overlays are always dark — they cover the page on purpose.
 */

export type Tone = 'dark' | 'light';
/** 'interview' | 'quiz' — used in sentences ("This quiz is proctored…"). */
export type Noun = string;

const T = {
  dark: {
    card: 'border-slate-700 bg-slate-900/50',
    ok: 'border-emerald-500/40 bg-emerald-500/5',
    title: 'text-slate-100',
    body: 'text-slate-400',
    warn: 'text-amber-300',
    notice: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
    noticeIcon: 'text-amber-300',
  },
  light: {
    card: 'border-slate-200 bg-white',
    ok: 'border-emerald-200 bg-emerald-50/60',
    title: 'text-slate-900',
    body: 'text-slate-500',
    warn: 'text-amber-700',
    notice: 'border-amber-200 bg-amber-50 text-amber-900',
    noticeIcon: 'text-amber-500',
  },
};

/** Why the screen share didn't take, in words a candidate can act on. */
export function ScreenProblem({ problem, tone = 'dark' }: { problem: ScreenShareProblem; tone?: Tone }) {
  return (
    <p className={`mt-2 text-xs text-left ${tone === 'dark' ? 'text-amber-300' : T[tone].warn}`}>
      {problem === 'not_entire_screen'
        ? 'You shared a tab or a window. Share your entire screen instead — pick “Entire screen” in the window that opens.'
        : problem === 'unsupported'
          ? 'This browser can’t share a screen. Use Chrome, Edge or Firefox on a computer.'
          : 'Screen sharing was cancelled or blocked. It’s required here — press the button and choose “Entire screen”. If nothing opens, allow screen sharing for this site in your browser or system settings.'}
    </p>
  );
}

/** The setup step: share the entire screen, with its state and any problem. */
export function ScreenShareStep({ screen, tone = 'dark' }: { screen: ScreenShare; tone?: Tone }) {
  const t = T[tone];
  return (
    <div className={`rounded-xl border p-3 ${screen.live ? t.ok : t.card}`}>
      <div className="flex items-center gap-3">
        <Monitor className={`w-5 h-5 shrink-0 ${screen.live ? 'text-emerald-500' : 'text-brand-500'}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${t.title}`}>{screen.live ? 'Sharing your entire screen' : 'Share your entire screen'}</p>
          <p className={`text-xs ${t.body}`}>
            {screen.live
              ? 'Keep it shared until you finish. Stopping it pauses you, and the clock keeps running.'
              : 'In the window that opens, choose “Entire screen”. A tab or a single window won’t do.'}
          </p>
        </div>
        {screen.live
          ? <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
          : (
            <button type="button" onClick={() => void screen.start()} disabled={screen.busy}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {screen.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Monitor className="w-3.5 h-3.5" />}Share screen
            </button>
          )}
      </div>
      {!screen.live && screen.problem && <ScreenProblem problem={screen.problem} tone={tone} />}
    </div>
  );
}

/** "This needs a computer": the device can't share a screen or record video. */
export function DeviceProblemNotice({ problem, noun, tone = 'dark' }: { problem: 'screen' | 'video'; noun: Noun; tone?: Tone }) {
  const t = T[tone];
  return (
    <div className={`rounded-xl border p-4 text-left text-sm flex items-start gap-2 ${t.notice}`}>
      <Laptop className={`w-4 h-4 shrink-0 mt-0.5 ${t.noticeIcon}`} />
      <span>
        {problem === 'screen'
          ? `This ${noun} is proctored with screen sharing, which this device can’t do.`
          : `This ${noun} has questions you answer on video, which this browser can’t record.`}
        {' '}Open it on a laptop or desktop in Chrome, Edge or Firefox to take it.
      </span>
    </div>
  );
}

/** A full-screen stop: nothing continues until the problem is fixed. */
function BlockOverlay({ icon, title, children, action, footnote, tone = 'red' }: {
  icon: ReactNode; title: string; children: ReactNode; action?: ReactNode; footnote?: ReactNode; tone?: 'red' | 'amber';
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-sm p-6" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className={`max-w-md w-full text-center rounded-2xl border bg-slate-900 p-8 ${tone === 'red' ? 'border-red-500/40' : 'border-amber-500/40'}`}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${tone === 'red' ? 'bg-red-500/15' : 'bg-amber-500/15'}`}>{icon}</div>
        <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
        <div className="text-slate-400 mt-2 text-sm">{children}</div>
        {action && <div className="mt-6">{action}</div>}
        {footnote}
      </div>
    </div>
  );
}

const STILL_RUNNING = <span className="text-amber-300 font-medium">the clock is still running</span>;

/** The required camera went off: stop here until it's back. */
export function CameraOffOverlay({ noun, onRetry }: { noun: Noun; onRetry: () => void }) {
  return (
    <BlockOverlay
      icon={<VideoOff className="w-9 h-9 text-red-400" />}
      title="Your camera is off"
      action={(
        <button onClick={onRetry} className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium">
          <RotateCcw className="w-4 h-4" /> Retry camera
        </button>
      )}
      footnote={<p className="text-xs text-slate-500 mt-3">Nothing happening? Re-enable camera access for this site from your browser&apos;s address bar, then retry.</p>}
    >
      This {noun} requires your camera to stay on, and it looks like it was turned off or disconnected.
      Turn it back on to continue — {STILL_RUNNING} and this pause is recorded for your mentor.
    </BlockOverlay>
  );
}

/** The required screen share stopped: stop here until it's shared again. */
export function ScreenOffOverlay({ noun, screen, onShared }: { noun: Noun; screen: ScreenShare; onShared: () => void }) {
  return (
    <BlockOverlay
      icon={<MonitorOff className="w-9 h-9 text-red-400" />}
      title="Your screen isn’t being shared"
      action={(
        <button onClick={async () => { if (await screen.start()) onShared(); }} disabled={screen.busy}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
          {screen.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Monitor className="w-4 h-4" />} Share entire screen
        </button>
      )}
      footnote={screen.problem ? <ScreenProblem problem={screen.problem} /> : null}
    >
      This {noun} requires your entire screen to be shared the whole time. Share it again to continue — {STILL_RUNNING} and this pause is recorded for your mentor.
    </BlockOverlay>
  );
}

/** A hand-pressed Finish with video answers that didn't send. */
export function UploadProblemDialog({ count, onRetry, onSubmitAnyway }: { count: number; onRetry: () => void; onSubmitAnyway: () => void }) {
  return (
    <BlockOverlay
      tone="amber"
      icon={<AlertTriangle className="w-9 h-9 text-amber-400" />}
      title={count === 1 ? 'A video answer didn’t send' : `${count} video answers didn’t send`}
      action={(
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
          <button onClick={onRetry} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium">
            <RotateCcw className="w-4 h-4" />Try again
          </button>
          <button onClick={onSubmitAnyway} className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-600 text-slate-200 text-sm hover:bg-slate-800">
            Submit anyway
          </button>
        </div>
      )}
    >
      Check your connection and try again. If you submit without {count === 1 ? 'it' : 'them'}, this page keeps trying for a few minutes — keep it open.
    </BlockOverlay>
  );
}

/** What this browser can do, sent when an attempt starts (the server's proctoringRules). */
export { browserCapabilities, deviceProblemFor } from './capabilities';
