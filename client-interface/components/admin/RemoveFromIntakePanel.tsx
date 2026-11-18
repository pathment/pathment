'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { applicationApi, type RemovalPreview } from '@/lib/services/intake-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

/**
 * Taking an applicant out of the intake — at any stage, accepted included.
 *
 * Shows exactly what will be undone before anything happens (their pool places
 * and pool work, an unused sign-up invitation, and — if they already joined —
 * their clans, open work and enrollment), and asks why: the reason is kept with
 * who did it, on the application.
 */
export function RemoveFromIntakePanel({ applicationId, name, onCancel, onRemoved }: {
  applicationId: string;
  name: string;
  onCancel: () => void;
  onRemoved: () => void;
}) {
  const [preview, setPreview] = useState<RemovalPreview | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    applicationApi.removalPreview(applicationId)
      .then((res: { data?: RemovalPreview }) => { if (live) setPreview(res?.data ?? null); })
      .catch((e: unknown) => { if (live) { toast.error(extractApiErrorMessage(e, 'Could not check what removing would undo')); onCancel(); } });
    return () => { live = false; };
  }, [applicationId, onCancel]);

  const remove = async () => {
    if (!reason.trim()) { toast.error('Say why — it is kept on their record'); return; }
    setBusy(true);
    try {
      await applicationApi.remove(applicationId, reason.trim());
      toast.success(`${name} was removed from the intake`);
      onRemoved();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not remove this applicant'));
    } finally {
      setBusy(false);
    }
  };

  const lines: string[] = [];
  if (preview) {
    for (const p of preview.pools) {
      lines.push(p.placed
        ? `${p.poolName}: already placed into a clan from this pool (handled with the programme below)`
        : `Withdrawn from ${p.poolName}${p.openTasks ? ` — ${p.openTasks} open task${p.openTasks === 1 ? '' : 's'} cancelled, Edorax seats released` : ''}`);
    }
    if (preview.invite) lines.push('Their unused sign-up invitation is revoked');
    if (preview.programme) {
      const { clans, openTasks, enrollments } = preview.programme;
      if (clans.length) lines.push(`Removed from ${clans.map((c) => c.name).join(', ')}${openTasks ? ` — ${openTasks} open task${openTasks === 1 ? '' : 's'} cancelled` : ''}`);
      if (enrollments.length) lines.push('Their enrollment in the programme is marked dropped');
    }
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/60 dark:bg-rose-500/10 p-3 text-sm text-rose-900 dark:text-rose-200">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-medium">Remove {name} from this intake?</p>
          {!preview ? (
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs"><Loader2 className="w-3.5 h-3.5 animate-spin" />Checking what this undoes…</p>
          ) : (
            <ul className="mt-1 list-disc pl-4 text-xs space-y-0.5">
              {lines.map((l) => <li key={l}>{l}</li>)}
              <li>The application stays in the list, marked removed, with who removed it and why. Finished work is kept.</li>
            </ul>
          )}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Why? <span className="text-slate-400 font-normal">(kept on their record, not sent to them)</span></label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
          placeholder="e.g. Duplicate application, or they asked to leave by email."
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-500" />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} disabled={busy} className="px-4 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">Cancel</button>
        <button onClick={remove} disabled={busy || !preview || !reason.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-rose-600 hover:bg-rose-700 text-white rounded-lg disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Remove from intake
        </button>
      </div>
    </div>
  );
}
