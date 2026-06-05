import { 
  LayoutDashboard,
  BookOpen,
  Users,
  Users2,
  ClipboardList,
  ClipboardCheck,
  AlertTriangle,
  Route,
  CalendarClock,
  CalendarCheck,
  CalendarRange,
  TrendingUp,
  Trophy,
  Gauge,
  Gift,
  FileText,
  Compass,
  Megaphone,
  GitPullRequest,
  MessageSquare,
  UserPlus,
  Settings,
  GraduationCap,
  School,
  BarChart2,
  ShieldAlert,
  Flag,
  type LucideIcon
} from 'lucide-react';
import { UserRole } from '@/lib/types';

export interface NavChildLink {
  path: string;
  icon: LucideIcon;
  label: string;
}

export interface NavLink {
  path: string;
  icon: LucideIcon;
  label: string;
  hasBadge?: boolean;
  /** If present, renders as a collapsible group with these child links */
  children?: NavChildLink[];
}

export const navigationConfig: Record<string, NavLink[]> = {
  // Default order = most-used-first (adaptive frecency reordering layers on top
  // of this; see navPreferences.ts). Keep the highest-traffic items at the top.
  admin: [
    { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/insights', icon: TrendingUp, label: 'Insights' },
    { path: '/admin/enrollment/overview', icon: Users, label: 'Enrollments' },
    { path: '/admin/clans', icon: Users2, label: 'Clans' },
    { path: '/admin/programs/list', icon: BookOpen, label: 'Programs' },
    {
      path: '/admin/users',
      icon: Users,
      label: 'Users',
      children: [
        { path: '/admin/users/mentors', icon: GraduationCap, label: 'Mentors' },
        { path: '/admin/users/mentees', icon: School, label: 'Mentees' },
      ],
    },
    { path: '/admin/messages', icon: MessageSquare, label: 'Messages', hasBadge: true },
    { path: '/admin/announcements', icon: Megaphone, label: 'Announcements' },
    { path: '/admin/cohorts', icon: CalendarRange, label: 'Intake' },
    { path: '/admin/requests', icon: GitPullRequest, label: 'Clan Requests' },
    { path: '/admin/invites', icon: UserPlus, label: 'Invites' },
    { path: '/admin/roadmaps', icon: Route, label: 'Roadmaps' },
    { path: '/admin/schedules', icon: CalendarClock, label: 'Schedules' },
    { path: '/admin/moderation', icon: ShieldAlert, label: 'Moderation' },
    { path: '/admin/activity', icon: BarChart2, label: 'Activity' },
    { path: '/admin/rewards', icon: Gift, label: 'Rewards' },
    { path: '/admin/mentor-spec', icon: Compass, label: 'Mentor Spec' },
    { path: '/admin/settings', icon: Settings, label: 'Settings' },
  ],
  mentor: [
    { path: '/mentor/dashboard', icon: LayoutDashboard, label: 'Cockpit' },
    { path: '/mentor/mentees', icon: Users2, label: 'My Mentees' },
    { path: '/mentor/approvals', icon: ClipboardCheck, label: 'Approvals' },
    { path: '/mentor/review', icon: CalendarRange, label: 'Cohort Review' },
    { path: '/mentor/at-risk', icon: AlertTriangle, label: 'At-risk' },
    { path: '/mentor/messages', icon: MessageSquare, label: 'Messages', hasBadge: true },
    { path: '/mentor/schedules', icon: CalendarClock, label: 'Schedules' },
    { path: '/mentor/roadmaps', icon: Route, label: 'Roadmaps' },
    { path: '/mentor/programs', icon: School, label: 'My Programs' },
    { path: '/mentor/reports', icon: FileText, label: 'Reports' },
    { path: '/mentor/scores', icon: Gauge, label: 'Progress Scores' },
    { path: '/mentor/announcements', icon: Megaphone, label: 'Announcements' },
    { path: '/mentor/promotions', icon: TrendingUp, label: 'Promotions' },
    { path: '/mentor/leaderboard', icon: Trophy, label: 'Leaderboard' },
    { path: '/mentor/community', icon: Users, label: 'Community' },
    { path: '/mentor/rewards', icon: Gift, label: 'Rewards' },
    { path: '/mentor/library', icon: BookOpen, label: 'Library' },
    { path: '/mentor/spec', icon: Compass, label: 'Mentor Spec' },
    { path: '/mentor/settings', icon: Settings, label: 'Settings' },
  ],
  mentee: [
    { path: '/mentee/dashboard', icon: LayoutDashboard, label: 'This Week' },
    { path: '/mentee/tasks', icon: ClipboardList, label: 'My Tasks' },
    { path: '/mentee/meetings', icon: CalendarClock, label: 'My Mentor' },
    { path: '/mentee/daily-log', icon: CalendarCheck, label: 'Daily Log' },
    { path: '/mentee/messages', icon: MessageSquare, label: 'Messages', hasBadge: true },
    { path: '/mentee/blockers', icon: Flag, label: 'Blockers' },
    { path: '/mentee/progress', icon: BarChart2, label: 'My Progress' },
    { path: '/mentee/gamification', icon: Trophy, label: 'Gamification' },
    { path: '/mentee/community', icon: Users, label: 'Community' },
    { path: '/mentee/announcements', icon: Megaphone, label: 'Announcements' },
    { path: '/mentee/settings', icon: Settings, label: 'Settings' },
  ],
} as const;

export function getNavigationLinks(role: UserRole): NavLink[] {
  return navigationConfig[role] || [];
}
