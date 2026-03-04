import React from 'react';

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
}: AvatarWithInitialsProps) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
  const s = SIZE_CLS[size];

  if (avatarOnly) {
    return (
      <div className={`rounded-full flex items-center justify-center font-semibold shrink-0 ${s.avatar} ${colorClass}`}>
        {initials}
      </div>
    );
  }

  return (
    <div className={`flex items-center min-w-0 ${s.text}`}>
      <div className={`rounded-full flex items-center justify-center font-semibold shrink-0 ${s.avatar} ${colorClass}`}>
        {initials}
      </div>
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
