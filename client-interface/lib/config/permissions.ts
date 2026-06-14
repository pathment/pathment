/**
 * Client mirror of the server permission vocabulary
 * (server/src/config/permissions.js). Use these constants with useCan() /
 * <PermissionGuard> to show or hide UI. NOTE: this is UX only - the server is
 * always the source of truth and re-checks every request.
 */
export const PERMISSIONS = {
  PROGRAM_CREATE: 'program.create',
  PROGRAM_MANAGE: 'program.manage',
  PROGRAM_PUBLISH: 'program.publish',
  COHORT_MANAGE: 'cohort.manage',
  ROADMAP_AUTHOR: 'roadmap.author',
  ROADMAP_PUBLISH_LOCAL: 'roadmap.publish_local',
  INTAKE_MANAGE: 'intake.manage',
  ASSESSMENT_AUTHOR: 'assessment.author',
  INVITE_CREATE: 'invite.create',
  CLAN_CREATE: 'clan.create',
  CLAN_MANAGE_MEMBERS: 'clan.manage_members',
  MENTEE_VIEW: 'mentee.view',
  MENTEE_MANAGE: 'mentee.manage',
  USER_MANAGE: 'user.manage',
  TASK_ASSIGN: 'task.assign',
  TASK_REVIEW: 'task.review',
  LIBRARY_MANAGE: 'library.manage',
  COMMUNITY_POST: 'community.post',
  COMMUNITY_MODERATE: 'community.moderate',
  ANNOUNCEMENT_POST: 'announcement.post',
  GAMIFICATION_MANAGE: 'gamification.manage',
  ANALYTICS_VIEW: 'analytics.view',
  ACCESS_MANAGE: 'access.manage',
  SYSTEM_SETTINGS: 'system.settings',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * The permissions a co-mentor holds BY DEFAULT (full mentoring parity with a
 * lead mentor, minus team management). This is exactly the set a lead mentor or
 * admin can toggle on/off for an individual co-mentor on the clan-team screen.
 * Keep in sync with the server's co_mentor role bundle (server/src/config/roles.js).
 */
export const CO_MENTOR_PERMISSIONS: { key: Permission; label: string; description: string }[] = [
  { key: PERMISSIONS.MENTEE_VIEW, label: 'View mentees', description: 'See mentee profiles, progress, and submissions.' },
  { key: PERMISSIONS.MENTEE_MANAGE, label: 'Manage mentees', description: 'Add notes, manage placement, and act on insights.' },
  { key: PERMISSIONS.TASK_ASSIGN, label: 'Assign tasks', description: 'Create and assign tasks to mentees.' },
  { key: PERMISSIONS.TASK_REVIEW, label: 'Review work', description: 'Mark tasks complete and leave feedback.' },
  { key: PERMISSIONS.ROADMAP_PUBLISH_LOCAL, label: 'Publish roadmaps', description: "Build and publish the clan's roadmap." },
  { key: PERMISSIONS.LIBRARY_MANAGE, label: 'Manage library', description: 'Add and edit shared resources.' },
  { key: PERMISSIONS.ANNOUNCEMENT_POST, label: 'Post announcements', description: 'Broadcast updates to the clan.' },
  { key: PERMISSIONS.ANALYTICS_VIEW, label: 'View analytics', description: 'See clan health and insights.' },
  { key: PERMISSIONS.COMMUNITY_POST, label: 'Post in community', description: 'Take part in community spaces.' },
];
