/**
 * Built-in roles = permission bundles, each with a natural SCOPE LEVEL it's
 * granted at. A role assignment binds (user, role, scope, scopeId); the role's
 * permissions then apply within that scope (and everything beneath it).
 *
 * Scope levels: 'org' > 'program' > 'clan' > 'self'.
 *
 * Keep this in sync with the client mirror (client-interface/lib/config/permissions.ts).
 */
const { PERMISSIONS: P } = require('./permissions');

const ROLES = {
  // ── Org administration ──────────────────────────────────────────────────────
  super_admin: {
    label: 'Super admin',
    scope: 'org',
    description: 'Full control of the whole organization.',
    permissions: '*' // every permission
  },
  program_admin: {
    label: 'Program admin',
    scope: 'program',
    description: 'Runs one or more programs end-to-end (not the whole org).',
    permissions: [
      P.PROGRAM_MANAGE, P.PROGRAM_PUBLISH, P.COHORT_MANAGE,
      P.ROADMAP_AUTHOR, P.ROADMAP_PUBLISH_LOCAL,
      P.INTAKE_MANAGE, P.ASSESSMENT_AUTHOR, P.INVITE_CREATE,
      P.CLAN_CREATE, P.CLAN_MANAGE_MEMBERS,
      P.TASK_ASSIGN, P.TASK_REVIEW, P.MENTEE_VIEW, P.MENTEE_MANAGE,
      P.LIBRARY_MANAGE, P.ANNOUNCEMENT_POST,
      P.COMMUNITY_POST, P.COMMUNITY_MODERATE, P.ANALYTICS_VIEW, P.GAMIFICATION_MANAGE, P.FEEDBACK_MANAGE
    ]
  },
  intake_manager: {
    label: 'Intake manager',
    scope: 'org',
    description: 'Owns admissions: cohorts, applications, assessments, invites.',
    permissions: [P.INTAKE_MANAGE, P.ASSESSMENT_AUTHOR, P.INVITE_CREATE, P.ANALYTICS_VIEW]
  },
  people_admin: {
    label: 'People admin',
    scope: 'org',
    description: 'Manages users, clans, and placement.',
    permissions: [P.USER_MANAGE, P.CLAN_CREATE, P.CLAN_MANAGE_MEMBERS, P.MENTEE_VIEW, P.MENTEE_MANAGE]
  },
  moderator: {
    label: 'Moderator',
    scope: 'org',
    description: 'Keeps the community healthy.',
    permissions: [P.COMMUNITY_MODERATE, P.COMMUNITY_POST]
  },
  analyst: {
    label: 'Analyst',
    scope: 'org',
    description: 'Read-only access to analytics & insights.',
    permissions: [P.ANALYTICS_VIEW]
  },

  // ── Clan (mentor-led group) ────────────────────────────────────────────────
  lead_mentor: {
    label: 'Lead mentor',
    scope: 'clan',
    description: 'Leads a clan - full mentoring plus member management.',
    permissions: [
      P.TASK_ASSIGN, P.TASK_REVIEW, P.MENTEE_VIEW, P.MENTEE_MANAGE, P.MENTEE_ADD,
      P.CLAN_MANAGE_MEMBERS, P.ROADMAP_PUBLISH_LOCAL, P.LIBRARY_MANAGE,
      P.ANNOUNCEMENT_POST, P.ANALYTICS_VIEW, P.COMMUNITY_POST
    ]
  },
  co_mentor: {
    label: 'Co-mentor',
    scope: 'clan',
    description: 'Full mentoring access by default; the lead mentor and admins manage the team and can fine-tune each co-mentor.',
    // Co-mentors default to the SAME power as a lead mentor, EXCEPT
    // clan.manage_members (managing co-mentors/core team + editing permissions
    // stays with the lead mentor + admins). mentee.add is toggleable here so a
    // lead can revoke it per co-mentor. A lead/admin can fine-tune via
    // clan_memberships.permission_overrides.
    permissions: [
      P.TASK_ASSIGN, P.TASK_REVIEW, P.MENTEE_VIEW, P.MENTEE_MANAGE, P.MENTEE_ADD,
      P.ROADMAP_PUBLISH_LOCAL, P.LIBRARY_MANAGE, P.ANNOUNCEMENT_POST,
      P.ANALYTICS_VIEW, P.COMMUNITY_POST
    ]
  },
  core_team: {
    label: 'Core team',
    scope: 'clan',
    description: 'A trusted senior mentee who helps run the clan (peer leader).',
    permissions: [P.MENTEE_VIEW, P.COMMUNITY_POST]
  },

  // ── Self ────────────────────────────────────────────────────────────────────
  mentee: {
    label: 'Mentee',
    scope: 'self',
    description: 'A learner working their own roadmap.',
    permissions: [P.COMMUNITY_POST]
  }
};

/** Does a role grant a permission? ('*' = all.) */
function roleGrants(roleKey, permission) {
  const role = ROLES[roleKey];
  if (!role) return false;
  if (role.permissions === '*') return true;
  return role.permissions.includes(permission);
}

module.exports = { ROLES, roleGrants };
