import { useState, useMemo, useEffect } from 'react';
import { Search, Check, Users, CheckCircle2, GitBranch } from 'lucide-react';
import { Drawer, Field, SelectInput } from './overlays';
import { Avatar, Badge, Button, cx, RISK_META, RiskDot } from '@/lib/ui';
import { useStore } from '@/store/AppStore';
import type { Roadmap } from '@/lib/types';

/* Fast bulk roadmap assignment - searchable list, click-click-click to
   multi-select, select-all, pick a relative start step, assign in one shot. */
export function BulkAssignRoadmapDrawer({
  open,
  onClose,
  roadmap,
}: {
  open: boolean;
  onClose: () => void;
  roadmap: Roadmap | null;
}) {
  const { mentees, bulkAssignRoadmap, roadmapProgress } = useStore();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [startStep, setStartStep] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setQuery('');
      setPicked(new Set());
      setStartStep(0);
      setDone(false);
    }
  }, [open, roadmap?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mentees;
    return mentees.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.program.toLowerCase().includes(q) ||
        m.level.toLowerCase().includes(q),
    );
  }, [mentees, query]);

  if (!roadmap) return null;

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allFilteredSelected = filtered.length > 0 && filtered.every((m) => picked.has(m.id));
  const selectAllFiltered = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((m) => next.delete(m.id));
      else filtered.forEach((m) => next.add(m.id));
      return next;
    });

  const assign = () => {
    bulkAssignRoadmap([...picked], roadmap.id, startStep);
    setDone(true);
  };

  const alreadyOn = (id: number) =>
    roadmapProgress.some((p) => p.menteeId === id && p.roadmapId === roadmap.id);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-lg"
      title={
        <span className="inline-flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-ink-mute" /> Assign &ldquo;{roadmap.name}&rdquo;
        </span>
      }
      subtitle="Search, click to select, assign to as many mentees as you like"
      footer={
        !done ? (
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-ink-faint tnum">
              {picked.size} selected
            </span>
            <Button onClick={assign} disabled={picked.size === 0}>
              <Check className="h-4 w-4" /> Assign to {picked.size || 0}
            </Button>
          </div>
        ) : undefined
      }
    >
      {done ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="grid h-12 w-12 place-items-center border border-emerald-200 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-medium text-ink">Roadmap assigned.</p>
          <p className="mt-1 text-xs text-ink-mute">
            {picked.size} mentee{picked.size === 1 ? '' : 's'} now on &ldquo;{roadmap.name}&rdquo;
            {startStep > 0 ? `, from step ${startStep + 1}` : ''}.
          </p>
          <Button className="mt-4" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* relative starting step */}
          <Field label="Start everyone at" hint="Place mentees relative to their journey - not always step 1.">
            <SelectInput value={startStep} onChange={(e) => setStartStep(Number(e.target.value))}>
              {roadmap.steps.map((s, idx) => (
                <option key={s.id} value={idx}>
                  Step {idx + 1}: {s.title}
                </option>
              ))}
            </SelectInput>
          </Field>

          {/* search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              placeholder="Search mentees by name, level, program…"
              className="rounded-r h-10 w-full border border-hairline bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-400"
            />
          </div>

          {/* select-all bar */}
          <div className="flex items-center justify-between">
            <button
              onClick={selectAllFiltered}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline"
            >
              <Users className="h-3.5 w-3.5" />
              {allFilteredSelected ? 'Clear these' : `Select all ${filtered.length}`}
            </button>
            <span className="font-mono text-[11px] text-ink-faint tnum">{picked.size} selected</span>
          </div>

          {/* clickable mentee list */}
          <div className="space-y-1.5">
            {filtered.map((m) => {
              const on = picked.has(m.id);
              const risk = RISK_META[m.risk];
              const onRoadmap = alreadyOn(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className={cx(
                    'rounded-r flex w-full items-center gap-3 border px-3 py-2 text-left transition-colors',
                    on ? 'border-ink bg-neutral-50' : 'border-hairline hover:border-ink',
                  )}
                >
                  <span
                    className={cx(
                      'rounded-r grid h-5 w-5 shrink-0 place-items-center border',
                      on ? 'border-ink bg-ink text-white' : 'border-hairline text-transparent',
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <Avatar initials={m.avatar} name={m.name} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{m.name}</span>
                    <span className="block text-xs text-ink-mute">
                      {m.level} · {m.program}
                    </span>
                  </span>
                  {onRoadmap && <Badge tone="neutral">On it</Badge>}
                  <Badge tone={risk.tone}>
                    <RiskDot risk={m.risk} />
                    {risk.label}
                  </Badge>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-faint">No mentees match that.</p>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
