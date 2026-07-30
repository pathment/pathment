'use client';

import { useEffect, useState } from 'react';
import { cohortApi } from '@/lib/services/intake-api';

interface LevelOpt { key: string; label: string }

/**
 * Picks which cohort levels a clan serves. Options come from the program's own
 * cohorts (levels are defined per cohort), unioned. A clan may serve several;
 * selecting none means "serves any level" — no level constraint at assign time.
 */
export function ClanLevelsField({
  programId, value, onChange,
}: {
  programId: string | null | undefined;
  value: string[];
  onChange: (levels: string[]) => void;
}) {
  const [opts, setOpts] = useState<LevelOpt[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!programId) { setOpts([]); return; }
    let alive = true;
    setLoading(true);
    cohortApi.list({ programId })
      .then((res: { data?: { cohorts?: { levels?: LevelOpt[] }[] } }) => {
        if (!alive) return;
        const byKey = new Map<string, string>();
        for (const c of res?.data?.cohorts ?? []) {
          for (const l of c.levels ?? []) if (l?.key) byKey.set(l.key, l.label || l.key);
        }
        setOpts([...byKey.entries()].map(([key, label]) => ({ key, label })));
      })
      .catch(() => { if (alive) setOpts([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [programId]);

  const toggle = (key: string) => {
    const set = new Set(value);
    set.has(key) ? set.delete(key) : set.add(key);
    onChange([...set]);
  };

  if (!programId) return <p className="text-xs text-slate-400">Pick a program first.</p>;
  if (loading) return <p className="text-xs text-slate-400">Loading levels…</p>;
  if (!opts.length) return <p className="text-xs text-slate-400">This program&apos;s cohorts have no levels — the clan will take candidates of any level.</p>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o) => {
        const on = value.includes(o.key);
        return (
          <button
            key={o.key} type="button" onClick={() => toggle(o.key)}
            className={`px-2.5 py-1 rounded-full text-xs border ${on ? 'border-brand-400 bg-brand-50 text-brand-700 font-medium' : 'border-slate-200 text-slate-600 hover:border-brand-300'}`}
          >
            {o.label}
          </button>
        );
      })}
      {!value.length && <span className="text-xs text-slate-400 self-center ml-1">none selected → serves any level</span>}
    </div>
  );
}
