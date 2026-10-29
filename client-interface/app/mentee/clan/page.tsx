'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowRight,
  Check,
  Clock,
  Loader2,
  MessageSquareQuote,
  Repeat,
  ShieldCheck,
  Users2,
  X,
} from 'lucide-react';
import { ClanAvatar } from '@/components/shared/ClanAvatar';
import { Drawer } from '@/components/shared/Drawer';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { useInvalidate, qk } from '@/lib/query';
import { myClanChangeApi } from '@/lib/services/clan-requests-api';
import {
  useMyClanChange,
  type MyClanPlacement,
  type MyClanChangeRequest,
} from '@/lib/hooks/mentee/useMyClanChange';

/**
 * "My clan" — where the mentee sees the clan they are in, and asks to move.
 *
 * The ask is the easy half. The hard half, and the reason this is a page
 * rather than a button hidden in Settings, is the waiting: a mentee who has
 * asked to move has handed a decision about their own weeks to somebody they
 * cannot see, and the single worst version of this feature is one where the
 * request vanishes into an admin queue and the mentee is left guessing whether
 * anybody read it. So the request's state is the loudest thing on the page
 * while it is open, it names what happens next, and it can always be
 * withdrawn. When it is answered the answer stays here with the admin's own
 * words, approved or denied, because "no, and here is why" is a result and a
 * silence is not.
 */

const STATUS: Record<MyClanChangeRequest['status'], { label: string; chip: string; dot: string }> = {
  pending: { label: 'Waiting on your admin', chip: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  approved: { label: 'Approved', chip: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  denied: { label: 'Not approved', chip: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  cancelled: { label: 'Withdrawn', chip: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
};

const dateOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export default function MenteeClanPage() {
  const { clans, reasons, requests, loading, error, refetch } = useMyClanChange();
  const invalidate = useInvalidate();
  const confirm = useConfirm();

  const [asking, setAsking] = useState<MyClanPlacement | null>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [note, setNote] = useState('');
  const [preferred, setPreferred] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  /** The open ask per clan — at most one, which the server enforces. */
  const openFor = useMemo(() => {
    const map: Record<string, MyClanChangeRequest> = {};
    for (const r of requests) {
      if (r.status === 'pending' && r.fromClanId) map[r.fromClanId] = r;
    }
    return map;
  }, [requests]);

  const history = requests.filter((r) => r.status !== 'pending');

  const openAsk = (clan: MyClanPlacement) => {
    setAsking(clan);
    setReasonCode('');
    setNote('');
    setPreferred('');
  };

  const submit = async () => {
    if (!asking) return;
    if (!reasonCode) { toast.error('Choose a reason for the move'); return; }
    if (note.trim().length < 10) { toast.error('Tell your admin a little more about why'); return; }
    try {
      setSaving(true);
      await myClanChangeApi.ask({
        fromClanId: asking.id,
        toClanId: preferred || undefined,
        reasonCode,
        note: note.trim(),
      });
      toast.success('Sent to your program admin');
      setAsking(null);
      await invalidate(qk.me.clanChange);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || 'Could not send your request');
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async (request: MyClanChangeRequest) => {
    const ok = await confirm({
      title: 'Withdraw this request?',
      description: 'Your admin will no longer see it. You can ask again at any time.',
      confirmLabel: 'Withdraw',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      setBusyId(request.id);
      await myClanChangeApi.cancel(request.id);
      toast.success('Request withdrawn');
      await invalidate(qk.me.clanChange);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || 'Could not withdraw');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card rounded-2xl border border-slate-200 py-12 text-center">
        <p className="text-slate-600 mb-3">{error}</p>
        <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-slate-900 mb-2">My clan</h1>
        <p className="text-slate-600">
          The group you learn with, and your mentor. If it is not the right fit, you can ask your
          program admin to move you.
        </p>
      </div>

      {clans.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-12 px-6 text-center">
          <Users2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">You are not in a clan yet</p>
          <p className="text-slate-400 text-sm mt-1 max-w-sm mx-auto">
            Once your admin places you in a clan it will appear here, along with the option to ask
            to be moved.
          </p>
        </div>
      ) : (
        clans.map((clan) => {
          const open = openFor[clan.id];
          return (
            <section key={clan.id} className="bg-card rounded-2xl border border-slate-200 overflow-hidden">
              <div className="p-5 flex items-start gap-4">
                <ClanAvatar name={clan.name} src={clan.avatarUrl} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold text-slate-900">{clan.name}</h2>
                    {clan.paused && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        Paused here
                      </span>
                    )}
                    {clan.standing && (
                      <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                        Standing clan
                      </span>
                    )}
                    {clan.closed && !clan.standing && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        Program closed
                      </span>
                    )}
                  </div>
                  {clan.programName && <p className="text-sm text-slate-500 mt-0.5">{clan.programName}</p>}
                </div>
                {!open && clan.canRequest && (
                  <button
                    onClick={() => openAsk(clan)}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-brand-400 hover:text-brand-700 transition-colors"
                  >
                    <Repeat className="w-3.5 h-3.5" />
                    Ask to move
                  </button>
                )}
              </div>

              {/* The open ask, stated where they cannot miss it: this is the
                  thing they came back to the page to check. */}
              {open && (
                <div className="border-t border-amber-200 bg-amber-50/60 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-amber-500 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-amber-900">
                        Your request is with your program admin
                      </p>
                      <p className="text-xs text-amber-800/90 mt-1">
                        Sent {dateOf(open.at)}.{' '}
                        {open.toClan
                          ? `You asked for ${open.toClan}. Your admin may place you somewhere else if that clan is full.`
                          : 'You left the choice of clan to them.'}
                      </p>
                      <p className="text-xs text-amber-800/90 mt-1">
                        You will get a notification as soon as they decide. Nothing changes for you
                        until then, so keep going as normal.
                      </p>
                      {open.reason && (
                        <p className="text-xs text-amber-900/80 mt-2 italic">&ldquo;{open.reason}&rdquo;</p>
                      )}
                      <button
                        onClick={() => withdraw(open)}
                        disabled={busyId === open.id}
                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-amber-900 hover:underline disabled:opacity-50"
                      >
                        {busyId === open.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                        Withdraw this request
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {clan.standing ? (
                <div className="border-t border-slate-200 bg-slate-50/60 px-5 py-3">
                  <p className="text-xs text-slate-500">
                    This is the group that carried on after{' '}
                    {clan.programName || 'your program'} finished, so there is no second clan to
                    move to. If you want to leave it, speak to your admin.
                  </p>
                </div>
              ) : clan.closed ? (
                <div className="border-t border-slate-200 bg-slate-50/60 px-5 py-3">
                  <p className="text-xs text-slate-500">
                    This program has finished, so its clans are kept as a record and nobody moves
                    in or out of them. Your work and certificates stay exactly as they are.
                  </p>
                </div>
              ) : null}

              {/* Who else they could be with. Shown even with a request open:
                  it is the context for the one they already sent. */}
              {clan.options.length > 0 && clan.canRequest && (
                <div className="border-t border-slate-200 px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
                    Other clans in {clan.programName || 'this program'}
                  </p>
                  <ul className="space-y-2">
                    {clan.options.map((option) => (
                      <li key={option.id} className="flex items-center gap-3">
                        <ClanAvatar name={option.name} src={option.avatarUrl} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 truncate">{option.name}</p>
                          <p className="text-xs text-slate-500">
                            {option.mentor ? `Mentored by ${option.mentor}` : 'Mentor not assigned'}
                            {' · '}
                            {option.mentees} {option.mentees === 1 ? 'mentee' : 'mentees'}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        })
      )}

      {/* Answered requests. Kept on the page rather than cleared, so a mentee
          who was told no can see the reason again instead of re-asking. */}
      {history.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Earlier requests
          </h2>
          {history.map((r) => {
            const s = STATUS[r.status];
            return (
              <div key={r.id} className="bg-card rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${s.dot}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.chip}`}>
                        {r.status === 'approved' ? <Check className="w-3 h-3 mr-1" /> : null}
                        {s.label}
                      </span>
                      <span className="text-xs text-slate-400">{dateOf(r.resolvedAt || r.at)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-slate-700 mt-1.5 flex-wrap">
                      <span>{r.fromClan || 'Your clan'}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-medium">
                        {r.toClan || (r.status === 'approved' ? 'a new clan' : 'not decided')}
                      </span>
                    </div>
                    {r.reason && <p className="text-xs text-slate-500 mt-1.5 italic">&ldquo;{r.reason}&rdquo;</p>}
                    {r.resolutionNote && (
                      <div className="mt-2 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2">
                        <MessageSquareQuote className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-slate-600">
                          {r.resolutionNote}
                          {r.resolvedBy && <span className="text-slate-400"> — {r.resolvedBy}</span>}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <Drawer
        open={asking !== null}
        onClose={() => setAsking(null)}
        title="Ask to change clan"
        subtitle={asking ? `You are in ${asking.name}` : undefined}
        footer={(dismiss) => (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={dismiss}
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Send request
            </button>
          </div>
        )}
      >
        <div className="space-y-5">
          <div className="flex items-start gap-2.5 rounded-lg bg-brand-50 px-3 py-2.5">
            <ShieldCheck className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
            <p className="text-xs text-brand-900/80">
              This goes to your program admin, not to your mentor. You stay in {asking?.name} and
              carry on as normal until they decide, and your work moves with you if they approve.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Why do you want to move?
            </label>
            <div className="space-y-1.5">
              {reasons.map((r) => (
                <label
                  key={r.code}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                    reasonCode === r.code
                      ? 'border-brand-400 bg-brand-50/60'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.code}
                    checked={reasonCode === r.code}
                    onChange={() => setReasonCode(r.code)}
                    className="accent-brand-600"
                  />
                  <span className="text-sm text-slate-700">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="clan-change-note" className="block text-sm font-medium text-slate-700 mb-1.5">
              Tell them a bit more
            </label>
            <textarea
              id="clan-change-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="A sentence or two is plenty. What is not working, and what would help?"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Your admin reads this to decide, so the detail helps. {note.trim().length}/2000
            </p>
          </div>

          {/* A preference, and labelled as one. Offering a clan picker that
              looks like a choice and then landing them elsewhere is how this
              feature would lose their trust the first time a clan is full. */}
          {asking && asking.options.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Is there a clan you would prefer? <span className="font-normal text-slate-400">Optional</span>
              </label>
              <div className="space-y-1.5">
                <label
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                    preferred === '' ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="preferred"
                    checked={preferred === ''}
                    onChange={() => setPreferred('')}
                    className="accent-brand-600"
                  />
                  <span className="text-sm text-slate-700">Let my admin choose</span>
                </label>
                {asking.options.map((option) => (
                  <label
                    key={option.id}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                      preferred === option.id
                        ? 'border-brand-400 bg-brand-50/60'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="preferred"
                      checked={preferred === option.id}
                      onChange={() => setPreferred(option.id)}
                      className="accent-brand-600"
                    />
                    <ClanAvatar name={option.name} src={option.avatarUrl} size="xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-slate-700 truncate">{option.name}</span>
                      <span className="block text-[11px] text-slate-400">
                        {option.mentor || 'Mentor not assigned'} · {option.mentees}{' '}
                        {option.mentees === 1 ? 'mentee' : 'mentees'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 flex items-start gap-1">
                <Clock className="w-3 h-3 mt-0.5 shrink-0" />
                A preference, not a booking. Your admin may place you in a different clan and will
                say why.
              </p>
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}
