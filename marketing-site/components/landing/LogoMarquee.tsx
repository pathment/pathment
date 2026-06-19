'use client';

import { impactStats } from './content';

function StatPill({ stat }: { stat: (typeof impactStats)[number] }) {
  return (
    <div className="mx-5 flex shrink-0 items-baseline gap-2 sm:mx-8">
      <span className="font-display text-xl font-semibold tracking-tight text-brand-900 sm:text-2xl">
        {stat.value}
      </span>
      <span className="whitespace-nowrap text-sm font-medium text-zinc-500">{stat.label}</span>
      <span className="ml-3 h-1 w-1 rounded-full bg-zinc-300 sm:ml-6" aria-hidden />
    </div>
  );
}

export function LogoMarquee() {
  const doubled = [...impactStats, ...impactStats];

  return (
    <section
      className="relative overflow-hidden border-b border-zinc-200/60 bg-[#fcfcfd] py-7 md:py-9"
      aria-label="Pathment by the numbers"
    >
      <p className="mb-5 text-center text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
        Real traction, all organic
      </p>

      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-[#fcfcfd] via-[#fcfcfd]/80 to-transparent sm:w-28 md:w-36" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-[#fcfcfd] via-[#fcfcfd]/80 to-transparent sm:w-28 md:w-36" />

      <div className="flex animate-logo-marquee items-center">
        {doubled.map((stat, index) => (
          <StatPill key={`${stat.label}-${index}`} stat={stat} />
        ))}
      </div>
    </section>
  );
}
