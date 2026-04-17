import { 
  LayoutDashboard, 
  BookOpen, 
  Users, 
  UserCheck, 
  ClipboardList,
  Trophy,
  MessageSquare,
  Bell,
  UserPlus,
  Settings,
  type LucideIcon
} from 'lucide-react';
import { UserRole } from '@/lib/types';

export interface NavLink {
  path: string;
  icon: LucideIcon;
  label: string;
  hasBadge?: boolean;
}

export const navigationConfig = {
  admin: [
    { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/programs/list', icon: BookOpen, label: 'Programs' },
    { path: '/admin/matching/mentor-assignment', icon: UserCheck, label: 'Mentors' },
    { path: '/admin/enrollment/overview', icon: Users, label: 'Enrollments' },
    { path: '/admin/invites', icon: UserPlus, label: 'Invites' },
    { path: '/admin/messages', icon: MessageSquare, label: 'Messages', hasBadge: true },
    { path: '/admin/notifications', icon: Bell, label: 'Notifications' },
    { path: '/admin/settings', icon: Settings, label: 'Settings' },
  ],
  mentor: [
    { path: '/mentor/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/mentor/programs', icon: BookOpen, label: 'My Programs' },
    { path: '/mentor/mentees', icon: Users, label: 'My Mentees' },
    { path: '/mentor/tasks', icon: ClipboardList, label: 'Tasks' },
    { path: '/mentor/messages', icon: MessageSquare, label: 'Messages', hasBadge: true },
    { path: '/mentor/notifications', icon: Bell, label: 'Notifications' },
    { path: '/mentor/settings', icon: Settings, label: 'Settings' },
  ],
  mentee: [
    { path: '/mentee/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/mentee/programs', icon: BookOpen, label: 'Browse Programs' },
    { path: '/mentee/tasks', icon: ClipboardList, label: 'My Tasks' },
    { path: '/mentee/gamification', icon: Trophy, label: 'Gamification' },
    { path: '/mentee/messages', icon: MessageSquare, label: 'Messages', hasBadge: true },
    { path: '/mentee/notifications', icon: Bell, label: 'Notifications' },
    { path: '/mentee/settings', icon: Settings, label: 'Settings' },
  ],
} as const;

export function getNavigationLinks(role: UserRole): NavLink[] {
  return navigationConfig[role] || [];
}
