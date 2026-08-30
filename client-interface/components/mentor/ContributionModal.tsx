'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Trophy } from 'lucide-react';
import { mentorApi } from '@/lib/services/mentor-api';

export interface ScoreRow { menteeId: string; name: string; talkSeconds: number; proposed: boolean; alreadyAwarded: boolean }

// Talk time: seconds under a minute, minutes above.
const fmtTalk = (s: number) => (s < 60 ? `${s}s` : `${Math.round(s / 60)}m`);

/**
 * Post-call contribution scoring. Lives outside ReviewMeetingPanel because the
 * call — and therefore ending it — now outlives the review page: the mentor can
 * hit "End & score" from the floating call on any screen, and this has to be
 * able to open there. Rendered by CallProvider.
 */
export function ContributionModal({ proposed, sessionId, onClose, onDone }: {
  proposed: ScoreRow[];
  sessionId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  // Pre-check the speakers; the mentor can add anyone else who contributed.
  const [picked, setPicked] = useState<Set<string>>(new Set(proposed.filter((p) => p.proposed && !p.alreadyAwarded).map((p) => p.menteeId)));
  const [sendAbsentEmails, setSendAbsentEmails] = useState(true);
  const [busy, setBusy] = useState(false);

  const award = async () => {
    setBusy(true);
    try {
      const res = await mentorApi.finalizeReviewContribution(sessionId, [...picked], sendAbsentEmails) as { data?: { awarded: number } };
      toast.success(`Awarded a contribution point to ${res?.data?.awarded ?? 0} mentee(s)`);
      onDone();
    } catch { toast.error('Could not award points'); }
    finally { setBusy(false); }
  };

  const skip = async () => {
    setBusy(true);
    try {
      await mentorApi.finalizeReviewContribution(sessionId, [], sendAbsentEmails);
      onDone();
    } catch { toast.error('Could not complete review'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-slate-900 flex items-center gap-1.5"><Trophy className="w-5 h-5 text-amber-500" /> Contribution points</h3>
        <p className="mt-1 text-sm text-slate-500">Award a point to whoever contributed. Speakers are pre-checked — tick anyone who helped in chat too.</p>
        <div className="mt-3 space-y-1 max-h-64 overflow-y-auto">
          {proposed.length === 0 && <p className="text-sm text-slate-400">Nobody attended this session.</p>}
          {proposed.map((p) => (
            <label key={p.menteeId} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${p.alreadyAwarded ? 'opacity-50' : 'hover:bg-slate-50 cursor-pointer'}`}>
              <input
                type="checkbox"
                disabled={p.alreadyAwarded}
                checked={p.alreadyAwarded || picked.has(p.menteeId)}
                onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(p.menteeId); else n.delete(p.menteeId); return n; })}
              />
              <span className="text-sm text-slate-700 flex-1">{p.name}</span>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {p.alreadyAwarded ? 'already awarded' : p.talkSeconds > 0 ? `spoke ${fmtTalk(p.talkSeconds)}` : 'no speaking time'}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 border-t border-slate-100 pt-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={sendAbsentEmails}
              onChange={(e) => setSendAbsentEmails(e.target.checked)}
              className="mt-0.5 rounded text-brand-600 focus:ring-brand-500"
            />
            <span className="text-xs text-slate-600">Send &quot;We missed you at today&apos;s review&quot; email to absent mentees</span>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={skip} disabled={busy} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700">Skip</button>
          <button onClick={award} disabled={busy || picked.size === 0} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />} Award {picked.size}
          </button>
        </div>
      </div>
    </div>
  );
}
