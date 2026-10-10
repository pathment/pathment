'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, Clock, Loader2, Plus, Sparkles, Users } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { completionApi, type StandingRequest } from '@/lib/services/program-completion-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useClan } from '@/lib/context/ClanContext';
import { qk } from '@/lib/query';
import { useProgramCloseoutEnabled } from '@/lib/hooks/useProgramCloseoutEnabled';
import { cn } from '@/components/ui/utils';

const button =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50';
const field = 'mt-2 w-full rounded-xl border border-border bg-card p-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-brand-500';

/**
 * Compact standing-clan request control for the completed-history banner.
 * Hidden once this program already has an approved standing clan for the mentor.
 * Hidden on Starter / free plans (paid standing-clan feature).
 */
export function StandingClanRequestCta({
  programId,
  sourceClanId,
  programName,
}: {
  programId: string;
  /**
   * The clan this banner is being shown ON. Everything below is scoped to it:
   * a mentor can run several clans in one programme, and matching on programme
   * alone made a request raised from one clan read as "requested" on all of
   * them — and blocked the others from ever having their own.
   */
  sourceClanId: string;
  programName?: string;
}) {
  const closeoutEnabled = useProgramCloseoutEnabled();
  const { clans } = useClan();
  const queryClient = useQueryClient();
  const [eligible, setEligible] = useState(false);
  const [requests, setRequests] = useState<StandingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!closeoutEnabled) {
      setEligible(false);
      setRequests([]);
      setLoading(false);
      return;
    }
    try {
      const [r, programs] = await Promise.all([
        completionApi.requests(),
        completionApi.eligiblePrograms(),
      ]);
      setRequests(Array.isArray(r) ? r : []);
      // Eligibility is per clan now. `clanId` is absent only when talking to an
      // API that has not been deployed yet, where programme is all there is.
      setEligible(Array.isArray(programs) && programs.some(
        (p) => (p.clanId ? p.clanId === sourceClanId : p.id === programId),
      ));
    } catch {
      setRequests([]);
      setEligible(false);
    } finally {
      setLoading(false);
    }
  }, [programId, sourceClanId, closeoutEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!closeoutEnabled) return null;

  /**
   * This clan's own requests. A row with no source clan predates the column and
   * cannot be attributed, so it keeps the old programme-wide meaning rather
   * than disappearing from a banner someone is relying on.
   */
  const forThisClan = requests.filter((r) => (
    r.sourceClanId
      ? r.sourceClanId === sourceClanId
      : r.program?.id === programId
  ));
  const approved = forThisClan.some((r) => r.status === 'approved');
  const pending = forThisClan.find((r) => r.status === 'pending');
  // The standing clan this clan already produced — not merely any standing clan
  // in the programme, which would hide the CTA on a sibling clan that has none.
  const createdClanIds = new Set(
    forThisClan.map((r) => r.createdClanId).filter(Boolean) as string[],
  );
  const hasStandingClan = clans.some((c) => c.kind === 'standing' && createdClanIds.has(c.id));

  // After admin approval (or an existing standing clan for this program), hide the CTA.
  if (approved || hasStandingClan) return null;
  if (loading) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading standing clan options" />
        Checking next-step options…
      </span>
    );
  }
  if (!eligible && !pending) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await completionApi.request({
        programId,
        sourceClanId,
        name: name.trim(),
        description: description.trim(),
      });
      toast.success('Request sent to admins');
      setOpen(false);
      setName('');
      setDescription('');
      await queryClient.invalidateQueries({ queryKey: qk.clan.all });
      await load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not submit request'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {pending ? (
        <div
          className={cn(
            'flex max-w-xs items-start gap-2.5 rounded-2xl border border-amber-200',
            'bg-amber-50/90 px-3.5 py-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
          )}
        >
          <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <span className="block text-xs font-semibold">Standing clan requested</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed opacity-80">An admin is reviewing your new mentoring space.</span>
          </span>
        </div>
      ) : (
        <div className="max-w-xs">
          <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
            Want to keep mentoring? Start a fresh, ongoing clan after admin approval.
          </p>
          <button
            type="button"
            className={cn(button, 'w-full shrink-0')}
            onClick={() => {
              setName(programName ? `${programName} · Standing` : '');
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Request standing clan
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      <Drawer
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Request a standing clan"
        subtitle="An admin will review your request. After approval, you can add mentees from your organization."
        footer={
          <button
            className={button}
            disabled={busy || !name.trim()}
            onClick={submit}
          >
            {busy ? 'Sending…' : 'Send request'}
          </button>
        }
      >
        <div className="space-y-4">
          {programName ? (
            <div className="flex gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 p-4 dark:border-brand-900 dark:bg-brand-950/30">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">Continue after completion</p>
                <p className="mt-1 text-sm text-foreground">Create a fresh mentoring space connected to <span className="font-semibold">{programName}</span>.</p>
              </div>
            </div>
          ) : null}
          <label className="block text-sm font-medium">
            New clan name
            <input
              value={name}
              maxLength={150}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. MERN Fellows Alumni"
              className={field}
            />
          </label>
          <label className="block text-sm font-medium">
            What would you like to work on?
            <textarea
              value={description}
              maxLength={4000}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe the ongoing mentoring focus"
              className={`${field} min-h-24`}
            />
            <span className="mt-1 block text-right text-xs text-muted-foreground">{description.length}/4000</span>
          </label>
          <div className="flex items-start gap-2 rounded-xl bg-muted/70 px-3 py-2.5 text-sm text-muted-foreground">
            <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>Your new clan starts empty. After approval, you choose who joins; completed program records stay unchanged.</p>
          </div>
        </div>
      </Drawer>
    </>
  );
}
