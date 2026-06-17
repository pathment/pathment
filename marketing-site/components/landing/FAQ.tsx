'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { faqItems } from './content';
import { Reveal } from './Reveal';
import { SectionHeader } from './SectionHeader';
import { SectionShell } from './SectionShell';

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <SectionShell tone="muted" ariaLabelledby="faq-title">
      <SectionHeader
        label="Help & Support"
        titleId="faq-title"
        title="Frequently asked questions"
        description="Everything you need to know about setting up structured mentorship programs with Pathment."
      />

      <div className="mx-auto max-w-3xl space-y-3">
        {faqItems.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <Reveal key={item.question} delay={index * 0.05}>
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm-soft transition-all duration-200 hover:border-zinc-300">
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm font-semibold text-brand-900">{item.question}</span>
                  <ChevronDown
                    className={`h-4 w-4 flex-shrink-0 text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                <div
                  className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-4 text-sm leading-relaxed text-zinc-600 sm:px-6 sm:pb-5">
                      {item.answer}
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </SectionShell>
  );
}
