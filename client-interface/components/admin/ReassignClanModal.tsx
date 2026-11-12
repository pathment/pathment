'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ArrowRightLeft, AlertTriangle, Info } from 'lucide-react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { clanApi } from '@/lib/services/clan-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

interface ClanLite { id: string; name: string; kind?: string | null; program?: { id: string; name: string } | null }

/**
 * Admin: place a mentee in a different clan, fixing an accidental placement.
 *
 * Two destinations, two different things, because a standing clan is not a
 * season of a programme — it runs alongside one, and membership of it is
 * ADDITIVE. Transferring into it is therefore meaningless, and the server
 * refuses it outright ("Add mentees to this standing clan without transferring
 * them"). This dialog used to offer every clan as a move target with nothing
 * to tell the two apart, so picking a standing clan looked like a plain bug:
 * the right clan, the right button, a 400 back.
 *
 * So the destination list now says which kind each clan is, and picking a
 * standing one switches the action to Add — the mentee joins it and keeps the
 * clan they are in, which is what a standing clan means.
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

  // Cohort clans first, so the common case is at the top and "Standing clans"
  // reads as the separate thing it is rather than as more of the same list.
  const options = useMemo(
    () => clans
      .filter((c) => c.id !== currentClanId)
      .slice()
      .sort((a, b) => Number(a.kind === 'standing') - Number(b.kind === 'standing'))
      .map((c) => ({
        value: c.id,
        label: c.name,
        description: c.program?.name || undefined,
        group: c.kind === 'standing' ? 'Standing clans' : 'Cohort clans',
        meta: c.kind === 'standing' ? 'Standing' : undefined,
      })),
    [clans, currentClanId]
  );

  const targetClan = clans.find((c) => c.id === target);
  const isStanding = targetClan?.kind === 'standing';
  // A standing clan holds no programme enrolment, so nothing is wiped and the
  // cross-programme warning would be a lie.
  const crossProgram = !isStanding
    && !!(targetClan && currentProgramId && targetClan.program?.id && targetClan.program.id !== currentProgramId);

  const submit = async () => {
    if (!target) { toast.error('Pick a destination clan'); return; }
    setSaving(true);
    try {
      const where = targetClan?.name ?? 'the clan';
      if (isStanding) {
        // Additive by design: they join this clan and keep the one they are in.
        await clanApi.addMember(target, menteeId, 'mentee');
        toast.success(`${menteeName} added to ${where}`);
      } else {
        await clanApi.reassign(menteeId, target);
        toast.success(`${menteeName} moved to ${where}`);
      }
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, isStanding ? 'Could not add the mentee' : 'Could not reassign the mentee'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-brand-600" /> Place {menteeName} in another clan
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isStanding
              ? 'A standing clan runs alongside the programme, so they join it and keep the clan they are in.'
              : 'Removes their current clan placement and assigns them to the one you pick.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-2">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>
          ) : (
            <>
              <label className="block text-sm font-medium text-slate-700 mb-1">Destination clan</label>
              <SelectMenu value={target} onChange={setTarget} options={options} placeholder="Select a clan…" ariaLabel="Destination clan" />
              {isStanding && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-brand-600" />
                  <span>
                    This is a <strong>standing clan</strong>, so this <strong>adds</strong> them rather than moving them
                    — their current clan and its work are untouched. To have them only here, remove them from the other
                    clan afterwards.
                  </span>
                </div>
              )}
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
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : isStanding ? 'Add to clan' : 'Move mentee'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
