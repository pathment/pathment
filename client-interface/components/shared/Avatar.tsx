'use client';

import Link from 'next/link';
import { getInitials } from '@/lib/utils/formatting';

/**
 * The single avatar used everywhere — a profile photo with an initials fallback,
 * and an optional `href` that makes it a clickable link to the person's profile.
 * Replaces the dozens of inline `profilePictureUrl ? <img> : initials` blocks so
 * "show the photo + make it clickable" is one consistent thing across the app.
 */

const SIZES = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-2xl',
} as const;

export type AvatarSize = keyof typeof SIZES;

export interface AvatarProps {
  /** Full name — used for the initials fallback and image alt text. */
  name?: string;
  /** Profile photo URL (Cloudinary). Falls back to initials when absent. */
  src?: string | null;
  /** Precomputed initials (overrides the name-derived ones). */
  initials?: string;
  size?: AvatarSize;
  /** When set, the avatar becomes a link to this route (e.g. a detail page). */
  href?: string;
  className?: string;
  /** Subtle white ring — handy on coloured/overlapping surfaces. */
  ring?: boolean;
  title?: string;
}

export function Avatar({ name, src, initials, size = 'md', href, className = '', ring = false, title }: AvatarProps) {
  const label = initials || (name ? getInitials(name) : '?');
  const dim = SIZES[size];
  const ringCls = ring ? 'ring-2 ring-white dark:ring-slate-800' : '';

  const inner = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name || 'Profile photo'} className={`${dim} rounded-full object-cover ${ringCls} ${className}`} />
  ) : (
    <span className={`${dim} rounded-full bg-brand-100 text-brand-700 font-semibold flex items-center justify-center select-none ${ringCls} ${className}`}>
      {label}
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        title={title || name}
        // stopPropagation so clicking the avatar inside a clickable card navigates
        // to the profile rather than triggering the card's own onClick.
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 inline-flex rounded-full transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-1"
      >
        {inner}
      </Link>
    );
  }

  return <span className="shrink-0 inline-flex" title={title || name}>{inner}</span>;
}
