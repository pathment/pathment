import {
  LayoutGrid,
  Users,
  ClipboardCheck,
  CalendarRange,
  ListTodo,
  LineChart,
  ShieldAlert,
  Activity,
  BarChart3,
  Settings,
  Flag,
  MessageSquare,
  Route as RouteIcon,
  BookOpen,
  PenLine,
  Megaphone,
  FileText,
  Trophy,
  Gift,
  Gauge,
  BadgeCheck,
  BookMarked,
  Layers,
  GitPullRequestArrow,
  Heart,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: 'approvals' | 'risk';
}

export const NAV: Record<Role, NavItem[]> = {
  mentor: [
    { to: '/mentor/cockpit', label: 'Cockpit', icon: LayoutGrid },
    { to: '/mentor/mentees', label: 'My Mentees', icon: Users },
    { to: '/mentor/review', label: 'Cohort Review', icon: CalendarRange },
    { to: '/mentor/approvals', label: 'Approvals', icon: ClipboardCheck, badge: 'approvals' },
    { to: '/mentor/at-risk', label: 'At-risk', icon: ShieldAlert, badge: 'risk' },
    { to: '/mentor/roadmaps', label: 'Roadmaps', icon: RouteIcon },
    { to: '/mentor/schedules', label: 'Schedules', icon: CalendarRange },
    { to: '/mentor/scores', label: 'Progress Scores', icon: Gauge },
    { to: '/mentor/reports', label: 'Reports', icon: FileText },
    { to: '/mentor/leaderboard', label: 'Leaderboard', icon: Trophy },
    { to: '/mentor/rewards', label: 'Rewards', icon: Gift },
    { to: '/mentor/promotions', label: 'Promotions', icon: BadgeCheck },
    { to: '/mentor/library', label: 'Library', icon: BookOpen },
    { to: '/mentor/spec', label: 'Mentor Spec', icon: BookMarked },
    { to: '/mentor/settings', label: 'Settings', icon: Settings },
  ],
  mentee: [
    { to: '/mentee/this-week', label: 'This Week', icon: ListTodo },
    { to: '/mentee/log', label: 'Daily Log', icon: PenLine },
    { to: '/mentee/progress', label: 'My Progress', icon: LineChart },
    { to: '/mentee/community', label: 'Community', icon: Heart },
    { to: '/mentee/blockers', label: 'Blockers', icon: Flag },
    { to: '/mentee/meetings', label: 'My Mentor', icon: MessageSquare },
  ],
  admin: [
    { to: '/admin/health', label: 'Clan Health', icon: Activity },
    { to: '/admin/clans', label: 'Clans', icon: Layers },
    { to: '/admin/people', label: 'People', icon: Users },
    { to: '/admin/requests', label: 'Clan Requests', icon: GitPullRequestArrow },
    { to: '/admin/insights', label: 'Insights', icon: BarChart3 },
    { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
    { to: '/admin/release-notes', label: 'Release Notes', icon: Megaphone },
    { to: '/admin/library', label: 'Library', icon: BookOpen },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  mentor: 'Mentor',
  mentee: 'Mentee',
  admin: 'Admin',
};
