'use strict';

/**
 * Edorax courses as System Pool qualifying work.
 *
 * Edorax is faked at the HTTP boundary (global fetch), as in
 * tests/contracts/buildment-courses.test.js, so these tests pin the behaviour
 * that matters for a selection round rather than the wire format:
 *
 *   - a course is picked from the catalog and becomes one piece of pool work
 *   - assigning ENROLLS the candidate; a refusal costs that candidate only,
 *     and leaves no task behind for them
 *   - the score follows Edorax's progress, proportionally, with nobody
 *     reviewing anything — which is the whole point of the kind
 *   - an unfinished required course warns and never blocks the shortlist
 *   - removing the work gives the seats back
 */

// The base URL is set on the catalog app below, never through
// BUILDMENT_BASE_URL: that env var is process-wide and would follow this file
// into every other suite in the run.

const { Op } = require('sequelize');
const { models, sequelize } = require('../../src/db');
const seed = require('../helpers/seed');
const emailService = require('../../src/services/emailService');
const authService = require('../../src/services/authService');
const poolService = require('../../src/services/poolService');
const poolMemberService = require('../../src/services/poolMemberService');
const poolTaskService = require('../../src/services/poolTaskService');
const poolScoringService = require('../../src/services/poolScoringService');
const courseService = require('../../src/services/courseService');
const externalAppService = require('../../src/services/externalAppService');
const poolCandidateService = require('../../src/services/poolCandidateService');

const PoolTask = () => models.AssignedTask.scope('withPoolWork');

const KEYS = { accessKey: 'edx_access_key_1234', secretKey: 'edx_secret_key_5678' };
const COURSE = {
  course_id: 'cmvlsl6a600064kxp2ouztw8q', course_slug: 'think-clearly', title: 'Think Clearly',
  description: 'Logic for the AI era', price: 0, currency: 'USD', pricing_type: 'FREE', status: 'PUBLISHED',
  expires_at: null, available_enrollment_count: 50,
};

// ── fake Edorax ───────────────────────────────────────────────────────────────
let calls;
let edorax; // per-test overrides: 'METHOD /path' → (call) => [status, body]
const realFetch = global.fetch;
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  if (url.origin !== 'http://edorax.test') return realFetch(input, init);
  const call = {
    method: init.method || 'GET',
    path: url.pathname.replace('/integrations/v1', ''),
    query: Object.fromEntries(url.searchParams),
    body: init.body ? JSON.parse(init.body) : null,
  };
  calls.push(call);
  const handler = edorax[`${call.method} ${call.path}`];
  if (!handler) return Promise.resolve(json(404, { error: 'Not found' }));
  const [status, body] = handler(call);
  return Promise.resolve(json(status, body));
}
const callsTo = (key) => calls.filter((c) => `${c.method} ${c.path}` === key);

let ctx;

async function world() {
  await seed.cleanDb();
  await sequelize.query('TRUNCATE course_enrollments, organization_apps CASCADE');
  emailService.enqueue.mockClear();
  calls = [];
  edorax = {
    'GET /connection': () => [200, { connected: true, organization_slug: 'pathment', organization_name: 'Pathment' }],
    'GET /courses': () => [200, { courses: [COURSE] }],
    'POST /enrollments': (call) => [201, {
      enrollment_id: 'enr_1', course_id: call.body.course_id, learner_email: call.body.student_email,
      lifecycle: 'PENDING_ACCOUNT', created: true, external_assignment_id: call.body.external_assignment_id,
    }],
    'GET /enrollments': () => [404, { error: 'No enrollment' }],
    'GET /progress': () => [200, {
      course_id: COURSE.course_id, lifecycle: 'ACTIVE', status: 'NOT_STARTED',
      overall_progress: 0, completed_lessons: 0, total_lessons: 100, completed: false,
    }],
    'POST /enrollments/cancel': () => [200, { cancelled: true, already_cancelled: false }],
  };

  const admin = await seed.createAdmin();
  const program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  const pool = await poolService.createPool({
    programId: program.id,
    name: 'Spring pool',
    selectionQuota: 1,
    scoringPolicy: { difficultyPoints: { easy: 5, medium: 10, hard: 20, expert: 40 } },
  }, admin);
  await poolService.setStatus(pool.id, 'open', admin);

  // Connect Edorax for the workspace, through the real verify-then-store path.
  const [app] = await models.ExternalApp.findOrCreate({
    where: { integrationKey: 'buildment' },
    defaults: { name: 'EdoraX', type: 'course', integrationKey: 'buildment', backendUrl: 'http://edorax.test' },
  });
  await app.update({ backendUrl: 'http://edorax.test', isActive: true });
  await externalAppService.connect(admin, null, app.id, KEYS);

  return { admin, program, pool, app };
}

/** A candidate who has activated their account, so work can reach them. */
async function registerCandidate(email, firstName = 'Cand') {
  await poolMemberService.importMembers(ctx.pool.id, [{ email, firstName, lastName: 'Idate' }], ctx.admin);
  const calls_ = emailService.enqueue.mock.calls.filter(([m]) => m.to === email);
  const text = calls_[calls_.length - 1]?.[0]?.text || '';
  const match = text.match(/invite=([^\s&]+)/) || text.match(/\/i\/[^/\s]+\/([^\s/]+)/);
  const { user } = await authService.register({
    firstName, lastName: 'Idate', email, password: 'Test@12345', inviteToken: decodeURIComponent(match[1]),
  });
  return {
    user: await models.User.findByPk(user.id),
    member: await models.PoolMember.findOne({ where: { poolId: ctx.pool.id, email } }),
  };
}

/** One piece of course work, worth 20 points (hard, on this pool's curve). */
async function courseWork(assignTo = 'all') {
  return poolTaskService.createAssignment(ctx.pool.id, {
    kind: 'course', courseId: COURSE.course_id, difficulty: 'hard', assignTo,
  }, ctx.admin);
}

const taskOf = (member) => PoolTask().findOne({ where: { poolMemberId: member.id, status: { [Op.ne]: 'cancelled' } } });

/** Move Edorax's reported progress and run the sync the worker would run. */
async function progressTo(overall, { completed = false, lifecycle = 'ACTIVE' } = {}) {
  edorax['GET /progress'] = () => [200, {
    course_id: COURSE.course_id, lifecycle, status: completed ? 'COMPLETED' : 'IN_PROGRESS',
    overall_progress: overall, completed_lessons: overall, total_lessons: 100, completed,
  }];
  return courseService.syncActive();
}

const componentOf = (rows, email) => rows.find((r) => r.email === email).components[0];

beforeAll(() => { global.fetch = fakeFetch; });
afterAll(() => { global.fetch = realFetch; });
beforeEach(async () => { ctx = await world(); });

describe('a course becomes one piece of pool work', () => {
  it('takes the course from the catalog and records what it enrolls into', async () => {
    const { assignment } = await courseWork('later');
    expect(assignment).toMatchObject({ kind: 'course', title: COURSE.title, points: 20, required: true });
    expect(assignment.config).toMatchObject({ courseId: COURSE.course_id, courseTitle: COURSE.title });

    const template = await models.RoadmapTask.findByPk(assignment.roadmapTaskId);
    expect(template.type).toBe('course');
  });

  it('refuses a course the workspace cannot assign, and adds nothing', async () => {
    await expect(poolTaskService.createAssignment(ctx.pool.id, {
      kind: 'course', courseId: 'not-a-course-we-have',
    }, ctx.admin)).rejects.toThrow(/not available to your workspace/i);

    const pool = await poolService.getPool(ctx.pool.id);
    expect(poolService.workItems(pool)).toHaveLength(0);
  });

  it('will not take the same course twice in one round', async () => {
    await courseWork('later');
    await expect(courseWork('later')).rejects.toThrow(/already part of this pool/i);
  });
});

describe('assigning a course enrolls the candidate', () => {
  it('enrolls on Edorax under the task id and records the enrollment', async () => {
    const { member } = await registerCandidate('c1@test.com');
    const { assigned } = await courseWork();
    expect(assigned.summary).toMatchObject({ assigned: 1, failed: 0 });

    const task = await taskOf(member);
    expect(task.poolMemberId).toBe(member.id);
    expect(task.clanId).toBeNull();
    expect(task.enrollmentId).toBeNull();

    const enroll = callsTo('POST /enrollments');
    expect(enroll).toHaveLength(1);
    expect(enroll[0].body).toMatchObject({ course_id: COURSE.course_id, student_email: 'c1@test.com', external_assignment_id: task.id });

    const row = await models.CourseEnrollment.findOne({ where: { assignedTaskId: task.id } });
    expect(row).toMatchObject({ courseId: COURSE.course_id, learnerEmail: 'c1@test.com', lifecycle: 'PENDING_ACCOUNT' });
  });

  it('fails only the candidate Edorax refuses, and leaves them no task', async () => {
    const { member: first } = await registerCandidate('c1@test.com');
    const { member: second } = await registerCandidate('c2@test.com');
    edorax['POST /enrollments'] = (call) => (call.body.student_email === 'c2@test.com'
      ? [409, { error: 'No seats left', code: 'CAPACITY' }]
      : [201, {
        enrollment_id: 'enr_1', course_id: call.body.course_id, learner_email: call.body.student_email,
        lifecycle: 'PENDING_ACCOUNT', created: true, external_assignment_id: call.body.external_assignment_id,
      }]);

    const { assigned } = await courseWork();
    expect(assigned.summary).toMatchObject({ assigned: 1, failed: 1 });
    expect(assigned.results.find((r) => r.memberId === second.id).reason).toMatch(/seats/i);

    expect(await taskOf(first)).toBeTruthy();
    // The refused candidate must not be left holding a course task nobody is enrolled in.
    expect(await taskOf(second)).toBeNull();
  });

  it('skips a candidate who has not activated yet', async () => {
    await poolMemberService.importMembers(ctx.pool.id, [{ email: 'later@test.com', firstName: 'Later' }], ctx.admin);
    const { assigned } = await courseWork();
    expect(assigned.summary).toMatchObject({ assigned: 0, skipped: 1 });
    expect(callsTo('POST /enrollments')).toHaveLength(0);
  });
});

describe('the score follows Edorax, and nobody reviews a course', () => {
  it('earns nothing before the candidate starts', async () => {
    const { member } = await registerCandidate('c1@test.com');
    await courseWork();
    const { rows } = await poolScoringService.compute(ctx.pool.id);
    expect(componentOf(rows, 'c1@test.com')).toMatchObject({ kind: 'course', points: 20, earned: 0, status: 'missing' });
    expect(rows.find((r) => r.email === 'c1@test.com').total).toBe(0);
    expect(member).toBeTruthy();
  });

  it('earns points in proportion to the progress reported', async () => {
    await registerCandidate('c1@test.com');
    await courseWork();
    await progressTo(60);

    const { rows } = await poolScoringService.compute(ctx.pool.id);
    // 60% of a 20-point course.
    expect(componentOf(rows, 'c1@test.com')).toMatchObject({ earned: 12, status: 'in_progress' });
    expect(rows.find((r) => r.email === 'c1@test.com').total).toBe(12);
  });

  it('earns the full points once Edorax says it is finished, with no review', async () => {
    const { member } = await registerCandidate('c1@test.com');
    await courseWork();
    await progressTo(100, { completed: true, lifecycle: 'COMPLETED' });

    const { rows } = await poolScoringService.compute(ctx.pool.id);
    const row = rows.find((r) => r.email === 'c1@test.com');
    expect(componentOf(rows, 'c1@test.com')).toMatchObject({ earned: 20, status: 'scored' });
    expect(row.total).toBe(20);
    expect(row.complete).toBe(true);

    // Pathment only ever reads progress: a course is never pushed back to Edorax.
    expect(callsTo('POST /enrollments')).toHaveLength(1);

    // The candidate's own status followed the course without anyone touching it.
    await member.reload();
    expect(['completed', 'reviewing']).toContain(member.status);
  });

  it('ranks a further-along candidate above one who barely started', async () => {
    await registerCandidate('ahead@test.com');
    await registerCandidate('behind@test.com');
    await courseWork();
    // Progress is per learner, so answer from the query Edorax is asked with.
    edorax['GET /progress'] = (call) => [200, {
      course_id: COURSE.course_id, lifecycle: 'ACTIVE', status: 'IN_PROGRESS',
      overall_progress: call.query.learner_email === 'ahead@test.com' ? 80 : 10,
      completed_lessons: 0, total_lessons: 100, completed: false,
    }];
    await courseService.syncActive();

    const { rows } = await poolScoringService.compute(ctx.pool.id);
    expect(rows[0].email).toBe('ahead@test.com');
    expect(rows[0].total).toBe(16);
    expect(rows[1].total).toBe(2);
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
  });

  it('warns about an unfinished required course but still lets the shortlist be generated', async () => {
    await registerCandidate('c1@test.com');
    await courseWork();
    await progressTo(40);

    const live = await poolScoringService.liveScores(ctx.pool.id);
    expect(live.warnings.map((w) => w.code)).toContain('courses_unfinished');
    // Progress is not something a reviewer can clear, so it must not block.
    expect(live.blockers.map((b) => b.code)).not.toContain('reviews_outstanding');
    expect(live.blockers.filter((b) => b.code !== 'tie_at_cutoff')).toHaveLength(0);
  });
});

describe('removing course work gives the seats back', () => {
  it('cancels the Edorax enrollment and the task', async () => {
    const { member } = await registerCandidate('c1@test.com');
    const { assignment } = await courseWork();
    const task = await taskOf(member);

    await poolTaskService.cancelAssignment(ctx.pool.id, assignment.id, 'Round changed', ctx.admin);

    const cancel = callsTo('POST /enrollments/cancel');
    expect(cancel).toHaveLength(1);
    expect(cancel[0].body).toMatchObject({ course_id: COURSE.course_id, email: 'c1@test.com', external_assignment_id: task.id });

    const row = await models.CourseEnrollment.findOne({ where: { assignedTaskId: task.id } });
    expect(row.lifecycle).toBe('CANCELLED');
    await task.reload();
    expect(task.status).toBe('cancelled');
  });

  it('still removes the work when Edorax cannot be reached, rather than trapping it', async () => {
    const { member } = await registerCandidate('c1@test.com');
    const { assignment } = await courseWork();
    edorax['POST /enrollments/cancel'] = () => [500, { error: 'Edorax is down' }];

    await poolTaskService.cancelAssignment(ctx.pool.id, assignment.id, 'Round changed', ctx.admin);

    const pool = await poolService.getPool(ctx.pool.id);
    expect(poolService.workItems(pool)[0].cancelledAt).toBeTruthy();
    const task = await PoolTask().findOne({ where: { poolMemberId: member.id } });
    expect(task.status).toBe('cancelled');
  });
});

describe('the candidate can actually get to the course', () => {
  it('carries the course facts on their own work list, so there is somewhere to go', async () => {
    const { user } = await registerCandidate('c1@test.com');
    await courseWork();
    await progressTo(35);

    const [work] = await poolCandidateService.myTasks(user.id);
    expect(work.kind).toBe('course');
    expect(work.course).toMatchObject({
      courseTitle: COURSE.title,
      overallProgress: 35,
      progressStatus: 'IN_PROGRESS',
      appUrl: 'http://edorax.test',
    });
  });

  it('lets the candidate read their own course enrollment, and keeps a stranger out', async () => {
    const { user, member } = await registerCandidate('c1@test.com');
    const { user: other } = await registerCandidate('c2@test.com');
    await courseWork();
    const task = await taskOf(member);

    const mine = await courseService.getForTask(task.id, user);
    expect(mine).toMatchObject({ taskId: task.id, courseId: COURSE.course_id, learnerEmail: 'c1@test.com' });

    // Another candidate in the same pool is still a stranger to this task.
    await expect(courseService.getForTask(task.id, other)).rejects.toThrow(/access/i);
  });
});

describe('course work stays out of every clan', () => {
  it('is hidden from the default task scope, like all pool work', async () => {
    const { member } = await registerCandidate('c1@test.com');
    await courseWork();
    const task = await taskOf(member);

    expect(await models.AssignedTask.findByPk(task.id)).toBeNull();
    expect(await PoolTask().findByPk(task.id)).toBeTruthy();
  });
});
