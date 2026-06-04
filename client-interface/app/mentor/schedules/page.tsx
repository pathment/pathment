'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarClock, Plus, Trash2, Loader2, Check, X, Clock, User, LayoutGrid, Users, Route, Repeat, Download,
} from 'lucide-react';
import { useMentorSchedule, useScheduleTemplates, useMentorCohort, useMentorRoadmaps, type ScheduleTemplate } from '@/lib/hooks/mentor';
import { meetingsApi } from '@/lib/services/meetings-api';
import { scheduleApi, type ScheduleSlot } from '@/lib/services/schedule-api';

const DURATIONS = [15, 30, 45, 60];
const SLOT_DAYS = ['everyday', 'weekdays', 'weekends'];
const TASK_TYPES = ['reading', 'discussion', 'video', 'quiz', 'assignment', 'project'];
const RECURRENCES = ['daily', 'weekly', 'once'];
const field = 'border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500';

// ───────────────────────── Templates tab ─────────────────────────
interface DraftBlock { label: string; time: string; days: string; bookable: boolean }

function TemplatesTab() {
  const { local, org, loading, refetch } = useScheduleTemplates();
  const { cohort } = useMentorCohort();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [blocks, setBlocks] = useState<DraftBlock[]>([{ label: '', time: '', days: 'weekdays', bookable: false }]);
  const [busy, setBusy] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<ScheduleTemplate | null>(null);

  const setBlock = (i: number, p: Partial<DraftBlock>) => setBlocks((prev) => prev.map((b, idx) => idx === i ? { ...b, ...p } : b));
  const addBlock = () => setBlocks((prev) => [...prev, { label: '', time: '', days: 'weekdays', bookable: false }]);
  const removeBlock = (i: number) => setBlocks((prev) => prev.filter((_, idx) => idx !== i));

  const create = async () => {
    const clean = blocks.filter((b) => b.label.trim());
    if (!name.trim() || clean.length === 0) { toast.error('Name and at least one block'); return; }
    try {
      setBusy('create');
      await scheduleApi.createTemplate({ name: name.trim(), description: desc.trim() || undefined, blocks: clean });
      toast.success('Template created'); setName(''); setDesc(''); setBlocks([{ label: '', time: '', days: 'weekdays', bookable: false }]); setCreating(false); refetch();
    } catch { toast.error('Could not create'); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={() => setCreating((c) => !c)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"><Plus className="w-4 h-4" />New template</button>
      </div>

      {creating && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name (e.g. Org Standard Day)" className={`${field} w-full`} />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" className={`${field} w-full`} />
          <div className="space-y-2">
            <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-700">Blocks (the day's structure)</span><button onClick={addBlock} className="text-indigo-600 text-sm inline-flex items-center gap-1"><Plus className="w-4 h-4" />Add block</button></div>
            {blocks.map((b, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-slate-200">
                <input value={b.label} onChange={(e) => setBlock(i, { label: e.target.value })} placeholder="Label (e.g. Core work)" className={`${field} flex-1 min-w-36`} />
                <input value={b.time} onChange={(e) => setBlock(i, { time: e.target.value })} placeholder="Time" className={`${field} w-28`} />
                <select value={b.days} onChange={(e) => setBlock(i, { days: e.target.value })} className={`${field} capitalize`}>{SLOT_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
                <label className="text-xs text-slate-500 inline-flex items-center gap-1"><input type="checkbox" checked={b.bookable} onChange={(e) => setBlock(i, { bookable: e.target.checked })} className="rounded border-slate-300 text-indigo-600" />bookable</label>
                {blocks.length > 1 && <button onClick={() => removeBlock(i)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
              </div>
            ))}
          </div>
          <div className="flex justify-end"><button onClick={create} disabled={busy === 'create'} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm inline-flex items-center gap-2 disabled:opacity-50">{busy === 'create' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Create</button></div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-indigo-600" /></div> : (
        <>
          <section>
            <h3 className="text-slate-900 font-medium mb-3">My templates</h3>
            {local.length === 0 ? <p className="text-sm text-slate-500">No templates yet.</p> : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {local.map((t) => (
                  <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-slate-900">{t.name}</h4>
                      <button onClick={async () => { setBusy(t.id); try { await scheduleApi.deleteTemplate(t.id); refetch(); } finally { setBusy(null); } }} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{t.blocks.length} block{t.blocks.length === 1 ? '' : 's'}</p>
                    <ol className="mt-2 space-y-0.5">{t.blocks.slice(0, 5).map((b) => <li key={b.id} className="text-xs text-slate-500 truncate">{b.time} · {b.label}</li>)}</ol>
                    <button onClick={() => setAssignFor(t)} className="mt-3 w-full px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 inline-flex items-center justify-center gap-1.5"><Users className="w-4 h-4" />Assign</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {org.length > 0 && (
            <section>
              <h3 className="text-slate-900 font-medium mb-3">From your organization</h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {org.map((t) => (
                  <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                    <h4 className="font-medium text-slate-900">{t.name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{t.blocks.length} blocks</p>
                    <button onClick={async () => { setBusy(t.id); try { await scheduleApi.importTemplate(t.id); toast.success('Imported'); refetch(); } catch { toast.error('Failed'); } finally { setBusy(null); } }} disabled={busy === t.id}
                      className="mt-3 w-full px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:border-indigo-300 inline-flex items-center justify-center gap-1.5">{busy === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Import</button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {assignFor && <AssignModal template={assignFor} cohort={cohort} onClose={() => setAssignFor(null)} />}
    </div>
  );
}

function AssignModal({ template, cohort, onClose }: { template: ScheduleTemplate; cohort: any[]; onClose: () => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const assign = async () => {
    if (!sel.size) { toast.error('Pick at least one mentee'); return; }
    try { setSaving(true); await scheduleApi.assign(template.id, [...sel]); toast.success(`Assigned to ${sel.size}`); onClose(); }
    catch { toast.error('Could not assign'); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-3"><h3 className="font-semibold text-slate-900">Assign "{template.name}"</h3><button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button></div>
        <p className="text-xs text-slate-500 mb-3">Seeds each mentee's day with these blocks as empty slots — fill them in the "Fill schedules" tab.</p>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {cohort.length === 0 ? <p className="text-sm text-slate-500">No mentees.</p> : cohort.map((m) => (
            <label key={m.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"><input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} className="rounded border-slate-300 text-indigo-600" /><span className="text-sm text-slate-700">{m.name}</span></label>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm">Cancel</button><button onClick={assign} disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Assign{sel.size ? ` (${sel.size})` : ''}</button></div>
      </div>
    </div>
  );
}

// ───────────────────────── Fill schedules tab ─────────────────────────
function FillTab() {
  const { cohort } = useMentorCohort();
  const { local } = useMentorRoadmaps();
  const [menteeId, setMenteeId] = useState('');
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (id: string) => {
    if (!id) { setSlots([]); return; }
    setLoading(true);
    try { const r = await scheduleApi.getMenteeSchedule(id); setSlots(r?.data?.schedule?.schedule ?? []); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(menteeId); }, [menteeId]);

  const patchSlot = (slotId: string, p: Partial<ScheduleSlot>) => setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, ...p } : s));

  const save = async (slot: ScheduleSlot) => {
    try {
      setBusy(slot.id);
      const res: any = await scheduleApi.updateSlot(menteeId, slot.id, { kind: slot.kind, roadmapChain: slot.roadmapChain, recurring: slot.recurring });
      const startedId = res?.data?.slot?.chainStarted;
      if (startedId) {
        const rm = local.find((r) => r.id === startedId);
        toast.success(`Slot saved — started "${rm?.name || 'roadmap'}" for this mentee`);
      } else {
        toast.success('Slot saved');
      }
    } catch { toast.error('Could not save'); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-600">Mentee</label>
        <select value={menteeId} onChange={(e) => setMenteeId(e.target.value)} className={field}>
          <option value="">Select a mentee</option>
          {cohort.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {!menteeId ? <p className="text-sm text-slate-500">Pick a mentee to fill their slots.</p>
        : loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
        : slots.length === 0 ? <p className="text-sm text-slate-500">No schedule assigned yet — assign a template first.</p>
        : (
          <div className="space-y-3">
            {slots.map((s) => (
              <div key={s.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div><p className="font-medium text-slate-900">{s.label}</p><p className="text-xs text-slate-500">{s.time} · {s.days}</p></div>
                  <select value={s.kind} onChange={(e) => patchSlot(s.id, { kind: e.target.value as any })} className={field}>
                    <option value="empty">Empty</option><option value="roadmap">Roadmap chain</option><option value="recurring">Recurring</option>
                  </select>
                </div>

                {s.kind === 'roadmap' && (
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
                    <div className="flex items-center gap-2"><Route className="w-4 h-4 text-indigo-500" /><span className="text-xs font-medium text-slate-600">Roadmap chain (in order)</span></div>
                    <div className="flex flex-wrap gap-1.5">
                      {(s.roadmapChain || []).map((rid, i) => {
                        const rm = local.find((r) => r.id === rid);
                        return <span key={rid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs">{i + 1}. {rm?.name || 'Roadmap'}<button onClick={() => patchSlot(s.id, { roadmapChain: s.roadmapChain.filter((x) => x !== rid) })}><X className="w-3 h-3" /></button></span>;
                      })}
                    </div>
                    <select value="" onChange={(e) => { if (e.target.value) patchSlot(s.id, { roadmapChain: [...(s.roadmapChain || []), e.target.value] }); }} className={`${field} w-full`}>
                      <option value="">+ Add roadmap to chain</option>
                      {local.filter((r) => !(s.roadmapChain || []).includes(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                )}

                {s.kind === 'recurring' && (
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
                    <div className="flex items-center gap-2"><Repeat className="w-4 h-4 text-indigo-500" /><span className="text-xs font-medium text-slate-600">Recurring ritual</span></div>
                    <input value={s.recurring?.title || ''} onChange={(e) => patchSlot(s.id, { recurring: { title: e.target.value, type: s.recurring?.type || 'discussion', recurrence: s.recurring?.recurrence || 'daily' } })} placeholder="Title (e.g. Mindset talk)" className={`${field} w-full`} />
                    <div className="flex gap-2">
                      <select value={s.recurring?.type || 'discussion'} onChange={(e) => patchSlot(s.id, { recurring: { title: s.recurring?.title || '', type: e.target.value, recurrence: s.recurring?.recurrence || 'daily' } })} className={`${field} capitalize`}>{TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                      <select value={s.recurring?.recurrence || 'daily'} onChange={(e) => patchSlot(s.id, { recurring: { title: s.recurring?.title || '', type: s.recurring?.type || 'discussion', recurrence: e.target.value } })} className={`${field} capitalize`}>{RECURRENCES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                    </div>
                  </div>
                )}

                <div className="flex justify-end mt-3">
                  <button onClick={() => save(s)} disabled={busy === s.id} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm inline-flex items-center gap-1.5 disabled:opacity-50">{busy === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Save slot</button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// ───────────────────────── Availability tab (existing 1:1) ─────────────────────────
function AvailabilityTab() {
  const { availability, meetings, loading, error, refetch } = useMentorSchedule();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('2:00 PM');
  const [duration, setDuration] = useState(30);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const publish = async () => {
    if (!date) { toast.error('Pick a date'); return; }
    if (!time.trim()) { toast.error('Enter a time'); return; }
    try { setAdding(true); await meetingsApi.publishSlot({ date, time: time.trim(), durationMins: duration }); toast.success('Slot published'); setDate(''); refetch(); }
    catch (e: any) { toast.error(e?.response?.data?.message || 'Could not publish'); } finally { setAdding(false); }
  };
  const removeSlot = async (id: string) => {
    try { setBusyId(id); await meetingsApi.deleteSlot(id); refetch(); } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not remove'); } finally { setBusyId(null); }
  };
  const setStatus = async (id: string, status: 'done' | 'cancelled') => {
    try { setBusyId(id); await meetingsApi.updateStatus(id, status); refetch(); } catch { toast.error('Could not update'); } finally { setBusyId(null); }
  };
  const upcoming = meetings.filter((m) => m.status === 'scheduled');

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-indigo-600" /></div>;
  if (error) return <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center"><p className="text-slate-600 mb-3">{error}</p><button onClick={refetch} className="text-indigo-600 text-sm font-medium">Try again</button></div>;

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h3 className="text-slate-900 font-medium flex items-center gap-2"><CalendarClock className="w-4 h-4 text-indigo-500" />My 1:1 availability</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="block text-xs text-slate-500 mb-1">Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} /></div>
          <div><label className="block text-xs text-slate-500 mb-1">Time</label><input value={time} onChange={(e) => setTime(e.target.value)} className={`${field} w-28`} /></div>
          <div><label className="block text-xs text-slate-500 mb-1">Duration</label><select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={field}>{DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}</select></div>
          <button onClick={publish} disabled={adding} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50">{adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Publish slot</button>
        </div>
        {availability.length === 0 ? <p className="text-sm text-slate-500">No slots published.</p> : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availability.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50">
                <div><p className="text-sm font-medium text-slate-900">{s.day} · {s.time}</p><p className="text-xs text-slate-500">{s.durationMins} min</p></div>
                {s.taken ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs"><User className="w-3 h-3" />{s.bookedBy ? s.bookedBy.firstName : 'Booked'}</span>
                  : <button onClick={() => removeSlot(s.id)} disabled={busyId === s.id} className="text-slate-400 hover:text-red-500">{busyId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}</button>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200">
        <div className="px-6 py-5 border-b border-slate-200"><h3 className="text-slate-900 font-medium">Upcoming 1:1s</h3></div>
        <div className="p-6">
          {upcoming.length === 0 ? <p className="text-sm text-slate-500">No upcoming 1:1s.</p> : (
            <div className="space-y-2">
              {upcoming.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200">
                  <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center shrink-0"><span className="text-indigo-700 text-xs font-medium">{m.mentee?.firstName?.[0]}{m.mentee?.lastName?.[0]}</span></div>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-900">{m.mentee?.firstName} {m.mentee?.lastName}</p><div className="flex items-center gap-2 text-xs text-slate-500"><Clock className="w-3 h-3" />{m.day} · {m.time} · {m.durationMins}m</div>{m.agenda && <p className="text-xs text-slate-500 mt-0.5 truncate">{m.agenda}</p>}</div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => setStatus(m.id, 'done')} disabled={busyId === m.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50"><Check className="w-3.5 h-3.5" />Done</button>
                    <button onClick={() => setStatus(m.id, 'cancelled')} disabled={busyId === m.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:border-red-300 hover:text-red-600 disabled:opacity-50"><X className="w-3.5 h-3.5" />Cancel</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ───────────────────────── Page ─────────────────────────
const TABS = [
  { key: 'templates', label: 'Templates', icon: LayoutGrid },
  { key: 'fill', label: 'Fill schedules', icon: Route },
  { key: 'availability', label: '1:1 Availability', icon: CalendarClock },
] as const;

export default function MentorSchedules() {
  const [tab, setTab] = useState<'templates' | 'fill' | 'availability'>('templates');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-slate-900 mb-2">Schedules</h1>
        <p className="text-slate-600">Shape the day with reusable templates, fill each mentee's slots, and publish your 1:1 times.</p>
      </div>
      <div className="flex flex-wrap items-center gap-0 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${tab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'fill' && <FillTab />}
      {tab === 'availability' && <AvailabilityTab />}
    </div>
  );
}
