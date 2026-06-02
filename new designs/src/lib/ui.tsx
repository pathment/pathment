import type { ReactNode } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Briefcase,
  Home as HomeIcon,
  Zap,
  Cpu,
  Heart,
  Wifi,
  Circle,
} from 'lucide-react';
import type {
  Momentum,
  Risk,
  Sentiment,
  TaskType,
  TaskStatus,
  FrictionKind,
} from './types';

/* ----------------------------------------------------------------
   class helper
----------------------------------------------------------------- */
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

/* ----------------------------------------------------------------
   Avatar - monochrome monogram tile. Sharp corners, mono type, a single
   hairline. No rainbow fills (that's the generic-SaaS tell). Identity comes
   from the ink-on-paper tile + a tiny mono initial, like a filing label.
----------------------------------------------------------------- */
export function Avatar({
  name,
  initials,
  size = 'md',
}: {
  name?: string;
  initials: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}) {
  const sizes: Record<string, string> = {
    xs: 'h-6 w-6 text-[9px]',
    sm: 'h-8 w-8 text-[10px]',
    md: 'h-10 w-10 text-xs',
    lg: 'h-11 w-11 text-xs',
    xl: 'h-14 w-14 text-sm',
  };
  return (
    <div
      title={name}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-r border border-ink bg-ink font-mono font-semibold tracking-wider text-white',
        sizes[size],
      )}
    >
      {initials}
    </div>
  );
}

/* ----------------------------------------------------------------
   Badge - flat hairline-outlined label. White ground, colored ink + border,
   no pastel fill, near-square corners, mono type. Reads like a stamped tag.
----------------------------------------------------------------- */
type Tone = 'neutral' | 'brand' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet';

const TONE: Record<Tone, string> = {
  neutral: 'border-hairline text-ink-mute',
  brand: 'border-brand-200 text-brand-700',
  emerald: 'border-emerald-200 text-emerald-700',
  amber: 'border-amber-200 text-amber-700',
  rose: 'border-rose-200 text-[#FF3B30]',
  sky: 'border-sky-200 text-sky-700',
  violet: 'border-brand-200 text-brand-700',
};

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-r border bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em]',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------
   Card
----------------------------------------------------------------- */
export function Card({
  children,
  className = '',
  hover = false,
  ...props
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('card', hover && 'card-hover cursor-pointer', className)} {...props}>
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------
   ProgressBar
----------------------------------------------------------------- */
export function ProgressBar({
  value,
  tone = 'brand',
  height = 'h-1.5',
  track = 'bg-neutral-100',
}: {
  value: number;
  tone?: 'brand' | 'emerald' | 'amber' | 'rose' | 'neutral' | 'gradient';
  height?: string;
  track?: string;
}) {
  const fill: Record<string, string> = {
    brand: 'bg-brand-500',
    emerald: 'bg-emerald-600',
    amber: 'bg-amber-500',
    rose: 'bg-[#FF3B30]',
    neutral: 'bg-ink',
    gradient: 'bg-brand-500',
  };
  return (
    <div className={cx('w-full overflow-hidden', track, height)}>
      <div
        className={cx('h-full transition-all duration-500', fill[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------
   Momentum arrow
----------------------------------------------------------------- */
export function MomentumIcon({ momentum, className = '' }: { momentum: Momentum; className?: string }) {
  if (momentum === 'up') return <TrendingUp className={cx('h-4 w-4 text-emerald-600', className)} />;
  if (momentum === 'down') return <TrendingDown className={cx('h-4 w-4 text-[#FF3B30]', className)} />;
  return <Minus className={cx('h-4 w-4 text-ink-faint', className)} />;
}

/* ----------------------------------------------------------------
   Risk dot + label
----------------------------------------------------------------- */
export const RISK_META: Record<Risk, { label: string; tone: Tone; dot: string }> = {
  low: { label: 'On track', tone: 'emerald', dot: 'bg-emerald-500' },
  watch: { label: 'Watch', tone: 'amber', dot: 'bg-amber-500' },
  high: { label: 'At risk', tone: 'rose', dot: 'bg-[#FF3B30]' },
};

export function RiskDot({ risk }: { risk: Risk }) {
  return <span className={cx('inline-block h-1.5 w-1.5', RISK_META[risk].dot)} />;
}

/* ----------------------------------------------------------------
   Sentiment
----------------------------------------------------------------- */
export const SENTIMENT_META: Record<Sentiment, { label: string; tone: Tone }> = {
  positive: { label: 'Positive', tone: 'emerald' },
  neutral: { label: 'Neutral', tone: 'neutral' },
  low: { label: 'Low', tone: 'rose' },
};

/* ----------------------------------------------------------------
   Task type + status meta
----------------------------------------------------------------- */
export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  assignment: 'Assignment',
  project: 'Project',
  quiz: 'Quiz',
  reading: 'Reading',
  video: 'Video',
  discussion: 'Discussion',
};

export const STATUS_META: Record<TaskStatus, { label: string; tone: Tone }> = {
  assigned: { label: 'Assigned', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'sky' },
  submitted: { label: 'Submitted', tone: 'brand' },
  under_review: { label: 'Under review', tone: 'violet' },
  completed: { label: 'Completed', tone: 'emerald' },
  changes_requested: { label: 'Changes requested', tone: 'amber' },
  rejected: { label: 'Rejected', tone: 'rose' },
};

/* ----------------------------------------------------------------
   Friction kind meta (icon + label)
----------------------------------------------------------------- */
export const FRICTION_META: Record<
  FrictionKind,
  { label: string; icon: typeof Briefcase }
> = {
  job: { label: 'Job load', icon: Briefcase },
  domestic: { label: 'Domestic', icon: HomeIcon },
  electricity: { label: 'Electricity', icon: Zap },
  hardware: { label: 'Hardware', icon: Cpu },
  health: { label: 'Health', icon: Heart },
  connectivity: { label: 'Connectivity', icon: Wifi },
  other: { label: 'Other', icon: Circle },
};

/* ----------------------------------------------------------------
   Section label
----------------------------------------------------------------- */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="eyebrow mb-3">{children}</div>;
}

/* ----------------------------------------------------------------
   AI marker - deliberately quiet. A small blue dot + a mono label.
   Recognizable as the AI layer without any sparkle/glow.
----------------------------------------------------------------- */
export function AiTag({ children = 'Pathment AI' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">
      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------
   Button
----------------------------------------------------------------- */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: {
  children: ReactNode;
  variant?: 'primary' | 'soft' | 'ghost' | 'outline' | 'danger' | 'success';
  size?: 'sm' | 'md';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants: Record<string, string> = {
    primary: 'bg-ink text-white hover:bg-neutral-800 border border-ink',
    soft: 'bg-white text-brand-700 border border-brand-200 hover:bg-brand-50',
    ghost: 'text-ink-soft hover:bg-neutral-100 border border-transparent',
    outline: 'border border-hairline text-ink-soft hover:border-ink hover:text-ink',
    danger: 'bg-white text-[#FF3B30] border border-rose-200 hover:bg-rose-50',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-600',
  };
  const sizes: Record<string, string> = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-9 px-4 text-sm gap-2',
  };
  return (
    <button
      className={cx(
        'rounded-r inline-flex items-center justify-center font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------
   IconButton
----------------------------------------------------------------- */
export function IconButton({
  children,
  className = '',
  ...props
}: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cx(
        'rounded-r inline-flex h-9 w-9 items-center justify-center text-ink-mute transition-colors hover:bg-neutral-100 hover:text-ink',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
