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

const GAUGE_TICKS = [
  { x1: 42, y1: 118, x2Idle: 28, y2Idle: 118, x2Active: 22, y2Active: 118 },
  { x1: 42.314, y1: 111.008, x2Idle: 28.37, y2Idle: 109.753, x2Active: 22.395, y2Active: 109.215 },
  { x1: 43.253, y1: 104.073, x2Idle: 29.478, y2Idle: 101.573, x2Active: 23.575, y2Active: 100.501 },
  { x1: 44.811, y1: 97.249, x2Idle: 31.315, y2Idle: 93.525, x2Active: 25.532, y2Active: 91.928 },
  { x1: 46.974, y1: 90.593, x2Idle: 33.866, y2Idle: 85.674, x2Active: 28.249, y2Active: 83.565 },
  { x1: 49.724, y1: 84.157, x2Idle: 37.111, y2Idle: 78.083, x2Active: 31.705, y2Active: 75.479 },
  { x1: 53.041, y1: 77.994, x2Idle: 41.023, y2Idle: 70.813, x2Active: 35.872, y2Active: 67.736 },
  { x1: 56.897, y1: 72.153, x2Idle: 45.57, y2Idle: 63.924, x2Active: 40.716, y2Active: 60.397 },
  { x1: 61.26, y1: 66.681, x2Idle: 50.717, y2Idle: 57.47, x2Active: 46.199, y2Active: 53.522 },
  { x1: 66.097, y1: 61.622, x2Idle: 56.422, y2Idle: 51.503, x2Active: 52.276, y2Active: 47.166 },
  { x1: 71.368, y1: 57.017, x2Idle: 62.639, y2Idle: 46.072, x2Active: 58.898, y2Active: 41.381 },
  { x1: 77.03, y1: 52.903, x2Idle: 69.317, y2Idle: 41.219, x2Active: 66.012, y2Active: 36.212 },
  { x1: 83.038, y1: 49.314, x2Idle: 76.404, y2Idle: 36.985, x2Active: 73.561, y2Active: 31.702 },
  { x1: 89.344, y1: 46.277, x2Idle: 83.842, y2Idle: 33.403, x2Active: 81.484, y2Active: 27.886 },
  { x1: 95.897, y1: 43.818, x2Idle: 91.57, y2Idle: 30.503, x2Active: 89.716, y2Active: 24.796 },
  { x1: 102.643, y1: 41.956, x2Idle: 99.528, y2Idle: 28.307, x2Active: 98.193, y2Active: 22.457 },
  { x1: 109.53, y1: 40.706, x2Idle: 107.651, y2Idle: 26.833, x2Active: 106.845, y2Active: 20.887 },
  { x1: 116.501, y1: 40.079, x2Idle: 115.872, y2Idle: 26.093, x2Active: 115.603, y2Active: 20.099 },
  { x1: 123.499, y1: 40.079, x2Idle: 124.128, y2Idle: 26.093, x2Active: 124.397, y2Active: 20.099 },
  { x1: 130.47, y1: 40.706, x2Idle: 132.349, y2Idle: 26.833, x2Active: 133.155, y2Active: 20.887 },
  { x1: 137.357, y1: 41.956, x2Idle: 140.472, y2Idle: 28.307, x2Active: 141.807, y2Active: 22.457 },
  { x1: 144.103, y1: 43.818, x2Idle: 148.43, y2Idle: 30.503, x2Active: 150.284, y2Active: 24.796 },
  { x1: 150.656, y1: 46.277, x2Idle: 156.158, y2Idle: 33.403, x2Active: 158.516, y2Active: 27.886 },
  { x1: 156.962, y1: 49.314, x2Idle: 163.596, y2Idle: 36.985, x2Active: 166.439, y2Active: 31.702 },
  { x1: 162.97, y1: 52.903, x2Idle: 170.683, y2Idle: 41.219, x2Active: 173.988, y2Active: 36.212 },
  { x1: 168.632, y1: 57.017, x2Idle: 177.361, y2Idle: 46.072, x2Active: 181.102, y2Active: 41.381 },
  { x1: 173.903, y1: 61.622, x2Idle: 183.578, y2Idle: 51.503, x2Active: 187.724, y2Active: 47.166 },
  { x1: 178.74, y1: 66.681, x2Idle: 189.283, y2Idle: 57.47, x2Active: 193.801, y2Active: 53.522 },
  { x1: 183.103, y1: 72.153, x2Idle: 194.43, y2Idle: 63.924, x2Active: 199.284, y2Active: 60.397 },
  { x1: 186.959, y1: 77.994, x2Idle: 198.977, y2Idle: 70.813, x2Active: 204.128, y2Active: 67.736 },
  { x1: 190.276, y1: 84.157, x2Idle: 202.889, y2Idle: 78.083, x2Active: 208.295, y2Active: 75.479 },
  { x1: 193.026, y1: 90.593, x2Idle: 206.134, y2Idle: 85.674, x2Active: 211.751, y2Active: 83.565 },
  { x1: 195.189, y1: 97.249, x2Idle: 208.685, y2Idle: 93.525, x2Active: 214.468, y2Active: 91.928 },
  { x1: 196.747, y1: 104.073, x2Idle: 210.522, y2Idle: 101.573, x2Active: 216.425, y2Active: 100.501 },
  { x1: 197.686, y1: 111.008, x2Idle: 211.63, y2Idle: 109.753, x2Active: 217.605, y2Active: 109.215 },
  { x1: 198, y1: 118, x2Idle: 212, y2Idle: 118, x2Active: 218, y2Active: 118 },
] as const;

function ConnectGauge({ progress }: { progress: MotionValue<number> }) {
  const [activeTicks, setActiveTicks] = useState(0);

  useMotionValueEvent(progress, 'change', (v) => {
    const t = Math.min(Math.max((v - 0.05) / 0.35, 0), 1);
    setActiveTicks(Math.round(t * 36));
  });

  return (
    <div className="relative flex h-36 items-end justify-center overflow-hidden sm:h-40">
      <svg viewBox="0 0 240 130" className="h-full w-full max-w-[220px]" aria-hidden>
        {GAUGE_TICKS.map((tick, i) => {
          const active = i < activeTicks;
          return (
            <line
              key={i}
              x1={tick.x1}
              y1={tick.y1}
              x2={active ? tick.x2Active : tick.x2Idle}
              y2={active ? tick.y2Active : tick.y2Idle}
              stroke={active ? '#2563eb' : '#e4e4e7'}
              strokeWidth={active ? 2.5 : 2}
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
              title="From setup to insight, just three simple steps"
            />
          </div>

          {/* Sticky stacked cards, scroll through on the right */}
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
