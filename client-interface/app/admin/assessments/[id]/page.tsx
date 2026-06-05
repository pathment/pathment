'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, GripVertical, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { assessmentApi, type AssessmentQuestionType } from '@/lib/services/assessment-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

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

export default function AssessmentBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || '');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState({ title: '', description: '', instructions: '', status: 'draft', passingScore: '' as string | number, timeLimitMins: '' as string | number });
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    assessmentApi
      .get(id)
      .then((a) => {
        setMeta({
          title: a.title || '',
          description: a.description || '',
          instructions: a.instructions || '',
          status: a.status || 'draft',
          passingScore: a.passingScore ?? '',
          timeLimitMins: a.timeLimitMins ?? '',
        });
        setQuestions((a.questions || []).map((q) => ({
          id: q.id || newId(),
          type: q.type,
          prompt: q.prompt,
          required: q.required !== false,
          points: q.points || 0,
          options: (q.options || []).map((o) => ({ id: o.id || newId(), label: o.label })),
          correctOptionIds: q.correctOptionIds || [],
          config: q.config || {},
        })));
      })
      .catch(() => toast.error('Could not load this assessment'))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(load, [load]);

  const addQuestion = (type: AssessmentQuestionType) => {
    const base: QuestionDraft = { id: newId(), type, prompt: '', required: true, points: AUTO_GRADED.includes(type) ? 10 : 0, options: [], correctOptionIds: [], config: {} };
    if (AUTO_GRADED.includes(type)) base.options = [{ id: newId(), label: '' }, { id: newId(), label: '' }];
    setQuestions((prev) => [...prev, base]);
  };

  const patchQuestion = (qid: string, patch: Partial<QuestionDraft>) =>
    setQuestions((prev) => prev.map((q) => (q.id === qid ? { ...q, ...patch } : q)));

  const removeQuestion = (qid: string) => setQuestions((prev) => prev.filter((q) => q.id !== qid));

  const move = (idx: number, dir: -1 | 1) => {
    setQuestions((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const save = async () => {
    if (!meta.title.trim()) { toast.error('Title is required'); return; }
    for (const q of questions) {
      if (!q.prompt.trim()) { toast.error('Every question needs a prompt'); return; }
      if (AUTO_GRADED.includes(q.type)) {
        const labeled = q.options.filter((o) => o.label.trim());
        if (labeled.length < 2) { toast.error('Choice questions need at least 2 options'); return; }
        if (q.correctOptionIds.length === 0) { toast.error('Mark the correct answer for each choice question'); return; }
      }
    }
    setSaving(true);
    try {
      await assessmentApi.update(id, {
        title: meta.title.trim(),
        description: meta.description.trim() || undefined,
        instructions: meta.instructions.trim() || undefined,
        status: meta.status as 'draft' | 'published' | 'archived',
        passingScore: meta.passingScore === '' ? null : Number(meta.passingScore),
        timeLimitMins: meta.timeLimitMins === '' ? null : Number(meta.timeLimitMins),
      });
      await assessmentApi.setQuestions(id, questions.map((q) => ({
        type: q.type,
        prompt: q.prompt.trim(),
        required: q.required,
        points: q.points,
        options: AUTO_GRADED.includes(q.type) ? q.options.filter((o) => o.label.trim()) : [],
        correctOptionIds: q.correctOptionIds,
        config: q.config,
      })));
      toast.success('Assessment saved');
      load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  const removeAssessment = async () => {
    if (!confirm('Delete this assessment? This cannot be undone.')) return;
    try {
      await assessmentApi.remove(id);
      toast.success('Assessment deleted');
      router.push('/admin/assessments');
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not delete'));
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>;

  const totalPoints = questions.reduce((s, q) => s + (q.points || 0), 0);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <Link href="/admin/assessments" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" /> Assessments
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={removeAssessment} className="px-3 py-2 rounded-lg border border-slate-200 text-rose-600 text-sm hover:bg-rose-50">Delete</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </div>

      {/* Meta */}
      <div className="rounded-2xl border border-slate-200 bg-card p-6 space-y-4">
        <input
          value={meta.title}
          onChange={(e) => setMeta({ ...meta, title: e.target.value })}
          placeholder="Assessment title"
          className="w-full text-lg font-semibold border-0 border-b border-slate-200 focus:border-brand-500 focus:outline-none bg-transparent pb-2 text-slate-900"
        />
        <textarea
          rows={2}
          value={meta.description}
          onChange={(e) => setMeta({ ...meta, description: e.target.value })}
          placeholder="Short description (shown to applicants)"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card"
        />
        <textarea
          rows={2}
          value={meta.instructions}
          onChange={(e) => setMeta({ ...meta, instructions: e.target.value })}
          placeholder="Instructions (e.g. how it's graded, time expectations)"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card"
        />
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
            <select value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Pass score</label>
            <input type="number" value={meta.passingScore} onChange={(e) => setMeta({ ...meta, passingScore: e.target.value })} placeholder="—" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Time limit (min)</label>
            <input type="number" value={meta.timeLimitMins} onChange={(e) => setMeta({ ...meta, timeLimitMins: e.target.value })} placeholder="—" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>
        <p className="text-xs text-slate-400">{questions.length} questions · {totalPoints} auto-graded points</p>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((q, idx) => (
          <QuestionCard
            key={q.id}
            q={q}
            idx={idx}
            isFirst={idx === 0}
            isLast={idx === questions.length - 1}
            onPatch={(patch) => patchQuestion(q.id, patch)}
            onRemove={() => removeQuestion(q.id)}
            onMove={(dir) => move(idx, dir)}
            newId={newId}
          />
        ))}
      </div>

      {/* Add question */}
      <div className="rounded-2xl border border-dashed border-slate-300 bg-card p-4">
        <p className="text-sm font-medium text-slate-700 mb-3 inline-flex items-center gap-1"><Plus className="w-4 h-4" /> Add a question</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TYPE_LABELS) as AssessmentQuestionType[]).map((t) => (
            <button key={t} onClick={() => addQuestion(t)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-brand-300 hover:bg-brand-50/40">
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuestionCard({
  q, idx, isFirst, isLast, onPatch, onRemove, onMove, newId,
}: {
  q: QuestionDraft; idx: number; isFirst: boolean; isLast: boolean;
  onPatch: (patch: Partial<QuestionDraft>) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void; newId: () => string;
}) {
  const isChoice = q.type === 'mcq' || q.type === 'multi_select';

  const setOptionLabel = (oid: string, label: string) =>
    onPatch({ options: q.options.map((o) => (o.id === oid ? { ...o, label } : o)) });
  const addOption = () => onPatch({ options: [...q.options, { id: newId(), label: '' }] });
  const removeOption = (oid: string) =>
    onPatch({ options: q.options.filter((o) => o.id !== oid), correctOptionIds: q.correctOptionIds.filter((c) => c !== oid) });
  const toggleCorrect = (oid: string) => {
    if (q.type === 'mcq') onPatch({ correctOptionIds: [oid] });
    else onPatch({ correctOptionIds: q.correctOptionIds.includes(oid) ? q.correctOptionIds.filter((c) => c !== oid) : [...q.correctOptionIds, oid] });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center pt-1 text-slate-300">
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-brand-700 bg-brand-50 dark:bg-brand-500/15 rounded-full px-2.5 py-1">
              {TYPE_LABELS[q.type]}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => onMove(-1)} disabled={isFirst} className="p-1.5 rounded-md hover:bg-slate-100 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
              <button onClick={() => onMove(1)} disabled={isLast} className="p-1.5 rounded-md hover:bg-slate-100 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
              <button onClick={onRemove} className="p-1.5 rounded-md hover:bg-rose-50 text-rose-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>

          <textarea
            rows={2}
            value={q.prompt}
            onChange={(e) => onPatch({ prompt: e.target.value })}
            placeholder={`Question ${idx + 1} prompt`}
            className="mt-3 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card"
          />

          {isChoice && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-500">Options — mark the correct one{q.type === 'multi_select' ? '(s)' : ''}.</p>
              {q.options.map((o) => (
                <div key={o.id} className="flex items-center gap-2">
                  <input
                    type={q.type === 'mcq' ? 'radio' : 'checkbox'}
                    checked={q.correctOptionIds.includes(o.id)}
                    onChange={() => toggleCorrect(o.id)}
                    className="accent-brand-600"
                    aria-label="Mark correct"
                  />
                  <input
                    value={o.label}
                    onChange={(e) => setOptionLabel(o.id, e.target.value)}
                    placeholder="Option label"
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card"
                  />
                  <button onClick={() => removeOption(o.id)} className="p-1.5 rounded-md hover:bg-rose-50 text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <button onClick={addOption} className="text-sm text-brand-700 hover:text-brand-800 inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add option</button>
            </div>
          )}

          <div className="mt-4 flex items-center gap-4 text-sm">
            <label className="inline-flex items-center gap-2 text-slate-600">
              <input type="checkbox" checked={q.required} onChange={(e) => onPatch({ required: e.target.checked })} className="accent-brand-600" />
              Required
            </label>
            <label className="inline-flex items-center gap-2 text-slate-600">
              Points
              <input
                type="number"
                value={q.points}
                onChange={(e) => onPatch({ points: Math.max(0, Number(e.target.value) || 0) })}
                className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            {!AUTO_GRADED.includes(q.type) && <span className="text-xs text-slate-400">graded manually</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
