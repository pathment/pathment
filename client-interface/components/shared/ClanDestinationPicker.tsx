'use client';

import { useId, useMemo, useState } from 'react';
import { CalendarCheck, Check, Moon, Search, Sparkles, Star, Users, X } from 'lucide-react';

/**
 * Choose the clan someone moves into — any programme, standing clans included.
 *
 * The question an admin (or the mentee) actually has is not "which clans
 * exist" but "which of these is alive": are its mentors running the weekly
 * review? So every row says it, in words, next to the clan's own on/off
 * status. Suggestions lead; then the mentee's own programme; then the rest,
 * each programme under its name.
 */

export interface DestinationOption {
  id: string;
  name: string;
  kind?: 'cohort' | 'standing';
  status?: string;
  programId: string | null;
  programName: string | null;
  mentor: string | null;
  mentees: number;
  reviewWeeks?: number;
  lastReviewAt?: string | null;
  activity?: 'regular' | 'irregular' | 'none';
  sameProgram?: boolean;
  preferred?: boolean;
  /** "Continues <closed clan>": the standing clan a closed one became. */
  continues?: string | null;
  suggested?: boolean;
}

export function ClanDestinationPicker({
  clans,
  value,
  onChange,
  preferredLabel = 'Their preference',
}: {
  clans: DestinationOption[];
  value: string;
  onChange: (clan: DestinationOption) => void;
  preferredLabel?: string;
}) {
  const [query, setQuery] = useState('');
  const searchId = useId();

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = q
      ? clans.filter((c) => `${c.name} ${c.programName || ''} ${c.mentor || ''}`.toLowerCase().includes(q))
      : clans;
    const top = q ? [] : shown.filter((c) => c.preferred || c.suggested);
    const topIds = new Set(top.map((c) => c.id));
    const rest = shown.filter((c) => !topIds.has(c.id));
    // Own programme first, then the others by name, each in the order given (already ranked).
    const byProgram = new Map<string, { name: string; own: boolean; clans: DestinationOption[] }>();
    for (const c of rest) {
      const key = c.programId || 'none';
      if (!byProgram.has(key)) byProgram.set(key, { name: c.programName || 'Other', own: !!c.sameProgram, clans: [] });
      byProgram.get(key)!.clans.push(c);
    }
    const programs = [...byProgram.values()].sort((a, b) => Number(b.own) - Number(a.own) || a.name.localeCompare(b.name));
    return { top, programs, empty: shown.length === 0 };
  }, [clans, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">Search clans</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          id={searchId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${clans.length} clans, programs or mentors…`}
          className="w-full rounded-xl border border-slate-200 bg-card py-2.5 pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div role="radiogroup" aria-label="Destination clan" className="max-h-[22rem] space-y-4 overflow-y-auto pr-1">
        {groups.empty && <p className="py-6 text-center text-sm text-slate-500">No clan matches “{query}”.</p>}
        {groups.top.length > 0 && (
          <Group title="Suggested" icon={<Sparkles className="h-3.5 w-3.5 text-brand-600" />}>
            {groups.top.map((c) => <Row key={c.id} clan={c} selected={value === c.id} onPick={onChange} preferredLabel={preferredLabel} />)}
          </Group>
        )}
        {groups.programs.map((g) => (
          <Group key={g.name} title={g.own ? `${g.name} · their program` : g.name}>
            {g.clans.map((c) => <Row key={c.id} clan={c} selected={value === c.id} onPick={onChange} preferredLabel={preferredLabel} />)}
          </Group>
        ))}
      </div>
    </div>
  );
}

function Group({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{icon}{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ clan: c, selected, onPick, preferredLabel }: {
  clan: DestinationOption; selected: boolean; onPick: (c: DestinationOption) => void; preferredLabel: string;
}) {
  const inactive = c.status === 'inactive';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onPick(c)}
      className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        selected ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/30' : 'border-slate-200 bg-card hover:border-brand-300 hover:bg-slate-50'
      }`}
    >
      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300'}`}>
        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-slate-900">{c.name}</span>
          {c.kind === 'standing' && <Chip tone="bg-sky-50 text-sky-700">Standing</Chip>}
          {inactive && <Chip tone="bg-slate-100 text-slate-600"><Moon className="h-3 w-3" />Inactive</Chip>}
          {c.preferred && <Chip tone="bg-violet-100 text-violet-700"><Star className="h-3 w-3" />{preferredLabel}</Chip>}
          {c.continues && <Chip tone="bg-emerald-50 text-emerald-700">Continues {c.continues}</Chip>}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {c.activity && <Activity clan={c} />}
          <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{c.mentees} mentee{c.mentees === 1 ? '' : 's'}</span>
          {c.mentor && <span className="truncate">Lead: {c.mentor}</span>}
        </span>
      </span>
    </button>
  );
}

/** Whether its mentors are holding the weekly review — the thing that makes a clan worth joining. */
function Activity({ clan: c }: { clan: DestinationOption }) {
  const weeks = c.reviewWeeks ?? 0;
  const last = c.lastReviewAt ? ago(c.lastReviewAt) : null;
  if (c.activity === 'none') {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-rose-600" title={last ? `Last review ${last}` : 'No review on record'}>
        <CalendarCheck className="h-3 w-3" />No reviews in 4 weeks{last ? ` · last one ${last}` : ''}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${c.activity === 'regular' ? 'text-emerald-700' : 'text-amber-700'}`}>
      <CalendarCheck className="h-3 w-3" />Reviews {weeks} of last 4 weeks{last ? ` · ${last}` : ''}
    </span>
  );
}

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{children}</span>;
}

function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return `${Math.round(days / 7)} weeks ago`;
}
