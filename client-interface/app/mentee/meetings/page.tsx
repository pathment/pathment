'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Clock, Loader2, X, User, Check } from 'lucide-react';
import { useMenteeMeetings, type OpenSlot } from '@/lib/hooks/mentee';
import { meetingsApi } from '@/lib/services/meetings-api';
import { Drawer } from '@/components/shared/Drawer';

const STATUS_CLASS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export default function MenteeMeetings() {
  const { bookable, meetings, loading, error, refetch } = useMenteeMeetings();
  const [booking, setBooking] = useState<OpenSlot | null>(null);
  const [agenda, setAgenda] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const confirmBook = async () => {
    if (!booking) return;
    try {
      setSaving(true);
      await meetingsApi.book(booking.id, agenda.trim() || undefined);
      toast.success('1:1 booked');
      setBooking(null);
      setAgenda('');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not book that slot');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (id: string) => {
    try {
      setBusyId(id);
      await meetingsApi.updateStatus(id, 'cancelled');
      toast.success('Meeting cancelled');
      refetch();
    } catch {
      toast.error('Could not cancel');
    } finally {
      setBusyId(null);
    }
  };

  const upcoming = meetings.filter((m) => m.status === 'scheduled');
  const past = meetings.filter((m) => m.status !== 'scheduled');

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-slate-900 mb-2">My mentor</h1>
        <p className="text-slate-600">Book a 1:1 from your mentor&apos;s open times — pick a slot and you&apos;re set.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">Try again</button>
        </div>
      ) : (
        <>
          {/* Your mentor(s) + book a 1:1 */}
          <section className="bg-white rounded-2xl border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-indigo-500" />
              <h2 className="text-slate-900">Your mentor</h2>
            </div>
            <div className="p-6 space-y-5">
              {bookable.length === 0 ? (
                <p className="text-sm text-slate-500">No mentor assigned yet — once you&apos;re placed in a clan, your mentor shows up here.</p>
              ) : (
                bookable.map((b) => (
                  <div key={b.mentor.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-slate-900">{b.mentor.name}</h3>
                        <p className="text-xs text-slate-400">Your mentor</p>
                      </div>
                    </div>
                    {b.slots.length === 0 ? (
                      <p className="text-sm text-slate-400">No open 1:1 slots right now — message your mentor to set some up.</p>
                    ) : (
                      <>
                        <p className="text-xs font-medium text-slate-500 mb-2">Book a 1:1</p>
                        <div className="flex flex-wrap gap-2">
                          {b.slots.map((s) => (
                            <button key={s.id} onClick={() => { setBooking(s); setAgenda(''); }}
                              className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
                              {s.day} · {s.time} <span className="text-slate-400">({s.durationMins}m)</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          {/* My 1:1s */}
          <section className="bg-white rounded-2xl border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-200"><h2 className="text-slate-900">My 1:1s</h2></div>
            <div className="p-6">
              {upcoming.length === 0 ? (
                <p className="text-sm text-slate-500">No upcoming 1:1s.</p>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          With {m.mentor?.firstName} {m.mentor?.lastName}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Clock className="w-3 h-3" /><span>{m.day} · {m.time} · {m.durationMins}m</span>
                        </div>
                        {m.agenda && <p className="text-xs text-slate-500 mt-0.5">{m.agenda}</p>}
                      </div>
                      <button onClick={() => cancel(m.id)} disabled={busyId === m.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:border-red-300 hover:text-red-600 disabled:opacity-50 shrink-0">
                        {busyId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}Cancel
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {past.length > 0 && (
                <div className="mt-5 pt-5 border-t border-slate-100 space-y-1">
                  <h3 className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Past</h3>
                  {past.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-3 text-sm text-slate-500 px-1">
                      <span>{m.day} {m.time} · {m.mentor?.firstName}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_CLASS[m.status]}`}>{m.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Booking confirm drawer */}
      <Drawer
        open={!!booking}
        onClose={() => setBooking(null)}
        title="Book this 1:1?"
        subtitle={booking ? `${booking.day} · ${booking.time} · ${booking.durationMins} min` : undefined}
        width="sm"
        footer={
          <>
            <button onClick={() => setBooking(null)} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
            <button onClick={confirmBook} disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Confirm booking
            </button>
          </>
        }
      >
        <label className="block text-sm font-medium text-slate-700 mb-1">Anything to discuss? <span className="text-slate-400 font-normal">(optional)</span></label>
        <textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={3}
          placeholder="e.g. I'm stuck on the JWT refresh flow"
          className="w-full border border-slate-300 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" autoFocus />
      </Drawer>
    </div>
  );
}
