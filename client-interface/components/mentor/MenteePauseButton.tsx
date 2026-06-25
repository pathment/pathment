'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { PauseCircle, PlayCircle, Loader2 } from 'lucide-react';
import { mentorApi } from '@/lib/services/mentor-api';

/**
 * Self-contained Pause / Resume control for a mentee. Fetches the mentee's
 * pause state on mount, so it can live on any profile (mentor or admin) without
 * that page needing to know about pausing. Works for admins (org-wide) and
 * mentors (their clans) via the same endpoints.
 */
export function MenteePauseButton({ menteeId, className = '' }: { menteeId: string; className?: string }) {
  const [paused, setPaused] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r: any = await mentorApi.getMenteePauseState(menteeId); // eslint-disable-line @typescript-eslint/no-explicit-any
      // Only actionable when the mentee is in a clan this viewer manages.
      setPaused(r?.data?.clanId ? !!r.data.paused : null);
    } catch { setPaused(null); /* hide */ }
  }, [menteeId]);
  useEffect(() => { load(); }, [load]);

  // Hide entirely if the viewer can't act on this mentee (no clan in scope).
  if (paused === null) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (paused) { await mentorApi.resumeMentee(menteeId); toast.success('Mentee resumed'); setPaused(false); }
      else { await mentorApi.pauseMentee(menteeId); toast.success('Mentee paused — kept in the clan, out of reports'); setPaused(true); }
    } catch { toast.error('Could not update pause status'); }
    finally { setBusy(false); }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`px-4 py-2 rounded-xl transition-colors inline-flex items-center gap-2 border disabled:opacity-50 ${paused ? 'bg-brand-50 border-brand-200 text-brand-700 hover:bg-brand-100' : 'bg-card border-slate-200 text-slate-700 hover:bg-slate-50'} ${className}`}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : paused ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
      {paused ? 'Resume' : 'Pause'}
    </button>
  );
}
