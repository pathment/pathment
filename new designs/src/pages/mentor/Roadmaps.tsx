import { useState } from 'react';
import { Plus, Trash2, Download, ArrowRight, GitBranch, Users, Pencil } from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { Card, Badge, Button, Avatar, SectionLabel, cx, TASK_TYPE_LABEL } from '@/lib/ui';
import { Drawer, Field, TextInput, TextArea, SelectInput } from '@/components/overlays';
import { BulkAssignRoadmapDrawer } from '@/components/BulkAssignRoadmapDrawer';
import { useStore } from '@/store/AppStore';
import { EFFORT_META } from '@/lib/ai';
import type { Roadmap, RoadmapStep, TaskType, Effort } from '@/lib/types';

const TASK_TYPES: TaskType[] = ['assignment', 'project', 'quiz', 'reading', 'video', 'discussion'];
const EFFORTS: Effort[] = ['xs', 's', 'm', 'l'];

/* A draft step in the create form — string-typed inputs we coerce on save. */
interface DraftStep {
  title: string;
  type: TaskType;
  effort: Effort;
  dueOffsetDays: string;
}

function blankStep(): DraftStep {
  return { title: '', type: 'assignment', effort: 'm', dueOffsetDays: '7' };
}

export function Roadmaps() {
  const {
    roadmaps,
    roadmapProgress,
    mentees,
    getMentee,
    createRoadmap,
    updateRoadmap,
    deleteRoadmap,
    importRoadmap,
    assignRoadmap,
  } = useStore();

  // create/edit-roadmap drawer
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<DraftStep[]>([blankStep()]);

  // inline per-roadmap mentee picker: roadmapId -> selected menteeId (as string)
  const [picks, setPicks] = useState<Record<number, string>>({});
  // relative starting point: roadmapId -> step index (as string). Lets each
  // person join where they actually are in their journey, not always step 1.
  const [startAt, setStartAt] = useState<Record<number, string>>({});
  // fast bulk-assign drawer
  const [bulkFor, setBulkFor] = useState<Roadmap | null>(null);

  const local = roadmaps.filter((r) => r.source === 'local');
  const orgLibrary = roadmaps.filter((r) => r.source === 'org' && r.published);

  const resetCreate = () => {
    setName('');
    setDescription('');
    setSteps([blankStep()]);
  };

  const openCreate = () => {
    setEditingId(null);
    resetCreate();
    setCreateOpen(true);
  };

  const openEdit = (r: Roadmap) => {
    setEditingId(r.id);
    setName(r.name);
    setDescription(r.description ?? '');
    setSteps(
      r.steps.map((s) => ({
        title: s.title,
        type: s.type,
        effort: s.effort ?? 'm',
        dueOffsetDays: String(s.dueOffsetDays ?? 7),
      })),
    );
    setCreateOpen(true);
  };

  const addStep = () => setSteps((prev) => [...prev, blankStep()]);
  const removeStep = (idx: number) => setSteps((prev) => prev.filter((_, i) => i !== idx));
  const patchStep = (idx: number, patch: Partial<DraftStep>) =>
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const validSteps = steps.filter((s) => s.title.trim());
  const canSave = name.trim().length > 0 && validSteps.length > 0;

  const saveRoadmap = () => {
    if (!canSave) return;
    const built: RoadmapStep[] = validSteps.map((s, i) => {
      const due = parseInt(s.dueOffsetDays, 10);
      return {
        id: Date.now() + i,
        title: s.title.trim(),
        type: s.type,
        effort: s.effort,
        dueOffsetDays: Number.isFinite(due) ? due : undefined,
      };
    });
    if (editingId != null) {
      updateRoadmap(editingId, { name: name.trim(), description: description.trim(), steps: built });
    } else {
      createRoadmap(name.trim(), description.trim(), built);
    }
    setCreateOpen(false);
    setEditingId(null);
    resetCreate();
  };

  const assign = (roadmap: Roadmap) => {
    const raw = picks[roadmap.id];
    if (!raw) return;
    const start = parseInt(startAt[roadmap.id] ?? '0', 10) || 0;
    assignRoadmap(Number(raw), roadmap.id, start);
    setPicks((prev) => ({ ...prev, [roadmap.id]: '' }));
    setStartAt((prev) => ({ ...prev, [roadmap.id]: '0' }));
  };

  return (
    <Page>
      <PageHeader
        title="Roadmaps"
        subtitle="Guided sequences — assign relative to each person's journey; approving a step auto-assigns the next"
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> New roadmap
          </Button>
        }
      />

      {/* MY ROADMAPS */}
      <section className="mb-8">
        <SectionLabel>My roadmaps</SectionLabel>
        {local.length === 0 ? (
          <Card className="px-5 py-10 text-center text-sm text-ink-mute">
            No roadmaps yet. Create one, or import a published roadmap from your organization below.
          </Card>
        ) : (
          <div className="space-y-4">
            {local.map((r) => {
              const onIt = roadmapProgress.filter((p) => p.roadmapId === r.id);
              return (
                <Card key={r.id} className="p-0">
                  {/* header */}
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4 shrink-0 text-ink-mute" />
                        <span className="text-sm font-semibold text-ink">{r.name}</span>
                        <span className="font-mono text-[11px] text-ink-faint tnum">
                          {r.steps.length} steps
                        </span>
                      </div>
                      {r.description && (
                        <p className="mt-1 max-w-prose text-xs text-ink-mute">{r.description}</p>
                      )}
                      {r.skillTags && r.skillTags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {r.skillTags.map((t) => (
                            <Badge key={t}>{t}</Badge>
                          ))}
                        </div>
                      )}
                      {/* edit / delete this roadmap */}
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          onClick={() => openEdit(r)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => deleteRoadmap(r.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-ink-faint transition-colors hover:text-[#FF3B30]"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    </div>

                    {/* inline assign control — relative starting point per person */}
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex items-center gap-2">
                        <SelectInput
                          value={picks[r.id] ?? ''}
                          onChange={(e) => setPicks((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          className="w-40"
                          aria-label={`Assign ${r.name} to a mentee`}
                        >
                          <option value="">Assign to mentee…</option>
                          {mentees.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </SelectInput>
                        <Button variant="soft" onClick={() => assign(r)} disabled={!picks[r.id]}>
                          Assign
                        </Button>
                        <Button variant="outline" onClick={() => setBulkFor(r)} title="Assign to many mentees fast">
                          <Users className="h-4 w-4" /> Bulk
                        </Button>
                      </div>
                      {picks[r.id] && (
                        <label className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-faint">
                            Start at
                          </span>
                          <SelectInput
                            value={startAt[r.id] ?? '0'}
                            onChange={(e) => setStartAt((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            className="h-8 w-44 py-1 text-xs"
                            aria-label="Relative starting step"
                          >
                            {r.steps.map((s, idx) => (
                              <option key={s.id} value={idx}>
                                Step {idx + 1}: {s.title}
                              </option>
                            ))}
                          </SelectInput>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* steps */}
                  <ol className="divide-y divide-hairline">
                    {r.steps.map((s, i) => (
                      <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-r border border-hairline font-mono text-[11px] text-ink-mute tnum">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.title}</span>
                        <Badge>{TASK_TYPE_LABEL[s.type]}</Badge>
                        {s.effort && (
                          <span
                            title={EFFORT_META[s.effort].hint}
                            className="font-mono text-[11px] text-ink-faint"
                          >
                            {EFFORT_META[s.effort].label}
                          </span>
                        )}
                        {s.dueOffsetDays != null && (
                          <span className="font-mono text-[11px] text-ink-faint tnum">
                            +{s.dueOffsetDays}d
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>

                  {/* who's on it */}
                  {onIt.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline bg-neutral-50/60 px-5 py-3">
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                        On this roadmap
                      </span>
                      {onIt.map((p) => {
                        const m = getMentee(p.menteeId);
                        return (
                          <span key={p.menteeId} className="flex items-center gap-2">
                            <Avatar initials={m?.avatar ?? '?'} name={m?.name} size="xs" />
                            <span className="text-xs text-ink-soft">{m?.name ?? 'Mentee'}</span>
                            <span className="font-mono text-[11px] text-ink-faint tnum">
                              step {Math.min(p.currentStep + 1, r.steps.length)}/{r.steps.length}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ORG LIBRARY */}
      <section>
        <SectionLabel>Org library</SectionLabel>
        {orgLibrary.length === 0 ? (
          <Card className="px-5 py-10 text-center text-sm text-ink-mute">
            Your organization hasn&apos;t published any roadmaps yet.
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {orgLibrary.map((r) => (
              <Card key={r.id} className="flex flex-col p-0">
                <div className="border-b border-hairline px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Badge tone="brand">Org</Badge>
                    <span className="text-sm font-semibold text-ink">
                      {r.name.replace(/^Org:\s*/, '')}
                    </span>
                    <span className="font-mono text-[11px] text-ink-faint tnum">
                      {r.steps.length} steps
                    </span>
                  </div>
                  {r.description && <p className="mt-1 text-xs text-ink-mute">{r.description}</p>}
                  {r.skillTags && r.skillTags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.skillTags.map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </div>
                  )}
                </div>

                <ol className="scrollbar-thin max-h-52 flex-1 divide-y divide-hairline overflow-y-auto">
                  {r.steps.map((s, i) => (
                    <li key={s.id} className="flex items-center gap-3 px-5 py-2.5">
                      <span className="font-mono text-[11px] text-ink-faint tnum">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{s.title}</span>
                      <Badge>{TASK_TYPE_LABEL[s.type]}</Badge>
                    </li>
                  ))}
                </ol>

                <div className="flex items-center justify-between gap-2 border-t border-hairline bg-neutral-50/60 px-5 py-3">
                  <span className="text-[11px] text-ink-faint">
                    {r.steps.length} steps · published by your org
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => importRoadmap(r.id)}>
                      <Download className="h-3.5 w-3.5" /> Import
                    </Button>
                    <Button variant="soft" size="sm" onClick={() => setBulkFor(r)}>
                      <Users className="h-3.5 w-3.5" /> Assign
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* CREATE / EDIT ROADMAP DRAWER */}
      <Drawer
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setEditingId(null);
        }}
        title={editingId != null ? 'Edit roadmap' : 'New roadmap'}
        subtitle="Name it, then add an ordered list of steps."
        width="max-w-2xl"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setCreateOpen(false);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveRoadmap} disabled={!canSave}>
              <Plus className="h-4 w-4" /> {editingId != null ? 'Save changes' : 'Create roadmap'}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <Field label="Name">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Backend Foundations"
              autoFocus
            />
          </Field>
          <Field label="Description" hint="A one-line summary of what this path leads to.">
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="A guided path from HTTP basics to a deployed, auth-protected API."
            />
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                Steps
              </span>
              <span className="font-mono text-[11px] text-ink-faint tnum">
                {validSteps.length} ready
              </span>
            </div>

            <div className="space-y-3">
              {steps.map((s, idx) => (
                <div
                  key={idx}
                  className="rounded-r border border-hairline bg-white px-3 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-r border border-hairline font-mono text-[11px] text-ink-mute tnum">
                      {idx + 1}
                    </span>
                    <TextInput
                      value={s.title}
                      onChange={(e) => patchStep(idx, { title: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (idx === steps.length - 1) addStep();
                        }
                      }}
                      placeholder={`Step ${idx + 1} title`}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => removeStep(idx)}
                      disabled={steps.length === 1}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-r text-ink-faint transition-colors hover:bg-rose-50 hover:text-[#FF3B30] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-faint"
                      aria-label={`Remove step ${idx + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 pl-8">
                    <label className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-faint">
                        Type
                      </span>
                      <SelectInput
                        value={s.type}
                        onChange={(e) => patchStep(idx, { type: e.target.value as TaskType })}
                        className="h-8 w-36 py-1 text-xs"
                      >
                        {TASK_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {TASK_TYPE_LABEL[t]}
                          </option>
                        ))}
                      </SelectInput>
                    </label>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-faint">
                        Effort
                      </span>
                      <div className="flex gap-1">
                        {EFFORTS.map((e) => (
                          <button
                            key={e}
                            type="button"
                            onClick={() => patchStep(idx, { effort: e })}
                            title={EFFORT_META[e].hint}
                            className={cx(
                              'rounded-r border px-2 py-1 font-mono text-[11px] transition-colors',
                              s.effort === e
                                ? 'border-ink bg-ink text-white'
                                : 'border-hairline text-ink-mute hover:border-ink',
                            )}
                          >
                            {EFFORT_META[e].label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-faint">
                        Due
                      </span>
                      <TextInput
                        type="number"
                        min={0}
                        value={s.dueOffsetDays}
                        onChange={(e) => patchStep(idx, { dueOffsetDays: e.target.value })}
                        className="h-8 w-16 py-1 text-center font-mono text-xs tnum"
                      />
                      <span className="font-mono text-[11px] text-ink-faint">days</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addStep}
              className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs text-brand-600 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add step
            </button>
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            <ArrowRight className="h-3 w-3" />
            Assign this roadmap to a mentee and approving each step auto-assigns the next.
          </p>
        </div>
      </Drawer>

      {/* fast bulk assign — searchable, click-select, assign to many */}
      <BulkAssignRoadmapDrawer
        open={bulkFor !== null}
        onClose={() => setBulkFor(null)}
        roadmap={bulkFor}
      />
    </Page>
  );
}
