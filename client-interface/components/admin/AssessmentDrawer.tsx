'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { assessmentApi, type Assessment, type AssessmentQuestionType } from '@/lib/services/assessment-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { Drawer } from '@/components/shared/Drawer';
import { useConfirm } from '@/lib/context/ConfirmContext';

interface Option { id: string; label: string }
interface QuestionDraft {
  id: string;
  type: AssessmentQuestionType;
  prompt: string;
  required: boolean;
  points: number;
  options: Option[];
  correctOptionIds: string[];
  config: Record<string, unknown>;
}

const TYPE_LABELS: Record<AssessmentQuestionType, string> = {
  mcq: 'Multiple choice (one answer)',
  multi_select: 'Multiple choice (many answers)',
  short_text: 'Short text',
  long_text: 'Long text',
  file_upload: 'File upload',
  external_link: 'External link',
};
const AUTO_GRADED: AssessmentQuestionType[] = ['mcq', 'multi_select'];

const newId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `id_${Math.random().toString(36).slice(2)}`;

/**
 * AssessmentDrawer — create OR edit an assessment (meta + question builder) in a
 * side drawer, so you never have to leave the page you're on (Intake, the
 * Assessments list, …). Pass `assessmentId` to edit; omit it to create. On save
 * it creates-if-needed → saves questions → applies meta/status (questions first
 * so a publish isn't rejected for being empty), then calls `onSaved` with the
 * fresh assessment.
 */
export function AssessmentDrawer({
  open, assessmentId, onClose, onSaved, onDeleted,
}: {
  open: boolean;
  assessmentId?: string | null;
  onClose: () => void;
  onSaved?: (a: Assessment) => void;
  onDeleted?: (id: string) => void;
}) {
  const editing = Boolean(assessmentId);
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState({ title: '', description: '', instructions: '', status: 'draft', passingScore: '' as string | number, timeLimitMins: '' as string | number });
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);

  const reset = useCallback(() => {
    setMeta({ title: '', description: '', instructions: '', status: 'draft', passingScore: '', timeLimitMins: '' });
    setQuestions([]);
  }, []);

  // Load when editing; reset to blank when creating. Runs each time it opens.
  useEffect(() => {
    if (!open) return;
    if (!assessmentId) { reset(); return; }
    setLoading(true);
    assessmentApi.get(assessmentId)
      .then((a) => {
        setMeta({
          title: a.title || '', description: a.description || '', instructions: a.instructions || '',
          status: a.status || 'draft', passingScore: a.passingScore ?? '', timeLimitMins: a.timeLimitMins ?? '',
        });
        setQuestions((a.questions || []).map((q) => ({
          id: q.id || newId(), type: q.type, prompt: q.prompt, required: q.required !== false,
          points: q.points || 0, options: (q.options || []).map((o) => ({ id: o.id || newId(), label: o.label })),
          correctOptionIds: q.correctOptionIds || [], config: q.config || {},
        })));
      })
      .catch(() => toast.error('Could not load this assessment'))
      .finally(() => setLoading(false));
  }, [open, assessmentId, reset]);

  const addQuestion = (type: AssessmentQuestionType) => {
    const base: QuestionDraft = { id: newId(), type, prompt: '', required: true, points: AUTO_GRADED.includes(type) ? 10 : 0, options: [], correctOptionIds: [], config: {} };
    if (AUTO_GRADED.includes(type)) base.options = [{ id: newId(), label: '' }, { id: newId(), label: '' }];
    setQuestions((prev) => [...prev, base]);
  };
  const patchQuestion = (qid: string, patch: Partial<QuestionDraft>) =>
    setQuestions((prev) => prev.map((q) => (q.id === qid ? { ...q, ...patch } : q)));
  const removeQuestion = (qid: string) => setQuestions((prev) => prev.filter((q) => q.id !== qid));
  const move = (idx: number, dir: -1 | 1) => setQuestions((prev) => {
    const next = [...prev]; const j = idx + dir;
    if (j < 0 || j >= next.length) return prev;
    [next[idx], next[j]] = [next[j], next[idx]]; return next;
  });

  const validate = (): boolean => {
    if (!meta.title.trim()) { toast.error('Title is required'); return false; }
    if (meta.status === 'published' && questions.length === 0) { toast.error('Add at least one question before publishing'); return false; }
    if (meta.passingScore !== '' && (!Number.isFinite(Number(meta.passingScore)) || Number(meta.passingScore) < 0)) { toast.error('Passing score must be a number ≥ 0'); return false; }
    if (meta.timeLimitMins !== '' && (!Number.isInteger(Number(meta.timeLimitMins)) || Number(meta.timeLimitMins) < 1)) { toast.error('Time limit must be a whole number of minutes ≥ 1'); return false; }
    for (const q of questions) {
      if (!q.prompt.trim()) { toast.error('Every question needs a prompt'); return false; }
      if (!Number.isFinite(Number(q.points)) || Number(q.points) < 0) { toast.error('Question points must be a number ≥ 0'); return false; }
      if (AUTO_GRADED.includes(q.type)) {
        if (q.options.filter((o) => o.label.trim()).length < 2) { toast.error('Choice questions need at least 2 options'); return false; }
        if (q.correctOptionIds.length === 0) { toast.error('Mark the correct answer for each choice question'); return false; }
      }
    }
    return true;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      let targetId = assessmentId || null;
      const metaPayload = {
        title: meta.title.trim(),
        description: meta.description.trim() || undefined,
        instructions: meta.instructions.trim() || undefined,
        passingScore: meta.passingScore === '' ? null : Number(meta.passingScore),
        timeLimitMins: meta.timeLimitMins === '' ? null : Number(meta.timeLimitMins),
      };
      if (!targetId) {
        const created = await assessmentApi.create(metaPayload); // server forces draft
        targetId = created.id;
      }
      // Questions first, so flipping status to 'published' isn't rejected as empty.
      await assessmentApi.setQuestions(targetId, questions.map((q) => ({
        type: q.type, prompt: q.prompt.trim(), required: q.required, points: q.points,
        options: AUTO_GRADED.includes(q.type) ? q.options.filter((o) => o.label.trim()) : [],
        correctOptionIds: q.correctOptionIds, config: q.config,
      })));
      const saved = await assessmentApi.update(targetId, { ...metaPayload, status: meta.status as Assessment['status'] });
      toast.success(editing ? 'Assessment saved' : 'Assessment created');
      onSaved?.(saved);
      onClose();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!assessmentId) return;
    if (!(await confirm({ title: 'Delete this assessment?', description: 'This cannot be undone.', variant: 'danger', confirmLabel: 'Delete' }))) return;
    try {
      await assessmentApi.remove(assessmentId);
      toast.success('Assessment deleted');
      onDeleted?.(assessmentId);
      onClose();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not delete'));
    }
  };

  const totalPoints = questions.reduce((s, q) => s + (q.points || 0), 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={editing ? 'Edit assessment' : 'New assessment'}
      subtitle={editing ? 'Changes apply wherever this assessment is used.' : 'Build it here — no need to leave this page.'}
      footer={
        <>
          {editing && <button onClick={remove} className="px-3 py-2 rounded-xl border border-slate-200 text-rose-600 text-sm hover:bg-rose-50">Delete</button>}
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving || loading} className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{editing ? 'Save' : 'Create'}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>
      ) : (
        <div className="space-y-5">
          {/* Meta */}
          <div className="space-y-3">
            <input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} placeholder="Assessment title" className="w-full text-base font-semibold border-0 border-b border-slate-200 focus:border-brand-500 focus:outline-none bg-transparent pb-2 text-slate-900 dark:text-slate-700" />
            <textarea rows={2} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} placeholder="Short description (shown to applicants)" className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card" />
            <textarea rows={2} value={meta.instructions} onChange={(e) => setMeta({ ...meta, instructions: e.target.value })} placeholder="Instructions (e.g. how it's graded, time expectations)" className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card" />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
                <select value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value })} className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Pass score</label>
                <input type="number" min={0} value={meta.passingScore} onChange={(e) => setMeta({ ...meta, passingScore: e.target.value.replace(/^0+(?=\d)/, '') })} placeholder="-" className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Time (min)</label>
                <input type="number" min={1} value={meta.timeLimitMins} onChange={(e) => setMeta({ ...meta, timeLimitMins: e.target.value.replace(/^0+(?=\d)/, '') })} placeholder="-" className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>
            <p className="text-xs text-slate-400">{questions.length} question{questions.length === 1 ? '' : 's'} · {totalPoints} auto-graded points</p>
          </div>

          {/* Questions */}
          <div className="space-y-3">
            {questions.map((q, idx) => (
              <QuestionCard key={q.id} q={q} idx={idx} isFirst={idx === 0} isLast={idx === questions.length - 1}
                onPatch={(patch) => patchQuestion(q.id, patch)} onRemove={() => removeQuestion(q.id)} onMove={(dir) => move(idx, dir)} newId={newId} />
            ))}
          </div>

          {/* Add question */}
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-700 mb-2 inline-flex items-center gap-1"><Plus className="w-4 h-4" /> Add a question</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TYPE_LABELS) as AssessmentQuestionType[]).map((t) => (
                <button key={t} onClick={() => addQuestion(t)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-700 hover:border-brand-300 hover:bg-brand-50/40">{TYPE_LABELS[t]}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function QuestionCard({
  q, idx, isFirst, isLast, onPatch, onRemove, onMove, newId,
}: {
  q: QuestionDraft; idx: number; isFirst: boolean; isLast: boolean;
  onPatch: (patch: Partial<QuestionDraft>) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void; newId: () => string;
}) {
  const isChoice = q.type === 'mcq' || q.type === 'multi_select';
  const setOptionLabel = (oid: string, label: string) => onPatch({ options: q.options.map((o) => (o.id === oid ? { ...o, label } : o)) });
  const addOption = () => onPatch({ options: [...q.options, { id: newId(), label: '' }] });
  const removeOption = (oid: string) => onPatch({ options: q.options.filter((o) => o.id !== oid), correctOptionIds: q.correctOptionIds.filter((c) => c !== oid) });
  const toggleCorrect = (oid: string) => {
    if (q.type === 'mcq') onPatch({ correctOptionIds: [oid] });
    else onPatch({ correctOptionIds: q.correctOptionIds.includes(oid) ? q.correctOptionIds.filter((c) => c !== oid) : [...q.correctOptionIds, oid] });
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-start gap-2">
        <div className="pt-1 text-slate-300"><GripVertical className="w-4 h-4" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-brand-700 bg-brand-50 dark:bg-brand-500/15 rounded-full px-2.5 py-1">{TYPE_LABELS[q.type]}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => onMove(-1)} disabled={isFirst} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
              <button onClick={() => onMove(1)} disabled={isLast} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
              <button onClick={onRemove} className="p-1.5 rounded-md hover:bg-rose-50 text-rose-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
          <textarea rows={2} value={q.prompt} onChange={(e) => onPatch({ prompt: e.target.value })} placeholder={`Question ${idx + 1} prompt`} className="mt-3 w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card" />
          {isChoice && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-500">Options - mark the correct one{q.type === 'multi_select' ? '(s)' : ''}.</p>
              {q.options.map((o) => (
                <div key={o.id} className="flex items-center gap-2">
                  <input type={q.type === 'mcq' ? 'radio' : 'checkbox'} checked={q.correctOptionIds.includes(o.id)} onChange={() => toggleCorrect(o.id)} className="accent-brand-600" aria-label="Mark correct" />
                  <input value={o.label} onChange={(e) => setOptionLabel(o.id, e.target.value)} placeholder="Option label" className="flex-1 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card" />
                  <button onClick={() => removeOption(o.id)} className="p-1.5 rounded-md hover:bg-rose-50 text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <button onClick={addOption} className="text-sm text-brand-700 hover:text-brand-800 inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add option</button>
            </div>
          )}
          <div className="mt-4 flex items-center gap-4 text-sm">
            <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-500">
              <input type="checkbox" checked={q.required} onChange={(e) => onPatch({ required: e.target.checked })} className="accent-brand-600" /> Required
            </label>
            <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-500">
              Points
              <input type="number" min={0} value={q.points} onChange={(e) => onPatch({ points: e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0) })} className="w-20 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-sm bg-card dark:text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </label>
            {!AUTO_GRADED.includes(q.type) && <span className="text-xs text-slate-400">graded manually</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AssessmentDrawer;
