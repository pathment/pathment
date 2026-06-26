import React from 'react';
import Link from 'next/link';

interface AvatarWithInitialsProps {
  firstName?: string;
  lastName?: string;
  /** Shown below the initials if provided */
  email?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Tailwind classes for bg + text colour */
  colorClass?: string;
  /** When true, renders only the avatar circle (no name/email text) */
  avatarOnly?: boolean;
  /** Profile photo URL — shown instead of initials when present. */
  src?: string | null;
  /** When set, the avatar circle links here (e.g. the person's detail page). */
  href?: string;
}

const SIZE_CLS: Record<string, { avatar: string; text: string; name: string; sub: string }> = {
  sm: { avatar: 'w-7 h-7 text-[11px]', text: 'gap-2',  name: 'text-sm',  sub: 'text-xs' },
  md: { avatar: 'w-9 h-9 text-xs',     text: 'gap-3',  name: 'text-sm',  sub: 'text-xs' },
  lg: { avatar: 'w-12 h-12 text-sm',   text: 'gap-4',  name: 'text-base', sub: 'text-sm' },
};

export function AvatarWithInitials({
  firstName = '',
  lastName = '',
  email,
  size = 'md',
  colorClass = 'bg-slate-200 text-slate-600',
  avatarOnly = false,
  src,
  href,
}: AvatarWithInitialsProps) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
  const s = SIZE_CLS[size];

  const circle = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={`${firstName} ${lastName}`.trim()} className={`rounded-full object-cover shrink-0 ${s.avatar}`} />
  ) : (
    <div className={`rounded-full flex items-center justify-center font-semibold shrink-0 ${s.avatar} ${colorClass}`}>
      {initials}
    </div>
  );

  const avatar = href ? (
    <Link href={href} onClick={(e) => e.stopPropagation()} className="shrink-0 rounded-full transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-400">
      {circle}
    </Link>
  ) : circle;

  if (avatarOnly) return avatar;

  return (
    <div className={`flex items-center min-w-0 ${s.text}`}>
      {avatar}
      <div className="min-w-0">
        <p className={`font-medium text-slate-900 truncate ${s.name}`}>
          {firstName} {lastName}
        </p>
        {email && (
          <p className={`text-slate-500 truncate ${s.sub}`}>{email}</p>
        )}
      </div>
    </div>
  );
}
