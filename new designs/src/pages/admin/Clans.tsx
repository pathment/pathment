import { useMemo, useState } from 'react';
import {
  Plus,
  Users,
  Hash,
  ArrowUpRight,
  Layers,
  MessageSquare,
} from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { useStore } from '@/store/AppStore';
import { Modal, Field, TextInput, SelectInput } from '@/components/overlays';
import { Avatar, Badge, Button, Card, SectionLabel, cx } from '@/lib/ui';

/* ----------------------------------------------------------------
   taxonomy — technology + level
----------------------------------------------------------------- */
const TECHS = ['Frontend', 'Backend', 'Data', 'Mobile', 'DevOps', 'Design'] as const;
type Tech = (typeof TECHS)[number];

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;
type Level = (typeof LEVELS)[number];

const TECH_TONE: Record<Tech, 'brand' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet'> = {
  Frontend: 'brand',
  Backend: 'sky',
  Data: 'violet',
  Mobile: 'emerald',
  DevOps: 'amber',
  Design: 'rose',
};

const LEVEL_TONE: Record<Level, 'neutral' | 'sky' | 'violet'> = {
  Beginner: 'neutral',
  Intermediate: 'sky',
  Advanced: 'violet',
};

const STATUS_DOT: Record<'green' | 'amber' | 'red', string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-[#FF3B30]',
};

/* ----------------------------------------------------------------
   community shape
----------------------------------------------------------------- */
interface Community {
  handle: string;
  members: number;
  lastActivity: string;
}

interface Clan {
  id: number;
  name: string;
  tech: Tech;
  level: Level;
  leader: string;
  leaderAvatar: string;
  members: number;
  status: 'green' | 'amber' | 'red';
  program: string;
  communities: Community[];
}

/* deterministic enrichment for store clans, keyed by program name */
const TECH_BY_PROGRAM: Record<string, Tech> = {
  'Full-Stack Web Development': 'Frontend',
  'Data Analytics Foundations': 'Data',
  'Product Design Track': 'Design',
  'Cloud & DevOps': 'DevOps',
  'Mobile Engineering': 'Mobile',
};

const COMMUNITIES_BY_TECH: Record<Tech, Community[]> = {
  Frontend: [
    { handle: '#frontend-help', members: 142, lastActivity: '12m ago' },
    { handle: '#showcase', members: 88, lastActivity: '1h ago' },
    { handle: '#interview-prep', members: 64, lastActivity: '3h ago' },
  ],
  Backend: [
    { handle: '#backend-help', members: 96, lastActivity: '20m ago' },
    { handle: '#system-design', members: 71, lastActivity: '2h ago' },
  ],
  Data: [
    { handle: '#data-help', members: 73, lastActivity: '45m ago' },
    { handle: '#sql-clinic', members: 51, lastActivity: '4h ago' },
  ],
  Mobile: [
    { handle: '#mobile-help', members: 58, lastActivity: '1h ago' },
    { handle: '#showcase', members: 39, lastActivity: '6h ago' },
  ],
  DevOps: [
    { handle: '#devops-help', members: 44, lastActivity: '30m ago' },
    { handle: '#on-call-stories', members: 27, lastActivity: '1d ago' },
  ],
  Design: [
    { handle: '#design-crit', members: 67, lastActivity: '18m ago' },
    { handle: '#portfolio-review', members: 49, lastActivity: '5h ago' },
  ],
};

/* a small picker so each store clan lands on a sensible level */
function levelForClan(id: number, completion: number): Level {
  if (completion >= 75) return 'Advanced';
  if (completion >= 55) return 'Intermediate';
  // fall back on id parity so it is not all one bucket
  return id % 2 === 0 ? 'Intermediate' : 'Beginner';
}

/* extra local-only clans so the catalog reads rich */
const EXTRA_CLANS: Clan[] = [
  {
    id: 9001,
    name: 'Orion Clan',
    tech: 'Backend',
    level: 'Advanced',
    leader: 'Hassan Ali',
    leaderAvatar: 'HA',
    members: 19,
    status: 'green',
    program: 'Backend Deep-Dive',
    communities: COMMUNITIES_BY_TECH.Backend,
  },
  {
    id: 9002,
    name: 'Lyra Clan',
    tech: 'Frontend',
    level: 'Beginner',
    leader: 'Mei Lin',
    leaderAvatar: 'ML',
    members: 27,
    status: 'amber',
    program: 'Intro to React',
    communities: COMMUNITIES_BY_TECH.Frontend,
  },
  {
    id: 9003,
    name: 'Draco Clan',
    tech: 'Data',
    level: 'Advanced',
    leader: 'Omar Farouk',
    leaderAvatar: 'OF',
    members: 14,
    status: 'green',
    program: 'Machine Learning Foundations',
    communities: COMMUNITIES_BY_TECH.Data,
  },
];

type TechFilter = 'All' | Tech;
type LevelFilter = 'All' | Level;

export function Clans() {
  const { programs } = useStore();
  const [techFilter, setTechFilter] = useState<TechFilter>('All');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('All');
  const [creating, setCreating] = useState(false);
  const [extra, setExtra] = useState<Clan[]>(EXTRA_CLANS);

  // merge store clans (enriched) + local extras
  const catalog = useMemo<Clan[]>(() => {
    const fromStore: Clan[] = programs.map((p) => {
      const tech = TECH_BY_PROGRAM[p.program ?? ''] ?? 'Frontend';
      return {
        id: p.id,
        name: p.name,
        tech,
        level: levelForClan(p.id, p.completion),
        leader: p.leader ?? 'Unassigned',
        leaderAvatar: p.leaderAvatar ?? (p.leader ? p.leader.slice(0, 2) : 'NA'),
        members: p.cohortSize,
        status: p.status,
        program: p.program ?? '',
        communities: COMMUNITIES_BY_TECH[tech],
      };
    });
    return [...fromStore, ...extra];
  }, [programs, extra]);

  const visible = useMemo(
    () =>
      catalog.filter(
        (c) =>
          (techFilter === 'All' || c.tech === techFilter) &&
          (levelFilter === 'All' || c.level === levelFilter),
      ),
    [catalog, techFilter, levelFilter],
  );

  // active communities rolled up across the visible catalog, de-duplicated by
  // handle, members summed, most-recent activity kept (already string-sorted by
  // catalog order so the first occurrence is freshest enough for the preview).
  const communityRollup = useMemo(() => {
    const map = new Map<string, { handle: string; members: number; lastActivity: string; clans: number }>();
    for (const c of visible) {
      for (const comm of c.communities) {
        const found = map.get(comm.handle);
        if (found) {
          found.members += comm.members;
          found.clans += 1;
        } else {
          map.set(comm.handle, { ...comm, clans: 1 });
        }
      }
    }
    return [...map.values()].sort((a, b) => b.members - a.members);
  }, [visible]);

  const totalMembers = useMemo(
    () => visible.reduce((sum, c) => sum + c.members, 0),
    [visible],
  );

  const addClan = (input: { name: string; tech: Tech; level: Level }) => {
    setExtra((prev) => [
      {
        id: Date.now(),
        name: input.name,
        tech: input.tech,
        level: input.level,
        leader: 'Unassigned',
        leaderAvatar: 'NA',
        members: 0,
        status: 'green',
        program: `${input.tech} track`,
        communities: COMMUNITIES_BY_TECH[input.tech],
      },
      ...prev,
    ]);
    setCreating(false);
  };

  return (
    <Page>
      <PageHeader
        title="Clans & communities"
        subtitle={`Specialized clans organized by technology and level · ${catalog.length} clans, ${totalMembers} members in view`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New specialized clan
          </Button>
        }
      />

      {creating && (
        <NewClanModal onClose={() => setCreating(false)} onCreate={addClan} />
      )}

      {/* filters */}
      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FilterRow
            label="Technology"
            options={['All', ...TECHS]}
            value={techFilter}
            onChange={(v) => setTechFilter(v as TechFilter)}
          />
          <FilterRow
            label="Level"
            options={['All', ...LEVELS]}
            value={levelFilter}
            onChange={(v) => setLevelFilter(v as LevelFilter)}
          />
        </div>
      </Card>

      <div className="mt-4 text-xs text-ink-mute">
        Showing {visible.length} of {catalog.length} clans
      </div>

      {/* clan grid */}
      {visible.length === 0 ? (
        <Card className="mt-4 grid place-items-center py-20 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-r border border-hairline text-ink-faint">
            <Layers className="h-6 w-6" />
          </span>
          <p className="mt-4 text-base font-medium text-ink">No clans match those filters.</p>
          <p className="mt-1 text-sm text-ink-mute">Try a different technology or level.</p>
        </Card>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {visible.map((c) => (
            <ClanCard key={c.id} c={c} />
          ))}
        </div>
      )}

      {/* communities roll-up */}
      <section className="mt-10">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <SectionLabel>Active communities</SectionLabel>
            <p className="-mt-2 text-xs text-ink-mute">
              Sub-communities across clans in view, busiest first.
            </p>
          </div>
          <Badge tone="brand">{communityRollup.length} channels</Badge>
        </div>

        {communityRollup.length === 0 ? (
          <Card className="grid place-items-center py-12 text-center">
            <p className="text-sm text-ink-mute">No communities in this view.</p>
          </Card>
        ) : (
          <Card className="divide-y divide-neutral-100 p-0">
            {communityRollup.map((comm) => (
              <div
                key={comm.handle}
                className="flex flex-wrap items-center gap-3 px-5 py-3.5"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-r border border-hairline text-ink-mute">
                  <Hash className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-sm font-medium text-ink">
                    {comm.handle}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-mute">
                    Active in {comm.clans} clan{comm.clans > 1 ? 's' : ''}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-mute">
                  <Users className="h-3.5 w-3.5 text-ink-faint" />
                  <span className="font-mono font-medium text-ink tnum">{comm.members}</span>
                  members
                </span>
                <span className="font-mono text-[11px] tnum text-ink-faint">
                  {comm.lastActivity}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </Page>
  );
}

/* ----------------------------------------------------------------
   one technology / level filter row
----------------------------------------------------------------- */
function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="eyebrow mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value === o;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              className={cx(
                'rounded-r border px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'border-ink bg-ink text-white'
                  : 'border-hairline bg-white text-ink-soft hover:border-ink hover:text-ink',
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   one clan card
----------------------------------------------------------------- */
function ClanCard({ c }: { c: Clan }) {
  return (
    <Card className="animate-slide-in flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cx('h-2.5 w-2.5 rounded-r', STATUS_DOT[c.status])} />
            <h3 className="truncate font-semibold text-ink">{c.name}</h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={TECH_TONE[c.tech]}>{c.tech}</Badge>
            <Badge tone={LEVEL_TONE[c.level]}>{c.level}</Badge>
          </div>
          {c.program && (
            <div className="mt-1.5 truncate text-xs text-ink-mute">{c.program}</div>
          )}
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-mute">
          <Users className="h-3.5 w-3.5 text-ink-faint" />
          <span className="font-mono font-medium text-ink tnum">{c.members}</span>
        </span>
      </div>

      {/* leader */}
      <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-mute">
        <Avatar initials={c.leaderAvatar} name={c.leader} size="xs" />
        <span>Led by {c.leader}</span>
      </div>

      {/* communities */}
      <div className="mt-4 border-t border-neutral-100 pt-3">
        <div className="eyebrow mb-2">Communities</div>
        <div className="flex flex-wrap gap-1.5">
          {c.communities.map((comm) => (
            <span
              key={comm.handle}
              className="inline-flex items-center gap-1 rounded-r border border-hairline bg-white px-1.5 py-0.5 font-mono text-[11px] text-ink-soft"
            >
              <Hash className="h-3 w-3 text-ink-faint" />
              {comm.handle.replace('#', '')}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
          <MessageSquare className="h-3.5 w-3.5" />
          {c.communities.length} sub-communit{c.communities.length > 1 ? 'ies' : 'y'}
        </span>
        <Button variant="soft" size="sm">
          Join community <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------
   new specialized clan modal
----------------------------------------------------------------- */
function NewClanModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { name: string; tech: Tech; level: Level }) => void;
}) {
  const [name, setName] = useState('');
  const [tech, setTech] = useState<Tech>('Frontend');
  const [level, setLevel] = useState<Level>('Beginner');
  const valid = name.trim().length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title="New specialized clan"
      subtitle="Organize a clan by technology and level, with its own communities."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => onCreate({ name: name.trim(), tech, level })}
          >
            <Plus className="h-4 w-4" /> Create clan
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Clan name">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Hydra Clan"
            autoFocus
          />
        </Field>
        <Field label="Technology">
          <SelectInput value={tech} onChange={(e) => setTech(e.target.value as Tech)}>
            {TECHS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Level">
          <SelectInput value={level} onChange={(e) => setLevel(e.target.value as Level)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>
    </Modal>
  );
}
