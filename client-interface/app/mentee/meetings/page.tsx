'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CalendarRange, MessageSquare, Clock, Loader2, X, Check, CalendarPlus, CalendarX2, MessageSquareText } from 'lucide-react';
import { useMenteeMeetings, type OpenSlot, type MenteeMeeting } from '@/lib/hooks/mentee';
import { meetingsApi } from '@/lib/services/meetings-api';
import { Drawer } from '@/components/shared/Drawer';
import { formatMeeting } from '@/lib/utils/datetime';

const initialsOf = (name: string) =>
  name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

const STATUS_CLASS: Record<string, string> = {
  done: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export default function MenteeMeetings() {
  const { bookable, meetings, loading, error, refetch } = useMenteeMeetings();
  const [booking, setBooking] = useState<OpenSlot | null>(null);
  const [bookingMentor, setBookingMentor] = useState('');
  const [agenda, setAgenda] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancelFor, setCancelFor] = useState<MenteeMeeting | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState<string | null>(null);

  const confirmBook = async () => {
    if (!booking) return;
    try {
      setSaving(true);
      await meetingsApi.book(booking.id, agenda.trim() || undefined);
      toast.success('1:1 booked - see you there!');
      setBooking(null); setAgenda(''); setOpenPicker(null);
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not book that slot');
    } finally { setSaving(false); }
  };

  const confirmCancel = async () => {
    if (!cancelFor) return;
    try {
      setBusyId(cancelFor.id);
      await meetingsApi.updateStatus(cancelFor.id, 'cancelled');
      toast.success('Meeting cancelled');
      setCancelFor(null); refetch();
    } catch { toast.error('Could not cancel'); } finally { setBusyId(null); }
  };

  const upcoming = meetings.filter((m) => m.status === 'scheduled');
  const past = meetings.filter((m) => m.status !== 'scheduled');

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-slate-900 mb-1">My mentor</h1>
        <p className="text-slate-600">Your guide, upcoming 1:1s, and the times they&apos;re free.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3 items-start">
            {/* Mentor card(s) */}
            <div className="lg:col-span-2 space-y-4">
              {bookable.length === 0 ? (
                <div className="bg-card rounded-2xl border border-slate-200 p-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3"><CalendarRange className="w-6 h-6 text-slate-300" /></div>
                  <p className="text-slate-700 font-medium">No mentor assigned yet</p>
                  <p className="text-slate-400 text-sm mt-1">Once you&apos;re placed in a clan, your mentor shows up here.</p>
                </div>
              ) : (
                bookable.map((b) => {
                  const open = openPicker === b.mentor.id;
                  return (
                    <div key={b.mentor.id} className="bg-card rounded-2xl border border-slate-200 p-5">
                      <div className="flex flex-wrap items-start gap-4">
                        <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                          <span className="text-brand-700 text-lg font-semibold">{initialsOf(b.mentor.name)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-lg font-semibold text-slate-900">{b.mentor.name}</p>
                          <p className="text-sm text-slate-500">Your mentor</p>
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Link href="/mentee/messages"
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50">
                              <MessageSquare className="w-4 h-4" />Message
                            </Link>
                            <button onClick={() => setOpenPicker(open ? null : b.mentor.id)} disabled={b.slots.length === 0}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50">
                              <CalendarPlus className="w-4 h-4" />Book a 1:1
                            </button>
                            {b.slots.length > 0 && <span className="text-xs text-slate-400">{b.slots.length} open time{b.slots.length === 1 ? '' : 's'}</span>}
                          </div>

                          {b.slots.length === 0 ? (
                            <p className="mt-3 text-sm text-slate-400 rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-2.5">
                              {b.mentor.name.split(' ')[0]} hasn&apos;t opened any 1:1 times yet - message them to set some up.
                            </p>
                          ) : open && (
                            <div className="mt-4 rounded-xl border border-slate-200 p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Pick a time {b.mentor.name.split(' ')[0]} is free</p>
                              <div className="flex flex-wrap gap-2">
                                {b.slots.map((s) => (
                                  <button key={s.id} onClick={() => { setBooking(s); setBookingMentor(b.mentor.name); setAgenda(''); }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 transition-colors">
                                    <Clock className="w-3.5 h-3.5 text-slate-400" />{formatMeeting(s.startsAt, s.day, s.time)}
                                    <span className="text-slate-400">· {s.durationMins}m</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Upcoming */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 px-1">Upcoming</p>
              {upcoming.length === 0 ? (
                <div className="bg-card rounded-2xl border border-slate-200 p-5">
                  <p className="text-sm text-slate-500">No 1:1s booked yet.</p>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">Pick a time from your mentor&apos;s open slots and it&apos;ll show up here.</p>
                </div>
              ) : (
                upcoming.map((m) => (
                  <div key={m.id} className="bg-card rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start gap-3">
                      <span className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0"><CalendarRange className="w-4 h-4 text-brand-600" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">{formatMeeting(m.startsAt, m.day, m.time)}</p>
                        <p className="text-xs text-slate-500">{m.durationMins} min with {m.mentor?.firstName}</p>
                      </div>
                      <button onClick={() => setCancelFor(m)} disabled={busyId === m.id}
                        title="Cancel" className="p-1.5 -m-1 text-slate-300 hover:text-red-500 shrink-0">
                        {busyId === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                      </button>
                    </div>
                    {m.agenda && (
                      <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600 flex items-start gap-1.5">
                        <MessageSquareText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />{m.agenda}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Past 1:1s */}
          {past.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 px-1 mb-2">Past 1:1s</p>
              <div className="bg-card rounded-2xl border border-slate-200 divide-y divide-slate-100">
                {past.map((m) => {
                  const cancelledByMentor = m.status === 'cancelled' && !!m.cancelledBy && m.cancelledBy === m.mentor?.id;
                  return (
                    <div key={m.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${m.status === 'done' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                            {m.status === 'done' ? <Check className="w-4 h-4 text-emerald-600" /> : <CalendarX2 className="w-4 h-4 text-slate-400" />}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm text-slate-700 truncate">{formatMeeting(m.startsAt, m.day, m.time)}</p>
                            <p className="text-xs text-slate-400">with {m.mentor?.firstName}</p>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs capitalize shrink-0 ${STATUS_CLASS[m.status] || 'bg-slate-100 text-slate-500'}`}>{m.status}</span>
                      </div>
                      {m.status === 'cancelled' && (cancelledByMentor || m.cancellationReason) && (
                        <div className="mt-2 ml-10 rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5 text-xs text-slate-600">
                          {cancelledByMentor && <span className="font-medium text-slate-700">Cancelled by your mentor. </span>}
                          {m.cancellationReason || (cancelledByMentor ? 'No reason given.' : null)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Booking confirm drawer */}
      <Drawer
        open={!!booking}
        onClose={() => setBooking(null)}
        title="Confirm your 1:1"
        subtitle={booking ? `${bookingMentor} · ${formatMeeting(booking.startsAt, booking.day, booking.time)} (${booking.durationMins} min)` : undefined}
        width="sm"
        footer={
          <>
            <button onClick={() => setBooking(null)} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Back</button>
            <button onClick={confirmBook} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Confirm booking
            </button>
          </>
        }
      >
        <label className="block text-sm font-medium text-slate-700 mb-1.5">What would you like to cover? <span className="text-slate-400 font-normal">(optional)</span></label>
        <textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={4}
          placeholder="e.g. I'm stuck on the JWT refresh flow and want to review my approach"
          className="w-full border border-slate-300 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" autoFocus />
        <p className="mt-2 text-xs text-slate-400">Sharing an agenda helps your mentor prepare and makes the most of your time.</p>
      </Drawer>

      {/* Cancel confirm drawer */}
      <Drawer
        open={!!cancelFor}
        onClose={() => setCancelFor(null)}
        title="Cancel this 1:1?"
        subtitle={cancelFor ? `${formatMeeting(cancelFor.startsAt, cancelFor.day, cancelFor.time)} with ${cancelFor.mentor?.firstName ?? 'your mentor'}` : undefined}
        width="sm"
        footer={
          <>
            <button onClick={() => setCancelFor(null)} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Keep it</button>
            <button onClick={confirmCancel} disabled={busyId === cancelFor?.id} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {busyId === cancelFor?.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}Cancel 1:1
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">This frees the slot so you (or another mentee) can book it again. Your mentor will be notified.</p>
      </Drawer>
    </div>
  );
}
