'use client';

import { useMemo, useState } from 'react';
import { Avatar } from '@/components/shared/Avatar';

export interface MenteeOption { id: string; name: string; profilePictureUrl?: string | null }

/** Choose mentees one by one or all at once. Select all follows the search. */
export function MenteePicker({ mentees, selected, onChange }: {
  mentees: MenteeOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? mentees.filter((m) => m.name.toLowerCase().includes(q)) : mentees;
  }, [mentees, query]);
  const allPicked = visible.length > 0 && visible.every((m) => selected.has(m.id));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };
  const toggleAll = () => {
    const next = new Set(selected);
    for (const m of visible) {
      if (allPicked) next.delete(m.id); else next.add(m.id);
    }
    onChange(next);
  };

  return (
    <div className="rounded-xl border border-border">
      <div className="border-b border-border p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the clan…"
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      {visible.length > 0 && (
        <label className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
          <input type="checkbox" checked={allPicked} onChange={toggleAll} className="accent-brand-600" />
          Select all ({visible.length})
        </label>
      )}
      <ul className="max-h-60 overflow-y-auto p-1">
        {!visible.length && (
          <li className="px-2 py-3 text-center text-xs text-muted-foreground">
            {query ? 'Nobody by that name' : 'Nobody to add'}
          </li>
        )}
        {visible.map((m) => (
          <li key={m.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
              <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} className="accent-brand-600" />
              <Avatar name={m.name} src={m.profilePictureUrl} size="xs" />
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
