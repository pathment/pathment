'use client';

import { ArrowUpRight } from 'lucide-react';
import { devWeekends, integrations } from './content';
import { SectionHeader } from './SectionHeader';
import { SectionShell } from './SectionShell';

export function Testimonials() {
  return (
    <SectionShell tone="plain" className="overflow-hidden" ariaLabelledby="testimonials-title">
      <SectionHeader
        label="Customers"
        titleId="testimonials-title"
        title="Built for programs that take mentorship seriously"
        description="Pathment runs real fellowships, not demos. Here is what one of them has built on it."
      />

      {/* Dev Weekends spotlight: a single real case, not invented quotes. */}
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm-soft">
        <div className="grid gap-0 md:grid-cols-5">
          {/* Left: story */}
          <div className="flex flex-col justify-between gap-6 border-b border-zinc-200 p-6 sm:p-8 md:col-span-2 md:border-b-0 md:border-r">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">
                {devWeekends.kicker}
              </span>
              <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight text-brand-950">
                {devWeekends.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600">{devWeekends.blurb}</p>
            </div>
            <a
              href={devWeekends.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              {devWeekends.name}
              <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>

          {/* Right: real numbers */}
          <div className="grid grid-cols-2 gap-px bg-zinc-200 sm:grid-cols-3 md:col-span-3">
            {devWeekends.stats.map((stat) => (
              <div key={stat.label} className="flex flex-col justify-center bg-white p-5 sm:p-6">
                <span className="font-display text-2xl font-semibold tracking-tight text-brand-900 sm:text-3xl">
                  {stat.value}
                </span>
                <span className="mt-1 text-sm font-medium text-zinc-700">{stat.label}</span>
                {'detail' in stat && stat.detail ? (
                  <span className="mt-0.5 text-xs text-zinc-400">{stat.detail}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Honest integrations strip */}
      <div className="mx-auto mt-10 max-w-5xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
          Bring your own AI key, plus batteries-included email and files
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
          {integrations.map((tool) => (
            <span
              key={tool.name}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-700 shadow-sm-soft"
            >
              {tool.name}
              <span className="text-xs font-normal text-zinc-400">{tool.category}</span>
            </span>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
