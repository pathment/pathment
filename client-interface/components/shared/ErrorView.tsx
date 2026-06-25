'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * The friendly "this part broke" surface for Next.js error boundaries. Lets the
 * user recover (retry / go home) instead of facing a white screen, and shows the
 * error's `digest` as a reference they can quote to support (it correlates with
 * the server logs / request id).
 */
export function ErrorView({
  error, reset, home, title = 'Something went wrong',
}: {
  error?: Error & { digest?: string };
  reset?: () => void;
  home?: string;
  title?: string;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center bg-card rounded-2xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-500/15 text-red-500 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-1.5 text-sm text-slate-500">
          This part of the app hit an unexpected error. You can retry — the rest of your work is safe.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          {reset && (
            <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              <RotateCcw className="w-4 h-4" />Try again
            </button>
          )}
          {home && (
            <a href={home} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
              Go to dashboard
            </a>
          )}
        </div>
        {error?.digest && (
          <p className="mt-4 text-[11px] text-slate-400">Reference: <span className="font-mono">{error.digest}</span></p>
        )}
      </div>
    </div>
  );
}

export default ErrorView;
