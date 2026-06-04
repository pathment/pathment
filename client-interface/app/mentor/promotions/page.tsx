'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { TrendingUp, Plus, Loader2, ArrowRight, Crown, Check } from 'lucide-react';
import { useMentorPromotions, useMentorCohort, type PromotionCandidate, type PromotionStage } from '@/lib/hooks/mentor';
import { Drawer } from '@/components/shared/Drawer';
import { useAuth } from '@/lib/context/AuthContext';
import { mentorApi } from '@/lib/services/mentor-api';

const STAGES: { key: PromotionStage; label: string }[] = [
  { key: 'nominated', label: 'Nominated' },
  { key: 'interview', label: 'Interview' },
  { key: 'approved', label: 'Approved' },
  { key: 'promoted', label: 'Promoted' },
];

const NEXT_STAGE: Record<PromotionStage, PromotionStage | null> = {
  nominated: 'interview', interview: 'approved', approved: 'promoted', promoted: null,
};

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs font-semibold text-slate-700 tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// Interview modal
function InterviewModal({ candidate, onClose, onSaved }: { candidate: PromotionCandidate; onClose: () => void; onSaved: () => void }) {
  const [motivation, setMotivation] = useState(candidate.motivation ?? '');
  const [strengths, setStrengths] = useState(candidate.strengths ?? '');
  const [availability, setAvailability] = useState(candidate.availability ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (advance: boolean) => {
    try {
      setSaving(true);
      await mentorApi.advancePromotion(candidate.id, {
        motivation, strengths, availability,
        ...(advance ? { stage: 'approved' } : {}),
      });
      toast.success(advance ? 'Marked approved' : 'Saved');
      onSaved(); onClose();
    } catch { toast.error('Could not save'); }
    finally { setSaving(false); }
  };

  const field = 'w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Interview · ${candidate.name}`}
      subtitle="Capture the promotion interview and decide."
      footer={
        <>
          <button onClick={() => save(false)} disabled={saving} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50 disabled:opacity-50">Save</button>
          <button onClick={() => save(true)} disabled={saving} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Approve
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Motivation</label>
          <textarea value={motivation} onChange={(e) => setMotivation(e.target.value)} rows={2} className={`${field} resize-none`} autoFocus />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Strengths</label>
          <textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={2} className={`${field} resize-none`} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Availability</label>
          <input value={availability} onChange={(e) => setAvailability(e.target.value)} placeholder="e.g. 5h / week" className={field} />
        </div>
      </div>
    </Drawer>
  );
}

export default function MentorPromotions() {
  const { candidates, loading, error, refetch } = useMentorPromotions();
  const { cohort } = useMentorCohort();
  const { availableRoles } = useAuth();
  const isAdmin = availableRoles.includes('admin');

  const [nominating, setNominating] = useState(false);
  const [pickMentee, setPickMentee] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [interviewing, setInterviewing] = useState<PromotionCandidate | null>(null);

  const nomineeIds = useMemo(() => new Set(candidates.map((c) => c.menteeId)), [candidates]);
  const eligible = cohort.filter((m) => !nomineeIds.has(m.id));

  const nominate = async () => {
    if (!pickMentee) { toast.error('Pick a mentee'); return; }
    try {
      setBusy('nominate');
      await mentorApi.nominate(pickMentee);
      toast.success('Nominated');
      setNominating(false); setPickMentee('');
      refetch();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not nominate'); }
    finally { setBusy(null); }
  };

  const advance = async (c: PromotionCandidate) => {
    const next = NEXT_STAGE[c.stage];
    if (!next) return;
    if (c.stage === 'nominated') { setInterviewing(c); return; }
    if (next === 'promoted') {
      if (!isAdmin) { toast.error('Only an admin can finalise a promotion'); return; }
      try { setBusy(c.id); await mentorApi.promote(c.id); toast.success(`${c.name.split(' ')[0]} promoted to co-mentor`); refetch(); }
      catch (e: any) { toast.error(e?.response?.data?.message || 'Could not promote'); }
      finally { setBusy(null); }
      return;
    }
    try { setBusy(c.id); await mentorApi.advancePromotion(c.id, { stage: next }); refetch(); }
    catch { toast.error('Could not update'); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">Promotions</h1>
          <p className="text-slate-600">Nominate strong mentees to become co-mentors. Final promotion is approved by an admin.</p>
        </div>
        <button onClick={() => setNominating(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 shrink-0">
          <Plus className="w-4 h-4" />Nominate
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={refetch} className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">Try again</button>
        </div>
      ) : candidates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <TrendingUp className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No candidates yet — nominate a mentee who&apos;s ready to give back.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {candidates.map((c) => {
            const stageLabel = STAGES.find((s) => s.key === c.stage)?.label ?? c.stage;
            const next = NEXT_STAGE[c.stage];
            const ctaLabel = c.stage === 'nominated' ? 'Interview' : c.stage === 'interview' ? 'Mark approved' : c.stage === 'approved' ? 'Promote' : null;
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-indigo-700 text-xs font-medium">{c.avatar}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900 truncate">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.level || c.program || ''}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.stage === 'promoted' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{stageLabel}</span>
                </div>

                <div className="flex gap-3 mt-4">
                  <Bar label="Readiness" value={c.readiness} />
                  <Bar label="Willingness" value={c.willingness} />
                </div>
                <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                  <span>{c.absoluteProgress}% progress</span><span>·</span><span>{c.onTimeRate}% on-time</span>
                </div>

                {c.stage !== 'promoted' && ctaLabel && (
                  <button onClick={() => advance(c)} disabled={busy === c.id || (c.stage === 'approved' && !isAdmin)}
                    className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50">
                    {busy === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : c.stage === 'approved' ? <Crown className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                    {c.stage === 'approved' && !isAdmin ? 'Awaiting admin' : ctaLabel}
                  </button>
                )}
                {c.stage === 'promoted' && (
                  <div className="mt-4 inline-flex items-center gap-1.5 text-sm text-emerald-700"><Crown className="w-4 h-4" />Now a co-mentor</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Nominate drawer */}
      <Drawer
        open={nominating}
        onClose={() => setNominating(false)}
        title="Nominate a mentee"
        subtitle="Put a mentee forward for promotion review."
        width="sm"
        footer={
          <>
            <button onClick={() => setNominating(false)} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
            <button onClick={nominate} disabled={busy === 'nominate' || !pickMentee} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {busy === 'nominate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Nominate
            </button>
          </>
        }
      >
        {eligible.length === 0 ? (
          <p className="text-sm text-slate-500">Everyone in your cohort is already nominated.</p>
        ) : (
          <>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mentee</label>
            <select value={pickMentee} onChange={(e) => setPickMentee(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Select a mentee</option>
              {eligible.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </>
        )}
      </Drawer>

      {interviewing && <InterviewModal candidate={interviewing} onClose={() => setInterviewing(null)} onSaved={refetch} />}
    </div>
  );
}
