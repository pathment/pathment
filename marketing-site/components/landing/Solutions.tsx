'use client';

import { ArrowRight, GitBranch, LineChart, MessageSquare, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { solutionTabs } from './content';
import { SectionShell } from './SectionShell';

const icons: Record<string, LucideIcon> = {
  users: Users,
  'git-branch': GitBranch,
  'line-chart': LineChart,
  messages: MessageSquare,
};

function MatchingPanel() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm-soft">
      <div className="mb-3 flex items-center justify-between border-b border-zinc-100 pb-3">
        <span className="text-xs font-semibold text-zinc-800">Match queue</span>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
          3 pending
        </span>
      </div>
      <div className="space-y-2">
        {[
          { pair: 'Alex K. → Sarah M.', track: 'Staff Engineer', status: 'Approved' },
          { pair: 'Jordan L. → Marcus W.', track: 'Engineering Mgr', status: 'Review' },
          { pair: 'Sam R. → Elena P.', track: 'Platform Lead', status: 'Review' },
        ].map((row, i) => (
          <div key={row.pair} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium text-brand-900">{row.pair}</span>
              <span
                className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${i === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
              >
                {row.status}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-zinc-500">{row.track}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoadmapPanel() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm-soft">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
        Staff Engineer Roadmap
      </div>
      <div className="space-y-3">
        {[
          { name: 'System Design', pct: 100 },
          { name: 'Technical Leadership', pct: 72 },
          { name: 'Org Influence', pct: 48 },
        ].map((item) => (
          <div key={item.name}>
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="font-medium text-zinc-800">{item.name}</span>
              <span className="font-mono text-zinc-400">{item.pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${item.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightsPanel() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm-soft">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          Program health
        </span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          Healthy
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'On Track', value: '82%' },
          { label: 'At Risk', value: '6' },
          { label: 'Completed', value: '34' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-zinc-100 bg-zinc-50 p-2.5 text-center">
            <div className="text-lg font-bold text-brand-900">{stat.value}</div>
            <div className="text-[10px] text-zinc-500">{stat.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-[11px] text-brand-800">
        4 pairs flagged, avg. 12 days since last check-in
      </div>
    </div>
  );
}

function OperationsPanel() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm-soft">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
        This week&apos;s cadence
      </div>
      <div className="space-y-2">
        {[
          { task: 'Weekly check-in', mentor: 'Sarah M.', status: 'Complete' },
          { task: 'Milestone review', mentor: 'Marcus W.', status: 'Due today' },
          { task: 'Async feedback', mentor: 'Elena P.', status: 'Scheduled' },
        ].map((row, i) => (
          <div
            key={row.task}
            className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
          >
            <div>
              <div className="text-xs font-medium text-brand-900">{row.task}</div>
              <div className="text-[10px] text-zinc-500">{row.mentor}</div>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${i === 0 ? 'bg-emerald-50 text-emerald-700' : i === 1 ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'}`}
            >
              {row.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const panels: Record<(typeof solutionTabs)[number]['visual'], React.ComponentType> = {
  matching: MatchingPanel,
  roadmap: RoadmapPanel,
  insights: InsightsPanel,
  operations: OperationsPanel,
};

export function Solutions() {
  const [active, setActive] = useState(0);
  const tab = solutionTabs[active];
  const Icon = icons[tab.icon];
  const Panel = panels[tab.visual];

  return (
    <SectionShell id="solutions" tone="plain" ariaLabelledby="solutions-title">
      <div className="mx-auto mb-10 max-w-4xl text-center md:mb-12">
        <h2
          id="solutions-title"
          className="font-display text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl md:text-5xl"
        >
          Packed with tools for structured mentorship
        </h2>
      </div>

      <div className="mx-auto max-w-6xl">
        {/* Ageento-style pill tab bar */}
        <div className="mb-5 rounded-2xl border border-zinc-200 bg-zinc-100/90 p-1.5 sm:mb-6 sm:p-2">
          <div
            role="tablist"
            className="grid grid-cols-2 gap-1 sm:grid-cols-4"
          >
            {solutionTabs.map((item, index) => {
              const TabIcon = icons[item.icon];
              const isActive = active === index;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(index)}
                  aria-selected={isActive}
                  role="tab"
                  className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-center text-[11px] font-medium transition-all duration-300 sm:gap-2 sm:px-3 sm:text-sm ${
                    isActive
                      ? 'border border-zinc-200/80 bg-white text-brand-900 shadow-sm-soft'
                      : 'text-zinc-600 hover:bg-white/60 hover:text-brand-900'
                  }`}
                >
                  <TabIcon className="h-3.5 w-3.5 flex-shrink-0 sm:h-4 sm:w-4" />
                  <span className="leading-tight">{item.tabLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Split content card */}
        <div
          role="tabpanel"
          className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-lg-soft"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={tab.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-1 lg:grid-cols-2"
            >
              <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
                <span className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-brand-100 bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mb-3 font-display text-2xl font-semibold tracking-tight text-brand-950 sm:text-3xl">
                  {tab.headline}
                </h3>
                <p className="mb-6 text-sm leading-relaxed text-zinc-600 sm:text-base">
                  {tab.description}
                </p>
                <a
                  href="#request-access"
                  className="group inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
                >
                  Request Access
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
              </div>

              <div className="border-t border-zinc-100 bg-zinc-50/60 p-6 sm:p-8 lg:border-t-0 lg:border-l lg:p-10">
                <Panel />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </SectionShell>
  );
}
