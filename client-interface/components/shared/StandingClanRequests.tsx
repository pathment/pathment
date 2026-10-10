'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import { Drawer } from './Drawer';
import { SelectMenu } from './SelectMenu';
import {
  completionApi,
  type StandingRequest,
} from '@/lib/services/program-completion-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useProgramCloseoutEnabled } from '@/lib/hooks/useProgramCloseoutEnabled';
import {
  StandingClanDecisionButtons,
  StandingClanDecisionDrawer,
  STANDING_CLAN_UPGRADE_COPY,
  type StandingClanReview,
} from './StandingClanDecisionDrawer';

const button =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50';
const field =
  'mt-2 w-full rounded-xl border border-border bg-card p-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-brand-500';

const STATUS_META = {
  pending: {
    label: 'Awaiting review',
    icon: Clock3,
    chip: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
    tile: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle2,
    chip: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
    tile: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  },
  rejected: {
    label: 'Changes needed',
    icon: XCircle,
    chip: 'border-border bg-muted text-muted-foreground',
    tile: 'bg-muted text-muted-foreground',
  },
} as const;

export function StandingClanRequests({
  admin = false,
  hideWhenEmpty = false,
  hideRequestButton = false,
}: {
  admin?: boolean;
  hideWhenEmpty?: boolean;
  /** When the request CTA lives on the completed-history banner instead. */
  hideRequestButton?: boolean;
}) {
  const closeoutEnabled = useProgramCloseoutEnabled();
  const [requests, setRequests] = useState<StandingRequest[]>([]);
  const [programs, setPrograms] = useState<{ id: string; name: string; clanId?: string; clanName?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [programId, setProgramId] = useState('');
  // A request belongs to a clan, not a programme: a mentor can run several
  // clans in one, and keying on the programme let one request speak for them
  // all while blocking the rest from ever having their own.
  const [sourceClanId, setSourceClanId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [review, setReview] = useState<StandingClanReview | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const [requestRows, eligiblePrograms] = await Promise.all([
        completionApi.requests(),
        admin || !closeoutEnabled
          ? Promise.resolve([])
          : completionApi.eligiblePrograms(),
      ]);
      setRequests(Array.isArray(requestRows) ? requestRows : []);
      setPrograms(Array.isArray(eligiblePrograms) ? eligiblePrograms : []);
    } catch (loadError) {
      setError(
        extractApiErrorMessage(
          loadError,
          'Could not load standing clan requests',
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [admin, closeoutEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!closeoutEnabled) return;
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
      await load();
    } catch (submitError) {
      toast.error(
        extractApiErrorMessage(submitError, 'Could not submit request'),
      );
    } finally {
      setBusy(false);
    }
  };

  // Approved mentor requests move into the clan picker; admins keep the complete
  // decision history so they can understand what happened later.
  const visible = admin
    ? requests
    : requests.filter((request) => request.status !== 'approved');

  if (
    !admin &&
    hideWhenEmpty &&
    !loading &&
    !error &&
    visible.length === 0
  ) {
    return null;
  }

  const openRequestDrawer = () => {
    const firstProgram = programs[0];
    setProgramId(firstProgram?.id || '');
    setName(firstProgram ? `${firstProgram.name} · Standing` : '');
    setOpen(true);
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b border-border bg-gradient-to-r from-brand-50/80 via-card to-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 dark:from-brand-950/30">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Standing clan requests
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {admin
                ? 'Review requests for ongoing mentoring spaces. Approved clans start empty, and the mentor chooses who joins.'
                : hideRequestButton
                  ? 'Track requests for ongoing mentoring spaces after a program ends.'
                  : 'Continue mentoring in a fresh, ongoing clan after a program formally closes.'}
            </p>
          </div>
        </div>
        {!admin && !hideRequestButton && closeoutEnabled ? (
          <button
            type="button"
            className={button}
            disabled={!programs.length}
            title={
              programs.length
                ? undefined
                : 'A completed program is required before requesting a standing clan'
            }
            onClick={openRequestDrawer}
          >
            <Plus className="h-4 w-4" aria-hidden />
            New request
          </button>
        ) : null}
      </div>

      <div className="p-5 sm:p-6">
        {!closeoutEnabled ? (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {STANDING_CLAN_UPGRADE_COPY}
            {admin ? (
              <>
                {' '}
                <Link
                  href="/admin/settings?tab=plan"
                  className="font-semibold underline underline-offset-2"
                >
                  View plans
                </Link>
              </>
            ) : (
              ' Ask a workspace admin to enable it.'
            )}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden />
            Loading requests…
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50/70 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => void load()} className="mt-2 font-semibold underline underline-offset-2">
              Try again
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {!admin && closeoutEnabled && !programs.length ? (
              <p className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                You can request a standing clan after an admin formally closes a program you mentor.
              </p>
            ) : null}

            {!visible.length ? (
              <div className="rounded-2xl border border-dashed border-border px-5 py-9 text-center">
                <Users className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden />
                <p className="mt-3 text-sm font-semibold text-foreground">
                  {admin ? 'No standing clan requests' : 'No open requests'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {admin
                    ? 'New mentor requests will appear here for review.'
                    : 'Your submitted requests and their status will appear here.'}
                </p>
              </div>
            ) : null}

            {visible.map((request) => {
              const meta = STATUS_META[request.status];
              const StatusIcon = meta.icon;
              return (
                <article
                  key={request.id}
                  className="flex flex-col gap-4 rounded-2xl border border-border p-4 transition-colors hover:border-brand-200 sm:flex-row sm:items-center sm:justify-between dark:hover:border-brand-900"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.tile}`}>
                      <StatusIcon className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-foreground">{request.name}</h3>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${meta.chip}`}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        From {request.program.name}
                        {admin
                          ? ` · Requested by ${request.mentor.firstName} ${request.mentor.lastName}`
                          : ''}
                      </p>
                      {request.description ? (
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                          {request.description}
                        </p>
                      ) : null}
                      {request.decisionNote ? (
                        <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground">Admin note:</span>{' '}
                          {request.decisionNote}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {admin && request.status === 'pending' ? (
                    <div className="shrink-0 pl-[3.25rem] sm:pl-0">
                      <StandingClanDecisionButtons
                        row={request}
                        disabled={!closeoutEnabled}
                        title={
                          !closeoutEnabled
                            ? STANDING_CLAN_UPGRADE_COPY
                            : undefined
                        }
                        onReview={setReview}
                        onDecided={load}
                      />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <Drawer
        open={open && closeoutEnabled}
        onClose={() => !busy && setOpen(false)}
        title="Request a standing clan"
        subtitle="An admin will review the request. After approval, you choose the mentees who join."
        footer={
          <button
            type="button"
            className={button}
            disabled={busy || !sourceClanId || !name.trim()}
            onClick={() => void submit()}
          >
            {busy ? 'Sending…' : 'Send request'}
          </button>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-4 dark:border-brand-900 dark:bg-brand-950/30">
            <p className="text-sm font-semibold text-foreground">A fresh space, not a reopened program</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Completed work remains preserved. The approved standing clan starts with an empty roster.
            </p>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Clan to continue</p>
            <SelectMenu
              ariaLabel="Clan to continue"
              value={sourceClanId}
              onChange={(value) => {
                const entry = programs.find((item) => (item.clanId ?? item.id) === value);
                setSourceClanId(value);
                setProgramId(entry?.id ?? '');
                const label = entry?.clanName ?? entry?.name;
                if (label && !name.trim()) setName(`${label} · Standing`);
              }}
              options={programs.map((entry) => ({
                // Each eligible entry is one clan. Naming its programme too
                // keeps two same-named clans in different programmes apart.
                value: entry.clanId ?? entry.id,
                label: entry.clanName ? `${entry.clanName} · ${entry.name}` : entry.name,
              }))}
            />
          </div>
          <label className="block text-sm font-medium">
            New clan name
            <input
              value={name}
              maxLength={150}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. MERN Fellows Alumni"
              className={field}
            />
          </label>
          <label className="block text-sm font-medium">
            What would you like to work on?
            <textarea
              value={description}
              maxLength={4000}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Briefly describe the ongoing mentoring focus"
              className={`${field} min-h-24`}
            />
            <span className="mt-1 block text-right text-xs text-muted-foreground">
              {description.length}/4000
            </span>
          </label>
        </div>
      </Drawer>

      <StandingClanDecisionDrawer
        review={review}
        onClose={() => setReview(null)}
        onDecided={load}
      />
    </section>
  );
}
