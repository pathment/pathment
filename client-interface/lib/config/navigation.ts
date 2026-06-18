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
  ShieldCheck,
  Settings,
  GraduationCap,
  School,
  BarChart2,
  ShieldAlert,
  Flag,
  Mail,
  PackageOpen,
  type LucideIcon
} from 'lucide-react';
import { UserRole } from '@/lib/types';

export interface NavChildLink {
  path: string;
  icon: LucideIcon;
  label: string;
  /** Hide unless the user holds this permission (any scope). Omit = always show. */
  permission?: string;
}

export interface NavLink {
  path: string;
  icon: LucideIcon;
  label: string;
  hasBadge?: boolean;
  /** Hide unless the user holds this permission (any scope). Omit = always show. */
  permission?: string;
  /** Hide unless the user holds ANY of these permissions. */
  anyOf?: string[];
  /** Show only when the user can access the admin area (scoped RBAC). */
  requiresAdminArea?: boolean;
  /** If present, renders as a collapsible group with these child links */
  children?: NavChildLink[];
}

export const navigationConfig: Record<string, NavLink[]> = {
  // Default order = most-used-first (adaptive frecency reordering layers on top
  // of this; see navPreferences.ts). Keep the highest-traffic items at the top.
  // Daily-driver items stay standalone at the top (and still float via adaptive
  // frecency); the rest are clustered into collapsible sections. Group parents use
  // a synthetic `group:*` path - they only expand/collapse, they never navigate.
  admin: [
    { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard', permission: 'analytics.view' },
    { path: '/admin/messages', icon: MessageSquare, label: 'Messages', hasBadge: true },
    {
      path: 'group:admissions', icon: CalendarRange, label: 'Admissions',
      children: [
        { path: '/admin/cohorts', icon: CalendarRange, label: 'Intake', permission: 'intake.manage' },
        { path: '/admin/assessments', icon: ClipboardCheck, label: 'Assessments', permission: 'assessment.author' },
        { path: '/admin/invites', icon: UserPlus, label: 'Invites', permission: 'invite.create' },
      ],
    },
    {
      path: 'group:people', icon: Users, label: 'People & Clans',
      children: [
        { path: '/admin/enrollment/overview', icon: Users, label: 'Enrollments', permission: 'mentee.manage' },
        { path: '/admin/clans', icon: Users2, label: 'Clans', permission: 'clan.create' },
        { path: '/admin/users/mentors', icon: GraduationCap, label: 'Mentors', permission: 'user.manage' },
        { path: '/admin/users/mentees', icon: School, label: 'Mentees', permission: 'user.manage' },
        { path: '/admin/requests', icon: GitPullRequest, label: 'Clan Requests', permission: 'mentee.manage' },
        { path: '/admin/promotions', icon: TrendingUp, label: 'Promotions', permission: 'user.manage' },
      ],
    },
    {
      path: 'group:programs', icon: BookOpen, label: 'Programs',
      children: [
        { path: '/admin/programs/list', icon: BookOpen, label: 'Programs', permission: 'program.manage' },
        { path: '/admin/roadmaps', icon: Route, label: 'Roadmaps', permission: 'roadmap.author' },
        { path: '/admin/schedules', icon: CalendarClock, label: 'Schedules', permission: 'program.manage' },
      ],
    },
    {
      path: 'group:engagement', icon: Megaphone, label: 'Engagement',
      children: [
        { path: '/admin/announcements', icon: Megaphone, label: 'Announcements', permission: 'community.moderate' },
        { path: '/admin/changelog', icon: PackageOpen, label: "What's New", permission: 'system.settings' },
        { path: '/admin/governance', icon: ShieldCheck, label: 'Governance', permission: 'system.settings' },
        { path: '/admin/rewards', icon: Gift, label: 'Rewards', permission: 'gamification.manage' },
        { path: '/admin/moderation', icon: ShieldAlert, label: 'Moderation', permission: 'community.moderate' },
      ],
    },
    {
      path: 'group:analytics', icon: TrendingUp, label: 'Analytics',
      children: [
        { path: '/admin/insights', icon: TrendingUp, label: 'Insights', permission: 'analytics.view' },
        { path: '/admin/activity', icon: BarChart2, label: 'Activity', permission: 'analytics.view' },
        { path: '/admin/emails', icon: Mail, label: 'Email Queue', permission: 'system.settings' },
      ],
    },
    { path: '/admin/access', icon: ShieldCheck, label: 'Roles & Access', permission: 'access.manage' },
    { path: '/admin/library', icon: BookOpen, label: 'Library' },
    { path: '/admin/mentor-spec', icon: Compass, label: 'Mentor Spec' },
    { path: '/admin/settings', icon: Settings, label: 'Settings', permission: 'system.settings' },
  ],
  mentor: [
    { path: '/mentor/dashboard', icon: LayoutDashboard, label: 'Cockpit' },
    { path: '/mentor/review', icon: CalendarRange, label: 'Cohort Review' },
    { path: '/mentor/messages', icon: MessageSquare, label: 'Messages', hasBadge: true },
    {
      path: 'group:mentees', icon: Users2, label: 'My Mentees',
      children: [
        { path: '/mentor/mentees', icon: Users2, label: 'My Mentees' },
        { path: '/mentor/clan-team', icon: ShieldCheck, label: 'Clan Team' },
        { path: '/mentor/approvals', icon: ClipboardCheck, label: 'Approvals' },
        { path: '/mentor/at-risk', icon: AlertTriangle, label: 'At-risk' },
        { path: '/mentor/promotions', icon: TrendingUp, label: 'Promotions' },
      ],
    },
    {
      path: 'group:teaching', icon: Route, label: 'Teaching',
      children: [
        { path: '/mentor/roadmaps', icon: Route, label: 'Roadmaps' },
        { path: '/mentor/programs', icon: School, label: 'My Programs' },
        { path: '/mentor/schedules', icon: CalendarClock, label: 'Schedules' },
        { path: '/mentor/reports', icon: FileText, label: 'Reports' },
        { path: '/mentor/scores', icon: Gauge, label: 'Progress Scores' },
      ],
    },
    {
      path: 'group:mentor-community', icon: Users, label: 'Community',
      children: [
        { path: '/mentor/announcements', icon: Megaphone, label: 'Announcements' },
        { path: '/mentor/leaderboard', icon: Trophy, label: 'Leaderboard' },
        { path: '/mentor/community', icon: Users, label: 'Community' },
        { path: '/mentor/rewards', icon: Gift, label: 'Rewards' },
        { path: '/mentor/library', icon: BookOpen, label: 'Library' },
      ],
    },
    { path: '/mentor/spec', icon: Compass, label: 'Mentor Spec' },
    { path: '/mentor/settings', icon: Settings, label: 'Settings' },
  ],
  mentee: [
    { path: '/mentee/dashboard', icon: LayoutDashboard, label: 'This Week' },
    { path: '/mentee/tasks', icon: ClipboardList, label: 'My Tasks' },
    { path: '/mentee/meetings', icon: CalendarClock, label: 'My Mentor' },
    { path: '/mentee/messages', icon: MessageSquare, label: 'Messages', hasBadge: true },
    {
      path: 'group:mentee-progress', icon: BarChart2, label: 'Progress',
      children: [
        { path: '/mentee/daily-log', icon: CalendarCheck, label: 'Daily Log' },
        { path: '/mentee/blockers', icon: Flag, label: 'Blockers' },
        { path: '/mentee/progress', icon: BarChart2, label: 'My Progress' },
        { path: '/mentee/gamification', icon: Trophy, label: 'Gamification' },
      ],
    },
    {
      path: 'group:mentee-community', icon: Users, label: 'Community',
      children: [
        { path: '/mentee/community', icon: Users, label: 'Community' },
        { path: '/mentee/announcements', icon: Megaphone, label: 'Announcements' },
        { path: '/mentee/library', icon: BookOpen, label: 'Library' },
      ],
    },
    { path: '/mentee/settings', icon: Settings, label: 'Settings' },
  ],
} as const;

export function getNavigationLinks(role: UserRole): NavLink[] {
  return navigationConfig[role] || [];
}

/** A single navigable destination, flattened out of groups - used by the search palette. */
export interface FlatNavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Parent group label (for context/breadcrumb), if this item lived in a group. */
  group?: string;
  permission?: string;
  anyOf?: string[];
  requiresAdminArea?: boolean;
}

/**
 * Flatten a role's navigation (standalone links + every group child) into a single
 * list of destinations. Synthetic `group:*` parents are dropped - only real pages
 * remain. Permission filtering is applied by the caller (same rules as the sidebar).
 */
export function getFlatNavItems(role: UserRole): FlatNavItem[] {
  const links = navigationConfig[role] || [];
  const out: FlatNavItem[] = [];
  for (const link of links) {
    if (link.children) {
      for (const child of link.children) {
        out.push({ path: child.path, label: child.label, icon: child.icon, group: link.label, permission: child.permission });
      }
    } else {
      out.push({
        path: link.path, label: link.label, icon: link.icon,
        permission: link.permission, anyOf: link.anyOf, requiresAdminArea: link.requiresAdminArea,
      });
    }
  }
  return out;
}
