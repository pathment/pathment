import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  LayoutGrid,
  CalendarRange,
  ClipboardCheck,
  ShieldAlert,
  Settings as SettingsIcon,
  ListTodo,
  LineChart,
  Activity,
  Users,
  Plus,
  MessageSquare,
  Bell,
  CornerDownLeft,
  GitBranch,
  BookOpen,
  Rocket,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '@/store/AppStore';
import { Avatar, cx } from '@/lib/ui';

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
  group: string;
  keywords?: string;
}

/* Global ⌘K / Ctrl-K command palette — the universal "fewer clicks" entry.
   Jump anywhere, assign a task, log a 1:1, open any mentee, all from the keyboard. */
export function CommandPalette({
  onAssign,
  onLog1on1,
}: {
  onAssign: (menteeId?: number) => void;
  onLog1on1: (menteeId: number) => void;
}) {
  const navigate = useNavigate();
  const { mentees } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const commands = useMemo<Cmd[]>(() => {
    const nav = (label: string, to: string, icon: LucideIcon, group = 'Go to'): Cmd => ({
      id: to,
      label,
      icon,
      group,
      run: () => navigate(to),
    });
    const base: Cmd[] = [
      { id: 'assign', label: 'Assign a task…', icon: Plus, group: 'Actions', run: () => onAssign(), keywords: 'new create task' },
      nav('Cockpit', '/mentor/cockpit', LayoutGrid),
      nav('My Mentees', '/mentor/mentees', Users),
      nav('Cohort Review', '/mentor/review', CalendarRange),
      nav('Approvals', '/mentor/approvals', ClipboardCheck),
      nav('At-risk', '/mentor/at-risk', ShieldAlert),
      nav('Roadmaps', '/mentor/roadmaps', GitBranch),
      nav('Schedules', '/mentor/schedules', CalendarRange),
      nav('Library', '/mentor/library', BookOpen),
      nav('Mentor onboarding', '/mentor/onboarding', Rocket),
      nav('Settings', '/mentor/settings', SettingsIcon),
      nav('This Week (mentee)', '/mentee/this-week', ListTodo),
      nav('My Progress (mentee)', '/mentee/progress', LineChart),
      nav('Program Health (admin)', '/admin/health', Activity),
      nav('People (admin)', '/admin/people', Users),
      nav('Release Notes (admin)', '/admin/release-notes', Activity),
    ];
    const people: Cmd[] = mentees.flatMap((m) => [
      {
        id: `open-${m.id}`,
        label: m.name,
        hint: 'Open profile',
        icon: Users,
        group: 'Mentees',
        keywords: `${m.level} ${m.program}`,
        run: () => navigate(`/mentor/mentee/${m.id}`),
      },
      {
        id: `assign-${m.id}`,
        label: `Assign task to ${m.name}`,
        icon: Plus,
        group: 'Mentees',
        keywords: 'new task',
        run: () => onAssign(m.id),
      },
      {
        id: `1on1-${m.id}`,
        label: `Log 1:1 with ${m.name}`,
        icon: MessageSquare,
        group: 'Mentees',
        keywords: 'meeting note',
        run: () => onLog1on1(m.id),
      },
    ]);
    return [...base, ...people];
  }, [mentees, navigate, onAssign, onLog1on1]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands.slice(0, 11);
    return commands
      .filter((c) => (c.label + ' ' + (c.keywords ?? '')).toLowerCase().includes(s))
      .slice(0, 20);
  }, [q, commands]);

  const groups = useMemo(() => {
    const out: Record<string, Cmd[]> = {};
    filtered.forEach((c) => (out[c.group] ??= []).push(c));
    return out;
  }, [filtered]);

  const run = (c: Cmd) => {
    setOpen(false);
    c.run();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center p-4 pt-[10vh]">
      <div className="absolute inset-0 bg-ink/25 animate-fade-in" onClick={() => setOpen(false)} />
      <div className="rounded-r relative w-full max-w-2xl border border-hairline bg-white shadow-lift animate-scale-in">
        <div className="flex items-center gap-3 border-b border-hairline px-5">
          <Search className="h-5 w-5 text-ink-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, filtered.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
              if (e.key === 'Enter' && filtered[active]) run(filtered[active]);
            }}
            placeholder="Search or run a command…"
            className="h-16 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-faint"
          />
          <kbd className="rounded-r border border-hairline px-2 py-1 font-mono text-[11px] text-ink-faint">ESC</kbd>
        </div>

        <div className="scrollbar-thin max-h-[60vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-ink-faint">No matches.</p>
          ) : (
            Object.entries(groups).map(([group, cmds]) => (
              <div key={group} className="px-2">
                <div className="eyebrow px-3 pb-1 pt-3">{group}</div>
                {cmds.map((c) => {
                  const idx = filtered.indexOf(c);
                  return (
                    <button
                      key={c.id}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => run(c)}
                      className={cx(
                        'rounded-r flex w-full items-center gap-3.5 px-3 py-2.5 text-left text-[15px] transition-colors',
                        idx === active ? 'bg-neutral-100 text-ink' : 'text-ink-soft',
                      )}
                    >
                      {c.id.startsWith('open-') ? (
                        <Avatar initials={mentees.find((m) => `open-${m.id}` === c.id)?.avatar ?? '?'} size="sm" />
                      ) : (
                        <span className="grid h-8 w-8 shrink-0 place-items-center border border-hairline text-ink-mute">
                          <c.icon className="h-4 w-4" />
                        </span>
                      )}
                      <span className="flex-1 truncate">{c.label}</span>
                      {c.hint && <span className="text-xs text-ink-faint">{c.hint}</span>}
                      {idx === active && <CornerDownLeft className="h-4 w-4 text-ink-faint" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-hairline px-5 py-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          <span className="flex items-center gap-1"><Bell className="h-3 w-3" /> ⌘K to toggle</span>
          <span>↑↓ navigate</span>
          <span>↵ run</span>
        </div>
      </div>
    </div>
  );
}
