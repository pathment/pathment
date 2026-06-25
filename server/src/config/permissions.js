/**
 * The permission vocabulary - the single source of truth for every action that
 * can be authorized. Keep keys stable (they're persisted in role bundles and
 * checked in code). Grouped by domain for readability only.
 *
 * A permission answers "WHAT can you do"; the scope it's checked at (org /
 * program / clan / self) answers "ON WHAT" - see authzService.
 */
const PERMISSIONS = {
  // Programs & curriculum
  PROGRAM_CREATE: 'program.create',
  PROGRAM_MANAGE: 'program.manage',
  PROGRAM_PUBLISH: 'program.publish',
  COHORT_MANAGE: 'cohort.manage',
  ROADMAP_AUTHOR: 'roadmap.author',          // org/template roadmaps
  ROADMAP_PUBLISH_LOCAL: 'roadmap.publish_local', // a mentor's own roadmap

  // Intake / admissions
  INTAKE_MANAGE: 'intake.manage',            // cohorts, applications, review/accept
  ASSESSMENT_AUTHOR: 'assessment.author',
  INVITE_CREATE: 'invite.create',

  // Clans & people
  CLAN_CREATE: 'clan.create',
  CLAN_MANAGE_MEMBERS: 'clan.manage_members',
  MENTEE_VIEW: 'mentee.view',                // see mentees' profiles/progress
  MENTEE_MANAGE: 'mentee.manage',            // notes, insights, placement actions
  MENTEE_ADD: 'mentee.add',                  // add mentees to a clan (co-mentor toggle)
  USER_MANAGE: 'user.manage',               // org user directory / status

  // Work
  TASK_ASSIGN: 'task.assign',
  TASK_REVIEW: 'task.review',

  // Shared resource library (org-global documents/links)
  LIBRARY_MANAGE: 'library.manage',

  // Community
  COMMUNITY_POST: 'community.post',
  COMMUNITY_MODERATE: 'community.moderate',
  ANNOUNCEMENT_POST: 'announcement.post',    // broadcast to a clan/program (mentor+)

  // Gamification (badges, challenges, gift catalog)
  GAMIFICATION_MANAGE: 'gamification.manage',

  // Platform
  ANALYTICS_VIEW: 'analytics.view',
  ACCESS_MANAGE: 'access.manage',            // grant/revoke roles (IAM itself)
  SYSTEM_SETTINGS: 'system.settings',
  FEEDBACK_MANAGE: 'feedback.manage'         // triage user-submitted feedback / bug reports
};

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

module.exports = { PERMISSIONS, ALL_PERMISSIONS };
