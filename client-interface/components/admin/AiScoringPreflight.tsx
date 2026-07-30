'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Sparkles, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { applicationApi } from '@/lib/services/intake-api';
import { assessmentApi } from '@/lib/services/assessment-api';
import { RubricField } from '@/components/admin/RubricField';

interface PlanQuestion { id: string; prompt: string; type: string; points: number; rubric: string | null }
interface PlanAssessment {
  id: string; title: string; aiRubric: string | null;
  applicantCount: number; autoGradedCount: number; questions: PlanQuestion[];
}
export interface ScoringPlan {
  applicants: { selected: number; withSubmission: number; withoutSubmission: number };
  assessments: PlanAssessment[];
}

/**
 * Pre-flight for AI scoring: shows EXACTLY what the AI will grade on before it
 * runs — every open-ended question, its points, and the rubric it's judged
 * against — and lets the admin fix a rubric right there. Edits save back to the
 * assessment (not a one-off), so every applicant in the cohort is scored to the
 * same published standard.
 */
export function AiScoringPreflight({
  cohortId, applicationIds, onClose, onRun,
}: {
  cohortId: string;
  applicationIds: string[];
  onClose: () => void;
  onRun: (opts: { applyScores: boolean; recommendLevels: boolean }) => void;
}) {
  const [plan, setPlan] = useState<ScoringPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Local edits, keyed by question id / `holistic:<assessmentId>`.
  const [edits, setEdits] = useState<Record<string, string>>({});
  // Both on by default — a run that leaves everything as a draft needing a
  // click per applicant isn't usable at cohort scale.
  const [applyScores, setApplyScores] = useState(true);
  const [recommendLevels, setRecommendLevels] = useState(true);

  useEffect(() => {
    let alive = true;
    applicationApi.aiGradePlan(cohortId, applicationIds)
      .then((res: any) => { if (alive) setPlan(res?.data || null); }) // eslint-disable-line @typescript-eslint/no-explicit-any
      .catch(() => toast.error('Could not load the scoring plan'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [cohortId, applicationIds]);

  const qKey = (qid: string) => `q:${qid}`;
  const hKey = (aid: string) => `h:${aid}`;
  const valueOf = (key: string, saved: string | null) => (key in edits ? edits[key] : (saved || ''));
  const setValue = (key: string, v: string) => setEdits((p) => ({ ...p, [key]: v }));
  const dirty = Object.keys(edits).length > 0;

  const missingRubrics = (plan?.assessments || []).flatMap((a) =>
    a.questions.filter((q) => !valueOf(qKey(q.id), q.rubric).trim())
  ).length;

  /** Persist rubric edits to the assessments, then run. */
  const saveThenRun = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      for (const a of plan.assessments) {
        const holisticKey = hKey(a.id);
        const questionEdited = a.questions.some((q) => qKey(q.id) in edits);
        const holisticEdited = holisticKey in edits;
        if (!questionEdited && !holisticEdited) continue;

        if (holisticEdited) {
          await assessmentApi.update(a.id, { aiRubric: edits[holisticKey].trim() || null });
        }
        if (questionEdited) {
          // setQuestions replaces the whole set, so send the assessment's full
          // current questions back with the edited rubrics applied.
          const full = await assessmentApi.get(a.id);
          await assessmentApi.setQuestions(a.id, (full.questions || []).map((q) => ({
            type: q.type,
            prompt: q.prompt,
            required: q.required,
            points: q.points,
            options: q.options,
            correctOptionIds: q.correctOptionIds,
            rubric: qKey(q.id!) in edits ? (edits[qKey(q.id!)].trim() || null) : (q.rubric ?? null),
            config: q.config,
          })));
        }
      }
      if (dirty) toast.success('Rubrics saved');
      onRun({ applyScores, recommendLevels });
    } catch {
      toast.error('Could not save the rubrics — nothing was scored');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-2xl bg-card shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-600" />
            <h3 className="font-semibold text-slate-900">What the AI will score on</h3>
          </div>
          <button onClick={onClose} disabled={saving} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-violet-600" /></div>
        ) : !plan ? (
          <p className="p-6 text-sm text-slate-500">Could not load the plan.</p>
        ) : (
          <>
            <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-4 text-sm">
              <span className="text-slate-900 font-medium">{plan.applicants.withSubmission} will be scored</span>
              {plan.applicants.withoutSubmission > 0 && (
                <span className="text-slate-500">{plan.applicants.withoutSubmission} skipped (no submission yet)</span>
              )}
            </div>

            {missingRubrics > 0 && (
              <div className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {missingRubrics} question{missingRubrics === 1 ? ' has' : 's have'} no rubric — {missingRubrics === 1 ? 'it' : 'they'} will be judged
                  on general relevance and clarity only. Add one below for consistent, defensible scoring.
                </span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {plan.assessments.map((a) => (
                <div key={a.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">{a.title}</p>
                    <span className="text-xs text-slate-500">{a.applicantCount} applicant{a.applicantCount === 1 ? '' : 's'}</span>
                  </div>
                  {a.autoGradedCount > 0 && (
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      + {a.autoGradedCount} multiple-choice question{a.autoGradedCount === 1 ? '' : 's'} already auto-scored (not sent to AI)
                    </p>
                  )}

                  <div className="mt-3">
                    <RubricField
                      label="Overall fit guide — what a strong candidate looks like"
                      value={valueOf(hKey(a.id), a.aiRubric)}
                      onChange={(v) => setValue(hKey(a.id), v)}
                      placeholder="e.g. Strong: shipped a real project and can explain their choices. Weak: vague, no concrete work."
                      rows={2}
                      tone="slate"
                      hint="drives the 0–100 overall score"
                    />
                  </div>

                  <div className="mt-4 space-y-4">
                    {a.questions.length === 0 && (
                      <p className="text-xs text-slate-500">No open-ended questions — nothing for the AI to read here.</p>
                    )}
                    {a.questions.map((q, i) => {
                      const v = valueOf(qKey(q.id), q.rubric);
                      return (
                        <div key={q.id}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs text-slate-700">{i + 1}. {q.prompt}</p>
                            <span className="shrink-0 text-[11px] text-slate-400">{q.points} pts</span>
                          </div>
                          <div className="mt-1">
                            <RubricField
                              value={v}
                              onChange={(nv) => setValue(qKey(q.id), nv)}
                              placeholder="Full marks: … · Partial: … · Zero: …"
                              rows={2}
                            />
                          </div>
                          {!v.trim() && <p className="mt-0.5 text-[11px] text-amber-600">No rubric — judged on general relevance only.</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 pb-1 pt-2 space-y-2 border-t border-slate-100">
              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" checked={applyScores} onChange={(e) => setApplyScores(e.target.checked)} className="mt-0.5" />
                <span><strong>Set the score</strong> from the AI&apos;s marks — you can still change any score afterwards. Untick to only save suggestions.</span>
              </label>
              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" checked={recommendLevels} onChange={(e) => setRecommendLevels(e.target.checked)} className="mt-0.5" />
                <span>
                  <strong>Also check their level</strong> against your criteria, and flag anyone whose level looks wrong.
                  {' '}<span className="text-slate-400">Edit the criteria in Admissions settings → Level criteria.</span>
                </span>
              </label>
            </div>

            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-400">
                Rubric edits are saved to the assessment, so every applicant is scored to the same standard.
              </p>
              <div className="flex gap-2 shrink-0">
                <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700">Cancel</button>
                <button
                  onClick={saveThenRun}
                  disabled={saving || plan.applicants.withSubmission === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {dirty ? 'Save rubrics & run' : `Review ${plan.applicants.withSubmission}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
