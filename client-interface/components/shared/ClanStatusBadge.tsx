'use client';

import { MoonStar, Archive } from 'lucide-react';

/**
 * A clan's lifecycle status, shown only when it is not the normal 'active'.
 *
 * 'inactive' is a re-assignment flag, not a lock: the clan keeps working, the
 * system simply never suggests it when it distributes new mentees. The tooltip
 * says so, because "inactive" on its own reads like "broken".
 */
export const CLAN_STATUS_HINT: Record<string, string> = {
  active: 'Works normally and is suggested when the system distributes mentees.',
  inactive: 'Works normally, but the system never suggests it for new mentees. You can still place someone here by hand.',
  archived: 'Closed. Nobody can be placed here.',
};

export function ClanStatusBadge({ status, className = '' }: { status?: string | null; className?: string }) {
  if (!status || status === 'active') return null;
  const inactive = status === 'inactive';
  const Icon = inactive ? MoonStar : Archive;
  return (
    <span
      title={CLAN_STATUS_HINT[status] || status}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        inactive
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
          : 'bg-muted text-muted-foreground'
      } ${className}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {inactive ? 'Inactive' : 'Archived'}
    </span>
  );
}

export default ClanStatusBadge;
