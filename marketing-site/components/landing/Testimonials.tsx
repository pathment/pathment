'use client';

import { Star } from 'lucide-react';
import { testimonials } from './content';
import { LandingCard } from './LandingCard';
import { SectionHeader } from './SectionHeader';
import { SectionShell } from './SectionShell';

export function Testimonials() {
  const doubled = [...testimonials, ...testimonials];

  return (
    <SectionShell tone="plain" className="overflow-hidden" ariaLabelledby="testimonials-title">
      <SectionHeader
        label="Testimonials"
        titleId="testimonials-title"
        title="Trusted by engineering leaders"
        description="Forward-thinking teams use Pathment to build structured mentorship programs that drive measurable capability growth."
      />

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-white to-transparent sm:w-16" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-white to-transparent sm:w-16" />

        <div className="flex animate-marquee gap-4 pause-on-hover sm:gap-5">
          {doubled.map((item, index) => (
            <LandingCard
              key={`${item.name}-${index}`}
              className="w-72 flex-shrink-0 sm:w-80"
            >
              <div className="mb-4 flex gap-0.5">
                {Array.from({ length: item.rating }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-brand-500 text-brand-500" />
                ))}
              </div>
              <p className="mb-5 text-sm leading-relaxed text-zinc-700">&ldquo;{item.quote}&rdquo;</p>
              <div>
                <div className="text-sm font-semibold text-brand-900">{item.name}</div>
                <div className="text-xs text-zinc-500">{item.role}</div>
              </div>
            </LandingCard>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
