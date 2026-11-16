'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Check, Loader2, Search, Users, AlertTriangle, Send, Clock, CalendarCheck, Moon, Sparkles, Inbox } from 'lucide-react';

import { Drawer } from '@/components/shared/Drawer';
import { Avatar } from '@/components/shared/Avatar';
import { PushToPoolDrawer } from '@/components/shared/pool/PushToPoolDrawer';
import { mentorApi, type TransferClanOption, type TransferTargets } from '@/lib/services/mentor-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

/**
 * MoveMenteeDrawer — pick the clan a mentee should move to.
 *
 * The decision a mentor is actually making is "who should be mentoring this
 * person instead of me", so the list leads with PEOPLE: each clan card shows its
 * lead mentor's face and name, the co-mentors alongside them, and how many
 * mentees they already carry. A clan name alone tells a mentor nothing.
 *
 * Nothing moves here — this sends a request. The receiving clan accepts or
 * declines, which is what keeps one mentor from filling another's roster.
 */
export function MoveMenteeDrawer({
  menteeId, menteeName, onClose, onSent,
}: {
  menteeId: string;
  menteeName?: string;
  onClose: () => void;
  /** Fired after a request is successfully sent (refresh the caller's view). */
  onSent?: () => void;
}) {
  const [data, setData] = useState<TransferTargets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<TransferClanOption | null>(null);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  // "Not sure where they fit" → the handover pool, where other mentors and admins can claim them.
  const [poolOpen, setPoolOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    mentorApi.transfers.targets(menteeId)
      .then((r) => { if (alive) setData(r.data ?? null); })
      .catch((e) => { if (alive) setError(extractApiErrorMessage(e, 'Could not load the clans')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [menteeId]);

  // Filter locally: the list is small and instant beats a round-trip per keystroke.
  const clans = useMemo(() => {
    const all = data?.clans ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) =>
      c.name.toLowerCase().includes(q)
      || (c.programName || '').toLowerCase().includes(q)
      || (c.leadMentor?.name || '').toLowerCase().includes(q)
      || c.coMentors.some((m) => m.name.toLowerCase().includes(q))
    );
  }, [data, query]);

  const pending = data?.pendingRequest ?? null;
  const name = data?.mentee.name || menteeName || 'this mentee';
  const firstName = name.split(' ')[0];
  // Suggested clans lead, but only while not searching — a search is asking for something specific.
  const suggested = query.trim() ? [] : clans.filter((c) => c.suggested);
  const rest = clans.filter((c) => !suggested.includes(c));

  const send = async () => {
    if (!picked) return;
    setSending(true);
    try {
      await mentorApi.transfers.request(menteeId, picked.id, reason.trim() || undefined);
      toast.success(`Request sent to ${picked.leadMentor?.name || picked.name}`);
      onSent?.();
      onClose();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not send the request'));
    } finally {
      setSending(false);
    }
  };

  if (poolOpen && data) {
    return (
      <PushToPoolDrawer
        open
        onClose={() => setPoolOpen(false)}
        onDone={() => { onSent?.(); onClose(); }}
        clanId={data.currentClan.id}
        clanName={data.currentClan.name}
        mentee={{ id: menteeId, name }}
      />
    );
  }

  const card = (c: TransferClanOption) => {
    const selected = picked?.id === c.id;
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => setPicked(selected ? null : c)}
        aria-pressed={selected}
        className={`w-full text-left rounded-xl border px-3.5 py-3 transition-colors ${
          selected
            ? 'border-brand-400 bg-brand-50/60 dark:bg-brand-500/10 ring-1 ring-brand-200'
            : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* The lead mentor IS the answer to "who will look after them". */}
          <Avatar name={c.leadMentor?.name} src={c.leadMentor?.avatarUrl} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-slate-900 truncate">{c.name}</p>
              {c.kind === 'standing' && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">Standing</span>}
              {c.status === 'inactive' && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"><Moon className="w-3 h-3" />Inactive</span>}
              {selected && <Check className="w-4 h-4 text-brand-600 shrink-0" />}
            </div>
            <p className="text-xs text-slate-600 truncate">
              {c.leadMentor ? <>Led by <span className="font-medium">{c.leadMentor.name}</span></> : <span className="text-amber-600">No lead mentor yet</span>}
              {c.programName ? <span className="text-slate-400"> · {c.programName}</span> : null}
            </p>

            <div className="mt-2 flex items-center gap-3 flex-wrap">
              {c.activity && <ReviewActivity clan={c} />}
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <Users className="w-3 h-3" /> {c.menteeCount} mentee{c.menteeCount === 1 ? '' : 's'}
              </span>
              {c.coMentors.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="flex -space-x-1.5">
                    {c.coMentors.map((m) => (
                      <Avatar key={m.id} name={m.name} src={m.avatarUrl} size="xs" ring title={m.name} />
                    ))}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    +{c.coMentorCount} co-mentor{c.coMentorCount === 1 ? '' : 's'}
                  </span>
                </span>
              )}
              {c.crossProgram && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  <AlertTriangle className="w-3 h-3" /> Different program
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    );
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title="Move to another clan"
      subtitle={name}
      width="lg"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <p className="text-xs text-slate-500 min-w-0 truncate">
            {picked ? <>Sending to <span className="font-medium text-slate-700">{picked.name}</span></> : 'Pick a clan to continue'}
          </p>
          <div className="flex gap-2 shrink-0">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm">Cancel</button>
            <button
              onClick={send}
              disabled={!picked || sending || !!pending}
              className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send request
            </button>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
      ) : (
        <div className="space-y-4">
          {/* Where they are now → where they'd go. Orientation before choice. */}
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Currently in</p>
              <p className="text-sm font-medium text-slate-900 truncate">{data?.currentClan.name}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Moving to</p>
              <p className={`text-sm font-medium truncate ${picked ? 'text-brand-700' : 'text-slate-400'}`}>
                {picked ? picked.name : 'Choose below'}
              </p>
            </div>
          </div>

          {/* The other right answer when no clan obviously fits. */}
          {!pending && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-violet-200 bg-violet-50/50 px-3.5 py-3 dark:border-violet-500/30 dark:bg-violet-500/5">
              <Inbox className="w-5 h-5 text-violet-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">Not sure where {firstName} fits?</p>
                <p className="text-xs text-slate-500">Offer them to the handover pool instead. Other mentors and admins see your note and can claim them.</p>
              </div>
              <button type="button" onClick={() => setPoolOpen(true)}
                className="shrink-0 rounded-lg border border-violet-300 bg-card px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-50">
                Offer to the pool
              </button>
            </div>
          )}

          {pending && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-900">
                {name} already has a move request waiting for a decision. You&apos;ll be able to send a new
                one once that&apos;s answered or withdrawn.
              </p>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a clan, program, or mentor…"
              className="w-full rounded-xl border border-slate-200 bg-card pl-9 pr-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          {clans.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {query ? 'No clan matches that search.' : 'No other clan is taking people right now — the handover pool above is the way to hand them on.'}
            </p>
          ) : (
            <div className="space-y-4">
              {suggested.length > 0 && (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <Sparkles className="w-3.5 h-3.5 text-brand-600" /> Suggested · mentors meeting most weeks
                  </p>
                  {suggested.map(card)}
                </div>
              )}
              {rest.length > 0 && (
                <div className="space-y-2">
                  {suggested.length > 0 && (
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">All clans taking people</p>
                  )}
                  {rest.map(card)}
                </div>
              )}
            </div>
          )}

          {/* Only after a choice — the consequence, then the message. */}
          {picked?.crossProgram && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-900">
                <span className="font-medium">{picked.name}</span> runs a different program. If this is accepted,
                {' '}{name}&apos;s current enrollment and its assigned tasks are cleared and they start fresh on the
                new program&apos;s roadmap.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="transfer-reason" className="block text-sm font-medium text-slate-700 mb-1.5">
              Why this move? <span className="font-normal text-slate-400">Optional, but it&apos;s what they&apos;ll decide on</span>
            </label>
            <textarea
              id="transfer-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={`e.g. ${name.split(' ')[0]} is moving into backend work and would learn more with your team.`}
              className="w-full rounded-xl border border-slate-200 bg-card px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <p className="text-xs text-slate-500">
            Nothing changes yet. {picked?.leadMentor?.name || 'The receiving lead mentor'} (and any co-mentor
            they&apos;ve given this permission) gets a notification and decides — {name} only moves if they accept.
          </p>
        </div>
      )}
    </Drawer>
  );
}

/** Whether the clan's mentors hold the weekly review — the thing worth choosing on. */
function ReviewActivity({ clan: c }: { clan: TransferClanOption }) {
  const weeks = c.reviewWeeks ?? 0;
  if (c.activity === 'none') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
        <CalendarCheck className="w-3 h-3" /> No reviews in 4 weeks
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${c.activity === 'regular' ? 'text-emerald-700' : 'text-amber-700'}`}>
      <CalendarCheck className="w-3 h-3" /> Reviews {weeks} of last 4 weeks
    </span>
  );
}
