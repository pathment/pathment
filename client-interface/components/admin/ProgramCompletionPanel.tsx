'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Archive, CalendarDays, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { qk, useApiQuery } from '@/lib/query';
import { completionApi, type ClosurePreview } from '@/lib/services/program-completion-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
});

function displayDate(value?: string | null) {
  if (!value) return null;
  return DATE_FORMATTER.format(new Date(`${value.slice(0, 10)}T12:00:00.000Z`));
}

export function ProgramCompletionPanel({
  programId,
  programName,
  status,
  onClosed,
}: {
  programId: string;
  programName: string;
  status: string;
  onClosed: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [closeDate, setCloseDate] = useState('');
  const [closing, setClosing] = useState(false);
  const { data: preview, loading, fetching, error } = useApiQuery<ClosurePreview>({
    queryKey: qk.admin.programCompletion(programId),
    queryFn: () => completionApi.preview(programId),
    enabled: status !== 'completed',
    errorMessage: 'Could not load program completion details',
  });

  if (status === 'completed') return null;

  const openDialog = () => {
    if (!preview?.canClose) {
      toast.error(preview?.started ? 'This program is already closed' : 'This program has not started yet');
      return;
    }
    setCloseDate(preview.today || new Date().toISOString().slice(0, 10));
    setDialogOpen(true);
  };

  const submitClose = async () => {
    if (!preview || !closeDate) return;
    if (preview.earliestCloseDate && closeDate < preview.earliestCloseDate) {
      toast.error(`Choose ${displayDate(preview.earliestCloseDate)} or later`);
      return;
    }
    if (preview.today && closeDate > preview.today) {
      toast.error('Close date cannot be in the future');
      return;
    }
    setClosing(true);
    try {
      await completionApi.close(programId, { closedAt: closeDate });
      toast.success(`${programName} closed as of ${displayDate(closeDate)}`);
      setDialogOpen(false);
      onClosed();
    } catch (closeError) {
      toast.error(extractApiErrorMessage(closeError, 'Could not close the program'));
    } finally {
      setClosing(false);
    }
  };

  const scheduledEnd = displayDate(preview?.scheduledEndDate);
  const canClose = preview?.canClose === true;

  return (
    <>
      <section className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-card shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <Archive className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-slate-950">Program completion</h2>
                {preview?.started && !preview.ended && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Early closure available</span>
                )}
              </div>
              {loading ? (
                <p className="mt-1 text-sm text-slate-500">Checking completion options…</p>
              ) : error ? (
                <p className="mt-1 text-sm text-red-600">{error}</p>
              ) : preview?.started ? (
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {scheduledEnd && !preview.ended
                    ? `Scheduled to end ${scheduledEnd}, but full-access admins can close it earlier.`
                    : 'Choose the effective closure date before finalizing results.'}
                </p>
              ) : (
                <p className="mt-1 text-sm leading-6 text-slate-600">Closure becomes available when the program starts{preview?.earliestCloseDate ? ` on ${displayDate(preview.earliestCloseDate)}` : ''}.</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={openDialog}
            disabled={!canClose || fetching}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarDays className="h-4 w-4" aria-hidden="true" />}
            Choose close date
          </button>
        </div>
        {preview && (preview.unresolved.length > 0 || (preview.certificatesNotIssued?.length ?? 0) > 0) && (
          <div className="flex flex-col gap-2 border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {preview.unresolved.length > 0 && `${preview.unresolved.length} certificate decision${preview.unresolved.length === 1 ? '' : 's'} need attention. `}
                {(preview.certificatesNotIssued?.length ?? 0) > 0 && `${preview.certificatesNotIssued?.length} certificate${preview.certificatesNotIssued?.length === 1 ? '' : 's'} have not been issued.`}
                {' '}These are warnings and do not block an admin from closing.
              </span>
            </span>
            <Link href="/admin/certificates" className="shrink-0 font-semibold text-amber-900 underline underline-offset-2">Review certificates</Link>
          </div>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!closing) setDialogOpen(open); }}>
        {preview && (
          <DialogContent className="block max-h-[calc(100vh-2rem)] w-full max-w-lg gap-0 overflow-y-auto rounded-3xl border-slate-200 bg-white p-0 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-6">
              <div className="flex gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700"><Archive className="h-5 w-5" aria-hidden="true" /></span>
                <div><DialogTitle className="pr-8 text-xl leading-7 text-slate-950">Close {programName}?</DialogTitle><DialogDescription className="mt-1 text-sm text-slate-500">This creates the program’s final historical snapshot.</DialogDescription></div>
              </div>
            </div>

            <div className="space-y-5 p-6">
              <div>
                <label htmlFor="program-close-date" className="text-sm font-semibold text-slate-900">Effective close date</label>
                <p className="mt-1 text-xs leading-5 text-slate-500">Choose any date from the program start through today. The scheduled end date does not restrict you.</p>
                <div className="relative mt-2">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input id="program-close-date" type="date" value={closeDate} min={preview.earliestCloseDate || undefined} max={preview.today} onChange={(event) => setCloseDate(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm font-medium text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  {preview.earliestCloseDate && <span>Earliest: <strong className="text-slate-700">{displayDate(preview.earliestCloseDate)}</strong></span>}
                  {scheduledEnd && <span>Scheduled end: <strong className="text-slate-700">{scheduledEnd}</strong></span>}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What happens next</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  {['Final performance is calculated through the selected date.', 'Cohort clans and their past work become read-only.', 'Future cohort reviews are stopped; existing history remains available.'].map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />{item}</li>)}
                </ul>
              </div>

              {(preview.unresolved.length > 0 || (preview.certificatesNotIssued?.length ?? 0) > 0) && (
                <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <p>Certificate work is still pending, but it does not block closure. Certificates can still be managed by an admin afterward.</p>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/70 p-5 sm:flex-row sm:justify-end">
              <button type="button" disabled={closing} onClick={() => setDialogOpen(false)} className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Keep program open</button>
              <button type="button" disabled={closing || !closeDate} onClick={() => void submitClose()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                {closing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Close program on {displayDate(closeDate) || 'selected date'}
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
