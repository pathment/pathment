'use client';

import { CheckCircle2, Clock, Award } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { ResourceLink } from '@/components/shared/ResourceLink';
import type { LinearRoadmap } from '@/lib/hooks/mentor';
import { pointsForDifficulty } from '@/lib/config/points';

const TYPE_CLS = 'px-2 py-0.5 rounded bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300 text-[11px] font-medium capitalize';
const DIFF_CLS: Record<string, string> = {
  easy: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  medium: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  hard: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300',
  expert: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
};

/** Read-only viewer for every step in a roadmap — full detail without entering
 *  edit mode. Works for org (pre-import) and local (post-import) roadmaps. */
export function RoadmapStepsDrawer({ roadmap, onClose }: { roadmap: LinearRoadmap; onClose: () => void }) {
  return (
    <Drawer open onClose={onClose} title={roadmap.name} subtitle={`${roadmap.steps.length} step${roadmap.steps.length === 1 ? '' : 's'} · read-only`} width="lg">
      <div className="space-y-4">
        {roadmap.steps.length === 0 && <p className="text-sm text-slate-500">This roadmap has no steps yet.</p>}
        {roadmap.steps.map((s, i) => {
          const isHtml = s.description ? /<[a-z][\s\S]*>/i.test(s.description) : false;
          return (
            <div key={s.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-400 tabular-nums">{i + 1}.</span>
                <h3 className="text-sm font-semibold text-slate-900 flex-1 min-w-0">{s.title}</h3>
                {s.type && <span className={TYPE_CLS}>{s.type}</span>}
                {s.difficulty && <span className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize ${DIFF_CLS[s.difficulty] || 'bg-slate-100 text-slate-600'}`}>{s.difficulty}</span>}
              </div>

              {s.description && (isHtml
                ? <div className="prose prose-sm max-w-none dark:prose-invert text-slate-600 dark:text-slate-300 mt-2" dangerouslySetInnerHTML={{ __html: s.description }} />
                : <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{s.description}</p>)}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                {s.effort && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />effort {s.effort}</span>}
                {s.dueOffsetDays != null && <span>due +{s.dueOffsetDays}d</span>}
                <span className="inline-flex items-center gap-1"><Award className="w-3.5 h-3.5" />{pointsForDifficulty(s.difficulty)} pts</span>
              </div>

              {s.deliverable && (
                <div className="mt-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 px-3 py-2">
                  <p className="text-[11px] font-medium text-blue-900 dark:text-blue-300">Deliverable</p>
                  <p className="text-sm text-blue-800 dark:text-blue-200">{s.deliverable}</p>
                </div>
              )}

              {!!s.acceptanceCriteria?.length && (
                <div className="mt-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1">Acceptance criteria</p>
                  <ul className="space-y-1">
                    {s.acceptanceCriteria.map((c, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-slate-700"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!!s.resources?.length && (
                <div className="mt-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1">Resources</p>
                  <ul className="space-y-1">
                    {s.resources.map((r, idx) => (
                      <ResourceLink key={idx} url={r.url} title={r.title} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}
