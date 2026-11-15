'use client';

import Link from 'next/link';
import { Kiko } from '@/components/shared/Kiko';

interface ResourceErrorProps {
  /** HTTP status of the failure. 403 and 404 are very different stories. */
  status: number | null;
  /** What was being loaded, lowercase: "mentor", "task", "program". */
  resource: string;
  message?: string | null;
  backHref?: string;
  backLabel?: string;
  onRetry?: () => void;
}

/**
 * The three ways loading one record can fail.
 *
 * Rendering "not found" for a 403 is what made a paused mentee look like missing
 * data for weeks — people went looking for a deleted record when the real answer
 * was an access rule. Say which one it is.
 */
export function ResourceError({
  status,
  resource,
  message,
  backHref,
  backLabel = 'Go back',
  onRetry,
}: ResourceErrorProps) {
  const denied = status === 403;
  const missing = status === 404;


  const title = denied
    ? `You do not have access to this ${resource}`
    : missing
      ? `${resource[0].toUpperCase()}${resource.slice(1)} not found`
      : `Could not load this ${resource}`;

  const detail = denied
    ? 'It may have moved, or your permissions changed. Ask an admin if you need access.'
    : missing
      ? `This ${resource} does not exist, or it is not one of yours.`
      : message || 'Something went wrong on our end. Try again in a moment.';

  return (
    <div className="text-center py-12">
      {/* Kiko reads the situation: puzzled at a missing record, sorry about a locked one. */}
      <Kiko mood={denied ? 'sad' : missing ? 'thinking' : 'surprised'} size={96} animated className="mx-auto mb-2" />
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">{detail}</p>
      <div className="mt-4 flex items-center justify-center gap-4">
        {onRetry && !denied && !missing && (
          <button onClick={onRetry} className="text-brand-600 hover:text-brand-700 text-sm font-medium">
            Try again
          </button>
        )}
        {backHref && (
          <Link href={backHref} className="text-brand-600 hover:text-brand-700 text-sm">
            {backLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
