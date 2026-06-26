import React from 'react';
import { Check, X, Minus, HelpCircle } from 'lucide-react';
import { getInitials } from '@/lib/utils/formatting';

type Attendance = 'present' | 'absent' | 'excused' | null;

export interface AttendanceMentee {
  id: string;
  name: string;
  /** Pre-computed initials from the cohort payload; falls back to deriving them. */
  avatar?: string;
  profilePictureUrl?: string | null;
}

interface MenteeAttendanceCardProps {
  mentee: AttendanceMentee;
  attendance: Attendance;
  isActive: boolean;
  onClick: () => void;
}

/**
 * Instagram-story-style attendance chip: a circular avatar wrapped in a
 * status-coloured ring, a small status badge, and the mentee's first name.
 * The ring/badge encode attendance at a glance (green = present, red = absent,
 * amber = excused, grey = not yet marked), and the active mentee gets a brand
 * halo so the mentor never loses their place while scrubbing the cohort.
 */

const RING: Record<NonNullable<Attendance> | 'null', string> = {
  present: 'bg-emerald-500',
  absent: 'bg-red-500',
  excused: 'bg-amber-400',
  null: 'bg-slate-200',
};

const BADGE: Record<NonNullable<Attendance> | 'null', { cls: string; Icon: typeof Check }> = {
  present: { cls: 'bg-emerald-500 text-white', Icon: Check },
  absent: { cls: 'bg-red-500 text-white', Icon: X },
  excused: { cls: 'bg-amber-400 text-white', Icon: Minus },
  null: { cls: 'bg-slate-300 text-white', Icon: HelpCircle },
};

export function MenteeAttendanceCard({ mentee, attendance, isActive, onClick }: MenteeAttendanceCardProps) {
  const key = (attendance ?? 'null') as NonNullable<Attendance> | 'null';
  const ring = RING[key];
  const { cls: badgeCls, Icon } = BADGE[key];
  const initials = mentee.avatar || getInitials(mentee.name);
  const firstName = mentee.name.split(' ')[0];

  return (
    <button
      onClick={onClick}
      title={`${mentee.name} — ${attendance ?? 'not marked'}`}
      aria-pressed={isActive}
      className="group/card flex flex-col items-center gap-2 shrink-0 w-[84px] snap-start outline-none"
    >
      <div className="relative">
        {/* Status ring — a coloured halo around the avatar. */}
        <div
          className={`rounded-full p-[3px] transition-transform duration-200 group-hover/card:-translate-y-0.5 ${ring} ${
            isActive ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-card' : ''
          }`}
        >
          <div className="rounded-full bg-card p-[2px]">
            {mentee.profilePictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mentee.profilePictureUrl}
                alt={mentee.name}
                className="w-14 h-14 rounded-full object-cover"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center text-brand-700 font-semibold text-base">
                {initials}
              </div>
            )}
          </div>
        </div>

        {/* Status badge — bottom-right tick / cross / dash / question. */}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-card flex items-center justify-center ${badgeCls}`}
        >
          <Icon className="w-3 h-3" strokeWidth={3} />
        </span>
      </div>

      <span
        className={`max-w-full truncate text-xs font-medium ${
          isActive ? 'text-brand-700' : 'text-slate-700 group-hover/card:text-slate-900'
        }`}
      >
        {firstName}
      </span>
    </button>
  );
}
