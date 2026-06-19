'use client';

import {
  Bell,
  GitBranch,
  LayoutDashboard,
  LineChart,
  Search,
  Settings,
  Sparkles,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import {
  animate,
  motion,
  useInView,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { heroFloatingCards } from './content';

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  users: Users,
  chart: LineChart,
  roadmap: GitBranch,
  trophy: Trophy,
};

function ScrollAnimatedNumber({
  value,
  suffix = '',
  decimal = false,
  progress,
  start = 0.45,
  end = 0.72,
}: {
  value: number;
  suffix?: string;
  decimal?: boolean;
  progress: MotionValue<number>;
  start?: number;
  end?: number;
}) {
  // Count up ONCE when the stat scrolls into view. (Previously this was tied to a
  // deep scroll fraction, so the hero stats sat at 0 / 0.0% on load, looking
  // broken. In-view + animate guarantees they fill as soon as they're visible.)
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-12% 0px' });
  const [display, setDisplay] = useState(decimal ? '0.0' : '0');

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(decimal ? v.toFixed(1) : Math.round(v).toString()),
    });
    return () => controls.stop();
  }, [inView, value, decimal]);

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  );
}

function ScrollChartLine({
  path,
  progress,
  start,
  end,
}: {
  path: string;
  progress: MotionValue<number>;
  start: number;
  end: number;
}) {
  const pathLength = useTransform(progress, [start, end], [0, 1]);
  const opacity = useTransform(progress, [start, start + 0.05], [0, 1]);

  return (
    <motion.path
      d={path}
      fill="none"
      stroke="#2563eb"
      strokeWidth="2.5"
      strokeLinecap="round"
      style={{ pathLength, opacity }}
    />
  );
}

function ScrollFloatingCard({
  card,
  index,
  progress,
}: {
  card: (typeof heroFloatingCards)[number];
  index: number;
  progress: MotionValue<number>;
}) {
  const Icon = icons[card.icon];
  const cardStart = 0.25 + index * 0.08;
  const cardEnd = cardStart + 0.22;

  const opacity = useTransform(progress, [cardStart, cardEnd], [0, 1]);
  const y = useTransform(progress, [cardStart, cardEnd], [48, 0]);
  const scale = useTransform(progress, [cardStart, cardEnd], [0.88, 1]);
  const floatY = useTransform(progress, [cardEnd, 1], [0, -6 * (index % 2 === 0 ? 1 : -1)]);

  return (
    <motion.div
      style={{ opacity, y, scale }}
      className={`absolute z-30 hidden w-48 rounded-2xl border border-zinc-200/80 bg-white/95 p-4 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-sm md:block lg:w-52 ${card.position}`}
    >
      <motion.div style={{ y: floatY }}>
        <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-brand-100 bg-brand-50 text-brand-600">
          <Icon className="h-4 w-4" />
        </span>
        <h4 className="mb-1 text-sm font-semibold text-brand-900">{card.title}</h4>
        <p className="text-xs leading-relaxed text-zinc-500">{card.description}</p>
      </motion.div>
    </motion.div>
  );
}

const menteeRows = [
  { name: 'Alex Chen', track: 'Staff Engineer Prep', progress: 78, positive: true },
  { name: 'Jordan Lee', track: 'Engineering Manager', progress: 62, positive: true },
  { name: 'Sam Rivera', track: 'Platform Lead', progress: 45, positive: false },
  { name: 'Priya Patel', track: 'Senior IC Track', progress: 91, positive: true },
];

export function HeroDashboard() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: scrollRef,
    offset: ['start 1', 'start 0.15'],
  });

  // Dashboard rises, scales, and tilts as you scroll into view
  const dashboardY = useTransform(scrollYProgress, [0, 1], [80, 0]);
  const dashboardScale = useTransform(scrollYProgress, [0, 0.6, 1], [0.78, 0.96, 1]);
  const dashboardOpacity = useTransform(scrollYProgress, [0, 0.35, 1], [0, 0.6, 1]);
  const dashboardRotateX = useTransform(scrollYProgress, [0, 1], [22, 4]);
  const glowOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 0.5, 0.8]);

  // Internal blocks stagger on scroll
  const statsOpacity = useTransform(scrollYProgress, [0.38, 0.55], [0, 1]);
  const statsY = useTransform(scrollYProgress, [0.38, 0.55], [32, 0]);

  const chartsOpacity = useTransform(scrollYProgress, [0.48, 0.65], [0, 1]);
  const chartsY = useTransform(scrollYProgress, [0.48, 0.65], [28, 0]);

  const tableOpacity = useTransform(scrollYProgress, [0.58, 0.78], [0, 1]);
  const tableY = useTransform(scrollYProgress, [0.58, 0.78], [24, 0]);

  return (
    <div ref={scrollRef} className="relative mx-auto w-full max-w-5xl px-2 pb-6 sm:px-0 sm:pb-10">
      {/* Scroll track spacer, gives room for scroll-driven animation */}
      <div className="pointer-events-none absolute inset-x-0 -top-8 h-8" aria-hidden />

      <motion.div
        style={{ opacity: glowOpacity }}
        className="pointer-events-none absolute inset-x-8 top-1/4 h-1/2 rounded-full bg-brand-500/15 blur-3xl"
      />

      {heroFloatingCards.map((card, index) => (
        <ScrollFloatingCard key={card.title} card={card} index={index} progress={scrollYProgress} />
      ))}

      <div className="relative" style={{ perspective: '1600px' }}>
        <motion.div
          style={{
            y: dashboardY,
            scale: dashboardScale,
            opacity: dashboardOpacity,
            rotateX: dashboardRotateX,
            transformStyle: 'preserve-3d',
          }}
          className="relative origin-center will-change-transform"
        >
          <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-2 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.03)] sm:rounded-3xl sm:p-2.5">
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 sm:rounded-2xl">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-200/80 bg-white px-3 py-2.5 sm:px-4 sm:py-3">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-red-300/80" />
                  <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-amber-300/80" />
                  <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-emerald-300/80" />
                  <span className="ml-1 min-w-0 truncate font-mono text-[10px] text-zinc-400 sm:ml-2 sm:text-[11px]">
                    acme.pathment.me/analytics
                  </span>
                </div>
                <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-brand-100 bg-brand-50 px-2 py-0.5 text-[9px] font-semibold text-brand-600 sm:text-[10px]">
                  <Sparkles className="h-3 w-3" /> AI ACTIVE
                </span>
              </div>

              <div className="flex min-h-[320px] sm:min-h-[380px]">
                <div className="hidden w-44 flex-shrink-0 border-r border-zinc-100 bg-zinc-50/80 p-4 sm:block md:w-48">
                  <div className="mb-6 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-xs font-bold text-white">
                      P
                    </span>
                    <span className="text-sm font-bold text-brand-900">Pathment</span>
                  </div>
                  <nav className="space-y-1 text-xs font-medium text-zinc-500">
                    {[
                      { icon: LayoutDashboard, label: 'Program Overview', active: true },
                      { icon: Users, label: 'Active Cohorts' },
                      { icon: GitBranch, label: 'Skill Blueprints' },
                      { icon: LineChart, label: 'Progress Analytics' },
                      { icon: Trophy, label: 'Leaderboard' },
                    ].map(({ icon: Icon, label, active }) => (
                      <span
                        key={label}
                        className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${active ? 'bg-white text-brand-900 shadow-sm-soft' : ''}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </span>
                    ))}
                  </nav>
                </div>

                <div className="flex-1 bg-[#fcfcfd] p-3 sm:p-5">
                  <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4 sm:gap-3">
                    <h3 className="truncate text-sm font-semibold text-brand-900 sm:text-base">
                      Program Overview
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <div className="hidden items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 sm:flex">
                        <Search className="h-3.5 w-3.5 text-zinc-400" />
                        <span className="text-xs text-zinc-400">Search cohorts...</span>
                      </div>
                      <button type="button" aria-label="Settings" className="rounded-lg border border-zinc-200 bg-white p-1.5">
                        <Settings className="h-3.5 w-3.5 text-zinc-500" />
                      </button>
                      <button type="button" aria-label="Notifications" className="rounded-lg border border-zinc-200 bg-white p-1.5">
                        <Bell className="h-3.5 w-3.5 text-zinc-500" />
                      </button>
                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600" />
                    </div>
                  </div>

                  <motion.div style={{ opacity: statsOpacity, y: statsY }} className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
                    {[
                      { icon: Wallet, label: 'Active Pairs', value: 58, suffix: '', decimal: false, start: 0.42 },
                      { icon: Users, label: 'Pathways', value: 124, suffix: '', decimal: false, start: 0.46 },
                      { icon: LineChart, label: 'Completion', value: 91.4, suffix: '%', decimal: true, start: 0.5 },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-xl border border-zinc-200/80 bg-white p-3 sm:p-3.5"
                      >
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                            <stat.icon className="h-3 w-3" />
                          </span>
                          <span className="truncate text-[9px] font-bold uppercase tracking-wider text-zinc-400 sm:text-[10px]">
                            {stat.label}
                          </span>
                        </div>
                        <div className="text-lg font-semibold text-brand-900 sm:text-xl">
                          <ScrollAnimatedNumber
                            value={stat.value}
                            suffix={stat.suffix}
                            decimal={stat.decimal}
                            progress={scrollYProgress}
                            start={stat.start}
                            end={stat.start + 0.2}
                          />
                        </div>
                      </div>
                    ))}
                  </motion.div>

                  <motion.div style={{ opacity: chartsOpacity, y: chartsY }} className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                    {[
                      {
                        title: 'Cohort Progress Trend',
                        path: 'M10,80 C30,70 50,60 70,55 S110,35 140,30 S170,20 190,15',
                        start: 0.52,
                      },
                      {
                        title: 'Milestone Completion',
                        path: 'M10,70 C40,65 60,50 90,45 S130,25 160,20 S180,15 190,10',
                        start: 0.58,
                      },
                    ].map((chart) => (
                      <div
                        key={chart.title}
                        className="rounded-xl border border-zinc-200/80 bg-white p-3 sm:p-4"
                      >
                        <div className="mb-2 text-[11px] font-semibold text-zinc-800 sm:text-xs">
                          {chart.title}
                        </div>
                        <svg viewBox="0 0 200 90" className="h-16 w-full sm:h-20">
                          {[20, 40, 60, 80].map((y) => (
                            <line
                              key={y}
                              x1="10"
                              y1={y}
                              x2="190"
                              y2={y}
                              stroke="#f4f4f5"
                              strokeWidth="1"
                            />
                          ))}
                          <line x1="10" y1="85" x2="190" y2="85" stroke="#e4e4e7" strokeWidth="1" />
                          <ScrollChartLine
                            path={chart.path}
                            progress={scrollYProgress}
                            start={chart.start}
                            end={chart.start + 0.22}
                          />
                        </svg>
                      </div>
                    ))}
                  </motion.div>

                  <motion.div style={{ opacity: tableOpacity, y: tableY }} className="rounded-xl border border-zinc-200/80 bg-white p-3 sm:p-4">
                    <div className="mb-2.5 text-[11px] font-semibold text-zinc-800 sm:text-xs">
                      Active Mentees
                    </div>
                    <div className="space-y-1.5">
                      {menteeRows.map((row, i) => (
                        <ScrollMenteeRow key={row.name} row={row} index={i} progress={scrollYProgress} />
                      ))}
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:hidden">
        {heroFloatingCards.map((card) => {
          const Icon = icons[card.icon];
          return (
            <div
              key={card.title}
              className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm-soft"
            >
              <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-brand-100 bg-brand-50 text-brand-600">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <h4 className="text-xs font-semibold text-brand-900">{card.title}</h4>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScrollMenteeRow({
  row,
  index,
  progress,
}: {
  row: (typeof menteeRows)[number];
  index: number;
  progress: MotionValue<number>;
}) {
  const start = 0.62 + index * 0.04;
  const end = start + 0.12;
  const opacity = useTransform(progress, [start, end], [0, 1]);
  const x = useTransform(progress, [start, end], [-20, 0]);

  return (
    <motion.div
      style={{ opacity, x }}
      className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50/50 px-2.5 py-2 sm:px-3 sm:py-2.5"
    >
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
          {row.name.charAt(0)}
        </div>
        <div>
          <div className="text-[11px] font-semibold text-brand-900 sm:text-xs">{row.name}</div>
          <div className="text-[10px] text-zinc-500">{row.track}</div>
        </div>
      </div>
      <div className={`text-[11px] font-semibold sm:text-xs ${row.positive ? 'text-emerald-600' : 'text-amber-600'}`}>
        {row.progress}%
      </div>
    </motion.div>
  );
}
