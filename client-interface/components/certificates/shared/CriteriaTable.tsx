'use client';

import { Edit, Trash, Plus, GripVertical } from 'lucide-react';
import { useRef, useState } from 'react';

interface TierCriteria {
  id: string;
  name: string;
  priority?: number;
  badgeUrl?: string;
  keywords?: string[] | null;
  minScorePercent?: number | null;
  maxOpenBlockers?: number | null;
  minCompletionRate?: number | null;
  minOnTimeRate?: number | null;
  minAvgRating?: number | null;
  minAttendanceRate?: number | null;
  customRule?: string | null;
}

interface CriteriaTableProps {
  criteria: TierCriteria[];
  onAdd: () => void;
  onEdit: (tier: TierCriteria) => void;
  onDelete: (tierId: string) => void;
  onReorder?: (reordered: TierCriteria[]) => void;
}

const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
const RANK_COLORS = [
  'bg-amber-400/15 text-amber-600 dark:text-amber-400 border-amber-400/30',
  'bg-slate-400/15 text-slate-600 dark:text-slate-300 border-slate-400/30',
  'bg-orange-400/15 text-orange-600 dark:text-orange-400 border-orange-400/30',
  'bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/20',
];

export function CriteriaTable({ criteria, onAdd, onEdit, onDelete, onReorder }: CriteriaTableProps) {
  const draggedIdx  = useRef<number | null>(null);
  const dragOverIdx = useRef<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const handleDragStart = (idx: number) => {
    draggedIdx.current = idx;
    setDragging(idx);
  };

  const handleDragEnter = (idx: number) => {
    dragOverIdx.current = idx;
  };

  const handleDragEnd = () => {
    if (
      onReorder &&
      draggedIdx.current !== null &&
      dragOverIdx.current !== null &&
      draggedIdx.current !== dragOverIdx.current
    ) {
      const next = [...criteria];
      const [moved] = next.splice(draggedIdx.current, 1);
      next.splice(dragOverIdx.current, 0, moved);
      onReorder(next.map((t, i) => ({ ...t, priority: i + 1 })));
    }
    draggedIdx.current  = null;
    dragOverIdx.current = null;
    setDragging(null);
  };

  return (
    <div className="bg-card border border-border rounded-3xl p-6 shadow-xs space-y-5">
      {}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-start gap-3.5">
          <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center font-bold text-brand-500 text-sm">
            2
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Certificate Criteria</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Drag to reorder tiers — top row is the <strong>best</strong> certificate. Define AI evaluation keywords and hard-constraint rules per tier.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline bg-brand-500/5 hover:bg-brand-500/10 px-3.5 py-2 rounded-xl transition-all"
        >
          <Plus className="w-4 h-4" /> Add Certificate Type
        </button>
      </div>

      {}
      <div className="border border-border rounded-2xl overflow-hidden bg-muted/10 divide-y divide-border">
        {}
        <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-muted/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          <div className="col-span-1" />
          <div className="col-span-4">Certificate Type</div>
          <div className="col-span-5">Criteria Summary</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {}
        {criteria.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground font-semibold">
            No certificate types configured. Click &quot;+ Add Certificate Type&quot; to begin.
          </div>
        ) : (
          criteria.map((tier, idx) => {
            const kws            = tier.keywords || [];
            const parts: string[] = [];
            if (kws.length > 0)                      parts.push(`Keywords: ${kws.slice(0, 3).join(', ')}${kws.length > 3 ? ` +${kws.length - 3}` : ''}`);
            if (tier.minScorePercent != null)        parts.push(`Score ≥${tier.minScorePercent}%`);
            if (tier.maxOpenBlockers != null)        parts.push(`Blockers ≤${tier.maxOpenBlockers}`);
            if (tier.minCompletionRate != null)      parts.push(`Completion ≥${tier.minCompletionRate}%`);
            if (tier.minOnTimeRate != null)          parts.push(`On-Time ≥${tier.minOnTimeRate}%`);
            if (tier.minAvgRating != null)           parts.push(`Rating ≥${tier.minAvgRating}`);
            if (tier.minAttendanceRate != null)      parts.push(`Attendance ≥${tier.minAttendanceRate}%`);

            const summaryText = parts.length > 0
              ? parts.join(' · ')
              : 'Awarded to all active participants (no minimum requirements)';

            const rankLabel = RANK_LABELS[idx] ?? `${idx + 1}th`;
            const rankColor = RANK_COLORS[idx] ?? RANK_COLORS[RANK_COLORS.length - 1];
            const isDraggingThis = dragging === idx;

            return (
              <div
                key={tier.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragEnter={() => handleDragEnter(idx)}
                onDragEnd={handleDragEnd}
                onDragOver={e => e.preventDefault()}
                className={`grid grid-cols-12 gap-4 px-6 py-4 items-center text-xs font-semibold text-foreground bg-card hover:bg-muted/10 transition-colors select-none ${isDraggingThis ? 'opacity-40 scale-[0.99]' : ''}`}
              >
                {}
                <div className="col-span-1 flex items-center gap-1.5">
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground cursor-grab active:cursor-grabbing shrink-0" />
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${rankColor}`}>
                    {rankLabel}
                  </span>
                </div>

                {}
                <div className="col-span-4 flex items-center gap-2">
                  {tier.badgeUrl ? (
                    <img src={tier.badgeUrl} className="w-7 h-7 object-contain rounded-md" alt={tier.name} />
                  ) : (
                    <div className="w-7 h-7 rounded-md bg-brand-500/10 flex items-center justify-center font-bold text-brand-500 text-[10px]">
                      {tier.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="font-bold text-foreground">{tier.name}</span>
                </div>

                {}
                <div className="col-span-5 text-muted-foreground text-[11px] font-medium leading-relaxed">
                  {summaryText}
                </div>

                {}
                <div className="col-span-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => onEdit(tier)}
                    className="p-1 text-muted-foreground hover:text-brand-500 hover:bg-muted rounded transition-colors"
                    title="Edit Criteria"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(tier.id)}
                    className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                    title="Delete Tier"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
