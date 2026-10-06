'use strict';

/**
 * Seeding helpers for tests.
 * Each helper creates a minimal valid record and returns the created instance.
 * All helpers are idempotent-by-intent — tests should truncate tables via
 * cleanDb() in afterEach/beforeEach to guarantee isolation.
 */

const bcrypt = require('bcrypt');
const { sequelize, models } = require('../../src/db');
const { setDefaultRequestContext } = require('../../src/utils/auditContext');
const { generateRandomToken, hashToken, generateAccessToken } = require('../../src/utils/jwt');

// Hard stop — never allow seed helpers to run against a non-test database
const _dbUrl = process.env.DATABASE_URL || '';
if (!_dbUrl.includes('test')) {
  throw new Error(
    `SEED SAFETY: DATABASE_URL "${_dbUrl}" does not contain "test". ` +
    'Refusing to run seed helpers against a non-test database.'
  );
}

// ─── Low-level helper ─────────────────────────────────────────────────────────

/**
 * Truncate all application tables in dependency order.
 * Call in beforeEach to keep tests isolated.
 *
 * Each TRUNCATE is wrapped in a try/catch for partial schemas, which means a
 * name that no longer exists fails silently forever. Four did: `program_levels`,
 * `roadmap_weeks` and `level_mentor_assignments` (levels and weeks were removed
 * from the product) and `gamification_points` (points live in `points_history`,
 * which was therefore never being cleaned between tests). Keep this list honest
 * — a table listed here but absent looks like isolation it is not providing.
 */
async function cleanDb() {
  await sequelize.query('SET session_replication_role = replica');  // disable FK checks temporarily
  const tableOrder = [
    'clan_join_requests',
    'task_feedback',
    'task_submission_files',
    'task_submissions',
    'assigned_tasks',
    'roadmap_tasks',
    'roadmaps',
    'mentor_mentee_matches',
    'enrollments',
    'programs',
    'password_reset_tokens',
    'email_verification_tokens',
    'refresh_tokens',
    'registration_invites',
    'user_settings',
    'mentor_profiles',
    'mentee_profiles',
    'admin_profiles',
    'user_skills',
    'points_history',
    'notifications',
    'user_badges',
    'talk_category_links',
    'talks',
    'talk_categories',
    'ai_connections',
    'users',
  ];
  /*
   * Truncate the fixture tables in one statement. PostgreSQL must make every
   * TRUNCATE durable, so issuing one statement per table turns a test reset
   * into dozens of disk flushes. That was slow enough on the development
   * volume for certificate suites to hit Jest's 30 second timeout before their
   * first assertion. Discovering the present tables keeps the helper usable
   * with partial schemas without swallowing real truncate failures.
   */
  const existing = new Set(await sequelize.getQueryInterface().showAllTables());
  const presentTables = tableOrder.filter((table) => existing.has(table));
  if (presentTables.length > 0) {
    const quoted = presentTables.map((table) => `"${table.replace(/"/g, '""')}"`).join(', ');
    const sql = `TRUNCATE TABLE ${quoted} CASCADE`;
    // A login response can finish while its non-critical gamification side
    // effect is still releasing locks. The next suite must not fail before its
    // first assertion because PostgreSQL chose that cleanup statement as the
    // deadlock victim. Retry only transient concurrency codes, and keep every
    // schema/data error visible.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await sequelize.query(sql);
        break;
      } catch (error) {
        const code = error?.original?.code || error?.parent?.code;
        if (!['40P01', '40001', '55P03'].includes(code) || attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 25));
      }
    }
  }
  // The AI feature routing lives in system_settings, which is NOT truncated:
  // other suites rely on rows in there. Only the routing keys go.
  try {
    await sequelize.query(`DELETE FROM "system_settings" WHERE "setting_key" LIKE 'ai.routing%'`);
  } catch (_) {
    // Same as above: a partial schema is not a failure here.
  }

  await sequelize.query('SET session_replication_role = DEFAULT');

  // `users` is truncated with CASCADE; organizations references users through
  // created_by, so PostgreSQL correctly truncates the workspace tables too.
  // Recreate the default test workspace before any helper creates an account.
  if (models.Organization && models.Plan && models.OrganizationSubscription) {
    const slug = process.env.TENANT_SLUG || 'devweekends';
    const [organization] = await models.Organization.findOrCreate({
      where: { slug }, defaults: { name: 'Test Organization', status: 'active', timezone: 'UTC' },
    });

    /**
     * Say which workspace this database IS, before anything else is written.
     *
     * Several services now refuse to run without a workspace, because a
     * tenant-scoped query with no tenant is a bug rather than a whole-table
     * read. The app always has one — the request middleware sets it per call,
     * `forEachWorkspace` sets it per background pass — but a test calling a
     * service directly had neither, so forty-one tests across seven suites
     * failed on a guard that was working exactly as designed.
     *
     * This runs the instant the organization exists and BEFORE its
     * subscription row is written. The truncation above drops the workspace and
     * the line above makes a new one with a new id, so anything written in
     * between would be checked against the id of the workspace that was just
     * deleted — which is how the first version of this turned a context failure
     * into "Cannot write a record belonging to another workspace".
     */
    setDefaultRequestContext({ organizationId: organization.id, organizationSlug: organization.slug });

    const plan = await models.Plan.findOne({ where: { key: 'growth' } });
    if (plan) await models.OrganizationSubscription.findOrCreate({
      where: { organizationId: organization.id }, defaults: { planId: plan.id, status: 'active' },
    });
  }
}

// ─── User helpers ──────────────────────────────────────────────────────────────

async function createUser({ role = 'mentee', email, password = 'Test@1234', firstName = 'Test', lastName = 'User', emailVerified = true, status = 'active' } = {}) {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await models.User.create({
    email: email || `${role}-${Date.now()}@test.com`,
    passwordHash,
    role,
    firstName,
    lastName,
    emailVerified,
    emailVerifiedAt: emailVerified ? new Date() : null,
    status,
  });

  // Create role-specific profile
  if (role === 'mentor') {
    await models.MentorProfile.create({
      userId: user.id,
      specialization: [],
      yearsOfExperience: 0,
      maxMentees: 5,
    });
  } else if (role === 'mentee') {
    await models.MenteeProfile.create({
      userId: user.id,
      learningGoals: [],
      currentLevel: 1,
      totalPoints: 0,
    });
  } else if (role === 'admin') {
    await models.AdminProfile.create({ userId: user.id });
  }

  // Create user settings
  try {
    await models.UserSettings.create({ userId: user.id });
  } catch (_) {}

  return user;
}

async function createAdmin(overrides = {}) {
  return createUser({ role: 'admin', email: 'admin@ue.edu', password: 'Admin@2024', firstName: 'Admin', lastName: 'User', ...overrides });
}

async function createMentor(overrides = {}) {
  return createUser({ role: 'mentor', email: 'mentor@test.com', password: 'Mentor@1234', ...overrides });
}

async function createMentee(overrides = {}) {
  return createUser({ role: 'mentee', email: 'mentee@test.com', password: 'Mentee@1234', ...overrides });
}

// ─── Invite token helper ───────────────────────────────────────────────────────

/**
 * Creates a RegistrationInvite and returns { rawToken, invite }.
 * rawToken is what you put in the registration request body.
 */
async function createInviteToken({ adminId, role = 'mentee', email, expiresInHours = 72 } = {}) {
  const rawToken = generateRandomToken();
  const tokenHash = hashToken(rawToken);
  const invite = await models.RegistrationInvite.create({
    tokenHash,
    email: email || `invite-${Date.now()}@test.com`,
    role,
    invitedBy: adminId,
    expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
    metadata: {},
  });
  return { rawToken, invite };
}

// ─── Email verification token helper ──────────────────────────────────────────

async function createEmailVerificationToken(userId, { expired = false } = {}) {
  const rawToken = generateRandomToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = expired
    ? new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
    : new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

  await models.EmailVerificationToken.create({ userId, token: tokenHash, expiresAt });
  return rawToken; // return raw so test can send it in the request
}

// ─── Password reset token helper ──────────────────────────────────────────────

async function createPasswordResetToken(userId, { expired = false } = {}) {
  const rawToken = generateRandomToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = expired
    ? new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
    : new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

  await models.PasswordResetToken.create({ userId, token: tokenHash, expiresAt });
  return rawToken; // return raw so test can send it in the request
}

// ─── Program helpers ───────────────────────────────────────────────────────────

async function createProgram({ createdBy, name = 'Test Program', status = 'published', type = 'mentorship', totalDurationWeeks = 12 } = {}) {
  return models.Program.create({
    createdBy,
    name,
    description: 'A test program for unit testing purposes',
    type,
    status,
    totalDurationWeeks,
    startDate: '2026-06-01',
    endDate: '2026-09-01',
  });
}

// ─── Roadmap helpers ───────────────────────────────────────────────────────────
//
// Programs used to be divided into LEVELS, and roadmaps into WEEKS, with tasks
// hanging off a week. Both were removed: a roadmap now belongs straight to a
// program and its tasks straight to the roadmap. `createProgramLevel` and
// `createRoadmapWeek` outlived the models they built, so every suite that
// seeded a level died on `models.ProgramLevel.create` before it reached its
// first assertion. They are gone rather than stubbed — a helper for a concept
// the product no longer has would only invite the next test to depend on it.

async function createRoadmap({ programId, createdBy } = {}) {
  return models.Roadmap.create({ programId, createdBy, name: 'Test Roadmap', description: 'Test roadmap' });
}

async function createRoadmapTask({ roadmapId, title = 'Build REST API', estimatedHours = 5, taskOrder = 1 } = {}) {
  return models.RoadmapTask.create({
    roadmapId,
    title,
    description: 'Task description',
    type: 'project',
    taskOrder,
    deliverable: 'GitHub link',
    estimatedHours,
    difficulty: 'medium',
  });
}

// ─── Clan helpers ──────────────────────────────────────────────────────────────

/**
 * A clan with its lead mentor and members placed.
 *
 * Access to a mentee is CLAN-BASED now: `authzService.canViewMentee` and
 * `canActOnTask` admit the mentee themselves, an admin, a 1:1 match, or anyone
 * holding the permission at one of the mentee's clans. The older
 * `assignedTask.mentorId === you` ownership is gone (it wrongly excluded every
 * co-mentor), so seeding a task with a mentorId no longer grants that mentor
 * anything — the suites that relied on it started 403-ing. Put them in a clan
 * together instead, which is what the product does.
 *
 * Goes through `clanService.addMember` rather than writing memberships directly
 * so a seeded mentee gets the same enrollment and mentee profile a real
 * placement creates.
 */
async function createClan({ programId, createdBy, leadMentor, mentees = [], coMentors = [], name = 'Test Clan' } = {}) {
  const clanService = require('../../src/services/clanService');
  const clan = await models.Clan.create({
    programId,
    name,
    leadMentorId: leadMentor ? leadMentor.id : null,
    createdBy: createdBy || (leadMentor && leadMentor.id),
  });
  if (leadMentor) await clanService.addMember(clan.id, { userId: leadMentor.id, role: 'lead_mentor' });
  for (const m of coMentors) await clanService.addMember(clan.id, { userId: m.id, role: 'co_mentor' });
  for (const m of mentees) await clanService.addMember(clan.id, { userId: m.id, role: 'mentee' });
  return clan;
}

// ─── Enrollment helpers ────────────────────────────────────────────────────────

/**
 * The mentee's enrollment in a program, created if they have none.
 *
 * Find-or-create rather than create, because placing somebody in a clan ALSO
 * enrolls them (`clanService.addMember` — placement is enrollment), so a suite
 * that seeds a clan and then an enrollment was inserting a second one and
 * hitting the unique constraint. A mentee has one enrollment per program in the
 * product; the helper now says the same thing.
 */
async function createEnrollment({ menteeId, programId, status = 'pending_match' } = {}) {
  const [enrollment] = await models.Enrollment.findOrCreate({
    where: { menteeId, programId },
    defaults: {
      menteeId,
      programId,
      status,
      currentWeek: 1,
      tasksCompleted: 0,
      tasksTotal: 0,
      overallProgressPercentage: 0,
    },
  });
  if (enrollment.status !== status) {
    enrollment.status = status;
    await enrollment.save();
  }
  return enrollment;
}

// ─── Task helpers ──────────────────────────────────────────────────────────────

async function createAssignedTask({ menteeId, mentorId, enrollmentId, roadmapTaskId, dueDate, status = 'assigned' } = {}) {
  return models.AssignedTask.create({
    roadmapTaskId,
    menteeId,
    mentorId,
    enrollmentId,
    status,
    dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    isLate: false,
    pointsAwarded: 0,
  });
}

// ─── JWT helper ────────────────────────────────────────────────────────────────

function tokenFor(user) {
  return generateAccessToken({ id: user.id, email: user.email, role: user.role });
}

async function createMatch({ mentorId, menteeId, enrollmentId, matchedBy, status = 'active' } = {}) {
  return models.MentorMenteeMatch.create({ mentorId, menteeId, enrollmentId, matchedBy: matchedBy || mentorId, status });
}

function authHeader(user) {
  return `Bearer ${tokenFor(user)}`;
}

module.exports = {
  cleanDb,
  createUser,
  createAdmin,
  createMentor,
  createMentee,
  createInviteToken,
  createEmailVerificationToken,
  createPasswordResetToken,
  createProgram,
  createRoadmap,
  createRoadmapTask,
  createClan,
  createEnrollment,
  createAssignedTask,
  createMatch,
  tokenFor,
  authHeader,
};
