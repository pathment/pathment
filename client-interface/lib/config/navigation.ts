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
  MessageSquarePlus,
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
  Mic,
  ListChecks,
  Video,
  Award,
  type LucideIcon
} from 'lucide-react';
import { UserRole } from '@/lib/types';

export interface NavChildLink {
  path: string;
  icon: LucideIcon;
  label: string;
  permission?: string;
}

export interface NavLink {
  path: string;
  icon: LucideIcon;
  label: string;
  badge?: 'messages' | 'approvals';
  permission?: string;
  anyOf?: string[];
  requiresAdminArea?: boolean;
  children?: NavChildLink[];
}

export const navigationConfig: Record<string, NavLink[]> = {
  admin: [
    { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard', permission: 'analytics.view' },
    { path: '/admin/messages', icon: MessageSquare, label: 'Messages', badge: 'messages' },
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
        { path: '/admin/certificates', icon: Award, label: 'Certificates', permission: 'program.manage' },
      ],
    },
    {
      path: 'group:engagement', icon: Megaphone, label: 'Engagement',
      children: [
        { path: '/admin/announcements', icon: Megaphone, label: 'Announcements', permission: 'community.moderate' },
        { path: '/admin/meetings', icon: Video, label: 'Live Meetings', permission: 'analytics.view' },
        { path: '/admin/changelog', icon: PackageOpen, label: "What's New", permission: 'system.settings' },
        { path: '/admin/rewards', icon: Gift, label: 'Rewards', permission: 'gamification.manage' },
        { path: '/admin/moderation', icon: ShieldAlert, label: 'Moderation', permission: 'community.moderate' },
        { path: '/admin/feedback', icon: MessageSquarePlus, label: 'Feedback', permission: 'feedback.manage' },
      ],
    },
    {
      path: 'group:analytics', icon: TrendingUp, label: 'Analytics',
      children: [
        { path: '/admin/insights', icon: TrendingUp, label: 'Insights', permission: 'analytics.view' },
        { path: '/admin/review-records', icon: CalendarRange, label: 'Review Records', permission: 'analytics.view' },
        { path: '/admin/activity', icon: BarChart2, label: 'Activity', permission: 'analytics.view' },
        { path: '/admin/emails', icon: Mail, label: 'Email Queue', permission: 'system.settings' },
      ],
    },
    { path: '/admin/access', icon: ShieldCheck, label: 'Roles & Access', permission: 'access.manage' },
    { path: '/admin/library', icon: BookOpen, label: 'Library' },
    { path: '/admin/mentor-spec', icon: Compass, label: 'Mentor Handbook' },
    { path: '/admin/settings', icon: Settings, label: 'Settings', permission: 'system.settings' },
  ],
  mentor: [
    { path: '/mentor/dashboard', icon: LayoutDashboard, label: 'Cockpit' },
    { path: '/mentor/review', icon: CalendarRange, label: 'Clan Review' },
    { path: '/mentor/messages', icon: MessageSquare, label: 'Messages', badge: 'messages' },
    { path: '/mentor/approvals', icon: ClipboardCheck, label: 'Approvals', badge: 'approvals' },
    {
      path: 'group:mentees', icon: Users2, label: 'My Mentees',
      children: [
        { path: '/mentor/mentees', icon: Users2, label: 'My Mentees' },
        { path: '/mentor/clan-team', icon: ShieldCheck, label: 'Clan Team' },
        { path: '/mentor/at-risk', icon: AlertTriangle, label: 'At-risk' },
        { path: '/mentor/promotions', icon: TrendingUp, label: 'Promotions' },
      ],
    },
    {
      path: 'group:teaching', icon: Route, label: 'Teaching',
      children: [
        { path: '/mentor/roadmaps', icon: Route, label: 'Roadmaps' },
        { path: '/mentor/interviews', icon: Mic, label: 'Interviews' },
        { path: '/mentor/quizzes', icon: ListChecks, label: 'Quizzes' },
        { path: '/mentor/programs', icon: School, label: 'My Programs' },
        { path: '/mentor/schedules', icon: CalendarClock, label: 'Schedules' },
        { path: '/mentor/reports', icon: FileText, label: 'Reports' },
        { path: '/mentor/scores', icon: Gauge, label: 'Progress Scores' },
        { path: '/mentor/certificates', icon: Award, label: 'Certificates' },
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
    { path: '/mentor/spec', icon: Compass, label: 'Mentor Handbook' },
    { path: '/mentor/settings', icon: Settings, label: 'Settings' },
  ],
  mentee: [
    { path: '/mentee/dashboard', icon: LayoutDashboard, label: 'This Week' },
    { path: '/mentee/tasks', icon: ClipboardList, label: 'My Tasks' },
    { path: '/mentee/roadmap', icon: Route, label: 'My Roadmap' },
    { path: '/mentee/meetings', icon: CalendarClock, label: 'My Mentor' },
    { path: '/mentee/messages', icon: MessageSquare, label: 'Messages', badge: 'messages' },
    {
      path: 'group:mentee-progress', icon: BarChart2, label: 'Progress',
      children: [
        { path: '/mentee/daily-log', icon: CalendarCheck, label: 'Daily Log' },
        { path: '/mentee/blockers', icon: Flag, label: 'Blockers' },
        { path: '/mentee/progress', icon: BarChart2, label: 'My Progress' },
        { path: '/mentee/gamification', icon: Trophy, label: 'Points & Badges' },
        { path: '/mentee/certificates', icon: Award, label: 'My Certificates' },
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

export interface FlatNavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  group?: string;
  permission?: string;
  anyOf?: string[];
  requiresAdminArea?: boolean;
}

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
