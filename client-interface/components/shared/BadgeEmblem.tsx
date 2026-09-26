'use client';

import { useState, type ComponentType } from 'react';
import {
  Award,
  BookOpen,
  Flame,
  Handshake,
  Medal,
  Sparkles,
  Star,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';

export const BADGE_ICON_PRESETS = [
  'trophy',
  'flame',
  'star',
  'target',
  'award',
  'sparkles',
  'handshake',
  'zap',
  'book',
  'medal',
] as const;

export type BadgeIconPreset = (typeof BADGE_ICON_PRESETS)[number];

type Theme = {
  label: string;
  Icon: ComponentType<{ className?: string }>;
  emblem: string;
  ring: string;
  chip: string;
  bar: string;
};

const ICONS: Record<BadgeIconPreset, ComponentType<{ className?: string }>> = {
  trophy: Trophy,
  flame: Flame,
  star: Star,
  target: Target,
  award: Award,
  sparkles: Sparkles,
  handshake: Handshake,
  zap: Zap,
  book: BookOpen,
  medal: Medal,
};

const THEMES: Record<string, Theme> = {
  points: {
    label: 'XP milestone',
    Icon: Trophy,
    emblem: 'from-amber-400 to-orange-600',
    ring: 'ring-amber-100',
    chip: 'bg-amber-50 text-amber-800 ring-amber-200/80',
    bar: 'bg-amber-400',
  },
  streak: {
    label: 'Consistency',
    Icon: Flame,
    emblem: 'from-orange-400 to-rose-600',
    ring: 'ring-orange-100',
    chip: 'bg-orange-50 text-orange-800 ring-orange-200/80',
    bar: 'bg-orange-400',
  },
  level: {
    label: 'Level',
    Icon: Star,
    emblem: 'from-sky-400 to-brand-600',
    ring: 'ring-sky-100',
    chip: 'bg-sky-50 text-sky-800 ring-sky-200/80',
    bar: 'bg-sky-400',
  },
  community: {
    label: 'Community',
    Icon: Handshake,
    emblem: 'from-teal-400 to-emerald-700',
    ring: 'ring-teal-100',
    chip: 'bg-teal-50 text-teal-800 ring-teal-200/80',
    bar: 'bg-teal-500',
  },
  milestone: {
    label: 'Milestone',
    Icon: Target,
    emblem: 'from-brand-400 to-cyan-700',
    ring: 'ring-brand-100',
    chip: 'bg-brand-50 text-brand-800 ring-brand-200/80',
    bar: 'bg-brand-500',
  },
  achievement: {
    label: 'Achievement',
    Icon: Award,
    emblem: 'from-brand-500 to-teal-700',
    ring: 'ring-brand-100',
    chip: 'bg-brand-50 text-brand-800 ring-brand-200/80',
    bar: 'bg-brand-600',
  },
  mentor: {
    label: 'Recognition',
    Icon: Sparkles,
    emblem: 'from-slate-600 to-brand-700',
    ring: 'ring-slate-200',
    chip: 'bg-slate-100 text-slate-800 ring-slate-300/80',
    bar: 'bg-slate-600',
  },
  quality: {
    label: 'Quality',
    Icon: Star,
    emblem: 'from-violet-400 to-brand-700',
    ring: 'ring-violet-100',
    chip: 'bg-violet-50 text-violet-800 ring-violet-200/80',
    bar: 'bg-violet-500',
  },
};

const CRITERIA_PRESET: Record<string, BadgeIconPreset> = {
  points_milestone: 'trophy',
  streak_days: 'flame',
  level_reached: 'star',
  tasks_completed: 'target',
  programs_completed: 'book',
  badges_earned: 'medal',
  avg_rating: 'star',
  skill_mastery: 'book',
  custom: 'award',
};

const FALLBACK_THEME: Theme = {
  label: 'Badge',
  Icon: Zap,
  emblem: 'from-slate-500 to-slate-700',
  ring: 'ring-slate-200',
  chip: 'bg-slate-100 text-slate-700 ring-slate-200/80',
  bar: 'bg-slate-500',
};

export function themeForCategory(category?: string | null): Theme {
  const key = String(category || '').toLowerCase();
  return THEMES[key] || { ...FALLBACK_THEME, label: category || 'Badge' };
}

export function defaultPresetForBadge(badge: {
  category?: string | null;
  criteriaType?: string | null;
}): BadgeIconPreset {
  const category = String(badge.category || '').toLowerCase();
  const fromTheme = THEMES[category];
  if (fromTheme) {
    const match = (Object.entries(ICONS) as [BadgeIconPreset, ComponentType<{ className?: string }>][])
      .find(([, Icon]) => Icon === fromTheme.Icon);
    if (match) return match[0];
  }
  const criteria = String(badge.criteriaType || '').toLowerCase();
  return CRITERIA_PRESET[criteria] || 'zap';
}

export function parseBadgeIconUrl(iconUrl?: string | null): {
  kind: 'image' | 'preset' | 'default';
  preset: BadgeIconPreset | null;
  imageUrl: string | null;
} {
  if (!iconUrl) return { kind: 'default', preset: null, imageUrl: null };
  const value = String(iconUrl).trim();
  if (!value) return { kind: 'default', preset: null, imageUrl: null };

  if (value.startsWith('preset:')) {
    const key = value.slice('preset:'.length).toLowerCase() as BadgeIconPreset;
    if ((BADGE_ICON_PRESETS as readonly string[]).includes(key)) {
      return { kind: 'preset', preset: key, imageUrl: null };
    }
    return { kind: 'default', preset: null, imageUrl: null };
  }

  if ((BADGE_ICON_PRESETS as readonly string[]).includes(value.toLowerCase())) {
    return { kind: 'preset', preset: value.toLowerCase() as BadgeIconPreset, imageUrl: null };
  }

  if (/^https:\/\//i.test(value)) {
    return { kind: 'image', preset: null, imageUrl: value };
  }

  return { kind: 'default', preset: null, imageUrl: null };
}

export function storedIconValue(selection: {
  preset: BadgeIconPreset | 'default' | null;
  imageUrl: string | null;
}): string | null {
  if (selection.imageUrl) return selection.imageUrl;
  if (selection.preset && selection.preset !== 'default') return `preset:${selection.preset}`;
  return null;
}

export function BadgeEmblem({
  name,
  category,
  criteriaType,
  iconUrl,
  size = 'md',
  muted = false,
  className = '',
}: {
  name: string;
  category?: string | null;
  criteriaType?: string | null;
  iconUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  muted?: boolean;
  className?: string;
}) {
  const theme = themeForCategory(category);
  const parsed = parseBadgeIconUrl(iconUrl);
  const fallbackPreset = defaultPresetForBadge({ category, criteriaType });
  const preset = parsed.preset || fallbackPreset;
  const Icon = ICONS[preset] || theme.Icon;
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = parsed.kind === 'image' && parsed.imageUrl && !imageFailed;

  const sizes = {
    sm: 'h-10 w-10 rounded-xl ring-2',
    md: 'h-12 w-12 rounded-2xl ring-4 sm:h-14 sm:w-14',
    lg: 'h-16 w-16 rounded-2xl ring-4',
  };
  const iconSizes = { sm: 'h-4 w-4', md: 'h-5 w-5 sm:h-6 sm:w-6', lg: 'h-7 w-7' };

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-linear-to-br text-white shadow-md ${sizes[size]} ${theme.emblem} ${theme.ring} ${muted ? 'opacity-70 grayscale-[0.35]' : ''} ${className}`}
      role="img"
      aria-label={`${name} badge icon`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={parsed.imageUrl!}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Icon className={iconSizes[size]} aria-hidden />
      )}
    </div>
  );
}

export function PresetIconGlyph({
  preset,
  className = 'h-5 w-5',
}: {
  preset: BadgeIconPreset;
  className?: string;
}) {
  const Icon = ICONS[preset] || Zap;
  return <Icon className={className} aria-hidden />;
}
