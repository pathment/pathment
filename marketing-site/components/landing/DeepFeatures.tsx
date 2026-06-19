'use client';

import { ArrowRight, MessageSquare, Network } from 'lucide-react';
import { deepFeatures } from './content';
import { Reveal } from './Reveal';
import { SectionHeader } from './SectionHeader';
import { SectionShell } from './SectionShell';

function OrgStructureVisual() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm-soft">
      <div className="mb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">
        Engineering Mentorship Program
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <div className="text-xs font-semibold text-brand-800">Program · Staff Engineer Track</div>
          <div className="mt-0.5 text-[10px] text-brand-600">Published · 3 cohorts active</div>
        </div>
        <div className="ml-4 space-y-2 border-l-2 border-zinc-200 pl-4">
          <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5">
            <div className="text-xs font-medium text-zinc-800">Cohort · Spring 2026</div>
            <div className="text-[10px] text-zinc-500">Open · 24 applicants</div>
          </div>
          <div className="space-y-2 pl-2">
            {[
              { name: 'Clan Alpha', mentor: 'Sarah M.', mentees: 8 },
              { name: 'Clan Beta', mentor: 'Marcus W.', mentees: 6 },
              { name: 'Clan Gamma', mentor: 'Elena P.', mentees: 7 },
            ].map((clan) => (
              <div
                key={clan.name}
                className="flex items-center justify-between rounded-lg border border-zinc-100 bg-white px-3 py-2"
              >
                <div>
                  <div className="text-[11px] font-medium text-zinc-800">{clan.name}</div>
                  <div className="text-[10px] text-zinc-500">Lead: {clan.mentor}</div>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                  {clan.mentees} mentees
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MessagingVisual() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm-soft">
      <div className="mb-4 flex items-center gap-2 border-b border-zinc-100 pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
          SM
        </div>
        <div>
          <div className="text-xs font-semibold text-brand-900">Sarah M.</div>
          <div className="text-[10px] text-emerald-600">Online</div>
        </div>
      </div>
      <div className="space-y-3">
        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-zinc-100 px-3 py-2">
          <p className="text-[11px] leading-relaxed text-zinc-700">
            Great progress on the caching task. Can you walk me through your test strategy in our 1:1?
          </p>
          <div className="mt-1 text-[9px] text-zinc-400">10:42 AM · Read</div>
        </div>
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-brand-500 px-3 py-2">
          <p className="text-[11px] leading-relaxed text-white">
            Sure! I focused on integration tests for the API layer, happy to share the PR link.
          </p>
          <div className="mt-1 text-right text-[9px] text-brand-200">10:45 AM · Delivered</div>
        </div>
        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-zinc-100 px-3 py-2">
          <p className="text-[11px] leading-relaxed text-zinc-700">
            Perfect, approved your submission. Next task unlocks automatically 👍
          </p>
          <div className="mt-1 flex items-center gap-1 text-[9px] text-zinc-400">
            <span>10:46 AM</span>
            <span>·</span>
            <span>❤️ 1</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const visuals: Record<(typeof deepFeatures)[number]['visual'], React.ComponentType> = {
  'org-structure': OrgStructureVisual,
  messaging: MessagingVisual,
};

const featureIcons: Record<(typeof deepFeatures)[number]['visual'], typeof Network> = {
  'org-structure': Network,
  messaging: MessageSquare,
};

export function DeepFeatures() {
  return (
    <SectionShell tone="plain" ariaLabelledby="deep-features-title">
      <SectionHeader
        label="Platform"
        titleId="deep-features-title"
        title="The structure that keeps programs running"
        description="Programs, cohorts, and mentor-led clans, plus in-app messaging, the foundation that keeps mentorship organized as you grow."
      />

      <div className="mx-auto max-w-6xl space-y-12 md:space-y-20">
        {deepFeatures.map((feature, index) => {
          const isReversed = index % 2 === 1;
          const Visual = visuals[feature.visual];
          const Icon = featureIcons[feature.visual];

          return (
            <div
              key={feature.title}
              className={`grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16 ${isReversed ? 'lg:[direction:rtl]' : ''}`}
            >
              <Reveal className={isReversed ? 'lg:[direction:ltr]' : ''}>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-200/80 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                  <Icon className="h-3.5 w-3.5" />
                  {feature.label}
                </div>
                <h3 className="mb-4 font-display text-2xl font-semibold tracking-tight text-brand-950 sm:text-3xl">
                  {feature.title}
                </h3>
                <p className="mb-6 text-sm leading-relaxed text-zinc-600 sm:text-base">
                  {feature.description}
                </p>
                <a
                  href={feature.href}
                  className="group inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
                >
                  {feature.cta}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
              </Reveal>

              <Reveal delay={0.1} className={isReversed ? 'lg:[direction:ltr]' : ''}>
                <Visual />
              </Reveal>
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}
