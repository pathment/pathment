'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Plus, Trash2, GripVertical, ChevronUp, ChevronDown,
  FileJson, Copy, Download, Upload, CircleDot, ListChecks, ToggleLeft, Type,
} from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import {
  quizApi,
  type QuizQuestionInput,
  type QuizQuestionKind,
  type QuizMatchMode,
  type QuizOption,
  type QuizEvaluationMode,
  type QuizKitStatus,
} from '@/lib/services/quiz-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

const KIND_META: { kind: QuizQuestionKind; label: string; icon: typeof CircleDot }[] = [
  { kind: 'single', label: 'Single choice', icon: CircleDot },
  { kind: 'multi', label: 'Multiple answer', icon: ListChecks },
  { kind: 'boolean', label: 'True / False', icon: ToggleLeft },
  { kind: 'short', label: 'Short answer', icon: Type },
];

// Forgiving aliases so JSON prepared by hand (or by Claude) still maps to a kind.
const KIND_ALIAS: Record<string, QuizQuestionKind> = {
  single: 'single', mcq: 'single', choice: 'single', 'single_choice': 'single', radio: 'single',
  multi: 'multi', multiple: 'multi', multi_select: 'multi', multiselect: 'multi', checkbox: 'multi', checkboxes: 'multi',
  boolean: 'boolean', truefalse: 'boolean', 'true_false': 'boolean', bool: 'boolean', tf: 'boolean', yesno: 'boolean',
  short: 'short', text: 'short', shortanswer: 'short', 'short_answer': 'short', written: 'short', open: 'short',
};

// Copy-paste starter for the JSON import — hand this shape to Claude to generate a
// full quiz and paste it back in. kind ∈ single | multi | boolean | short.
const JSON_TEMPLATE = `{
  "title": "React fundamentals check",
  "description": "A quick knowledge check on React basics (optional).",
  "evaluationDefault": "auto",
  "passScore": 70,
  "shuffleQuestions": false,
  "showAnswers": true,
  "questions": [
    {
      "kind": "single",
      "prompt": "Which hook manages state?",
      "points": 5,
      "options": [
        { "label": "useState", "correct": true },
        { "label": "useRef" },
        { "label": "useMemo" }
      ]
    },
    {
      "kind": "multi",
      "prompt": "Which are React hooks?",
      "points": 5,
      "options": [
        { "label": "useEffect", "correct": true },
        { "label": "useThing" },
        { "label": "useMemo", "correct": true }
      ]
    },
    {
      "kind": "boolean",
      "prompt": "JSX is required to use React.",
      "points": 2,
      "correctBool": false
    },
    {
      "kind": "short",
      "prompt": "Name the CLI to bootstrap a Vite app.",
      "points": 3,
      "matchMode": "keyword",
      "acceptedAnswers": ["create vite", "npm create vite"],
      "explanation": "npm create vite@latest"
    }
  ]
}`;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const uid = () => Math.random().toString(36).slice(2, 9);
const blankOption = (): QuizOption => ({ id: uid(), label: '' });
const booleanOptions = (): QuizOption[] => ([{ id: 'true', label: 'True' }, { id: 'false', label: 'False' }]);

// Local editor shape — every field is always present so the inputs stay simple;
// we trim/prune down to a QuizQuestionInput at save/export time.
interface EditorQuestion {
  kind: QuizQuestionKind;
  prompt: string;
  points: number;
  required: boolean;
  options: QuizOption[];
  correctOptionIds: string[];
  acceptedAnswers: string[];
  matchMode: QuizMatchMode;
  explanation: string;
}

const blankQuestion = (kind: QuizQuestionKind = 'single'): EditorQuestion => ({
  kind,
  prompt: '',
  points: 5,
  required: true,
  options: kind === 'boolean' ? booleanOptions() : (kind === 'single' || kind === 'multi' ? [blankOption(), blankOption()] : []),
  correctOptionIds: [],
  acceptedAnswers: kind === 'short' ? [''] : [],
  matchMode: 'exact',
  explanation: '',
});

const isChoice = (k: QuizQuestionKind) => k === 'single' || k === 'multi';

/**
 * QuizKitDrawer — create or edit a quiz kit: meta (title, evaluation + assign
 * defaults) + an ordered question list (single / multi / true-false / short).
 * Saving replaces the whole question set server-side, so the editor just holds
 * the current list.
 */
export function QuizKitDrawer({
  kitId,
  onClose,
  onSaved,
}: {
  kitId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!kitId;
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<QuizKitStatus>('draft');
  const [evaluationDefault, setEvaluationDefault] = useState<QuizEvaluationMode>('auto');
  const [timed, setTimed] = useState(false);
  const [timeMinutes, setTimeMinutes] = useState<number>(15);
  const [requirePass, setRequirePass] = useState(false);
  const [passScore, setPassScore] = useState<number>(70);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [showAnswers, setShowAnswers] = useState(true);
  const [allowRetakeDefault, setAllowRetakeDefault] = useState(false);
  const [questions, setQuestions] = useState<EditorQuestion[]>([blankQuestion()]);

  // Load an existing kit for editing.
  useEffect(() => {
    if (!kitId) return;
    let active = true;
    setLoading(true);
    quizApi.getKit(kitId)
      .then((res: any) => {
        if (!active) return;
        const k = res?.data?.kit;
        if (!k) { toast.error('Could not load kit'); onClose(); return; }
        setTitle(k.title || '');
        setDescription(k.description || '');
        setStatus(k.status || 'draft');
        setEvaluationDefault(k.evaluationDefault === 'review' ? 'review' : 'auto');
        setTimed(!!k.timeLimitSeconds);
        setTimeMinutes(k.timeLimitSeconds ? Math.max(1, Math.round(k.timeLimitSeconds / 60)) : 15);
        setRequirePass(k.passScore != null);
        setPassScore(typeof k.passScore === 'number' ? k.passScore : 70);
        setShuffleQuestions(!!k.shuffleQuestions);
        setShowAnswers(k.showAnswers !== false);
        setAllowRetakeDefault(!!k.allowRetakeDefault);
        const loaded: EditorQuestion[] = (k.questions || []).map((q: any) => {
          const kind: QuizQuestionKind = KIND_ALIAS[String(q.kind || '').toLowerCase()] || 'single';
          const options: QuizOption[] = kind === 'boolean'
            ? booleanOptions()
            : (Array.isArray(q.options) ? q.options.map((o: any) => ({ id: o.id || uid(), label: o.label || '' })) : []);
          return {
            kind,
            prompt: q.prompt || '',
            points: typeof q.points === 'number' ? q.points : 5,
            required: q.required !== false,
            options: isChoice(kind) && options.length === 0 ? [blankOption(), blankOption()] : options,
            correctOptionIds: Array.isArray(q.correctOptionIds) ? q.correctOptionIds.filter((x: any) => typeof x === 'string') : [],
            acceptedAnswers: kind === 'short'
              ? (Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length ? q.acceptedAnswers.map((a: any) => String(a)) : [''])
              : (Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers.map((a: any) => String(a)) : []),
            matchMode: q.matchMode === 'keyword' ? 'keyword' : 'exact',
            explanation: q.explanation || '',
          };
        });
        setQuestions(loaded.length ? loaded : [blankQuestion()]);
      })
      .catch((e: any) => { toast.error(extractApiErrorMessage(e, 'Could not load kit')); onClose(); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kitId]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchQuestion = (i: number, patch: Partial<EditorQuestion>) =>
    setQuestions((prev) => prev.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const setKind = (i: number, kind: QuizQuestionKind) =>
    setQuestions((prev) => prev.map((q, j) => {
      if (j !== i || q.kind === kind) return q;
      if (isChoice(kind)) {
        const wasChoice = isChoice(q.kind);
        const options = wasChoice && q.options.length ? q.options : [blankOption(), blankOption()];
        let correct = wasChoice ? q.correctOptionIds.filter((id) => options.some((o) => o.id === id)) : [];
        if (kind === 'single' && correct.length > 1) correct = [correct[0]]; // single keeps one
        return { ...q, kind, options, correctOptionIds: correct };
      }
      if (kind === 'boolean') {
        const keep = q.correctOptionIds[0] === 'true' || q.correctOptionIds[0] === 'false' ? [q.correctOptionIds[0]] : [];
        return { ...q, kind, options: booleanOptions(), correctOptionIds: keep };
      }
      // short
      return { ...q, kind, acceptedAnswers: q.acceptedAnswers.length ? q.acceptedAnswers : [''] };
    }));

  const move = (i: number, dir: -1 | 1) =>
    setQuestions((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const removeQuestion = (i: number) =>
    setQuestions((prev) => (prev.length === 1 ? prev : prev.filter((_, j) => j !== i)));

  // ── Option / accepted-answer helpers ───────────────────────────────────────
  const setOptionLabel = (i: number, optId: string, label: string) =>
    patchQuestion(i, { options: questions[i].options.map((o) => (o.id === optId ? { ...o, label } : o)) });

  const toggleCorrect = (i: number, optId: string) => {
    const q = questions[i];
    if (q.kind === 'single') { patchQuestion(i, { correctOptionIds: [optId] }); return; }
    const has = q.correctOptionIds.includes(optId);
    patchQuestion(i, { correctOptionIds: has ? q.correctOptionIds.filter((x) => x !== optId) : [...q.correctOptionIds, optId] });
  };

  const addOption = (i: number) => patchQuestion(i, { options: [...questions[i].options, blankOption()] });

  const removeOption = (i: number, optId: string) => {
    const q = questions[i];
    patchQuestion(i, {
      options: q.options.filter((o) => o.id !== optId),
      correctOptionIds: q.correctOptionIds.filter((x) => x !== optId),
    });
  };

  const setAccepted = (i: number, idx: number, val: string) =>
    patchQuestion(i, { acceptedAnswers: questions[i].acceptedAnswers.map((a, k) => (k === idx ? val : a)) });
  const addAccepted = (i: number) => patchQuestion(i, { acceptedAnswers: [...questions[i].acceptedAnswers, ''] });
  const removeAccepted = (i: number, idx: number) => {
    const list = questions[i].acceptedAnswers.filter((_, k) => k !== idx);
    patchQuestion(i, { acceptedAnswers: list.length ? list : [''] });
  };

  const totalPoints = questions.reduce((s, q) => s + (Number(q.points) || 0), 0);

  // ── JSON import / export ───────────────────────────────────────────────────
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonWarnings, setJsonWarnings] = useState<string[]>([]);

  // Parse pasted JSON into the editor, coercing loose values to valid ones and
  // collecting friendly notes for anything that had to be fixed or skipped.
  const loadFromJson = () => {
    setJsonError(null);
    setJsonWarnings([]);
    let parsed: unknown;
    try { parsed = JSON.parse(jsonText); }
    catch { setJsonError("That isn't valid JSON — check for missing commas, quotes, or a trailing comma."); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = parsed as any;
    const rawQ = Array.isArray(p) ? p : (Array.isArray(p?.questions) ? p.questions : null);
    if (!rawQ) { setJsonError('Expected an object with a "questions" array (or an array of questions).'); return; }

    const warnings: string[] = [];

    // Kit meta (only when the top level is an object, not a bare array of questions).
    if (!Array.isArray(p)) {
      if (typeof p.title === 'string') setTitle(p.title);
      if (typeof p.description === 'string') setDescription(p.description);
      if (p.status === 'draft' || p.status === 'published' || p.status === 'archived') setStatus(p.status);
      if (p.evaluationDefault === 'auto' || p.evaluationDefault === 'review') setEvaluationDefault(p.evaluationDefault);
      else if (p.evaluationMode === 'auto' || p.evaluationMode === 'review') setEvaluationDefault(p.evaluationMode);
      if (p.timeLimitSeconds != null && Number.isFinite(Number(p.timeLimitSeconds)) && Number(p.timeLimitSeconds) > 0) {
        setTimed(true); setTimeMinutes(Math.max(1, Math.round(Number(p.timeLimitSeconds) / 60)));
      } else if (p.timeMinutes != null && Number.isFinite(Number(p.timeMinutes)) && Number(p.timeMinutes) > 0) {
        setTimed(true); setTimeMinutes(Math.max(1, Math.round(Number(p.timeMinutes))));
      }
      if (p.passScore != null && Number.isFinite(Number(p.passScore))) {
        setRequirePass(true); setPassScore(clamp(Math.round(Number(p.passScore)), 0, 100));
      }
      if (typeof p.shuffleQuestions === 'boolean') setShuffleQuestions(p.shuffleQuestions);
      if (typeof p.showAnswers === 'boolean') setShowAnswers(p.showAnswers);
      if (typeof p.allowRetake === 'boolean') setAllowRetakeDefault(p.allowRetake);
      else if (typeof p.allowRetakeDefault === 'boolean') setAllowRetakeDefault(p.allowRetakeDefault);
    }

    const drafts: EditorQuestion[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawQ.forEach((raw: any, i: number) => {
      const n = i + 1;
      if (!raw || typeof raw !== 'object') { warnings.push(`Question ${n}: skipped — not an object.`); return; }
      const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim()
        : (typeof raw.question === 'string' ? raw.question.trim() : '');
      if (!prompt) { warnings.push(`Question ${n}: skipped — no prompt.`); return; }

      const rawKind = String(raw.kind ?? raw.type ?? 'single').toLowerCase();
      let kind = KIND_ALIAS[rawKind];
      if (!kind) { warnings.push(`Question ${n}: unknown kind "${raw.kind ?? raw.type}" — defaulted to Single choice.`); kind = 'single'; }

      let points = 5;
      if (raw.points != null) {
        if (Number.isFinite(Number(raw.points))) points = Math.max(0, Math.round(Number(raw.points)));
        else warnings.push(`Question ${n}: "points" wasn't a number — used 5.`);
      }
      const required = raw.required !== false;
      const explanation = typeof raw.explanation === 'string' ? raw.explanation
        : (typeof raw.explain === 'string' ? raw.explain : '');

      if (isChoice(kind)) {
        const rawOpts: any[] = Array.isArray(raw.options) ? raw.options : [];
        const correctIds: any[] = Array.isArray(raw.correctOptionIds) ? raw.correctOptionIds
          : (Array.isArray(raw.correct) ? raw.correct : (Array.isArray(raw.answers) ? raw.answers : []));
        const options: QuizOption[] = [];
        const correctOptionIds: string[] = [];
        rawOpts.forEach((o: any, oi: number) => {
          const label = typeof o === 'string' ? o.trim() : (typeof o?.label === 'string' ? o.label.trim() : (typeof o?.text === 'string' ? o.text.trim() : ''));
          if (!label) return;
          const id = uid();
          options.push({ id, label });
          const flagged = (o && typeof o === 'object' && o.correct === true)
            || correctIds.some((c) => c === oi || (typeof c === 'string' && c.toLowerCase() === label.toLowerCase()));
          if (flagged) correctOptionIds.push(id);
        });
        if (options.length < 2) warnings.push(`Question ${n}: ${kind === 'multi' ? 'multiple-answer' : 'single-choice'} needs 2+ options.`);
        let finalCorrect = correctOptionIds;
        if (kind === 'single' && correctOptionIds.length > 1) { finalCorrect = [correctOptionIds[0]]; warnings.push(`Question ${n}: single-choice keeps one correct answer — kept the first.`); }
        if (options.length >= 2 && finalCorrect.length === 0) warnings.push(`Question ${n}: no correct option marked — pick one before saving.`);
        drafts.push({
          kind, prompt, points, required,
          options: options.length ? options : [blankOption(), blankOption()],
          correctOptionIds: finalCorrect,
          acceptedAnswers: [], matchMode: 'exact', explanation,
        });
        return;
      }

      if (kind === 'boolean') {
        let correct: string[] = [];
        if (typeof raw.correctBool === 'boolean') correct = [raw.correctBool ? 'true' : 'false'];
        else if (typeof raw.correct === 'boolean') correct = [raw.correct ? 'true' : 'false'];
        else if (Array.isArray(raw.correctOptionIds)) {
          const c = String(raw.correctOptionIds[0] ?? '').toLowerCase();
          if (c === 'true' || c === 'false') correct = [c];
        } else if (typeof raw.answer === 'string' && (raw.answer.toLowerCase() === 'true' || raw.answer.toLowerCase() === 'false')) {
          correct = [raw.answer.toLowerCase()];
        }
        if (!correct.length) warnings.push(`Question ${n}: no true/false answer set — pick one before saving.`);
        drafts.push({
          kind, prompt, points, required,
          options: booleanOptions(), correctOptionIds: correct,
          acceptedAnswers: [], matchMode: 'exact', explanation,
        });
        return;
      }

      // short
      const accepted = (Array.isArray(raw.acceptedAnswers) ? raw.acceptedAnswers
        : (Array.isArray(raw.answers) ? raw.answers : (typeof raw.answer === 'string' ? [raw.answer] : [])))
        .map((a: any) => String(a)).filter((a: string) => a.trim());
      const matchMode: QuizMatchMode = raw.matchMode === 'keyword' ? 'keyword' : 'exact';
      if (!accepted.length) warnings.push(`Question ${n}: short answer has no accepted answers — add one before saving.`);
      drafts.push({
        kind, prompt, points, required,
        options: [], correctOptionIds: [],
        acceptedAnswers: accepted.length ? accepted : [''],
        matchMode, explanation,
      });
    });

    if (!drafts.length) { setJsonError('No questions with a "prompt" were found.'); return; }
    setQuestions(drafts);
    setJsonWarnings(warnings);
    setJsonOpen(warnings.length > 0); // keep the panel open if there are notes to read
    toast.success(`Loaded ${drafts.length} question${drafts.length === 1 ? '' : 's'} from JSON — review & save`);
    if (warnings.length) toast.message(`${warnings.length} note${warnings.length === 1 ? '' : 's'} to review — see the import panel.`);
  };

  const currentAsJson = () => JSON.stringify({
    title: title.trim() || 'Untitled quiz',
    description: description.trim() || undefined,
    status,
    evaluationDefault,
    timeLimitSeconds: timed ? Math.max(60, Math.round(timeMinutes * 60)) : undefined,
    passScore: requirePass ? clamp(Math.round(passScore), 0, 100) : undefined,
    shuffleQuestions: shuffleQuestions || undefined,
    showAnswers,
    allowRetake: allowRetakeDefault || undefined,
    questions: questions.filter((q) => q.prompt.trim()).map((q) => {
      const base: Record<string, unknown> = {
        kind: q.kind,
        prompt: q.prompt.trim(),
        points: Number(q.points) || 5,
        required: q.required !== false,
        explanation: q.explanation.trim() || undefined,
      };
      if (isChoice(q.kind)) {
        base.options = q.options.filter((o) => o.label.trim()).map((o) => ({
          label: o.label.trim(),
          correct: q.correctOptionIds.includes(o.id) || undefined,
        }));
      } else if (q.kind === 'boolean') {
        base.correctBool = q.correctOptionIds[0] === 'true' ? true : (q.correctOptionIds[0] === 'false' ? false : undefined);
      } else {
        base.acceptedAnswers = q.acceptedAnswers.map((a) => a.trim()).filter(Boolean);
        base.matchMode = q.matchMode;
      }
      return base;
    }),
  }, null, 2);

  const copyJson = async () => {
    try { await navigator.clipboard.writeText(currentAsJson()); toast.success('Quiz JSON copied'); }
    catch { setJsonText(currentAsJson()); setJsonOpen(true); toast.message('Copied into the box below — select & copy'); }
  };

  const downloadJson = () => {
    if (typeof window === 'undefined') return;
    const blob = new Blob([currentAsJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title.trim() || 'quiz-kit').replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setJsonText(String(reader.result || '')); setJsonError(null); setJsonWarnings([]); };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Save ────────────────────────────────────────────────────────────────
  const save = async () => {
    if (saving) return;
    if (!title.trim()) { toast.error('Give the kit a title'); return; }

    const clean = questions
      .map((q) => ({ ...q, prompt: q.prompt.trim() }))
      .filter((q) => q.prompt);
    if (!clean.length) { toast.error('Add at least one question with a prompt'); return; }

    // Per-kind checks — report the first offending question (1-based).
    for (let i = 0; i < clean.length; i++) {
      const q = clean[i];
      const n = i + 1;
      if (isChoice(q.kind)) {
        const labeled = q.options.filter((o) => o.label.trim());
        if (labeled.length < 2) { toast.error(`Question ${n}: add at least 2 options.`); return; }
        const correct = q.correctOptionIds.filter((id) => labeled.some((o) => o.id === id));
        if (correct.length < 1) { toast.error(`Question ${n}: mark at least one correct option.`); return; }
      } else if (q.kind === 'boolean') {
        if (q.correctOptionIds[0] !== 'true' && q.correctOptionIds[0] !== 'false') { toast.error(`Question ${n}: pick True or False as the answer.`); return; }
      } else {
        if (q.acceptedAnswers.filter((a) => a.trim()).length < 1) { toast.error(`Question ${n}: add at least one accepted answer.`); return; }
      }
    }

    const payloadQuestions: QuizQuestionInput[] = clean.map((q) => {
      if (isChoice(q.kind)) {
        const options = q.options.filter((o) => o.label.trim()).map((o) => ({ id: o.id, label: o.label.trim() }));
        const optIds = new Set(options.map((o) => o.id));
        return {
          kind: q.kind,
          prompt: q.prompt,
          points: Number(q.points) || 5,
          required: q.required !== false,
          options,
          correctOptionIds: q.correctOptionIds.filter((id) => optIds.has(id)),
          explanation: q.explanation.trim() || null,
        };
      }
      if (q.kind === 'boolean') {
        return {
          kind: q.kind,
          prompt: q.prompt,
          points: Number(q.points) || 5,
          required: q.required !== false,
          options: booleanOptions(),
          correctOptionIds: [q.correctOptionIds[0]],
          explanation: q.explanation.trim() || null,
        };
      }
      return {
        kind: q.kind,
        prompt: q.prompt,
        points: Number(q.points) || 5,
        required: q.required !== false,
        acceptedAnswers: q.acceptedAnswers.map((a) => a.trim()).filter(Boolean),
        matchMode: q.matchMode,
        explanation: q.explanation.trim() || null,
      };
    });

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      status,
      evaluationDefault,
      timeLimitSeconds: timed ? Math.max(60, Math.round(timeMinutes * 60)) : null,
      passScore: requirePass ? clamp(Math.round(passScore), 0, 100) : null,
      shuffleQuestions,
      showAnswers,
      allowRetakeDefault,
      questions: payloadQuestions,
    };

    try {
      setSaving(true);
      if (isEdit) await quizApi.updateKit(kitId!, payload);
      else await quizApi.createKit(payload);
      toast.success(isEdit ? 'Kit updated' : 'Kit created');
      onSaved();
    } catch (e: any) {
      toast.error(extractApiErrorMessage(e, 'Could not save kit'));
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={isEdit ? 'Edit quiz kit' : 'New quiz kit'}
      subtitle={`${questions.length} question${questions.length === 1 ? '' : 's'} · ${totalPoints} pts`}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}{isEdit ? 'Save changes' : 'Create kit'}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
      ) : (
        <div className="space-y-6">
          {/* Meta */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title <span className="text-red-500">*</span></label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. React fundamentals check" className={field} autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What this quiz covers (optional)" className={field} />
            </div>
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1.5">Status</span>
              <div className="flex flex-wrap gap-2">
                {([['draft', 'Draft'], ['published', 'Published'], ['archived', 'Archived']] as const).map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setStatus(val)}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium ${status === val ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Only <span className="font-medium">Published</span> kits can be assigned. Draft = still building; Archived = retired (kept for quizzes already assigned).
              </p>
            </div>
          </div>

          {/* Defaults when assigning */}
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-1.5">Defaults when assigning <span className="text-slate-400 font-normal">(overridable per mentee)</span></span>
            <div className="space-y-3 rounded-xl border border-slate-200 p-3.5 bg-slate-50/50">
              {/* Grading mode */}
              <div>
                <span className="block text-xs font-medium text-slate-600 mb-1.5">Grading</span>
                <div className="flex flex-wrap gap-2">
                  {([['auto', 'Auto-grade (instant)'], ['review', 'Mentor review']] as const).map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setEvaluationDefault(val)}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium ${evaluationDefault === val ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timed */}
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                <span className="text-sm text-slate-700">Timed</span>
                {timed && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                    <input type="number" min={1} value={timeMinutes} onChange={(e) => setTimeMinutes(Math.max(1, Number(e.target.value)))}
                      className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500" /> minutes
                  </span>
                )}
              </label>

              {/* Pass mark */}
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={requirePass} onChange={(e) => setRequirePass(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                <span className="text-sm text-slate-700">Require a pass mark</span>
                {requirePass && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                    <input type="number" min={0} max={100} value={passScore} onChange={(e) => setPassScore(clamp(Number(e.target.value), 0, 100))}
                      className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500" /> %
                  </span>
                )}
              </label>

              {/* Toggles */}
              {([
                ['Shuffle question order', shuffleQuestions, setShuffleQuestions] as const,
                ['Show correct answers to the mentee after grading', showAnswers, setShowAnswers] as const,
                ['Allow re-attempt', allowRetakeDefault, setAllowRetakeDefault] as const,
              ]).map(([label, val, setter]) => (
                <label key={label} className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={val} onChange={(e) => setter(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  <span className="text-sm text-slate-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Import / export JSON — prepare a whole quiz elsewhere (e.g. with Claude) and paste it in. */}
          <div className="rounded-xl border border-slate-200">
            <button type="button" onClick={() => setJsonOpen((v) => !v)} className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium text-slate-700">
              <span className="inline-flex items-center gap-1.5"><FileJson className="w-4 h-4" />Import / export JSON</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${jsonOpen ? 'rotate-180' : ''}`} />
            </button>
            {jsonOpen && (
              <div className="px-3.5 pb-3.5 space-y-2 border-t border-slate-200 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => { setJsonText(JSON_TEMPLATE); setJsonError(null); setJsonWarnings([]); }} className="text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50">Insert template</button>
                  <label className="text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />Upload .json
                    <input type="file" accept="application/json,.json" onChange={onUploadFile} className="hidden" />
                  </label>
                  <button type="button" onClick={copyJson} className="ml-auto text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 inline-flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" />Copy current</button>
                  <button type="button" onClick={downloadJson} className="text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 inline-flex items-center gap-1.5"><Download className="w-3.5 h-3.5" />Download</button>
                </div>
                <textarea value={jsonText} onChange={(e) => { setJsonText(e.target.value); setJsonError(null); }} rows={6}
                  placeholder='Paste quiz JSON here, or click "Insert template" to see the format…'
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-brand-500" />
                {jsonError && <p className="text-xs text-red-500">{jsonError}</p>}
                {jsonWarnings.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
                    <p className="text-[11px] font-medium text-amber-700 mb-1">Loaded, but check these:</p>
                    <ul className="text-[11px] text-amber-700 space-y-0.5 list-disc list-inside">
                      {jsonWarnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
                <button type="button" onClick={loadFromJson} disabled={!jsonText.trim()} className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium py-2 disabled:opacity-50">Load into editor</button>
                <p className="text-[11px] text-slate-400">Loading replaces the questions (and kit settings) above — review, then Save.</p>
              </div>
            )}
          </div>

          {/* Questions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Questions</span>
              <span className="text-xs text-slate-400">{totalPoints} pts total</span>
            </div>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <GripVertical className="w-4 h-4 text-slate-300" />Question {i + 1}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === questions.length - 1} aria-label="Move down" className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                      <button type="button" onClick={() => removeQuestion(i)} disabled={questions.length === 1} aria-label="Remove question" className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>

                  {/* Kind */}
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {KIND_META.map(({ kind, label, icon: Icon }) => (
                      <button key={kind} type="button" onClick={() => setKind(i, kind)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${q.kind === kind ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                        <Icon className="w-3.5 h-3.5" />{label}
                      </button>
                    ))}
                  </div>

                  <textarea value={q.prompt} onChange={(e) => patchQuestion(i, { prompt: e.target.value })} rows={2}
                    placeholder="The question the mentee sees…" className={`${field} mb-2.5`} />

                  {/* Single / multi options */}
                  {isChoice(q.kind) && (
                    <div className="space-y-2 mb-2.5">
                      {q.options.map((o) => {
                        const checked = q.correctOptionIds.includes(o.id);
                        return (
                          <div key={o.id} className="flex items-center gap-2">
                            <input
                              type={q.kind === 'single' ? 'radio' : 'checkbox'}
                              name={`correct-${i}`}
                              checked={checked}
                              onChange={() => toggleCorrect(i, o.id)}
                              aria-label="Mark correct"
                              className={`w-4 h-4 border-slate-300 text-brand-600 focus:ring-brand-500 ${q.kind === 'single' ? '' : 'rounded'}`}
                            />
                            <input value={o.label} onChange={(e) => setOptionLabel(i, o.id, e.target.value)} placeholder="Option text" className={`${field} flex-1`} />
                            <button type="button" onClick={() => removeOption(i, o.id)} disabled={q.options.length <= 2} aria-label="Remove option" className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        );
                      })}
                      <button type="button" onClick={() => addOption(i)} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"><Plus className="w-3.5 h-3.5" />Add option</button>
                      <p className="text-[11px] text-slate-400">
                        Need 2+ options. {q.kind === 'single' ? 'Pick the one correct answer.' : 'Tick every correct answer.'}
                      </p>
                    </div>
                  )}

                  {/* True / False */}
                  {q.kind === 'boolean' && (
                    <div className="flex items-center gap-4 mb-2.5">
                      {(['true', 'false'] as const).map((v) => (
                        <label key={v} className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                          <input type="radio" name={`bool-${i}`} checked={q.correctOptionIds[0] === v} onChange={() => patchQuestion(i, { correctOptionIds: [v] })}
                            className="w-4 h-4 border-slate-300 text-brand-600 focus:ring-brand-500" />
                          {v === 'true' ? 'True' : 'False'}
                        </label>
                      ))}
                      <span className="text-[11px] text-slate-400">Pick the correct answer.</span>
                    </div>
                  )}

                  {/* Short answer */}
                  {q.kind === 'short' && (
                    <div className="space-y-2 mb-2.5">
                      <div className="flex flex-wrap gap-2">
                        {([['exact', 'Exact match'], ['keyword', 'Keyword match']] as const).map(([val, label]) => (
                          <button key={val} type="button" onClick={() => patchQuestion(i, { matchMode: val })}
                            className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${q.matchMode === val ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {q.matchMode === 'exact'
                          ? 'Exact — the answer must match one of the accepted answers (case & spacing ignored).'
                          : 'Keyword — every accepted entry must appear somewhere in the answer.'}
                      </p>
                      {q.acceptedAnswers.map((a, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input value={a} onChange={(e) => setAccepted(i, idx, e.target.value)} placeholder="Accepted answer" className={`${field} flex-1`} />
                          <button type="button" onClick={() => removeAccepted(i, idx)} disabled={q.acceptedAnswers.length <= 1} aria-label="Remove accepted answer" className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                      <button type="button" onClick={() => addAccepted(i)} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"><Plus className="w-3.5 h-3.5" />Add accepted answer</button>
                    </div>
                  )}

                  {/* Points + required */}
                  <div className="grid grid-cols-2 gap-2 mb-2.5">
                    <label className="text-xs text-slate-500">
                      Points
                      <input type="number" min={0} value={q.points} onChange={(e) => patchQuestion(i, { points: Number(e.target.value) })} className={`${field} mt-1`} />
                    </label>
                    <label className="flex items-end gap-2 pb-2 cursor-pointer">
                      <input type="checkbox" checked={q.required !== false} onChange={(e) => patchQuestion(i, { required: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                      <span className="text-xs text-slate-600">Required</span>
                    </label>
                  </div>

                  <textarea value={q.explanation} onChange={(e) => patchQuestion(i, { explanation: e.target.value })} rows={2}
                    placeholder="Explanation shown to the mentee after grading (optional)" className={`${field} bg-amber-50/40`} />
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setQuestions((prev) => [...prev, blankQuestion()])}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-slate-300 rounded-xl text-sm text-slate-600 hover:border-brand-300 hover:text-brand-700">
              <Plus className="w-4 h-4" /> Add question
            </button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

export default QuizKitDrawer;
