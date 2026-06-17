'use client';

import { GitBranch, LineChart, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { platformHighlights } from './content';
import { SectionHeader } from './SectionHeader';
import { SectionShell } from './SectionShell';

function MatchingVisual() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm-soft">
      <div className="space-y-2">
        {[
          { mentee: 'Alex K.', mentor: 'Sarah M.', status: 'Approved', done: true },
          { mentee: 'Jordan L.', mentor: 'Marcus W.', status: 'Pending', done: false },
          { mentee: 'Sam R.', mentor: 'Elena P.', status: 'Approved', done: true },
        ].map((pair) => (
          <div
            key={pair.mentee}
            className="flex items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3 sm:px-4"
          >
            <div className="min-w-0 text-sm">
              <span className="font-medium text-zinc-900">{pair.mentee}</span>
              <span className="text-zinc-400"> → </span>
              <span className="font-medium text-zinc-700">{pair.mentor}</span>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${pair.done ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
            >
              {pair.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoadmapsVisual() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm-soft">
      <div className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-400">
        Staff Engineer Roadmap
      </div>
      <div className="space-y-3">
        {[
          { name: 'System Design', pct: 100 },
          { name: 'Technical Leadership', pct: 72 },
          { name: 'Org Influence', pct: 48 },
        ].map((m) => (
          <div key={m.name}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium text-zinc-800">{m.name}</span>
              <span className="font-mono text-zinc-400">{m.pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-1000"
                style={{ width: `${m.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightsVisual() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm-soft">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          Program Health
        </span>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
          Healthy
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'On Track', value: '82%' },
          { label: 'At Risk', value: '6' },
          { label: 'Completed', value: '34' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-center">
            <div className="text-xl font-bold text-zinc-900">{s.value}</div>
            <div className="text-[10px] text-zinc-500">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50 p-3 text-xs text-brand-800">
        <LineChart className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        4 pairs flagged — avg. 12 days since last check-in
      </div>
    </div>
  );
}

const visuals: Record<string, React.ComponentType> = {
  matching: MatchingVisual,
  roadmaps: RoadmapsVisual,
  insights: InsightsVisual,
};

const tabIcons = [Users, GitBranch, LineChart];

export function PlatformHighlights() {
  const [active, setActive] = useState(0);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observers = sectionRefs.current.map((el, index) => {
      if (!el) return null;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActive(index);
        },
        { rootMargin: '-40% 0px -40% 0px', threshold: 0 },
      );
      observer.observe(el);
      return observer;
    });

    return () => observers.forEach((o) => o?.disconnect());
  }, []);

  return (
    <SectionShell tone="plain" ariaLabelledby="platform-highlights">
      <SectionHeader
        label="Why Pathment"
        titleId="platform-highlights"
        title="A mentorship platform built for engineering teams"
        description="Smart matching, AI roadmaps, and real-time program insights — everything your org needs to run structured growth at scale."
      />

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 lg:grid-cols-[240px_1fr] lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="-mx-4 flex flex-row gap-2 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:px-0 lg:flex-col lg:gap-1 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
              {platformHighlights.map((item, index) => {
                const Icon = tabIcons[index];
                const isActive = active === index;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      sectionRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      setActive(index);
                    }}
                    className={`flex min-w-[9.5rem] flex-shrink-0 items-center gap-2.5 rounded-xl px-4 py-3 text-left text-sm font-medium transition-all sm:min-w-0 lg:w-full ${
                      isActive
                        ? 'bg-zinc-950 text-white shadow-md-soft'
                        : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-16 lg:space-y-24">
            {platformHighlights.map((item, index) => {
              const Visual = visuals[item.visual];
              return (
                <div
                  key={item.id}
                  ref={(el) => {
                    sectionRefs.current[index] = el;
                  }}
                  className="scroll-mt-28"
                >
                  <h3 className="mb-3 font-display text-2xl font-semibold tracking-tight text-zinc-950">
                    {item.title}
                  </h3>
                  <p className="mb-6 max-w-lg text-base leading-relaxed text-zinc-600">
                    {item.description}
                  </p>
                  <Visual />
                </div>
              );
            })}
          </div>
        </div>
    </SectionShell>
  );
}
