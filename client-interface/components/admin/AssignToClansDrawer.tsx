'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, X, Users2, Check, Wand2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { applicationApi, type ClanAssignSettings } from '@/lib/services/intake-api';

interface Row {
  applicationId: string;
  userId: string | null;
  name: string; email: string;
  level: string | null; levelLabel: string | null; gender: string;
  clanId: string | null; clanName: string | null;
  status: 'assigned' | 'unassigned' | 'already_placed';
  reason: string;
  /** Why an accepted person is still unplaced (expired invite, never registered…). */
  note?: string | null;
}
type Mode = 'candidates' | 'unplaced';
interface ClanInfo { id: string; name: string; levels: string[]; leadGender: string; cap: number; projectedFill: number }

/**
 * Assign selected intake candidates to clans. Configure the run (capacity,
 * level/gender matching, exclusions, balance), preview the proposed clan per
 * candidate, override any row, then commit — which accepts each candidate with
 * their clan so registration drops them straight into it.
 */
export function AssignToClansDrawer({
  cohortId, applicationIds, onClose, onDone,
}: {
  cohortId: string;
  applicationIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [settings, setSettings] = useState<ClanAssignSettings>({
    capacity: null, matchLevel: true, matchGender: false, matchCountry: false,
    excludeClanIds: [], balanceMode: 'even', allowLevelOverflow: false,
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [clans, setClans] = useState<ClanInfo[]>([]);
  const [summary, setSummary] = useState<{ assigned: number; unassigned: number; alreadyAccepted: number; stuck?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [mode, setMode] = useState<Mode>('candidates');

  const preview = useCallback(async () => {
    setLoading(true);
    try {
      const call = mode === 'unplaced'
        ? applicationApi.previewUnassignedAssignment(cohortId, settings)
        : applicationApi.previewClanAssignment(cohortId, applicationIds, settings);
      const res = await call as { data?: { rows: Row[]; clans: ClanInfo[]; summary: { assigned: number; unassigned: number; alreadyAccepted: number } } };
      setRows(res?.data?.rows ?? []);
      setClans(res?.data?.clans ?? []);
      setSummary(res?.data?.summary ?? null);
    } catch { toast.error('Could not build the assignment preview'); }
    finally { setLoading(false); }
  }, [cohortId, applicationIds, settings, mode]);

  // Re-preview whenever the run settings change.
  useEffect(() => { preview(); }, [preview]);

  const setClan = (applicationId: string, clanId: string) => {
    const clan = clans.find((c) => c.id === clanId);
    setRows((prev) => prev.map((r) => r.applicationId === applicationId
      ? { ...r, clanId: clanId || null, clanName: clan?.name ?? null, status: clanId ? 'assigned' : 'unassigned', reason: clanId ? 'Manually chosen' : 'Not assigned' }
      : r));
  };
  const toggleExclude = (clanId: string) => setSettings((s) => {
    const set = new Set(s.excludeClanIds ?? []);
    set.has(clanId) ? set.delete(clanId) : set.add(clanId);
    return { ...s, excludeClanIds: [...set] };
  });

  const commit = async () => {
    const ready = rows.filter((r) => r.status === 'assigned' && r.clanId);
    if (!ready.length) { toast.error('Nobody is assigned to a clan yet'); return; }
    setCommitting(true);
    // Batch so a big run can't die on one long request / a mid-flight token
    // expiry. Each batch is idempotent server-side, so a retry never duplicates.
    const CHUNK = 25;
    let done = 0;
    try {
      if (mode === 'unplaced') {
        // Send applicationId as well as userId, and DON'T drop rows without a
        // userId: someone accepted who never registered has no account yet, and
        // the server re-issues their clan-stamped invite from the applicationId.
        // Filtering them out here is what made them unrecoverable.
        const items = ready.map((r) => ({ userId: r.userId, applicationId: r.applicationId, clanId: r.clanId }));
        let invited = 0;
        for (let i = 0; i < items.length; i += CHUNK) {
          const res = await applicationApi.commitUnassignedAssignment(cohortId, items.slice(i, i + CHUNK)) as { data?: { placed: number; invited?: number } };
          done += res?.data?.placed ?? 0;
          invited += res?.data?.invited ?? 0;
          setProgress({ done: Math.min(i + CHUNK, items.length), total: items.length });
        }
        toast.success(invited
          ? `Placed ${done} mentee(s); re-invited ${invited} who hadn't registered`
          : `Placed ${done} mentee(s) into clans`);
      } else {
        const items = ready.map((r) => ({ applicationId: r.applicationId, clanId: r.clanId }));
        for (let i = 0; i < items.length; i += CHUNK) {
          const res = await applicationApi.commitClanAssignment(cohortId, items.slice(i, i + CHUNK)) as { data?: { accepted: number } };
          done += res?.data?.accepted ?? 0;
          setProgress({ done: Math.min(i + CHUNK, items.length), total: items.length });
        }
        toast.success(`Assigned ${done} candidate(s) to clans — invites sent`);
      }
      onDone();
    } catch { toast.error(`Assigned ${done} before the request failed — reopen to finish the rest (nothing is duplicated).`); }
    finally { setCommitting(false); setProgress(null); }
  };

  const inp = 'px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => !committing && onClose()}>
      <div className="w-full max-w-3xl h-full overflow-hidden bg-card shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users2 className="w-5 h-5 text-brand-600" />
              <h3 className="font-semibold text-slate-900">Assign to clans</h3>
            </div>
            <button onClick={onClose} disabled={committing} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
          </div>
          {/* Mode: place the selected candidates (accept + invite), or place
              already-accepted mentees who registered without a clan. */}
          <div className="mt-3 inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
            <button onClick={() => setMode('candidates')} className={`px-3 py-1.5 rounded-md ${mode === 'candidates' ? 'bg-brand-600 text-white' : 'text-slate-600'}`}>
              Selected candidates ({applicationIds.length})
            </button>
            <button onClick={() => setMode('unplaced')} className={`px-3 py-1.5 rounded-md ${mode === 'unplaced' ? 'bg-brand-600 text-white' : 'text-slate-600'}`}>
              Unplaced accepted mentees
            </button>
          </div>
        </div>

        {/* Run settings */}
        <div className="px-5 py-3 border-b border-slate-100 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5 text-slate-700">
              Capacity per clan
              <input
                type="number" min={1} placeholder="clan default"
                value={settings.capacity ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, capacity: e.target.value ? parseInt(e.target.value, 10) : null }))}
                className={`w-28 ${inp}`}
              />
            </label>
            <label className="flex items-center gap-1.5 text-slate-700">
              Balance
              <select value={settings.balanceMode} onChange={(e) => setSettings((s) => ({ ...s, balanceMode: e.target.value as 'even' | 'fill' }))} className={inp}>
                <option value="even">Spread evenly</option>
                <option value="fill">Fill one, then next</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={settings.matchLevel} onChange={(e) => setSettings((s) => ({ ...s, matchLevel: e.target.checked }))} /> Match level</label>
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={settings.matchGender} onChange={(e) => setSettings((s) => ({ ...s, matchGender: e.target.checked }))} /> Match gender to clan lead</label>
            <label className="flex items-center gap-1.5 cursor-pointer" title="Send candidates to a clan that serves their country. Clans with no country set take anyone."><input type="checkbox" checked={settings.matchCountry} onChange={(e) => setSettings((s) => ({ ...s, matchCountry: e.target.checked }))} /> Match country</label>
            <label className="flex items-center gap-1.5 cursor-pointer" title="When a candidate's level clans are all full, allow placing them in another level's clan"><input type="checkbox" checked={settings.allowLevelOverflow} onChange={(e) => setSettings((s) => ({ ...s, allowLevelOverflow: e.target.checked }))} /> Allow level overflow</label>
          </div>
          {/* Exclusions */}
          {clans.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500 mr-1">Exclude:</span>
              {clans.map((c) => {
                const excluded = (settings.excludeClanIds ?? []).includes(c.id);
                return (
                  <button key={c.id} onClick={() => toggleExclude(c.id)}
                    className={`px-2 py-1 rounded-full text-xs border ${excluded ? 'border-rose-300 bg-rose-50 text-rose-600 line-through' : 'border-slate-200 text-slate-600 hover:border-brand-300'}`}>
                    {c.name} <span className="tabular-nums opacity-70">{c.projectedFill}/{c.cap}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary bar */}
        {summary && (
          <div className="px-5 py-2 border-b border-slate-100 flex gap-4 text-sm">
            <span className="text-emerald-700 font-medium">{summary.assigned} assigned</span>
            {summary.unassigned > 0 && <span className="text-amber-700 font-medium inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{summary.unassigned} need a clan</span>}
            {summary.alreadyAccepted > 0 && <span className="text-slate-500">{summary.alreadyAccepted} already in a clan</span>}
            {(summary.stuck ?? 0) > 0 && <span className="text-brand-700 font-medium">{summary.stuck} accepted but unplaced — assigning fixes them</span>}
          </div>
        )}

        {/* Preview rows */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
          ) : rows.length === 0 ? (
            <div className="py-16 px-6 text-center text-sm text-slate-500">
              {mode === 'unplaced'
                ? 'No accepted mentees are waiting for a clan — everyone accepted is placed.'
                : 'No candidates in this selection.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Candidate</th>
                  <th className="text-left font-medium px-4 py-2">Level</th>
                  <th className="text-left font-medium px-4 py-2">Clan</th>
                  <th className="text-left font-medium px-4 py-2">Why</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.applicationId} className={r.status === 'unassigned' ? 'bg-amber-50/40' : ''}>
                    <td className="px-4 py-2">
                      <p className="font-medium text-slate-900">{r.name}</p>
                      <p className="text-xs text-slate-500">{r.gender || '—'}</p>
                      {/* Where an accepted person is stuck — this is what tells you
                          the invite expired / was never sent, instead of leaving
                          you hunting the Invites page for a link that isn't there. */}
                      {r.note && <p className="text-[11px] text-brand-700 mt-0.5">{r.note}</p>}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{r.levelLabel || '—'}</td>
                    <td className="px-4 py-2">
                      {r.status === 'already_placed' ? (
                        <span className="text-xs text-slate-500" title="Move them from the mentee's profile or Clans page">
                          {r.clanName ?? r.reason}
                        </span>
                      ) : (
                        <select value={r.clanId ?? ''} onChange={(e) => setClan(r.applicationId, e.target.value)} className={`${inp} ${!r.clanId ? 'border-amber-300' : ''}`}>
                          <option value="">— pick a clan —</option>
                          {clans.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500 max-w-xs">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-400 inline-flex items-center gap-1">
            <Wand2 className="w-3.5 h-3.5" />
            {mode === 'unplaced'
              ? 'Places registered mentees straight into their clan; anyone who never registered gets a fresh clan-stamped invite.'
              : 'Accepts each candidate and emails a clan-stamped invite.'}
          </p>
          <div className="flex gap-2 shrink-0">
            <button onClick={onClose} disabled={committing} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700">Cancel</button>
            <button onClick={commit} disabled={committing || loading || !(summary?.assigned)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
              {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {progress ? `Working ${progress.done}/${progress.total}…`
                : mode === 'unplaced' ? `Place ${summary?.assigned ?? 0} into clans` : `Assign ${summary?.assigned ?? 0} & send invites`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
