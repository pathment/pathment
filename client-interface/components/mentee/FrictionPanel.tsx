'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Flag, Clock, CalendarPlus, Loader2, Check } from 'lucide-react';
import { frictionApi } from '@/lib/services/friction-api';
import { submissionService } from '@/lib/services/submissionService';

type Panel = 'blocker' | 'delay' | 'extension' | null;

const BLOCKER_CATEGORIES = ['technical', 'knowledge', 'access', 'personal'];
const SEVERITIES = ['low', 'medium', 'high'];
const FRICTION_KINDS = ['job', 'domestic', 'electricity', 'hardware', 'health', 'connectivity', 'other'];

/**
 * MenteeFrictionPanel — lets a mentee log what's getting in the way, framed so
 * it clearly HELPS them (it feeds the fairness read; accepted external delays
 * count in their favour). Three actions: log a blocker, log a delay, ask for
 * more time.
 */
export function FrictionPanel({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState<Panel>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<Panel>(null);

  // blocker
  const [bTitle, setBTitle] = useState('');
  const [bCat, setBCat] = useState('technical');
  const [bSev, setBSev] = useState('medium');
  // delay
  const [dReason, setDReason] = useState('');
  const [dKind, setDKind] = useState('job');
  const [dDays, setDDays] = useState(1);
  // extension
  const [eReason, setEReason] = useState('');
  const [eDays, setEDays] = useState(3);

  const toggle = (p: Panel) => { setOpen((cur) => (cur === p ? null : p)); setDone(null); };

  const logBlocker = async () => {
    if (!bTitle.trim()) { toast.error('Describe the blocker'); return; }
    try {
      setSaving(true);
      await frictionApi.createBlocker({ assignedTaskId: taskId, title: bTitle.trim(), category: bCat, severity: bSev });
      toast.success('Blocker logged — your mentor can see it now');
      setBTitle(''); setDone('blocker'); setOpen(null);
    } catch { toast.error('Could not log the blocker'); }
    finally { setSaving(false); }
  };

  const logDelay = async () => {
    if (!dReason.trim()) { toast.error('Add a short reason'); return; }
    try {
      setSaving(true);
      await frictionApi.createDelay({ assignedTaskId: taskId, reason: dReason.trim(), kind: dKind, days: dDays });
      toast.success('Logged — this helps measure your progress fairly');
      setDReason(''); setDone('delay'); setOpen(null);
    } catch { toast.error('Could not log the delay'); }
    finally { setSaving(false); }
  };

  const requestExtension = async () => {
    if (!eReason.trim()) { toast.error('Add a short reason'); return; }
    try {
      setSaving(true);
      await submissionService.requestExtension(taskId, { reason: eReason.trim(), days: eDays });
      toast.success('Extension requested');
      setEReason(''); setDone('extension'); setOpen(null);
    } catch { toast.error('Could not request an extension'); }
    finally { setSaving(false); }
  };

  const Pill = ({ p, icon: Icon, label }: { p: Panel; icon: typeof Flag; label: string }) => (
    <button
      onClick={() => toggle(p)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
        open === p ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-700 hover:border-brand-300'
      }`}
    >
      <Icon className="w-4 h-4" />{label}
      {done === p && <Check className="w-3.5 h-3.5 text-emerald-600" />}
    </button>
  );

  const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900">What&apos;s getting in the way?</h2>
      <p className="text-sm text-slate-500 mt-1">
        Logging this helps your mentor support you — and real constraints count in your favour, not against you.
      </p>

      <div className="flex flex-wrap gap-2 mt-4">
        <Pill p="blocker" icon={Flag} label="Log a blocker" />
        <Pill p="delay" icon={Clock} label="Log a delay" />
        <Pill p="extension" icon={CalendarPlus} label="Request more time" />
      </div>

      {open === 'blocker' && (
        <div className="mt-4 rounded-xl border border-slate-200 p-4 space-y-3">
          <input value={bTitle} onChange={(e) => setBTitle(e.target.value)} placeholder="What's blocking you?" className={field} />
          <div className="flex gap-2">
            <select value={bCat} onChange={(e) => setBCat(e.target.value)} className={`${field} capitalize`}>
              {BLOCKER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={bSev} onChange={(e) => setBSev(e.target.value)} className={`${field} capitalize`}>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex justify-end">
            <button onClick={logBlocker} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Log blocker
            </button>
          </div>
        </div>
      )}

      {open === 'delay' && (
        <div className="mt-4 rounded-xl border border-slate-200 p-4 space-y-3">
          <input value={dReason} onChange={(e) => setDReason(e.target.value)} placeholder="e.g. Full-time job release week" className={field} />
          <div className="flex gap-2">
            <select value={dKind} onChange={(e) => setDKind(e.target.value)} className={`${field} capitalize`}>
              {FRICTION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input type="number" min={0} value={dDays} onChange={(e) => setDDays(Number(e.target.value))} className={`${field} w-24`} placeholder="days" />
          </div>
          <div className="flex justify-end">
            <button onClick={logDelay} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Log delay
            </button>
          </div>
        </div>
      )}

      {open === 'extension' && (
        <div className="mt-4 rounded-xl border border-slate-200 p-4 space-y-3">
          <input value={eReason} onChange={(e) => setEReason(e.target.value)} placeholder="Why do you need more time?" className={field} />
          <div className="flex items-center gap-2">
            <input type="number" min={1} value={eDays} onChange={(e) => setEDays(Number(e.target.value))} className={`${field} w-24`} />
            <span className="text-sm text-slate-500">extra days</span>
          </div>
          <div className="flex justify-end">
            <button onClick={requestExtension} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Request extension
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
