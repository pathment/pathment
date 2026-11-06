'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Check, ClipboardList, Coins, FileQuestion, FileText, GraduationCap, ListChecks, Loader2, Mic, Plus, Route, Send, Trash2, UserPlus, Users } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { TaskTimingRow, type TaskDueDraft } from '@/components/mentor/TaskTimingRow';
import { initialTaskSchedule } from '@/components/mentor/TaskScheduleFields';
import { cleanHtml } from '@/lib/utils/html';
import { qk, useApiQuery } from '@/lib/query';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { poolApi, type PoolAssignment, type PoolDashboard } from '@/lib/services/pool-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { AssignWorkDrawer } from './AssignWorkDrawer';
import { RoadmapStepPicker } from './RoadmapStepPicker';
import { Chip, DIFFICULTY_POINTS_FALLBACK, EmptyState, PanelHeader, Spinner, WORK_STATUS, fmtDate, panel, primaryBtn, pts, secondaryBtn } from './poolUi';

const KIND_ICON = { task: ClipboardList, quiz: FileQuestion, interview: Mic, course: GraduationCap } as const;
const KIND_TONE = {
  task: 'bg-brand-50 text-brand-600',
  quiz: 'bg-blue-50 text-blue-600',
  interview: 'bg-amber-50 text-amber-600',
  course: 'bg-emerald-50 text-emerald-600',
} as const;

// The same type chips, labels and styles as the mentor's "Assign a task"
// drawer (components/mentor/AssignTaskDrawer.tsx), so both read as one product.
// Quiz and Interview switch to their kit pickers, exactly as they do there;
// Course switches to the Edorax catalog.
const TYPES = ['assignment', 'project', 'quiz', 'reading', 'video', 'discussion', 'interview', 'course', 'open_source'] as const;
type WorkType = typeof TYPES[number];
const TYPE_LABEL: Record<WorkType, string> = {
  assignment: 'Assignment', project: 'Project', quiz: 'Quiz', reading: 'Reading', video: 'Video', discussion: 'Discussion', interview: 'Interview', course: 'Course', open_source: 'Open Source',
};
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const pill = (active: boolean) =>
  `px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
    active
      ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
      : 'border-slate-200 text-slate-600 hover:border-slate-300'
  }`;
const checkboxCls = 'mt-0.5 w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500';

/** 'YYYY-MM-DD' in the viewer's zone. */
const dayKey = (d: Date) => d.toLocaleDateString('en-CA');

/**
 * Adding a piece of qualifying work.
 *
 * Two ways in, because they are two different jobs. "From roadmap" is a browse
 * — open a roadmap, read its steps, tick several — and it adds as many pieces
 * of work as were ticked in one request. "Custom" is an author: one piece,
 * written here, which is also how a quiz or an interview kit is handed out.
 *
 * What a piece of work is WORTH is settled here, next to the work, defaulted
 * from its difficulty. That replaced a separate scoring policy of weighted
 * components: an operator had to describe the round twice and the two drifted
 * apart.
 */
function AddWorkDrawer({ data, onClose, onDone }: { data: PoolDashboard; onClose: () => void; onDone: () => void }) {
  const { pool } = data;
  const { data: options, loading: optionsLoading } = useApiQuery({
    queryKey: qk.pool.options(pool.programId),
    queryFn: () => poolApi.options(pool.programId),
  });

  const [source, setSource] = useState<'roadmap' | 'custom'>('roadmap');
  const [type, setType] = useState<WorkType>('assignment');
  const kind = type === 'quiz' ? 'quiz' : type === 'interview' ? 'interview' : type === 'course' ? 'course' : 'task';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<typeof DIFFICULTIES[number]>('medium');
  const [deliverable, setDeliverable] = useState('');
  const [criteria, setCriteria] = useState<string[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [kitId, setKitId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [levels, setLevels] = useState<string[]>([]);
  const [evaluationMode, setEvaluationMode] = useState<'auto' | 'review'>('auto');
  const [allowRetake, setAllowRetake] = useState(false);
  const [required, setRequired] = useState(true);
  const [who, setWho] = useState<'all' | 'later'>('all');
  // Blank means "whatever its difficulty is worth" — the common case, and the
  // one an operator should not have to type.
  const [points, setPoints] = useState('');
  // Due defaults to the pool's qualification deadline, as before.
  const deadline = pool.qualificationDueAt ? new Date(pool.qualificationDueAt) : null;
  const [due, setDue] = useState<TaskDueDraft>(deadline ? { days: 7, exact: dayKey(deadline) } : { days: 7, exact: '' });
  const [schedule, setSchedule] = useState(initialTaskSchedule);
  const [busy, setBusy] = useState(false);

  const curve = { ...DIFFICULTY_POINTS_FALLBACK, ...(options?.difficultyPoints || {}), ...(pool.scoringPolicy?.difficultyPoints || {}) };
  // Steps already in this pool, so the picker can say so instead of hiding them.
  const taken = new Set(data.assignments.filter((a) => !a.cancelledAt).map((a) => a.roadmapTask?.id).filter(Boolean) as string[]);
  const kits = (kind === 'quiz' ? options?.quizKits : options?.interviewKits) || [];
  const courses = options?.courses || [];
  // Levels this round can aim work at. No levels = the control is not shown
  // at all, so a round that never asked for one looks exactly as before.
  const poolLevels = data.levels || [];
  const toggleLevel = (key: string) =>
    setLevels((cur) => (cur.includes(key) ? cur.filter((l) => l !== key) : [...cur, key]));
  const levelCount = (key: string) => data.members.filter((m) => m.level === key && !m.decision).length;
  // Courses already in this pool: a seat can only be allocated once per round.
  const takenCourses = new Set(
    data.assignments.filter((a) => !a.cancelledAt && a.kind === 'course').map((a) => a.config?.courseId).filter(Boolean) as string[],
  );

  // Switching between a quiz and an interview means a different kit list.
  const pickType = (t: WorkType) => {
    if ((t === 'quiz') !== (type === 'quiz') || (t === 'interview') !== (type === 'interview')) setKitId('');
    if ((t === 'course') !== (type === 'course')) setCourseId('');
    setType(t);
  };

  /** The chosen deadline as an instant: the pool's own deadline kept exact, otherwise the end of that day. */
  const dueAt = () => {
    if (deadline && due.exact === dayKey(deadline)) return deadline.toISOString();
    const d = due.exact ? new Date(`${due.exact}T23:59:00`) : new Date();
    if (!due.exact) { d.setDate(d.getDate() + due.days); d.setHours(23, 59, 0, 0); }
    return d.toISOString();
  };

  /** What the selection adds up to, so the round's weight is visible as it is built. */
  const selectedWorth = (() => {
    const flat = options?.roadmapSteps || [];
    const typed = points === '' ? null : Number(points);
    return steps.reduce((sum, id) => {
      const step = flat.find((sp) => sp.id === id);
      return sum + (typed ?? curve[String(step?.difficulty || 'medium') as keyof typeof curve] ?? curve.medium);
    }, 0);
  })();

  const customWorth = points === '' ? (curve[difficulty] ?? curve.medium) : Number(points) || 0;
  const assignTo = who === 'all' ? 'all' as const : null;

  const submit = async () => {
    const typedPoints = points === '' ? undefined : Number(points);
    if (typedPoints !== undefined && (!Number.isInteger(typedPoints) || typedPoints < 0)) {
      return toast.error('Points must be a whole number, or left blank to use the difficulty');
    }
    setBusy(true);
    try {
      if (source === 'roadmap') {
        if (!steps.length) { setBusy(false); return toast.error('Choose at least one roadmap step'); }
        const out = await poolApi.addRoadmapSteps(pool.id, {
          roadmapTaskIds: steps,
          required,
          levels,
          dueAt: dueAt(),
          // One typed number applies to every step chosen; left blank, each
          // step keeps its own difficulty's points.
          points: typedPoints === undefined ? undefined : Object.fromEntries(steps.map((id) => [id, typedPoints])),
          assignTo,
        });
        const { added, skipped, failed } = out.summary;
        if (added) toast.success(`${added} ${added === 1 ? 'piece' : 'pieces'} of work added${skipped ? ` · ${skipped} already there` : ''}`);
        else if (skipped) toast.info('Every step chosen was already part of this pool');
        if (failed) {
          const first = out.results.find((r) => r.result === 'failed');
          toast.error(`${failed} could not be added${first?.reason ? `: ${first.reason}` : ''}`);
        }
        if (!added && !skipped) { setBusy(false); return; }
      } else {
        const body: Record<string, unknown> = {
          required,
          levels,
          dueAt: dueAt(),
          points: typedPoints,
          assignTo: assignTo ?? undefined,
        };
        if (kind === 'task') {
          if (!title.trim()) { setBusy(false); return toast.error('Give the work a title'); }
          Object.assign(body, {
            kind, title: title.trim(), description: cleanHtml(description), type, difficulty,
            deliverable, acceptanceCriteria: criteria.map((c) => c.trim()).filter(Boolean),
          });
        } else if (kind === 'course') {
          if (!courseId) { setBusy(false); return toast.error('Choose a course'); }
          Object.assign(body, {
            kind, courseId, difficulty,
            title: title.trim() || undefined,
            description: cleanHtml(description) || undefined,
          });
        } else {
          if (!kitId) { setBusy(false); return toast.error(kind === 'quiz' ? 'Choose a quiz' : 'Choose an interview kit'); }
          Object.assign(body, {
            kind, kitId, title: title.trim() || undefined, description: cleanHtml(description) || undefined,
            ...(kind === 'quiz' ? { evaluationMode, allowRetake } : {}),
          });
        }
        const out = await poolApi.createAssignment(pool.id, body);
        const n = out?.assigned?.summary?.assigned;
        toast.success(n ? `Work created and given to ${n} candidate${n === 1 ? '' : 's'}` : 'Work created');
      }
      onDone();
      onClose();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not create the work'));
    } finally {
      setBusy(false);
    }
  };

  const cta = source === 'roadmap'
    ? steps.length ? `Add ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}` : 'Add work'
    : who === 'all' ? 'Add & give it out' : 'Add work';

  return (
    <Drawer
      open
      onClose={onClose}
      title="Add qualifying work"
      subtitle={`For the candidates in ${pool.name}`}
      width="lg"
      footer={(dismiss) => (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {source === 'roadmap'
              ? steps.length ? `Worth ${pts(selectedWorth)} in total` : 'Nothing chosen yet'
              : `Worth ${pts(customWorth)}`}
          </span>
          <div className="flex gap-2">
            <button onClick={dismiss} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
            <button onClick={submit} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {cta}
            </button>
          </div>
        </div>
      )}
    >
      <div className="space-y-5">
        {/* Where the work comes from. A roadmap first: most rounds reuse the curriculum. */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {([['roadmap', 'From a roadmap', Route], ['custom', 'Write one', FileText]] as const).map(([key, text, Icon]) => (
            <button key={key} type="button" onClick={() => setSource(key)} aria-pressed={source === key}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${source === key ? 'bg-card text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              <Icon className="h-4 w-4" />{text}
            </button>
          ))}
        </div>

        {source === 'roadmap' && (
          <RoadmapStepPicker
            roadmaps={options?.roadmaps}
            loading={optionsLoading}
            takenTaskIds={taken}
            selected={steps}
            onSelectedChange={setSteps}
            difficultyPoints={curve}
          />
        )}

        {source === 'custom' && (<>
          <div>
            <label htmlFor="pool-work-title" className="mb-1 block text-sm font-medium text-slate-700">
              Title {kind === 'task' ? <span className="text-red-500">*</span> : <span className="font-normal text-slate-400">(optional, defaults to the kit&apos;s name)</span>}
            </label>
            <input id="pool-work-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Build a small REST API" className={inputCls} />
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Type</span>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button key={t} type="button" onClick={() => pickType(t)} className={pill(type === t)} aria-pressed={type === t}>{TYPE_LABEL[t]}</button>
              ))}
            </div>
          </div>

          {kind === 'course' && (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:bg-emerald-500/5">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <GraduationCap className="h-4 w-4 text-emerald-600" />
                Edorax course <span className="text-red-500">*</span>
              </div>
              {optionsLoading ? (
                <div className="flex items-center gap-2 py-1 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin text-emerald-600" />Loading…</div>
              ) : !options?.coursesConnected ? (
                <p className="text-sm text-slate-500">Edorax is not connected for this workspace. An admin connects it in <span className="font-medium">Settings → Apps</span>.</p>
              ) : courses.length === 0 ? (
                <p className="text-sm text-slate-500">No courses are available to this workspace on Edorax yet.</p>
              ) : (
                <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={inputCls} aria-label="Edorax course">
                  <option value="">Select a course…</option>
                  {courses.map((c) => (
                    <option key={c.courseId} value={c.courseId} disabled={takenCourses.has(c.courseId)}>
                      {c.title}
                      {takenCourses.has(c.courseId) ? ' — already in this pool' : c.availableSeats !== null ? ` — ${c.availableSeats} seats left` : ''}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-[11px] text-slate-400">
                Assigning enrolls each candidate on Edorax. Nobody hands a course in: its score follows the progress Edorax reports, so finishing it earns the full points and stopping half way earns half.
              </p>
            </div>
          )}

          {(kind === 'quiz' || kind === 'interview') && (
            <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/50 p-4 dark:bg-brand-500/5">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                {kind === 'quiz' ? <ListChecks className="h-4 w-4 text-brand-600" /> : <Mic className="h-4 w-4 text-brand-600" />}
                {kind === 'quiz' ? 'Quiz' : 'Interview kit'} <span className="text-red-500">*</span>
              </div>
              {optionsLoading ? (
                <div className="flex items-center gap-2 py-1 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin text-brand-600" />Loading…</div>
              ) : kits.length === 0 ? (
                <p className="text-sm text-slate-500">No <span className="font-medium">published</span> {kind === 'quiz' ? 'quizzes' : 'interview kits'} to assign.</p>
              ) : (
                <select value={kitId} onChange={(e) => setKitId(e.target.value)} className={inputCls} aria-label={kind === 'quiz' ? 'Quiz' : 'Interview kit'}>
                  <option value="">{kind === 'quiz' ? 'Select a quiz…' : 'Select a kit…'}</option>
                  {kits.map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
                </select>
              )}
              {kind === 'quiz' && (<>
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-slate-600">How to grade</span>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['auto', 'Auto-grade', 'The score counts the moment they submit'],
                      ['review', 'Reviewer confirms', 'Auto-scored, but a reviewer confirms it'],
                    ] as const).map(([val, text, hint]) => (
                      <button key={val} type="button" onClick={() => setEvaluationMode(val)}
                        className={`rounded-lg border p-2.5 text-left ${evaluationMode === val ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 hover:border-slate-300'}`}>
                        <span className="block text-sm font-medium text-slate-800">{text}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-500">{hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex cursor-pointer items-start gap-2.5 pt-1">
                  <input type="checkbox" checked={allowRetake} onChange={(e) => setAllowRetake(e.target.checked)} className={checkboxCls} />
                  <span className="text-sm text-slate-700">Allow re-attempt<span className="block text-[11px] text-slate-400">Off = strict one-take</span></span>
                </label>
              </>)}
              <p className="text-[11px] text-slate-400">Only published {kind === 'quiz' ? 'quizzes' : 'kits'} with questions can be assigned.</p>
            </div>
          )}
        </>)}

        {/* The same timing control as the mentor drawer. A pool round does not repeat. */}
        <TaskTimingRow due={due} onDueChange={setDue} schedule={schedule} onScheduleChange={setSchedule} repeat={false} assigning={who === 'all'} />

        {source === 'custom' && (<>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Brief</label>
            <RichTextEditor content={description} onChange={setDescription} placeholder="Optional: what should they do?" minHeight="120px" />
          </div>

          {/* A course earns points too, and its difficulty is what they default from. */}
          {(kind === 'task' || kind === 'course') && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Difficulty</span>
              <div className="flex flex-wrap gap-1.5">
                {DIFFICULTIES.map((d) => (
                  <button key={d} type="button" onClick={() => setDifficulty(d)} className={`${pill(difficulty === d)} capitalize`} aria-pressed={difficulty === d}>
                    {d} <span className="font-normal opacity-60">· {curve[d] ?? curve.medium} pts</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {kind === 'task' && (<>
            <details className="rounded-xl border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">Deliverable &amp; checks <span className="font-normal text-muted-foreground">(optional)</span></summary>
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="pool-work-deliverable" className="mb-1 block text-sm font-medium text-slate-700">Deliverable</label>
                  <input id="pool-work-deliverable" value={deliverable} onChange={(e) => setDeliverable(e.target.value)} placeholder="What should they submit?" className={inputCls} />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">Acceptance criteria</span>
                    <button type="button" onClick={() => setCriteria((c) => [...c, ''])} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"><Plus className="h-3 w-3" /> Add check</button>
                  </div>
                  <div className="space-y-2">
                    {criteria.length === 0 && <p className="text-xs text-slate-400">No criteria yet. Add checks the candidate must meet, and reviewers tick them off.</p>}
                    {criteria.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={c} onChange={(e) => setCriteria((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                          placeholder={`Check ${i + 1}`} aria-label={`Acceptance criterion ${i + 1}`} className={inputCls} />
                        <button type="button" onClick={() => setCriteria((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove criterion" className="p-2 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          </>)}
        </>)}

        {/* What it is worth, and who gets it. */}
        <div className="space-y-4 rounded-xl border border-slate-200 p-4">
          <div>
            <label htmlFor="pool-work-points" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <Coins className="h-4 w-4 text-brand-600" />What finishing it is worth
            </label>
            <div className="flex items-center gap-2">
              <input
                id="pool-work-points"
                type="number"
                min={0}
                max={1000}
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                placeholder={source === 'roadmap' ? 'From each step’s difficulty' : String(curve[difficulty] ?? curve.medium)}
                className={`${inputCls} max-w-40`}
              />
              <span className="text-sm text-slate-500">points</span>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              {source === 'roadmap'
                ? 'Leave blank and each step is worth its own difficulty. A number here applies to every step chosen.'
                : 'Leave blank to use the difficulty above. A five-star review earns all of it; three stars earns three fifths.'}
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className={checkboxCls} />
            <span className="text-sm text-slate-700">Required<span className="block text-[11px] text-slate-400">Missing it is flagged on the shortlist</span></span>
          </label>

          {poolLevels.length > 0 && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Level <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {poolLevels.map((l) => (
                  <button key={l.key} type="button" onClick={() => toggleLevel(l.key)}
                    className={pill(levels.includes(l.key))} aria-pressed={levels.includes(l.key)}>
                    {l.label} <span className="font-normal opacity-60">· {levelCount(l.key)}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                {levels.length === 0
                  ? 'For everyone in the round, whatever level they applied at.'
                  : 'Only candidates who applied at the chosen levels get this; it is not counted against anyone else.'}
              </p>
            </div>
          )}

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Who gets it</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ['all', 'Every matching candidate', Users, 'The usual case: everyone the level allows'],
                ['later', 'Nobody yet', UserPlus, 'Add it now and choose people from the Work tab'],
              ] as const).map(([val, text, Icon, hint]) => (
                <button key={val} type="button" onClick={() => setWho(val)} aria-pressed={who === val}
                  className={`rounded-lg border p-2.5 text-left ${who === val ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/10' : 'border-slate-200 hover:border-slate-300'}`}>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800"><Icon className="h-3.5 w-3.5 text-brand-600" />{text}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">{hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

/** Re-pricing one piece of work in place, without a drawer for one number. */
function PointsField({ poolId, assignment, onDone, disabled }: { poolId: string; assignment: PoolAssignment; onDone: () => void; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(assignment.points));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 1000) return toast.error('Points must be a whole number from 0 to 1000');
    if (n === assignment.points) { setEditing(false); return; }
    setBusy(true);
    try {
      await poolApi.updateAssignment(poolId, assignment.id, { points: n });
      toast.success(`“${assignment.title}” is now worth ${pts(n)}`);
      setEditing(false);
      onDone();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not change the points'));
      setValue(String(assignment.points));
    } finally {
      setBusy(false);
    }
  };

  if (disabled) {
    return <Chip cls="bg-brand-50 text-brand-700 border-brand-200">{pts(assignment.points)}</Chip>;
  }
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setValue(String(assignment.points)); setEditing(true); }}
        title="Change what this is worth"
        className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 transition-colors hover:border-brand-400"
      >
        <Coins className="h-3 w-3" aria-hidden="true" /> {pts(assignment.points)}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={1000}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(false); }}
        aria-label={`Points for ${assignment.title}`}
        className="w-16 rounded-lg border border-brand-300 px-2 py-0.5 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <button type="button" onClick={save} disabled={busy} aria-label="Save points" className="rounded p-0.5 text-brand-600 hover:bg-brand-50 disabled:opacity-50">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}

export function WorkTab({ data, onChange, canAssign }: { data: PoolDashboard; onChange: () => void; canAssign: boolean }) {
  const { pool } = data;
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [giving, setGiving] = useState<PoolAssignment | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: assignments, loading, refetch } = useApiQuery({
    queryKey: qk.pool.assignments(pool.id),
    queryFn: () => poolApi.assignments(pool.id),
  });
  const reload = async () => { await refetch(); onChange(); };

  const giveToAll = async (a: PoolAssignment) => {
    setBusyId(a.id);
    try {
      const out = await poolApi.assign(pool.id, a.id);
      toast.success(`Given to ${out.summary.assigned} more candidate${out.summary.assigned === 1 ? '' : 's'} (${out.summary.skipped} already had it or are not active)`);
      await reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not assign the work'));
    } finally {
      setBusyId(null);
    }
  };
  const cancel = async (a: PoolAssignment) => {
    const ok = await confirm({ title: `Cancel “${a.title}”?`, description: 'It is withdrawn from everyone who has not finished it. Approved work stays.', confirmLabel: 'Cancel work' });
    if (!ok) return;
    try {
      await poolApi.cancelAssignment(pool.id, a.id);
      toast.success('Work cancelled');
      await reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not cancel the work'));
    }
  };

  const list = assignments || [];
  const live = list.filter((a) => !a.cancelledAt);
  // What a candidate who finishes everything would earn. Worth stating: it is
  // the denominator every score on the Shortlist tab is read against.
  const totalWorth = live.reduce((sum, a) => sum + a.points, 0);
  const requiredWorth = live.filter((a) => a.required).reduce((sum, a) => sum + a.points, 0);
  const editable = canAssign && pool.status !== 'closed';
  return (
    <div className="space-y-4">
      <section className={panel}>
        <PanelHeader
          icon={ClipboardList}
          title="Qualifying work"
          count={live.length}
          subtitle={live.length
            ? `Tasks, quizzes and interviews candidates complete to earn points. A perfect round is worth ${pts(totalWorth)}${requiredWorth !== totalWorth ? ` (${pts(requiredWorth)} of it required)` : ''}.`
            : 'Tasks, quizzes and interviews candidates complete to earn points.'}
          actions={editable && (
            <button onClick={() => setAdding(true)} className={primaryBtn}><Plus className="h-4 w-4" /> Add work</button>
          )}
        />
        {loading && <Spinner />}
        {!loading && list.length === 0 && (
          <div className="border-t border-border">
            <EmptyState icon={ClipboardList} title="No qualifying work yet" text="Open a roadmap and pick the steps this round should use, or write a custom task, a quiz or an interview." />
          </div>
        )}
        {list.length > 0 && (
          <ul className="divide-y divide-border border-t border-border">
            {list.map((a) => {
              const Icon = KIND_ICON[a.kind];
              const counts = a.counts || {};
              const total = Object.entries(counts).filter(([k]) => k !== 'cancelled').reduce((s, [, n]) => s + n, 0);
              const approved = counts.completed || 0;
              return (
                <li key={a.id} className={`p-5 transition-colors hover:bg-muted/40 sm:px-6 ${a.cancelledAt ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={`shrink-0 rounded-xl p-2 ${KIND_TONE[a.kind]}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{a.title}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="rounded-full bg-muted px-2 py-0.5 font-medium capitalize text-slate-600">{a.kind === 'task' ? (a.roadmapTask?.type || 'task').replace('_', ' ') : a.kind}</span>
                          <span className={`rounded-full px-2 py-0.5 font-medium ${a.required ? 'bg-brand-50 text-brand-700' : 'bg-muted text-slate-500'}`}>{a.required ? 'Required' : 'Optional'}</span>
                          <span className="inline-flex items-center gap-1 text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" /> Due {fmtDate(a.dueAt)}</span>
                          <PointsField poolId={pool.id} assignment={a} onDone={reload} disabled={!editable || Boolean(a.cancelledAt)} />
                        </div>
                      </div>
                    </div>
                    {a.cancelledAt ? <Chip cls="bg-slate-100 text-slate-500 border-slate-200">Cancelled</Chip> : editable && (
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => giveToAll(a)} disabled={busyId === a.id} className={secondaryBtn}>
                          {busyId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Give to everyone
                        </button>
                        {/* The half that was missing: this work, these people. */}
                        <button onClick={() => setGiving(a)} className={secondaryBtn}>
                          <Send className="h-4 w-4" /> Choose who
                        </button>
                        <button onClick={() => cancel(a)} title="Cancel this work" aria-label="Cancel this work" className={`${secondaryBtn} text-rose-600 hover:bg-rose-50`}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    )}
                  </div>
                  {total > 0 && (
                    <div className="mt-4 sm:pl-11">
                      <div className="flex items-center gap-3">
                        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          {Object.entries(WORK_STATUS).map(([k, v]) => (counts[k] ? <div key={k} className={v.dot} style={{ width: `${(counts[k] / total) * 100}%` }} /> : null))}
                        </div>
                        <span className="text-xs font-medium text-slate-600 tabular-nums">{approved}/{total} approved</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                        {Object.entries(WORK_STATUS).filter(([k]) => k !== 'not_started').map(([k, v]) => {
                          const n = k === 'assigned' ? (counts.assigned || 0) + (counts.not_started || 0) : counts[k];
                          return n ? <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${v.dot}`} /> {n} {v.label.toLowerCase()}</span> : null;
                        })}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {adding && <AddWorkDrawer data={data} onClose={() => setAdding(false)} onDone={reload} />}
      {giving && <AssignWorkDrawer data={data} assignment={giving} onClose={() => setGiving(null)} onDone={reload} />}
    </div>
  );
}
