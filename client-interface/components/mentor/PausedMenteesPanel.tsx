'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PauseCircle, PlayCircle, X, Loader2, MoonStar, BellRing, ChevronDown } from 'lucide-react';
import { mentorApi } from '@/lib/services/mentor-api';
import { useConfirm } from '@/lib/context/ConfirmContext';

interface Suggestion {
  menteeId: string; name: string; clanId: string; clanName: string;
  neverAttended: boolean; lastPresentDate: string | null; missedReviews: number; reason: string;
}
interface Paused {
  menteeId: string; clanId: string; clanName: string; name: string;
  pausedAt: string | null; pausedReason: string | null; reengageCount: number; lastReengagedAt: string | null;
}

/**
 * Suggested-to-pause queue + the list of currently paused mentees, shown on the
 * My Mentees page. Mentors pause an inactive mentee (one click), keep them
 * active (dismiss), or resume someone who's paused. Paused mentees stay in the
 * clan but drop out of the reports and get win-back reminders.
 */
export function PausedMenteesPanel({ menteeBasePath = '/mentor/mentees' }: { menteeBasePath?: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [paused, setPaused] = useState<Paused[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [pausedOpen, setPausedOpen] = useState(false); // collapsed by default — just the headline
  // Clan scope: '' = every clan you oversee (admins see all clans), or one clan.
  const [clanFilter, setClanFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    // Independent: a failure in one list must not blank the other.
    const [s, p] = await Promise.allSettled([
      mentorApi.listPauseSuggestions(),
      mentorApi.listPausedMentees(),
    ]);
    setSuggestions(s.status === 'fulfilled' ? ((s.value as any)?.data?.suggestions ?? []) : []); // eslint-disable-line @typescript-eslint/no-explicit-any
    setPaused(p.status === 'fulfilled' ? ((p.value as any)?.data?.paused ?? []) : []); // eslint-disable-line @typescript-eslint/no-explicit-any
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Clans present across the flagged + paused lists, for the scope picker. (An
  // admin's lists already span every clan they oversee, so this is the full set
  // that actually has someone to act on.)
  const clanOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const s of suggestions) byId.set(s.clanId, s.clanName);
    for (const p of paused) byId.set(p.clanId, p.clanName);
    return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [suggestions, paused]);

  const shownSuggestions = clanFilter ? suggestions.filter((s) => s.clanId === clanFilter) : suggestions;
  const shownPaused = clanFilter ? paused.filter((p) => p.clanId === clanFilter) : paused;
  const scopeName = clanFilter ? (clanOptions.find((c) => c.id === clanFilter)?.name || 'this clan') : 'all clans';

  const doPause = async (s: Suggestion) => {
    const ok = await confirm({
      title: `Pause ${s.name}?`,
      description: `They'll stay in ${s.clanName} and keep getting reminders to come back, but won't count toward your clan's reports until they re-engage.`,
      confirmLabel: 'Pause mentee',
    });
    if (!ok) return;
    setBusy(s.menteeId);
    try { await mentorApi.pauseMentee(s.menteeId, undefined, s.clanId); toast.success(`${s.name} paused`); await load(); }
    catch { toast.error('Could not pause'); }
    finally { setBusy(null); }
  };
  const pauseAll = async () => {
    const n = shownSuggestions.length;
    const ok = await confirm({
      title: `Pause all ${n} inactive mentees in ${scopeName}?`,
      description: `Everyone flagged in ${scopeName} will be paused and emailed to ask their mentor to resume them. They stay in their clans and drop out of your reports until they re-engage. You can resume anyone with one click.`,
      confirmLabel: `Pause ${n}`,
    });
    if (!ok) return;
    setBusy('*');
    try {
      // Scope the sweep to the picked clan (undefined = every clan you oversee).
      const res = await mentorApi.runInactivityCheck({ autoPause: true, clanId: clanFilter || undefined }) as { data?: { pausedCount?: number } };
      toast.success(`Paused ${res?.data?.pausedCount ?? 0} mentee(s)`);
      await load();
    } catch { toast.error('Could not run the check'); }
    finally { setBusy(null); }
  };
  const dismiss = async (s: Suggestion) => {
    setBusy(s.menteeId);
    try { await mentorApi.dismissPauseSuggestion(s.menteeId, s.clanId); toast.success('Kept active'); setSuggestions((prev) => prev.filter((x) => x.menteeId !== s.menteeId || x.clanId !== s.clanId)); }
    catch { toast.error('Could not dismiss'); }
    finally { setBusy(null); }
  };
  const resume = async (p: Paused) => {
    setBusy(p.menteeId);
    try { await mentorApi.resumeMentee(p.menteeId, p.clanId); toast.success(`${p.name} resumed`); await load(); }
    catch { toast.error('Could not resume'); }
    finally { setBusy(null); }
  };

  if (loading) return null;
  if (!suggestions.length && !paused.length) return null;

  return (
    <div className="space-y-4">
      {/* Clan scope — filter the check to one clan, or sweep every clan you
          oversee (admins see all clans here). Hidden when there's only one. */}
      {clanOptions.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500">Clan</label>
          <select
            value={clanFilter}
            onChange={(e) => setClanFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All clans ({clanOptions.length})</option>
            {clanOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Suggested to pause */}
      {shownSuggestions.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <BellRing className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-900">Suggested to pause ({shownSuggestions.length})</h3>
            <span className="text-xs text-amber-700">These mentees look inactive. Pausing keeps your reports clean; they stay in the clan.</span>
            <button
              onClick={pauseAll}
              disabled={busy === '*'}
              className="ml-auto shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 inline-flex items-center gap-1 disabled:opacity-50"
            >
              {busy === '*' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PauseCircle className="w-3.5 h-3.5" />}
              Pause all {shownSuggestions.length}
            </button>
          </div>
          <div className="space-y-2">
            {shownSuggestions.map((s) => (
              <div key={`${s.menteeId}:${s.clanId}`} className="flex items-center justify-between gap-3 bg-card rounded-xl border border-amber-100 px-3.5 py-2.5">
                <button onClick={() => router.push(`${menteeBasePath}/${s.menteeId}`)} className="min-w-0 text-left">
                  <p className="text-sm font-medium text-slate-900 truncate">{s.name}</p>
                  <p className="text-xs text-slate-500 truncate">{s.clanName} · {s.reason}</p>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => dismiss(s)} disabled={busy === s.menteeId}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1 disabled:opacity-50">
                    <X className="w-3.5 h-3.5" />Keep active
                  </button>
                  <button onClick={() => doPause(s)} disabled={busy === s.menteeId}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 inline-flex items-center gap-1 disabled:opacity-50">
                    {busy === s.menteeId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PauseCircle className="w-3.5 h-3.5" />}Pause
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Currently paused — collapsed by default; click the header to expand. */}
      {shownPaused.length > 0 && (
        <div className="bg-card border border-slate-200 rounded-2xl p-4">
          <button
            onClick={() => setPausedOpen((v) => !v)}
            aria-expanded={pausedOpen}
            className="w-full flex items-center gap-2 text-left"
          >
            <MoonStar className="w-4 h-4 text-slate-500 shrink-0" />
            <h3 className="text-sm font-semibold text-slate-900 shrink-0">Paused ({shownPaused.length})</h3>
            <span className="text-xs text-slate-500 truncate">Out of reports, still getting win-back reminders. Auto-resume when they come back.</span>
            <ChevronDown className={`w-4 h-4 text-slate-400 ml-auto shrink-0 transition-transform ${pausedOpen ? 'rotate-180' : ''}`} />
          </button>
          {pausedOpen && (
          <div className="space-y-2 mt-3">
            {shownPaused.map((p) => (
              <div key={`${p.menteeId}:${p.clanId}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3.5 py-2.5">
                <button onClick={() => router.push(`${menteeBasePath}/${p.menteeId}`)} className="min-w-0 text-left">
                  <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {p.clanName}
                    {p.pausedAt ? ` · paused ${new Date(p.pausedAt).toLocaleDateString()}` : ''}
                    {p.reengageCount ? ` · ${p.reengageCount} reminder${p.reengageCount === 1 ? '' : 's'} sent` : ''}
                  </p>
                </button>
                <button onClick={() => resume(p)} disabled={busy === p.menteeId}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 inline-flex items-center gap-1 disabled:opacity-50 shrink-0">
                  {busy === p.menteeId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}Resume
                </button>
              </div>
            ))}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
