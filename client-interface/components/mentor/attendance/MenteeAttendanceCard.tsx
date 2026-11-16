import React, { useEffect, useRef } from 'react';
import { Check, X, Minus, HelpCircle } from 'lucide-react';
import { getInitials } from '@/lib/utils/formatting';
import { Avatar } from '@/components/shared/Avatar';

type Attendance = 'present' | 'absent' | 'excused' | null;

export interface AttendanceMentee {
  id: string;
  name: string;
  /** Pre-computed initials from the cohort payload; falls back to deriving them. */
  avatar?: string;
  profilePictureUrl?: string | null;
  /** Submissions waiting for the mentor. */
  pendingApprovals?: number;
}

/** Today's plan for one mentee: undefined while it loads. */
export type FacePlan = { hasPlan: boolean; total: number; done: number } | undefined;

interface MenteeAttendanceCardProps {
  mentee: AttendanceMentee;
  attendance: Attendance;
  isActive: boolean;
  onClick: () => void;
  plan?: FacePlan;
}

/**
 * One face in clan review's row, readable without opening anyone:
 *
 *   the ring    how far through TODAY'S PLAN they are — it fills as they tick
 *               work off, turns green when the day is done, and is dashed when
 *               they have no plan at all (the case a mentor most needs to see);
 *   the badge   attendance (tick / cross / dash / question);
 *   the dot     work waiting for the mentor's review, with a count.
 *
 * So a mentor stepping through a hundred people can see who is behind and who
 * is waiting on them, and skip the ones who are fine.
 */

const BADGE: Record<NonNullable<Attendance> | 'null', { cls: string; Icon: typeof Check }> = {
  present: { cls: 'bg-emerald-500 text-white', Icon: Check },
  absent: { cls: 'bg-red-500 text-white', Icon: X },
  excused: { cls: 'bg-amber-400 text-white', Icon: Minus },
  null: { cls: 'bg-slate-300 text-white', Icon: HelpCircle },
};

export function MenteeAttendanceCard({ mentee, attendance, isActive, onClick, plan }: MenteeAttendanceCardProps) {
  const key = (attendance ?? 'null') as NonNullable<Attendance> | 'null';
  const { cls: badgeCls, Icon } = BADGE[key];
  const initials = mentee.avatar || getInitials(mentee.name);
  const firstName = mentee.name.split(' ')[0];

  // When this becomes the active mentee (e.g. via the Prev/Next/Skip buttons),
  // bring the chip into view so the mentor can see where they are in the rail.
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (isActive) ref.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [isActive]);

  return (
    <button
      ref={ref}
      onClick={onClick}
      title={faceTitle(mentee, attendance, plan)}
      aria-pressed={isActive}
      className={`group/card relative flex shrink-0 snap-start flex-col items-center gap-2 rounded-2xl px-1.5 pb-1.5 pt-2 outline-none transition-colors ${
        isActive ? 'w-[92px] bg-brand-50/80 dark:bg-brand-500/10' : 'w-[84px]'
      }`}
    >
      {/* The one being reviewed is lifted out of the row entirely: its own
          tinted tile, a bigger avatar, and a marker pointing at the card below
          it. A thin ring on a row of fourteen faces was not findable. */}
      {isActive && (
        <span
          aria-hidden
          className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] bg-brand-500"
        />
      )}
      <div className="relative">
        {/* Today's plan, as a ring that fills. */}
        <div className={`relative rounded-full p-[5px] transition-transform duration-200 group-hover/card:-translate-y-0.5 ${
          isActive ? 'scale-110 drop-shadow-[0_6px_12px_rgba(16,185,129,0.25)]' : ''}`}>
          <PlanRing plan={plan} />
          <div className="relative rounded-full bg-card p-[1px]">
            <Avatar
              name={mentee.name}
              src={mentee.profilePictureUrl}
              initials={initials}
              size="lg"
            />
          </div>
        </div>

        {/* Waiting for review: the one thing on the row that is the mentor's move. */}
        {!!mentee.pendingApprovals && (
          <span className="absolute -right-1 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card bg-brand-600 px-1 text-[10px] font-bold tabular-nums text-white"
            aria-label={`${mentee.pendingApprovals} waiting for review`}>
            {mentee.pendingApprovals}
          </span>
        )}

        {/* Status badge — bottom-right tick / cross / dash / question. */}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-card flex items-center justify-center ${badgeCls}`}
        >
          <Icon className="w-3 h-3" strokeWidth={3} />
        </span>
      </div>

      <span
        className={`max-w-full truncate text-xs ${
          isActive
            ? 'rounded-full bg-brand-600 px-2 py-0.5 font-semibold text-white'
            : 'font-medium text-slate-700 group-hover/card:text-slate-900'
        }`}
      >
        {firstName}
      </span>
    </button>
  );
}

function faceTitle(mentee: AttendanceMentee, attendance: Attendance, plan: FacePlan) {
  const parts = [mentee.name, attendance ?? 'not marked'];
  if (plan) parts.push(plan.hasPlan ? `today ${plan.done}/${plan.total} done` : 'no plan today');
  if (mentee.pendingApprovals) parts.push(`${mentee.pendingApprovals} to review`);
  return parts.join(' — ');
}

/**
 * The plan ring, drawn around the avatar. A track, and an arc for the share
 * of today's plan that is done; green once it is all done; dashed with no
 * plan; a plain track while it loads, so the row never flickers colours.
 */
function PlanRing({ plan }: { plan: FacePlan }) {
  const R = 31.5;
  const C = 2 * Math.PI * R;
  const share = plan && plan.total > 0 ? plan.done / plan.total : 0;
  const complete = !!plan && plan.total > 0 && plan.done === plan.total;
  const none = !!plan && !plan.hasPlan;
  return (
    <svg viewBox="0 0 68 68" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
      <circle cx="34" cy="34" r={R} fill="none" strokeWidth="3.5"
        className={none ? 'stroke-slate-300 dark:stroke-slate-600' : 'stroke-slate-200 dark:stroke-slate-700'}
        strokeDasharray={none ? '3 4' : undefined} />
      {!none && share > 0 && (
        <circle cx="34" cy="34" r={R} fill="none" strokeWidth="3.5" strokeLinecap="round"
          className={`transition-[stroke-dashoffset] duration-500 ease-out ${complete ? 'stroke-emerald-500' : 'stroke-brand-500'}`}
          strokeDasharray={C} strokeDashoffset={C * (1 - share)} />
      )}
    </svg>
  );
}
