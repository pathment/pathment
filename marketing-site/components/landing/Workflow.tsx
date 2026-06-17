'use client';

import { Plug, Rocket, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { useRef, useState } from 'react';
import { workflowSteps } from './content';
import { SectionHeader } from './SectionHeader';
import { SectionShell } from './SectionShell';

const stepIcons: Record<string, LucideIcon> = {
  plug: Plug,
  rocket: Rocket,
  trending: TrendingUp,
};

function ConnectGauge({ progress }: { progress: MotionValue<number> }) {
  const [activeTicks, setActiveTicks] = useState(0);

  useMotionValueEvent(progress, 'change', (v) => {
    const t = Math.min(Math.max((v - 0.05) / 0.35, 0), 1);
    setActiveTicks(Math.round(t * 36));
  });

  return (
    <div className="relative flex h-36 items-end justify-center overflow-hidden sm:h-40">
      <svg viewBox="0 0 240 130" className="h-full w-full max-w-[220px]" aria-hidden>
        {Array.from({ length: 36 }).map((_, i) => {
          const angle = (-180 + (i / 35) * 180) * (Math.PI / 180);
          const innerR = 78;
          const outerR = i < activeTicks ? 98 : 92;
          const cx = 120;
          const cy = 118;
          const x1 = cx + innerR * Math.cos(angle);
          const y1 = cy + innerR * Math.sin(angle);
          const x2 = cx + outerR * Math.cos(angle);
          const y2 = cy + outerR * Math.sin(angle);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={i < activeTicks ? '#2563eb' : '#e4e4e7'}
              strokeWidth={i < activeTicks ? 2.5 : 2}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="absolute bottom-1 text-center">
        <div className="text-xl font-bold text-brand-900">{Math.round((activeTicks / 36) * 100)}%</div>
        <div className="text-[11px] text-zinc-500">Workspace ready</div>
      </div>
    </div>
  );
}

function DeployChart({ progress }: { progress: MotionValue<number> }) {
  const pathLength = useTransform(progress, [0.05, 0.4], [0, 1]);
  const fillOpacity = useTransform(progress, [0.1, 0.35], [0, 1]);
  const badgeOpacity = useTransform(progress, [0.25, 0.4], [0, 1]);
  const badgeY = useTransform(progress, [0.25, 0.4], [8, 0]);

  return (
    <div className="relative h-36 px-3 pt-1 sm:h-40 sm:px-4 sm:pt-2">
      <motion.div
        style={{ opacity: badgeOpacity, y: badgeY }}
        className="absolute top-6 right-8 z-10 rounded-full border border-brand-100 bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow-sm-soft"
      >
        24 cohorts live
      </motion.div>
      <svg viewBox="0 0 320 160" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="deployGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          d="M0,120 C40,110 60,90 100,95 C140,100 160,60 200,55 C240,50 280,30 320,20 L320,160 L0,160 Z"
          fill="url(#deployGrad)"
          style={{ opacity: fillOpacity }}
        />
        <motion.path
          d="M0,120 C40,110 60,90 100,95 C140,100 160,60 200,55 C240,50 280,30 320,20"
          fill="none"
          stroke="#2563eb"
          strokeWidth="3"
          strokeLinecap="round"
          style={{ pathLength }}
        />
      </svg>
    </div>
  );
}

function TrackChart({ progress }: { progress: MotionValue<number> }) {
  const pathLength = useTransform(progress, [0.05, 0.45], [0, 1]);
  const fillOpacity = useTransform(progress, [0.15, 0.45], [0, 1]);

  return (
    <div className="relative h-36 px-3 pt-1 sm:h-40 sm:px-4 sm:pt-2">
      <svg viewBox="0 0 320 160" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="trackGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <motion.path
          d="M0,130 C50,125 80,100 120,90 C160,80 200,50 240,45 C270,42 300,25 320,15 L320,160 L0,160 Z"
          fill="url(#trackGrad)"
          style={{ opacity: fillOpacity }}
        />
        <motion.path
          d="M0,130 C50,125 80,100 120,90 C160,80 200,50 240,45 C270,42 300,25 320,15"
          fill="none"
          stroke="#2563eb"
          strokeWidth="3"
          strokeLinecap="round"
          style={{ pathLength }}
        />
      </svg>
      <div className="absolute bottom-4 left-6 flex gap-4 text-xs">
        <div>
          <div className="font-bold text-brand-900">91%</div>
          <div className="text-zinc-500">Completion</div>
        </div>
        <div>
          <div className="font-bold text-emerald-600">+18%</div>
          <div className="text-zinc-500">vs last quarter</div>
        </div>
      </div>
    </div>
  );
}

const stepVisuals = [ConnectGauge, DeployChart, TrackChart] as const;

function StepCard({
  step,
  index,
  cardProgress,
}: {
  step: (typeof workflowSteps)[number];
  index: number;
  cardProgress: MotionValue<number>;
}) {
  const Icon = stepIcons[step.icon];
  const Visual = stepVisuals[index];

  const scale = useTransform(cardProgress, [0.6, 1], [1, 0.96]);
  const cardOpacity = useTransform(cardProgress, [0.85, 1], [1, 0.85]);

  return (
    <motion.div
      style={{ scale, opacity: cardOpacity }}
      className="flex min-h-0 flex-col overflow-hidden rounded-[18px] border border-zinc-200/80 bg-white p-4 shadow-lg-soft sm:rounded-[22px] sm:p-6 md:p-7"
    >
      <div className="mb-4 flex items-start justify-between sm:mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-white shadow-md">
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-500">
          {step.step}
        </span>
      </div>

      <h3 className="mb-1.5 text-lg font-semibold tracking-tight text-brand-900 sm:text-xl">
        {step.title}
      </h3>
      <p className="mb-auto max-w-sm text-sm leading-relaxed text-zinc-500">
        {step.description}
      </p>

      <div className="mt-5 border-t border-zinc-100 pt-3 sm:mt-6 sm:pt-4">
        <Visual progress={cardProgress} />
      </div>
    </motion.div>
  );
}

function StickyStep({
  step,
  index,
  total,
  containerProgress,
}: {
  step: (typeof workflowSteps)[number];
  index: number;
  total: number;
  containerProgress: MotionValue<number>;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress: cardProgress } = useScroll({
    target: cardRef,
    offset: ['start end', 'end start'],
  });

  const segmentStart = index / total;
  const segmentEnd = (index + 1) / total;
  const stackScale = useTransform(
    containerProgress,
    [segmentStart, segmentEnd - 0.08, segmentEnd],
    [1, 1, 0.94],
  );

  return (
    <div
      ref={cardRef}
      className="relative pb-6 lg:sticky lg:top-32 lg:pb-6"
      style={{ zIndex: index + 1 }}
    >
      <motion.div style={{ scale: stackScale }}>
        <StepCard step={step} index={index} cardProgress={cardProgress} />
      </motion.div>
    </div>
  );
}

export function Workflow() {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  return (
    <SectionShell
      id="how-it-works"
      tone="muted"
      className="py-20 md:py-28"
      ariaLabelledby="how-it-works-title"
    >
      <div ref={containerRef}>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16 xl:gap-24">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <SectionHeader
              label="How It Works"
              titleId="how-it-works-title"
              align="left"
              className="mb-0 md:mb-0 lg:mb-0"
              title="From setup to insight — just three simple steps"
            />
          </div>

          {/* Sticky stacked cards — scroll through on the right */}
          <div className="relative lg:max-w-md xl:max-w-lg">
            {workflowSteps.map((step, index) => (
              <StickyStep
                key={step.step}
                step={step}
                index={index}
                total={workflowSteps.length}
                containerProgress={scrollYProgress}
              />
            ))}
            <div className="hidden h-[18vh] lg:block" aria-hidden />
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
