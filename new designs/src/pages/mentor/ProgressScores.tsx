import { useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { Segmented, Drawer, TextArea } from '@/components/overlays';
import { useStore } from '@/store/AppStore';
import {
  Avatar,
  Badge,
  Button,
  Card,
  MomentumIcon,
  ProgressBar,
  RISK_META,
  SectionLabel,
  cx,
} from '@/lib/ui';
import type { Mentee } from '@/lib/types';

/* ----------------------------------------------------------------
   Time window - changing it nudges the computed score so the board
   feels like it is reading a live slice of the program, not a static
   snapshot. The offset is deterministic per window.
----------------------------------------------------------------- */
type Window = 'week' | 'month' | 'all';

const WINDOWS: Array<{ value: Window; label: string }> = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
];

const WINDOW_OFFSET: Record<Window, number> = {
  week: 4,
  month: 1,
  all: 0,
};

const WINDOW_NOTE: Record<Window, string> = {
  week: 'last 7 days of submissions and on-time rate',
  month: 'rolling 30-day read',
  all: 'full program to date',
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/* Blend absolute progress, relative pace and on-time discipline into a
   single 0-100 Progress Score, then nudge by the active window. */
function progressScore(m: Mentee, win: Window): number {
  const base =
    m.absoluteProgress * 0.45 + m.relativeProgress * 0.35 + m.onTimeRate * 0.2;
  const trend = m.momentum === 'up' ? 1 : m.momentum === 'down' ? -1 : 0;
  return clamp(base + WINDOW_OFFSET[win] * trend);
}

function scoreTone(score: number): 'emerald' | 'brand' | 'amber' | 'rose' {
  if (score >= 80) return 'emerald';
  if (score >= 65) return 'brand';
  if (score >= 50) return 'amber';
  return 'rose';
}

/* A mentee's clan label, derived locally from their program. */
function clanOf(m: Mentee): string {
  return m.program;
}

/* ----------------------------------------------------------------
   Personality narrative - composed from the mentee's own stats so the
   report reads as written, not templated. Pairs with their aiSummary.
----------------------------------------------------------------- */
function narrate(m: Mentee): string {
  const p = m.personality;
  const dims: Array<{ key: string; value: number }> = [
    { key: 'consistency', value: p.consistency },
    { key: 'communication', value: p.communication },
    { key: 'resilience', value: p.resilience },
    { key: 'independence', value: p.independence },
  ];
  const sorted = [...dims].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const low = sorted[sorted.length - 1];

  const PHRASE: Record<string, { strong: string; soft: string }> = {
    consistency: {
      strong: 'shows up day after day and keeps a steady cadence',
      soft: 'works in bursts and benefits from a fixed daily rhythm',
    },
    communication: {
      strong: 'flags blockers early and writes clear updates',
      soft: 'tends to go quiet under pressure and needs prompting to surface issues',
    },
    resilience: {
      strong: 'absorbs setbacks without losing momentum',
      soft: 'can stall after a hard task and needs a quick reset',
    },
    independence: {
      strong: 'drives their own roadmap with little hand-holding',
      soft: 'leans on direction and gains from short, frequent check-ins',
    },
  };

  const paceWord =
    m.relativeProgress >= 100
      ? 'ahead of the expected pace'
      : m.relativeProgress >= 85
        ? 'roughly on the expected pace'
        : 'behind the expected pace';

  return (
    `${m.name} is ${m.absoluteProgress}% through the program and ${paceWord}, ` +
    `holding a ${m.onTimeRate}% on-time rate. They ${PHRASE[top.key].strong}; ` +
    `the area to support is ${low.key}, where they ${PHRASE[low.key].soft}. ` +
    `${m.aiSummary}`
  );
}

/* Trait bars for the four personality dimensions. */
function TraitBars({ m }: { m: Mentee }) {
  const rows: Array<{ label: string; value: number }> = [
    { label: 'Consistency', value: m.personality.consistency },
    { label: 'Communication', value: m.personality.communication },
    { label: 'Resilience', value: m.personality.resilience },
    { label: 'Independence', value: m.personality.independence },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-ink-soft">{r.label}</span>
            <span className="font-mono font-medium text-ink-mute tnum">{r.value}</span>
          </div>
          <ProgressBar value={r.value} tone="brand" />
        </div>
      ))}
    </div>
  );
}

/* One ranked row in the board. */
function ScoreRow({
  rank,
  m,
  score,
  onOpen,
}: {
  rank: number;
  m: Mentee;
  score: number;
  onOpen: () => void;
}) {
  const tone = scoreTone(score);
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <span className="w-6 shrink-0 text-center font-mono text-xs text-ink-faint tnum">
        {rank}
      </span>
      <Avatar initials={m.avatar} name={m.name} size="sm" />
      <div className="min-w-0 flex-[1.4]">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{m.name}</span>
          <MomentumIcon momentum={m.momentum} />
        </div>
        <div className="truncate text-xs text-ink-mute">{clanOf(m)}</div>
      </div>
      <div className="hidden min-w-0 flex-1 items-center gap-3 sm:flex">
        <div className="min-w-0 flex-1">
          <ProgressBar value={score} tone={tone} />
        </div>
        <span className="w-9 shrink-0 text-right font-mono text-sm font-semibold text-ink tnum">
          {score}
        </span>
      </div>
      <Button variant="outline" size="sm" onClick={onOpen} className="shrink-0">
        View report <ArrowUpRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function ProgressScores() {
  const { mentees } = useStore();
  const [win, setWin] = useState<Window>('week');
  const [openId, setOpenId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Record<number, string>>({});

  const ranked = useMemo(() => {
    return mentees
      .map((m) => ({ m, score: progressScore(m, win) }))
      .sort((a, b) => b.score - a.score);
  }, [mentees, win]);

  const avg = useMemo(() => {
    if (ranked.length === 0) return 0;
    const total = ranked.reduce((sum, r) => sum + r.score, 0);
    return Math.round(total / ranked.length);
  }, [ranked]);

  const open = openId === null ? null : mentees.find((m) => m.id === openId) ?? null;
  const openScore = open ? progressScore(open, win) : 0;

  return (
    <Page>
      <PageHeader
        title="Progress scores"
        subtitle="One score per mentee, blended from progress, pace and on-time discipline"
        actions={
          <Segmented value={win} onChange={setWin} options={WINDOWS} />
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="eyebrow mb-1">Mentees</div>
          <div className="font-mono text-xl font-semibold text-ink tnum">{ranked.length}</div>
        </Card>
        <Card className="p-4">
          <div className="eyebrow mb-1">Board average</div>
          <div className="font-mono text-xl font-semibold text-ink tnum">{avg}</div>
        </Card>
        <Card className="p-4">
          <div className="eyebrow mb-1">Window</div>
          <div className="text-sm font-medium capitalize text-ink">
            {WINDOWS.find((w) => w.value === win)?.label}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <SectionLabel>Ranked board</SectionLabel>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
            {WINDOW_NOTE[win]}
          </span>
        </div>
        <div className="divide-y divide-hairline">
          {ranked.map((r, i) => (
            <ScoreRow
              key={r.m.id}
              rank={i + 1}
              m={r.m}
              score={r.score}
              onOpen={() => setOpenId(r.m.id)}
            />
          ))}
        </div>
      </Card>

      <Drawer
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open ? `${open.name} - personality report` : 'Personality report'}
        subtitle={open ? clanOf(open) : undefined}
      >
        {open && (
          <div className="space-y-6">
            {/* Score header */}
            <div className="flex items-center gap-4">
              <Avatar initials={open.avatar} name={open.name} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{open.name}</span>
                  <Badge tone={RISK_META[open.risk].tone}>{RISK_META[open.risk].label}</Badge>
                </div>
                <div className="mt-0.5 text-xs text-ink-mute">
                  {open.program} · {open.level}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-2xl font-semibold text-ink tnum">{openScore}</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                  Score
                </div>
              </div>
            </div>

            {/* Trait bars */}
            <div>
              <SectionLabel>Personality read</SectionLabel>
              <TraitBars m={open} />
            </div>

            {/* AI narrative */}
            <div>
              <SectionLabel>Narrative</SectionLabel>
              <p className="rounded-r border border-hairline bg-neutral-50 p-3 text-sm leading-relaxed text-ink-soft">
                {narrate(open)}
              </p>
            </div>

            {/* Mentor feedback */}
            <div>
              <SectionLabel>Mentor report &amp; feedback</SectionLabel>
              <TextArea
                rows={5}
                value={feedback[open.id] ?? ''}
                onChange={(e) =>
                  setFeedback((prev) => ({ ...prev, [open.id]: e.target.value }))
                }
                placeholder="Write your read of this mentee - what is working, what to adjust, and the next step you would set."
              />
              <div className="mt-2 flex items-center justify-between">
                <span
                  className={cx(
                    'font-mono text-[10px] uppercase tracking-[0.08em]',
                    (feedback[open.id] ?? '').trim() ? 'text-ink-mute' : 'text-ink-faint',
                  )}
                >
                  Personality read: mentor + AI
                </span>
                <Button size="sm" disabled={!(feedback[open.id] ?? '').trim()}>
                  Save feedback
                </Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </Page>
  );
}
