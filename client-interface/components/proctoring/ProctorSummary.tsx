'use client';

import { AlertTriangle, Camera, Eye, Loader2, Monitor, RotateCcw, Trash2 } from 'lucide-react';
import type { ProctorSnapshot } from '@/lib/proctoring/types';

/**
 * How a reviewer reads a proctored attempt, for any host: the interruptions
 * (came back after closing the page, offline, out of fullscreen) with how
 * long, the behaviour flags in words, and each snapshot marked webcam or screen.
 */

export const FLAG_LABEL: Record<string, string> = {
  focus_loss: 'Left the tab',
  window_blur: 'Window lost focus',
  fullscreen_exit: 'Exited fullscreen',
  not_fullscreen: 'Never went fullscreen',
  time_expired: 'Time ran out (auto-submitted)',
  paste_blocked: 'Paste blocked',
  copy_blocked: 'Copy blocked',
  context_menu_blocked: 'Right-click blocked',
  camera_off: 'Camera turned off',
  camera_restored: 'Camera restored',
  // From the phone app — same log, different vocabulary.
  app_background: 'Left the app',
  app_foreground: 'Came back to the app',
  camera_live: 'Camera on',
  snapshot_failed: 'A photo failed to send',
  screen_share_stopped: 'Stopped sharing the screen',
  screen_share_restored: 'Shared the screen again',
  screen_share_wrong_surface: 'Tried to share a tab/window, not the screen',
  multiple_monitors: 'More than one monitor connected',
  video_interrupted: 'Video recording cut off',
  video_too_large: 'Video too large to send',
  connection_lost: 'Went offline',
  fullscreen_unavailable: 'Browser couldn’t go fullscreen',
};

/** Events that only carry the timing for the interruptions line, not flags of their own. */
const TIMING_ONLY = new Set(['attempt_opened', 'connection_restored', 'fullscreen_restored']);

/** The server's totals (proctoring media.proctorStats). */
export interface ProctorStats {
  opens: number;
  resumes: number;
  awayMs: number;
  offline: number;
  offlineMs: number;
  fullscreenExits: number;
  fullscreenOutMs: number;
  fullscreenUnavailable: boolean;
}

/** 2h 05m · 3m 10s · 12s */
export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** "Came back 1× (away 3m 10s) · Offline 2× (1m 05s) · Out of fullscreen 1× (12s)" */
function Interruptions({ stats }: { stats: ProctorStats }) {
  const parts: string[] = [];
  if (stats.resumes) parts.push(`Came back after closing or losing the page ${stats.resumes}×${stats.awayMs ? ` (away ${fmtDuration(stats.awayMs)})` : ''}`);
  if (stats.offline) parts.push(`Offline ${stats.offline}×${stats.offlineMs ? ` (${fmtDuration(stats.offlineMs)})` : ''}`);
  if (stats.fullscreenExits) parts.push(`Out of fullscreen ${stats.fullscreenExits}×${stats.fullscreenOutMs ? ` (${fmtDuration(stats.fullscreenOutMs)})` : ''}`);
  if (!parts.length) return null;
  return (
    <p className="mb-2 inline-flex items-start gap-1.5 rounded-lg bg-slate-50 dark:bg-white/5 px-2.5 py-1.5 text-xs text-slate-600">
      <RotateCcw className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />{parts.join(' · ')}
    </p>
  );
}

/** A thumbnail's corner badge: was this the webcam or the shared screen? */
export function SourceBadge({ source }: { source?: 'camera' | 'screen' }) {
  const Icon = source === 'screen' ? Monitor : Camera;
  return (
    <span className="absolute bottom-0.5 left-0.5 inline-flex items-center rounded bg-black/60 p-0.5 text-white" title={source === 'screen' ? 'Screen' : 'Webcam'}>
      <Icon className="h-2.5 w-2.5" />
    </span>
  );
}

/** A row of snapshot thumbnails; each opens full size in a new tab. */
export function SnapshotStrip({ snapshots, size = 'md' }: { snapshots: ProctorSnapshot[]; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'w-16 h-11' : 'w-20 h-14';
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {snapshots.map((s, i) => (
        <a key={`${s.url}-${i}`} href={s.url} target="_blank" rel="noreferrer"
          title={`${s.source === 'screen' ? 'Screen' : 'Webcam'} · ${new Date(s.at).toLocaleTimeString()} — open full size`}
          className="relative shrink-0 rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.url} alt="" className={`${box} object-cover`} />
          <SourceBadge source={s.source} />
        </a>
      ))}
    </div>
  );
}

/** The whole-attempt proctoring card: flags, a missing-screen warning, every snapshot. */
export function ProctorSummary({ proctor, screenRequired, submitted, canDelete, deleting, onDelete }: {
  proctor: { snapshots: ProctorSnapshot[]; flagCounts: Record<string, number>; stats?: ProctorStats };
  screenRequired?: boolean;
  submitted?: boolean;
  canDelete?: boolean;
  deleting?: boolean;
  onDelete?: () => void;
}) {
  const screens = proctor.snapshots.filter((s) => s.source === 'screen').length;
  const cams = proctor.snapshots.length - screens;
  const flags = Object.entries(proctor.flagCounts).filter(([type]) => !TIMING_ONLY.has(type));
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Eye className="w-4 h-4 text-slate-500" /> Proctoring
        </div>
        {canDelete && proctor.snapshots.length > 0 && (
          <button onClick={onDelete} disabled={deleting}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 disabled:opacity-50">
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete images
          </button>
        )}
      </div>
      {proctor.stats && <Interruptions stats={proctor.stats} />}
      {flags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {flags.map(([type, count]) => (
            <span key={type} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
              <AlertTriangle className="w-3 h-3" />{FLAG_LABEL[type] || type} · {count}
            </span>
          ))}
        </div>
      ) : <p className="text-xs text-slate-400 mb-3">No flags raised.</p>}
      {screenRequired && submitted && screens === 0 && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Screen sharing was required, but no screen snapshot came through.
        </p>
      )}
      {proctor.snapshots.length > 0 && (
        <>
          <p className="mb-1 text-[11px] text-slate-400">{cams} webcam · {screens} screen</p>
          <SnapshotStrip snapshots={proctor.snapshots} />
        </>
      )}
    </div>
  );
}
