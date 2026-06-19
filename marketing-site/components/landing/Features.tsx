'use client';

import {
  Calendar,
  ClipboardCheck,
  FileText,
  Heart,
  Trophy,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { featureCards } from './content';
import { SectionHeader } from './SectionHeader';
import { SectionShell } from './SectionShell';
import { Stagger, StaggerItem } from './Reveal';

const icons: Record<string, LucideIcon> = {
  'clipboard-check': ClipboardCheck,
  'file-text': FileText,
  heart: Heart,
  calendar: Calendar,
  trophy: Trophy,
};

function TaskReviewPanel() {
  return (
    <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-700 to-brand-950 p-4 shadow-sm-soft lg:max-w-md lg:justify-self-end">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] text-zinc-500">v2 submission</span>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
          Needs review
        </span>
      </div>
      <div className="mb-3 rounded-lg border border-brand-500/30 bg-brand-900/60 p-3 font-mono text-[11px] leading-relaxed text-brand-100">
        <span className="text-emerald-400">+ </span>Implemented caching layer for API routes
        <br />
        <span className="text-emerald-400">+ </span>Added integration tests (94% coverage)
        <br />
        <span className="text-zinc-500">  3 files attached</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {['Approve', 'Request changes', 'Add notes'].map((action, i) => (
          <span
            key={action}
            className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold ${
              i === 0
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'border border-brand-500/40 text-brand-200'
            }`}
          >
            {action}
          </span>
        ))}
      </div>
    </div>
  );
}

function IntakePanel() {
  return (
    <div className="relative pl-4">
      {[
        { step: 'Applied', detail: 'Jordan M. · Staff Eng track', done: true },
        { step: 'Assessed', detail: 'Score: 87/100', done: true },
        { step: 'Accepted', detail: 'Invite sent', done: true },
        { step: 'Placed', detail: 'Clan: Platform Alpha', done: false },
      ].map((item, i, arr) => (
        <div key={item.step} className="relative pb-3 last:pb-0">
          {i < arr.length - 1 && (
            <div className="absolute left-[5px] top-3 h-[calc(100%-4px)] w-px bg-zinc-200" />
          )}
          <div className="flex items-start gap-3">
            <div
              className={`relative z-10 mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                item.done ? 'bg-brand-500' : 'border-2 border-zinc-300 bg-white'
              }`}
            />
            <div>
              <div className="text-xs font-semibold text-brand-900">{item.step}</div>
              <div className="text-[10px] text-zinc-500">{item.detail}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CommunityPanel() {
  return (
    <div className="space-y-2">
      {[
        {
          type: 'kudos',
          author: 'Sarah M.',
          body: 'Shoutout to Alex for shipping the auth refactor ahead of schedule!',
          accent: 'bg-rose-50 text-rose-600',
        },
        {
          type: 'question',
          author: 'Sam R.',
          body: 'Best approach for cross-team RFC reviews?',
          accent: 'bg-brand-50 text-brand-600',
        },
      ].map((post) => (
        <div key={post.body} className="rounded-xl border border-zinc-100 bg-zinc-50 p-2.5">
          <div className="mb-1 flex items-center gap-2">
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${post.accent}`}>
              {post.type}
            </span>
            <span className="text-[10px] font-medium text-zinc-500">{post.author}</span>
          </div>
          <p className="line-clamp-2 text-[11px] leading-snug text-zinc-700">{post.body}</p>
        </div>
      ))}
    </div>
  );
}

function SchedulingPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
        Open slots · Sarah M.
      </div>
      <div className="grid flex-1 grid-cols-2 gap-2 content-start">
        {[
          { day: 'Tue 14', time: '2:00 PM', taken: false },
          { day: 'Wed 15', time: '10:00 AM', taken: true },
          { day: 'Thu 16', time: '4:30 PM', taken: false },
          { day: 'Fri 17', time: '11:00 AM', taken: false },
        ].map((slot) => (
          <div
            key={`${slot.day}-${slot.time}`}
            className={`rounded-lg border px-2.5 py-2.5 text-center ${
              slot.taken
                ? 'border-zinc-100 bg-zinc-50 opacity-50'
                : 'border-brand-200 bg-brand-50'
            }`}
          >
            <div className="text-[10px] font-semibold text-zinc-800">{slot.day}</div>
            <div className={`text-[11px] font-medium ${slot.taken ? 'text-zinc-400' : 'text-brand-700'}`}>
              {slot.taken ? 'Booked' : slot.time}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GamificationPanel() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:gap-6">
      <div>
        <div className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          Leaderboard · This month
        </div>
        <div className="space-y-1.5">
          {[
            { rank: 1, name: 'Alex K.', pts: '1,240 XP' },
            { rank: 2, name: 'Jordan M.', pts: '980 XP' },
            { rank: 3, name: 'Sam R.', pts: '875 XP' },
          ].map((entry) => (
            <div
              key={entry.name}
              className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
                {entry.rank}
              </span>
              <span className="flex-1 text-xs font-medium text-zinc-800">{entry.name}</span>
              <span className="font-mono text-[10px] text-zinc-500">{entry.pts}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          Gift catalog
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { name: 'Dev Books', cost: '500 XP' },
            { name: 'Conference Ticket', cost: '2,000 XP' },
            { name: 'Headphones', cost: '1,200 XP' },
            { name: 'Coffee Card', cost: '150 XP' },
          ].map((gift) => (
            <div
              key={gift.name}
              className="rounded-lg border border-zinc-100 bg-zinc-50 p-2.5 text-center"
            >
              <div className="text-[11px] font-medium text-zinc-800">{gift.name}</div>
              <div className="mt-0.5 font-mono text-[10px] text-brand-600">{gift.cost}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const panels: Record<(typeof featureCards)[number]['visual'], React.ComponentType> = {
  'task-review': TaskReviewPanel,
  intake: IntakePanel,
  community: CommunityPanel,
  scheduling: SchedulingPanel,
  gamification: GamificationPanel,
};

function FeaturedCard({
  card,
  Icon,
  Panel,
}: {
  card: (typeof featureCards)[number];
  Icon: LucideIcon;
  Panel: React.ComponentType;
}) {
  return (
    <article className="group overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm-soft transition-all duration-300 hover:-translate-y-1 hover:border-zinc-300 hover:shadow-md-soft sm:p-8">
      <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-2 lg:gap-10">
        <div>
          <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand-100 bg-brand-50 text-brand-600">
            <Icon className="h-5 w-5" />
          </span>
          <h3 className="mb-2 font-display text-xl font-semibold tracking-tight text-brand-950 sm:text-2xl">
            {card.title}
          </h3>
          <p className="max-w-lg text-sm leading-relaxed text-zinc-600 sm:text-base">
            {card.description}
          </p>
        </div>
        <Panel />
      </div>
    </article>
  );
}

function CompactCard({
  card,
  Icon,
  Panel,
}: {
  card: (typeof featureCards)[number];
  Icon: LucideIcon;
  Panel: React.ComponentType;
}) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm-soft transition-all duration-300 hover:-translate-y-1 hover:border-zinc-300 hover:shadow-md-soft">
      <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand-100 bg-brand-50 text-brand-600">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mb-2 text-lg font-semibold text-brand-900">{card.title}</h3>
      <p className="mb-5 text-sm leading-relaxed text-zinc-600">{card.description}</p>
      <div className="mt-auto min-h-[168px]">
        <Panel />
      </div>
    </article>
  );
}

export function Features() {
  const featured = featureCards.filter((c) => c.layout === 'featured');
  const compact = featureCards.filter((c) => c.layout === 'compact');

  return (
    <SectionShell id="features" tone="muted" pattern ariaLabelledby="features-title">
      <SectionHeader
        label="Features"
        titleId="features-title"
        title="Every tool your program runs on"
        description="From intake to task review, community, scheduling, and rewards, the product capabilities that power day-to-day mentorship."
      />

      <Stagger className="mx-auto flex max-w-6xl flex-col gap-4 lg:gap-5">
        {featured[0] && (
          <StaggerItem>
            <FeaturedCard
              card={featured[0]}
              Icon={icons[featured[0].icon]}
              Panel={panels[featured[0].visual]}
            />
          </StaggerItem>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {compact.map((card) => (
            <StaggerItem key={card.title} className="h-full">
              <CompactCard
                card={card}
                Icon={icons[card.icon]}
                Panel={panels[card.visual]}
              />
            </StaggerItem>
          ))}
        </div>

        {featured[1] && (
          <StaggerItem>
            <FeaturedCard
              card={featured[1]}
              Icon={icons[featured[1].icon]}
              Panel={panels[featured[1].visual]}
            />
          </StaggerItem>
        )}
      </Stagger>
    </SectionShell>
  );
}
