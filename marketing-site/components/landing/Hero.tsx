'use client';

import { ArrowRight, Check, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { HeroDashboard } from './HeroDashboard';
import { heroHighlights } from './content';

export function Hero() {
  return (
    <section className="relative overflow-x-clip border-b border-zinc-200/60 bg-[#fcfcfd] pt-6 pb-6 sm:pt-8 md:pt-12 md:pb-12">
      <div className="grid-pattern pointer-events-none absolute inset-0 opacity-45" />
      <div className="pointer-events-none absolute top-0 left-1/2 h-full w-full max-w-7xl -translate-x-1/2">
        <div className="h-full w-full border-x border-zinc-100" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Centered hero copy */}
        <div className="mx-auto mb-4 max-w-3xl text-center md:mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mb-5 inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-zinc-200/80 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm-soft"
          >
            <span className="flex items-center gap-1 font-semibold text-brand-900">
              <Star className="h-3.5 w-3.5 fill-brand-500 text-brand-500" />
              4.9
            </span>
            <span className="text-zinc-400">·</span>
            <span className="text-center">Trusted by engineering teams at scale</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="mb-5 text-balance font-display text-[2rem] leading-[1.08] font-semibold tracking-tight text-brand-950 sm:mb-6 sm:text-5xl md:text-6xl"
          >
            Structured growth, <br className="hidden sm:inline" />
            <span className="font-normal italic text-brand-600">at enterprise scale.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-zinc-600 sm:mb-10 sm:text-lg"
          >
            Pathment gives engineering &amp; product teams a rigorous system for competency
            development through smart mentor matching, AI-generated roadmaps, and gamified,
            verifiable progress.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <a
              href="#request-access"
              className="group inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-lg-soft sm:w-auto"
            >
              Request Access
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex w-full items-center justify-center rounded-xl border border-brand-200 bg-white px-6 py-3.5 text-sm font-semibold text-brand-700 shadow-sm-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 sm:w-auto"
            >
              See How It Works
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-2 sm:mt-10 sm:gap-2.5"
          >
            {heroHighlights.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm-soft"
              >
                <Check className="h-3.5 w-3.5 text-brand-600" />
                {item}
              </span>
            ))}
          </motion.div>
        </div>

        {/* Centered animated dashboard */}
        <HeroDashboard />
      </div>
    </section>
  );
}
