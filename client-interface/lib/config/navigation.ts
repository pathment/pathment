import { 
  LayoutDashboard, 
  BookOpen, 
  Users, 
  UserCheck, 
  ClipboardList,
  Trophy,
  MessageSquare,
  UserPlus,
  Settings,
  GraduationCap,
  School,
  BarChart3,
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
  admin: [
    { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
    { path: '/admin/programs/list', icon: BookOpen, label: 'Programs' },
    { path: '/admin/matching/mentor-assignment', icon: UserCheck, label: 'Mentor Matching' },
    { path: '/admin/enrollment/overview', icon: Users, label: 'Enrollments' },
    { path: '/admin/invites', icon: UserPlus, label: 'Invites' },
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
    { path: '/admin/settings', icon: Settings, label: 'Settings' },
  ],
  mentor: [
    { path: '/mentor/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/mentor/programs', icon: BookOpen, label: 'My Programs' },
    { path: '/mentor/mentees', icon: Users, label: 'My Mentees' },
    { path: '/mentor/tasks', icon: ClipboardList, label: 'Tasks' },
    { path: '/mentor/messages', icon: MessageSquare, label: 'Messages', hasBadge: true },
    { path: '/mentor/settings', icon: Settings, label: 'Settings' },
  ],
  mentee: [
    { path: '/mentee/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/mentee/programs', icon: BookOpen, label: 'Browse Programs' },
    { path: '/mentee/tasks', icon: ClipboardList, label: 'My Tasks' },
    { path: '/mentee/gamification', icon: Trophy, label: 'Gamification' },
    { path: '/mentee/messages', icon: MessageSquare, label: 'Messages', hasBadge: true },
    { path: '/mentee/settings', icon: Settings, label: 'Settings' },
  ],
} as const;

export function getNavigationLinks(role: UserRole): NavLink[] {
  return navigationConfig[role] || [];
}
