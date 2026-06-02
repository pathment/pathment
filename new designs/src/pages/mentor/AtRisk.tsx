import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ArrowUpRight, Send, Clock } from 'lucide-react';
import { Page, PageHeader } from '@/components/Page';
import { useStore } from '@/store/AppStore';
import { DualProgress } from '@/components/DualProgress';
import { MessageDrawer } from '@/components/MessageDrawer';
import {
  Avatar,
  Badge,
  Button,
  Card,
  MomentumIcon,
  RISK_META,
  RiskDot,
  AiTag,
  cx,
} from '@/lib/ui';
import type { Mentee } from '@/lib/types';

interface Group {
  key: string;
  label: string;
  desc: string;
  tone: 'rose' | 'amber' | 'emerald';
  members: Mentee[];
}

function buildGroups(mentees: Mentee[]): Group[] {
  const gap = (m: Mentee) => m.relativeProgress - m.absoluteProgress;
  const disengaged = mentees.filter((m) => m.risk === 'high' && gap(m) < 15);
  const struggling = mentees.filter((m) => m.risk !== 'low' && gap(m) >= 15);
  const grouped = new Set([...disengaged, ...struggling].map((m) => m.id));
  const watch = mentees.filter((m) => m.risk === 'watch' && !grouped.has(m.id));

  const groups: Group[] = [
    {
      key: 'disengaged',
      label: 'Disengaged',
      desc: 'Behind with no logged reason - effort is missing, not just obstacles. Reach out directly.',
      tone: 'rose',
      members: disengaged,
    },
    {
      key: 'struggling',
      label: 'Struggling despite effort',
      desc: 'Fighting real constraints - strong relative progress. Protect their deadlines, don’t push harder.',
      tone: 'amber',
      members: struggling,
    },
    {
      key: 'watch',
      label: 'Worth a watch',
      desc: 'Drifting but still active. A short check-in now usually prevents a slide.',
      tone: 'emerald',
      members: watch,
    },
  ];
  return groups.filter((g) => g.members.length > 0);
}

function RiskCard({ m }: { m: Mentee }) {
  const navigate = useNavigate();
  const { sendNudge } = useStore();
  const [nudges, setNudges] = useState(m.nudgesSent ?? 0);
  const [message, setMessage] = useState(false);
  const risk = RISK_META[m.risk];
  const disengaged = m.risk === 'high' && m.relativeProgress - m.absoluteProgress < 15;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <Card
      hover
      onClick={() => navigate(`/mentor/mentee/${m.id}`)}
      className="animate-slide-in p-5"
    >
      <div className="flex items-start gap-3">
        <Avatar initials={m.avatar} name={m.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-ink">{m.name}</h3>
            <MomentumIcon momentum={m.momentum} />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-mute">
            <span>{m.level}</span>
            <span className="text-ink-faint">·</span>
            <Clock className="h-3 w-3" />
            <span>{m.lastActive}</span>
          </div>
        </div>
        <Badge tone={risk.tone}>
          <RiskDot risk={m.risk} />
          {risk.label}
        </Badge>
      </div>

      <div className="my-4">
        <DualProgress absolute={m.absoluteProgress} relative={m.relativeProgress} compact />
      </div>

      {m.riskReason && (
        <div className="mb-3 flex items-start gap-2 border-t border-hairline pt-3">
          <div className="shrink-0 pt-0.5">
            <AiTag>{''}</AiTag>
          </div>
          <span className="text-xs leading-relaxed text-ink-mute">{m.riskReason}</span>
        </div>
      )}

      {/* AI signals */}
      <div className="mb-3 flex flex-wrap gap-1">
        {m.aiSignals.slice(0, 3).map((s) => (
          <span
            key={s}
            className="rounded-md bg-neutral-50 px-2 py-0.5 font-mono text-[10px] text-ink-mute ring-1 ring-hairline"
          >
            {s}
          </span>
        ))}
      </div>

      {disengaged && nudges >= 2 && (
        <p className="mb-3 text-[11px] text-ink-faint">
          {nudges} automated nudges sent · 0 replies - time for a human message.
        </p>
      )}

      <div className="flex items-center gap-2" onClick={stop}>
        <Button
          variant="soft"
          size="sm"
          onClick={() => setNudges(sendNudge(m.id))}
        >
          <Bell className="h-3.5 w-3.5" />
          {nudges > (m.nudgesSent ?? 0) ? `Nudge sent · ${nudges} this week` : 'Send nudge'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMessage(true)}>
          <Send className="h-3.5 w-3.5" /> Message
        </Button>
        <button
          onClick={() => navigate(`/mentor/mentee/${m.id}`)}
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
        >
          Full story <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <MessageDrawer open={message} onClose={() => setMessage(false)} mentee={m} />
    </Card>
  );
}

export function AtRisk() {
  const { mentees } = useStore();
  const groups = buildGroups(mentees);
  const total = groups.reduce((n, g) => n + g.members.length, 0);

  return (
    <Page>
      <PageHeader
        title="At-risk"
        subtitle="Ranked by Pathment AI - who's slipping, and why"
      />

      {total === 0 ? (
        <Card className="grid place-items-center py-16 text-center">
          <p className="text-sm text-ink-mute">No one is flagged right now - the cohort is steady.</p>
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="mb-3 flex items-baseline gap-2">
                <span
                  className={cx(
                    'font-mono text-[11px] font-semibold uppercase tracking-[0.08em]',
                    g.tone === 'rose'
                      ? 'text-[#FF3B30]'
                      : g.tone === 'amber'
                        ? 'text-amber-600'
                        : 'text-emerald-600',
                  )}
                >
                  {g.label}
                </span>
                <Badge tone={g.tone}>{g.members.length}</Badge>
                <span className="text-xs text-ink-mute">{g.desc}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {g.members.map((m) => (
                  <RiskCard key={m.id} m={m} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
