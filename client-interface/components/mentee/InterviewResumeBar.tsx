'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Mic, ArrowRight } from 'lucide-react';
import {
  getActiveInterview,
  reconcileActiveInterview,
  ACTIVE_INTERVIEW_EVENT,
  type ActiveInterview,
} from '@/lib/utils/activeInterview';
import { fmtClock } from '@/lib/utils/interviewMedia';

/**
 * InterviewResumeBar — a mentee-wide floating pill shown whenever an interview is
 * in progress and the candidate is NOT on the runner (they navigated away or
 * reloaded onto another page). Total-time interviews show a live countdown so it's
 * clear the clock keeps running; per-question ones show an urgent "resume" nudge.
 */
export function InterviewResumeBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [ai, setAi] = useState<ActiveInterview | null>(null);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      const stored = getActiveInterview();
      if (!stored) {
        if (!cancelled) {
          setAi(null);
          setReady(true);
        }
        return;
      }
      const reconciled = await reconcileActiveInterview(stored.taskId);
      if (!cancelled) {
        setAi(reconciled);
        setReady(true);
      }
    };

    sync();
    setNow(Date.now());

    const onChange = () => { void sync(); };
    window.addEventListener(ACTIVE_INTERVIEW_EVENT, onChange);
    window.addEventListener('storage', onChange);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      window.removeEventListener(ACTIVE_INTERVIEW_EVENT, onChange);
      window.removeEventListener('storage', onChange);
      clearInterval(t);
    };
  }, []);

  if (!ready || !ai) return null;
  // Don't show while actually on the runner for this interview.
  if (pathname?.startsWith(`/mentee/interviews/${ai.taskId}`)) return null;

  const remaining = ai.deadlineTs != null && now ? Math.round((ai.deadlineTs - now) / 1000) : null;
  const urgent = remaining != null && remaining <= 60;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] px-2 w-full max-w-md">
      <button
        onClick={() => router.push(`/mentee/interviews/${ai.taskId}`)}
        className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-lg text-left transition-colors ${
          urgent ? 'bg-red-600 border-red-700 text-white hover:bg-red-700'
                 : 'bg-brand-600 border-brand-700 text-white hover:bg-brand-700'
        }`}
      >
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15 shrink-0">
          <Mic className="w-4 h-4" />
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse ring-2 ring-brand-600" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold truncate">Interview in progress</span>
          <span className="block text-xs text-white/80 truncate">
            {remaining != null
              ? (remaining > 0 ? `${fmtClock(remaining)} left · ${ai.title}` : `Time's up — submit now · ${ai.title}`)
              : `The clock is running · ${ai.title}`}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-medium shrink-0">
          Resume <ArrowRight className="w-4 h-4" />
        </span>
      </button>
    </div>
  );
}

export default InterviewResumeBar;
