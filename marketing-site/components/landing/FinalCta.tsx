'use client';

import { ArrowRight } from 'lucide-react';
import { Reveal } from './Reveal';
import { SectionShell } from './SectionShell';

export function FinalCta() {
  return (
    <SectionShell id="request-access" tone="plain" className="overflow-hidden">
      <Reveal>
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-brand-400/30 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 px-5 py-12 sm:px-8 sm:py-16 md:p-20">
            <div className="grid-pattern pointer-events-none absolute inset-0 opacity-[0.07]" />
            <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-brand-600/10 blur-3xl" />

            <div className="relative mx-auto max-w-2xl text-center">
              <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Let Pathment take the guesswork out of mentorship
              </h2>
              <p className="mb-10 text-base leading-relaxed text-blue-100">
                From smart matching to AI roadmaps and progress analytics — give your engineering
                team a structured system for measurable growth.
              </p>
              <form
                action="mailto:enterprise@pathment.com"
                method="post"
                className="mx-auto flex w-full max-w-md flex-col gap-2.5 sm:flex-row"
              >
                <input
                  type="email"
                  name="email"
                  placeholder="Enter work email"
                  required
                  className="w-full flex-1 rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-sm text-white shadow-sm-soft backdrop-blur-sm transition-all placeholder:text-white/55 focus:border-white/60 focus:bg-white/15 focus:outline-none focus:ring-4 focus:ring-white/20"
                />
                <button
                  type="submit"
                  className="group inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-700 shadow-md-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-50 hover:shadow-lg-soft"
                >
                  Request Invite
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </button>
              </form>
              <p className="mt-4 text-xs text-blue-100/80">
                For enterprise security configurations or customized RFP reviews, reach us at{' '}
                <a
                  href="mailto:enterprise@pathment.com"
                  className="font-medium text-white underline decoration-white/40 underline-offset-2 hover:decoration-white"
                >
                  enterprise@pathment.com
                </a>
              </p>
            </div>
          </div>
        </Reveal>
    </SectionShell>
  );
}
