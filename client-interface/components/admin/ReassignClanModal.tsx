'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ArrowRightLeft, AlertTriangle } from 'lucide-react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { clanApi } from '@/lib/services/clan-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

interface ClanLite { id: string; name: string; program?: { id: string; name: string } | null }

/**
 * Admin: move a mentee to a different clan, fixing an accidental placement.
 * Loads the clan list, lets you pick a destination (grouped label shows the
 * program), and warns when the move crosses programs (which wipes prior progress).
 */
export function ReassignClanModal({
  menteeId, menteeName, currentClanId, currentProgramId, onClose, onDone,
}: {
  menteeId: string;
  menteeName: string;
  currentClanId?: string | null;
  currentProgramId?: string | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [clans, setClans] = useState<ClanLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    clanApi.list()
      .then((r: any) => { if (alive) setClans(r?.data?.clans ?? []); })
      .catch(() => { if (alive) setClans([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const options = useMemo(
    () => clans
      .filter((c) => c.id !== currentClanId)
      .map((c) => ({ value: c.id, label: c.program?.name ? `${c.name} · ${c.program.name}` : c.name })),
    [clans, currentClanId]
  );

  const targetClan = clans.find((c) => c.id === target);
  const crossProgram = !!(targetClan && currentProgramId && targetClan.program?.id && targetClan.program.id !== currentProgramId);

  const submit = async () => {
    if (!target) { toast.error('Pick a destination clan'); return; }
    setSaving(true);
    try {
      await clanApi.reassign(menteeId, target);
      toast.success(`${menteeName} moved to ${targetClan?.name ?? 'the clan'}`);
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not reassign the mentee'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-brand-600" /> Move {menteeName} to another clan
          </AlertDialogTitle>
          <AlertDialogDescription>
            Removes their current clan placement and assigns them to the one you pick.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-2">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>
          ) : (
            <>
              <label className="block text-sm font-medium text-slate-700 mb-1">Destination clan</label>
              <SelectMenu value={target} onChange={setTarget} options={options} placeholder="Select a clan…" ariaLabel="Destination clan" />
              {crossProgram && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>This clan is in a different program. Their current program enrollment, assigned tasks and progress will be <strong>permanently removed</strong> and they&apos;ll start fresh.</span>
                </div>
              )}
            </>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); submit(); }}
            disabled={saving || !target}
            className={crossProgram ? 'bg-amber-600 hover:bg-amber-700' : undefined}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Move mentee'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
