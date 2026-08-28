'use client';

import { Video, VideoOff, X } from 'lucide-react';

/**
 * Pre-join camera choice for mentees entering a cohort review (issue #708).
 * Jitsi's own prejoin page is disabled — Pathment asks here instead.
 */
export function ReviewCameraPrompt({
  clanName,
  onChoose,
  onCancel,
}: {
  clanName: string;
  onChoose: (cameraOn: boolean) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-camera-prompt-title"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-card p-6 shadow-xl">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="text-xs font-medium uppercase tracking-wide text-brand-600">Join review</p>
        <h2 id="review-camera-prompt-title" className="mt-1 text-lg font-semibold text-slate-900">
          How would you like to join?
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Live review in <span className="font-medium text-slate-700">{clanName}</span>. You can turn your camera on or off anytime during the call.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onChoose(true)}
            className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-900 transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <Video className="h-5 w-5" />
            </span>
            Camera on
          </button>
          <button
            type="button"
            onClick={() => onChoose(false)}
            className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-900 transition-colors hover:border-slate-300 hover:bg-slate-100"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200 text-slate-600">
              <VideoOff className="h-5 w-5" />
            </span>
            Camera off
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          If your browser blocks camera access, you&apos;ll still join — use the toolbar to try again later.
        </p>
      </div>
    </div>
  );
}
